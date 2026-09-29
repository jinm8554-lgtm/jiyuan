import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { domainEvents, gameProfiles, playerCharacters, profileBuildings, profileQuests, quests } from "../../drizzle/schema";
import { getDb } from "../db";
import { BUILDING_SEEDS } from "../game/data/buildings";
import { EVENT_SEEDS } from "../game/data/quests";
import { NODE_SEEDS, REGION_SEEDS } from "../game/data/world";
import { buildingUpgradeCost, resourceCap, round } from "../game/formulas";
import { advanceQuestProgress, claimQuestReward, recomputeRegionControl, syncUnlocks } from "../game/progress";
import { completeTutorialBusinessAction, readTutorialProgress } from "../game/tutorial";
import {
  accrueProfile,
  addResources,
  buildingView,
  ensureDefaultTeam,
  ensureUnlockedTeams,
  ensureQuests,
  getMembershipBenefits,
  getStoryFlags,
  keepBonus,
  loadBuildings,
  loadRoster,
  spendResources,
} from "../game/service";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveProfile } from "./_shared";

const DEFAULT_FAMILY_NAME = "瓦尔登";
const FALLBACK_GIVEN_NAMES = ["阿伦", "科尔", "席恩", "玛洛", "恩雅", "薇拉", "托本", "伊莲"] as const;
const introNameInput = z.string().trim().max(12);

