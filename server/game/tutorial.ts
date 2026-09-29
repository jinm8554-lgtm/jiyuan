import { and, eq } from "drizzle-orm";
import {
  aiMessages,
  battles,
  gameProfiles,
  nodeStates,
  playerCharacters,
  profileBuildings,
  recruitHistories,
  teams,
} from "../../drizzle/schema";
import { getDb } from "../db";

/** 版本化的新手流程。key 用于存档和业务事件，展示文本由前端映射。 */
export const TUTORIAL_STEPS = [
  "welcome_keep",
  "inspect_keep",
  "build_wall",
  "finish_wall",
  "form_expedition",
  "enter_world",
  "first_battle",
  "claim_battle_rewards",
  "council_talk",
  "first_recruit",
  "tutorial_complete",
] as const;

export type TutorialStepKey = (typeof TUTORIAL_STEPS)[number];
export type TutorialAction = "dismiss_welcome" | "inspect_keep" | "enter_world" | "skip_tutorial";

export type TutorialProgress = {
  version: 2;
  skipped: boolean;
  currentKey: TutorialStepKey;
  completedKeys: TutorialStepKey[];
  dismissedHints: string[];
  lastSeenAt: number;
  completedAt?: number;
  summaryDismissed?: boolean;
};

const COMPLETABLE_KEYS = TUTORIAL_STEPS.filter((key) => key !== "tutorial_complete");

function isStepKey(value: unknown): value is TutorialStepKey {
  return typeof value === "string" && (TUTORIAL_STEPS as readonly string[]).includes(value);
}

export function readTutorialProgress(settings: unknown): TutorialProgress | null {
  if (!settings || typeof settings !== "object") return null;
  const raw = (settings as Record<string, unknown>).tutorial;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.version !== 2) return null;
  const completedKeys = Array.isArray(value.completedKeys)
    ? value.completedKeys.filter(isStepKey)
    : [];
  return {
    version: 2,
    skipped: value.skipped === true,
    currentKey: isStepKey(value.currentKey) ? value.currentKey : "welcome_keep",
    completedKeys: Array.from(new Set(completedKeys)),
    dismissedHints: Array.isArray(value.dismissedHints) ? value.dismissedHints.filter((item): item is string => typeof item === "string") : [],
    lastSeenAt: Number.isFinite(value.lastSeenAt) ? Number(value.lastSeenAt) : 0,
    completedAt: Number.isFinite(value.completedAt) ? Number(value.completedAt) : undefined,
    summaryDismissed: value.summaryDismissed === true,
  };
}

export function newTutorialProgress(): TutorialProgress {
  return {
    version: 2,
    skipped: false,
    currentKey: "welcome_keep",
    completedKeys: [],
    dismissedHints: [],
    lastSeenAt: Date.now(),
  };
}

function withTutorial(settings: unknown, tutorial: TutorialProgress) {
  return { ...(settings && typeof settings === "object" ? settings as Record<string, unknown> : {}), tutorial };
}

function nextKey(completed: Set<TutorialStepKey>): TutorialStepKey {
  return COMPLETABLE_KEYS.find((key) => !completed.has(key)) ?? "tutorial_complete";
}

function compatibilityStep(completed: Set<TutorialStepKey>) {
  const current = nextKey(completed);
  const index = TUTORIAL_STEPS.indexOf(current);
  return current === "tutorial_complete" ? TUTORIAL_STEPS.length : Math.max(0, index);
}

/** 仅以落库的游戏事实推导可自动跳过的业务步骤。 */
async function completedFromGame(profileId: number): Promise<TutorialStepKey[]> {
  const db = await getDb();
  if (!db) return [];
  const [buildings, teamRows, characters, wonBattles, nodeRows, messages, draws] = await Promise.all([
    db.select().from(profileBuildings).where(eq(profileBuildings.profileId, profileId)),
    db.select().from(teams).where(eq(teams.profileId, profileId)),
    db.select().from(playerCharacters).where(eq(playerCharacters.profileId, profileId)),
    db.select().from(battles).where(and(eq(battles.profileId, profileId), eq(battles.status, "won"))).limit(1),
    db.select().from(nodeStates).where(eq(nodeStates.profileId, profileId)),
    db.select().from(aiMessages).where(eq(aiMessages.profileId, profileId)).limit(1),
    db.select().from(recruitHistories).where(eq(recruitHistories.profileId, profileId)).limit(1),
  ]);
  const completed: TutorialStepKey[] = [];
  const wall = buildings.find((building) => building.buildingKey === "wall");
  if ((wall?.upgradingTo ?? 0) >= 1 || (wall?.level ?? 0) >= 1) completed.push("build_wall");
  if ((wall?.level ?? 0) >= 1 && !wall?.upgradingTo) completed.push("finish_wall");
  const owned = new Set(characters.map((character) => character.id));
  const validTeam = teamRows.some((team) => team.isActive && (team.memberIds ?? []).some((id) => owned.has(id)));
  if (validTeam) completed.push("form_expedition");
  const hasWonBattle = wonBattles.length > 0;
  const touchedTutorialNode = nodeRows.some((node) => node.nodeKey === "sp_keep_road" && node.status !== "locked");
  if (hasWonBattle || touchedTutorialNode) completed.push("enter_world");
  if (hasWonBattle) completed.push("first_battle", "claim_battle_rewards");
  if (messages.length > 0) completed.push("council_talk");
  if (draws.length > 0) completed.push("first_recruit");
  return completed;
}

