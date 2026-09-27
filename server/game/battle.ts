import {
  clamp,
  elementMultiplier,
  emptyStats,
  healAmount,
  normalizeStats,
  resolveDamage,
  round,
  type ElementKey,
  type JobKey,
  type StatBlock,
} from "./formulas";
import { SKILL_BY_KEY, skillPowerAtLevel, type SkillSeed } from "./data/skills";

/**
 * 回合制战斗引擎（服务端权威 · 纯函数）
 * 设计目标：
 *  - 玩家可完全理解：每个回合我方行动 → 结算伤害/治疗/状态 → 敌方行动 → 进入下一回合
 *  - 属性/装备/技能/组合真实影响结果：元素克制、防御减伤、暴击、命中、行动顺序、状态效果
 *  - 提供 autoResolve 半自动战斗（服务端快速推演，返回完整事件流）
 */

export type UnitSide = "ally" | "enemy";

export type StatusEffect = {
  id: string;
  type: "buff" | "debuff" | "dot" | "shield" | "taunt" | "link" | "mark";
  stat?: string;
  value: number;
  /** 剩余回合 */
  duration: number;
  sourceKey: string;
  label: string;
};

export type BattleUnit = {
  id: string;
  charKey: string;
  sourceId?: number;
  name: string;
  title?: string;
  side: UnitSide;
  job: JobKey;
  element: ElementKey;
  rarity: "R" | "SR" | "SSR";
  level: number;
  row: "front" | "back";
  stats: StatBlock;
  maxHp: number;
  hp: number;
  energy: number;
  energyMax: number;
  skills: Array<{ skillKey: string; level: number }>;
  statuses: StatusEffect[];
  cooldowns: Record<string, number>;
  shield: number;
  /** 本场战斗累计（用于结算评价） */
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  alive: boolean;
  /** 每场战斗一次的免死（骑士被动等） */
  reviveUsed?: boolean;
};

export type BattleEvent = {
  turn: number;
  type:
    | "turn_start"
    | "action"
    | "damage"
    | "heal"
    | "shield"
    | "buff"
    | "debuff"
    | "status_expire"
    | "down"
    | "victory"
    | "defeat"
    | "info"
    | "revive";
  actorId?: string;
  actorKey?: string;
  actorName?: string;
  actionKey?: string;
  actionName?: string;
  targetId?: string;
  targetKey?: string;
  targetName?: string;
  value?: number;
  element?: ElementKey;
  crit?: boolean;
  status?: string;
  text?: string;
};

export type BattleState = {
  units: BattleUnit[];
  turn: number;
  order: string[];
  cursor: number;
  /** 等待玩家下达指令的单位（仅我方） */
  awaitingUnitId: string | null;
  finished: boolean;
  result: "ongoing" | "won" | "lost";
  rngSeed: number;
  /** 已完成的事件流 */
  log: BattleEvent[];
  nodeKey: string;
  regionKey: string;
  rating: number;
  /** 领地城墙等提供的全队减伤（0..1），来自建筑等级 */
  keepBonusReduction?: number;
};

export type BattleUnitInput = {
  id: string;
  charKey: string;
  sourceId?: number;
  name: string;
  title?: string;
  side: UnitSide;
  job: JobKey;
  element: ElementKey;
  rarity: "R" | "SR" | "SSR";
  level: number;
  row: "front" | "back";
  stats: Partial<StatBlock>;
  skills: Array<{ skillKey: string; level: number }>;
};

export type BattleAction = {
  unitId: string;
  /** 技能 key，或 'basic' / 'defend' */
  actionKey: string;
  targetId?: string;
};

export type BattleContext = {
  nodeKey: string;
  regionKey: string;
  /** 领地加成（建筑提供），例如 { damageReduction: 0.06, attackBonus: 0.04 } */
  keepBonus?: { damageReduction?: number; attackBonus?: number; defenseBonus?: number; hpBonus?: number };
  seed?: number;
  /** 敌方等级修正（关卡难度微调） */
  levelScale?: number;
};

