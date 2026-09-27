import { and, eq, inArray, sql } from "drizzle-orm";
import {
  characters,
  equipments,
  gameProfiles,
  nodeStates,
  playerCharacters,
  playerEquipments,
  profileBuildings,
  profilePity,
  profileQuests,
	  profileStoryFlags,
	  quests,
	  regionStates,
	  teams,
	  users,
	  worldNodes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { BUILDING_BY_KEY, BUILDING_SEEDS } from "./data/buildings";
import { EQUIPMENT_SEEDS, SET_BONUSES } from "./data/equipments";
import { NODE_BY_KEY, NODE_SEEDS, REGION_SEEDS } from "./data/world";
import { STARTER_CHAR_KEYS } from "./data/characters";
import {
  addStats,
  applyBondExp,
  applyExp,
  buildingUpgradeCost,
  bundleFromEntries,
  clamp,
  emptyStats,
  equipmentStats,
  MAX_LEVEL_BY_ASCENSION,
  powerRating,
  recoverStamina,
  resourceCap,
  round,
  statAtLevel,
  statsAtLevel,
  type ResourceBundle,
  type StatBlock,
} from "./formulas";

/* ============================= 档案 ============================= */

export async function getProfileByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(gameProfiles).where(eq(gameProfiles.userId, userId)).limit(1);
  return rows[0];
}

export async function createProfile(userId: number, lordName: string, keepName = "灰隼堡") {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const [result] = await db
    .insert(gameProfiles)
    .values({ userId, lordName, keepName, pendingEvents: [], settings: {} })
    .$returningId();
  const profileId = result.id;

  // 初始建筑：全部 0 级（未建造）；酒馆与城墙在引导中建造，其余解锁条件由剧情与任务控制
  await db.insert(profileBuildings).values(
    BUILDING_SEEDS.map((building) => ({ profileId, buildingKey: building.buildingKey, level: 0 })),
  );

  // 区域状态
  await db.insert(regionStates).values(
    REGION_SEEDS.map((region) => ({
      profileId,
      regionKey: region.regionKey,
      unlocked: region.unlock && Object.keys(region.unlock).length === 0,
      totalNodes: NODE_SEEDS.filter((n) => n.regionKey === region.regionKey).length,
    })),
  );

  // 节点状态：首个节点可用
  await db.insert(nodeStates).values(
    NODE_SEEDS.map((node) => ({
      profileId,
      nodeKey: node.nodeKey,
      status: (node.unlock && (node.unlock as { chapter?: number }).chapter === 0
        ? "available"
        : "locked") as "available" | "locked",
    })),
  );

  // 初始角色
  const starterInserts = await db
    .insert(playerCharacters)
    .values(
      STARTER_CHAR_KEYS.map((charKey) => ({
        profileId,
        charKey,
        obtainedVia: "starter",
        skillLevels: {} as Record<string, number>,
        equipped: {} as Record<string, number>,
        storyState: {} as Record<string, unknown>,
      })),
    )
    .$returningId();

  // 初始装备
  await db.insert(playerEquipments).values(
    ["eq_iron_sword", "eq_wooden_buckler", "eq_padded_jerkin", "eq_marching_boots", "eq_heraldic_ring"].map((equipKey) => ({
      profileId,
      equipKey,
      source: "starter",
      rolls: {} as Record<string, number>,
    })),
  );

  // 默认队伍
  // 关键：初始队伍必须自动编入初始角色，否则新领主第一次远征会直接失败
  // （「队伍中没有角色」），这是最容易劝退玩家的首局体验。
  const starterIds = starterInserts.map((row) => row.id);
  const [teamResult] = await db
    .insert(teams)
    .values({
      profileId,
      name: "远征队",
      slotIndex: 0,
      isActive: true,
      memberIds: starterIds,
      formation: Object.fromEntries(starterIds.map((id, index) => [String(id), index < 2 ? "front" : "back"])),
    })
    .$returningId();
  void teamResult;

  // 任务与保底初始化在首次读取时惰性完成
  await db.insert(profilePity).values({ profileId, poolKey: "pool_border_road" });

  return profileId;
}

