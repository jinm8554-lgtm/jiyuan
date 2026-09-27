/**
 * 《裂隙纪元》数值规则引擎（纯函数，无 IO —— 可在 Vitest 中 100% 覆盖）
 * 所有战斗、成长、结算公式集中在此，前端不得复制这些公式。
 */

export type ElementKey = "physical" | "fire" | "frost" | "lightning" | "holy" | "shadow";
export type RarityKey = "R" | "SR" | "SSR";
export type JobKey = "warrior" | "knight" | "mage" | "ranger" | "cleric" | "assassin" | "sage";

export type StatKey = "hp" | "atk" | "def" | "mag" | "res" | "spd" | "crit" | "critDmg" | "hit" | "dodge";
export type StatBlock = Record<StatKey, number>;

export const STAT_KEYS: StatKey[] = ["hp", "atk", "def", "mag", "res", "spd", "crit", "critDmg", "hit", "dodge"];

export const RARITY_LABEL: Record<RarityKey, string> = { R: "常民", SR: "精锐", SSR: "英杰" };
export const RARITY_FACTOR: Record<RarityKey, number> = { R: 1, SR: 1.12, SSR: 1.25 };
/** 重复角色转化货币（星辉信物）与羁绊收益 */
export const RARITY_DUPLICATE_SHARDS: Record<RarityKey, number> = { R: 6, SR: 20, SSR: 60 };
export const RARITY_DUPLICATE_BOND: Record<RarityKey, number> = { R: 10, SR: 25, SSR: 50 };
export const MAX_LEVEL_BY_ASCENSION = (ascension: number) => 60 + Math.max(0, Math.min(4, ascension)) * 5;
export const ASCENSION_STAT_BONUS = 0.04;

export const JOB_LABEL: Record<JobKey, string> = {
  warrior: "战士",
  knight: "骑士",
  mage: "法师",
  ranger: "游侠",
  cleric: "牧师",
  assassin: "刺客",
  sage: "贤者",
};

export const JOB_ROLE: Record<JobKey, "front" | "back"> = {
  warrior: "front",
  knight: "front",
  assassin: "front",
  mage: "back",
  ranger: "back",
  cleric: "back",
  sage: "back",
};

export const ELEMENT_LABEL: Record<ElementKey, string> = {
  physical: "物理",
  fire: "火焰",
  frost: "冰霜",
  lightning: "雷电",
  holy: "神圣",
  shadow: "暗影",
};

/** 元素克制：1.5 克制 / 0.75 被克 / 同系元素 0.9；物理恒定中性 1.0 */
const COUNTERS: Record<ElementKey, ElementKey> = {
  fire: "frost",
  frost: "lightning",
  lightning: "fire",
  holy: "shadow",
  shadow: "holy",
  physical: "physical",
};

export function elementMultiplier(attack: ElementKey, defend: ElementKey): number {
  if (COUNTERS[attack] === defend) return 1.5;
  if (COUNTERS[defend] === attack) return 0.75;
  // 同系元素相斥：元素攻击打在同元素目标上会被部分吸收；物理为中性，不参与该规则
  if (attack === defend && attack !== "physical") return 0.9;
  return 1;
}

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
export const round = (value: number) => Math.round(value);

export function emptyStats(): StatBlock {
  return { hp: 0, atk: 0, def: 0, mag: 0, res: 0, spd: 0, crit: 0, critDmg: 0, hit: 0, dodge: 0 };
}

export function normalizeStats(input: Partial<StatBlock> | null | undefined): StatBlock {
  const base = emptyStats();
  if (!input) return base;
  for (const key of STAT_KEYS) {
    const raw = input[key];
    if (typeof raw === "number" && Number.isFinite(raw)) base[key] = raw;
  }
  return base;
}

/**
 * 等级成长公式：属性(Lv) = 基础 × (1 + t×1.8×成长) × 稀有度缩放 × 突破加成
 *  t = (Lv-1)/59，稀有度越高成长越快（R<SR<SSR），突破提供线性加成。
 */
export function statAtLevel(
  base: number,
  growth: { curve?: number; growth?: number },
  level: number,
  ascension = 0,
): number {
  const g = clamp(growth?.growth ?? 1, 0.5, 1.6);
  const curve = clamp(growth?.curve ?? 1, 0.8, 1.4);
  const lv = clamp(level, 1, 200);
  const t = (lv - 1) / 59;
  const rarityScale = 1 + (curve - 1) * t * 1.4;
  const growthScale = 1 + t * 1.8 * g;
  const ascensionScale = 1 + ASCENSION_STAT_BONUS * clamp(ascension, 0, 6);
  return round(base * growthScale * rarityScale * ascensionScale);
}

