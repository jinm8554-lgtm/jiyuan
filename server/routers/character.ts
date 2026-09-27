import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { characters, equipments, playerCharacters, playerEquipments, skills } from "../../drizzle/schema";
import { getDb } from "../db";
import { EQUIPMENT_SEEDS, SET_BONUSES, SLOT_LABEL } from "../game/data/equipments";
import {
  ASCENSION_STAT_BONUS,
  MAX_LEVEL_BY_ASCENSION,
  RARITY_LABEL,
  RARITY_FACTOR,
  applyBondExp,
  expToNextLevel,
  powerRating,
  round,
  statsAtLevel,
  type StatBlock,
} from "../game/formulas";
import { advanceQuestProgress } from "../game/progress";
import { expForLevel, loadRoster, previewStats, singleStatAtLevel } from "../game/service";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveProfile } from "./_shared";

/** 升级消耗：与等级线性相关，全部由服务端计算 */
const levelUpCost = (level: number, rarity: string) => {
  const factor = rarity === "SSR" ? 1.5 : rarity === "SR" ? 1.25 : 1;
  return { gold: round(60 * level * factor), exp: expToNextLevel(level) };
};

const skillUpgradeCost = (skillLevel: number, rarity: string) => {
  const factor = rarity === "SSR" ? 2 : rarity === "SR" ? 1.5 : 1;
  return { gold: round(180 * skillLevel * factor), aether: round(6 * skillLevel * factor) };
};

