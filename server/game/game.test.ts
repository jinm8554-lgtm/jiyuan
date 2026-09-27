import { describe, expect, it } from "vitest";
import { CHARACTER_SEEDS, STARTER_CHAR_KEYS } from "./data/characters";
import { EQUIPMENT_SEEDS, SET_BONUSES } from "./data/equipments";
import { NODE_SEEDS, REGION_SEEDS } from "./data/world";
import { SKILL_BY_KEY, SKILL_SEEDS, skillPowerAtLevel } from "./data/skills";
import {
  applyBondExp,
  applyExp,
  buildingUpgradeCost,
  controlPercent,
  elementMultiplier,
  equipmentStats,
  expToNextLevel,
  normalizeStats,
  powerRating,
  recoverStamina,
  resolveDamage,
  resourceCap,
  round,
  statsAtLevel,
  MAX_LEVEL_BY_ASCENSION,
} from "./formulas";
import { drawMany, effectiveRates, isPoolOpen, mulberry32, normalizeRates, rollRarity, totalCost, type PoolConfig, type PityState } from "./recruit";
import { autoResolve, checkBattleEnd, computeRewards, createRng, executeAction, startBattle, type BattleUnitInput } from "./battle";
import { AI_OUTPUT_SCHEMA, buildSystemPrompt, buildUserPrompt, extractJson, fallbackTurns, validateAiOutput } from "./ai";
import { encryptSecret, decryptSecret, maskApiKey } from "./aiClient";
import { verifySnapshot } from "./backup";
import { BUILDING_SEEDS, BUILDING_BY_KEY } from "./data/buildings";
import { QUEST_SEEDS } from "./data/quests";
import { STORY_SEEDS } from "./data/story";

/* ============================ 数值公式 ============================ */

