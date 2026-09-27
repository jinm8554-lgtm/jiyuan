import { RARITY_DUPLICATE_BOND, RARITY_DUPLICATE_SHARDS, type RarityKey } from "./formulas";

/**
 * 招募（抽取）引擎 —— 纯函数实现
 * 概率、保底、十连保底、重复转化全部由「卡池配置」驱动（来自数据库，前端不可覆盖）。
 */

export type PoolRates = Array<{ rarity: RarityKey | string; rate: number }>;

export type PoolPityConfig = {
  /** 软保底起始抽数：超过后每抽提升 SSR 概率 */
  softStart?: number;
  /** 软保底每抽增加的概率（绝对值） */
  softStep?: number;
  /** 硬保底：达到该抽数必定 SSR */
  hardPity?: number;
  /** 十连保底的最低稀有度 */
  tenPullMinRarity?: RarityKey | string;
  /** 重复转化倍率 */
  duplicateShards?: number;
};

export type PoolConfig = {
  poolKey: string;
  name: string;
  poolType: "normal" | "rare" | "event";
  rates: PoolRates;
  pity: PoolPityConfig;
  costSingle: number;
  costTen: number;
  currency: string;
  characterKeys: string[];
  openAt?: Date | string | null;
  closeAt?: Date | string | null;
  enabled: boolean;
};

export type PityState = {
  totalPulls: number;
  pullsSinceSSR: number;
  pullsSinceSR: number;
  guaranteedSSR: boolean;
};

export type DrawResult = {
  index: number;
  charKey: string;
  rarity: RarityKey;
  isNew: boolean;
  shards: number;
  bondExp: number;
  pityTriggered: boolean;
  softPityActive: boolean;
  roll: number;
};

export type DrawContext = {
  pool: PoolConfig;
  pity: PityState;
  /** 每个稀有度下可用于抽取的角色 key（已按 status/pool 过滤） */
  candidates: Record<RarityKey, string[]>;
  /** 玩家已拥有的角色 key（用于判定新角色 / 重复转化） */
  ownedKeys: ReadonlySet<string>;
  count: number;
  /** 0..1 随机源，可注入以便单测 */
  rng: () => number;
};

const RARITY_ORDER: RarityKey[] = ["R", "SR", "SSR"];
const RARITY_INDEX: Record<RarityKey, number> = { R: 0, SR: 1, SSR: 2 };

export function isPoolOpen(pool: Pick<PoolConfig, "enabled" | "openAt" | "closeAt">, now: Date): boolean {
  if (!pool.enabled) return false;
  if (pool.openAt) {
    const open = typeof pool.openAt === "string" ? new Date(pool.openAt) : pool.openAt;
    if (!Number.isNaN(open.getTime()) && now.getTime() < open.getTime()) return false;
  }
  if (pool.closeAt) {
    const close = typeof pool.closeAt === "string" ? new Date(pool.closeAt) : pool.closeAt;
    if (!Number.isNaN(close.getTime()) && now.getTime() > close.getTime()) return false;
  }
  return true;
}

/** 归一化后的基础概率表 */
export function normalizeRates(rates: PoolRates): Record<RarityKey, number> {
  const out: Record<RarityKey, number> = { R: 0, SR: 0, SSR: 0 };
  for (const entry of rates ?? []) {
    const key = entry.rarity as RarityKey;
    if (RARITY_ORDER.includes(key) && Number.isFinite(entry.rate) && entry.rate > 0) {
      out[key] += entry.rate;
    }
  }
  const total = out.R + out.SR + out.SSR;
  if (total <= 0) return { R: 1, SR: 0, SSR: 0 };
  return { R: out.R / total, SR: out.SR / total, SSR: out.SSR / total };
}

/**
 * 计算本次抽取的实际概率（含软保底加权）
 * 软保底：当 pullsSinceSSR >= softStart 时，每多一抽 SSR 概率 +softStep，
 * 该增量从 R 的概率中等量扣除（不足时继续从 SR 扣除）。
 */
export function effectiveRates(pool: PoolConfig, pity: PityState): Record<RarityKey, number> {
  const base = normalizeRates(pool.rates);
  const softStart = pool.pity?.softStart ?? 9999;
  const softStep = pool.pity?.softStep ?? 0;
  const hardPity = pool.pity?.hardPity ?? 0;

  const nextPull = pity.pullsSinceSSR + 1;
  if (hardPity > 0 && nextPull >= hardPity) return { R: 0, SR: 0, SSR: 1 };
  if (pity.guaranteedSSR && hardPity > 0 && nextPull >= hardPity) return { R: 0, SR: 0, SSR: 1 };

  let bonus = 0;
  if (softStep > 0 && nextPull > softStart) bonus = (nextPull - softStart) * softStep;

  if (bonus <= 0) return base;

  const out = { ...base };
  out.SSR = Math.min(1, base.SSR + bonus);
  let remaining = out.SSR - base.SSR;
  const takeFromR = Math.min(out.R, remaining);
  out.R -= takeFromR;
  remaining -= takeFromR;
  if (remaining > 0) out.SR = Math.max(0, out.SR - remaining);

  const total = out.R + out.SR + out.SSR;
  return total > 0 ? { R: out.R / total, SR: out.SR / total, SSR: out.SSR / total } : base;
}

/** 依据概率表抽取稀有度 */
export function rollRarity(rates: Record<RarityKey, number>, value: number): RarityKey {
  const v = Math.min(0.999999, Math.max(0, value));
  let acc = 0;
  for (const key of ["SSR", "SR", "R"] as RarityKey[]) {
    acc += rates[key];
    if (v < acc) return key;
  }
  return "R";
}

