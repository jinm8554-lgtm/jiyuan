/**
 * 领主统御：议事厅产出的领袖力，以及可学习的内政/战术能力。
 * 领袖力只由每日前几次有效议事提供；额外聊天次数不增加战力。
 */

export const LEADER_POWER_START = 40;
export const LEADER_POWER_PER_COUNCIL = 4;
export const LEADER_POWER_DAILY_LIMIT = 5;
export const COUNCIL_FREE_DAILY_LIMIT = 5;
export const COUNCIL_SUPPORTER_DAILY_LIMIT = 10;

export type LeadershipCategory = "interior" | "tactic";
export type TacticTargetType = "none" | "enemy" | "ally_down";

export type LeadershipSkill = {
  key: string;
  name: string;
  category: LeadershipCategory;
  maxLevel: number;
  costs: number[];
  description: string;
  effectAtLevel: (level: number) => string;
  pointsCost?: number;
  targetType?: TacticTargetType;
};

export const LEADERSHIP_SKILLS: LeadershipSkill[] = [
  {
    key: "stewardship",
    name: "财政统筹",
    category: "interior",
    maxLevel: 5,
    costs: [10, 15, 20, 25, 30],
    description: "提高领地建筑提供的金币正向产出，不影响星辉与招募。",
    effectAtLevel: (level) => `建筑金币产出 +${level * 2}%`,
  },
  {
    key: "materials",
    name: "物资调度",
    category: "interior",
    maxLevel: 5,
    costs: [10, 15, 20, 25, 30],
    description: "提高建筑提供的木料、粮食、铁矿正向产出，不降低维护消耗。",
    effectAtLevel: (level) => `材料产出 +${level * 2}%`,
  },
  {
    key: "trade_pact",
    name: "商路契约",
    category: "interior",
    maxLevel: 5,
    costs: [10, 15, 20, 25, 30],
    description: "提高已派遣贸易路线的金币、木料、粮食、铁矿收益；不影响贸易位、收取次数和星辉。",
    effectAtLevel: (level) => `贸易收益 +${level * 3}%`,
  },
  {
    key: "field_medicine",
    name: "战地救治",
    category: "tactic",
    maxLevel: 3,
    costs: [20, 30, 45],
    pointsCost: 2,
    targetType: "none",
    description: "为全体存活伙伴恢复生命，不占任何伙伴的行动与能量。",
    effectAtLevel: (level) => `全体回复 ${[8, 11, 14][level - 1]}% 最大生命`,
  },
  {
    key: "coordinated_strike",
    name: "联合集火",
    category: "tactic",
    maxLevel: 3,
    costs: [20, 30, 45],
    pointsCost: 1,
    targetType: "enemy",
    description: "指定一名敌人，按我方当前最强伙伴的攻防体系发动一次协同打击。",
    effectAtLevel: (level) => `协同伤害 ${[105, 135, 165][level - 1]}%`,
  },
  {
    key: "fortify_order",
    name: "坚守号令",
    category: "tactic",
    maxLevel: 3,
    costs: [20, 30, 45],
    pointsCost: 2,
    targetType: "none",
    description: "为全体存活伙伴施加护盾，不占任何伙伴的行动与能量。",
    effectAtLevel: (level) => `全体获得 ${[8, 11, 14][level - 1]}% 最大生命护盾`,
  },
  {
    key: "revival_order",
    name: "复苏军令",
    category: "tactic",
    maxLevel: 3,
    costs: [20, 30, 45],
    pointsCost: 2,
    targetType: "ally_down",
    description: "令一名倒下伙伴重返战场；全队覆灭时无法施放。",
    effectAtLevel: (level) => `复活并回复 ${[15, 20, 25][level - 1]}% 最大生命`,
  },
];

export const LEADERSHIP_BY_KEY = new Map(LEADERSHIP_SKILLS.map((skill) => [skill.key, skill]));
export const INTERIOR_LEADERSHIP_SKILLS = LEADERSHIP_SKILLS.filter((skill) => skill.category === "interior");
export const TACTICAL_LEADERSHIP_SKILLS = LEADERSHIP_SKILLS.filter((skill) => skill.category === "tactic");

export type LeaderSkillLevels = Record<string, number>;

export type LeaderCommandState = {
  points: number;
  maxPoints: number;
  loadout: string[];
  levels: LeaderSkillLevels;
  usedKeys: string[];
  lastCommandTurn: number | null;
};

export function normalizeLeaderSkillLevels(value: unknown): LeaderSkillLevels {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const result: LeaderSkillLevels = {};
  for (const skill of LEADERSHIP_SKILLS) {
    const level = Number(raw[skill.key] ?? 0);
    if (Number.isFinite(level) && level > 0) result[skill.key] = Math.min(skill.maxLevel, Math.floor(level));
  }
  return result;
}

export function normalizeLeaderLoadout(value: unknown, levels: LeaderSkillLevels): string[] {
  if (!Array.isArray(value)) return [];
  const selected: string[] = [];
  for (const key of value) {
    if (typeof key !== "string" || selected.includes(key)) continue;
    const skill = LEADERSHIP_BY_KEY.get(key);
    if (!skill || skill.category !== "tactic" || (levels[key] ?? 0) < 1) continue;
    selected.push(key);
    if (selected.length === 3) break;
  }
  return selected;
}

export function leaderSkillCost(skill: LeadershipSkill, currentLevel: number) {
  return skill.costs[currentLevel] ?? null;
}

export function tacticMagnitude(key: string, level: number) {
  const index = Math.max(0, Math.min(2, level - 1));
  if (key === "field_medicine" || key === "fortify_order") return [8, 11, 14][index];
  if (key === "coordinated_strike") return [105, 135, 165][index];
  if (key === "revival_order") return [15, 20, 25][index];
  return 0;
}

export function createLeaderCommandState(levels: LeaderSkillLevels, loadout: string[]): LeaderCommandState {
  return {
    points: 1,
    maxPoints: 2,
    levels: normalizeLeaderSkillLevels(levels),
    loadout: normalizeLeaderLoadout(loadout, levels),
    usedKeys: [],
    lastCommandTurn: null,
  };
}

/** 亚洲上海时区的日结键，避免服务器时区改变日常重置时间。 */
export function leadershipDayKey(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .replace(/\//g, "-");
}