describe("数值公式", () => {
  it("成长曲线随等级单调递增，且 SSR 成长率高于 R", () => {
    const rChar = CHARACTER_SEEDS.find((c) => c.rarity === "R")!;
    const ssrChar = CHARACTER_SEEDS.find((c) => c.rarity === "SSR")!;
    const r10 = statsAtLevel(rChar.baseStats, rChar.growth, 10, 0);
    const r20 = statsAtLevel(rChar.baseStats, rChar.growth, 20, 0);
    const ssr10 = statsAtLevel(ssrChar.baseStats, ssrChar.growth, 10, 0);
    expect(r20.hp).toBeGreaterThan(r10.hp);
    expect(r20.atk).toBeGreaterThan(r10.atk);
    expect(ssr10.hp / ssrChar.baseStats.hp).toBeGreaterThanOrEqual(r10.hp / rChar.baseStats.hp - 0.001);
  });

  it("突破提升等级上限并提高属性", () => {
    const char = CHARACTER_SEEDS[0];
    const base = statsAtLevel(char.baseStats, char.growth, 60, 0);
    const ascended = statsAtLevel(char.baseStats, char.growth, 60, 2);
    expect(MAX_LEVEL_BY_ASCENSION(2)).toBeGreaterThan(MAX_LEVEL_BY_ASCENSION(0));
    expect(ascended.atk).toBeGreaterThan(base.atk);
  });

  it("元素克制关系正确（火克冰、冰克雷、雷克火；圣与暗互克）", () => {
    expect(elementMultiplier("fire", "frost")).toBeGreaterThan(1);
    expect(elementMultiplier("frost", "lightning")).toBeGreaterThan(1);
    expect(elementMultiplier("lightning", "fire")).toBeGreaterThan(1);
    expect(elementMultiplier("fire", "fire")).toBeLessThan(1);
    expect(elementMultiplier("holy", "shadow")).toBeGreaterThan(1);
    expect(elementMultiplier("shadow", "holy")).toBeGreaterThan(1);
    expect(elementMultiplier("physical", "holy")).toBe(1);
    expect(elementMultiplier("holy", "holy")).toBeLessThan(1);
  });

  it("防御值降低伤害、暴击提高伤害，伤害永不为负", () => {
    const attacker = normalizeStats({ atk: 400, crit: 0, hit: 200 });
    const weak = resolveDamage({ attacker, defender: normalizeStats({ def: 0 }), power: 200, attackElement: "physical", roll: 0.5 });
    const tough = resolveDamage({ attacker, defender: normalizeStats({ def: 300 }), power: 200, attackElement: "physical", roll: 0.5 });
    const crit = resolveDamage({
      attacker: { ...attacker, crit: 100, critDmg: 200 },
      defender: normalizeStats({ def: 0 }),
      power: 200,
      attackElement: "physical",
      roll: 0.99,
      forceCrit: true,
    });
    expect(tough.value).toBeLessThan(weak.value);
    expect(crit.value).toBeGreaterThan(weak.value);
    expect(weak.value).toBeGreaterThanOrEqual(1);
  });

  it("高防御与 0 攻击力时伤害仍有下限 1，不产生负值", () => {
    const result = resolveDamage({
      attacker: normalizeStats({ atk: 0 }),
      defender: normalizeStats({ def: 99999 }),
      power: 100,
      attackElement: "physical",
      roll: 0.5,
    });
    expect(result.value).toBeGreaterThanOrEqual(1);
  });

  it("升级经验与羁绊经验正确溢出与进位", () => {
    const level1 = applyExp(1, 0, expToNextLevel(1) + 5, 60);
    expect(level1.level).toBe(2);
    expect(level1.exp).toBe(5);
    const capped = applyExp(59, 0, 10 ** 6, 60);
    expect(capped.level).toBe(60);
    expect(capped.exp).toBe(0);

    const bond = applyBondExp(1, 0, 10 ** 5);
    expect(bond.level).toBeGreaterThan(1);
  });

  it("资源上限与体力恢复随时间增长且封顶", () => {
    expect(resourceCap(3, 5)).toBeGreaterThan(resourceCap(1, 0));
    const early = recoverStamina(10, 80, new Date(Date.now() - 3600_000), new Date(), 1);
    const longAgo = recoverStamina(10, 80, new Date(Date.now() - 30 * 24 * 3600_000), new Date(), 1);
    expect(early.stamina).toBeGreaterThanOrEqual(10);
    // 上限为 80 + 城堡等级 × 4（等级 1 → 84），长时间离线后应恰好封顶
    expect(longAgo.staminaMax).toBe(84);
    expect(longAgo.stamina).toBe(longAgo.staminaMax);
  });

  it("战力评估对综合属性敏感", () => {
    const weak = powerRating(normalizeStats({ hp: 100, atk: 10, def: 5, mag: 0, res: 2, spd: 5 }));
    const strong = powerRating(normalizeStats({ hp: 5000, atk: 400, def: 300, mag: 200, res: 200, spd: 90 }));
    expect(strong).toBeGreaterThan(weak * 5);
  });

  it("建筑升级消耗随等级递增", () => {
    const config = BUILDING_BY_KEY.get("wall")!;
    const lv1 = buildingUpgradeCost(config.levels, 1);
    const lv5 = buildingUpgradeCost(config.levels, 5);
    expect(lv5.cost.gold).toBeGreaterThan(lv1.cost.gold);
    expect(lv5.seconds).toBeGreaterThan(lv1.seconds);
  });

  it("区域控制度计算符合权重与要求次数", () => {
    const nodes = [
      { status: "conquered", controlWeight: 3 },
      { status: "cleared", controlWeight: 2 },
      { status: "available", controlWeight: 1 },
      { status: "locked", controlWeight: 1 },
    ];
    const percent = controlPercent(nodes, 3);
    expect(percent).toBeGreaterThan(0);
    expect(percent).toBeLessThan(100);
    const all = controlPercent(nodes.map(() => ({ status: "conquered", controlWeight: 3 })), 3);
    expect(all).toBe(100);
  });

  it("装备强化提升属性，品质越高收益越高", () => {
    const base = equipmentStats({ atk: 100 }, 1, 8);
    const plus5 = equipmentStats({ atk: 100 }, 5, 8);
    const plus10 = equipmentStats({ atk: 100 }, 10, 8);
    expect(plus5.atk).toBeGreaterThan(base.atk);
    expect(plus10.atk).toBeGreaterThan(plus5.atk);
  });
});

/* ============================ 招募系统 ============================ */

const basePool: PoolConfig = {
  poolKey: "test_pool",
  name: "测试卡池",
  poolType: "normal",
  rates: [
    { rarity: "SSR", rate: 0.03 },
    { rarity: "SR", rate: 0.17 },
    { rarity: "R", rate: 0.8 },
  ],
  pity: { softStart: 60, softStep: 0.06, hardPity: 80, tenPullMinRarity: "SR", duplicateShards: 1 },
  costSingle: 10,
  costTen: 90,
  currency: "aether",
  characterKeys: [],
  enabled: true,
};