/** 确定性随机（战斗过程可复现，便于测试与反作弊） */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withKeepBonus(unit: BattleUnitInput, bonus: BattleContext["keepBonus"]): StatBlock {
  const stats = normalizeStats(unit.stats);
  if (unit.side === "ally" && bonus) {
    if (bonus.attackBonus) {
      stats.atk = round(stats.atk * (1 + bonus.attackBonus));
      stats.mag = round(stats.mag * (1 + bonus.attackBonus));
    }
    if (bonus.defenseBonus) {
      stats.def = round(stats.def * (1 + bonus.defenseBonus));
      stats.res = round(stats.res * (1 + bonus.defenseBonus));
    }
    if (bonus.hpBonus) stats.hp = round(stats.hp * (1 + bonus.hpBonus));
  }
  return stats;
}

export function createUnitFromInput(input: BattleUnitInput, ctx: BattleContext): BattleUnit {
  const stats = withKeepBonus(input, ctx.keepBonus);
  const hp = Math.max(1, stats.hp);
  return {
    id: input.id,
    charKey: input.charKey,
    sourceId: input.sourceId,
    name: input.name,
    title: input.title,
    side: input.side,
    job: input.job,
    element: input.element,
    rarity: input.rarity,
    level: input.level,
    row: input.row,
    stats,
    maxHp: hp,
    hp,
    energy: input.side === "ally" ? 30 : 20,
    energyMax: 100,
    skills: input.skills,
    statuses: [],
    cooldowns: {},
    shield: 0,
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
    alive: true,
  };
}

export function startBattle(inputs: BattleUnitInput[], ctx: BattleContext): BattleState {
  const units = inputs.map((input) => createUnitFromInput(input, ctx));
  const state: BattleState = {
    units,
    turn: 1,
    order: [],
    cursor: 0,
    awaitingUnitId: null,
    finished: false,
    result: "ongoing",
    rngSeed: ctx.seed ?? Math.floor(Math.random() * 1e9),
    log: [],
    nodeKey: ctx.nodeKey,
    regionKey: ctx.regionKey,
    rating: 0,
  };
  refreshOrder(state, createRng(state.rngSeed));
  state.log.push({
    turn: 1,
    type: "turn_start",
    text: `第 1 回合开始 · 行动顺序：${state.order
      .map((id) => state.units.find((u) => u.id === id)?.name)
      .filter(Boolean)
      .join(" → ")}`,
  });
  advanceToNextActor(state, createRng(state.rngSeed));
  return state;
}

/** 行动顺序：速度倒序；受速度类增益影响，每回合重算 */
export function refreshOrder(state: BattleState, rng: () => number) {
  const living = state.units.filter((u) => u.alive);
  state.order = [...living]
    .map((u) => ({ id: u.id, spd: effectiveStat(u, "spd") + rng() * 2 }))
    .sort((a, b) => b.spd - a.spd || a.id.localeCompare(b.id))
    .map((entry) => entry.id);
  state.cursor = 0;
}

export function effectiveStat(unit: BattleUnit, key: keyof StatBlock): number {
  let value = unit.stats[key];
  for (const status of unit.statuses) {
    if (status.stat === key && (status.type === "buff" || status.type === "debuff")) {
      if (key === "crit" || key === "hit" || key === "dodge" || key === "critDmg") {
        value += status.type === "buff" ? status.value : -status.value;
      } else {
        value = round(value * (1 + (status.type === "buff" ? status.value : -status.value) / 100));
      }
    }
  }
  return Math.max(0, value);
}

function livingUnits(state: BattleState, side?: UnitSide): BattleUnit[] {
  return state.units.filter((u) => u.alive && (!side || u.side === side));
}

function findUnit(state: BattleState, id: string | undefined): BattleUnit | undefined {
  return state.units.find((u) => u.id === id);
}

/** 防御有效值（含无视防御的 pierce） */
function defenseValue(unit: BattleUnit, element: ElementKey, pierce = 0): number {
  const magic = element !== "physical";
  const base = magic ? effectiveStat(unit, "res") : effectiveStat(unit, "def");
  const vulnerable = unit.statuses
    .filter((s) => s.type === "debuff" && s.stat === "vulnerable")
    .reduce((sum, s) => sum + s.value, 0);
  const reduced = base * (1 - clamp(pierce, 0, 90) / 100);
  return Math.max(0, reduced * (1 - clamp(vulnerable, 0, 60) / 100));
}