export async function ensureProfile(userId: number, lordName: string) {
  const existing = await getProfileByUserId(userId);
  if (existing) return existing;
  await createProfile(userId, lordName);
  const created = await getProfileByUserId(userId);
  if (!created) throw new Error("档案创建失败");
  return created;
}

/* ====================== 资源与领地结算 ====================== */

export type AccrualResult = {
	  profile: typeof gameProfiles.$inferSelect;
	  gains: ResourceBundle;
	  secondsElapsed: number;
	  staminaRecovered: number;
};

const MEMBER_DAILY_STAMINA_RESETS = 3;
const MEMBER_DAILY_TRADE_RUSHES = 5;

function utcDayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export type MembershipBenefits = {
  active: boolean;
  membership: "free" | "supporter";
  expiresAt: Date | null;
  dayKey: string;
  staminaResetRemaining: number;
  tradeRushRemaining: number;
  tradeAutoDispatch: boolean;
};

/** 会员便利权益：每日计数由服务端按 UTC 日期轮换，客户端不得覆盖。 */
export async function getMembershipBenefits(profileId: number, now = new Date()): Promise<MembershipBenefits> {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const [profile] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profileId)).limit(1);
  if (!profile) throw new Error("档案不存在");
  const [user] = await db.select({ membership: users.membership, membershipExpiresAt: users.membershipExpiresAt }).from(users).where(eq(users.id, profile.userId)).limit(1);
  if (!user) throw new Error("会员账号不存在");

  const dayKey = utcDayKey(now);
  let staminaResetUses = profile.staminaResetUses;
  let tradeRushUses = profile.tradeRushUses;
  if (profile.membershipDayKey !== dayKey) {
    staminaResetUses = 0;
    tradeRushUses = 0;
    await db.update(gameProfiles).set({ membershipDayKey: dayKey, staminaResetUses, tradeRushUses }).where(eq(gameProfiles.id, profile.id));
  }

  const active = user.membership === "supporter" && (!user.membershipExpiresAt || user.membershipExpiresAt.getTime() > now.getTime());
  return {
    active,
    membership: user.membership,
    expiresAt: user.membershipExpiresAt,
    dayKey,
    staminaResetRemaining: active ? Math.max(0, MEMBER_DAILY_STAMINA_RESETS - staminaResetUses) : 0,
    tradeRushRemaining: active ? Math.max(0, MEMBER_DAILY_TRADE_RUSHES - tradeRushUses) : 0,
    tradeAutoDispatch: active && profile.tradeAutoDispatch,
  };
}

export { MEMBER_DAILY_STAMINA_RESETS, MEMBER_DAILY_TRADE_RUSHES };