function pick<T>(list: T[], rng: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
}

/** 在高稀有度无候选时向下回退 */
function resolveCandidate(
  candidates: Record<RarityKey, string[]>,
  rarity: RarityKey,
  rng: () => number,
): { charKey: string; rarity: RarityKey } | null {
  for (let i = RARITY_INDEX[rarity]; i >= 0; i -= 1) {
    const list = candidates[RARITY_ORDER[i]] ?? [];
    if (list.length > 0) return { charKey: pick(list, rng), rarity: RARITY_ORDER[i] };
  }
  for (let i = RARITY_INDEX[rarity] + 1; i < RARITY_ORDER.length; i += 1) {
    const list = candidates[RARITY_ORDER[i]] ?? [];
    if (list.length > 0) return { charKey: pick(list, rng), rarity: RARITY_ORDER[i] };
  }
  return null;
}

/**
 * 执行多次抽取。返回结果与更新后的保底状态。
 * 规则：
 *  - 硬保底必出最高稀有度（池内最高档，若该池无 SSR 候选则取可用最高档）
 *  - 十连（count>=10）保底：若前 count-1 抽均低于 tenPullMinRarity，则最后一抽必出该稀有度及以上
 *  - 重复角色转化为星辉信物 + 羁绊经验（不再入库新角色）
 */
export function drawMany(ctx: DrawContext): { results: DrawResult[]; pity: PityState } {
  const pool = ctx.pool;
  const minRarity = (pool.pity?.tenPullMinRarity as RarityKey) ?? "SR";
  const highestAvailable: RarityKey =
    (ctx.candidates.SSR?.length ?? 0) > 0 ? "SSR" : (ctx.candidates.SR?.length ?? 0) > 0 ? "SR" : "R";

  const pity: PityState = { ...ctx.pity };
  const results: DrawResult[] = [];
  const seen = new Set<string>();
  let bestRarity = -1;

  for (let i = 0; i < ctx.count; i += 1) {
    const rates = effectiveRates(pool, pity);
    let rarity = rollRarity(rates, ctx.rng());

    // 硬保底 / 指定保底
    const nextPull = pity.pullsSinceSSR + 1;
    const hardPity = pool.pity?.hardPity ?? 0;
    let pityTriggered = false;
    if (hardPity > 0 && nextPull >= hardPity) {
      if (RARITY_INDEX[rarity] < RARITY_INDEX[highestAvailable]) rarity = highestAvailable;
      pityTriggered = RARITY_INDEX[rarity] >= RARITY_INDEX[highestAvailable];
    }

    // 十连保底
    const isLastOfTen = ctx.count >= 10 && i === ctx.count - 1;
    if (isLastOfTen && bestRarity < RARITY_INDEX[minRarity]) {
      if (RARITY_INDEX[rarity] < RARITY_INDEX[minRarity]) rarity = minRarity;
      pityTriggered = true;
    }

    const resolved = resolveCandidate(ctx.candidates, rarity, ctx.rng);
    if (!resolved) {
      // 池内无可用角色（例如全部下架）——直接终止，不消耗保底
      break;
    }
    const { charKey } = resolved;
    rarity = resolved.rarity;

    const isNew = !ctx.ownedKeys.has(charKey) && !seen.has(charKey);
    seen.add(charKey);
    bestRarity = Math.max(bestRarity, RARITY_INDEX[rarity]);

    const shardMultiplier = pool.pity?.duplicateShards ?? 1;
    results.push({
      index: i + 1,
      charKey,
      rarity,
      isNew,
      shards: isNew ? 0 : Math.round(RARITY_DUPLICATE_SHARDS[rarity] * shardMultiplier),
      bondExp: isNew ? 0 : Math.round(RARITY_DUPLICATE_BOND[rarity] * shardMultiplier),
      pityTriggered,
      softPityActive: (pool.pity?.softStart ?? 9999) < nextPull,
      roll: Number(ctx.rng().toFixed(4)),
    });

    pity.totalPulls += 1;
    if (rarity === "SSR") {
      pity.pullsSinceSSR = 0;
      pity.pullsSinceSR = 0;
      pity.guaranteedSSR = false;
    } else {
      pity.pullsSinceSSR += 1;
      if (rarity === "SR") pity.pullsSinceSR = 0;
      else pity.pullsSinceSR += 1;
    }
  }

  // 每 100 抽追加一次保底标记（体验层：下次 SSR 更容易），由后台配置决定是否使用
  if (pool.pity?.hardPity && pity.pullsSinceSSR >= (pool.pity.hardPity as number)) {
    pity.guaranteedSSR = true;
  }

  return { results, pity };
}

export function totalCost(pool: PoolConfig, count: number): number {
  if (count >= 10) return pool.costTen * Math.floor(count / 10) + pool.costSingle * (count % 10);
  return pool.costSingle * count;
}

/** 保底进度展示用（前端只展示，不参与计算） */
export function pityProgress(pool: PoolConfig, pity: PityState) {
  const hardPity = (pool.pity?.hardPity as number) ?? 80;
  const softStart = (pool.pity?.softStart as number) ?? 60;
  return {
    totalPulls: pity.totalPulls,
    untilHardPity: Math.max(0, hardPity - pity.pullsSinceSSR),
    softPityActive: pity.pullsSinceSSR >= softStart,
    hardPity,
    softStart,
  };
}

/** 确定性随机源（供服务端与单测使用） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 无候选时的兜底（防御性，正常不会触发） */
export const EMPTY_PITY: PityState = { totalPulls: 0, pullsSinceSSR: 0, pullsSinceSR: 0, guaranteedSSR: false };
