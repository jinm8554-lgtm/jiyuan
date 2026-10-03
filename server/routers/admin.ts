import { TRPCError } from "@trpc/server";
import { desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  adminAuditLogs,
  aiCallLogs,
  aiConfigs,
  aiConversations,
  aiMessages,
  aiModels,
  apiTokens,
  backupRecords,
  battleLogs,
  battles,
  buildings,
  characters,
  domainEvents,
  equipments,
  gameProfiles,
  nodeStates,
  playerCharacters,
  playerEquipments,
  playerItems,
  profileMails,
  profileBuildings,
  profilePity,
  profileQuests,
  profileStoryFlags,
  quests,
  recruitHistories,
  recruitPools,
  regionStates,
  regions,
  skills,
  shopPurchases,
  storyScenes,
  teams,
  users,
  worldNodes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { decryptSecret, encryptSecret, fetchModels, maskApiKey, testAiConnection, type AiRuntimeConfig } from "../game/aiClient";
import { createBackup, listBackups, restoreBackup, verifySnapshot } from "../game/backup";
import { RARITY_LABEL } from "../game/formulas";
import { SHOP_ITEMS } from "../game/data/shop";
import { seedContent } from "../game/seed";
import { storagePut } from "../storage";
import { ENV } from "../_core/env";
import { adminProcedure, router } from "../_core/trpc";
import { requireAdmin } from "./_shared";
import { adminDeliveryInput, adminMailInput, normalizeMailAttachments, normalizeMailRewards, validateMailAttachments } from "./mail";

const secretOf = () => process.env.JWT_SECRET ?? ENV.cookieSecret ?? "aetherfall-dev-secret";

async function audit(ctx: Parameters<typeof requireAdmin>[0], action: string, targetType: string, targetKey: string | null, payload?: Record<string, unknown>, result: "ok" | "failed" = "ok") {
  const db = await getDb();
  if (!db) return;
  const admin = requireAdmin(ctx);
  await db.insert(adminAuditLogs).values({
    adminUserId: admin.id,
    adminName: admin.name ?? admin.openId,
    action,
    targetType,
    targetKey: targetKey ?? undefined,
    payload: payload ?? {},
    result,
    ip: ctx.req.headers["x-forwarded-for"]?.toString().slice(0, 64) ?? null,
  });
}

const charInput = z.object({
  charKey: z.string().min(2).max(64).regex(/^[a-z0-9_]+$/i, "仅允许字母、数字与下划线"),
  name: z.string().min(1).max(64),
  title: z.string().min(1).max(96),
  rarity: z.enum(["R", "SR", "SSR", "UR"]),
  job: z.enum(["warrior", "knight", "mage", "ranger", "cleric", "assassin", "sage"]),
  race: z.string().min(1).max(32),
  weapon: z.string().min(1).max(64),
  element: z.enum(["physical", "fire", "frost", "lightning", "holy", "shadow"]),
  faction: z.string().min(1).max(48),
  portraitUrl: z.string().max(512).nullable().optional(),
  avatarUrl: z.string().max(512).nullable().optional(),
  intro: z.string().max(400).optional(),
  appearance: z.string().max(600).optional(),
  background: z.string().max(1200).optional(),
  personality: z.string().max(600).optional(),
  goal: z.string().max(400).optional(),
  quotes: z.record(z.string(), z.array(z.string().max(200))).optional(),
  skillKeys: z.array(z.string().max(64)).max(8),
  baseStats: z.record(z.string(), z.number().int().min(0).max(999999)),
  growth: z.object({ curve: z.number().min(0.5).max(3), growth: z.number().min(1).max(3) }),
  relations: z.array(z.object({ charKey: z.string().max(64), relation: z.string().max(48), note: z.string().max(200) })).max(10).optional(),
  contentRating: z.string().max(16).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  inRecruitPool: z.boolean().optional(),
});

export const adminRouter = router({
  /* ------------------------ 概览 ------------------------ */
  overview: adminProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

    const [chars] = await db.select({ count: sql<number>`count(*)` }).from(characters);
    const [usersCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
    const [profilesCount] = await db.select({ count: sql<number>`count(*)` }).from(gameProfiles);
    const [pools] = await db.select({ count: sql<number>`count(*)` }).from(recruitPools);
    const [nodeCount] = await db.select({ count: sql<number>`count(*)` }).from(worldNodes);
    const [aiCalls] = await db.select({ count: sql<number>`count(*)` }).from(aiCallLogs);
    const [backups] = await db.select({ count: sql<number>`count(*)` }).from(backupRecords);

    const recentCalls = await db.select().from(aiCallLogs).orderBy(desc(aiCallLogs.id)).limit(10);
    const [activeConfig] = await db.select().from(aiConfigs).where(eq(aiConfigs.isActive, true)).limit(1);
    const [draftChars] = await db.select({ count: sql<number>`count(*)` }).from(characters).where(eq(characters.status, "draft"));

    return {
      counts: {
        characters: Number(chars?.count ?? 0),
        draftCharacters: Number(draftChars?.count ?? 0),
        users: Number(usersCount?.count ?? 0),
        profiles: Number(profilesCount?.count ?? 0),
        pools: Number(pools?.count ?? 0),
        nodes: Number(nodeCount?.count ?? 0),
        aiCalls: Number(aiCalls?.count ?? 0),
        backups: Number(backups?.count ?? 0),
      },
      activeAi: activeConfig
        ? {
            id: activeConfig.id,
            name: activeConfig.name,
            model: activeConfig.model,
            baseUrl: activeConfig.baseUrl,
            useBuiltInGateway: activeConfig.useBuiltInGateway,
            keyHint: activeConfig.apiKeyHint,
            lastTestStatus: activeConfig.lastTestStatus,
            lastTestAt: activeConfig.lastTestAt,
          }
        : null,
      recentCalls: recentCalls.map((call) => ({
        id: call.id,
        model: call.model,
        status: call.status,
        latencyMs: call.latencyMs,
        violationCount: call.violationCount,
        presentCharKeys: call.presentCharKeys,
        createdAt: call.createdAt,
      })),
      environment: { hasDatabase: Boolean(process.env.DATABASE_URL), node: process.version },
    };
  }),

  /* ------------------------ 角色库 ------------------------ */
  listCharacters: adminProcedure
    .input(
      z
        .object({
          search: z.string().max(64).optional(),
          status: z.enum(["all", "draft", "published", "archived"]).optional(),
          rarity: z.enum(["all", "R", "SR", "SSR", "UR"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
      let rows = await db.select().from(characters);
      const search = input?.search?.trim();
      if (search) {
        rows = rows.filter((row) => row.name.includes(search) || row.charKey.includes(search) || row.title.includes(search));
      }
      if (input?.status && input.status !== "all") rows = rows.filter((row) => row.status === input.status);
      if (input?.rarity && input.rarity !== "all") rows = rows.filter((row) => row.rarity === input.rarity);
      rows.sort((a, b) => a.sortOrder - b.sortOrder || a.charKey.localeCompare(b.charKey));
      return rows.map((row) => ({
        id: row.id,
        charKey: row.charKey,
        name: row.name,
        title: row.title,
        rarity: row.rarity,
        rarityLabel: RARITY_LABEL[row.rarity],
        job: row.job,
        race: row.race,
        element: row.element,
        faction: row.faction,
        status: row.status,
        inRecruitPool: row.inRecruitPool,
        avatarUrl: row.avatarUrl,
        portraitUrl: row.portraitUrl,
        contentRating: row.contentRating,
        version: row.version,
        updatedAt: row.updatedAt,
        skillCount: (row.skillKeys ?? []).length,
      }));
    }),

  getCharacter: adminProcedure.input(z.object({ charKey: z.string().min(1).max(64) })).query(async ({ ctx, input }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const [row] = await db.select().from(characters).where(eq(characters.charKey, input.charKey)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "角色不存在" });
    return row;
  }),

  saveCharacter: adminProcedure.input(charInput.extend({ id: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });

    const values = {
      charKey: input.charKey,
      name: input.name,
      title: input.title,
      rarity: input.rarity,
      job: input.job,
      race: input.race,
      weapon: input.weapon,
      element: input.element,
      faction: input.faction,
      portraitUrl: input.portraitUrl ?? null,
      avatarUrl: input.avatarUrl ?? null,
      intro: input.intro ?? "",
      appearance: input.appearance ?? "",
      background: input.background ?? "",
      personality: input.personality ?? "",
      goal: input.goal ?? "",
      quotes: input.quotes ?? {},
      skillKeys: input.skillKeys,
      baseStats: input.baseStats,
      growth: input.growth,
      relations: input.relations ?? [],
      contentRating: input.contentRating ?? "all-ages",
      sortOrder: input.sortOrder ?? 0,
      status: input.status ?? "draft",
      inRecruitPool: input.inRecruitPool ?? true,
    };

    const existing = input.id
      ? await db.select().from(characters).where(eq(characters.id, input.id)).limit(1)
      : await db.select().from(characters).where(eq(characters.charKey, input.charKey)).limit(1);

    if (existing.length > 0) {
      await db
        .update(characters)
        .set({ ...values, version: existing[0].version + 1 })
        .where(eq(characters.id, existing[0].id));
      await audit(ctx, "character.update", "character", input.charKey, { status: values.status });
      return { ok: true, mode: "updated" as const, id: existing[0].id, version: existing[0].version + 1 };
    }

    const [inserted] = await db.insert(characters).values({ ...values, version: 1 }).$returningId();
    await audit(ctx, "character.create", "character", input.charKey, { status: values.status });
    return { ok: true, mode: "created" as const, id: inserted.id, version: 1 };
  }),

  setCharacterStatus: adminProcedure
    .input(z.object({ charKey: z.string().min(1).max(64), status: z.enum(["draft", "published", "archived"]), inRecruitPool: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      const [row] = await db.select().from(characters).where(eq(characters.charKey, input.charKey)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "角色不存在" });

      // 下架前校验：是否仍在启用中的卡池限定列表里
      if (input.status !== "published") {
        const pools = await db.select().from(recruitPools).where(eq(recruitPools.enabled, true));
        const blocking = pools.filter((pool) => (pool.characterKeys ?? []).includes(input.charKey));
        if (blocking.length > 0 && input.status === "archived") {
          throw new TRPCError({ code: "BAD_REQUEST", message: `该角色仍在启用卡池中：${blocking.map((p) => p.name).join("、")}，请先调整卡池` });
        }
      }

      await db
        .update(characters)
        .set({ status: input.status, inRecruitPool: input.inRecruitPool ?? row.inRecruitPool })
        .where(eq(characters.id, row.id));
      await audit(ctx, "character.status", "character", input.charKey, { status: input.status });
      return { ok: true };
    }),

  /** 立绘/头像上传（存入对象存储，库里只存路径） */
  uploadCharacterAsset: adminProcedure
    .input(
      z.object({
        charKey: z.string().min(1).max(64),
        kind: z.enum(["portrait", "avatar", "banner"]),
        filename: z.string().min(1).max(120),
        contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
        base64: z.string().min(16).max(8_000_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });

      const buffer = Buffer.from(input.base64.replace(/^data:[^,]+,/, ""), "base64");
      if (buffer.byteLength > 6 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "图片大小不能超过 6MB" });

      const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-64);
      const uploaded = await storagePut(`characters/${input.charKey}/${input.kind}-${safeName}`, buffer, input.contentType);

      const field = input.kind === "portrait" ? { portraitUrl: uploaded.url } : input.kind === "avatar" ? { avatarUrl: uploaded.url } : {};
      if (Object.keys(field).length > 0) {
        await db.update(characters).set(field).where(eq(characters.charKey, input.charKey));
      }
      await audit(ctx, "character.upload", "character", input.charKey, { kind: input.kind, size: buffer.byteLength });
      return { ok: true, url: uploaded.url, key: uploaded.key };
    }),

  /* ------------------------ 技能 / 装备 ------------------------ */
  listSkills: adminProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    const rows = await db.select().from(skills);
    return rows.sort((a, b) => a.skillKey.localeCompare(b.skillKey));
  }),

  saveSkill: adminProcedure
    .input(
      z.object({
        skillKey: z.string().min(2).max(64),
        name: z.string().min(1).max(64),
        element: z.enum(["physical", "fire", "frost", "lightning", "holy", "shadow"]),
        kind: z.enum(["active", "passive"]),
        targetType: z.enum(["self", "ally", "all_allies", "enemy", "all_enemies"]),
        power: z.number().int().min(0).max(999),
        cooldown: z.number().int().min(0).max(20),
        energyCost: z.number().int().min(0).max(100),
        maxLevel: z.number().int().min(1).max(20),
        description: z.string().max(600),
        effects: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))).max(10),
        iconKey: z.string().max(32).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      const [existing] = await db.select().from(skills).where(eq(skills.skillKey, input.skillKey)).limit(1);
      if (existing) {
        await db.update(skills).set(input).where(eq(skills.id, existing.id));
      } else {
        await db.insert(skills).values(input as never);
      }
      await audit(ctx, "skill.save", "skill", input.skillKey);
      return { ok: true };
    }),

  listEquipments: adminProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    const rows = await db.select().from(equipments);
    return rows.sort((a, b) => a.equipKey.localeCompare(b.equipKey));
  }),

  saveEquipment: adminProcedure
    .input(
      z.object({
        equipKey: z.string().min(2).max(64),
        name: z.string().min(1).max(64),
        slot: z.enum(["weapon", "offhand", "helmet", "armor", "boots", "accessory"]),
        rarity: z.enum(["R", "SR", "SSR"]),
        requiredLevel: z.number().int().min(1).max(200),
        stats: z.record(z.string(), z.number().int().min(-999).max(99999)),
        setKey: z.string().max(48).nullable().optional(),
        description: z.string().max(400).optional(),
        iconKey: z.string().max(32).optional(),
        upgradeRate: z.number().int().min(1).max(50).optional(),
        maxLevel: z.number().int().min(1).max(40).optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      const [existing] = await db.select().from(equipments).where(eq(equipments.equipKey, input.equipKey)).limit(1);
      if (existing) {
        await db.update(equipments).set(input).where(eq(equipments.id, existing.id));
      } else {
        await db.insert(equipments).values(input);
      }
      await audit(ctx, "equipment.save", "equipment", input.equipKey);
      return { ok: true };
    }),

  /* ------------------------ 建筑 / 地图 / 任务 / 剧情 ------------------------ */
  listBuildings: adminProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    return db.select().from(buildings).orderBy(buildings.sortOrder);
  }),

  saveBuilding: adminProcedure
    .input(
      z.object({
        buildingKey: z.string().min(2).max(48),
        name: z.string().min(1).max(48),
        category: z.enum(["economy", "military", "research", "governance"]),
        maxLevel: z.number().int().min(1).max(20),
        levels: z.array(z.record(z.string(), z.unknown())).min(1).max(20),
        description: z.string().max(600).optional(),
        iconKey: z.string().max(32).optional(),
        hotspotX: z.number().int().min(0).max(100).optional(),
        hotspotY: z.number().int().min(0).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      const [existing] = await db.select().from(buildings).where(eq(buildings.buildingKey, input.buildingKey)).limit(1);
      if (existing) {
        await db.update(buildings).set(input).where(eq(buildings.id, existing.id));
      } else {
        await db.insert(buildings).values(input);
      }
      await audit(ctx, "building.save", "building", input.buildingKey);
      return { ok: true };
    }),

  listRegions: adminProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    const regionRows = await db.select().from(regions);
    const nodeRows = await db.select().from(worldNodes);
    return regionRows.map((region) => ({
      ...region,
      nodeCount: nodeRows.filter((node) => node.regionKey === region.regionKey).length,
    }));
  }),

  saveRegion: adminProcedure
    .input(
      z.object({
        regionKey: z.string().min(2).max(48),
        name: z.string().min(1).max(64),
        subtitle: z.string().max(96).optional(),
        dangerTier: z.number().int().min(1).max(10),
        faction: z.string().max(48).optional(),
        description: z.string().max(1200).optional(),
        mapX: z.number().int().min(0).max(100),
        mapY: z.number().int().min(0).max(100),
        artUrl: z.string().max(512).nullable().optional(),
        unlock: z.record(z.string(), z.unknown()),
        sortOrder: z.number().int().min(0).max(99).optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      const [existing] = await db.select().from(regions).where(eq(regions.regionKey, input.regionKey)).limit(1);
      if (existing) {
        await db.update(regions).set(input).where(eq(regions.id, existing.id));
      } else {
        await db.insert(regions).values(input);
      }
      await audit(ctx, "region.save", "region", input.regionKey);
      return { ok: true };
    }),

  listNodes: adminProcedure.input(z.object({ regionKey: z.string().max(48).optional() }).optional()).query(async ({ ctx, input }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    const rows = input?.regionKey ? await db.select().from(worldNodes).where(eq(worldNodes.regionKey, input.regionKey)) : await db.select().from(worldNodes);
    return rows.sort((a, b) => a.regionKey.localeCompare(b.regionKey) || a.sortOrder - b.sortOrder);
  }),

  saveNode: adminProcedure
    .input(
      z.object({
        nodeKey: z.string().min(2).max(64),
        regionKey: z.string().min(2).max(48),
        name: z.string().min(1).max(64),
        nodeType: z.enum(["village", "town", "fort", "ruin", "wild", "rift", "trade"]),
        levelMin: z.number().int().min(1).max(200),
        levelMax: z.number().int().min(1).max(200),
        enemyWave: z
          .array(
            z.object({
              id: z.string().max(64),
              name: z.string().max(64),
              job: z.enum(["warrior", "knight", "mage", "ranger", "cleric", "assassin", "sage"]),
              element: z.enum(["physical", "fire", "frost", "lightning", "holy", "shadow"]),
              rarity: z.enum(["R", "SR", "SSR"]),
              level: z.number().int().min(1).max(200),
              stats: z.record(z.string(), z.number().int().min(0).max(999999)),
              skillKeys: z.array(z.string().max(64)).max(6),
              note: z.string().max(200).optional(),
            }),
          )
          .min(1)
          .max(6),
        rewards: z.record(z.string(), z.unknown()),
        firstClearRewards: z.record(z.string(), z.unknown()),
        unlock: z.record(z.string(), z.unknown()),
        storyKey: z.string().max(64).nullable().optional(),
        tradeYield: z.record(z.string(), z.number().int().min(0).max(9999)),
        controlWeight: z.number().int().min(1).max(10),
        requiredClears: z.number().int().min(1).max(20),
        staminaCost: z.number().int().min(0).max(60),
        mapX: z.number().int().min(0).max(100),
        mapY: z.number().int().min(0).max(100),
        sortOrder: z.number().int().min(0).max(999).optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });

      // 校验敌人属性在可达范围内（避免压死玩家的设计错误）
      for (const enemy of input.enemyWave) {
        const hp = Number(enemy.stats.hp ?? 0);
        if (hp > 600000) throw new TRPCError({ code: "BAD_REQUEST", message: `敌人 ${enemy.name} 的生命值过高（>600000）` });
      }

      const [existing] = await db.select().from(worldNodes).where(eq(worldNodes.nodeKey, input.nodeKey)).limit(1);
      const values = { ...input, note: undefined };
      if (existing) {
        await db.update(worldNodes).set(values).where(eq(worldNodes.id, existing.id));
      } else {
        await db.insert(worldNodes).values(values);
      }
      await audit(ctx, "node.save", "node", input.nodeKey, { regionKey: input.regionKey });
      return { ok: true };
    }),

  listQuests: adminProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    return db.select().from(quests).orderBy(quests.chapter, quests.sortOrder);
  }),

  saveQuest: adminProcedure
    .input(
      z.object({
        questKey: z.string().min(2).max(64),
        name: z.string().min(1).max(96),
        chapter: z.number().int().min(1).max(20),
        questType: z.enum(["main", "side", "daily"]),
        description: z.string().max(1200).optional(),
        objectives: z.array(z.record(z.string(), z.unknown())).min(1).max(8),
        rewards: z.record(z.string(), z.unknown()),
        prerequisite: z.record(z.string(), z.unknown()),
        sortOrder: z.number().int().min(0).max(999).optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      const [existing] = await db.select().from(quests).where(eq(quests.questKey, input.questKey)).limit(1);
      if (existing) {
        await db.update(quests).set(input).where(eq(quests.id, existing.id));
      } else {
        await db.insert(quests).values(input);
      }
      await audit(ctx, "quest.save", "quest", input.questKey);
      return { ok: true };
    }),

  listScenes: adminProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    return db.select().from(storyScenes).orderBy(storyScenes.chapter);
  }),

  saveScene: adminProcedure
    .input(
      z.object({
        sceneKey: z.string().min(2).max(64),
        chapter: z.number().int().min(1).max(20),
        title: z.string().min(1).max(128),
        trigger: z.record(z.string(), z.unknown()),
        beats: z.array(z.record(z.string(), z.unknown())).min(1).max(40),
        choices: z.array(z.record(z.string(), z.unknown())).max(6),
        unlockFlags: z.array(z.string().max(96)).max(20),
        status: z.enum(["draft", "published", "archived"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      const [existing] = await db.select().from(storyScenes).where(eq(storyScenes.sceneKey, input.sceneKey)).limit(1);
      if (existing) {
        await db.update(storyScenes).set(input).where(eq(storyScenes.id, existing.id));
      } else {
        await db.insert(storyScenes).values(input);
      }
      await audit(ctx, "scene.save", "scene", input.sceneKey);
      return { ok: true };
    }),

  listEvents: adminProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    return db.select().from(domainEvents);
  }),

  saveEvent: adminProcedure
    .input(
      z.object({
        eventKey: z.string().min(2).max(64),
        title: z.string().min(1).max(96),
        category: z.enum(["economy", "people", "military", "diplomacy", "rift"]),
        description: z.string().max(1200).optional(),
        choices: z.array(z.record(z.string(), z.unknown())).min(2).max(4),
        minKeepLevel: z.number().int().min(1).max(20),
        weight: z.number().int().min(1).max(200),
        once: z.boolean().optional(),
        status: z.enum(["draft", "published", "archived"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      const [existing] = await db.select().from(domainEvents).where(eq(domainEvents.eventKey, input.eventKey)).limit(1);
      if (existing) {
        await db.update(domainEvents).set(input).where(eq(domainEvents.id, existing.id));
      } else {
        await db.insert(domainEvents).values(input);
      }
      await audit(ctx, "event.save", "event", input.eventKey);
      return { ok: true };
    }),

  /* ------------------------ 招募池 ------------------------ */
  listPools: adminProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    const rows = await db.select().from(recruitPools);
    const history = await db.select().from(recruitHistories).limit(5000);
    return rows
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => ({
        ...row,
        stats: {
          totalPulls: history.filter((item) => item.poolKey === row.poolKey).length,
          ssrCount: history.filter((item) => item.poolKey === row.poolKey && item.rarity === "SSR").length,
          srCount: history.filter((item) => item.poolKey === row.poolKey && item.rarity === "SR").length,
        },
        rateTotal: Number(((row.rates ?? []) as Array<{ rate: number }>).reduce((sum, item) => sum + Number(item.rate ?? 0), 0).toFixed(4)),
      }));
  }),

  savePool: adminProcedure
    .input(
      z.object({
        poolKey: z.string().min(2).max(48),
        name: z.string().min(1).max(96),
        poolType: z.enum(["normal", "rare", "event"]),
        description: z.string().max(1200).optional(),
        bannerUrl: z.string().max(512).nullable().optional(),
        rates: z.array(z.object({ rarity: z.enum(["R", "SR", "SSR"]), rate: z.number().min(0).max(1) })).min(1).max(3),
        pity: z.object({
          softStart: z.number().int().min(0).max(999),
          softStep: z.number().min(0).max(0.5),
          hardPity: z.number().int().min(0).max(999),
          tenPullMinRarity: z.enum(["R", "SR", "SSR"]),
          duplicateShards: z.number().min(0).max(10),
        }),
        costSingle: z.number().int().min(0).max(999),
        costTen: z.number().int().min(0).max(9999),
        currency: z.enum(["aether", "gold"]),
        characterKeys: z.array(z.string().max(64)).max(30),
        openAt: z.string().nullable().optional(),
        closeAt: z.string().nullable().optional(),
        enabled: z.boolean(),
        sortOrder: z.number().int().min(0).max(99).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });

      const total = input.rates.reduce((sum, item) => sum + item.rate, 0);
      if (Math.abs(total - 1) > 0.001) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `概率之和必须为 1（当前 ${total.toFixed(4)}）` });
      }
      if (input.pity.hardPity > 0 && input.pity.softStart > input.pity.hardPity) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "软保底起始抽数不能大于硬保底" });
      }
      if (input.openAt && input.closeAt && new Date(input.openAt) >= new Date(input.closeAt)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "关闭时间必须晚于开放时间" });
      }
      if (input.characterKeys.length > 0) {
        const found = await db.select().from(characters).where(inArray(characters.charKey, input.characterKeys));
        const missing = input.characterKeys.filter((key) => !found.some((char) => char.charKey === key));
        if (missing.length > 0) throw new TRPCError({ code: "BAD_REQUEST", message: `以下角色不存在：${missing.join("、")}` });
        const unpublished = found.filter((char) => char.status !== "published");
        if (unpublished.length > 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `以下角色未发布，无法加入卡池：${unpublished.map((char) => char.name).join("、")}` });
        }
      }

      const values: Record<string, unknown> = {
        poolKey: input.poolKey,
        name: input.name,
        poolType: input.poolType,
        description: input.description ?? "",
        bannerUrl: input.bannerUrl ?? null,
        rates: input.rates,
        pity: input.pity,
        costSingle: input.costSingle,
        costTen: input.costTen,
        currency: input.currency,
        characterKeys: input.characterKeys,
        openAt: input.openAt ? new Date(input.openAt) : null,
        closeAt: input.closeAt ? new Date(input.closeAt) : null,
        enabled: input.enabled,
        sortOrder: input.sortOrder ?? 0,
      };
      const [existing] = await db.select().from(recruitPools).where(eq(recruitPools.poolKey, input.poolKey)).limit(1);
      if (existing) {
        await db.update(recruitPools).set(values as never).where(eq(recruitPools.id, existing.id));
      } else {
        await db.insert(recruitPools).values(values as never);
      }
      await audit(ctx, "pool.save", "pool", input.poolKey, { rates: input.rates, hardPity: input.pity.hardPity });
      return { ok: true };
    }),

  /** 模拟抽取结果（不影响真实数据，用于校验概率与保底配置） */
  simulatePool: adminProcedure
    .input(z.object({ poolKey: z.string().min(1).max(48), pulls: z.number().int().min(10).max(2000) }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      const [pool] = await db.select().from(recruitPools).where(eq(recruitPools.poolKey, input.poolKey)).limit(1);
      if (!pool) throw new TRPCError({ code: "NOT_FOUND", message: "卡池不存在" });

      const { drawMany } = await import("../game/recruit");
      const { spares } = { spares: true };
      void spares;
      const rarityCounts: Record<string, number> = { R: 0, SR: 0, SSR: 0 };
      let pityState = { totalPulls: 0, pullsSinceSSR: 0, pullsSinceSR: 0, guaranteedSSR: false };
      let maxGap = 0;
      let currentGap = 0;
      let seed = Date.now() % 2147483647;
      const rng = () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
      };
      const candidates = {
        R: ["sim_r"],
        SR: ["sim_sr"],
        SSR: ["sim_ssr"],
      };
      for (let i = 0; i < input.pulls; i += 1) {
        const { results, pity } = drawMany({
          pool: {
            poolKey: pool.poolKey,
            name: pool.name,
            poolType: pool.poolType,
            rates: (pool.rates ?? []) as Array<{ rarity: string; rate: number }>,
            pity: (pool.pity ?? {}) as Record<string, number | string>,
            costSingle: pool.costSingle,
            costTen: pool.costTen,
            currency: pool.currency,
            characterKeys: pool.characterKeys ?? [],
            enabled: true,
          },
          pity: pityState,
          candidates,
          ownedKeys: new Set<string>(),
          count: 1,
          rng,
        });
        pityState = pity;
        for (const result of results) {
          rarityCounts[result.rarity] += 1;
          if (result.rarity === "SSR") {
            maxGap = Math.max(maxGap, currentGap + 1);
            currentGap = 0;
          } else {
            currentGap += 1;
          }
        }
      }

      return {
        pulls: input.pulls,
        rarityCounts,
        observed: Object.fromEntries(Object.entries(rarityCounts).map(([key, value]) => [key, Number((value / input.pulls).toFixed(4))])),
        configured: Object.fromEntries(((pool.rates ?? []) as Array<{ rarity: string; rate: number }>).map((item) => [item.rarity, item.rate])),
        maxSSRGap: maxGap,
        hardPity: Number(((pool.pity ?? {}) as Record<string, number>).hardPity ?? 0),
      };
    }),

  /* ------------------------ AI 配置 ------------------------ */
  listAiConfigs: adminProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    const rows = await db.select().from(aiConfigs);
    const models = await db.select().from(aiModels);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      baseUrl: row.baseUrl,
      model: row.model,
      temperature: row.temperature,
      maxTokens: row.maxTokens,
      systemPrompt: row.systemPrompt,
      jsonStrict: row.jsonStrict,
      useBuiltInGateway: row.useBuiltInGateway,
      enabled: row.enabled,
      isActive: row.isActive,
      apiKeyConfigured: Boolean(row.apiKeyCipher),
      apiKeyHint: row.apiKeyHint,
      keyPreview: row.apiKeyCipher ? maskApiKey(row.apiKeyHint ?? "****") : "未配置",
      lastTestAt: row.lastTestAt,
      lastTestStatus: row.lastTestStatus,
      models: models.filter((model) => model.configId === row.id).map((model) => ({ modelId: model.modelId, label: model.label, isDefault: model.isDefault, enabled: model.enabled })),
      updatedAt: row.updatedAt,
    }));
  }),

  saveAiConfig: adminProcedure
    .input(
      z.object({
        id: z.number().int().positive().optional(),
        name: z.string().min(1).max(64),
        baseUrl: z.string().max(255).optional(),
        /** 仅当需要更新时传入明文 Key；留空表示保留现有 Key */
        apiKey: z.string().max(400).nullable().optional(),
        model: z.string().max(96).optional(),
        temperature: z.number().int().min(0).max(200),
        maxTokens: z.number().int().min(128).max(4000),
        systemPrompt: z.string().max(4000).nullable().optional(),
        jsonStrict: z.boolean(),
        useBuiltInGateway: z.boolean(),
        enabled: z.boolean().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });

      const incomingKey = input.apiKey?.trim() ?? "";
      const [existing] = input.id
        ? await db.select({ id: aiConfigs.id, apiKeyCipher: aiConfigs.apiKeyCipher }).from(aiConfigs).where(eq(aiConfigs.id, input.id)).limit(1)
        : [];
      if (input.id && !existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "配置不存在" });
      }
      if (!input.useBuiltInGateway) {
        if (!input.baseUrl?.trim()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "使用外部模型时必须填写 Base URL" });
        }
        if (!incomingKey && !existing?.apiKeyCipher) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "使用外部模型时必须填写 API Key" });
        }
      }

      const values: Record<string, unknown> = {
        name: input.name,
        baseUrl: input.baseUrl ?? "",
        model: input.model ?? "",
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        systemPrompt: input.systemPrompt ?? null,
        jsonStrict: input.jsonStrict,
        useBuiltInGateway: input.useBuiltInGateway,
        enabled: input.enabled ?? true,
      };
      if (incomingKey) {
        const plain = incomingKey;
        values.apiKeyCipher = encryptSecret(plain, secretOf());
        values.apiKeyHint = plain.length > 8 ? `${plain.slice(0, 4)}****${plain.slice(-4)}` : "****";
      }

      let id = input.id;
      if (id) {
        await db.update(aiConfigs).set(values as never).where(eq(aiConfigs.id, id));
      } else {
        const insertValues: Record<string, unknown> = { ...(values as Record<string, unknown>) };
        insertValues.apiKeyCipher = (values.apiKeyCipher as string) ?? null;
        const [inserted] = await db.insert(aiConfigs).values(insertValues as never).$returningId();
        id = inserted.id;
      }

      if (input.isActive) {
        await db.update(aiConfigs).set({ isActive: false }).where(eq(aiConfigs.enabled, true));
        await db.update(aiConfigs).set({ isActive: true }).where(eq(aiConfigs.id, id));
      }

      await audit(ctx, "ai.save", "aiConfig", String(id), { useBuiltInGateway: input.useBuiltInGateway, model: input.model });
      return { ok: true, id };
    }),

  activateAiConfig: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    await db.update(aiConfigs).set({ isActive: false });
    await db.update(aiConfigs).set({ isActive: true, enabled: true }).where(eq(aiConfigs.id, input.id));
    await audit(ctx, "ai.activate", "aiConfig", String(input.id));
    return { ok: true };
  }),

  deleteAiConfig: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    const [row] = await db.select().from(aiConfigs).where(eq(aiConfigs.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "配置不存在" });
    if (row.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "不能删除当前生效的配置，请先切换" });
    await db.delete(aiModels).where(eq(aiModels.configId, input.id));
    await db.delete(aiConfigs).where(eq(aiConfigs.id, input.id));
    await audit(ctx, "ai.delete", "aiConfig", String(input.id));
    return { ok: true };
  }),

  /** 模型拉取（外部 OpenAI 兼容 /v1/models，或内置网关目录） */
  fetchAiModels: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    const [row] = await db.select().from(aiConfigs).where(eq(aiConfigs.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "配置不存在" });

    const runtime: AiRuntimeConfig = {
      configId: row.id,
      name: row.name,
      baseUrl: row.useBuiltInGateway ? "" : row.baseUrl,
      apiKey: row.apiKeyCipher ? decryptSecret(row.apiKeyCipher, secretOf()) : null,
      model: row.model ?? "",
      temperature: row.temperature,
      maxTokens: row.maxTokens,
      systemPrompt: row.systemPrompt,
      jsonStrict: row.jsonStrict,
      useBuiltInGateway: row.useBuiltInGateway,
    };

    try {
      const result = await fetchModels(runtime);
      if (result.models.length === 0) {
        return { ok: false, models: [], source: result.source, message: "未拉取到任何模型" };
      }
      await db.delete(aiModels).where(eq(aiModels.configId, row.id));
      await db.insert(aiModels).values(
        result.models.slice(0, 200).map((model) => ({
          configId: row.id,
          modelId: model.id.slice(0, 128),
          label: model.id.slice(0, 128),
          ownedBy: (model.ownedBy ?? "").slice(0, 64),
          isDefault: model.id === row.model,
          enabled: true,
        })),
      );
      await audit(ctx, "ai.fetchModels", "aiConfig", String(row.id), { count: result.models.length });
      return { ok: true, models: result.models.slice(0, 200), source: result.source, message: `成功拉取 ${result.models.length} 个模型` };
    } catch (error) {
      await audit(ctx, "ai.fetchModels", "aiConfig", String(row.id), { error: (error as Error).message }, "failed");
      return { ok: false, models: [], source: runtime.useBuiltInGateway ? "builtin" : "config", message: `拉取失败：${(error as Error).message.slice(0, 300)}` };
    }
  }),

  /** 确认使用一个已拉取的模型。模型必须属于当前配置，避免前端任意注入模型标识。 */
  selectAiModel: adminProcedure
    .input(z.object({ configId: z.number().int().positive(), modelId: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      const models = await db
        .select({ id: aiModels.id, modelId: aiModels.modelId, enabled: aiModels.enabled })
        .from(aiModels)
        .where(eq(aiModels.configId, input.configId));
      const model = models.find((item) => item.modelId === input.modelId && item.enabled);
      if (!model) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "请选择该配置已拉取的可用模型" });
      }
      await db.update(aiModels).set({ isDefault: false }).where(eq(aiModels.configId, input.configId));
      await db.update(aiModels).set({ isDefault: true }).where(eq(aiModels.id, model.id));
      await db.update(aiConfigs).set({ model: input.modelId }).where(eq(aiConfigs.id, input.configId));
      await audit(ctx, "ai.selectModel", "aiConfig", String(input.configId), { model: input.modelId });
      return { ok: true, model: input.modelId };
    }),

  /** AI 调用测试（GM 后台按钮） */
  testAiConfig: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    const [row] = await db.select().from(aiConfigs).where(eq(aiConfigs.id, input.id)).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "配置不存在" });

    const runtime: AiRuntimeConfig = {
      configId: row.id,
      name: row.name,
      baseUrl: row.useBuiltInGateway ? "" : row.baseUrl,
      apiKey: row.apiKeyCipher ? decryptSecret(row.apiKeyCipher, secretOf()) : null,
      model: row.model ?? "",
      temperature: row.temperature,
      maxTokens: row.maxTokens,
      systemPrompt: row.systemPrompt,
      jsonStrict: row.jsonStrict,
      useBuiltInGateway: row.useBuiltInGateway,
    };

    const result = await testAiConnection(runtime);
    await db
      .update(aiConfigs)
      .set({ lastTestAt: new Date(), lastTestStatus: result.ok ? "ok" : "failed" })
      .where(eq(aiConfigs.id, row.id));
    await audit(ctx, "ai.test", "aiConfig", String(row.id), { ok: result.ok });
    return result;
  }),

  /** AI 调用记录 */
  aiLogs: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(50), onlyViolations: z.boolean().optional() }).optional())
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      let rows = await db.select().from(aiCallLogs).orderBy(desc(aiCallLogs.id)).limit(input?.limit ?? 50);
      if (input?.onlyViolations) rows = rows.filter((row) => row.violationCount > 0 || row.status !== "ok");
      return rows.map((row) => ({
        id: row.id,
        profileId: row.profileId,
        model: row.model,
        endpoint: row.endpoint,
        status: row.status,
        httpStatus: row.httpStatus,
        latencyMs: row.latencyMs,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        presentCharKeys: row.presentCharKeys,
        violationCount: row.violationCount,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt,
      }));
    }),

  /* ------------------------ 会员管理 ------------------------ */
  listMembers: adminProcedure
    .input(
      z
        .object({
          search: z.string().max(64).optional(),
          page: z.number().int().min(1).max(200).default(1),
          pageSize: z.number().int().min(5).max(50).default(20),
          sortBy: z.enum(["createdAt", "lastSignedIn", "onlineSeconds"]).default("createdAt"),
          sortDirection: z.enum(["asc", "desc"]).default("desc"),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      const search = input?.search?.trim();
      let rows = search
        ? await db
            .select()
            .from(users)
            .where(or(like(users.name, `%${search}%`), like(users.email, `%${search}%`), like(users.openId, `%${search}%`)))
            .limit(200)
        : await db.select().from(users).limit(200);
      const profiles = await db.select().from(gameProfiles);
      const profileMap = new Map(profiles.map((profile) => [profile.userId, profile]));
      const ownedCharacters = await db.select({ profileId: playerCharacters.profileId }).from(playerCharacters).limit(20000);
      const characterCountByProfile = new Map<number, number>();
      for (const character of ownedCharacters) {
        characterCountByProfile.set(character.profileId, (characterCountByProfile.get(character.profileId) ?? 0) + 1);
      }

      const sortBy = input?.sortBy ?? "createdAt";
      const direction = input?.sortDirection === "asc" ? 1 : -1;
      rows.sort((a, b) => {
        const aValue = sortBy === "onlineSeconds" ? a.onlineSeconds : a[sortBy].getTime();
        const bValue = sortBy === "onlineSeconds" ? b.onlineSeconds : b[sortBy].getTime();
        if (aValue !== bValue) return (aValue - bValue) * direction;
        return (b.id - a.id) * direction;
      });

      const page = input?.page ?? 1;
      const pageSize = input?.pageSize ?? 20;
      const paged = rows.slice((page - 1) * pageSize, page * pageSize);

      return {
        total: rows.length,
        page,
        pageSize,
        members: paged.map((row) => {
          const profile = profileMap.get(row.id);
          return {
            id: row.id,
            name: row.name,
            email: row.email,
            role: row.role,
            membership: row.membership,
            membershipExpiresAt: row.membershipExpiresAt,
            banned: row.banned,
            createdAt: row.createdAt,
            lastSignedIn: row.lastSignedIn,
            onlineSeconds: row.onlineSeconds,
            lastActiveAt: row.lastActiveAt,
            online: Boolean(row.lastActiveAt && Date.now() - row.lastActiveAt.getTime() <= 5 * 60 * 1000),
            profile: profile
              ? {
                  id: profile.id,
                  lordName: profile.lordName,
                  keepName: profile.keepName,
                  chapter: profile.chapter,
                  keepLevel: profile.keepLevel,
                  renown: profile.renown,
                  createdAt: profile.createdAt,
                  characterCount: characterCountByProfile.get(profile.id) ?? 0,
                }
              : null,
          };
        }),
        stats: {
          total: rows.length,
          admins: rows.filter((row) => row.role === "admin").length,
          supporters: rows.filter((row) => row.membership === "supporter").length,
          banned: rows.filter((row) => row.banned).length,
          linkedProfiles: rows.filter((row) => profileMap.has(row.id)).length,
        },
      };
    }),

  updateMember: adminProcedure
    .input(
      z.object({
        userId: z.number().int().positive(),
        role: z.enum(["user", "admin"]).optional(),
        membership: z.enum(["free", "supporter"]).optional(),
        membershipMonths: z.number().int().min(0).max(60).optional(),
        banned: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const admin = requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      if (input.userId === admin.id && (input.role === "user" || input.banned)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能降级或封禁自己的账号" });
      }
      const values: Record<string, unknown> = {};
      if (input.role) values.role = input.role;
      if (input.banned !== undefined) values.banned = input.banned;
      if (input.membership) {
        values.membership = input.membership;
        if (input.membership === "supporter" && input.membershipMonths) {
          values.membershipExpiresAt = new Date(Date.now() + input.membershipMonths * 30 * 24 * 3600 * 1000);
        } else if (input.membership === "free") {
          values.membershipExpiresAt = null;
        }
      }
      await db.update(users).set(values).where(eq(users.id, input.userId));
      await audit(ctx, "member.update", "user", String(input.userId), values);
      return { ok: true };
    }),

  /** 会员档案及其已拥有角色，供后台在一个入口内维护。 */
  getMemberGameData: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });

      const [profile] = await db.select().from(gameProfiles).where(eq(gameProfiles.userId, input.userId)).limit(1);
      if (!profile) return { profile: null, characters: [] };

      const owned = await db.select().from(playerCharacters).where(eq(playerCharacters.profileId, profile.id)).orderBy(desc(playerCharacters.updatedAt));
      const charKeys = owned.map((character) => character.charKey);
      const configs = charKeys.length > 0 ? await db.select().from(characters).where(inArray(characters.charKey, charKeys)) : [];
      const configByKey = new Map(configs.map((character) => [character.charKey, character]));

      return {
        profile: {
          id: profile.id,
          lordName: profile.lordName,
          keepName: profile.keepName,
          chapter: profile.chapter,
          keepLevel: profile.keepLevel,
          renown: profile.renown,
          gold: profile.gold,
          food: profile.food,
          wood: profile.wood,
          iron: profile.iron,
          aether: profile.aether,
          crownCoins: profile.crownCoins,
          stamina: profile.stamina,
          staminaMax: profile.staminaMax,
        },
        characters: owned.map((character) => {
          const config = configByKey.get(character.charKey);
          return {
            id: character.id,
            charKey: character.charKey,
            name: config?.name ?? character.charKey,
            title: config?.title ?? "",
            avatarUrl: config?.avatarUrl ?? null,
            rarity: config?.rarity ?? "R",
            job: config?.job ?? "",
            level: character.level,
            exp: character.exp,
            ascension: character.ascension,
            bondLevel: character.bondLevel,
            bondExp: character.bondExp,
            affection: character.affection,
            locked: character.locked,
            isNew: character.isNew,
            obtainedAt: character.obtainedAt,
            updatedAt: character.updatedAt,
          };
        }),
      };
    }),

  /** 由 GM 投递玩家邮箱，可发送纯通知或附带资源的信函。 */
  sendMail: adminProcedure.input(adminMailInput).mutation(async ({ ctx, input }) => {
    const admin = requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    const [profile] = await db.select({ id: gameProfiles.id }).from(gameProfiles).where(eq(gameProfiles.id, input.profileId)).limit(1);
    if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "档案不存在" });
    const rewards = normalizeMailRewards(input.rewards);
    const attachments = normalizeMailAttachments(input.attachments);
    await validateMailAttachments(db, attachments);
    const [inserted] = await db.insert(profileMails).values({
      profileId: profile.id,
      subject: input.subject,
      content: input.content,
      rewards,
      attachments,
      sentByUserId: admin.id,
    }).$returningId();
    await audit(ctx, "mail.send", "profile", String(profile.id), { subject: input.subject, rewards, attachments });
    return { ok: true, mailId: inserted.id };
  }),

  /** 投递中心的可选领主、装备与通用物品清单。 */
  deliveryCatalog: adminProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    const [profiles, equipmentRows, characterRows] = await Promise.all([
      db.select({ id: gameProfiles.id, lordName: gameProfiles.lordName, keepName: gameProfiles.keepName }).from(gameProfiles).orderBy(desc(gameProfiles.id)),
      db.select({ equipKey: equipments.equipKey, name: equipments.name, rarity: equipments.rarity, slot: equipments.slot, requiredLevel: equipments.requiredLevel }).from(equipments).orderBy(equipments.equipKey),
      db.select({ charKey: characters.charKey, name: characters.name, title: characters.title, rarity: characters.rarity, job: characters.job }).from(characters).orderBy(characters.sortOrder),
    ]);
    return {
      profileCount: profiles.length,
      profiles,
      equipments: equipmentRows,
      items: SHOP_ITEMS.map((item) => ({ itemKey: item.itemKey, name: item.name, description: item.description })),
      characters: characterRows,
    };
  }),

  /** 向一位领主或全体已建档领主投递同一份信函与附件。 */
  deliverMail: adminProcedure.input(adminDeliveryInput).mutation(async ({ ctx, input }) => {
    const admin = requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    const rewards = normalizeMailRewards(input.rewards);
    const attachments = normalizeMailAttachments(input.attachments);
    await validateMailAttachments(db, attachments);
    const recipients = input.target === "all"
      ? await db.select({ id: gameProfiles.id }).from(gameProfiles)
      : await db.select({ id: gameProfiles.id }).from(gameProfiles).where(eq(gameProfiles.id, input.profileId!)).limit(1);
    if (recipients.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: input.target === "all" ? "当前没有可投递的领主档案" : "领主档案不存在" });

    await db.insert(profileMails).values(recipients.map((recipient) => ({
      profileId: recipient.id,
      subject: input.subject,
      content: input.content,
      rewards,
      attachments,
      sentByUserId: admin.id,
    })));
    await audit(ctx, "mail.deliver", input.target === "all" ? "profiles" : "profile", input.target === "all" ? "all" : String(recipients[0].id), {
      subject: input.subject,
      rewards,
      attachments,
      recipientCount: recipients.length,
    });
    return { ok: true, recipientCount: recipients.length, target: input.target };
  }),

  /** GM 可修正某位会员已经拥有的角色成长数据；每次更改均写入审计日志。 */
  updateMemberCharacter: adminProcedure
    .input(
      z
        .object({
          playerCharacterId: z.number().int().positive(),
          level: z.number().int().min(1).max(100).optional(),
          exp: z.number().int().min(0).max(2_000_000_000).optional(),
          ascension: z.number().int().min(0).max(10).optional(),
          bondLevel: z.number().int().min(1).max(20).optional(),
          bondExp: z.number().int().min(0).max(2_000_000_000).optional(),
          affection: z.number().int().min(-100).max(100).optional(),
          locked: z.boolean().optional(),
          isNew: z.boolean().optional(),
        })
        .refine((input) => Object.keys(input).some((key) => key !== "playerCharacterId"), "至少修改一项角色数据"),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });

      const [character] = await db.select().from(playerCharacters).where(eq(playerCharacters.id, input.playerCharacterId)).limit(1);
      if (!character) throw new TRPCError({ code: "NOT_FOUND", message: "玩家角色不存在" });

      const { playerCharacterId, ...updates } = input;
      await db.update(playerCharacters).set(updates).where(eq(playerCharacters.id, playerCharacterId));
      await audit(ctx, "member.character.update", "playerCharacter", String(playerCharacterId), {
        profileId: character.profileId,
        charKey: character.charKey,
        before: {
          level: character.level,
          exp: character.exp,
          ascension: character.ascension,
          bondLevel: character.bondLevel,
          bondExp: character.bondExp,
          affection: character.affection,
          locked: character.locked,
          isNew: character.isNew,
        },
        after: updates,
      });
      return { ok: true };
    }),

  /**
   * 永久删除玩家账号及其游戏存档。审计记录会保留，便于追查后台操作；
   * 当前管理员不能删除自己，避免误操作导致没有 GM 可用。
   */
  deleteMember: adminProcedure
    .input(z.object({ userId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const admin = requireAdmin(ctx);
      if (input.userId === admin.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "不能删除当前登录的管理员账号" });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      const [target] = await db.select({ id: users.id, name: users.name, openId: users.openId }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "账号不存在或已被删除" });

      const profiles = await db.select({ id: gameProfiles.id }).from(gameProfiles).where(eq(gameProfiles.userId, input.userId));
      const profileIds = profiles.map((profile) => profile.id);

      await db.transaction(async (tx) => {
        if (profileIds.length > 0) {
          await tx.delete(aiMessages).where(inArray(aiMessages.profileId, profileIds));
          await tx.delete(aiCallLogs).where(inArray(aiCallLogs.profileId, profileIds));
          await tx.delete(aiConversations).where(inArray(aiConversations.profileId, profileIds));
          await tx.delete(battleLogs).where(inArray(battleLogs.profileId, profileIds));
          await tx.delete(battles).where(inArray(battles.profileId, profileIds));
          await tx.delete(recruitHistories).where(inArray(recruitHistories.profileId, profileIds));
          await tx.delete(profilePity).where(inArray(profilePity.profileId, profileIds));
          await tx.delete(profileMails).where(inArray(profileMails.profileId, profileIds));
          await tx.delete(profileStoryFlags).where(inArray(profileStoryFlags.profileId, profileIds));
          await tx.delete(profileQuests).where(inArray(profileQuests.profileId, profileIds));
          await tx.delete(nodeStates).where(inArray(nodeStates.profileId, profileIds));
          await tx.delete(regionStates).where(inArray(regionStates.profileId, profileIds));
          await tx.delete(profileBuildings).where(inArray(profileBuildings.profileId, profileIds));
          await tx.delete(teams).where(inArray(teams.profileId, profileIds));
          await tx.delete(shopPurchases).where(inArray(shopPurchases.profileId, profileIds));
          await tx.delete(playerItems).where(inArray(playerItems.profileId, profileIds));
          await tx.delete(playerEquipments).where(inArray(playerEquipments.profileId, profileIds));
          await tx.delete(playerCharacters).where(inArray(playerCharacters.profileId, profileIds));
          await tx.delete(gameProfiles).where(inArray(gameProfiles.id, profileIds));
        }
        await tx.delete(apiTokens).where(eq(apiTokens.userId, input.userId));
        await tx.delete(users).where(eq(users.id, input.userId));
      });

      await audit(ctx, "member.delete", "user", String(input.userId), {
        name: target.name,
        openId: target.openId,
        deletedProfileCount: profileIds.length,
      });
      return { ok: true, deletedName: target.name ?? target.openId, deletedProfileCount: profileIds.length };
    }),

  /* ------------------------ 备份 / 恢复 ------------------------ */
  listBackups: adminProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const rows = await listBackups(60);
    return rows.map((row) => ({
      id: row.id,
      backupKey: row.backupKey,
      scope: row.scope,
      targetProfileId: row.targetProfileId,
      filename: row.filename,
      sizeBytes: row.sizeBytes,
      checksum: row.checksum,
      recordCounts: row.recordCounts,
      status: row.status,
      note: row.note,
      createdAt: row.createdAt,
      restoredAt: row.restoredAt,
    }));
  }),

  createBackup: adminProcedure
    .input(z.object({ scope: z.enum(["full", "config", "profile"]), targetProfileId: z.number().int().positive().nullable().optional(), note: z.string().max(200).optional() }))
    .mutation(async ({ ctx, input }) => {
      const admin = requireAdmin(ctx);
      const result = await createBackup({
        scope: input.scope,
        targetProfileId: input.targetProfileId ?? null,
        createdBy: admin.id,
        note: input.note ?? null,
      });
      await audit(ctx, "backup.create", "backup", result.ok ? result.backupKey : "failed", { scope: input.scope }, result.ok ? "ok" : "failed");
      return result;
    }),

  restoreBackup: adminProcedure.input(z.object({ backupId: z.number().int().positive(), dryRun: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    const admin = requireAdmin(ctx);
    const result = await restoreBackup({ backupId: input.backupId, adminUserId: admin.id, dryRun: input.dryRun });
    await audit(ctx, "backup.restore", "backup", String(input.backupId), { dryRun: Boolean(input.dryRun) }, result.ok ? "ok" : "failed");
    return result;
  }),

  /** 上传备份文件校验（不写入数据库） */
  verifyBackupUpload: adminProcedure
    .input(z.object({ filename: z.string().max(160), base64: z.string().min(16).max(20_000_000) }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const raw = Buffer.from(input.base64.replace(/^data:[^,]+,/, ""), "base64").toString("utf8");
      const verified = verifySnapshot(raw);
      return { ok: verified.ok, reason: verified.reason, scope: verified.snapshot?.scope, createdAt: verified.snapshot?.createdAt, summary: verified.summary };
    }),

  /* ------------------------ 配置同步 ------------------------ */
  syncBuiltInContent: adminProcedure.input(z.object({ force: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
    requireAdmin(ctx);
    const result = await seedContent({ force: input.force });
    await audit(ctx, "config.sync", "content", null, { force: input.force });
    return result;
  }),

  listAuditLogs: adminProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    const rows = await db.select().from(adminAuditLogs).orderBy(desc(adminAuditLogs.id)).limit(100);
    return rows;
  }),

  listPlayerProfiles: adminProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
    const rows = await db.select().from(gameProfiles).orderBy(desc(gameProfiles.id)).limit(100);
    const owned = await db.select().from(playerCharacters).limit(20000);
    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      lordName: row.lordName,
      keepName: row.keepName,
      chapter: row.chapter,
      keepLevel: row.keepLevel,
      renown: row.renown,
      gold: row.gold,
      food: row.food,
      wood: row.wood,
      iron: row.iron,
      aether: row.aether,
      stamina: row.stamina,
      staminaMax: row.staminaMax,
      characterCount: owned.filter((item) => item.profileId === row.id).length,
      createdAt: row.createdAt,
      lastTickAt: row.lastTickAt,
    }));
  }),
  /**
   * 发放补偿 / 调整资源（正数发放，负数回收）
   * 用途：客服补偿、活动奖励、自动化测试；所有操作写入审计日志。
   */
  grantResources: adminProcedure
    .input(
      z.object({
        profileId: z.number().int().positive(),
        gold: z.number().int().min(-1000000).max(1000000).optional(),
        food: z.number().int().min(-1000000).max(1000000).optional(),
        wood: z.number().int().min(-1000000).max(1000000).optional(),
        iron: z.number().int().min(-1000000).max(1000000).optional(),
        aether: z.number().int().min(-1000000).max(1000000).optional(),
        crownCoins: z.number().int().min(-1000000).max(1000000).optional(),
        renown: z.number().int().min(-1000000).max(1000000).optional(),
        reason: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      const [profile] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, input.profileId)).limit(1);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "档案不存在" });
      const next = {
        gold: Math.max(0, profile.gold + (input.gold ?? 0)),
        food: Math.max(0, profile.food + (input.food ?? 0)),
        wood: Math.max(0, profile.wood + (input.wood ?? 0)),
        iron: Math.max(0, profile.iron + (input.iron ?? 0)),
        aether: Math.max(0, profile.aether + (input.aether ?? 0)),
        crownCoins: Math.max(0, profile.crownCoins + (input.crownCoins ?? 0)),
        renown: Math.max(0, profile.renown + (input.renown ?? 0)),
      };
      await db.update(gameProfiles).set(next).where(eq(gameProfiles.id, profile.id));
      await audit(ctx, "resources.grant", "profile", String(profile.id), { ...input });
      return { ok: true as const, profileId: profile.id, resources: next };
    }),

  /** GM 直接设置玩家资源绝对值；与 grantResources 的增减模式分开，避免语义混淆。 */
  setResources: adminProcedure
    .input(
      z.object({
        profileId: z.number().int().positive(),
        gold: z.number().int().min(0).max(2_000_000_000).optional(),
        food: z.number().int().min(0).max(2_000_000_000).optional(),
        wood: z.number().int().min(0).max(2_000_000_000).optional(),
        iron: z.number().int().min(0).max(2_000_000_000).optional(),
        aether: z.number().int().min(0).max(2_000_000_000).optional(),
        crownCoins: z.number().int().min(0).max(2_000_000_000).optional(),
        renown: z.number().int().min(0).max(2_000_000_000).optional(),
        stamina: z.number().int().min(0).max(999).optional(),
        reason: z.string().trim().max(200).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接不可用" });
      const [profile] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, input.profileId)).limit(1);
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "档案不存在" });
      const next = {
        gold: input.gold ?? profile.gold,
        food: input.food ?? profile.food,
        wood: input.wood ?? profile.wood,
        iron: input.iron ?? profile.iron,
        aether: input.aether ?? profile.aether,
        crownCoins: input.crownCoins ?? profile.crownCoins,
        renown: input.renown ?? profile.renown,
        stamina: Math.min(input.stamina ?? profile.stamina, profile.staminaMax),
      };
      await db.update(gameProfiles).set(next).where(eq(gameProfiles.id, profile.id));
      await audit(ctx, "resources.set", "profile", String(profile.id), {
        before: { gold: profile.gold, food: profile.food, wood: profile.wood, iron: profile.iron, aether: profile.aether, crownCoins: profile.crownCoins, renown: profile.renown, stamina: profile.stamina },
        after: next,
        reason: input.reason ?? null,
      });
      return { ok: true as const, profileId: profile.id, resources: { ...next, staminaMax: profile.staminaMax } };
    }),
});
