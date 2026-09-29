import { and, eq, inArray } from "drizzle-orm";
import {
  gameProfiles,
  nodeStates,
  playerCharacters,
  profileQuests,
  quests,
  regionStates,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { addResources, isNodeClearedStatus } from "./service";

/**
 * 进度系统（任务 / 解锁）
 * 事件驱动：战斗胜利、建筑升级、招募、AI 互动等都会调用 advanceQuestProgress。
 */

export type ProgressEvent =
  | { type: "clear_node"; nodeKey: string; regionKey: string; firstClear: boolean }
  | { type: "upgrade_building"; buildingKey: string; level: number }
  | { type: "recruit"; charKey: string; rarity: string }
  | { type: "own_character"; charKey: string }
  | { type: "level_character"; charKey: string; level: number }
  | { type: "talk_ai"; charKey: string | null }
  | { type: "form_team"; memberCount: number }
  | { type: "equip_item"; charKey: string; slot: string }
  | { type: "control_region"; regionKey: string; percent: number };

type Objective = { type?: string; key?: string; buildingKey?: string; nodeKey?: string; count?: number; label?: string };

function objectiveMatches(objective: Objective, event: ProgressEvent): boolean {
  const key = objective.key ?? objective.buildingKey ?? objective.nodeKey ?? "any";
  switch (objective.type) {
    case "clear_node":
      if (event.type !== "clear_node") return false;
      return key === "any" || key === event.nodeKey;
    case "upgrade_building":
      if (event.type !== "upgrade_building") return false;
      return key === "any" || key === event.buildingKey;
    case "recruit":
      return event.type === "recruit" && (key === "any" || key === event.charKey);
    case "own_character":
      return event.type === "own_character" && (key === "any" || key === event.charKey);
    case "level_character":
      if (event.type !== "level_character") return false;
      if (key === "any") return true;
      return key === event.charKey;
    case "talk_ai":
      if (event.type !== "talk_ai") return false;
      return key === "any" || key === event.charKey;
    case "form_team":
      return event.type === "form_team" && event.memberCount > 0;
    case "equip_item":
      return event.type === "equip_item" && (key === "any" || key === event.slot);
    case "control_region":
      if (event.type !== "control_region") return false;
      if (key !== "any" && key !== event.regionKey) return false;
      return event.percent >= Number(objective.count ?? 0);
    default:
      return false;
  }
}

export type QuestProgressResult = {
  updated: Array<{ questKey: string; name: string; completed: boolean; objectives: Array<{ label: string; current: number; target: number; done: boolean }> }>;
  completedKeys: string[];
};

/** 推进任务进度；返回本次变化的可展示信息 */
export async function advanceQuestProgress(profileId: number, events: ProgressEvent[]): Promise<QuestProgressResult> {
  const db = await getDb();
  if (!db) return { updated: [], completedKeys: [] };

  const profileRows = await db.select().from(profileQuests).where(eq(profileQuests.profileId, profileId));
  const activeRows = profileRows.filter((q) => q.status === "active");
  if (activeRows.length === 0) return { updated: [], completedKeys: [] };

  const configs = await db.select().from(quests).where(inArray(quests.questKey, activeRows.map((q) => q.questKey)));
  const configMap = new Map(configs.map((c) => [c.questKey, c]));

  // 上下文（用于 level_character / own_character 等目标的即时判定）
  const owned = await db.select().from(playerCharacters).where(eq(playerCharacters.profileId, profileId));
  const ownedKeys = new Set(owned.map((o) => o.charKey));

  const updated: QuestProgressResult["updated"] = [];
  const completedKeys: string[] = [];

  for (const row of activeRows) {
    const config = configMap.get(row.questKey);
    if (!config) continue;
    const objectives = (config.objectives ?? []) as Objective[];
    const progress: Record<string, number> = { ...((row.progress ?? {}) as Record<string, number>) };
    let changed = false;

    objectives.forEach((objective, index) => {
      const key = String(index);
      const target = Number(objective.count ?? 1);
      let current = progress[key] ?? 0;

      // 直接状态型目标（不依赖事件）
      if (objective.type === "own_character" && (objective.key ?? "any") !== "any" && ownedKeys.has(String(objective.key))) {
        current = Math.max(current, target);
      }

      for (const event of events) {
        if (objectiveMatches(objective, event)) {
          if (objective.type === "level_character" && (objective.key ?? "any") !== "any") {
            if (event.type === "level_character" && event.charKey === objective.key && event.level >= target) current = Math.max(current, target);
            continue;
          }
          if (objective.type === "level_character" && (objective.key ?? "any") === "any") {
            if (event.type === "level_character" && event.level >= target) current = Math.max(current, target);
            continue;
          }
          if (objective.type === "control_region") {
            current = Math.max(current, target);
            continue;
          }
          current = Math.min(target, current + 1);
        }
      }

      if (current !== (progress[key] ?? 0)) {
        progress[key] = current;
        changed = true;
      }
    });

    // 等级类目标：检查是否已有角色达到要求
    objectives.forEach((objective, index) => {
      if (objective.type !== "level_character") return;
      const key = String(index);
      const target = Number(objective.count ?? 1);
      const reach = owned.some((o) => (objective.key === "any" || !objective.key ? o.level >= target : o.charKey === objective.key && o.level >= target));
      if (reach && (progress[key] ?? 0) < target) {
        progress[key] = target;
        changed = true;
      }
    });

    const allDone = objectives.every((_, index) => {
      const target = Number(objectives[index].count ?? 1);
      return (progress[String(index)] ?? 0) >= target;
    });

    if (changed || allDone) {
      await db
        .update(profileQuests)
        .set({
          progress,
          status: allDone ? "completed" : "active",
          completedAt: allDone ? new Date() : row.completedAt,
        })
        .where(eq(profileQuests.id, row.id));

      // 前置任务完成后激活后续任务
      if (allDone) {
        completedKeys.push(row.questKey);
        const nextQuests = await db.select().from(quests);
        const followers = nextQuests.filter((q) => (q.prerequisite as { questKey?: string } | null)?.questKey === row.questKey);
        for (const follower of followers) {
          const [existing] = await db
            .select()
            .from(profileQuests)
            .where(and(eq(profileQuests.profileId, profileId), eq(profileQuests.questKey, follower.questKey)))
            .limit(1);
          if (existing && existing.status === "locked") {
            await db.update(profileQuests).set({ status: "active" }).where(eq(profileQuests.id, existing.id));
          } else if (!existing) {
            await db.insert(profileQuests).values({ profileId, questKey: follower.questKey, status: "active", progress: {} });
          }
        }
      }

      updated.push({
        questKey: row.questKey,
        name: config.name,
        completed: allDone,
        objectives: objectives.map((objective, index) => {
          const target = Number(objective.count ?? 1);
          const current = progress[String(index)] ?? 0;
          return { label: String(objective.label ?? objective.type ?? ""), current, target, done: current >= target };
        }),
      });
    }
  }

  return { updated, completedKeys };
}

/** 领取任务奖励 */
export async function claimQuestReward(profileId: number, questKey: string) {
  const db = await getDb();
  if (!db) return { ok: false as const, reason: "database_unavailable" };
  const [row] = await db
    .select()
    .from(profileQuests)
    .where(and(eq(profileQuests.profileId, profileId), eq(profileQuests.questKey, questKey)))
    .limit(1);
  if (!row) return { ok: false as const, reason: "quest_not_found" };
  if (row.status !== "completed") return { ok: false as const, reason: "not_completed" };

  const [config] = await db.select().from(quests).where(eq(quests.questKey, questKey)).limit(1);
  const rewards = (config?.rewards ?? {}) as Record<string, unknown>;
  const items = Array.isArray(rewards.items) ? (rewards.items as Array<{ equipKey: string; quantity?: number }>) : [];

  await addResources(profileId, {
    gold: Number(rewards.gold ?? 0),
    food: Number(rewards.food ?? 0),
    wood: Number(rewards.wood ?? 0),
    iron: Number(rewards.iron ?? 0),
    aether: Number(rewards.aether ?? 0),
    renown: Number(rewards.renown ?? 0),
  });

  if (items.length > 0) {
    const { grantEquipment } = await import("./service");
    for (const item of items) {
      const quantity = Math.max(1, Number(item.quantity ?? 1));
      for (let i = 0; i < quantity; i += 1) await grantEquipment(profileId, item.equipKey, "quest");
    }
  }

  await db
    .update(profileQuests)
    .set({ status: "claimed", claimedAt: new Date() })
    .where(eq(profileQuests.id, row.id));

  // 章节推进（主线任务）
  const chapter = config?.chapter ?? 1;
  const [profile] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profileId)).limit(1);
  if (profile && config?.questType === "main" && chapter >= profile.chapter) {
    await db.update(gameProfiles).set({ chapter: Math.min(6, chapter + 1), keepExp: profile.keepExp + 50 }).where(eq(gameProfiles.id, profileId));
  }

  return { ok: true as const, rewards, items };
}