/** 离线结算：建筑产出 × 时间（上限 12 小时）+ 体力恢复 + 升级完成 */
export async function accrueProfile(profileId: number, now = new Date()): Promise<AccrualResult> {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const rows = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profileId)).limit(1);
  const profile = rows[0];
  if (!profile) throw new Error("档案不存在");

  const buildings = await db.select().from(profileBuildings).where(eq(profileBuildings.profileId, profileId));
  const buildingMap = new Map(buildings.map((b) => [b.buildingKey, b]));

  // 完成到期的升级
  for (const building of buildings) {
    if (building.upgradingTo && building.upgradeDoneAt && building.upgradeDoneAt.getTime() <= now.getTime()) {
      await db
        .update(profileBuildings)
        .set({ level: building.upgradingTo, upgradingTo: null, upgradeDoneAt: null })
        .where(eq(profileBuildings.id, building.id));
      building.level = building.upgradingTo;
      building.upgradingTo = null;
    }
  }

  const entries = buildings
    .filter((b) => b.level > 0)
    .map((b) => {
      const config = BUILDING_BY_KEY.get(b.buildingKey);
      const levelConfig = config?.levels.find((l) => Number(l.level) === b.level);
      return { produce: (levelConfig?.produce ?? {}) as Record<string, number>, level: 1 };
    });
  const perHour = bundleFromEntries(entries);

  const elapsedMs = Math.max(0, now.getTime() - profile.lastTickAt.getTime());
  const cappedMs = Math.min(elapsedMs, 12 * 3600 * 1000);
  const hours = cappedMs / 3600 / 1000;
  const gains: ResourceBundle = {
    gold: round(perHour.gold * hours),
    food: round(perHour.food * hours),
    wood: round(perHour.wood * hours),
    iron: round(perHour.iron * hours),
    aether: round(perHour.aether * hours),
  };

  const marketLevel = buildingMap.get("market")?.level ?? 0;
  const cap = resourceCap(profile.keepLevel, marketLevel);
  const staminaResult = recoverStamina(profile.stamina, profile.staminaMax, profile.staminaUpdatedAt, now, profile.keepLevel);

  const next = {
    gold: clamp(profile.gold + gains.gold, 0, cap),
    food: clamp(profile.food + gains.food, 0, cap),
    wood: clamp(profile.wood + gains.wood, 0, cap),
    iron: clamp(profile.iron + gains.iron, 0, cap),
    aether: clamp(profile.aether + gains.aether, 0, cap),
    stamina: staminaResult.stamina,
    staminaMax: staminaResult.staminaMax,
    staminaUpdatedAt: staminaResult.updatedAt,
    lastTickAt: elapsedMs > cappedMs ? new Date(now) : profile.lastTickAt,
  };

  if (
    gains.gold + gains.food + gains.wood + gains.iron + gains.aether > 0 ||
    next.stamina !== profile.stamina ||
    cappedMs > 0
  ) {
    await db.update(gameProfiles).set(next).where(eq(gameProfiles.id, profileId));
  }

  const [updated] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profileId)).limit(1);
  return {
    profile: updated ?? profile,
    gains: {
      gold: Math.max(0, next.gold - profile.gold),
      food: Math.max(0, next.food - profile.food),
      wood: Math.max(0, next.wood - profile.wood),
      iron: Math.max(0, next.iron - profile.iron),
      aether: Math.max(0, next.aether - profile.aether),
    },
    secondsElapsed: Math.round(elapsedMs / 1000),
    staminaRecovered: Math.max(0, next.stamina - profile.stamina),
  };
}

export async function spendResources(
  profileId: number,
  cost: Partial<ResourceBundle> & { renown?: number },
  options: { allowNegative?: boolean } = {},
) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const [profile] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profileId)).limit(1);
  if (!profile) throw new Error("档案不存在");

  const keys: Array<keyof ResourceBundle> = ["gold", "food", "wood", "iron", "aether"];
  const missing: string[] = [];
  for (const key of keys) {
    const need = cost[key] ?? 0;
    if (need > profile[key]) missing.push(key);
  }
  if (cost.renown && cost.renown > profile.renown) missing.push("renown");
  if (missing.length > 0 && !options.allowNegative) {
    return { ok: false as const, missing };
  }
  const next: Record<string, number> = {};
  for (const key of keys) next[key] = clamp(profile[key] - (cost[key] ?? 0), 0, 9_999_999);
  if (cost.renown) next.renown = clamp(profile.renown - cost.renown, 0, 9_999_999);
  await db.update(gameProfiles).set(next).where(eq(gameProfiles.id, profileId));
  return { ok: true as const, missing: [] as string[] };
}