function statsFor(unit: BattleUnit): StatBlock {
  return {
    ...unit.stats,
    atk: effectiveStat(unit, "atk"),
    def: effectiveStat(unit, "def"),
    mag: effectiveStat(unit, "mag"),
    res: effectiveStat(unit, "res"),
    spd: effectiveStat(unit, "spd"),
    crit: effectiveStat(unit, "crit"),
    critDmg: effectiveStat(unit, "critDmg"),
    hit: effectiveStat(unit, "hit"),
    dodge: effectiveStat(unit, "dodge"),
  };
}

function pushStatus(unit: BattleUnit, status: Omit<StatusEffect, "id">, state: BattleState, events: BattleEvent[], turn: number) {
  // 护盾可叠加（取较大值），其他同名状态刷新持续时间
  if (status.type === "shield") {
    unit.shield = Math.max(unit.shield, round(status.value));
    events.push({ turn, type: "shield", targetId: unit.id, targetName: unit.name, value: unit.shield, text: `${unit.name} 获得 ${unit.shield} 点护盾` });
    return;
  }
  const existingIndex = unit.statuses.findIndex((s) => s.type === status.type && s.stat === status.stat && s.sourceKey === status.sourceKey);
  const record: StatusEffect = { ...status, id: `${status.type}_${status.stat ?? "x"}_${unit.id}` };
  if (existingIndex >= 0) {
    const existing = unit.statuses[existingIndex];
    existing.duration = Math.max(existing.duration, status.duration);
    existing.value = status.type === "debuff" ? Math.max(existing.value, status.value) : Math.max(existing.value, status.value);
  } else {
    unit.statuses.push(record);
  }
  events.push({
    turn,
    type: status.type === "debuff" ? "debuff" : "buff",
    targetId: unit.id,
    targetName: unit.name,
    status: status.label,
    value: status.value,
    text: `${unit.name} ${status.type === "debuff" ? "受到" : "获得"}「${status.label}」`,
  });
}

/** 期间伤害应用（护盾 → 目标生命 → 联动的承伤者） */
function applyDamage(target: BattleUnit, amount: number, state: BattleState, events: BattleEvent[], turn: number, source?: BattleUnit) {
  let remaining = Math.max(0, round(amount));
  const absorbed = Math.min(target.shield, remaining);
  if (absorbed > 0) {
    target.shield -= absorbed;
    remaining -= absorbed;
  }
  target.hp = Math.max(0, target.hp - remaining);
  target.damageTaken += absorbed + remaining;
  if (source) source.damageDealt += absorbed + remaining;

  // 承伤誓约：把部分伤害转给立约者
  const links = target.statuses.filter((s) => s.type === "link");
  for (const link of links) {
    const bearer = state.units.find((u) => u.id === link.sourceKey && u.alive);
    if (!bearer || bearer.id === target.id) continue;
    const share = round((absorbed + remaining) * (link.value / 100));
    if (share <= 0) continue;
    const shielded = Math.min(bearer.shield, share);
    bearer.shield -= shielded;
    bearer.hp = Math.max(0, bearer.hp - (share - shielded));
    bearer.damageTaken += share;
    events.push({ turn, type: "info", targetId: bearer.id, targetName: bearer.name, value: share, text: `${bearer.name} 代为承受了 ${share} 点伤害` });
    if (bearer.hp <= 0) handleDown(bearer, state, events, turn);
  }

  if (target.hp <= 0) handleDown(target, state, events, turn);
}

function handleDown(unit: BattleUnit, state: BattleState, events: BattleEvent[], turn: number) {
  // 免死被动（余晖不灭）
  const hasUndying = unit.side === "ally" && unit.skills.some((s) => s.skillKey === "sk_undying_dusk") && !unit.reviveUsed;
  if (hasUndying && unit.hp <= 0) {
    unit.reviveUsed = true;
    unit.hp = Math.max(1, round(unit.maxHp * 0.15));
    unit.statuses.push({
      id: `shield_revive_${unit.id}`,
      type: "buff",
      stat: "res",
      value: 20,
      duration: 2,
      sourceKey: "sk_undying_dusk",
      label: "余晖护持",
    });
    events.push({ turn, type: "revive", targetId: unit.id, targetName: unit.name, text: `${unit.name} 在最后一刻站住了——「旗还在，阵线就在。」` });
    return;
  }
  unit.alive = false;
  unit.hp = 0;
  unit.statuses = [];
  unit.shield = 0;
  events.push({ turn, type: "down", targetId: unit.id, targetName: unit.name, text: `${unit.name} 被击退，退出了战斗。` });
}