/** 建筑升级后解锁节点/区域（由升级接口调用） */
export async function syncUnlocks(profileId: number) {
  const db = await getDb();
  if (!db) return;
  const [profile] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profileId)).limit(1);
  if (!profile) return;

  const nodeRows = await db.select().from(nodeStates).where(eq(nodeStates.profileId, profileId));
  const cleared = new Set(nodeRows.filter((n) => isNodeClearedStatus(n.status)).map((n) => n.nodeKey));
  const regionRows = await db.select().from(regionStates).where(eq(regionStates.profileId, profileId));
  const owned = await db.select().from(playerCharacters).where(eq(playerCharacters.profileId, profileId));

  const { NODE_SEEDS, REGION_SEEDS } = await import("./data/world");
  const { loadRoster, nodeUnlockCheck, regionUnlockCheck } = await import("./service");
  const roster = await loadRoster(profileId);
  const topPower = roster
    .slice(0, 4)
    .reduce((sum, entry) => sum + entry.power, 0);

  const controlOf = (regionKey: string) => regionRows.find((r) => r.regionKey === regionKey)?.controlPercent ?? 0;
  const srCount = roster.filter((entry) => entry.config.rarity !== "R").length;
  const unlockedRegionKeys = new Set<string>();

  for (const region of REGION_SEEDS) {
    const state = regionRows.find((r) => r.regionKey === region.regionKey);
    const check = regionUnlockCheck(region, {
      clearedKeys: cleared,
      renown: profile.renown,
      chapter: profile.chapter,
      srCount,
      power: topPower,
      controlPercent: controlOf,
    });
    const unlocked = Boolean(state?.unlocked) || check.unlocked;
    if (unlocked) unlockedRegionKeys.add(region.regionKey);

    if (state && !state.unlocked && check.unlocked) {
      await db.update(regionStates).set({ unlocked: true }).where(eq(regionStates.id, state.id));
    } else if (!state) {
      await db.insert(regionStates).values({
        profileId,
        regionKey: region.regionKey,
        unlocked,
        totalNodes: NODE_SEEDS.filter((node) => node.regionKey === region.regionKey).length,
      });
    }
  }

  // 节点必须同时满足“所属区域已解锁”和自身前置条件。顺便修复旧版本
  // 曾错误写成 available 的灰色区域节点，但不回退已经通关的玩家进度。
  for (const node of NODE_SEEDS) {
    const state = nodeRows.find((n) => n.nodeKey === node.nodeKey);
    const check = nodeUnlockCheck(node, {
      clearedKeys: cleared,
      renown: profile.renown,
      chapter: profile.chapter,
      power: topPower,
      controlPercent: controlOf(node.regionKey),
      ownedKeys: new Set(owned.map((entry) => entry.charKey)),
    });
    const shouldBeAvailable = unlockedRegionKeys.has(node.regionKey) && check.unlocked;

    if (!state) {
      await db.insert(nodeStates).values({
        profileId,
        nodeKey: node.nodeKey,
        status: shouldBeAvailable ? "available" : "locked",
      });
    } else if (state.status === "locked" && shouldBeAvailable) {
      await db.update(nodeStates).set({ status: "available" }).where(eq(nodeStates.id, state.id));
    } else if (state.status === "available" && !shouldBeAvailable) {
      await db.update(nodeStates).set({ status: "locked" }).where(eq(nodeStates.id, state.id));
    }
  }
}

