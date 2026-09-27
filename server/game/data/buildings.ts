/**
 * 领地建筑配置（7 座，每座 10 级）
 * 等级配置在构建时确定性生成，运行时落库到 buildings 表；GM 后台可逐级覆盖。
 */

export type BuildingSeed = {
  buildingKey: string;
  name: string;
  category: "economy" | "military" | "research" | "governance";
  maxLevel: number;
  description: string;
  iconKey: string;
  hotspotX: number;
  hotspotY: number;
  sortOrder: number;
  levels: Array<Record<string, unknown>>;
};

type BuildingBase = {
  key: string;
  name: string;
  category: BuildingSeed["category"];
  description: string;
  iconKey: string;
  hotspotX: number;
  hotspotY: number;
  cost: { gold: number; wood: number; iron: number; aether?: number; food?: number };
  produce?: { gold?: number; food?: number; wood?: number; iron?: number; aether?: number };
  /** 星辉按日配置，运行时换算为每小时小数，避免高等级产出失控。 */
  aetherPerDay?: number[];
  hours: number;
  unlocks?: Record<number, string>;
  effects?: Record<number, string>;
};

const round = (v: number) => Math.round(v);

function buildLevels(base: BuildingBase, maxLevel = 10) {
  const levels: Array<Record<string, unknown>> = [];
  for (let level = 1; level <= maxLevel; level += 1) {
    const growthCost = Math.pow(1.52, level - 1);
    const growthTime = Math.pow(1.34, level - 1);
    const growthProduce = Math.pow(level, 1.28);
    const cost: Record<string, number> = {
      gold: round(base.cost.gold * growthCost),
      wood: round(base.cost.wood * growthCost),
      iron: round(base.cost.iron * growthCost),
    };
    if (base.cost.aether) cost.aether = round(base.cost.aether * growthCost);
    if (base.cost.food) cost.food = round(base.cost.food * growthCost);

    const produce: Record<string, number> = {};
    if (base.produce) {
      for (const [key, value] of Object.entries(base.produce)) {
        if (value) produce[key] = round(value * growthProduce);
      }
    }
    if (base.aetherPerDay) produce.aether = base.aetherPerDay[level - 1] / 24;

    levels.push({
      level,
      cost,
      produce,
      seconds: round(base.hours * 3600 * growthTime),
      unlock: base.unlocks?.[level] ?? null,
      effect: base.effects?.[level] ?? null,
    });
  }
  return levels;
}