export const characterRouter = router({
  /** 角色图鉴 / 名册（全部角色 + 拥有状态） */
  roster: protectedProcedure
    .input(
      z
        .object({
          filter: z.enum(["all", "owned", "missing"]).optional(),
          job: z.string().max(16).optional(),
          rarity: z.string().max(4).optional(),
          sort: z.enum(["power", "level", "rarity", "bond", "name"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const owned = await loadRoster(profile.id);
      const ownedMap = new Map(owned.map((entry) => [entry.charKey, entry]));
      const allConfigs = await db.select().from(characters).where(eq(characters.status, "published"));

      let list = allConfigs.map((config) => {
        const entry = ownedMap.get(config.charKey);
        const preview = previewStats(config, 1, 0);
        return {
          charKey: config.charKey,
          name: config.name,
          title: config.title,
          rarity: config.rarity,
          rarityLabel: RARITY_LABEL[config.rarity as keyof typeof RARITY_LABEL],
          job: config.job,
          race: config.race,
          element: config.element,
          faction: config.faction,
          weapon: config.weapon,
          intro: config.intro,
          portraitUrl: config.portraitUrl,
          avatarUrl: config.avatarUrl,
          owned: Boolean(entry),
          level: entry?.level ?? 1,
          power: entry?.power ?? preview.power,
          bondLevel: entry?.bondLevel ?? 0,
          isNew: entry?.isNew ?? false,
          playerCharId: entry?.playerCharId ?? null,
          sortOrder: config.sortOrder,
        };
      });

      const filter = input?.filter ?? "all";
      if (filter === "owned") list = list.filter((item) => item.owned);
      if (filter === "missing") list = list.filter((item) => !item.owned);
      if (input?.job) list = list.filter((item) => item.job === input.job);
      if (input?.rarity) list = list.filter((item) => item.rarity === input.rarity);

      const rarityRank = { SSR: 3, SR: 2, R: 1 } as Record<string, number>;
      const sort = input?.sort ?? "rarity";
      list.sort((a, b) => {
        if (sort === "power") return b.power - a.power;
        if (sort === "level") return b.level - a.level;
        if (sort === "bond") return b.bondLevel - a.bondLevel;
        if (sort === "name") return a.name.localeCompare(b.name, "zh-Hans-CN");
        return rarityRank[b.rarity] - rarityRank[a.rarity] || a.sortOrder - b.sortOrder;
      });

      return {
        list,
        summary: {
          total: allConfigs.length,
          owned: owned.length,
          ssrOwned: owned.filter((entry) => entry.config.rarity === "SSR").length,
          ssrTotal: allConfigs.filter((config) => config.rarity === "SSR").length,
          totalPower: owned.reduce((sum, entry) => sum + entry.power, 0),
          topPower: owned.reduce((max, entry) => Math.max(max, entry.power), 0),
        },
      };
    }),

  /** 角色详情（属性 / 成长曲线 / 技能 / 装备 / 羁绊 / 台词 / 剧情状态） */
  detail: protectedProcedure.input(z.object({ charKey: z.string().min(1).max(64) })).query(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

    const [config] = await db.select().from(characters).where(eq(characters.charKey, input.charKey)).limit(1);
    if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "角色不存在" });

    const owned = await loadRoster(profile.id);
    const entry = owned.find((item) => item.charKey === input.charKey) ?? null;

    // 成长曲线（1..maxLevel 采样）
    const maxLevel = entry ? entry.maxLevel : MAX_LEVEL_BY_ASCENSION(0);
    const curveSamples = Array.from({ length: 12 }, (_, index) => {
      const level = Math.max(1, round(1 + ((maxLevel - 1) * index) / 11));
      const stats = statsAtLevel(config.baseStats as Partial<StatBlock>, config.growth, level, entry?.ascension ?? 0);
      return { level, hp: stats.hp, atk: stats.atk, def: stats.def, mag: stats.mag, spd: stats.spd, power: powerRating(stats) };
    });

    const skillConfigs = (config.skillKeys ?? []).length > 0 ? await db.select().from(skills).where(inArray(skills.skillKey, config.skillKeys)) : [];

    const equipmentRows = entry
      ? await db.select().from(playerEquipments).where(and(eq(playerEquipments.profileId, profile.id), eq(playerEquipments.equippedBy, entry.playerCharId)))
      : [];
    const ownedEquipment = await db.select().from(playerEquipments).where(eq(playerEquipments.profileId, profile.id));

    const slots = ["weapon", "offhand", "helmet", "armor", "boots", "accessory"] as const;
    const equippedView = slots.map((slot) => {
      const equippedId = entry?.equipped?.[slot];
      const row = equipmentRows.find((item) => item.id === equippedId) ?? ownedEquipment.find((item) => item.id === equippedId);
      const equipConfig = row ? EQUIPMENT_SEEDS.find((item) => item.equipKey === row.equipKey) : undefined;
      return {
        slot,
        slotLabel: SLOT_LABEL[slot],
        playerEquipId: row?.id ?? null,
        equipKey: equipConfig?.equipKey ?? null,
        name: equipConfig?.name ?? null,
        rarity: equipConfig?.rarity ?? null,
        level: row?.level ?? 0,
        maxLevel: equipConfig?.maxLevel ?? 0,
        iconKey: equipConfig?.iconKey ?? null,
        stats: equipConfig?.stats ?? {},
        description: equipConfig?.description ?? null,
      };
    });

    // 装备库（可替换）
    const inventory = ownedEquipment
      .filter((row) => !row.equippedBy)
      .map((row) => {
        const equipConfig = EQUIPMENT_SEEDS.find((item) => item.equipKey === row.equipKey);
        if (!equipConfig) return null;
        return {
          playerEquipId: row.id,
          equipKey: equipConfig.equipKey,
          name: equipConfig.name,
          slot: equipConfig.slot,
          slotLabel: SLOT_LABEL[equipConfig.slot],
          rarity: equipConfig.rarity,
          level: row.level,
          maxLevel: equipConfig.maxLevel,
          iconKey: equipConfig.iconKey,
          stats: equipConfig.stats,
          description: equipConfig.description,
          requiredLevel: equipConfig.requiredLevel,
        };
      })
      .filter(Boolean);

    const setCounts: Record<string, number> = {};
    for (const view of equippedView) {
      const equipConfig = view.equipKey ? EQUIPMENT_SEEDS.find((item) => item.equipKey === view.equipKey) : undefined;
      if (equipConfig?.setKey) setCounts[equipConfig.setKey] = (setCounts[equipConfig.setKey] ?? 0) + 1;
    }
    const activeSets = Object.entries(setCounts).map(([setKey, count]) => ({
      setKey,
      count,
      tiers: (SET_BONUSES[setKey] ?? []).map((tier) => ({ ...tier, active: count >= tier.pieces })),
    }));

    const relatedCharacters = await db
      .select()
      .from(characters)
      .where(inArray(characters.charKey, (config.relations ?? []).map((rel) => rel.charKey).filter(Boolean)));

    return {
      owned: Boolean(entry),
      playerCharId: entry?.playerCharId ?? null,
      config: {
        charKey: config.charKey,
        name: config.name,
        title: config.title,
        rarity: config.rarity,
        rarityLabel: RARITY_LABEL[config.rarity as keyof typeof RARITY_LABEL],
        rarityFactor: RARITY_FACTOR[config.rarity as keyof typeof RARITY_FACTOR],
        job: config.job,
        race: config.race,
        weapon: config.weapon,
        element: config.element,
        faction: config.faction,
        portraitUrl: config.portraitUrl,
        avatarUrl: config.avatarUrl,
        intro: config.intro,
        appearance: config.appearance,
        background: config.background,
        personality: config.personality,
        goal: config.goal,
        quotes: config.quotes ?? {},
        contentRating: config.contentRating,
      },
      level: entry?.level ?? 1,
      exp: entry?.exp ?? 0,
      expToNext: expForLevel(entry?.level ?? 1),
      maxLevel,
      ascension: entry?.ascension ?? 0,
      ascensionBonus: ASCENSION_STAT_BONUS,
      stats: entry?.stats ?? statsAtLevel(config.baseStats as Partial<StatBlock>, config.growth, 1, 0),
      baseStats: entry?.baseStats ?? statsAtLevel(config.baseStats as Partial<StatBlock>, config.growth, 1, 0),
      equipmentBonus: entry?.equipmentBonus ?? {},
      power: entry?.power ?? previewStats(config, 1, 0).power,
      bondLevel: entry?.bondLevel ?? 0,
      bondExp: entry?.bondExp ?? 0,
      affection: entry?.affection ?? 0,
      curve: curveSamples,
      skills: skillConfigs.map((skill) => ({
        skillKey: skill.skillKey,
        name: skill.name,
        element: skill.element,
        kind: skill.kind,
        targetType: skill.targetType,
        power: skill.power,
        cooldown: skill.cooldown,
        energyCost: skill.energyCost,
        maxLevel: skill.maxLevel,
        description: skill.description,
        effects: skill.effects,
        iconKey: skill.iconKey,
        level: entry ? (entry.skillLevels?.[skill.skillKey] ?? 1) : 1,
        nextCost: skillUpgradeCost(entry ? (entry.skillLevels?.[skill.skillKey] ?? 1) : 1, config.rarity),
      })),
      equipped: equippedView,
      inventory,
      activeSets,
      relations: (config.relations ?? []).map((rel) => {
        const target = relatedCharacters.find((item) => item.charKey === rel.charKey);
        return { charKey: rel.charKey, name: target?.name ?? rel.charKey, title: target?.title ?? "", avatarUrl: target?.avatarUrl ?? null, relation: rel.relation, note: rel.note };
      }),
      storyState: entry?.storyState ?? {},
      levelUpCost: levelUpCost(entry?.level ?? 1, config.rarity),
    };
  }),

  /** 角色升级（消耗金币，提升等级；等级上限由突破阶数决定） */
  levelUp: protectedProcedure
    .input(z.object({ charKey: z.string().min(1).max(64), times: z.number().int().min(1).max(50).default(1) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const [row] = await db
        .select()
        .from(playerCharacters)
        .where(and(eq(playerCharacters.profileId, profile.id), eq(playerCharacters.charKey, input.charKey)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "尚未拥有该角色" });

      const [config] = await db.select().from(characters).where(eq(characters.charKey, input.charKey)).limit(1);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "角色配置缺失" });

      const maxLevel = MAX_LEVEL_BY_ASCENSION(row.ascension);
      let level = row.level;
      let spentGold = 0;
      let levels = 0;
      for (let i = 0; i < input.times; i += 1) {
        if (level >= maxLevel) break;
        const cost = levelUpCost(level, config.rarity);
        spentGold += cost.gold;
        level += 1;
        levels += 1;
      }
      if (levels === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "已达到当前突破的等级上限，请先突破" });

      const { spendResources } = await import("../game/service");
      const spend = await spendResources(profile.id, { gold: spentGold });
      if (!spend.ok) throw new TRPCError({ code: "BAD_REQUEST", message: `金币不足，需要 ${spentGold}` });

      await db.update(playerCharacters).set({ level, exp: 0, isNew: false }).where(eq(playerCharacters.id, row.id));

      const progress = await advanceQuestProgress(profile.id, [{ type: "level_character", charKey: input.charKey, level }]);

      return { ok: true, level, levels, spentGold, questUpdates: progress.updated };
    }),

  /** 技能升级 */
  upgradeSkill: protectedProcedure
    .input(z.object({ charKey: z.string().min(1).max(64), skillKey: z.string().min(1).max(64), times: z.number().int().min(1).max(10).default(1) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const [row] = await db
        .select()
        .from(playerCharacters)
        .where(and(eq(playerCharacters.profileId, profile.id), eq(playerCharacters.charKey, input.charKey)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "尚未拥有该角色" });

      const [skill] = await db.select().from(skills).where(eq(skills.skillKey, input.skillKey)).limit(1);
      if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "技能不存在" });
      const [config] = await db.select().from(characters).where(eq(characters.charKey, input.charKey)).limit(1);
      if (!config?.skillKeys?.includes(input.skillKey)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该角色不具备此技能" });
      }

      const libraryLevel = await (async () => {
        const { profileBuildings } = await import("../../drizzle/schema");
        const [building] = await db
          .select()
          .from(profileBuildings)
          .where(and(eq(profileBuildings.profileId, profile.id), eq(profileBuildings.buildingKey, "library")))
          .limit(1);
        return building?.level ?? 0;
      })();
      if (libraryLevel < 1) throw new TRPCError({ code: "BAD_REQUEST", message: "需先建造图书馆（1 级）才能研习技能" });

      const currentLevel = row.skillLevels?.[input.skillKey] ?? 1;
      let level = currentLevel;
      let costGold = 0;
      let costAether = 0;
      for (let i = 0; i < input.times; i += 1) {
        if (level >= skill.maxLevel) break;
        const cost = skillUpgradeCost(level, config.rarity);
        costGold += cost.gold;
        costAether += cost.aether;
        level += 1;
      }
      if (level === currentLevel) throw new TRPCError({ code: "BAD_REQUEST", message: "技能已满级" });

      const { spendResources } = await import("../game/service");
      const spend = await spendResources(profile.id, { gold: costGold, aether: costAether });
      if (!spend.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "金币或星辉不足" });

      await db
        .update(playerCharacters)
        .set({ skillLevels: { ...(row.skillLevels ?? {}), [input.skillKey]: level } })
        .where(eq(playerCharacters.id, row.id));

      return { ok: true, skillKey: input.skillKey, level, costGold, costAether };
    }),

  /** 突破（提升等级上限与全属性） */
  ascend: protectedProcedure
    .input(z.object({ charKey: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const [row] = await db
        .select()
        .from(playerCharacters)
        .where(and(eq(playerCharacters.profileId, profile.id), eq(playerCharacters.charKey, input.charKey)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "尚未拥有该角色" });
      if (row.ascension >= 4) throw new TRPCError({ code: "BAD_REQUEST", message: "已达到最高突破阶数" });

      const maxLevel = MAX_LEVEL_BY_ASCENSION(row.ascension);
      if (row.level < maxLevel) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `需先达到 ${maxLevel} 级才能突破` });
      }

      const [config] = await db.select().from(characters).where(eq(characters.charKey, input.charKey)).limit(1);
      const rarityFactor = config ? RARITY_FACTOR[config.rarity as keyof typeof RARITY_FACTOR] : 1;
      const cost = {
        gold: round(900 * (row.ascension + 1) * rarityFactor),
        aether: round(30 * (row.ascension + 1) * rarityFactor),
        iron: round(120 * (row.ascension + 1)),
      };

      const { spendResources } = await import("../game/service");
      const spend = await spendResources(profile.id, cost);
      if (!spend.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "突破材料不足" });

      const ascension = row.ascension + 1;
      await db.update(playerCharacters).set({ ascension }).where(eq(playerCharacters.id, row.id));

      return { ok: true, ascension, newMaxLevel: MAX_LEVEL_BY_ASCENSION(ascension), cost };
    }),

  /** 装备穿戴 / 卸下 */
  equip: protectedProcedure
    .input(z.object({ charKey: z.string().min(1).max(64), playerEquipId: z.number().int().positive().nullable(), slot: z.enum(["weapon", "offhand", "helmet", "armor", "boots", "accessory"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const [row] = await db
        .select()
        .from(playerCharacters)
        .where(and(eq(playerCharacters.profileId, profile.id), eq(playerCharacters.charKey, input.charKey)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "尚未拥有该角色" });

      const equipped = { ...(row.equipped ?? {}) } as Record<string, number>;

      if (input.playerEquipId === null) {
        const slot = input.slot;
        if (!slot) throw new TRPCError({ code: "BAD_REQUEST", message: "缺少装备槽" });
        delete equipped[slot];
        const { playerEquipments: table } = await import("../../drizzle/schema");
        await db.update(table).set({ equippedBy: null, equippedSlot: null }).where(and(eq(table.profileId, profile.id), eq(table.id, Number(equipped[slot] ?? 0))));
      } else {
        const { playerEquipments: table } = await import("../../drizzle/schema");
        const [equipRow] = await db
          .select()
          .from(table)
          .where(and(eq(table.id, input.playerEquipId), eq(table.profileId, profile.id)))
          .limit(1);
        if (!equipRow) throw new TRPCError({ code: "NOT_FOUND", message: "装备不存在" });

        const equipConfig = EQUIPMENT_SEEDS.find((item) => item.equipKey === equipRow.equipKey);
        if (!equipConfig) throw new TRPCError({ code: "NOT_FOUND", message: "装备配置缺失" });
        if (row.level < equipConfig.requiredLevel) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `需要角色等级 ${equipConfig.requiredLevel}` });
        }

        // 卸下同槽位旧装备
        const previousId = equipped[equipConfig.slot];
        if (previousId) {
          await db.update(table).set({ equippedBy: null, equippedSlot: null }).where(eq(table.id, previousId));
        }
        equipped[equipConfig.slot] = equipRow.id;
        await db.update(table).set({ equippedBy: row.id, equippedSlot: equipConfig.slot }).where(eq(table.id, equipRow.id));

        await advanceQuestProgress(profile.id, [{ type: "equip_item", charKey: input.charKey, slot: equipConfig.slot }]);
      }

      await db.update(playerCharacters).set({ equipped }).where(eq(playerCharacters.id, row.id));
      return { ok: true, equipped };
    }),

  /** 装备强化 */
  enhanceEquipment: protectedProcedure
    .input(z.object({ playerEquipId: z.number().int().positive(), times: z.number().int().min(1).max(10).default(1) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const [row] = await db
        .select()
        .from(playerEquipments)
        .where(and(eq(playerEquipments.id, input.playerEquipId), eq(playerEquipments.profileId, profile.id)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "装备不存在" });

      const config = EQUIPMENT_SEEDS.find((item) => item.equipKey === row.equipKey);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "装备配置缺失" });

      const workshopLevel = await (async () => {
        const { profileBuildings } = await import("../../drizzle/schema");
        const [building] = await db
          .select()
          .from(profileBuildings)
          .where(and(eq(profileBuildings.profileId, profile.id), eq(profileBuildings.buildingKey, "workshop")))
          .limit(1);
        return building?.level ?? 0;
      })();
      if (workshopLevel < 1) throw new TRPCError({ code: "BAD_REQUEST", message: "需先建造工坊（1 级）才能强化装备" });

      const craftCap = Math.min(config.maxLevel, workshopLevel * 2);
      let level = row.level;
      let costIron = 0;
      let costGold = 0;
      for (let i = 0; i < input.times; i += 1) {
        if (level >= craftCap) break;
        costIron += round(24 * level * (config.rarity === "SSR" ? 2 : config.rarity === "SR" ? 1.4 : 1));
        costGold += round(90 * level);
        level += 1;
      }
      if (level === row.level) {
        throw new TRPCError({ code: "BAD_REQUEST", message: craftCap >= config.maxLevel ? "装备已强化至上限" : `当前工坊等级可强化至 +${craftCap - 1}` });
      }

      const { spendResources } = await import("../game/service");
      const spend = await spendResources(profile.id, { iron: costIron, gold: costGold });
      if (!spend.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "铁矿或金币不足" });

      await db.update(playerEquipments).set({ level }).where(eq(playerEquipments.id, row.id));
      return { ok: true, level, costIron, costGold, craftCap };
    }),

  /** 羁绊互动（赠礼/交谈，提升羁绊与好感；不含任何成人向内容） */
  bondInteract: protectedProcedure
    .input(z.object({ charKey: z.string().min(1).max(64), interaction: z.enum(["talk", "gift", "train"]) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const [row] = await db
        .select()
        .from(playerCharacters)
        .where(and(eq(playerCharacters.profileId, profile.id), eq(playerCharacters.charKey, input.charKey)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "尚未拥有该角色" });

      const tavernLevel = await (async () => {
        const { profileBuildings } = await import("../../drizzle/schema");
        const [building] = await db
          .select()
          .from(profileBuildings)
          .where(and(eq(profileBuildings.profileId, profile.id), eq(profileBuildings.buildingKey, "tavern")))
          .limit(1);
        return building?.level ?? 0;
      })();

      const costs = {
        talk: { gold: 0, food: 0, gain: 12 },
        gift: { gold: 120, food: 0, gain: 35 },
        train: { gold: 60, food: 40, gain: 24 },
      } as const;
      const config = costs[input.interaction];
      const bonusMultiplier = tavernLevel >= 2 ? 1.2 : 1;
      const gain = round(config.gain * bonusMultiplier);

      if (config.gold > 0 || config.food > 0) {
        const { spendResources } = await import("../game/service");
        const spend = await spendResources(profile.id, { gold: config.gold, food: config.food });
        if (!spend.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "资源不足" });
      }

      const bond = applyBondExp(row.bondLevel, row.bondExp, gain);
      await db
        .update(playerCharacters)
        .set({ bondLevel: bond.level, bondExp: bond.exp, affection: Math.max(-100, Math.min(100, row.affection + (input.interaction === "gift" ? 4 : 2))) })
        .where(eq(playerCharacters.id, row.id));

      const [charConfig] = await db.select().from(characters).where(eq(characters.charKey, input.charKey)).limit(1);
      const quotes = (charConfig?.quotes ?? {}) as Record<string, string[]>;
      const bondLines = quotes.bond ?? [];

      return {
        ok: true,
        bondLevel: bond.level,
        bondExp: bond.exp,
        gainedLevels: bond.gainedLevels,
        gain,
        line: bondLines.length > 0 ? bondLines[bond.level % bondLines.length] : null,
      };
    }),

  /** 标记角色为已查看（清除「新」标记） */
  markSeen: protectedProcedure.input(z.object({ charKey: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    await db
      .update(playerCharacters)
      .set({ isNew: false })
      .where(and(eq(playerCharacters.profileId, profile.id), eq(playerCharacters.charKey, input.charKey)));
    return { ok: true };
  }),

  /** 技能与装备配置字典（供前端展示名称/图标，不含概率与公式） */
  dictionaries: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const skillRows = await db.select().from(skills);
    const equipRows = await db.select().from(equipments);
    return {
      skills: skillRows.map((skill) => ({ skillKey: skill.skillKey, name: skill.name, element: skill.element, kind: skill.kind, iconKey: skill.iconKey, description: skill.description })),
      equipments: equipRows.map((equip) => ({ equipKey: equip.equipKey, name: equip.name, slot: equip.slot, rarity: equip.rarity, iconKey: equip.iconKey, stats: equip.stats })),
      slots: SLOT_LABEL,
    };
  }),

  /** 单属性成长预览（角色详情页图表辅助） */
  growth: protectedProcedure
    .input(z.object({ charKey: z.string().min(1).max(64), stat: z.enum(["hp", "atk", "def", "mag", "res", "spd"]) }))
    .query(async ({ ctx, input }) => {
      await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
      const [config] = await db.select().from(characters).where(eq(characters.charKey, input.charKey)).limit(1);
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "角色不存在" });
      const points = Array.from({ length: 21 }, (_, index) => {
        const level = 1 + index * 3;
        return { level, value: singleStatAtLevel(config, input.stat, level, 0) };
      });
      return { stat: input.stat, points };
    }),
});