/** 重新计算区域控制度 */
export async function recomputeRegionControl(profileId: number, regionKey: string) {
  const db = await getDb();
  if (!db) return 0;
  const { NODE_SEEDS } = await import("./data/world");
  const { controlPercent } = await import("./formulas");
  const regionNodes = NODE_SEEDS.filter((n) => n.regionKey === regionKey);
  const rows = await db.select().from(nodeStates).where(eq(nodeStates.profileId, profileId));
  const mapped = regionNodes.map((node) => {
    const row = rows.find((r) => r.nodeKey === node.nodeKey);
    return { status: row?.status ?? "locked", controlWeight: node.controlWeight };
  });
  const percent = controlPercent(mapped, 3);
  const controlled = mapped.filter((m) => m.status === "conquered").length;

  const [existing] = await db
    .select()
    .from(regionStates)
    .where(and(eq(regionStates.profileId, profileId), eq(regionStates.regionKey, regionKey)))
    .limit(1);
  if (existing) {
    await db
      .update(regionStates)
      .set({ controlPercent: percent, controlledNodes: controlled, totalNodes: regionNodes.length })
      .where(eq(regionStates.id, existing.id));
  } else {
    await db.insert(regionStates).values({
      profileId,
      regionKey,
      controlPercent: percent,
      controlledNodes: controlled,
      totalNodes: regionNodes.length,
      unlocked: true,
    });
  }
  return percent;
}