export function statsAtLevel(
  base: Partial<StatBlock>,
  growth: { curve?: number; growth?: number },
  level: number,
  ascension = 0,
): StatBlock {
  const normalized = normalizeStats(base);
  const out = emptyStats();
  for (const key of STAT_KEYS) {
    if (key === "crit" || key === "critDmg" || key === "hit" || key === "dodge") {
      // 百分比类属性：随等级温和增长，上限受控
      out[key] = round(normalized[key] * (1 + ((clamp(level, 1, 200) - 1) / 59) * 0.25));
    } else {
      out[key] = statAtLevel(normalized[key], growth, level, ascension);
    }
  }
  return out;
}

/** 装备加成：基础值 + 每级强化 */
export function equipmentStats(
  stats: Partial<StatBlock>,
  level: number,
  upgradeRate: number,
  rolls: Partial<StatBlock> = {},
): StatBlock {
  const out = emptyStats();
  const normalized = normalizeStats(stats);
  const levelBonus = 1 + (Math.max(1, level) - 1) * (upgradeRate / 100);
  for (const key of STAT_KEYS) {
    out[key] = round(normalized[key] * levelBonus + (rolls[key] ?? 0));
  }
  return out;
}

export function addStats(a: StatBlock, b: Partial<StatBlock>): StatBlock {
  const out = { ...a };
  for (const key of STAT_KEYS) out[key] += b[key] ?? 0;
  return out;
}

/** 战力评估（用于解锁条件与展示） */
export function powerRating(stats: StatBlock): number {
  return round(
    stats.hp * 0.1 +
      stats.atk * 2 +
      stats.def * 1.5 +
      stats.mag * 2 +
      stats.res * 1.2 +
      stats.spd * 3 +
      stats.crit * 1.5 +
      stats.critDmg * 0.6 +
      stats.hit * 0.4 +
      stats.dodge * 0.4,
  );
}

export type DamageInput = {
  attacker: StatBlock;
  defender: StatBlock;
  power: number;
  /** 技能/普攻的元素属性 */
  attackElement: ElementKey;
  /** 被攻击方的元素抗性来源（自身元素不影响，使用装备/技能抗性由 stats.res 承载） */
  defenseElement?: ElementKey;
  isHeal?: boolean;
  /** 命中判定用的随机源，便于单测注入 */
  roll?: number;
  variance?: number;
};

export type DamageResult = {
  value: number;
  crit: boolean;
  hit: boolean;
  element: number;
  mitigatedPercent: number;
};

/**
 * 伤害/治疗结算（服务端权威）
 *  基础 = 攻（或魔力）× 技能倍率
 *  减伤 = 100 / (100 + 有效防御)
 *  元素 = 克制 1.5 / 被克 0.75 / 同系 0.9（物理中性）
 *  暴击 = × (1 + 暴击伤害%)
 *  波动 = 0.95 ~ 1.05（可注入，用于确定性测试）
 */
export function resolveDamage(input: DamageInput): DamageResult {
  const { attacker, defender, power, attackElement } = input;
  const roll = clamp(input.roll ?? 0.5, 0, 1);
  const variance = input.variance ?? 0.95 + roll * 0.1;

  const magic = attackElement !== "physical";
  const atkValue = magic ? attacker.mag : attacker.atk;
  const defValue = magic ? defender.res : defender.def;

  const hitRate = clamp(0.75 + (attacker.hit - defender.dodge) / 200, 0.5, 1);
  const hit = roll <= hitRate;
  if (!hit) return { value: 0, crit: false, hit: false, element: 1, mitigatedPercent: 0 };

  const critRate = clamp(attacker.crit / 100, 0, 0.85);
  const crit = roll < critRate;
  const critMult = crit ? 1 + Math.max(0, attacker.critDmg) / 100 : 1;

  const element = elementMultiplier(attackElement, input.defenseElement ?? "physical");
  const base = atkValue * (power / 100);
  const mitigation = 100 / (100 + Math.max(0, defValue));
  const raw = base * mitigation * element * critMult * variance;

  const value = Math.max(round(raw), Math.max(1, round(base * 0.08)));
  return { value, crit, hit: true, element, mitigatedPercent: round((1 - mitigation) * 100) };
}

export function healAmount(input: Omit<DamageInput, "defenseElement">): number {
  const { attacker, power, roll = 0.5, variance } = input;
  const v = variance ?? 0.95 + roll * 0.1;
  const critRate = clamp(attacker.crit / 100, 0, 0.85);
  const crit = roll < critRate;
  const critMult = crit ? 1 + Math.max(0, attacker.critDmg) / 100 : 1;
  return Math.max(1, round(attacker.mag * (power / 100) * v * critMult));
}

/** 行动条：速度越高，行动越频繁（速度差影响出手顺序与额外行动积累） */
export function actionOrder(units: Array<{ id: string; spd: number }>): string[] {
  return [...units].sort((a, b) => b.spd - a.spd || a.id.localeCompare(b.id)).map((u) => u.id);
}

/** 升级所需经验（Lv → Lv+1） */
export function expToNextLevel(level: number): number {
  return round(60 + Math.pow(level, 1.55) * 22);
}