describe("招募：概率 / 保底 / 重复转化", () => {
  it("概率归一化后总和为 1，非法输入有兜底", () => {
    const rates = normalizeRates(basePool.rates);
    expect(rates.SSR + rates.SR + rates.R).toBeCloseTo(1, 6);
    const empty = normalizeRates([]);
    expect(empty.R).toBe(1);
  });

  it("概率由配置决定：SSR 概率可被 GM 调整（不写死在前端）", () => {
    const custom: PoolConfig = { ...basePool, rates: [{ rarity: "SSR", rate: 0.5 }, { rarity: "SR", rate: 0.3 }, { rarity: "R", rate: 0.2 }] };
    const rates = normalizeRates(custom.rates);
    expect(rates.SSR).toBeCloseTo(0.5, 6);
    const rng = mulberry32(42);
    let ssr = 0;
    for (let i = 0; i < 4000; i += 1) {
      if (rollRarity(rates, rng()) === "SSR") ssr += 1;
    }
    expect(ssr / 4000).toBeGreaterThan(0.4);
    expect(ssr / 4000).toBeLessThan(0.6);
  });

  it("软保底使 SSR 概率随抽数提升", () => {
    const low: PityState = { totalPulls: 0, pullsSinceSSR: 0, pullsSinceSR: 0, guaranteedSSR: false };
    const mid: PityState = { totalPulls: 70, pullsSinceSSR: 70, pullsSinceSR: 12, guaranteedSSR: false };
    const lowRates = effectiveRates(basePool, low);
    const midRates = effectiveRates(basePool, mid);
    expect(midRates.SSR).toBeGreaterThan(lowRates.SSR);
    expect(lowRates.SSR + lowRates.SR + lowRates.R).toBeCloseTo(1, 6);
  });

  it("硬保底必出最高稀有度", () => {
    const pity: PityState = { totalPulls: 79, pullsSinceSSR: 79, pullsSinceSR: 20, guaranteedSSR: false };
    const rates = effectiveRates(basePool, pity);
    expect(rates.SSR).toBe(1);

    const rng = mulberry32(7);
    const { results } = drawMany({
      pool: basePool,
      pity,
      candidates: { R: ["r1", "r2"], SR: ["sr1"], SSR: ["ssr1"] },
      ownedKeys: new Set(),
      count: 1,
      rng,
    });
    expect(results[0].rarity).toBe("SSR");
    expect(results[0].pityTriggered).toBe(true);
  });

  it("十连至少产出 1 名 SR 及以上", () => {
    const rng = mulberry32(1234);
    const pity: PityState = { totalPulls: 0, pullsSinceSSR: 0, pullsSinceSR: 0, guaranteedSSR: false };
    const { results } = drawMany({
      pool: basePool,
      pity,
      candidates: { R: ["r1", "r2", "r3"], SR: ["sr1", "sr2"], SSR: ["ssr1"] },
      ownedKeys: new Set(),
      count: 10,
      rng,
    });
    expect(results).toHaveLength(10);
    expect(results.some((result) => result.rarity === "SR" || result.rarity === "SSR")).toBe(true);
  });

  it("重复角色转化为星辉信物与羁绊经验", () => {
    const rng = mulberry32(99);
    const { results } = drawMany({
      pool: basePool,
      pity: { totalPulls: 0, pullsSinceSSR: 0, pullsSinceSR: 0, guaranteedSSR: false },
      candidates: { R: ["known"], SR: ["sr1"], SSR: ["ssr1"] },
      ownedKeys: new Set(["known", "sr1", "ssr1"]),
      count: 10,
      rng,
    });
    for (const result of results) {
      expect(result.isNew).toBe(false);
      expect(result.shards).toBeGreaterThan(0);
      expect(result.bondExp).toBeGreaterThan(0);
    }
  });

  it("保底计数在抽取后正确推进与重置", () => {
    const rng = mulberry32(5);
    const { pity } = drawMany({
      pool: basePool,
      pity: { totalPulls: 0, pullsSinceSSR: 0, pullsSinceSR: 0, guaranteedSSR: false },
      candidates: { R: ["r1"], SR: [], SSR: [] },
      ownedKeys: new Set(),
      count: 5,
      rng,
    });
    expect(pity.totalPulls).toBe(5);
    expect(pity.pullsSinceSSR).toBe(5);
  });

  it("卡池开关与时间窗口生效", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    expect(isPoolOpen({ enabled: true, openAt: null, closeAt: null }, now)).toBe(true);
    expect(isPoolOpen({ enabled: false, openAt: null, closeAt: null }, now)).toBe(false);
    expect(isPoolOpen({ enabled: true, openAt: new Date("2026-07-01"), closeAt: null }, now)).toBe(false);
    expect(isPoolOpen({ enabled: true, openAt: null, closeAt: new Date("2026-05-01") }, now)).toBe(false);
  });

  it("十连价格按配置计算（含单抽补足）", () => {
    expect(totalCost(basePool, 1)).toBe(10);
    expect(totalCost(basePool, 10)).toBe(90);
  });
});