const BASES: BuildingBase[] = [
  {
    key: "tavern",
    name: "酒馆",
    category: "governance",
    description: "边境消息最灵通的地方。升级可提高招募席位与星辉收入，并解锁更多同伴的自我介绍。",
    iconKey: "tavern",
    hotspotX: 30,
    hotspotY: 58,
    cost: { gold: 260, wood: 220, iron: 60 },
    produce: { gold: 6 },
    aetherPerDay: [0.8, 1.1, 1.5, 1.8, 2, 2.4, 2.8, 3.2, 3.6, 4],
    hours: 0.25,
    unlocks: { 1: "开启招募大厅", 3: "解锁稀有招募池", 5: "解锁活动招募池", 7: "招募折扣 10%" },
    effects: { 2: "羁绊互动获得额外羁绊经验", 6: "每 12 小时获得一次免费单抽" },
  },
  {
    key: "barracks",
    name: "兵营",
    category: "military",
    description: "训练与整编远征队的场所。升级提升队伍上限、体力上限与远征攻防加成。",
    iconKey: "barracks",
    hotspotX: 44,
    hotspotY: 70,
    cost: { gold: 300, wood: 260, iron: 120 },
    produce: { iron: 3, food: -4 },
    hours: 0.3,
    unlocks: { 1: "开启队伍编成", 2: "解锁第二支远征队", 4: "解锁第三支远征队", 6: "解锁第四支远征队" },
    effects: { 3: "远征全队攻击 +4%", 5: "远征全队防御 +4%", 8: "远征全队生命 +6%" },
  },
  {
    key: "workshop",
    name: "工坊",
    category: "economy",
    description: "锻造与修理装备的地方。升级提高装备强化上限与掉落品质。",
    iconKey: "workshop",
    hotspotX: 58,
    hotspotY: 60,
    cost: { gold: 280, wood: 200, iron: 160 },
    produce: { iron: 5, wood: -3 },
    hours: 0.3,
    unlocks: { 1: "开启装备强化", 3: "提高精良装备掉落率", 5: "解锁套装重铸" },
    effects: { 4: "战斗掉落额外获得 1 件装备（概率 20%）", 8: "装备掉落稀有度 +1 阶（概率 10%）" },
  },
  {
    key: "library",
    name: "图书馆",
    category: "research",
    description: "保存残卷与抄本的研究场所。升级提高技能研习效率，并解锁更多角色对话场景。",
    iconKey: "library",
    hotspotX: 70,
    hotspotY: 46,
    cost: { gold: 320, wood: 300, iron: 80, aether: 10 },
    produce: {},
    aetherPerDay: [1.2, 1.6, 2, 2.5, 3, 3.6, 4.2, 4.8, 5.4, 6],
    hours: 0.35,
    unlocks: { 1: "开启技能研习", 2: "解锁议事厅会议场景", 4: "解锁篝火夜谈场景", 6: "解锁战后复盘场景" },
    effects: { 3: "技能研习消耗 -8%", 7: "AI 对话可引用更多剧情状态" },
  },
  {
    key: "council",
    name: "议事厅",
    category: "governance",
    description: "处理政务与外交的地方。升级提高声望产出、任务席位与事件处理上限。",
    iconKey: "council",
    hotspotX: 40,
    hotspotY: 40,
    cost: { gold: 340, wood: 280, iron: 90 },
    produce: { gold: 10 },
    hours: 0.4,
    unlocks: { 1: "开启任务板与领地事件", 3: "解锁外交任务", 5: "解锁势力声望加成" },
    effects: { 2: "任务奖励金币 +5%", 6: "领地事件选项解锁更多结果" },
  },
  {
    key: "market",
    name: "市场",
    category: "economy",
    description: "商旅必经的集散地。升级提高资源存储上限、金币与粮食产出，并增加贸易位。",
    iconKey: "market",
    hotspotX: 24,
    hotspotY: 34,
    cost: { gold: 240, wood: 240, iron: 50 },
    produce: { gold: 14, food: 10, wood: 4 },
    hours: 0.25,
    unlocks: { 1: "开启贸易派遣", 3: "解锁第二个贸易位", 5: "解锁第三个贸易位" },
    effects: { 2: "全部资源存储上限 +1200", 6: "贸易产出 +15%" },
  },
  {
    key: "wall",
    name: "城墙",
    category: "military",
    description: "领地的最后一道防线。升级提供全队减伤，并降低被袭扰造成的资源损失。",
    iconKey: "wall",
    hotspotX: 50,
    hotspotY: 24,
    cost: { gold: 360, wood: 340, iron: 220 },
    produce: {},
    hours: 0.45,
    unlocks: { 1: "开启城防演武（每日增益）", 4: "解锁城墙投射支援" },
    effects: { 2: "全队受到的伤害 -3%", 5: "全队受到的伤害 -6%", 9: "全队受到的伤害 -10%" },
  },
];

export const BUILDING_SEEDS: BuildingSeed[] = BASES.map((base, index) => ({
  buildingKey: base.key,
  name: base.name,
  category: base.category,
  maxLevel: 10,
  description: base.description,
  iconKey: base.iconKey,
  hotspotX: base.hotspotX,
  hotspotY: base.hotspotY,
  sortOrder: index + 1,
  levels: buildLevels(base),
}));

export const BUILDING_BY_KEY = new Map(BUILDING_SEEDS.map((b) => [b.buildingKey, b]));

export const CATEGORY_LABEL: Record<BuildingSeed["category"], string> = {
  economy: "经济",
  military: "军事",
  research: "研究",
  governance: "政务",
};