/**
 * 同步真实游戏行为到教程。没有 version:2 标识的旧存档只返回状态，绝不写入或强制开启教程。
 */
export async function syncTutorialProgress(profileId: number) {
  const db = await getDb();
  if (!db) return null;
  const [profile] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profileId)).limit(1);
  if (!profile) return null;
  const stored = readTutorialProgress(profile.settings);
  if (!stored) return null;
  const completed = new Set<TutorialStepKey>(stored.completedKeys);
  for (const key of await completedFromGame(profileId)) completed.add(key);
  const currentKey = stored.skipped ? "tutorial_complete" : nextKey(completed);
  if (currentKey === "tutorial_complete" && !stored.skipped) completed.add("tutorial_complete");
  const next: TutorialProgress = {
    ...stored,
    currentKey,
    completedKeys: Array.from(completed),
    completedAt: currentKey === "tutorial_complete" ? stored.completedAt ?? Date.now() : stored.completedAt,
  };
  const changed = JSON.stringify(next) !== JSON.stringify(stored);
  const nextStep = Math.max(profile.tutorialStep, compatibilityStep(completed));
  if (changed || nextStep !== profile.tutorialStep) {
    await db.update(gameProfiles).set({ settings: withTutorial(profile.settings, next), tutorialStep: nextStep }).where(eq(gameProfiles.id, profileId));
  }
  return next;
}

export async function completeTutorialAction(profileId: number, action: TutorialAction) {
  const db = await getDb();
  if (!db) return null;
  const current = await syncTutorialProgress(profileId);
  if (!current) return null;
  const [profile] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profileId)).limit(1);
  if (!profile) return null;
  const completed = new Set<TutorialStepKey>(current.completedKeys);
  if (action === "skip_tutorial") {
    const skipped: TutorialProgress = {
      ...current,
      skipped: true,
      currentKey: "tutorial_complete",
      completedKeys: Array.from(completed),
      completedAt: Date.now(),
    };
    await db.update(gameProfiles).set({ settings: withTutorial(profile.settings, skipped), tutorialStep: Math.max(profile.tutorialStep, TUTORIAL_STEPS.length) }).where(eq(gameProfiles.id, profileId));
    return skipped;
  }
  const key: TutorialStepKey = action === "dismiss_welcome" ? "welcome_keep" : action === "inspect_keep" ? "inspect_keep" : "enter_world";
  completed.add(key);
  const next: TutorialProgress = {
    ...current,
    currentKey: nextKey(completed),
    completedKeys: Array.from(completed),
    lastSeenAt: Date.now(),
  };
  if (next.currentKey === "tutorial_complete") {
    next.completedKeys = Array.from(new Set<TutorialStepKey>([...next.completedKeys, "tutorial_complete"]));
    next.completedAt = Date.now();
  }
  await db.update(gameProfiles).set({ settings: withTutorial(profile.settings, next), tutorialStep: Math.max(profile.tutorialStep, compatibilityStep(completed)) }).where(eq(gameProfiles.id, profileId));
  return next;
}

/** 业务 router 成功后调用；不会接受客户端传入的“完成”声明。 */
export async function completeTutorialBusinessAction(profileId: number, key: Exclude<TutorialStepKey, "welcome_keep" | "inspect_keep" | "enter_world" | "tutorial_complete">) {
  const db = await getDb();
  if (!db) return null;
  const current = await syncTutorialProgress(profileId);
  if (!current || current.skipped) return current;
  const [profile] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profileId)).limit(1);
  if (!profile) return null;
  const completed = new Set<TutorialStepKey>([...current.completedKeys, key]);
  const next: TutorialProgress = {
    ...current,
    currentKey: nextKey(completed),
    completedKeys: Array.from(completed),
    lastSeenAt: Date.now(),
  };
  if (next.currentKey === "tutorial_complete") {
    next.completedKeys = Array.from(new Set<TutorialStepKey>([...next.completedKeys, "tutorial_complete"]));
    next.completedAt = Date.now();
  }
  await db.update(gameProfiles).set({ settings: withTutorial(profile.settings, next), tutorialStep: Math.max(profile.tutorialStep, compatibilityStep(completed)) }).where(eq(gameProfiles.id, profileId));
  return next;
}