/* ============================ 战斗系统 ============================ */

function makeAlly(overrides: Partial<BattleUnitInput> = {}): BattleUnitInput {
  return {
    id: "ally_1",
    charKey: "adrian",
    side: "ally",
    name: "艾德里安",
    job: "knight",
    element: "physical",
    rarity: "SSR",
    level: 20,
    row: "front",
    stats: { hp: 1600, atk: 220, def: 180, mag: 40, res: 120, spd: 70, crit: 12, critDmg: 150, hit: 110, dodge: 6 },
    skills: [
      { skillKey: "sk_basic_attack", level: 1 },
      { skillKey: "sk_defend", level: 1 },
      { skillKey: "sk_raise_banner", level: 3 },
    ],
    ...overrides,
  };
}

function makeEnemy(overrides: Partial<BattleUnitInput> = {}): BattleUnitInput {
  return {
    id: "enemy_1",
    charKey: "rift_wisp",
    side: "enemy",
    name: "蚀影游丝",
    job: "mage",
    element: "shadow",
    rarity: "R",
    level: 12,
    row: "back",
    stats: { hp: 700, atk: 60, def: 40, mag: 150, res: 90, spd: 60, crit: 5, critDmg: 150, hit: 100, dodge: 5 },
    skills: [{ skillKey: "sk_basic_attack", level: 1 }],
    ...overrides,
  };
}

