import { TRPCError } from "@trpc/server";
import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { gameProfiles, nodeStates, profileBuildings, regionStates, storyScenes, worldNodes } from "../../drizzle/schema";
import { getDb } from "../db";
import { NODE_BY_KEY, NODE_SEEDS, NODE_TYPE_LABEL, REGION_SEEDS } from "../game/data/world";
import { controlPercent, round } from "../game/formulas";
import { normalizeLeaderSkillLevels } from "../game/leadership";
import { advanceQuestProgress, recomputeRegionControl, syncUnlocks } from "../game/progress";
import { addResources, getMembershipBenefits, getStoryFlags, loadRoster, loadTeams, nodeUnlockCheck, regionUnlockCheck, setStoryFlag } from "../game/service";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveProfile } from "./_shared";

type TradeSettlement = { gains: Record<string, number>; hours: number; processed: number; autoDispatched: boolean };
type StoryChoice = { text?: string; flags?: Record<string, unknown>; rewards?: Record<string, number>; reply?: string };
const AETHER_MICRO_SCALE = 1_000_000;

function readSceneDecision(value: unknown): { chosen: number; at: number } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { chosen?: unknown; at?: unknown };
  if (!Number.isInteger(record.chosen) || !Number.isFinite(record.at)) return null;
  return { chosen: Number(record.chosen), at: Number(record.at) };
}

/** 市场 1/3/5 级分别开放 1/2/3 条贸易路线。 */
function tradeSlotCapacity(marketLevel: number): number {
  if (marketLevel < 1) return 0;
  if (marketLevel < 3) return 1;
  if (marketLevel < 5) return 2;
  return 3;
}

/** 结算当前账号的商队；普通收取后商队返回，会员开启自动派遣则立即重新出发。 */
async function settleTrade(profileId: number, forcedHours?: number, onlyExpired = false): Promise<TradeSettlement> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
  const states = await db.select().from(regionStates).where(eq(regionStates.profileId, profileId));
  const active = states.filter((state) => state.tradeActive && state.tradeStartedAt);
  if (active.length === 0) return { gains: {}, hours: 0, processed: 0, autoDispatched: false };

  const [profile] = await db
    .select({ aetherTradeMicros: gameProfiles.aetherTradeMicros, leaderSkills: gameProfiles.leaderSkills })
    .from(gameProfiles)
    .where(eq(gameProfiles.id, profileId))
    .limit(1);
  if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "档案不存在" });
  const buildingRows = await db.select().from(profileBuildings).where(eq(profileBuildings.profileId, profileId));
  const marketLevel = buildingRows.find((row) => row.buildingKey === "market")?.level ?? 0;
  const tradeMultiplier = marketLevel >= 6 ? 1.15 : 1;
  const tradeLeadershipMultiplier = 1 + (normalizeLeaderSkillLevels(profile.leaderSkills).trade_pact ?? 0) * 0.03;
  const nodeRows = await db.select().from(nodeStates).where(eq(nodeStates.profileId, profileId));
  const benefits = await getMembershipBenefits(profileId);
  let hours = 0;
  const gains: Record<string, number> = {};
  let aetherTradeMicros = profile.aetherTradeMicros;
  const processedStates = [] as typeof active;
  for (const state of active) {
    const elapsedHours = forcedHours ?? Math.min(8, (Date.now() - (state.tradeStartedAt?.getTime() ?? Date.now())) / 3600 / 1000);
    if (forcedHours === undefined && (elapsedHours <= 0.05 || (onlyExpired && elapsedHours < 8))) continue;
    processedStates.push(state);
    hours = Math.max(hours, elapsedHours);
    const regionNodes = NODE_SEEDS.filter((node) => node.regionKey === state.regionKey);
    for (const node of regionNodes) {
      const row = nodeRows.find((item) => item.nodeKey === node.nodeKey);
      if (!row || (row.status !== "cleared" && row.status !== "conquered")) continue;
      for (const [key, value] of Object.entries(node.tradeYield ?? {})) {
        // 商路契约只加成常规贸易物资；星辉与声望仍遵循原有地图/市场经济。
        const receivesLeadershipBonus = ["gold", "food", "wood", "iron"].includes(key);
        const scaled = Number(value ?? 0) * elapsedHours * tradeMultiplier * (receivesLeadershipBonus ? tradeLeadershipMultiplier : 1);
        if (key === "aether") {
          aetherTradeMicros += Math.round(scaled * AETHER_MICRO_SCALE);
        } else {
          gains[key] = (gains[key] ?? 0) + round(scaled);
        }
      }
    }
  }

  const aetherGain = Math.floor(aetherTradeMicros / AETHER_MICRO_SCALE);
  if (aetherGain > 0) gains.aether = (gains.aether ?? 0) + aetherGain;
  await db
    .update(gameProfiles)
    .set({ aetherTradeMicros: aetherTradeMicros % AETHER_MICRO_SCALE })
    .where(eq(gameProfiles.id, profileId));

  if (Object.keys(gains).length > 0) await addResources(profileId, gains as never);
  for (const state of processedStates) {
    await db
      .update(regionStates)
      .set({ tradeActive: benefits.tradeAutoDispatch, tradeStartedAt: benefits.tradeAutoDispatch ? new Date() : null })
      .where(eq(regionStates.id, state.id));
  }
  return { gains, hours: round(hours * 10) / 10, processed: processedStates.length, autoDispatched: benefits.tradeAutoDispatch };
}

