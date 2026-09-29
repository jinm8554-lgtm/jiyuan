import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { characters, gameProfiles, profilePity, recruitHistories, recruitPools } from "../../drizzle/schema";
import { getDb } from "../db";
import { RARITY_LABEL, round } from "../game/formulas";
import { advanceQuestProgress } from "../game/progress";
import { completeTutorialBusinessAction } from "../game/tutorial";
import { drawMany, isPoolOpen, normalizeRates, pityProgress, totalCost, type PityState, type PoolConfig } from "../game/recruit";
import { grantCharacter, grantEquipment, spendRecruitShards } from "../game/service";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveProfile } from "./_shared";

type Rarity = "R" | "SR" | "SSR";

async function loadPool(poolKey: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
  const [row] = await db.select().from(recruitPools).where(eq(recruitPools.poolKey, poolKey)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "卡池不存在" });
  return row;
}

function toPoolConfig(row: typeof recruitPools.$inferSelect): PoolConfig {
  return {
    poolKey: row.poolKey,
    name: row.name,
    poolType: row.poolType,
    rates: (row.rates ?? []) as PoolConfig["rates"],
    pity: (row.pity ?? {}) as PoolConfig["pity"],
    costSingle: row.costSingle,
    costTen: row.costTen,
    currency: row.currency,
    characterKeys: row.characterKeys ?? [],
    openAt: row.openAt,
    closeAt: row.closeAt,
    enabled: row.enabled,
  };
}

async function ensurePity(profileId: number, poolKey: string): Promise<PityState> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
  const [row] = await db
    .select()
    .from(profilePity)
    .where(and(eq(profilePity.profileId, profileId), eq(profilePity.poolKey, poolKey)))
    .limit(1);
  if (row) {
    return { totalPulls: row.totalPulls, pullsSinceSSR: row.pullsSinceSSR, pullsSinceSR: row.pullsSinceSR, guaranteedSSR: row.guaranteedSSR };
  }
  await db.insert(profilePity).values({ profileId, poolKey });
  return { totalPulls: 0, pullsSinceSSR: 0, pullsSinceSR: 0, guaranteedSSR: false };
}