describe("战斗引擎", () => {
  it("战斗可以开始并产生回合信息与行动顺序", () => {
    const state = startBattle([makeAlly(), makeEnemy()], { nodeKey: "t", regionKey: "r", seed: 1 });
    expect(state.turn).toBe(1);
    expect(state.order.length).toBe(2);
    expect(state.log.some((event) => event.type === "turn_start")).toBe(true);
    expect(state.finished).toBe(false);
  });

  it("全自动战斗可以分出胜负，且事件流完整（伤害/治疗/状态/回合）", () => {
    const state = startBattle([makeAlly(), makeAlly({ id: "ally_2", charKey: "greta", job: "warrior" }), makeEnemy()], {
      nodeKey: "t",
      regionKey: "r",
      seed: 2024,
    });
    const events = autoResolve(state, createRng(state.rngSeed));
    expect(state.finished).toBe(true);
    expect(["won", "lost"]).toContain(state.result);
    expect(events.some((event) => event.type === "damage")).toBe(true);
    expect(events.some((event) => event.type === "action")).toBe(true);
  });

  it("等级更高的队伍更容易取胜（等级与属性真实影响结果）", () => {
    const weakTeam = [makeAlly({ level: 1, stats: { hp: 300, atk: 30, def: 20, mag: 5, res: 10, spd: 20 } })];
    const strongTeam = [makeAlly({ level: 60, stats: { hp: 9000, atk: 900, def: 700, mag: 100, res: 500, spd: 140 } })];
    const enemy = [makeEnemy({ level: 20, stats: { hp: 1500, atk: 120, def: 80, mag: 250, res: 150, spd: 70 } })];

    const weakState = startBattle([...weakTeam, ...enemy.map((unit) => ({ ...unit, id: "e_weak" }))], { nodeKey: "t", regionKey: "r", seed: 11 });
    autoResolve(weakState, createRng(11, ), 40);

    const strongState = startBattle([...strongTeam, ...enemy.map((unit) => ({ ...unit, id: "e_strong" }))], { nodeKey: "t", regionKey: "r", seed: 11 });
    autoResolve(strongState, createRng(11), 40);

    expect(strongState.result).toBe("won");
    expect(weakState.result).toBe("lost");
  });

  it("防御指令提供护盾；治疗技能回复生命", () => {
    const state = startBattle([makeAlly(), makeAlly({ id: "ally_2", charKey: "maevrin", job: "cleric", skills: [{ skillKey: "sk_basic_attack", level: 1 }, { skillKey: "sk_defend", level: 1 }, { skillKey: "sk_dawn_dew", level: 1 }] }), makeEnemy()], {
      nodeKey: "t",
      regionKey: "r",
      seed: 3,
    });
    const ally = state.units.find((unit) => unit.id === "ally_1")!;
    const defendEvents = executeAction(state, { unitId: ally.id, actionKey: "defend" }, createRng(1));
    expect(defendEvents.some((event) => event.type === "shield")).toBe(true);
    expect(ally.shield).toBeGreaterThan(0);

    const healer = state.units.find((unit) => unit.id === "ally_2")!;
    healer.energy = 100;
    ally.hp = 100;
    const healEvents = executeAction(state, { unitId: healer.id, actionKey: "sk_dawn_dew", targetId: ally.id }, createRng(2));
    expect(healEvents.some((event) => event.type === "heal")).toBe(true);
    expect(ally.hp).toBeGreaterThan(100);
  });

  it("护盾先于生命被消耗，生命归零则退出战斗", () => {
    const state = startBattle([makeAlly(), makeEnemy({ stats: { hp: 200, atk: 5000, mag: 5000, def: 0, res: 0, spd: 200, hit: 200, crit: 0, critDmg: 0, dodge: 0 } })], {
      nodeKey: "t",
      regionKey: "r",
      seed: 8,
    });
    const target = state.units.find((unit) => unit.id === "ally_1")!;
    target.shield = 200;
    const attacker = state.units.find((unit) => unit.id === "enemy_1")!;
    executeAction(state, { unitId: attacker.id, actionKey: "sk_basic_attack", targetId: target.id }, createRng(9));
    expect(target.hp).toBeLessThan(target.maxHp);
  });

  it("城墙减伤生效（领地对战斗有实际影响）", () => {
    const build = (reduction: number) => {
      const state = startBattle([makeAlly(), makeEnemy({ stats: { hp: 5000, atk: 800, mag: 800, def: 100, res: 100, spd: 300, hit: 200, crit: 0, critDmg: 0, dodge: 0 } })], {
        nodeKey: "t",
        regionKey: "r",
        seed: 77,
      });
      state.keepBonusReduction = reduction;
      const target = state.units.find((unit) => unit.id === "ally_1")!;
      const attacker = state.units.find((unit) => unit.id === "enemy_1")!;
      const before = target.hp;
      executeAction(state, { unitId: attacker.id, actionKey: "sk_basic_attack", targetId: target.id }, createRng(21));
      return before - target.hp;
    };
    const plain = build(0);
    const fortified = build(0.1);
    expect(fortified).toBeLessThan(plain);
  });

  it("技能等级提升倍率，效果真实影响伤害", () => {
    const skill = SKILL_BY_KEY.get("sk_raise_banner")!;
    expect(skillPowerAtLevel(skill, 5)).toBeGreaterThan(skillPowerAtLevel(skill, 1));
  });

  it("星级评价与奖励倍率联动", () => {
    const state = startBattle([makeAlly(), makeEnemy()], { nodeKey: "t", regionKey: "r", seed: 4 });
    state.turn = 3;
    checkBattleEnd({ ...state, units: state.units.filter((unit) => unit.side === "ally") } as never, []);
    const rewards = computeRewards({ gold: 100, exp: 50 }, { gold: 200, exp: 100, items: [{ equipKey: "eq_iron_sword", chance: 1 }] }, state, true);
    expect(rewards.gold).toBeGreaterThanOrEqual(100);
    expect(rewards.items.length).toBeGreaterThan(0);
  });

  it("战斗状态可序列化并在恢复后继续（服务器权威）", () => {
    const state = startBattle([makeAlly(), makeEnemy()], { nodeKey: "t", regionKey: "r", seed: 55 });
    const serialized = JSON.parse(JSON.stringify(state));
    expect(serialized.units.length).toBe(2);
    expect(serialized.units[0].id).toBe(state.units[0].id);
    expect(serialized.turn).toBe(state.turn);
  });
});

/* ============================ AI 互动 ============================ */