function applyHeal(target: BattleUnit, amount: number, state: BattleState, events: BattleEvent[], turn: number, source?: BattleUnit) {
  const before = target.hp;
  target.hp = Math.min(target.maxHp, target.hp + amount);
  const healed = target.hp - before;
  if (source) source.healingDone += healed;
  const overheal = amount - healed;
  if (overheal > 0 && source?.skills.some((s) => s.skillKey === "sk_never_dark")) {
    const cap = round(target.maxHp * 0.2);
    const shieldGain = Math.min(cap, Math.max(0, target.shield + overheal) - target.shield);
    if (shieldGain > 0) {
      target.shield += shieldGain;
      events.push({ turn, type: "shield", targetId: target.id, targetName: target.name, value: target.shield, text: `治疗溢出的 ${shieldGain} 点转化为护盾` });
    }
  }
  events.push({ turn, type: "heal", targetId: target.id, targetName: target.name, value: healed, text: `${target.name} 回复了 ${healed} 点生命` });
}

function chooseTargetForEnemy(state: BattleState, actor: BattleUnit, rng: () => number): BattleUnit | undefined {
  const allies = livingUnits(state, "ally");
  if (allies.length === 0) return undefined;
  const taunters = allies.filter((a) => a.statuses.some((s) => s.type === "taunt"));
  const pool = taunters.length > 0 ? taunters : allies;
  // 前排被选中的概率更高（2/3）
  const front = pool.filter((a) => a.row === "front");
  const back = pool.filter((a) => a.row === "back");
  if (front.length > 0 && (back.length === 0 || rng() < 0.66)) {
    return front[Math.min(front.length - 1, Math.floor(rng() * front.length))];
  }
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

function chooseEnemySkill(actor: BattleUnit, rng: () => number): { skillKey: string; skill?: SkillSeed } {
  const usable = actor.skills.filter((s) => (actor.cooldowns[s.skillKey] ?? 0) <= 0 && actor.energy >= (SKILL_BY_KEY.get(s.skillKey)?.energyCost ?? 0));
  if (usable.length > 0 && rng() < 0.62) {
    const picked = usable[Math.min(usable.length - 1, Math.floor(rng() * usable.length))];
    return { skillKey: picked.skillKey, skill: SKILL_BY_KEY.get(picked.skillKey) };
  }
  return { skillKey: "basic" };
}

/** 执行一次行动（我方或敌方），返回产生的事件 */
export function executeAction(state: BattleState, action: BattleAction, rng: () => number): BattleEvent[] {
  const events: BattleEvent[] = [];
  const actor = findUnit(state, action.unitId);
  if (!actor || !actor.alive) return events;

  // 眩晕判定
  const stunned = actor.statuses.find((s) => s.stat === "stun");
  if (stunned) {
    stunned.duration -= 1;
    events.push({ turn: state.turn, type: "info", actorId: actor.id, actorName: actor.name, text: `${actor.name} 被束缚，无法行动。` });
    if (stunned.duration <= 0) actor.statuses = actor.statuses.filter((s) => s !== stunned);
    return events;
  }

  const isDefend = action.actionKey === "defend";
  const skillEntry = isDefend ? undefined : SKILL_BY_KEY.get(action.actionKey);
  const skillLevel = actor.skills.find((s) => s.skillKey === action.actionKey)?.level ?? 1;
  const power = skillEntry ? skillPowerAtLevel(skillEntry, skillLevel) : 100;

  const allies = livingUnits(state, actor.side);
  const enemies = livingUnits(state, actor.side === "ally" ? "enemy" : "ally");
  let target = findUnit(state, action.targetId);

  if (isDefend) {
    actor.energy = Math.min(actor.energyMax, actor.energy + 20);
    events.push({ turn: state.turn, type: "action", actorId: actor.id, actorName: actor.name, actionName: "备战", text: `${actor.name} 转入防御姿态。` });
    pushStatus(actor, { type: "shield", value: round(actor.maxHp * 0.18), duration: 1, sourceKey: "defend", label: "防御姿态" }, state, events, state.turn);
    return events;
  }

  if (!skillEntry) {
    return events;
  }

  // 目标选择（自动补全）
  const scope = skillEntry.targetType;
  if (!target || !target.alive) {
    if (scope === "enemy") target = enemies[0];
    else if (scope === "ally") target = allies[0];
  }

  events.push({
    turn: state.turn,
    type: "action",
    actorId: actor.id,
    actorKey: actor.charKey,
    actorName: actor.name,
    actionKey: skillEntry.skillKey,
    actionName: skillEntry.name,
    targetId: target?.id,
    targetKey: target?.charKey,
    targetName: target?.name,
    text: `${actor.name} 使用「${skillEntry.name}」`,
  });

  const powerScale = power / Math.max(1, skillEntry.power);

  for (const effect of skillEntry.effects) {
    const type = String(effect.type ?? "");
    const rawValue = Number(effect.value ?? 0);
    const value = effect.type === "damage" || effect.type === "heal" ? round(rawValue * powerScale) : rawValue;
    const chance = effect.chance === undefined ? 100 : Number(effect.chance);
    const effectScope = String(effect.scope ?? (scope === "all_allies" ? "all_allies" : scope === "all_enemies" ? "all_enemies" : "single"));

    const rollPass = rng() * 100 <= chance;

    if (type === "damage") {
      const targets = effectScope === "all_enemies" ? enemies : target ? [target] : [];
      for (const t of targets) {
        if (!t.alive) continue;
        if (actor.side === "ally") actor.energy = Math.min(actor.energyMax, actor.energy + 15);
        const result = resolveDamage({
          attacker: statsFor(actor),
          defender: {
            ...statsFor(t),
            def: defenseValue(t, skillEntry.element, Number(effect.pierce ?? 0)),
            res: defenseValue(t, skillEntry.element, Number(effect.pierce ?? 0)),
          },
          power: value,
          attackElement: skillEntry.element,
          roll: rng(),
        });
        if (!result.hit) {
          events.push({ turn: state.turn, type: "info", actorId: actor.id, targetId: t.id, targetName: t.name, text: `${actor.name} 的攻击被 ${t.name} 闪过。` });
          continue;
        }
        const reduction = actor.side === "enemy" ? clamp(ctxReduction(state), 0, 0.6) : clamp(state.keepBonusReduction ?? 0, 0, 0.6);
        const finalValue = Math.max(1, round(result.value * (1 - reduction)));
        applyDamage(t, finalValue, state, events, state.turn, actor);
        events.push({
          turn: state.turn,
          type: "damage",
          actorId: actor.id,
          actorName: actor.name,
          targetId: t.id,
          targetKey: t.charKey,
          targetName: t.name,
          value: finalValue,
          element: skillEntry.element,
          crit: result.crit,
          text: `${t.name} 受到 ${finalValue} 点${result.crit ? "暴击" : ""}伤害${result.element > 1 ? "（克制）" : result.element < 1 ? "（被抵抗）" : ""}`,
        });
        // 命中叠加（听见风）
        if (actor.side === "ally" && actor.skills.some((s) => s.skillKey === "sk_hearing_wind")) {
          const stack = actor.statuses.find((s) => s.sourceKey === "sk_hearing_wind" && s.stat === "atk");
          if (stack && stack.value < 20) stack.value += 4;
          else pushStatus(actor, { type: "buff", stat: "atk", value: 4, duration: 99, sourceKey: "sk_hearing_wind", label: "风之引导" }, state, events, state.turn);
        }
        // 暴击刻印（铭刻）
        if (result.crit && t.skills.some(() => false)) {
          /* 敌方不具备该被动 */
        }
        if (result.crit && actor.side === "ally" && actor.skills.some((s) => s.skillKey === "sk_engrave")) {
          const marks = t.statuses.filter((s) => s.sourceKey === "sk_engrave");
          if (marks.length < 3) {
            pushStatus(t, { type: "debuff", stat: "vulnerable", value: 12, duration: 99, sourceKey: "sk_engrave", label: "铭刻" }, state, events, state.turn);
          }
        }
      }
      continue;
    }

    if (type === "heal") {
      const targets = effectScope === "all_allies" ? allies : effectScope === "self" ? [actor] : target ? [target] : [];
      for (const t of targets) {
        if (!t.alive) continue;
        const amount = healAmount({ attacker: statsFor(actor), defender: statsFor(t), power: value, attackElement: "holy", roll: rng() });
        applyHeal(t, amount, state, events, state.turn, actor);
      }
      continue;
    }

    if (!rollPass) continue;

    if (type === "shield") {
      const targets = effectScope === "all_allies" ? allies : effectScope === "self" ? [actor] : target ? [target] : [];
      for (const t of targets) {
        pushStatus(t, { type: "shield", value: round(t.maxHp * (value / 100)), duration: Number(effect.duration ?? 2), sourceKey: skillEntry.skillKey, label: "护盾" }, state, events, state.turn);
      }
      continue;
    }

    if (type === "buff") {
      const targets = effectScope === "all_allies" ? allies : effectScope === "self" ? [actor] : target ? [target] : [];
      for (const t of targets) {
        pushStatus(t, { type: "buff", stat: String(effect.stat ?? "atk"), value, duration: Number(effect.duration ?? 2), sourceKey: skillEntry.skillKey, label: skillEntry.name }, state, events, state.turn);
      }
      continue;
    }

    if (type === "debuff") {
      const targets = effectScope === "all_enemies" ? enemies : target ? [target] : [];
      for (const t of targets) {
        if (!t.alive) continue;
        pushStatus(t, { type: "debuff", stat: String(effect.stat ?? "def"), value, duration: Number(effect.duration ?? 2), sourceKey: skillEntry.skillKey, label: skillEntry.name }, state, events, state.turn);
      }
      continue;
    }

    if (type === "taunt") {
      pushStatus(actor, { type: "taunt", value: 0, duration: Number(effect.duration ?? 2), sourceKey: skillEntry.skillKey, label: "嘲讽" }, state, events, state.turn);
      continue;
    }

    if (type === "link") {
      if (target) {
        pushStatus(target, { type: "link", value, duration: Number(effect.duration ?? 3), sourceKey: actor.id, label: "誓约联结" }, state, events, state.turn);
      }
      continue;
    }

    if (type === "cleanse") {
      const targets = effectScope === "all_allies" ? allies : target ? [target] : [actor];
      for (const t of targets) {
        const removed = t.statuses.filter((s) => s.type === "debuff").slice(0, Math.max(1, value));
        if (removed.length > 0) {
          t.statuses = t.statuses.filter((s) => !removed.includes(s));
          events.push({ turn: state.turn, type: "info", targetId: t.id, targetName: t.name, text: `${t.name} 清除了 ${removed.length} 个减益效果` });
        }
      }
      continue;
    }

    if (type === "dispel") {
      if (target) {
        const removed = target.statuses.filter((s) => s.type === "buff").slice(0, Math.max(1, value));
        if (removed.length > 0) {
          target.statuses = target.statuses.filter((s) => !removed.includes(s));
          events.push({ turn: state.turn, type: "info", targetId: target.id, targetName: target.name, text: `${target.name} 的 ${removed.length} 个增益被解除` });
        }
      }
      continue;
    }

    if (type === "energy") {
      const targets = effectScope === "self" ? [actor] : target ? [target] : [actor];
      for (const t of targets) {
        t.energy = clamp(t.energy + value, 0, t.energyMax);
      }
      continue;
    }
  }

  // 被动：施法叠加（咏唱叠加）
  if (actor.side === "ally" && skillEntry.kind === "active" && actor.skills.some((s) => s.skillKey === "sk_chant_stack") && skillEntry.skillKey !== "sk_basic_attack") {
    const existing = actor.statuses.find((s) => s.sourceKey === "sk_chant_stack");
    if (existing && existing.value < 24) existing.value += 6;
    else if (!existing) pushStatus(actor, { type: "buff", stat: "mag", value: 6, duration: 99, sourceKey: "sk_chant_stack", label: "咏唱叠加" }, state, events, state.turn);
  }

  if (skillEntry.cooldown > 0) {
    actor.cooldowns[skillEntry.skillKey] = skillEntry.cooldown + 1;
  }
  if (skillEntry.energyCost > 0) {
    actor.energy = Math.max(0, actor.energy - skillEntry.energyCost);
  }

  return events;
}

function ctxReduction(state: BattleState): number {
  return state.keepBonusReduction ?? 0;
}

/** 回合结束处理：状态倒计时、持续伤害、能量恢复、被动回复 */
export function endTurn(state: BattleState, events: BattleEvent[], rng: () => number) {
  for (const unit of state.units) {
    if (!unit.alive) continue;
    unit.cooldowns = Object.fromEntries(
      Object.entries(unit.cooldowns)
        .map(([key, value]) => [key, value - 1] as const)
        .filter(([, value]) => value > 0),
    );

    // 状态倒计时与持续伤害
    const expired: StatusEffect[] = [];
    for (const status of unit.statuses) {
      if (status.type === "dot") {
        applyDamage(unit, status.value, state, events, state.turn);
      }
      status.duration -= 1;
      if (status.duration <= 0) expired.push(status);
    }
    for (const status of expired) {
      events.push({ turn: state.turn, type: "status_expire", targetId: unit.id, targetName: unit.name, status: status.label, text: `${unit.name} 的「${status.label}」已结束` });
    }
    unit.statuses = unit.statuses.filter((s) => !expired.includes(s));

    // 被动回复
    if (unit.alive && unit.side === "ally") {
      if (unit.skills.some((s) => s.skillKey === "sk_watchman")) {
        applyHeal(unit, round(unit.maxHp * 0.02), state, events, state.turn);
      }
      if (unit.skills.some((s) => s.skillKey === "sk_memory_tree")) {
        const allies = livingUnits(state, "ally");
        for (const ally of allies) applyHeal(ally, round(ally.maxHp * 0.03), state, events, state.turn, unit);
      }
    }
    unit.energy = Math.min(unit.energyMax, unit.energy + 8);
    void rng;
  }
}

/** 校验胜负 */
export function checkBattleEnd(state: BattleState, events: BattleEvent[]): boolean {
  const allies = livingUnits(state, "ally");
  const enemies = livingUnits(state, "enemy");
  if (enemies.length === 0) {
    state.finished = true;
    state.result = "won";
    state.rating = computeRating(state);
    events.push({ turn: state.turn, type: "victory", text: "战斗胜利。" });
    return true;
  }
  if (allies.length === 0) {
    state.finished = true;
    state.result = "lost";
    state.rating = 0;
    events.push({ turn: state.turn, type: "defeat", text: "队伍被击退，撤回领地。" });
    return true;
  }
  return false;
}

/** 星级评价（用于奖励加成）：无人阵亡 +2 星级，回合数少 +1 */
export function computeRating(state: BattleState): number {
  const downCount = state.units.filter((u) => u.side === "ally" && !u.alive).length;
  let stars = 1;
  if (downCount === 0) stars += 1;
  if (state.turn <= 6) stars += 1;
  return clamp(stars, 1, 3);
}

/** 推进到下一个可行动单位；若轮到敌方则连续自动行动，直到需要玩家输入或战斗结束 */
export function advanceToNextActor(state: BattleState, rng: () => number) {
  if (state.finished) return;
  let guard = 0;
  while (guard < 200) {
    guard += 1;
    if (state.cursor >= state.order.length) {
      const events: BattleEvent[] = [];
      endTurn(state, events, rng);
      state.log.push(...events);
      if (checkBattleEnd(state, events)) return;
      state.turn += 1;
      refreshOrder(state, rng);
      state.log.push({
        turn: state.turn,
        type: "turn_start",
        text: `第 ${state.turn} 回合开始`,
      });
      continue;
    }
    const unit = findUnit(state, state.order[state.cursor]);
    state.cursor += 1;
    if (!unit || !unit.alive) continue;

    if (unit.side === "ally") {
      state.awaitingUnitId = unit.id;
      return;
    }

    // 敌方自动行动
    const target = chooseTargetForEnemy(state, unit, rng);
    const { skillKey } = chooseEnemySkill(unit, rng);
    const events = executeAction(state, { unitId: unit.id, actionKey: skillKey, targetId: target?.id }, rng);
    state.log.push(...events);
    if (checkBattleEnd(state, events)) return;
  }
}

/**
 * 半自动战斗：从当前状态快速推演至结束
 * 我方 AI 策略：优先治疗濒死队友 → 使用可用技能 → 普攻
 */
export function autoResolve(state: BattleState, rng: () => number, maxTurns = 60): BattleEvent[] {
  const allEvents: BattleEvent[] = [];
  let guard = 0;
  while (!state.finished && state.turn <= maxTurns && guard < 4000) {
    guard += 1;
    const unitId = state.awaitingUnitId;
    if (!unitId) {
      advanceToNextActor(state, rng);
      continue;
    }
    const actor = findUnit(state, unitId);
    if (!actor || !actor.alive) {
      state.awaitingUnitId = null;
      advanceToNextActor(state, rng);
      continue;
    }
    const enemies = livingUnits(state, "enemy");
    const allies = livingUnits(state, "ally");
    const target = enemies[0];

    // 治疗优先
    const wounded = allies.filter((a) => a.hp / a.maxHp < 0.55);
    const healSkill = actor.skills.find((s) => {
      const skill = SKILL_BY_KEY.get(s.skillKey);
      return skill && skill.effects.some((e) => e.type === "heal") && (actor.cooldowns[s.skillKey] ?? 0) <= 0 && actor.energy >= skill.energyCost;
    });
    if (healSkill && wounded.length > 0) {
      const skill = SKILL_BY_KEY.get(healSkill.skillKey)!;
      const healTarget = skill.targetType === "ally" ? wounded[0] : undefined;
      const events = executeAction(state, { unitId: actor.id, actionKey: healSkill.skillKey, targetId: healTarget?.id }, rng);
      allEvents.push(...events);
      state.log.push(...events);
      state.awaitingUnitId = null;
      if (checkBattleEnd(state, events)) break;
      advanceToNextActor(state, rng);
      continue;
    }

    // 可用技能
    const usable = actor.skills
      .map((s) => ({ ...s, skill: SKILL_BY_KEY.get(s.skillKey) }))
      .filter((entry) => entry.skill && (actor.cooldowns[entry.skillKey] ?? 0) <= 0 && actor.energy >= entry.skill.energyCost && entry.skill.kind === "active" && entry.skill.targetType !== "self");
    const choice = usable.length > 0 ? usable[Math.floor(rng() * usable.length)] : null;
    const actionKey = choice ? choice.skillKey : "sk_basic_attack";
    const actionTarget = choice && choice.skill?.targetType === "ally" ? allies[0] : target;
    const events = executeAction(state, { unitId: actor.id, actionKey, targetId: actionTarget?.id }, rng);
    allEvents.push(...events);
    state.log.push(...events);
    state.awaitingUnitId = null;
    if (checkBattleEnd(state, events)) break;
    advanceToNextActor(state, rng);
  }
  if (!state.finished && state.turn > maxTurns) {
    state.finished = true;
    state.result = "lost";
    state.log.push({ turn: state.turn, type: "defeat", text: "战斗超时，队伍撤回领地。" });
  }
  return allEvents;
}

/** 战斗奖励结算（服务端权威，基于节点配置 + 星级加成） */
export function computeRewards(
  nodeRewards: Record<string, unknown>,
  firstClearRewards: Record<string, unknown>,
  state: BattleState,
  isFirstClear: boolean,
) {
  const base = (isFirstClear ? firstClearRewards : nodeRewards) ?? {};
  const starMultiplier = 1 + (state.rating - 1) * 0.15;
  const pick = (key: string) => round(Number((base as Record<string, number>)[key] ?? 0) * starMultiplier);

  const items: Array<{ equipKey: string; chance: number }> = Array.isArray((base as { items?: unknown }).items)
    ? (((base as { items?: Array<{ equipKey: string; chance: number }> }).items ?? []).filter(Boolean) as Array<{ equipKey: string; chance: number }>)
    : [];

  const firstClearItems = isFirstClear && Array.isArray((firstClearRewards as { items?: unknown }).items)
    ? (((firstClearRewards as { items?: Array<{ equipKey: string; chance: number }> }).items ?? []).filter(Boolean) as Array<{ equipKey: string; chance: number }>)
    : [];

  return {
    gold: pick("gold"),
    food: pick("food"),
    wood: pick("wood"),
    iron: pick("iron"),
    aether: pick("aether"),
    renown: pick("renown"),
    exp: pick("exp"),
    items: (isFirstClear ? firstClearItems : items),
    starMultiplier,
  };
}
