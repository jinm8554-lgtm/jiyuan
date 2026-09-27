import { TRPCError } from "@trpc/server";
import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { gameProfiles, nodeStates, regionStates, storyScenes, worldNodes } from "../../drizzle/schema";
import { getDb } from "../db";
import { NODE_BY_KEY, NODE_SEEDS, NODE_TYPE_LABEL, REGION_SEEDS } from "../game/data/world";
import { controlPercent, round } from "../game/formulas";
import { advanceQuestProgress, recomputeRegionControl, syncUnlocks } from "../game/progress";
import { addResources, getMembershipBenefits, loadRoster, loadTeams, nodeUnlockCheck, regionUnlockCheck } from "../game/service";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveProfile } from "./_shared";

type TradeSettlement = { gains: Record<string, number>; hours: number; processed: number; autoDispatched: boolean };

/** 结算当前账号的商队；普通收取后商队返回，会员开启自动派遣则立即重新出发。 */
async function settleTrade(profileId: number, forcedHours?: number, onlyExpired = false): Promise<TradeSettlement> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
  const states = await db.select().from(regionStates).where(eq(regionStates.profileId, profileId));
  const active = states.filter((state) => state.tradeActive && state.tradeStartedAt);
  if (active.length === 0) return { gains: {}, hours: 0, processed: 0, autoDispatched: false };

  const nodeRows = await db.select().from(nodeStates).where(eq(nodeStates.profileId, profileId));
  const benefits = await getMembershipBenefits(profileId);
  let hours = 0;
  const gains: Record<string, number> = {};
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
        gains[key] = (gains[key] ?? 0) + round(Number(value ?? 0) * elapsedHours);
      }
    }
  }

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
    const roster = await loadRoster(profile.id);
    const topPower = roster
      .slice(0, 4)
      .reduce((sum, entry) => sum + entry.power, 0);
    const clearedKeys = new Set(nodeRows.filter((row) => row.status !== "locked").map((row) => row.nodeKey));
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
            // 只有已持久化的节点状态才能出征；解锁计算结果仅用于展示原因，避免灰色节点被误判为可用。
            unlocked: status !== "locked",
            lockReason: status === "locked" ? nodeCheck.reason : null,
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
        unlocked: (state?.unlocked ?? false) || check.unlocked,
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
      rewards: state?.firstClearedAt ? row.rewards : row.firstClearRewards,
      regularRewards: row.rewards,
      tradeYield: row.tradeYield,
      storyKey: row.storyKey ?? null,
      hasStoryScene: Boolean(row.storyKey),
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
    await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const [row] = await db.select().from(storyScenes).where(eq(storyScenes.sceneKey, input.sceneKey)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "剧情场景不存在" });
    return {
      sceneKey: row.sceneKey,
      chapter: row.chapter,
      title: row.title,
      beats: row.beats ?? [],
      choices: row.choices ?? [],
      unlockFlags: row.unlockFlags ?? [],
    };
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
      const choices = (row.choices ?? []) as Array<{ text?: string; flags?: Record<string, unknown>; rewards?: Record<string, number>; reply?: string }>;
      const choice = choices[input.choiceIndex];
      if (!choice) throw new TRPCError({ code: "BAD_REQUEST", message: "选项无效" });

      const { setStoryFlag } = await import("../game/service");
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
      await setStoryFlag(profile.id, `scene_${input.sceneKey}`, { chosen: input.choiceIndex, at: Date.now() });
      for (const flag of row.unlockFlags ?? []) {
        await setStoryFlag(profile.id, flag, true);
      }

      const progress = await advanceQuestProgress(profile.id, [
        { type: "clear_node", nodeKey: input.nodeKey ?? "", regionKey: "", firstClear: false },
      ]);

      return { ok: true, reply: choice.reply ?? null, flags, rewards, questUpdates: progress.updated };
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
    await db
      .update(regionStates)
      .set({ tradeActive: input.active, tradeStartedAt: input.active ? new Date() : null })
      .where(eq(regionStates.id, state.id));
    return { ok: true, tradeActive: input.active };
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