export async function addResources(profileId: number, gain: Partial<ResourceBundle> & { renown?: number }) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const [profile] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profileId)).limit(1);
  if (!profile) throw new Error("档案不存在");
  const buildings = await db.select().from(profileBuildings).where(eq(profileBuildings.profileId, profileId));
  const marketLevel = buildings.find((b) => b.buildingKey === "market")?.level ?? 0;
  const cap = resourceCap(profile.keepLevel, marketLevel);
  const next = {
    gold: clamp(profile.gold + (gain.gold ?? 0), 0, cap),
    food: clamp(profile.food + (gain.food ?? 0), 0, cap),
    wood: clamp(profile.wood + (gain.wood ?? 0), 0, cap),
    iron: clamp(profile.iron + (gain.iron ?? 0), 0, cap),
    aether: clamp(profile.aether + (gain.aether ?? 0), 0, cap),
    renown: clamp(profile.renown + (gain.renown ?? 0), 0, 9_999_999),
  };
  await db.update(gameProfiles).set(next).where(eq(gameProfiles.id, profileId));
  return next;
}

/* ====================== 角色与装备 ====================== */

export type CharacterConfig = typeof characters.$inferSelect;

export async function loadCharacterConfigs(keys?: string[]): Promise<CharacterConfig[]> {
  const db = await getDb();
  if (!db) return [];
  if (keys && keys.length > 0) {
    return db.select().from(characters).where(inArray(characters.charKey, keys));
  }
  return db.select().from(characters);
}

export const skillLevelFor = (playerChar: { skillLevels: Record<string, number> }, skillKey: string) =>
  Math.max(1, playerChar.skillLevels?.[skillKey] ?? 1);

export type RosterEntry = {
  playerCharId: number;
  charKey: string;
  config: CharacterConfig;
  level: number;
  exp: number;
  expToNext: number;
  maxLevel: number;
  ascension: number;
  bondLevel: number;
  bondExp: number;
  affection: number;
  skillLevels: Record<string, number>;
  equipped: Record<string, number>;
  stats: StatBlock;
  baseStats: StatBlock;
  equipmentBonus: StatBlock;
  power: number;
  isNew: boolean;
  locked: boolean;
  storyState: Record<string, unknown>;
};

export async function loadRoster(profileId: number): Promise<RosterEntry[]> {
  const db = await getDb();
  if (!db) return [];
  const owned = await db.select().from(playerCharacters).where(eq(playerCharacters.profileId, profileId));
  if (owned.length === 0) return [];
  const configs = await loadCharacterConfigs(owned.map((o) => o.charKey));
  const configMap = new Map(configs.map((c) => [c.charKey, c]));
  const equipRows = await db.select().from(playerEquipments).where(eq(playerEquipments.profileId, profileId));
  const equipMap = new Map(equipRows.map((e) => [e.id, e]));
  const equipConfigs = EQUIPMENT_SEEDS;

  const entries: RosterEntry[] = [];
  for (const playerChar of owned) {
    const config = configMap.get(playerChar.charKey);
    if (!config) continue;
    const baseStats = statsAtLevel(config.baseStats as Partial<StatBlock>, config.growth, playerChar.level, playerChar.ascension);

    // 装备加成 + 套装效果
    const equippedIds = Object.values(playerChar.equipped ?? {}).filter((id) => typeof id === "number");
    const equipmentBonusRaw = emptyStats();
    const setCounts: Record<string, number> = {};
    for (const id of equippedIds) {
      const row = equipMap.get(id);
      if (!row) continue;
      const equipConfig = equipConfigs.find((c) => c.equipKey === row.equipKey);
      if (!equipConfig) continue;
      const bonus = equipmentStats(equipConfig.stats as Partial<StatBlock>, row.level, 8, (row.rolls ?? {}) as Partial<StatBlock>);
      for (const key of Object.keys(equipmentBonusRaw) as Array<keyof StatBlock>) equipmentBonusRaw[key] += bonus[key];
      if (equipConfig.setKey) setCounts[equipConfig.setKey] = (setCounts[equipConfig.setKey] ?? 0) + 1;
    }
    for (const [setKey, count] of Object.entries(setCounts)) {
      for (const tier of SET_BONUSES[setKey] ?? []) {
        if (count >= tier.pieces) {
          for (const [key, value] of Object.entries(tier.stats)) {
            equipmentBonusRaw[key as keyof StatBlock] += Number(value ?? 0);
          }
        }
      }
    }
    // 羁绊加成：每级 +1% 生命/攻击/防御（小幅，不影响公平性）
    const bondScale = 1 + (playerChar.bondLevel - 1) * 0.01;
    const stats = addStats(baseStats, Object.fromEntries(Object.entries(equipmentBonusRaw).map(([k, v]) => [k, round(v * bondScale)])) as Partial<StatBlock>);

    entries.push({
      playerCharId: playerChar.id,
      charKey: playerChar.charKey,
      config,
      level: playerChar.level,
      exp: playerChar.exp,
      expToNext: expForLevel(playerChar.level),
      maxLevel: MAX_LEVEL_BY_ASCENSION(playerChar.ascension),
      ascension: playerChar.ascension,
      bondLevel: playerChar.bondLevel,
      bondExp: playerChar.bondExp,
      affection: playerChar.affection,
      skillLevels: playerChar.skillLevels ?? {},
      equipped: playerChar.equipped ?? {},
      stats,
      baseStats,
      equipmentBonus: equipmentBonusRaw,
      power: powerRating(stats),
      isNew: playerChar.isNew,
      locked: playerChar.locked,
      storyState: (playerChar.storyState ?? {}) as Record<string, unknown>,
    });
  }
  return entries.sort((a, b) => b.power - a.power);
}