export const worldRouter = router({
  /** 世界地图：区域 + 节点 + 解锁条件 + 进度（服务端实时计算，前端仅展示） */
  map: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const membership = await getMembershipBenefits(profile.id);
    if (membership.tradeAutoDispatch) await settleTrade(profile.id, undefined, true);

    await syncUnlocks(profile.id);
    const nodeRows = await db.select().from(nodeStates).where(eq(nodeStates.profileId, profile.id));
    const regionRows = await db.select().from(regionStates).where(eq(regionStates.profileId, profile.id));
    const buildingRows = await db.select().from(profileBuildings).where(eq(profileBuildings.profileId, profile.id));
    const tradeSlots = tradeSlotCapacity(buildingRows.find((row) => row.buildingKey === "market")?.level ?? 0);
    const roster = await loadRoster(profile.id);
    const topPower = roster
      .slice(0, 4)
      .reduce((sum, entry) => sum + entry.power, 0);
    const clearedKeys = new Set(nodeRows.filter((row) => row.status === "cleared" || row.status === "conquered").map((row) => row.nodeKey));
    const srCount = roster.filter((entry) => entry.config.rarity !== "R").length;
    const controlOf = (regionKey: string) => regionRows.find((row) => row.regionKey === regionKey)?.controlPercent ?? 0;

    const regionsView = REGION_SEEDS.sort((a, b) => a.sortOrder - b.sortOrder).map((region) => {
      const state = regionRows.find((row) => row.regionKey === region.regionKey);
      const check = regionUnlockCheck(region, {
        clearedKeys,
        renown: profile.renown,
        chapter: profile.chapter,
        srCount,
        power: topPower,
        controlPercent: controlOf,
      });
      const regionUnlocked = Boolean(state?.unlocked) || check.unlocked;
      const nodes = NODE_SEEDS.filter((node) => node.regionKey === region.regionKey)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((node) => {
          const row = nodeRows.find((item) => item.nodeKey === node.nodeKey);
          const nodeCheck = nodeUnlockCheck(node, {
            clearedKeys,
            renown: profile.renown,
            chapter: profile.chapter,
            power: topPower,
            controlPercent: controlOf(region.regionKey),
            ownedKeys: new Set(roster.map((entry) => entry.charKey)),
          });
          const status = row?.status ?? "locked";
          return {
            nodeKey: node.nodeKey,
            name: node.name,
            nodeType: node.nodeType,
            nodeTypeLabel: NODE_TYPE_LABEL[node.nodeType],
            levelMin: node.levelMin,
            levelMax: node.levelMax,
            staminaCost: node.staminaCost,
            requiredClears: node.requiredClears,
            clearCount: row?.clearCount ?? 0,
            status,
            // 节点可出征必须同时满足：所属区域已解锁、节点状态已持久化为可用。
            unlocked: regionUnlocked && status !== "locked",
            lockReason: !regionUnlocked
              ? `所属区域尚未解锁：${check.reason ?? "请先推进主线"}`
              : status === "locked"
                ? nodeCheck.reason
                : null,
            mapX: node.mapX,
            mapY: node.mapY,
            hasStory: Boolean(node.storyKey),
            tradeYield: node.tradeYield,
            enemies: node.enemyWave.map((enemyUnit) => ({
              name: enemyUnit.name,
              job: enemyUnit.job,
              element: enemyUnit.element,
              level: enemyUnit.level,
              note: enemyUnit.note,
            })),
            rewards: node.rewards,
            firstCleared: Boolean(row?.firstClearedAt),
          };
        });
      return {
        regionKey: region.regionKey,
        name: region.name,
        subtitle: region.subtitle,
        dangerTier: region.dangerTier,
        faction: region.faction,
        description: region.description,
        mapX: region.mapX,
        mapY: region.mapY,
        artUrl: region.artUrl,
        unlocked: regionUnlocked,
        lockReason: (state?.unlocked ?? false) ? null : check.reason,
        controlPercent: state?.controlPercent ?? 0,
        controlledNodes: state?.controlledNodes ?? 0,
        totalNodes: nodes.length,
        tradeActive: state?.tradeActive ?? false,
        nodes,
      };
    });

    return {
      regions: regionsView,
      summary: {
        clearedNodes: nodeRows.filter((row) => row.status === "cleared" || row.status === "conquered").length,
        conqueredNodes: nodeRows.filter((row) => row.status === "conquered").length,
        totalNodes: NODE_SEEDS.length,
        unlockedRegions: regionsView.filter((region) => region.unlocked).length,
        totalRegions: REGION_SEEDS.length,
        topPower,
        renown: profile.renown,
        chapter: profile.chapter,
        stamina: profile.stamina,
        staminaMax: profile.staminaMax,
        tradeSlots,
        activeTradeSlots: regionsView.filter((region) => region.tradeActive).length,
        membership,
      },
    };
  }),

  /** 区域详情 */
  region: protectedProcedure.input(z.object({ regionKey: z.string().min(1).max(48) })).query(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const region = REGION_SEEDS.find((item) => item.regionKey === input.regionKey);
    if (!region) throw new TRPCError({ code: "NOT_FOUND", message: "区域不存在" });

    const [state] = await db
      .select()
      .from(regionStates)
      .where(and(eq(regionStates.profileId, profile.id), eq(regionStates.regionKey, input.regionKey)))
      .limit(1);

    const nodeRows = await db.select().from(nodeStates).where(eq(nodeStates.profileId, profile.id));
    const regionNodes = NODE_SEEDS.filter((node) => node.regionKey === input.regionKey);
    const computed = controlPercent(
      regionNodes.map((node) => {
        const row = nodeRows.find((item) => item.nodeKey === node.nodeKey);
        return { status: row?.status ?? "locked", controlWeight: node.controlWeight };
      }),
      3,
    );

    const tradeYieldPerHour: Record<string, number> = {};
    for (const node of regionNodes) {
      const row = nodeRows.find((item) => item.nodeKey === node.nodeKey);
      if (!row || (row.status !== "cleared" && row.status !== "conquered")) continue;
      for (const [key, value] of Object.entries(node.tradeYield ?? {})) {
        tradeYieldPerHour[key] = (tradeYieldPerHour[key] ?? 0) + Number(value ?? 0);
      }
    }

    return {
      regionKey: region.regionKey,
      name: region.name,
      subtitle: region.subtitle,
      dangerTier: region.dangerTier,
      faction: region.faction,
      description: region.description,
      unlocked: state?.unlocked ?? false,
      controlPercent: computed,
      tradeActive: state?.tradeActive ?? false,
      tradeYieldPerHour,
      storyNodes: regionNodes.filter((node) => node.storyKey).map((node) => ({ nodeKey: node.nodeKey, name: node.name, storyKey: node.storyKey })),
    };
  }),

  /** 节点详情（含敌人构成、奖励预览、解锁条件） */
  node: protectedProcedure.input(z.object({ nodeKey: z.string().min(1).max(64) })).query(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

    const [row] = await db.select().from(worldNodes).where(eq(worldNodes.nodeKey, input.nodeKey)).limit(1);
    const seed = NODE_BY_KEY.get(input.nodeKey);
    if (!row || !seed) throw new TRPCError({ code: "NOT_FOUND", message: "节点不存在" });

    const [state] = await db
      .select()
      .from(nodeStates)
      .where(and(eq(nodeStates.profileId, profile.id), eq(nodeStates.nodeKey, input.nodeKey)))
      .limit(1);

    const roster = await loadRoster(profile.id);
    const teams = await loadTeams(profile.id);
    const storyKey = row.storyKey ?? null;
    const storyCompleted = storyKey
      ? Boolean(readSceneDecision((await getStoryFlags(profile.id))[`scene_${storyKey}`]))
      : false;

    return {
      nodeKey: row.nodeKey,
      regionKey: row.regionKey,
      name: row.name,
      nodeType: row.nodeType,
      nodeTypeLabel: NODE_TYPE_LABEL[row.nodeType],
      levelMin: row.levelMin,
      levelMax: row.levelMax,
      staminaCost: row.staminaCost,
      requiredClears: row.requiredClears,
      clearCount: state?.clearCount ?? 0,
      status: state?.status ?? "locked",
      firstCleared: Boolean(state?.firstClearedAt),
      enemies: seed.enemyWave.map((enemyUnit) => ({
        name: enemyUnit.name,
        job: enemyUnit.job,
        element: enemyUnit.element,
        level: enemyUnit.level,
        rarity: enemyUnit.rarity,
        note: enemyUnit.note,
      })),
      rewards: state?.firstClearedAt ? seed.rewards : seed.firstClearRewards,
      regularRewards: seed.rewards,
      tradeYield: seed.tradeYield,
      storyKey,
      hasStoryScene: Boolean(storyKey),
      storyCompleted,
      teamSummary: {
        hasTeam: teams.some((team) => (team.memberIds ?? []).length > 0),
        topPower: roster.slice(0, 4).reduce((sum, entry) => sum + entry.power, 0),
        rosterCount: roster.length,
      },
      stamina: profile.stamina,
    };
  }),

  /** 剧情场景读取（进入节点或手动触发） */
  scene: protectedProcedure.input(z.object({ sceneKey: z.string().min(1).max(64) })).query(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const [row] = await db.select().from(storyScenes).where(eq(storyScenes.sceneKey, input.sceneKey)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "剧情场景不存在" });
    const choices = (row.choices ?? []) as StoryChoice[];
    const decision = readSceneDecision((await getStoryFlags(profile.id))[`scene_${input.sceneKey}`]);
    const chosenChoice = decision ? choices[decision.chosen] : null;
    return {
      sceneKey: row.sceneKey,
      chapter: row.chapter,
      title: row.title,
      beats: row.beats ?? [],
      choices,
      decision: decision && chosenChoice
        ? { choiceIndex: decision.chosen, choiceText: chosenChoice.text ?? `选项 ${decision.chosen + 1}`, reply: chosenChoice.reply ?? null, recordedAt: decision.at }
        : null,
      unlockFlags: row.unlockFlags ?? [],
    };
  }),

  /** 已完成的节点剧情与最终抉择，供编年史查阅。 */
  storyArchive: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const [rows, flags] = await Promise.all([
      db.select().from(storyScenes),
      getStoryFlags(profile.id),
    ]);

    return rows.flatMap((row) => {
      const decision = readSceneDecision(flags[`scene_${row.sceneKey}`]);
      const choices = (row.choices ?? []) as StoryChoice[];
      const chosenChoice = decision ? choices[decision.chosen] : null;
      if (!decision || !chosenChoice) return [];
      const trigger = (row.trigger ?? {}) as { nodeKey?: unknown };
      return [{
        sceneKey: row.sceneKey,
        chapter: row.chapter,
        title: row.title,
        nodeKey: typeof trigger.nodeKey === "string" ? trigger.nodeKey : null,
        choiceText: chosenChoice.text ?? `选项 ${decision.chosen + 1}`,
        reply: chosenChoice.reply ?? null,
        beats: row.beats ?? [],
        recordedAt: decision.at,
      }];
    }).sort((a, b) => b.recordedAt - a.recordedAt);
  }),

  /** 剧情选项（写入剧情标记、发放奖励、推进任务） */
  chooseScene: protectedProcedure
    .input(z.object({ sceneKey: z.string().min(1).max(64), choiceIndex: z.number().int().min(0).max(9), nodeKey: z.string().max(64).optional() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const [row] = await db.select().from(storyScenes).where(eq(storyScenes.sceneKey, input.sceneKey)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "剧情场景不存在" });
      const choices = (row.choices ?? []) as StoryChoice[];
      const choice = choices[input.choiceIndex];
      if (!choice) throw new TRPCError({ code: "BAD_REQUEST", message: "选项无效" });

      const decisionKey = `scene_${input.sceneKey}`;
      if (readSceneDecision((await getStoryFlags(profile.id))[decisionKey])) {
        throw new TRPCError({ code: "CONFLICT", message: "此段剧情已归档，不能再次作出选择" });
      }

      const flags = choice.flags ?? {};
      for (const [key, value] of Object.entries(flags)) {
        await setStoryFlag(profile.id, key, value);
      }
      const rewards = choice.rewards ?? {};
      if (Object.keys(rewards).length > 0) {
        await addResources(profile.id, {
          gold: rewards.gold ?? 0,
          food: rewards.food ?? 0,
          wood: rewards.wood ?? 0,
          iron: rewards.iron ?? 0,
          aether: rewards.aether ?? 0,
          renown: rewards.renown ?? 0,
        });
      }
      const recordedAt = Date.now();
      await setStoryFlag(profile.id, decisionKey, { chosen: input.choiceIndex, at: recordedAt });
      for (const flag of row.unlockFlags ?? []) {
        await setStoryFlag(profile.id, flag, true);
      }

      const progress = await advanceQuestProgress(profile.id, [
        { type: "clear_node", nodeKey: input.nodeKey ?? "", regionKey: "", firstClear: false },
      ]);

      return { ok: true, reply: choice.reply ?? null, flags, rewards, recordedAt, questUpdates: progress.updated };
    }),

  /** 一次战斗结算后的地图推进（由 battle 路由调用，此处暴露给前端刷新用） */
  refreshProgress: protectedProcedure.input(z.object({ regionKey: z.string().min(1).max(48) })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const percent = await recomputeRegionControl(profile.id, input.regionKey);
    await syncUnlocks(profile.id);
    const progress = await advanceQuestProgress(profile.id, [
      { type: "control_region", regionKey: input.regionKey, percent },
    ]);
    return { ok: true, controlPercent: percent, questUpdates: progress.updated };
  }),

  /** 会员每日体力重置：恢复至当前体力上限，不改变战斗数值。 */
  resetStamina: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const benefits = await getMembershipBenefits(profile.id);
    if (!benefits.active) throw new TRPCError({ code: "FORBIDDEN", message: "该权益仅对有效会员开放" });
    if (benefits.staminaResetRemaining <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "今日体力重置次数已用完" });
    const [before] = await db.select({ uses: gameProfiles.staminaResetUses }).from(gameProfiles).where(eq(gameProfiles.id, profile.id)).limit(1);
    const result = await db
      .update(gameProfiles)
      .set({
        stamina: sql`${gameProfiles.staminaMax}`,
        staminaUpdatedAt: new Date(),
        staminaResetUses: sql`${gameProfiles.staminaResetUses} + 1`,
      })
      .where(and(eq(gameProfiles.id, profile.id), eq(gameProfiles.membershipDayKey, benefits.dayKey), lt(gameProfiles.staminaResetUses, 3)));
    void result;
    const [after] = await db.select({ uses: gameProfiles.staminaResetUses }).from(gameProfiles).where(eq(gameProfiles.id, profile.id)).limit(1);
    if (!before || !after || after.uses !== before.uses + 1) throw new TRPCError({ code: "CONFLICT", message: "体力重置状态已变化，请刷新后重试" });
    const next = await getMembershipBenefits(profile.id);
    return { ok: true, stamina: profile.staminaMax, remaining: next.staminaResetRemaining };
  }),

  /** 会员每日立即结算：将当前运行中的商队按 8 小时结算一次。 */
  rushTrade: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const benefits = await getMembershipBenefits(profile.id);
    if (!benefits.active) throw new TRPCError({ code: "FORBIDDEN", message: "该权益仅对有效会员开放" });
    if (benefits.tradeRushRemaining <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "今日商队立即收取次数已用完" });
    const [activeState] = await db.select({ id: regionStates.id }).from(regionStates).where(and(eq(regionStates.profileId, profile.id), eq(regionStates.tradeActive, true))).limit(1);
    if (!activeState) throw new TRPCError({ code: "BAD_REQUEST", message: "当前没有运行中的商队" });
    const [before] = await db.select({ uses: gameProfiles.tradeRushUses }).from(gameProfiles).where(eq(gameProfiles.id, profile.id)).limit(1);
    const result = await db
      .update(gameProfiles)
      .set({ tradeRushUses: sql`${gameProfiles.tradeRushUses} + 1` })
      .where(and(eq(gameProfiles.id, profile.id), eq(gameProfiles.membershipDayKey, benefits.dayKey), lt(gameProfiles.tradeRushUses, 5)));
    void result;
    const [after] = await db.select({ uses: gameProfiles.tradeRushUses }).from(gameProfiles).where(eq(gameProfiles.id, profile.id)).limit(1);
    if (!before || !after || after.uses !== before.uses + 1) throw new TRPCError({ code: "CONFLICT", message: "商队权益状态已变化，请刷新后重试" });
    const settlement = await settleTrade(profile.id, 8);
    const next = await getMembershipBenefits(profile.id);
    return { ok: true, gains: settlement.gains, hours: settlement.hours, autoDispatched: settlement.autoDispatched, remaining: next.tradeRushRemaining };
  }),

  /** 会员自动派遣开关：商队结算后自动重新出发。 */
  setTradeAutoDispatch: protectedProcedure.input(z.object({ active: z.boolean() })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const benefits = await getMembershipBenefits(profile.id);
    if (input.active && !benefits.active) throw new TRPCError({ code: "FORBIDDEN", message: "该权益仅对有效会员开放" });
    await db.update(gameProfiles).set({ tradeAutoDispatch: input.active && benefits.active }).where(eq(gameProfiles.id, profile.id));
    return { ok: true, active: input.active && benefits.active };
  }),

  /** 贸易派遣：占领贸易节点后按时间产出资源 */
  toggleTrade: protectedProcedure.input(z.object({ regionKey: z.string().min(1).max(48), active: z.boolean() })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const [state] = await db
      .select()
      .from(regionStates)
      .where(and(eq(regionStates.profileId, profile.id), eq(regionStates.regionKey, input.regionKey)))
      .limit(1);
    if (!state) throw new TRPCError({ code: "NOT_FOUND", message: "区域状态不存在" });
    if (input.active && state.controlPercent < 30) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "区域控制度需达到 30% 才能开通定期商队" });
    }
    const buildingRows = await db.select().from(profileBuildings).where(eq(profileBuildings.profileId, profile.id));
    const slots = tradeSlotCapacity(buildingRows.find((row) => row.buildingKey === "market")?.level ?? 0);
    if (input.active && slots <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "市场达到 1 级后才能派遣商队" });
    }
    const activeStates = await db
      .select({ regionKey: regionStates.regionKey })
      .from(regionStates)
      .where(and(eq(regionStates.profileId, profile.id), eq(regionStates.tradeActive, true)));
    const alreadyActive = activeStates.some((item) => item.regionKey === input.regionKey);
    if (input.active && !alreadyActive && activeStates.length >= slots) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `贸易位已满（${slots}/${slots}）；提升市场至 3、5 级可增加贸易位` });
    }
    await db
      .update(regionStates)
      .set({ tradeActive: input.active, tradeStartedAt: input.active ? new Date() : null })
      .where(eq(regionStates.id, state.id));
    return {
      ok: true,
      tradeActive: input.active,
      tradeSlots: slots,
      activeTradeSlots: input.active
        ? activeStates.length + (alreadyActive ? 0 : 1)
        : Math.max(0, activeStates.length - (alreadyActive ? 1 : 0)),
    };
  }),

  /** 收取贸易收益 */
  collectTrade: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const settlement = await settleTrade(profile.id);
    return { ok: true, gains: settlement.gains, hours: settlement.hours, autoDispatched: settlement.autoDispatched };
  }),

  /** 当前可执行的目标提示（远征入口用） */
  suggestions: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const nodeRows = await db.select().from(nodeStates).where(eq(nodeStates.profileId, profile.id));
    const [profileRow] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profile.id)).limit(1);

    const recommended = NODE_SEEDS.filter((node) => {
      const row = nodeRows.find((item) => item.nodeKey === node.nodeKey);
      return row && (row.status === "available" || row.status === "cleared");
    })
      .sort((a, b) => a.levelMin - b.levelMin)
      .slice(0, 4)
      .map((node) => {
        const row = nodeRows.find((item) => item.nodeKey === node.nodeKey);
        const region = REGION_SEEDS.find((item) => item.regionKey === node.regionKey);
        return {
          nodeKey: node.nodeKey,
          name: node.name,
          regionName: region?.name ?? "",
          nodeTypeLabel: NODE_TYPE_LABEL[node.nodeType],
          levelRange: `${node.levelMin}-${node.levelMax}`,
          clearCount: row?.clearCount ?? 0,
          requiredClears: node.requiredClears,
          status: row?.status ?? "locked",
          staminaCost: node.staminaCost,
          storyPending: Boolean(node.storyKey),
        };
      });

    return {
      recommended,
      stamina: profileRow?.stamina ?? 0,
      staminaMax: profileRow?.staminaMax ?? 0,
      chapter: profileRow?.chapter ?? 1,
    };
  }),
});