/** 主城首页所需的全部数据（一次请求返回，减少移动端往返） */
export const keepRouter = router({
  /** 首次命名仪式的轻量状态，供游戏外壳决定是否展示覆盖层。 */
  introStatus: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    return {
      introCompleted: profile.introCompleted,
      playerGivenName: profile.playerGivenName,
      playerFamilyName: profile.playerFamilyName ?? DEFAULT_FAMILY_NAME,
      familyNameChanged: profile.familyNameChanged,
      lordName: profile.lordName,
    };
  }),

  home: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const accrual = await accrueProfile(profile.id);
    const current = accrual.profile;

    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

    const buildings = await loadBuildings(profile.id);
    const views = buildingView(buildings);
    const roster = await loadRoster(profile.id);
    /** 旧档案仍会自愈；v2 新手档案在同伴页保存第一支远征队。 */
    const activeTeam = await ensureDefaultTeam(profile.id);

    const questRows = await ensureQuests(profile.id);
    const questConfigs = await db.select().from(quests);
    const questMap = new Map(questConfigs.map((q) => [q.questKey, q]));

    const activeQuests = questRows
      .filter((q) => q.status === "active")
      .map((q) => {
        const config = questMap.get(q.questKey);
        const objectives = (config?.objectives ?? []) as Array<{ label?: string; count?: number }>;
        const progress = (q.progress ?? {}) as Record<string, number>;
        const total = objectives.length;
        const done = objectives.filter((objective, index) => (progress[String(index)] ?? 0) >= Number(objective.count ?? 1)).length;
        return {
          questKey: q.questKey,
          name: config?.name ?? q.questKey,
          chapter: config?.chapter ?? 1,
          questType: config?.questType ?? "main",
          description: config?.description ?? "",
          progressDone: done,
          progressTotal: total,
          objectives: objectives.map((objective, index) => ({
            label: objective.label ?? "",
            current: progress[String(index)] ?? 0,
            target: Number(objective.count ?? 1),
          })),
        };
      })
      .sort((a, b) => (a.questType === "main" ? -1 : 1) - (b.questType === "main" ? -1 : 1));

    const claimable = questRows.filter((q) => q.status === "completed").length;

    // 议事厅待办：可升级建筑 / 可领任务奖励 / 新解锁节点
    const affordableUpgrades = views.filter((v) => v.status === "built" && v.nextCost);
    const todos: Array<{ id: string; title: string; detail: string; action: string; targetKey: string | null; tone: "gold" | "aether" | "ember" }> = [];
    if (views.every((v) => v.status === "unbuilt")) {
      todos.push({ id: "tutorial_wall", title: "第一步：修复城墙", detail: "灰隼堡的南墙还在漏风。先把它补上，冬天之前必须完成。", action: "build", targetKey: "wall", tone: "gold" });
    }
    for (const view of affordableUpgrades.slice(0, 3)) {
      const cost = view.nextCost as Record<string, number>;
      const enough = ["gold", "wood", "iron"].every((key) => (cost[key] ?? 0) <= (current as unknown as Record<string, number>)[key]);
      if (enough) {
        const unlockText = view.nextUnlock as string | null;
        const effectText = view.nextEffect as string | null;
        todos.push({
          id: `upgrade_${view.buildingKey}`,
          title: `升级「${view.name}」至 ${view.nextLevel} 级`,
          detail: unlockText ? `解锁：${unlockText}` : (effectText ?? "提升产出与上限"),
          action: "build",
          targetKey: view.buildingKey,
          tone: "gold",
        });
      }
    }
    if (claimable > 0) {
      todos.push({ id: "claim_quests", title: `领取 ${claimable} 项任务奖励`, detail: "议事厅的书记员说，奖励已经登记好了。", action: "quests", targetKey: null, tone: "aether" });
    }
    const availableNodes = NODE_SEEDS.filter((node) => {
      const unlock = (node.unlock ?? {}) as { chapter?: number; nodeKey?: string };
      if (unlock.chapter === 0) return true;
      return false;
    });
    if (availableNodes.length > 0 && activeQuests.length > 0) {
      todos.push({ id: "explore", title: `探索「${availableNodes[0].name}」`, detail: "远征队在等你的命令。", action: "world", targetKey: availableNodes[0].nodeKey, tone: "ember" });
    }

    const bonus = await keepBonus(profile.id);
    const membership = await getMembershipBenefits(profile.id);
    const marketLevel = buildings.find((b) => b.buildingKey === "market")?.level ?? 0;
    const flags = await getStoryFlags(profile.id);

    const pendingEvents = (current.pendingEvents ?? []).filter(Boolean);
    const eventRow = pendingEvents.length > 0 ? await db.select().from(domainEvents).where(eq(domainEvents.eventKey, pendingEvents[0])).limit(1) : [];

    // 上游进度提示
    const regionRows = await (async () => {
      const { regionStates } = await import("../../drizzle/schema");
      return db.select().from(regionStates).where(eq(regionStates.profileId, profile.id));
    })();

    return {
      lord: { name: current.lordName, keepName: current.keepName, level: current.keepLevel, exp: current.keepExp, chapter: current.chapter, avatarKey: current.avatarKey },
      resources: {
        gold: current.gold,
        food: current.food,
        wood: current.wood,
        iron: current.iron,
        aether: current.aether,
        renown: current.renown,
        stamina: current.stamina,
        staminaMax: current.staminaMax,
        cap: resourceCap(current.keepLevel, marketLevel),
      },
      membership,
      accrual: { gains: accrual.gains, secondsElapsed: accrual.secondsElapsed, staminaRecovered: accrual.staminaRecovered },
      buildings: views,
      bonus,
      roster: roster.slice(0, 4).map((entry) => ({
        playerCharId: entry.playerCharId,
        charKey: entry.charKey,
        name: entry.config.name,
        title: entry.config.title,
        rarity: entry.config.rarity,
        job: entry.config.job,
        element: entry.config.element,
        level: entry.level,
        power: entry.power,
        avatarUrl: entry.config.avatarUrl,
        portraitUrl: entry.config.portraitUrl,
        bondLevel: entry.bondLevel,
      })),
      team: activeTeam
        ? {
            id: activeTeam.id,
            name: activeTeam.name,
            memberIds: activeTeam.memberIds ?? [],
            formation: activeTeam.formation ?? {},
            power: roster
              .filter((entry) => (activeTeam.memberIds ?? []).includes(entry.playerCharId))
              .reduce((sum, entry) => sum + entry.power, 0),
          }
        : null,
      quests: { active: activeQuests, claimable },
      todos: todos.slice(0, 4),
      pendingEvent: eventRow[0]
        ? { eventKey: eventRow[0].eventKey, title: eventRow[0].title, category: eventRow[0].category, description: eventRow[0].description, choices: eventRow[0].choices }
        : null,
      regions: REGION_SEEDS.map((region) => {
        const state = regionRows.find((r) => r.regionKey === region.regionKey);
        return {
          regionKey: region.regionKey,
          name: region.name,
          dangerTier: region.dangerTier,
          unlocked: state?.unlocked ?? false,
          controlPercent: state?.controlPercent ?? 0,
        };
      }),
      storyFlags: Object.keys(flags).length > 0 ? flags : {},
      totalCharacters: roster.length,
    };
  }),

  /** 建筑升级（扣资源、写入升级队列） */
  upgradeBuilding: protectedProcedure
    .input(z.object({ buildingKey: z.string().min(1).max(48), instant: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const config = BUILDING_SEEDS.find((b) => b.buildingKey === input.buildingKey);
      if (!config) throw new TRPCError({ code: "BAD_REQUEST", message: "建筑不存在" });

      const [row] = await db
        .select()
        .from(profileBuildings)
        .where(and(eq(profileBuildings.profileId, profile.id), eq(profileBuildings.buildingKey, input.buildingKey)))
        .limit(1);

      const currentLevel = row?.level ?? 0;
      if (currentLevel >= config.maxLevel) throw new TRPCError({ code: "BAD_REQUEST", message: "该建筑已达最高等级" });
      if (row?.upgradingTo) throw new TRPCError({ code: "BAD_REQUEST", message: "该建筑正在施工中" });

      const targetLevel = currentLevel + 1;
      const upgrade = buildingUpgradeCost(config.levels, targetLevel);

      // 前置条件：议事厅 1 级后解锁其他建筑的建造
      if (input.buildingKey !== "council" && input.buildingKey !== "wall" && currentLevel === 0) {
        const [council] = await db
          .select()
          .from(profileBuildings)
          .where(and(eq(profileBuildings.profileId, profile.id), eq(profileBuildings.buildingKey, "council")))
          .limit(1);
        if ((council?.level ?? 0) < 1 && !["tavern", "wall", "market"].includes(input.buildingKey)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "需先将议事厅建造至 1 级" });
        }
      }

      const now = await accrueProfile(profile.id);
      const spend = await spendResources(profile.id, upgrade.cost as Record<string, number>);
      if (!spend.ok) {
        const labels: Record<string, string> = { gold: "金币", food: "粮食", wood: "木料", iron: "铁矿", aether: "星辉" };
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `资源不足：缺少 ${spend.missing.map((key) => labels[key] ?? key).join("、")}`,
        });
      }
      void now;

      const tutorial = readTutorialProgress(profile.settings);
      const isTutorialWall = input.buildingKey === "wall" && tutorial?.currentKey === "build_wall" && !tutorial.skipped;
      // 教学施工时间由服务端根据当前存档判定，客户端不能伪造。
      const seconds = input.instant ? 0 : isTutorialWall ? 4 : upgrade.seconds;
      const doneAt = input.instant ? new Date() : new Date(Date.now() + seconds * 1000);
      if (row) {
        await db.update(profileBuildings).set({ upgradingTo: targetLevel, upgradeDoneAt: doneAt }).where(eq(profileBuildings.id, row.id));
      } else {
        await db.insert(profileBuildings).values({ profileId: profile.id, buildingKey: input.buildingKey, level: 0, upgradingTo: targetLevel, upgradeDoneAt: doneAt });
      }

      if (input.instant) {
        await accrueProfile(profile.id);
      }

      await syncUnlocks(profile.id);
      const progress = await advanceQuestProgress(profile.id, [
        { type: "upgrade_building", buildingKey: input.buildingKey, level: targetLevel },
      ]);
      if (input.buildingKey === "wall") await completeTutorialBusinessAction(profile.id, "build_wall");

      return {
        ok: true,
        buildingKey: input.buildingKey,
        upgradingTo: targetLevel,
        seconds,
        doneAt,
        cost: upgrade.cost,
        questUpdates: progress.updated,
      };
    }),

  /** 手动推进施工（到时间后手动结算，兼容所有客户端） */
  settleConstruction: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const before = await loadBuildings(profile.id);
    await accrueProfile(profile.id);
    const after = await loadBuildings(profile.id);
    const finished = after.filter((row) => {
      const prev = before.find((b) => b.buildingKey === row.buildingKey);
      return prev?.upgradingTo && !row.upgradingTo;
    });
    if (finished.length > 0) {
      await syncUnlocks(profile.id);
      for (const row of finished) {
        await advanceQuestProgress(profile.id, [{ type: "upgrade_building", buildingKey: row.buildingKey, level: row.level }]);
        if (row.buildingKey === "wall") await completeTutorialBusinessAction(profile.id, "finish_wall");
      }
    }
    return { ok: true, finished: finished.map((row) => ({ buildingKey: row.buildingKey, level: row.level })) };
  }),

  /** 处理领地事件（故事化的资源抉择） */
  resolveEvent: protectedProcedure
    .input(z.object({ eventKey: z.string().min(1).max(64), choiceIndex: z.number().int().min(0).max(9) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const [eventRow] = await db.select().from(domainEvents).where(eq(domainEvents.eventKey, input.eventKey)).limit(1);
      if (!eventRow) throw new TRPCError({ code: "NOT_FOUND", message: "事件不存在" });

      const choices = (eventRow.choices ?? []) as Array<{ label?: string; effect?: Record<string, number>; note?: string }>;
      const choice = choices[input.choiceIndex];
      if (!choice) throw new TRPCError({ code: "BAD_REQUEST", message: "选项无效" });

      const effect = choice.effect ?? {};
      const spend: Record<string, number> = {};
      const gain: Record<string, number> = {};
      for (const [key, value] of Object.entries(effect)) {
        if (value < 0) spend[key] = -value;
        else gain[key] = value;
      }

      if (Object.keys(spend).length > 0) {
        const result = await spendResources(profile.id, spend as never);
        if (!result.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "资源不足以承担该选项的支出" });
        }
      }
      if (Object.keys(gain).length > 0) await addResources(profile.id, gain as never);

      const remaining = (profile.pendingEvents ?? []).filter((key) => key !== input.eventKey);
      await db.update(gameProfiles).set({ pendingEvents: remaining }).where(eq(gameProfiles.id, profile.id));

      return { ok: true, choice: choice.label, effect, note: choice.note ?? null, remainingEvents: remaining.length };
    }),

  /** 触发一次领地事件（由 GM 后台或随机的调度入口调用；此处提供玩家自助触发，服务端限频） */
  rollEvent: protectedProcedure.mutation(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

    const [current] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profile.id)).limit(1);
    if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "档案不存在" });
    if ((current.pendingEvents ?? []).length > 0) {
      return { ok: true, eventKey: current.pendingEvents[0], alreadyPending: true };
    }
    const settings = (current.settings ?? {}) as { lastEventRollAt?: number };
    const lastRoll = settings.lastEventRollAt ?? 0;
    if (Date.now() - lastRoll < 5 * 60 * 1000) {
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "议事厅刚刚处理过事件，请稍后再来" });
    }

    const candidates = EVENT_SEEDS.filter((event) => event.minKeepLevel <= current.keepLevel);
    if (candidates.length === 0) return { ok: true, eventKey: null };
    const total = candidates.reduce((sum, event) => sum + event.weight, 0);
    let roll = Math.random() * total;
    let picked = candidates[0];
    for (const event of candidates) {
      roll -= event.weight;
      if (roll <= 0) {
        picked = event;
        break;
      }
    }

    await db
      .update(gameProfiles)
      .set({ pendingEvents: [picked.eventKey], settings: { ...settings, lastEventRollAt: Date.now() } })
      .where(eq(gameProfiles.id, profile.id));

    return { ok: true, eventKey: picked.eventKey, alreadyPending: false };
  }),

  /** 任务列表 */
  quests: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const rows = await ensureQuests(profile.id);
    const configs = await db.select().from(quests);
    const map = new Map(configs.map((c) => [c.questKey, c]));
    return rows
      .map((row) => {
        const config = map.get(row.questKey);
        const objectives = (config?.objectives ?? []) as Array<{ label?: string; count?: number; type?: string }>;
        const progress = (row.progress ?? {}) as Record<string, number>;
        return {
          questKey: row.questKey,
          status: row.status,
          name: config?.name ?? row.questKey,
          chapter: config?.chapter ?? 1,
          questType: config?.questType ?? "main",
          description: config?.description ?? "",
          rewards: config?.rewards ?? {},
          objectives: objectives.map((objective, index) => ({
            label: objective.label ?? "",
            type: objective.type ?? "",
            current: progress[String(index)] ?? 0,
            target: Number(objective.count ?? 1),
            done: (progress[String(index)] ?? 0) >= Number(objective.count ?? 1),
          })),
        };
      })
      .sort((a, b) => {
        const order = { main: 0, side: 1, daily: 2 } as Record<string, number>;
        return (order[a.questType] ?? 3) - (order[b.questType] ?? 3) || a.chapter - b.chapter;
      });
  }),

  /** 编年史中的任务记录：保留已完成与已领取的任务，不出现在主城任务列表 */
  questHistory: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const rows = await ensureQuests(profile.id);
    const configs = await db.select().from(quests);
    const map = new Map(configs.map((c) => [c.questKey, c]));
    return rows
      .filter((row) => row.status === "completed" || row.status === "claimed")
      .map((row) => {
        const config = map.get(row.questKey);
        const objectives = (config?.objectives ?? []) as Array<{ label?: string; count?: number; type?: string }>;
        const progress = (row.progress ?? {}) as Record<string, number>;
        return {
          questKey: row.questKey,
          status: row.status,
          name: config?.name ?? row.questKey,
          chapter: config?.chapter ?? 1,
          questType: config?.questType ?? "main",
          description: config?.description ?? "",
          rewards: config?.rewards ?? {},
          completedAt: row.completedAt,
          claimedAt: row.claimedAt,
          objectives: objectives.map((objective, index) => ({
            label: objective.label ?? "",
            type: objective.type ?? "",
            current: progress[String(index)] ?? 0,
            target: Number(objective.count ?? 1),
          })),
        };
      })
      .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
  }),

  claimQuest: protectedProcedure
    .input(z.object({ questKey: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const result = await claimQuestReward(profile.id, input.questKey);
      if (!result.ok) {
        const messages: Record<string, string> = {
          quest_not_found: "任务不存在",
          not_completed: "任务尚未完成",
          database_unavailable: "数据库暂不可用",
        };
        throw new TRPCError({ code: "BAD_REQUEST", message: messages[result.reason] ?? "领取失败" });
      }
      await syncUnlocks(profile.id);
      return result;
    }),

  /** 完成首次命名仪式；提交后姓名与仪式状态只写入一次。 */
  completeIntro: protectedProcedure
    .input(z.object({ givenName: introNameInput, familyName: introNameInput }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      if (profile.introCompleted) {
        return {
          introCompleted: true,
          playerGivenName: profile.playerGivenName,
          playerFamilyName: profile.playerFamilyName ?? DEFAULT_FAMILY_NAME,
          familyNameChanged: profile.familyNameChanged,
          lordName: profile.lordName,
          usedFallbackName: false,
        };
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const usedFallbackName = input.givenName.length === 0;
      const givenName = usedFallbackName
        ? FALLBACK_GIVEN_NAMES[profile.id % FALLBACK_GIVEN_NAMES.length]
        : input.givenName;
      const familyName = input.familyName || DEFAULT_FAMILY_NAME;
      const familyNameChanged = familyName !== DEFAULT_FAMILY_NAME;
      const lordName = `${givenName}·${familyName}`;

      // 条件更新使并发提交时只有第一次可以写入名字；后续请求读取已完成的档案。
      await db
        .update(gameProfiles)
        .set({
          lordName,
          introCompleted: true,
          playerGivenName: givenName,
          playerFamilyName: familyName,
          familyNameChanged,
        })
        .where(and(eq(gameProfiles.id, profile.id), eq(gameProfiles.introCompleted, false)));

      const [current] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profile.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "档案不存在" });
      if (!current.introCompleted) throw new TRPCError({ code: "CONFLICT", message: "命名仪式状态已变化，请重试" });

      return {
        introCompleted: true,
        playerGivenName: current.playerGivenName,
        playerFamilyName: current.playerFamilyName ?? DEFAULT_FAMILY_NAME,
        familyNameChanged: current.familyNameChanged,
        lordName: current.lordName,
        usedFallbackName: current.lordName === lordName ? usedFallbackName : false,
      };
    }),

  /** 更新领地基础信息（领主名 / 城堡名） */
  updateLord: protectedProcedure
    .input(z.object({ lordName: z.string().min(1).max(16).optional(), keepName: z.string().min(1).max(24).optional(), avatarKey: z.string().max(32).optional() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
      const update: Record<string, string> = {};
      if (input.lordName) update.lordName = input.lordName;
      if (input.keepName) update.keepName = input.keepName;
      if (input.avatarKey) update.avatarKey = input.avatarKey;
      if (Object.keys(update).length > 0) {
        await db.update(gameProfiles).set(update).where(eq(gameProfiles.id, profile.id));
      }
      return { ok: true };
    }),

  /** 队伍编成 */
  setTeam: protectedProcedure
    .input(
      z.object({
        teamId: z.number().int().positive(),
        memberIds: z.array(z.number().int().positive()).max(4),
        formation: z.record(z.string(), z.enum(["front", "back"])).optional(),
        name: z.string().max(32).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const { teams } = await import("../../drizzle/schema");
      const [team] = await db
        .select()
        .from(teams)
        .where(and(eq(teams.id, input.teamId), eq(teams.profileId, profile.id)))
        .limit(1);
      if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "队伍不存在" });

      const owned = await db.select().from(playerCharacters).where(eq(playerCharacters.profileId, profile.id));
      const ownedIds = new Set(owned.map((o) => o.id));
      if (input.memberIds.some((id) => !ownedIds.has(id))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "队伍中包含未拥有的角色" });
      }

      const unique = Array.from(new Set(input.memberIds)).slice(0, 4);
      if (team.isActive && unique.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "远征队至少需要一名同伴" });
      }
      await db
        .update(teams)
        .set({
          memberIds: unique,
          formation: (input.formation ?? {}) as Record<string, string>,
          name: input.name ?? team.name,
        })
        .where(eq(teams.id, team.id));

      if (team.isActive && unique.length > 0) {
        await advanceQuestProgress(profile.id, [{ type: "form_team", memberCount: unique.length }]);
        await completeTutorialBusinessAction(profile.id, "form_expedition");
      }

      return { ok: true, memberIds: unique };
    }),

  /** 队伍列表（含成员详情） */
  teams: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const roster = await loadRoster(profile.id);
    // 兵营升级后自动补齐队伍槽位；主城仍只展示当前激活队伍。
    const rows = await ensureUnlockedTeams(profile.id);
    const byId = new Map(roster.map((entry) => [entry.playerCharId, entry]));
    return rows.map((team) => ({
      id: team.id,
      name: team.name,
      slotIndex: team.slotIndex,
      isActive: team.isActive,
      power: (team.memberIds ?? []).reduce((sum, id) => sum + (byId.get(id)?.power ?? 0), 0),
	      members: (team.memberIds ?? []).map((id) => {
	        const entry = byId.get(id);
	        return entry
	          ? {
              playerCharId: entry.playerCharId,
              charKey: entry.charKey,
              name: entry.config.name,
              title: entry.config.title,
              rarity: entry.config.rarity,
              job: entry.config.job,
	              element: entry.config.element,
	              avatarUrl: entry.config.avatarUrl,
	              portraitUrl: entry.config.portraitUrl,
	              level: entry.level,
              power: entry.power,
              row: (team.formation ?? {})[String(id)] ?? "front",
              hp: entry.stats.hp,
            }
          : null;
      }).filter(Boolean),
      memberIds: team.memberIds ?? [],
      formation: team.formation ?? {},
    }));
  }),

  /** 资源明细（供顶部资源条展开面板） */
  resources: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const accrual = await accrueProfile(profile.id);
    const buildings = await loadBuildings(profile.id);
    const views = buildingView(buildings);
    const perHour: Record<string, number> = { gold: 0, food: 0, wood: 0, iron: 0, aether: 0 };
    for (const view of views) {
      if (view.level <= 0) continue;
      for (const [key, value] of Object.entries(view.currentProduce ?? {})) {
        perHour[key] = (perHour[key] ?? 0) + Number(value ?? 0);
      }
    }
    return {
      resources: accrual.profile,
      perHour,
      cap: resourceCap(accrual.profile.keepLevel, buildings.find((b) => b.buildingKey === "market")?.level ?? 0),
      gains: accrual.gains,
      regionControl: await (async () => {
        const db = await getDb();
        if (!db) return [];
        return REGION_SEEDS.map((region) => ({ regionKey: region.regionKey, name: region.name }));
      })(),
      tradeIncome: round(Object.values(perHour).reduce((sum, value) => sum + value, 0) / 24),
      nodeCount: NODE_SEEDS.length,
      regionCount: REGION_SEEDS.length,
      recomputed: await recomputeRegionControl(profile.id, "silverpine"),
    };
  }),
});