export function expForLevel(level: number): number {
  return round(60 + Math.pow(level, 1.55) * 22);
}

/** 授予角色（重复则转化为星辉信物 + 羁绊经验） */
export async function grantCharacter(profileId: number, charKey: string, via: string, shardMultiplier = 1) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const [config] = await db.select().from(characters).where(eq(characters.charKey, charKey)).limit(1);
  if (!config) return { ok: false as const, reason: "char_not_found" as const };

  const [existing] = await db
    .select()
    .from(playerCharacters)
    .where(and(eq(playerCharacters.profileId, profileId), eq(playerCharacters.charKey, charKey)))
    .limit(1);

  const rarity = config.rarity as "R" | "SR" | "SSR";
  const shardTable = { R: 6, SR: 20, SSR: 60 };
  const bondTable = { R: 10, SR: 25, SSR: 50 };

  if (existing) {
    const bond = applyBondExp(existing.bondLevel, existing.bondExp, round(bondTable[rarity] * shardMultiplier));
    await db
      .update(playerCharacters)
      .set({ bondLevel: bond.level, bondExp: bond.exp, affection: clamp(existing.affection + 2, -100, 100) })
      .where(eq(playerCharacters.id, existing.id));
    const shards = round(shardTable[rarity] * shardMultiplier);
    await db
      .update(gameProfiles)
      .set({ aether: sql`${gameProfiles.aether} + ${shards}` })
      .where(eq(gameProfiles.id, profileId));
    return { ok: true as const, duplicate: true as const, shards, bondLevel: bond.level };
  }

  await db.insert(playerCharacters).values({
    profileId,
    charKey,
    obtainedVia: via,
    isNew: true,
    skillLevels: {},
    equipped: {},
    storyState: {},
  });
  return { ok: true as const, duplicate: false as const, shards: 0, bondLevel: 1 };
}

export async function grantEquipment(profileId: number, equipKey: string, source = "battle") {
  const db = await getDb();
  if (!db) return;
  await db.insert(playerEquipments).values({ profileId, equipKey, source, rolls: {} });
}

/* ====================== 队伍 ====================== */

export async function loadTeams(profileId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(teams).where(eq(teams.profileId, profileId));
}