export const recruitRouter = router({
  /** 卡池列表（含开放状态与保底进度；概率来自服务端配置，前端只做展示） */
  pools: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const rows = await db.select().from(recruitPools);
    const pitRows = await db.select().from(profilePity).where(eq(profilePity.profileId, profile.id));
    const now = new Date();

    const allFeaturedKeys = Array.from(new Set(rows.flatMap((row) => row.characterKeys ?? [])));
    const featuredRows = allFeaturedKeys.length > 0 ? await db.select().from(characters).where(inArray(characters.charKey, allFeaturedKeys)) : [];
    const featuredMap = new Map(featuredRows.map((char) => [char.charKey, char]));

    return rows
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => {
        const config = toPoolConfig(row);
        const pity = pitRows.find((p) => p.poolKey === row.poolKey);
        const state: PityState = pity
          ? { totalPulls: pity.totalPulls, pullsSinceSSR: pity.pullsSinceSSR, pullsSinceSR: pity.pullsSinceSR, guaranteedSSR: pity.guaranteedSSR }
          : { totalPulls: 0, pullsSinceSSR: 0, pullsSinceSR: 0, guaranteedSSR: false };
        const rates = normalizeRates(config.rates);
        return {
          poolKey: row.poolKey,
          name: row.name,
          poolType: row.poolType,
          description: row.description,
          bannerUrl: row.bannerUrl,
          open: isPoolOpen(config, now),
          enabled: row.enabled,
          openAt: row.openAt,
          closeAt: row.closeAt,
          costSingle: row.costSingle,
          costTen: row.costTen,
          currency: row.currency,
          rates: [
            { rarity: "SSR" as Rarity, rate: rates.SSR, label: RARITY_LABEL.SSR },
            { rarity: "SR" as Rarity, rate: rates.SR, label: RARITY_LABEL.SR },
            { rarity: "R" as Rarity, rate: rates.R, label: RARITY_LABEL.R },
          ],
          pity: pityProgress(config, state),
          pityRules: {
            hardPityText:
              Number((config.pity ?? {}).hardPity ?? 0) > 0
                ? `累计 ${(config.pity ?? {}).hardPity} 抽未获得${RARITY_LABEL.SSR}时，下一抽必出${RARITY_LABEL.SSR}`
                : "该卡池无硬保底",
            softPityText:
              Number((config.pity ?? {}).softStart ?? 0) > 0
                ? `第 ${(config.pity ?? {}).softStart} 抽后，每抽额外提升 ${round(Number((config.pity ?? {}).softStep ?? 0) * 100)}% 的${RARITY_LABEL.SSR}概率（自低稀有度概率中等量扣除）`
                : "该卡池无软保底",
            tenPullGuarantee: `每 10 连必出 1 名 ${String((config.pity ?? {}).tenPullMinRarity ?? "SR")} 及以上角色`,
          },
          featured: config.characterKeys
            .map((key) => featuredMap.get(key))
            .filter(Boolean)
            .map((char) => ({
              charKey: char!.charKey,
              name: char!.name,
              title: char!.title,
              rarity: char!.rarity,
              avatarUrl: char!.avatarUrl,
              portraitUrl: char!.portraitUrl,
            })),
          tenPullMinRarity: (config.pity.tenPullMinRarity as string) ?? "SR",
        };
      });
  }),

  /** 抽卡历史（最近 100 条） */
  history: protectedProcedure
    .input(z.object({ poolKey: z.string().max(48).optional(), limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
      const rows = await db
        .select()
        .from(recruitHistories)
        .where(eq(recruitHistories.profileId, profile.id))
        .orderBy(desc(recruitHistories.id))
        .limit(200);
      const filtered = (input?.poolKey ? rows.filter((row) => row.poolKey === input.poolKey) : rows).slice(0, input?.limit ?? 50);
      const configs = filtered.length > 0 ? await db.select().from(characters).where(inArray(characters.charKey, filtered.map((row) => row.charKey))) : [];
      const map = new Map(configs.map((c) => [c.charKey, c]));
      return filtered.map((row) => ({
        id: row.id,
        poolKey: row.poolKey,
        charKey: row.charKey,
        name: map.get(row.charKey)?.name ?? row.charKey,
        title: map.get(row.charKey)?.title ?? "",
        rarity: row.rarity,
        rarityLabel: RARITY_LABEL[row.rarity as Rarity],
        isNew: row.isNew,
        shards: row.shards,
        pityTriggered: row.pityTriggered,
        avatarUrl: map.get(row.charKey)?.avatarUrl ?? null,
        createdAt: row.createdAt,
      }));
    }),

  /** 执行抽取（服务端权威：概率、保底、重复转化、记录全部在服务端完成） */
  draw: protectedProcedure
    .input(z.object({ poolKey: z.string().min(1).max(48), count: z.union([z.literal(1), z.literal(10)]) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const poolRow = await loadPool(input.poolKey);
      const config = toPoolConfig(poolRow);
      const now = new Date();
      if (!isPoolOpen(config, now)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: config.enabled ? "该卡池当前未开放" : "该卡池已关闭" });
      }

      const cost = totalCost(config, input.count);
      const { spendResources } = await import("../game/service");
      const spend = await spendResources(profile.id, { [config.currency]: cost } as never);
      if (!spend.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${config.currency === "aether" ? "星辉" : config.currency} 不足，本次需要 ${cost}` });
      }

      // 候选角色：已发布 + 在池 + 池限定
      const allChars = await db.select().from(characters).where(eq(characters.status, "published"));
      const eligible = allChars.filter((char) => {
        if (!char.inRecruitPool) return false;
        if (config.characterKeys.length > 0) return config.characterKeys.includes(char.charKey);
        return true;
      });
      const candidates: Record<Rarity, string[]> = {
        R: eligible.filter((c) => c.rarity === "R").map((c) => c.charKey),
        SR: eligible.filter((c) => c.rarity === "SR").map((c) => c.charKey),
        SSR: eligible.filter((c) => c.rarity === "SSR").map((c) => c.charKey),
      };
      if (candidates.R.length + candidates.SR.length + candidates.SSR.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该卡池当前没有可招募的角色" });
      }

      const ownedRows = await db.select().from(recruitHistories).where(eq(recruitHistories.profileId, profile.id)).limit(1);
      void ownedRows;
      const { playerCharacters } = await import("../../drizzle/schema");
      const owned = await db.select().from(playerCharacters).where(eq(playerCharacters.profileId, profile.id));
      const ownedKeys = new Set(owned.map((row) => row.charKey));

      const pityState = await ensurePity(profile.id, input.poolKey);
      const seed = Math.floor(Math.random() * 2 ** 31);
      let counter = 0;
      const rng = () => {
        counter += 1;
        let a = (seed + counter * 2654435761) >>> 0;
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };

      const { results, pity } = drawMany({
        pool: config,
        pity: pityState,
        candidates,
        ownedKeys,
        count: input.count,
        rng,
      });

      if (results.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "招募失败：卡池内容为空" });
      }

      // 写入结果（重复角色转化；新角色入库）
      const output: Array<Record<string, unknown>> = [];
      for (const result of results) {
        const granted = await grantCharacter(profile.id, result.charKey, "recruit", (config.pity.duplicateShards as number) ?? 1);
        const charConfig = allChars.find((c) => c.charKey === result.charKey);
        output.push({
          charKey: result.charKey,
          name: charConfig?.name ?? result.charKey,
          title: charConfig?.title ?? "",
          rarity: result.rarity,
          rarityLabel: RARITY_LABEL[result.rarity],
          element: charConfig?.element ?? "physical",
          job: charConfig?.job ?? "warrior",
          portraitUrl: charConfig?.portraitUrl ?? null,
          avatarUrl: charConfig?.avatarUrl ?? null,
          isNew: granted.ok ? !granted.duplicate : false,
          shards: granted.ok ? granted.shards : 0,
          bondLevel: granted.ok ? granted.bondLevel : 1,
          pityTriggered: result.pityTriggered,
          softPityActive: result.softPityActive,
        });

        await db.insert(recruitHistories).values({
          profileId: profile.id,
          poolKey: input.poolKey,
          charKey: result.charKey,
          rarity: result.rarity,
          isNew: granted.ok ? !granted.duplicate : false,
          shards: granted.ok ? granted.shards : 0,
          pityTriggered: result.pityTriggered,
          rollIndex: result.index,
        });

        await advanceQuestProgress(profile.id, [
          { type: "recruit", charKey: result.charKey, rarity: result.rarity },
          { type: "own_character", charKey: result.charKey },
        ]);
      }

      await db
        .update(profilePity)
        .set({
          totalPulls: pity.totalPulls,
          pullsSinceSSR: pity.pullsSinceSSR,
          pullsSinceSR: pity.pullsSinceSR,
          guaranteedSSR: pity.guaranteedSSR,
        })
        .where(and(eq(profilePity.profileId, profile.id), eq(profilePity.poolKey, input.poolKey)));

      await completeTutorialBusinessAction(profile.id, "first_recruit");

      const profileRow = (await db.select().from(gameProfiles).where(eq(gameProfiles.id, profile.id)).limit(1))[0];
      const highRarityCount = output.filter((item) => item.rarity !== "R").length;

      return {
        ok: true,
        results: output,
        cost,
        currency: config.currency,
        pity: pityProgress(config, pity),
        resources: profileRow
          ? { gold: profileRow.gold, aether: profileRow.aether, recruitShards: profileRow.recruitShards, food: profileRow.food, wood: profileRow.wood, iron: profileRow.iron, renown: profileRow.renown }
          : null,
        highlights: {
          hasSSR: output.some((item) => item.rarity === "SSR"),
          newCount: output.filter((item) => item.isNew).length,
          shardTotal: output.reduce((sum, item) => sum + Number(item.shards ?? 0), 0),
          srPlus: highRarityCount,
        },
      };
    }),

  /** 重复角色转化的星辉信物兑换（用信物换装备，确保重复角色有价值） */
  exchangeShards: protectedProcedure
    .input(z.object({ equipKey: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const { EQUIPMENT_SEEDS } = await import("../game/data/equipments");
      const equipConfig = EQUIPMENT_SEEDS.find((item) => item.equipKey === input.equipKey);
      if (!equipConfig) throw new TRPCError({ code: "NOT_FOUND", message: "装备不存在" });

      const costMap = { R: 40, SR: 120, SSR: 320 } as const;
      const cost = costMap[equipConfig.rarity as Rarity];
      const spend = await spendRecruitShards(profile.id, cost);
      if (!spend.ok) throw new TRPCError({ code: "BAD_REQUEST", message: `星辉信物不足，需要 ${cost}，当前 ${spend.balance}` });

      await grantEquipment(profile.id, input.equipKey, "exchange");
      return { ok: true, cost, balance: spend.balance, equipKey: input.equipKey, name: equipConfig.name };
    }),

  /** 兑换商店（用星辉信物可换取的装备列表） */
  exchangeShop: protectedProcedure.query(async ({ ctx }) => {
    await resolveProfile(ctx);
    const { EQUIPMENT_SEEDS } = await import("../game/data/equipments");
    const costMap = { R: 40, SR: 120, SSR: 320 } as Record<string, number>;
    return EQUIPMENT_SEEDS.map((equip) => ({
      equipKey: equip.equipKey,
      name: equip.name,
      slot: equip.slot,
      rarity: equip.rarity,
      iconKey: equip.iconKey,
      stats: equip.stats,
      description: equip.description,
      cost: costMap[equip.rarity] ?? 40,
      affordable: true,
    })).sort((a, b) => (costMap[a.rarity] ?? 0) - (costMap[b.rarity] ?? 0));
  }),

  /** 概率公示（合规展示，数据来自服务端配置） */
  rates: protectedProcedure.input(z.object({ poolKey: z.string().min(1).max(48) })).query(async ({ ctx, input }) => {
    await resolveProfile(ctx);
    const row = await loadPool(input.poolKey);
    const config = toPoolConfig(row);
    const rates = normalizeRates(config.rates);
    const pity = config.pity ?? {};
    return {
      poolKey: row.poolKey,
      name: row.name,
      rates: [
        { rarity: "SSR", label: RARITY_LABEL.SSR, rate: rates.SSR },
        { rarity: "SR", label: RARITY_LABEL.SR, rate: rates.SR },
        { rarity: "R", label: RARITY_LABEL.R, rate: rates.R },
      ],
      pity: {
        softStart: Number(pity.softStart ?? 0),
        softStep: Number(pity.softStep ?? 0),
        hardPity: Number(pity.hardPity ?? 0),
        tenPullMinRarity: String(pity.tenPullMinRarity ?? "SR"),
        duplicateShards: Number(pity.duplicateShards ?? 1),
      },
      costSingle: row.costSingle,
      costTen: row.costTen,
      currency: row.currency,
      tenPullGuarantee: `每 10 连必出 1 名 ${String(pity.tenPullMinRarity ?? "SR")} 及以上角色`,
      hardPityText: Number(pity.hardPity ?? 0) > 0 ? `累计 ${pity.hardPity} 抽未获得 ${RARITY_LABEL.SSR} 时，下一抽必出 ${RARITY_LABEL.SSR}` : "该卡池无硬保底",
      softPityText:
        Number(pity.softStart ?? 0) > 0
          ? `第 ${pity.softStart} 抽后，每抽额外提升 ${round(Number(pity.softStep ?? 0) * 100)}% 的 ${RARITY_LABEL.SSR} 概率（提升部分自低稀有度概率中等量扣除）`
          : "该卡池无软保底",
      duplicateText: "重复角色自动转化为星辉信物与羁绊经验，可在兑换商店换取装备",
      contentNote: "本作全部角色为全年龄向设计，不包含任何成人向内容。概率与保底由服务端配置统一管理，客户端无法修改。",
    };
  }),
});
