import {
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/* =============================================================================
 * 《裂隙纪元》Aetherfall Chronicle — 数据模型
 * 六大域：账号与安全 / 策划配置 / 玩家存档 / 战斗 / AI / 运维
 * 设计原则：
 *  1) 策划配置表 与 玩家存档表 严格分离
 *  2) 玩家存档只存「引用键 + 快照」，策划数据变更不破坏已有存档
 *  3) 数值、概率、保底、掉落一律落库，前端不可覆盖
 * ========================================================================== */

/* ----------------------------- 账号与安全 ----------------------------- */

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  passwordHash: varchar("passwordHash", { length: 255 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** 会员状态：free / supporter（会员仅影响便利性，不影响战斗数值公平性） */
  membership: mysqlEnum("membership", ["free", "supporter"]).default("free").notNull(),
  membershipExpiresAt: timestamp("membershipExpiresAt"),
  banned: boolean("banned").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** 玩家自建 API Token（仅存哈希，明文只返回一次） */
export const apiTokens = mysqlTable(
  "apiTokens",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    name: varchar("name", { length: 96 }).notNull(),
    tokenPrefix: varchar("tokenPrefix", { length: 16 }).notNull(),
    tokenHash: varchar("tokenHash", { length: 128 }).notNull(),
    scopes: json("scopes").$type<string[]>().notNull(),
    expiresAt: timestamp("expiresAt"),
    lastUsedAt: timestamp("lastUsedAt"),
    revokedAt: timestamp("revokedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_api_tokens_user").on(t.userId), uniqueIndex("uq_api_tokens_hash").on(t.tokenHash)],
);

/** GM 后台操作审计 */
export const adminAuditLogs = mysqlTable(
  "adminAuditLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    adminUserId: int("adminUserId").notNull(),
    adminName: varchar("adminName", { length: 128 }),
    action: varchar("action", { length: 128 }).notNull(),
    targetType: varchar("targetType", { length: 64 }).notNull(),
    targetKey: varchar("targetKey", { length: 128 }),
    payload: json("payload").$type<Record<string, unknown>>(),
    result: mysqlEnum("result", ["ok", "failed"]).default("ok").notNull(),
    ip: varchar("ip", { length: 64 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_audit_admin").on(t.adminUserId), index("idx_audit_target").on(t.targetType, t.targetKey)],
);

/* ----------------------------- 策划配置 ----------------------------- */

export const characters = mysqlTable(
  "characters",
  {
    id: int("id").autoincrement().primaryKey(),
    charKey: varchar("charKey", { length: 64 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    title: varchar("title", { length: 96 }).notNull(),
    rarity: mysqlEnum("rarity", ["R", "SR", "SSR"]).notNull(),
    job: mysqlEnum("job", ["warrior", "knight", "mage", "ranger", "cleric", "assassin", "sage"]).notNull(),
    race: varchar("race", { length: 32 }).notNull(),
    weapon: varchar("weapon", { length: 64 }).notNull(),
    element: mysqlEnum("element", ["physical", "fire", "frost", "lightning", "holy", "shadow"]).notNull(),
    faction: varchar("faction", { length: 48 }).notNull(),
    /** 立绘 / 头像（S3 路径或外链） */
    portraitUrl: text("portraitUrl"),
    avatarUrl: text("avatarUrl"),
    intro: text("intro"),
    appearance: text("appearance"),
    background: text("background"),
    personality: text("personality"),
    goal: text("goal"),
    /** 台词：{ battle: string[], idle: string[], bond: string[] } */
    quotes: json("quotes").$type<Record<string, string[]>>().notNull(),
    skillKeys: json("skillKeys").$type<string[]>().notNull(),
    /** 基础属性：{ hp, atk, def, mag, res, spd, crit, critDmg, hit, dodge } */
    baseStats: json("baseStats").$type<Record<string, number>>().notNull(),
    /** 成长：{ curve: number, growth: number } */
    growth: json("growth").$type<{ curve: number; growth: number }>().notNull(),
    /** 关系网：[{ charKey, relation, note }] */
    relations: json("relations").$type<Array<Record<string, string>>>().notNull(),
    /** 内容分级自检标记（全年龄向合规） */
    contentRating: varchar("contentRating", { length: 16 }).default("all-ages").notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"]).default("draft").notNull(),
    inRecruitPool: boolean("inRecruitPool").default(true).notNull(),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_characters_key").on(t.charKey), index("idx_characters_status").on(t.status)],
);

export const skills = mysqlTable(
  "skills",
  {
    id: int("id").autoincrement().primaryKey(),
    skillKey: varchar("skillKey", { length: 64 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    job: mysqlEnum("job", ["warrior", "knight", "mage", "ranger", "cleric", "assassin", "sage", "any"]).default("any").notNull(),
    element: mysqlEnum("element", ["physical", "fire", "frost", "lightning", "holy", "shadow"]).notNull(),
    kind: mysqlEnum("kind", ["active", "passive"]).default("active").notNull(),
    targetType: mysqlEnum("targetType", ["self", "ally", "all_allies", "enemy", "all_enemies"]).notNull(),
    /** 基础倍率（伤害/治疗） */
    power: int("power").default(100).notNull(),
    /** 等级成长（每级 +% ） */
    powerPerLevel: int("powerPerLevel").default(6).notNull(),
    cooldown: int("cooldown").default(0).notNull(),
    energyCost: int("energyCost").default(0).notNull(),
    maxLevel: int("maxLevel").default(5).notNull(),
    description: text("description"),
    /** 效果列表：[{ type, value, duration, chance }] */
    effects: json("effects").$type<Array<Record<string, unknown>>>().notNull(),
    iconKey: varchar("iconKey", { length: 32 }),
    status: mysqlEnum("status", ["draft", "published", "archived"]).default("published").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_skills_key").on(t.skillKey)],
);

export const equipments = mysqlTable(
  "equipments",
  {
    id: int("id").autoincrement().primaryKey(),
    equipKey: varchar("equipKey", { length: 64 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    slot: mysqlEnum("slot", ["weapon", "offhand", "helmet", "armor", "boots", "accessory"]).notNull(),
    rarity: mysqlEnum("rarity", ["R", "SR", "SSR"]).default("R").notNull(),
    requiredLevel: int("requiredLevel").default(1).notNull(),
    /** 属性加成：{ hp, atk, def, mag, res, spd, crit, critDmg } */
    stats: json("stats").$type<Record<string, number>>().notNull(),
    setKey: varchar("setKey", { length: 48 }),
    description: text("description"),
    iconKey: varchar("iconKey", { length: 32 }),
    /** 每级强化加成系数 */
    upgradeRate: int("upgradeRate").default(8).notNull(),
    maxLevel: int("maxLevel").default(10).notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"]).default("published").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_equipments_key").on(t.equipKey)],
);

export const buildings = mysqlTable(
  "buildings",
  {
    id: int("id").autoincrement().primaryKey(),
    buildingKey: varchar("buildingKey", { length: 48 }).notNull(),
    name: varchar("name", { length: 48 }).notNull(),
    category: mysqlEnum("category", ["economy", "military", "research", "governance"]).notNull(),
    maxLevel: int("maxLevel").default(10).notNull(),
    /** 每级配置：[{ level, cost:{gold,food,wood,iron,aether}, produce:{...}, seconds, unlock, description }] */
    levels: json("levels").$type<Array<Record<string, unknown>>>().notNull(),
    description: text("description"),
    iconKey: varchar("iconKey", { length: 32 }),
    /** 主城界面热点坐标（百分比） */
    hotspotX: int("hotspotX").default(50).notNull(),
    hotspotY: int("hotspotY").default(50).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"]).default("published").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_buildings_key").on(t.buildingKey)],
);

export const regions = mysqlTable(
  "regions",
  {
    id: int("id").autoincrement().primaryKey(),
    regionKey: varchar("regionKey", { length: 48 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    subtitle: varchar("subtitle", { length: 96 }),
    dangerTier: int("dangerTier").default(1).notNull(),
    faction: varchar("faction", { length: 48 }),
    description: text("description"),
    /** 手绘地图上的蜡封坐标（百分比） */
    mapX: int("mapX").default(50).notNull(),
    mapY: int("mapY").default(50).notNull(),
    artUrl: text("artUrl"),
    /** 解锁条件：{ chapter, nodeKey, renown, power, charKey } */
    unlock: json("unlock").$type<Record<string, unknown>>().notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"]).default("published").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_regions_key").on(t.regionKey)],
);

export const worldNodes = mysqlTable(
  "worldNodes",
  {
    id: int("id").autoincrement().primaryKey(),
    nodeKey: varchar("nodeKey", { length: 64 }).notNull(),
    regionKey: varchar("regionKey", { length: 48 }).notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    nodeType: mysqlEnum("nodeType", ["village", "town", "fort", "ruin", "wild", "rift", "trade"]).notNull(),
    levelMin: int("levelMin").default(1).notNull(),
    levelMax: int("levelMax").default(5).notNull(),
    /** 敌人波次：[{ name, job, element, stats:{...}, rarity }] */
    enemyWave: json("enemyWave").$type<Array<Record<string, unknown>>>().notNull(),
    /** 奖励：{ gold, exp, aether, renown, items:[{equipKey,chance}], charKey } */
    rewards: json("rewards").$type<Record<string, unknown>>().notNull(),
    firstClearRewards: json("firstClearRewards").$type<Record<string, unknown>>().notNull(),
    /** 解锁：{ nodeKey, chapter, level } */
    unlock: json("unlock").$type<Record<string, unknown>>().notNull(),
    storyKey: varchar("storyKey", { length: 64 }),
    /** 贸易产出（每小时） */
    tradeYield: json("tradeYield").$type<Record<string, number>>().notNull(),
    controlWeight: int("controlWeight").default(1).notNull(),
    requiredClears: int("requiredClears").default(3).notNull(),
    staminaCost: int("staminaCost").default(5).notNull(),
    mapX: int("mapX").default(50).notNull(),
    mapY: int("mapY").default(50).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"]).default("published").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_world_nodes_key").on(t.nodeKey), index("idx_world_nodes_region").on(t.regionKey)],
);

export const quests = mysqlTable(
  "quests",
  {
    id: int("id").autoincrement().primaryKey(),
    questKey: varchar("questKey", { length: 64 }).notNull(),
    name: varchar("name", { length: 96 }).notNull(),
    chapter: int("chapter").default(1).notNull(),
    questType: mysqlEnum("questType", ["main", "side", "daily"]).default("main").notNull(),
    description: text("description"),
    /** 目标：[{ type, key, count, label }] */
    objectives: json("objectives").$type<Array<Record<string, unknown>>>().notNull(),
    rewards: json("rewards").$type<Record<string, unknown>>().notNull(),
    prerequisite: json("prerequisite").$type<Record<string, unknown>>().notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"]).default("published").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_quests_key").on(t.questKey)],
);

export const storyScenes = mysqlTable(
  "storyScenes",
  {
    id: int("id").autoincrement().primaryKey(),
    sceneKey: varchar("sceneKey", { length: 64 }).notNull(),
    chapter: int("chapter").default(1).notNull(),
    title: varchar("title", { length: 128 }).notNull(),
    /** 触发：{ questKey, nodeKey, buildingKey, chapter } */
    trigger: json("trigger").$type<Record<string, unknown>>().notNull(),
    /** 段落：[{ speaker, charKey, text, emotion, bg }] */
    beats: json("beats").$type<Array<Record<string, unknown>>>().notNull(),
    /** 选项：[{ text, flags:{}, rewards:{}, reply }] */
    choices: json("choices").$type<Array<Record<string, unknown>>>().notNull(),
    unlockFlags: json("unlockFlags").$type<string[]>().notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"]).default("published").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_story_scenes_key").on(t.sceneKey)],
);

export const recruitPools = mysqlTable(
  "recruitPools",
  {
    id: int("id").autoincrement().primaryKey(),
    poolKey: varchar("poolKey", { length: 48 }).notNull(),
    name: varchar("name", { length: 96 }).notNull(),
    poolType: mysqlEnum("poolType", ["normal", "rare", "event"]).default("normal").notNull(),
    description: text("description"),
    bannerUrl: text("bannerUrl"),
    /** 概率：[{ rarity:"SSR", rate: 0.03 }, ...] —— 服务端权威 */
    rates: json("rates").$type<Array<{ rarity: string; rate: number }>>().notNull(),
    /** 保底：{ softStart, softStep, hardPity, guaranteedRarity, tenPullMinRarity } */
    pity: json("pity").$type<Record<string, number | string>>().notNull(),
    costSingle: int("costSingle").default(1).notNull(),
    costTen: int("costTen").default(10).notNull(),
    currency: varchar("currency", { length: 24 }).default("aether").notNull(),
    /** 限定角色池；为空则使用全部在池角色 */
    characterKeys: json("characterKeys").$type<string[]>().notNull(),
    openAt: timestamp("openAt"),
    closeAt: timestamp("closeAt"),
    enabled: boolean("enabled").default(true).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_recruit_pools_key").on(t.poolKey)],
);

/** 领地随机/触发事件（故事化的资源抉择） */
export const domainEvents = mysqlTable(
  "domainEvents",
  {
    id: int("id").autoincrement().primaryKey(),
    eventKey: varchar("eventKey", { length: 64 }).notNull(),
    title: varchar("title", { length: 96 }).notNull(),
    category: mysqlEnum("category", ["economy", "people", "military", "diplomacy", "rift"]).default("people").notNull(),
    description: text("description"),
    /** 选项：[{ label, effect:{gold,food,...}, renown, flags:[] }] */
    choices: json("choices").$type<Array<Record<string, unknown>>>().notNull(),
    minKeepLevel: int("minKeepLevel").default(1).notNull(),
    weight: int("weight").default(10).notNull(),
    once: boolean("once").default(false).notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"]).default("published").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_domain_events_key").on(t.eventKey)],
);

/* ----------------------------- 玩家存档 ----------------------------- */

export const gameProfiles = mysqlTable(
  "gameProfiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    lordName: varchar("lordName", { length: 32 }).notNull(),
    keepName: varchar("keepName", { length: 48 }).default("灰隼堡").notNull(),
    introCompleted: boolean("introCompleted").default(false).notNull(),
    playerGivenName: varchar("playerGivenName", { length: 32 }),
    playerFamilyName: varchar("playerFamilyName", { length: 32 }).default("瓦尔登"),
    familyNameChanged: boolean("familyNameChanged").default(false).notNull(),
    avatarKey: varchar("avatarKey", { length: 32 }),
    gold: int("gold").default(800).notNull(),
    food: int("food").default(500).notNull(),
    wood: int("wood").default(600).notNull(),
    iron: int("iron").default(200).notNull(),
    /** 新档案给予一次最高卡池硬保底所需的星辉。 */
    aether: int("aether").default(1800).notNull(),
    /** 建筑离线星辉的微单位余数，避免低产出被频繁刷新时的取整吞掉。 */
    aetherAccrualMicros: int("aetherAccrualMicros").default(0).notNull(),
    /** 商队星辉的微单位余数，与建筑结算独立保存。 */
    aetherTradeMicros: int("aetherTradeMicros").default(0).notNull(),
    /** 招募重复角色转化的信物，与招募消耗的星辉分离计算 */
    recruitShards: int("recruitShards").default(0).notNull(),
    renown: int("renown").default(20).notNull(),
	    stamina: int("stamina").default(80).notNull(),
	    staminaMax: int("staminaMax").default(80).notNull(),
	    staminaUpdatedAt: timestamp("staminaUpdatedAt").defaultNow().notNull(),
	    /** 会员每日权益计数按 UTC 日期轮换，服务端权威校验 */
	    membershipDayKey: varchar("membershipDayKey", { length: 16 }).default("").notNull(),
	    staminaResetUses: int("staminaResetUses").default(0).notNull(),
	    tradeRushUses: int("tradeRushUses").default(0).notNull(),
	    tradeAutoDispatch: boolean("tradeAutoDispatch").default(false).notNull(),
	    keepLevel: int("keepLevel").default(1).notNull(),
    keepExp: int("keepExp").default(0).notNull(),
    chapter: int("chapter").default(1).notNull(),
    /** 服务器权威的离线结算锚点 */
    lastTickAt: timestamp("lastTickAt").defaultNow().notNull(),
    /** 待处理领地事件（事件 key 列表） */
    pendingEvents: json("pendingEvents").$type<string[]>().notNull(),
    /** 玩家设置（仅 UI 偏好，不影响存档完整性） */
    settings: json("settings").$type<Record<string, unknown>>().notNull(),
    tutorialStep: int("tutorialStep").default(0).notNull(),
    totalPlaySeconds: int("totalPlaySeconds").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_game_profiles_user").on(t.userId)],
);

export type GameProfile = typeof gameProfiles.$inferSelect;

export const playerCharacters = mysqlTable(
  "playerCharacters",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profileId").notNull(),
    charKey: varchar("charKey", { length: 64 }).notNull(),
    level: int("level").default(1).notNull(),
    exp: int("exp").default(0).notNull(),
    /** 突破阶数（提升等级上限与成长率） */
    ascension: int("ascension").default(0).notNull(),
    /** 技能等级：{ skillKey: level } */
    skillLevels: json("skillLevels").$type<Record<string, number>>().notNull(),
    bondLevel: int("bondLevel").default(1).notNull(),
    bondExp: int("bondExp").default(0).notNull(),
    /** 好感关系：-100..100（仅正向互动生效，不影响战斗） */
    affection: int("affection").default(0).notNull(),
    /** 装备槽：{ weapon: playerEquipId, ... } */
    equipped: json("equipped").$type<Record<string, number>>().notNull(),
    /** 剧情状态：角色个人剧情进度与标记 */
    storyState: json("storyState").$type<Record<string, unknown>>().notNull(),
    obtainedVia: varchar("obtainedVia", { length: 32 }).default("recruit").notNull(),
    isNew: boolean("isNew").default(true).notNull(),
    locked: boolean("locked").default(false).notNull(),
    obtainedAt: timestamp("obtainedAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [
    uniqueIndex("uq_player_characters").on(t.profileId, t.charKey),
    index("idx_player_characters_profile").on(t.profileId),
  ],
);

export type PlayerCharacter = typeof playerCharacters.$inferSelect;

export const playerEquipments = mysqlTable(
  "playerEquipments",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profileId").notNull(),
    equipKey: varchar("equipKey", { length: 64 }).notNull(),
    level: int("level").default(1).notNull(),
    quantity: int("quantity").default(1).notNull(),
    /** 被哪名角色装备（playerCharacters.id），未装备为 null */
    equippedBy: int("equippedBy"),
    equippedSlot: varchar("equippedSlot", { length: 24 }),
    /** 强化数据（含随机词条，服务端生成） */
    rolls: json("rolls").$type<Record<string, number>>().notNull(),
    source: varchar("source", { length: 32 }).default("battle").notNull(),
    acquiredAt: timestamp("acquiredAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_player_equipments_profile").on(t.profileId), index("idx_player_equipments_key").on(t.equipKey)],
);

export type PlayerEquipment = typeof playerEquipments.$inferSelect;

export const teams = mysqlTable(
  "teams",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profileId").notNull(),
    name: varchar("name", { length: 32 }).default("远征队").notNull(),
    slotIndex: int("slotIndex").default(0).notNull(),
    /** 上阵角色 playerCharacters.id 列表（最多 4） */
    memberIds: json("memberIds").$type<number[]>().notNull(),
    /** 阵型：前/后排分配 { memberId: 'front'|'back' } */
    formation: json("formation").$type<Record<string, string>>().notNull(),
    isActive: boolean("isActive").default(false).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_teams_profile").on(t.profileId)],
);

export const profileBuildings = mysqlTable(
  "profileBuildings",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profileId").notNull(),
    buildingKey: varchar("buildingKey", { length: 48 }).notNull(),
    level: int("level").default(0).notNull(),
    upgradingTo: int("upgradingTo"),
    upgradeDoneAt: timestamp("upgradeDoneAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_profile_buildings").on(t.profileId, t.buildingKey)],
);

export const regionStates = mysqlTable(
  "regionStates",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profileId").notNull(),
    regionKey: varchar("regionKey", { length: 48 }).notNull(),
    unlocked: boolean("unlocked").default(false).notNull(),
    controlledNodes: int("controlledNodes").default(0).notNull(),
    totalNodes: int("totalNodes").default(0).notNull(),
    controlPercent: int("controlPercent").default(0).notNull(),
    tradeActive: boolean("tradeActive").default(false).notNull(),
    tradeStartedAt: timestamp("tradeStartedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_region_states").on(t.profileId, t.regionKey)],
);

export const nodeStates = mysqlTable(
  "nodeStates",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profileId").notNull(),
    nodeKey: varchar("nodeKey", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["locked", "available", "cleared", "conquered"]).default("locked").notNull(),
    clearCount: int("clearCount").default(0).notNull(),
    firstClearedAt: timestamp("firstClearedAt"),
    lastClearedAt: timestamp("lastClearedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_node_states").on(t.profileId, t.nodeKey)],
);

export const profileQuests = mysqlTable(
  "profileQuests",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profileId").notNull(),
    questKey: varchar("questKey", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["locked", "active", "completed", "claimed"]).default("locked").notNull(),
    /** 进度：{ objectiveIndex: count } */
    progress: json("progress").$type<Record<string, number>>().notNull(),
    completedAt: timestamp("completedAt"),
    claimedAt: timestamp("claimedAt"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_profile_quests").on(t.profileId, t.questKey)],
);

export const profileStoryFlags = mysqlTable(
  "profileStoryFlags",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profileId").notNull(),
    flagKey: varchar("flagKey", { length: 96 }).notNull(),
    value: json("value").$type<unknown>().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_profile_story_flags").on(t.profileId, t.flagKey)],
);

/** 抽卡保底计数器（服务端权威） */
export const profilePity = mysqlTable(
  "profilePity",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profileId").notNull(),
    poolKey: varchar("poolKey", { length: 48 }).notNull(),
    totalPulls: int("totalPulls").default(0).notNull(),
    pullsSinceSSR: int("pullsSinceSSR").default(0).notNull(),
    pullsSinceSR: int("pullsSinceSR").default(0).notNull(),
    guaranteedSSR: boolean("guaranteedSSR").default(false).notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [uniqueIndex("uq_profile_pity").on(t.profileId, t.poolKey)],
);

export const recruitHistories = mysqlTable(
  "recruitHistories",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profileId").notNull(),
    poolKey: varchar("poolKey", { length: 48 }).notNull(),
    charKey: varchar("charKey", { length: 64 }).notNull(),
    rarity: mysqlEnum("rarity", ["R", "SR", "SSR"]).notNull(),
    isNew: boolean("isNew").default(false).notNull(),
    shards: int("shards").default(0).notNull(),
    pityTriggered: boolean("pityTriggered").default(false).notNull(),
    rollIndex: int("rollIndex").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_recruit_histories_profile").on(t.profileId, t.createdAt)],
);

/* ----------------------------- 战斗 ----------------------------- */

export const battles = mysqlTable(
  "battles",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profileId").notNull(),
    nodeKey: varchar("nodeKey", { length: 64 }).notNull(),
    regionKey: varchar("regionKey", { length: 48 }).notNull(),
    teamId: int("teamId"),
    reserveUsed: boolean("reserveUsed").default(false).notNull(),
    status: mysqlEnum("status", ["active", "won", "lost", "fled"]).default("active").notNull(),
    turn: int("turn").default(1).notNull(),
    /** 战斗状态快照（服务端权威，含单位、行动序、能量、冷却） */
    state: json("state").$type<Record<string, unknown>>().notNull(),
    log: json("log").$type<Array<Record<string, unknown>>>().notNull(),
    rewards: json("rewards").$type<Record<string, unknown>>().notNull(),
    stars: int("stars").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    finishedAt: timestamp("finishedAt"),
  },
  (t) => [index("idx_battles_profile").on(t.profileId, t.status)],
);

export const battleLogs = mysqlTable(
  "battleLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    battleId: int("battleId").notNull(),
    profileId: int("profileId").notNull(),
    turn: int("turn").notNull(),
    actorKey: varchar("actorKey", { length: 64 }),
    actionKey: varchar("actionKey", { length: 64 }),
    /** 事件明细：[{ type:'damage', target, value, element, crit }] */
    events: json("events").$type<Array<Record<string, unknown>>>().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_battle_logs_battle").on(t.battleId)],
);

/* ----------------------------- AI ----------------------------- */

export const aiConfigs = mysqlTable(
  "aiConfigs",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 64 }).notNull(),
    /** OpenAI 兼容 Base URL，例如 https://api.openai.com/v1 */
    baseUrl: varchar("baseUrl", { length: 255 }).notNull(),
    /** AES-256-GCM 加密后的 API Key（禁止明文落库/落前端） */
    apiKeyCipher: text("apiKeyCipher"),
    apiKeyHint: varchar("apiKeyHint", { length: 32 }),
    model: varchar("model", { length: 96 }),
    temperature: int("temperature").default(80).notNull(),
    maxTokens: int("maxTokens").default(900).notNull(),
    /** 追加系统提示（世界规则/NPC 行为边界，全年龄向约束） */
    systemPrompt: text("systemPrompt"),
    jsonStrict: boolean("jsonStrict").default(true).notNull(),
    useBuiltInGateway: boolean("useBuiltInGateway").default(false).notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    isActive: boolean("isActive").default(false).notNull(),
    lastTestAt: timestamp("lastTestAt"),
    lastTestStatus: varchar("lastTestStatus", { length: 32 }),
    updatedBy: int("updatedBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_ai_configs_active").on(t.isActive)],
);

export const aiModels = mysqlTable(
  "aiModels",
  {
    id: int("id").autoincrement().primaryKey(),
    configId: int("configId").notNull(),
    modelId: varchar("modelId", { length: 128 }).notNull(),
    label: varchar("label", { length: 128 }),
    ownedBy: varchar("ownedBy", { length: 64 }),
    isDefault: boolean("isDefault").default(false).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_ai_models").on(t.configId, t.modelId)],
);

export const aiConversations = mysqlTable(
  "aiConversations",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profileId").notNull(),
    title: varchar("title", { length: 96 }).notNull(),
    sceneKey: varchar("sceneKey", { length: 64 }).default("council").notNull(),
    /** 在场角色 charKey 白名单（只有这些角色可以发言/行动） */
    presentCharKeys: json("presentCharKeys").$type<string[]>().notNull(),
    /** 玩家选中的发言者（可为空 = 玩家对全体说话） */
    activeCharKey: varchar("activeCharKey", { length: 64 }),
    turnCount: int("turnCount").default(0).notNull(),
    status: mysqlEnum("status", ["open", "closed"]).default("open").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_ai_conversations_profile").on(t.profileId)],
);

export const aiMessages = mysqlTable(
  "aiMessages",
  {
    id: int("id").autoincrement().primaryKey(),
    conversationId: int("conversationId").notNull(),
    profileId: int("profileId").notNull(),
    role: mysqlEnum("role", ["player", "character", "narrator", "system"]).notNull(),
    charKey: varchar("charKey", { length: 64 }),
    content: text("content").notNull(),
    /** 结构化输出原样保存（turns/actions/mood） */
    structured: json("structured").$type<Record<string, unknown>>(),
    source: mysqlEnum("source", ["ai", "fallback", "system"]).default("ai").notNull(),
    tokens: int("tokens").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_ai_messages_conversation").on(t.conversationId, t.createdAt)],
);

/** AI 调用记录（含 Schema 违规统计与用量） */
export const aiCallLogs = mysqlTable(
  "aiCallLogs",
  {
    id: int("id").autoincrement().primaryKey(),
    profileId: int("profileId").notNull(),
    conversationId: int("conversationId"),
    configId: int("configId"),
    model: varchar("model", { length: 128 }),
    endpoint: varchar("endpoint", { length: 255 }),
    status: mysqlEnum("status", ["ok", "schema_violation", "http_error", "timeout", "fallback", "rejected"]).notNull(),
    httpStatus: int("httpStatus"),
    latencyMs: int("latencyMs").default(0).notNull(),
    promptTokens: int("promptTokens").default(0).notNull(),
    completionTokens: int("completionTokens").default(0).notNull(),
    presentCharKeys: json("presentCharKeys").$type<string[]>().notNull(),
    violationCount: int("violationCount").default(0).notNull(),
    errorMessage: text("errorMessage"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [index("idx_ai_call_logs_created").on(t.createdAt), index("idx_ai_call_logs_profile").on(t.profileId)],
);

/* ----------------------------- 运维 ----------------------------- */

export const backupRecords = mysqlTable(
  "backupRecords",
  {
    id: int("id").autoincrement().primaryKey(),
    backupKey: varchar("backupKey", { length: 64 }).notNull(),
    scope: mysqlEnum("scope", ["full", "profile", "config"]).default("full").notNull(),
    targetProfileId: int("targetProfileId"),
    filename: varchar("filename", { length: 160 }).notNull(),
    fileUrl: text("fileUrl"),
    fileKey: text("fileKey"),
    sizeBytes: int("sizeBytes").default(0).notNull(),
    checksum: varchar("checksum", { length: 80 }),
    /** 记录数量统计：{ table: count } */
    recordCounts: json("recordCounts").$type<Record<string, number>>().notNull(),
    status: mysqlEnum("status", ["pending", "completed", "failed", "restored"]).default("pending").notNull(),
    note: text("note"),
    errorMessage: text("errorMessage"),
    createdBy: int("createdBy"),
    restoredAt: timestamp("restoredAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_backup_records_key").on(t.backupKey)],
);

/** 数据级迁移记录（结构迁移由 drizzle-kit 负责） */
export const dataMigrations = mysqlTable(
  "dataMigrations",
  {
    id: int("id").autoincrement().primaryKey(),
    migrationKey: varchar("migrationKey", { length: 96 }).notNull(),
    note: text("note"),
    appliedAt: timestamp("appliedAt").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("uq_data_migrations_key").on(t.migrationKey)],
);