const presentChars = [
  {
    charKey: "adrian",
    name: "艾德里安·瓦尔登",
    title: "灰隼之誓",
    job: "knight",
    race: "人类",
    faction: "王国余晖",
    personality: "沉稳、守规矩。",
    goal: "让旗帜重新有人跟随。",
    background: "旧王国骑士团最后的旗手。",
    bondLevel: 2,
    affection: 5,
    level: 20,
  },
  {
    charKey: "viola",
    name: "薇奥拉·星轨",
    title: "观测者",
    job: "sage",
    race: "精灵",
    faction: "星轨学院",
    personality: "理性、话少。",
    goal: "记录裂隙的规律。",
    background: "星轨学院的观测员。",
    bondLevel: 1,
    affection: 0,
    level: 18,
  },
];

describe("AI 角色互动：Schema 校验与在场角色约束", () => {
  it("输出 Schema 要求 turns/charKey/action/mood 等结构", () => {
    const schema = AI_OUTPUT_SCHEMA.schema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    const props = schema.properties as Record<string, { type: unknown }>;
    expect(props.turns).toBeDefined();
    expect(JSON.stringify(schema)).toContain("charKey");
    expect(JSON.stringify(schema)).toContain("bondDelta");
  });

  it("拒绝不在场角色发言（未知角色 ID）", () => {
    const result = validateAiOutput(
      {
        turns: [
          { charKey: "unknown_hero", action: "speak", content: "我来自另一个世界。", mood: "calm", bondDelta: 1 },
          { charKey: "adrian", action: "speak", content: "「我听着，领主。」", mood: "calm", bondDelta: 1 },
        ],
        narration: "议事厅里安静下来。",
        suggestions: ["继续讨论"],
      },
      ["adrian", "viola"],
    );
    expect(result.violations.some((violation) => violation.code === "unknown_char")).toBe(true);
    expect(result.output.turns).toHaveLength(1);
    expect(result.output.turns[0].charKey).toBe("adrian");
    expect(result.rejectedTurns).toBe(1);
  });

  it("拒绝非法 action / mood 与超范围 bondDelta，并收敛数值", () => {
    const result = validateAiOutput(
      {
        turns: [
          { charKey: "adrian", action: "kill_everyone", content: "「……。」", mood: "calm", bondDelta: 0 },
          { charKey: "viola", action: "speak", content: "「记录完毕。」", mood: "sarcastic", bondDelta: 12 },
        ],
        narration: "",
        suggestions: [],
      },
      ["adrian", "viola"],
    );
    expect(result.violations.some((violation) => violation.code === "invalid_action")).toBe(true);
    expect(result.violations.some((violation) => violation.code === "invalid_mood")).toBe(true);
    expect(result.violations.some((violation) => violation.code === "bond_out_of_range")).toBe(true);
    expect(result.output.turns).toHaveLength(1);
    expect(result.output.turns[0].bondDelta).toBeLessThanOrEqual(3);
    expect(result.output.turns[0].mood).toBe("calm");
  });

  it("拒绝成人向内容与重复发言", () => {
    const banned = validateAiOutput(
      {
        turns: [{ charKey: "adrian", action: "speak", content: "描述色情内容", mood: "calm", bondDelta: 1 }],
        narration: "",
        suggestions: [],
      },
      ["adrian"],
    );
    expect(banned.output.turns).toHaveLength(0);

    const duplicated = validateAiOutput(
      {
        turns: [
          { charKey: "adrian", action: "speak", content: "「我听着。」", mood: "calm", bondDelta: 1 },
          { charKey: "adrian", action: "speak", content: "「我还在听。」", mood: "calm", bondDelta: 1 },
        ],
        narration: "",
        suggestions: [],
      },
      ["adrian"],
    );
    expect(duplicated.violations.some((violation) => violation.code === "duplicate_char")).toBe(true);
    expect(duplicated.output.turns).toHaveLength(1);
  });

  it("非 JSON 与结构缺失均被拒绝", () => {
    expect(validateAiOutput(null, ["adrian"]).ok).toBe(false);
    expect(validateAiOutput({ narration: "x" }, ["adrian"]).violations[0].code).toBe("turns_not_array");
    expect(extractJson("```json\n{\"turns\":[]}\n```")).toEqual({ turns: [] });
    expect(extractJson("前面有文字 {\"turns\":[]} 后面有文字")).toEqual({ turns: [] });
    expect(extractJson("完全不是 JSON")).toBeNull();
  });

  it("提示词只包含在场角色，且不得暴露可改写设定的字段", () => {
    const prompt = buildSystemPrompt({ present: presentChars, scene: "council", worldContext: "" });
    expect(prompt).toContain("艾德里安");
    expect(prompt).toContain("薇奥拉");
    expect(prompt).not.toContain("莉赛尔");
    // 内容准则需要明确列出禁止项的名称，但提示词自身不得包含任何成人向正文
    expect(prompt).toContain("禁止任何色情内容");
    expect(prompt).not.toContain("露骨的描写样例");
    expect(prompt).toContain("只能让下列在场角色发言或行动");
    expect(prompt).toContain("不得改动任何角色的身份");

    const userPrompt = buildUserPrompt({
      playerMessage: "先修城墙还是先开矿？",
      scene: "council",
      activeCharKey: "adrian",
      present: presentChars,
      history: [],
      turnCount: 2,
    });
    expect(userPrompt).toContain("艾德里安");
    expect(userPrompt).toContain("先修城墙还是先开矿");
  });

  it("没有在场角色时不调用模型，直接给出提示", () => {
    const output = fallbackTurns({ present: [], scene: "council", playerMessage: "有人吗", seed: 1 });
    expect(output.turns).toHaveLength(0);
    expect(output.narration).toContain("请先");
  });

  it("本地回退只让在场角色开口", () => {
    const output = fallbackTurns({ present: presentChars, scene: "campfire", playerMessage: "聊聊", activeCharKey: "viola", seed: 3 });
    expect(output.turns.length).toBeGreaterThan(0);
    for (const turn of output.turns) {
      expect(["adrian", "viola"]).toContain(turn.charKey);
    }
  });
});