export async function ensureDefaultTeam(profileId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await loadTeams(profileId);
  if (rows.length > 0) {
    const existing = rows.find((row) => row.isActive) ?? rows[0];
    /**
     * 自愈：历史账号可能残留「队伍存在但没有任何成员」的状态，
     * 会让玩家一进远征就报「队伍中没有角色」。此处若发现队伍为空且玩家已有角色，
     * 自动补入前 4 名角色并预设前/后排，保证任何账号都能立刻开战。
     */
    if ((existing.memberIds ?? []).length === 0) {
      const roster = await loadRoster(profileId);
      const picks = roster.slice(0, 4);
      if (picks.length > 0) {
        const memberIds = picks.map((entry) => entry.playerCharId);
        const formation = Object.fromEntries(
          picks.map((entry, index) => [String(entry.playerCharId), index < 2 ? "front" : "back"]),
        );
        await db.update(teams).set({ memberIds, formation }).where(eq(teams.id, existing.id));
        const [refreshed] = await db.select().from(teams).where(eq(teams.id, existing.id)).limit(1);
        return refreshed ?? existing;
      }
    }
    return existing;
  }
  // 队伍不存在：创建一支并直接编入前 4 名角色（不留下空队伍）
  const roster = await loadRoster(profileId);
  const picks = roster.slice(0, 4);
  const memberIds = picks.map((entry) => entry.playerCharId);
  const formation = Object.fromEntries(
    picks.map((entry, index) => [String(entry.playerCharId), index < 2 ? "front" : "back"]),
  );
  const [result] = await db
    .insert(teams)
    .values({ profileId, name: "远征队", slotIndex: 0, isActive: true, memberIds, formation })
    .$returningId();
  const [created] = await db.select().from(teams).where(eq(teams.id, result.id)).limit(1);
  return created ?? null;
}

/** 根据兵营等级补齐可用队伍槽位；队伍成员与主队独立保存。 */
export async function ensureUnlockedTeams(profileId: number) {
  const db = await getDb();
  if (!db) return [];
  await ensureDefaultTeam(profileId);
  const bonus = await keepBonus(profileId);
  const unlockedCount = bonus.barracksLevel >= 6 ? 4 : bonus.barracksLevel >= 4 ? 3 : bonus.barracksLevel >= 2 ? 2 : 1;
  const existing = await loadTeams(profileId);
  for (let slotIndex = 1; slotIndex < unlockedCount; slotIndex += 1) {
    if (existing.some((team) => team.slotIndex === slotIndex)) continue;
    await db.insert(teams).values({
      profileId,
      name: slotIndex === 1 ? "预备队" : `远征队 ${slotIndex + 1}`,
      slotIndex,
      isActive: false,
      memberIds: [],
      formation: {},
    });
  }
  return loadTeams(profileId);
}

/* ====================== 建筑 ====================== */

export async function loadBuildings(profileId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(profileBuildings).where(eq(profileBuildings.profileId, profileId));
}

export function buildingView(rows: Array<{ buildingKey: string; level: number; upgradingTo: number | null; upgradeDoneAt: Date | null }>) {
  const map = new Map(rows.map((r) => [r.buildingKey, r]));
  return BUILDING_SEEDS.map((config) => {
    const row = map.get(config.buildingKey);
    const level = row?.level ?? 0;
    const nextLevel = Math.min(config.maxLevel, level + 1);
    const nextConfig = config.levels.find((l) => Number(l.level) === nextLevel);
    const upgrade = buildingUpgradeCost(config.levels, nextLevel);
    const currentConfig = config.levels.find((l) => Number(l.level) === level);
    return {
      buildingKey: config.buildingKey,
      name: config.name,
      category: config.category,
      description: config.description,
      iconKey: config.iconKey,
      hotspotX: config.hotspotX,
      hotspotY: config.hotspotY,
      maxLevel: config.maxLevel,
      level,
      upgradingTo: row?.upgradingTo ?? null,
      upgradeDoneAt: row?.upgradeDoneAt ?? null,
      nextLevel: level >= config.maxLevel ? null : nextLevel,
      nextCost: level >= config.maxLevel ? null : upgrade.cost,
      nextSeconds: level >= config.maxLevel ? null : upgrade.seconds,
      nextUnlock: level >= config.maxLevel ? null : (nextConfig?.unlock ?? null),
      nextEffect: level >= config.maxLevel ? null : (nextConfig?.effect ?? null),
      currentProduce: (currentConfig?.produce ?? {}) as Record<string, number>,
      currentEffect: (currentConfig?.effect ?? null) as string | null,
      currentUnlock: (currentConfig?.unlock ?? null) as string | null,
      status: (level > 0 ? "built" : "unbuilt") as "built" | "unbuilt",
    };
  });
}