/** 角色升级：返回新等级/经验/剩余溢出经验 */
export function applyExp(level: number, exp: number, gained: number, maxLevel: number) {
  let lv = level;
  let cur = exp + gained;
  let gainedLevels = 0;
  while (lv < maxLevel && cur >= expToNextLevel(lv)) {
    cur -= expToNextLevel(lv);
    lv += 1;
    gainedLevels += 1;
  }
  if (lv >= maxLevel) {
    // 满级后经验不再累积（经验条封顶），避免出现「已满级却仍有溢出经验」的显示歧义
    return { level: lv, exp: 0, gainedLevels };
  }
  return { level: lv, exp: cur, gainedLevels };
}

/** 建筑升级耗时/花费（指数增长） */
export function buildingUpgradeCost(levels: Array<Record<string, unknown>>, targetLevel: number) {
  const config = levels.find((l) => Number(l.level) === targetLevel) as
    | { cost?: Record<string, number>; seconds?: number }
    | undefined;
  return {
    cost: config?.cost ?? { gold: 100 * targetLevel, wood: 80 * targetLevel, iron: 20 * targetLevel },
    seconds: config?.seconds ?? 30 * Math.pow(targetLevel, 1.4),
  };
}

/** 领地资源产出（含离线结算） */
export type ResourceBundle = { gold: number; food: number; wood: number; iron: number; aether: number };

export function emptyBundle(): ResourceBundle {
  return { gold: 0, food: 0, wood: 0, iron: 0, aether: 0 };
}

export function addBundle(a: ResourceBundle, b: Partial<ResourceBundle>): ResourceBundle {
  return {
    gold: a.gold + (b.gold ?? 0),
    food: a.food + (b.food ?? 0),
    wood: a.wood + (b.wood ?? 0),
    iron: a.iron + (b.iron ?? 0),
    aether: a.aether + (b.aether ?? 0),
  };
}

export function bundleFromEntries(entries: Array<{ produce?: Record<string, number>; level: number }>): ResourceBundle {
  const out = emptyBundle();
  for (const entry of entries) {
    if (!entry.produce) continue;
    const mult = Math.max(0, entry.level);
    for (const key of Object.keys(out) as Array<keyof ResourceBundle>) {
      out[key] += round((entry.produce[key] ?? 0) * mult);
    }
  }
  return out;
}

export const RESOURCE_LABEL: Record<keyof ResourceBundle, string> = {
  gold: "金币",
  food: "粮食",
  wood: "木料",
  iron: "铁矿",
  aether: "星辉",
};

export const RESOURCE_CAP_BASE = 20000;
export function resourceCap(keepLevel: number, warehouseLevel: number): number {
  return RESOURCE_CAP_BASE + keepLevel * 1500 + warehouseLevel * 1200;
}

/** 体力恢复：每 6 分钟 1 点，上限受领主等级影响 */
export function recoverStamina(
  stamina: number,
  _storedMax: number,
  updatedAt: Date,
  now: Date,
  keepLevel: number,
): { stamina: number; staminaMax: number; updatedAt: Date } {
  // 上限以下放等级为准（建筑升级后立即生效），不信任存档里的历史值，避免旧存档锁死上限
  const staminaMax = 80 + keepLevel * 4;
  const elapsed = Math.max(0, now.getTime() - updatedAt.getTime());
  const gain = Math.floor(elapsed / (6 * 60 * 1000));
  if (gain <= 0) return { stamina: Math.min(stamina, staminaMax), staminaMax, updatedAt };
  const next = Math.min(staminaMax, stamina + gain);
  const consumed = Math.min(elapsed, gain * 6 * 60 * 1000);
  return { stamina: next, staminaMax, updatedAt: new Date(updatedAt.getTime() + consumed) };
}

/** 羁绊等级：所需羁绊经验曲线 */
export function bondExpToNext(level: number): number {
  return 100 + (level - 1) * 60;
}

export function applyBondExp(level: number, exp: number, gained: number) {
  let lv = clamp(level, 1, 10);
  let cur = exp + gained;
  let up = 0;
  while (lv < 10 && cur >= bondExpToNext(lv)) {
    cur -= bondExpToNext(lv);
    lv += 1;
    up += 1;
  }
  if (lv >= 10) cur = Math.min(cur, bondExpToNext(10) - 1);
  return { level: lv, exp: cur, gainedLevels: up };
}

/** 区域控制度 */
export function controlPercent(
  nodes: Array<{ status: string; controlWeight: number }>,
  requiredClears: number,
): number {
  const totalWeight = nodes.reduce((sum, n) => sum + Math.max(1, n.controlWeight), 0);
  if (totalWeight === 0) return 0;
  const score = nodes.reduce((sum, n) => {
    const weight = Math.max(1, n.controlWeight);
    if (n.status === "conquered") return sum + weight;
    if (n.status === "cleared") return sum + weight * 0.45;
    return sum;
  }, 0);
  return clamp(round((score / totalWeight) * 100), 0, 100);
}

export const unlockedByClears = (clearCount: number, requiredClears: number) => clearCount >= requiredClears;