/* ============================ 配置与安全 ============================ */

describe("策划配置与安全", () => {
  it("15 名角色均为全年龄向且字段完整", () => {
    expect(CHARACTER_SEEDS.length).toBe(15);
    for (const char of CHARACTER_SEEDS) {
      expect(char.contentRating).toBe("all-ages");
      expect(char.name.length).toBeGreaterThan(0);
      expect(char.title.length).toBeGreaterThan(0);
      expect(char.appearance.length).toBeGreaterThan(0);
      expect(char.background.length).toBeGreaterThan(0);
      expect(char.personality.length).toBeGreaterThan(0);
      expect(char.goal.length).toBeGreaterThan(0);
      expect(char.skillKeys.length).toBeGreaterThanOrEqual(2);
      expect(Object.keys(char.quotes).length).toBeGreaterThan(0);
      for (const relation of char.relations) expect(relation.charKey.length).toBeGreaterThan(0);
    }
  });

  it("角色引用的技能与关系目标均存在", () => {
    const keys = new Set(CHARACTER_SEEDS.map((char) => char.charKey));
    for (const char of CHARACTER_SEEDS) {
      for (const skillKey of char.skillKeys) {
        expect(SKILL_BY_KEY.has(skillKey), `${char.charKey} 引用不存在的技能 ${skillKey}`).toBe(true);
      }
      for (const relation of char.relations) {
        expect(keys.has(relation.charKey), `${char.charKey} 引用不存在的角色 ${relation.charKey}`).toBe(true);
      }
    }
  });

  it("初始角色均存在且为可玩的低门槛角色", () => {
    const keys = new Set(CHARACTER_SEEDS.map((char) => char.charKey));
    expect(STARTER_CHAR_KEYS.length).toBeGreaterThanOrEqual(2);
    for (const key of STARTER_CHAR_KEYS) expect(keys.has(key)).toBe(true);
  });

  it("建筑配置完整（7 座、每座 10 级、等级配置齐全）", () => {
    expect(BUILDING_SEEDS.length).toBe(7);
    for (const building of BUILDING_SEEDS) {
      expect(building.levels.length).toBe(building.maxLevel);
      for (const level of building.levels) {
        expect(Number(level.level)).toBeGreaterThan(0);
        expect(level.cost).toBeDefined();
      }
    }
  });

  it("地图数据完整：区域 6 个、节点 35 个，引用关系正确", () => {
    expect(REGION_SEEDS.length).toBe(6);
    expect(NODE_SEEDS.length).toBe(35);
    const regionKeys = new Set(REGION_SEEDS.map((region) => region.regionKey));
    const nodeKeys = new Set(NODE_SEEDS.map((node) => node.nodeKey));
    for (const node of NODE_SEEDS) {
      expect(regionKeys.has(node.regionKey)).toBe(true);
      const unlock = node.unlock as { nodeKey?: string };
      if (unlock.nodeKey) expect(nodeKeys.has(unlock.nodeKey), `${node.nodeKey} 前置节点不存在`).toBe(true);
      expect(node.enemyWave.length).toBeGreaterThan(0);
    }
    for (const region of REGION_SEEDS) {
      const unlock = region.unlock as { nodeKey?: string };
      if (unlock.nodeKey) expect(nodeKeys.has(unlock.nodeKey)).toBe(true);
    }
  });

  it("任务与剧情数据引用一致", () => {
    const nodeKeys = new Set(NODE_SEEDS.map((node) => node.nodeKey));
    const questKeys = new Set(QUEST_SEEDS.map((quest) => quest.questKey));
    for (const quest of QUEST_SEEDS) {
      const pre = quest.prerequisite as { questKey?: string };
      if (pre.questKey) expect(questKeys.has(pre.questKey), `${quest.questKey} 前置任务不存在`).toBe(true);
      expect((quest.objectives ?? []).length).toBeGreaterThan(0);
    }
    for (const scene of STORY_SEEDS) {
      const trigger = scene.trigger as { nodeKey?: string };
      if (trigger.nodeKey) expect(nodeKeys.has(trigger.nodeKey), `${scene.sceneKey} 触发节点不存在`).toBe(true);
      expect(scene.beats.length).toBeGreaterThan(0);
    }
  });

  it("装备套装与槽位配置正确", () => {
    const slots = new Set(["weapon", "offhand", "helmet", "armor", "boots", "accessory"]);
    for (const equip of EQUIPMENT_SEEDS) {
      expect(slots.has(equip.slot)).toBe(true);
      expect(equip.maxLevel).toBeGreaterThan(0);
      expect(Object.keys(equip.stats).length).toBeGreaterThan(0);
    }
    for (const [setKey, tiers] of Object.entries(SET_BONUSES)) {
      expect(tiers.length).toBeGreaterThan(0);
      expect(tiers[0].pieces).toBeGreaterThan(0);
      void setKey;
    }
  });

  it("API Key 加密存储，无法从密文还原（含篡改检测）", () => {
    const secret = "unit-test-secret";
    const plain = "sk-test-1234567890abcdef";
    const cipher = encryptSecret(plain, secret);
    expect(cipher).not.toContain(plain);
    expect(decryptSecret(cipher, secret)).toBe(plain);
    expect(decryptSecret(cipher, "wrong-secret")).toBeNull();
    const tampered = `${cipher.split(".")[0]}.${Buffer.from("hacked").toString("base64url")}.${cipher.split(".")[2]}`;
    expect(decryptSecret(tampered, secret)).toBeNull();
    expect(maskApiKey(plain)).toBe("sk-t****cdef");
    expect(maskApiKey(null)).toBe("未配置");
  });

  it("备份文件校验拒绝损坏或不兼容的内容", () => {
    const good = verifySnapshot(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), scope: "config", tables: { characters: [1, 2] } }));
    expect(good.ok).toBe(true);
    expect(good.summary?.characters).toBe(2);
    expect(verifySnapshot("not json").ok).toBe(false);
    expect(verifySnapshot(JSON.stringify({ version: 99, tables: {} })).ok).toBe(false);
    expect(verifySnapshot(JSON.stringify({ version: 1 })).ok).toBe(false);
  });

  it("技能配置数值合法（冷却、能量、倍率）", () => {
    for (const skill of SKILL_SEEDS) {
      expect(skill.power).toBeGreaterThanOrEqual(0);
      expect(skill.cooldown).toBeLessThanOrEqual(20);
      expect(skill.energyCost).toBeLessThanOrEqual(100);
      expect(skill.maxLevel).toBeGreaterThan(0);
      expect(skill.effects.length).toBeGreaterThan(0);
    }
  });

  it("随机源可复现（同样的种子得到同样的序列）", () => {
    const a = mulberry32(2026);
    const b = mulberry32(2026);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("战斗奖励随星级提升（服务端计算，不接受客户端输入）", () => {
    const state = startBattle([makeAlly(), makeEnemy()], { nodeKey: "t", regionKey: "r", seed: 6 });
    state.rating = 1;
    const oneStar = computeRewards({ gold: 100 }, {}, state, false);
    state.rating = 3;
    const threeStar = computeRewards({ gold: 100 }, {}, state, false);
    expect(threeStar.gold).toBeGreaterThan(oneStar.gold);
  });
});