/** 领地守备加成（城墙/兵营效果） */
export async function keepBonus(profileId: number) {
  const rows = await loadBuildings(profileId);
  const map = new Map(rows.map((r) => [r.buildingKey, r.level]));
  const wallLevel = map.get("wall") ?? 0;
  const barracksLevel = map.get("barracks") ?? 0;
  const reduction = wallLevel >= 9 ? 0.1 : wallLevel >= 5 ? 0.06 : wallLevel >= 2 ? 0.03 : 0;
  const attackBonus = barracksLevel >= 3 ? 0.04 : 0;
  const defenseBonus = barracksLevel >= 5 ? 0.04 : 0;
  const hpBonus = barracksLevel >= 8 ? 0.06 : 0;
  return { damageReduction: reduction, attackBonus, defenseBonus, hpBonus, wallLevel, barracksLevel };
}

/* ====================== 地图与进度 ====================== */

export async function loadNodeStates(profileId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(nodeStates).where(eq(nodeStates.profileId, profileId));
}

export async function loadRegionStates(profileId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(regionStates).where(eq(regionStates.profileId, profileId));
}

export function nodeUnlockCheck(
  node: (typeof NODE_SEEDS)[number],
  ctx: { clearedKeys: Set<string>; renown: number; chapter: number; power: number; controlPercent: number; ownedKeys: Set<string> },
): { unlocked: boolean; reason: string | null } {
  const unlock = (node.unlock ?? {}) as { nodeKey?: string; chapter?: number; renown?: number; power?: number };
  if (unlock.nodeKey && !ctx.clearedKeys.has(unlock.nodeKey)) {
    const parent = NODE_BY_KEY.get(unlock.nodeKey);
    return { unlocked: false, reason: `需先通关：${parent?.name ?? unlock.nodeKey}` };
  }
  if (typeof unlock.chapter === "number" && unlock.chapter > 0 && ctx.chapter < unlock.chapter) {
    return { unlocked: false, reason: `需推进至第 ${unlock.chapter} 章剧情` };
  }
  if (unlock.renown && ctx.renown < unlock.renown) {
    return { unlocked: false, reason: `需声望 ≥ ${unlock.renown}` };
  }
  if (unlock.power && ctx.power < unlock.power) {
    return { unlocked: false, reason: `需队伍战力 ≥ ${unlock.power}` };
  }
  return { unlocked: true, reason: null };
}

export function regionUnlockCheck(
  region: (typeof REGION_SEEDS)[number],
  ctx: {
    clearedKeys: Set<string>;
    renown: number;
    chapter: number;
    srCount: number;
    power: number;
    controlPercent: (key: string) => number;
  },
): { unlocked: boolean; reason: string | null } {
  const unlock = (region.unlock ?? {}) as { nodeKey?: string; chapter?: number; renown?: number; power?: number; charKey?: string; minSrCharacters?: number; controlPercent?: number };
  if (unlock.nodeKey && !ctx.clearedKeys.has(unlock.nodeKey)) {
    const parent = NODE_BY_KEY.get(unlock.nodeKey);
    return { unlocked: false, reason: `需先通关：${parent?.name ?? unlock.nodeKey}` };
  }
  if (unlock.chapter && ctx.chapter < unlock.chapter) return { unlocked: false, reason: `需完成第 ${unlock.chapter} 章` };
  if (unlock.renown && ctx.renown < unlock.renown) return { unlocked: false, reason: `需声望 ≥ ${unlock.renown}` };
  if (unlock.minSrCharacters && ctx.srCount < unlock.minSrCharacters) return { unlocked: false, reason: `需拥有 ${unlock.minSrCharacters} 名 SR 及以上角色` };
  if (unlock.power && ctx.power < unlock.power) return { unlocked: false, reason: `需队伍战力 ≥ ${unlock.power}` };
  if (unlock.controlPercent) {
    const current = ctx.controlPercent("silverpine");
    if (current < unlock.controlPercent) return { unlocked: false, reason: `需银杉边境控制度 ≥ ${unlock.controlPercent}%` };
  }
  return { unlocked: true, reason: null };
}

/* ====================== 任务与剧情标记 ====================== */

export async function ensureQuests(profileId: number) {
  const db = await getDb();
  if (!db) return [];
  const existing = await db.select().from(profileQuests).where(eq(profileQuests.profileId, profileId));
  const existingKeys = new Set(existing.map((q) => q.questKey));
  const allQuests = await db.select().from(quests);
  const toCreate = allQuests.filter((q) => !existingKeys.has(q.questKey));
  if (toCreate.length > 0) {
    await db.insert(profileQuests).values(
      toCreate.map((q) => {
        const pre = (q.prerequisite ?? {}) as { questKey?: string };
        const locked = Boolean(pre.questKey);
        return {
          profileId,
          questKey: q.questKey,
          status: (locked ? "locked" : "active") as "locked" | "active",
          progress: {} as Record<string, number>,
        };
      }),
    );
  }
  return db.select().from(profileQuests).where(eq(profileQuests.profileId, profileId));
}

export async function getStoryFlags(profileId: number) {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(profileStoryFlags).where(eq(profileStoryFlags.profileId, profileId));
  return Object.fromEntries(rows.map((r) => [r.flagKey, r.value]));
}

export async function setStoryFlag(profileId: number, flagKey: string, value: unknown = true) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(profileStoryFlags)
    .values({ profileId, flagKey, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

/* ====================== 战力与配置读取 ====================== */

export async function loadWorldNode(nodeKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(worldNodes).where(eq(worldNodes.nodeKey, nodeKey)).limit(1);
  return rows[0];
}

export async function loadEquipConfig(equipKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(equipments).where(eq(equipments.equipKey, equipKey)).limit(1);
  return rows[0];
}

/* ====================== 角色成长 ====================== */

/** 角色升级（消耗经验药水或战斗经验；此处用于战斗结算与后台调整） */
export async function applyCharacterExp(playerCharId: number, gainedExp: number) {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select().from(playerCharacters).where(eq(playerCharacters.id, playerCharId)).limit(1);
  if (!row) return null;
  const maxLevel = MAX_LEVEL_BY_ASCENSION(row.ascension);
  const result = applyExp(row.level, row.exp, gainedExp, maxLevel);
  await db
    .update(playerCharacters)
    .set({ level: result.level, exp: result.exp })
    .where(eq(playerCharacters.id, playerCharId));
  return result;
}

/** 角色属性预览（GM 后台与角色详情页共用） */
export function previewStats(config: CharacterConfig, level: number, ascension = 0) {
  const stats = statsAtLevel(config.baseStats as Partial<StatBlock>, config.growth, level, ascension);
  return { stats, power: powerRating(stats), maxLevel: MAX_LEVEL_BY_ASCENSION(ascension) };
}

export function singleStatAtLevel(config: CharacterConfig, key: keyof StatBlock, level: number, ascension = 0) {
  return statAtLevel(Number((config.baseStats as Record<string, number>)[key] ?? 0), config.growth, level, ascension);
}
