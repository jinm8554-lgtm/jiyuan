import { sql } from "drizzle-orm";
import {
  buildings,
  characters,
  domainEvents,
  equipments,
  recruitPools,
  quests,
  regions,
  skills,
  storyScenes,
  worldNodes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { BUILDING_SEEDS } from "./data/buildings";
import { CHARACTER_SEEDS } from "./data/characters";
import { EQUIPMENT_SEEDS } from "./data/equipments";
import { EVENT_SEEDS, POOL_SEEDS, QUEST_SEEDS } from "./data/quests";
import { SKILL_SEEDS } from "./data/skills";
import { STORY_SEEDS } from "./data/story";
import { NODE_SEEDS, REGION_SEEDS } from "./data/world";

/**
 * 策划配置写入（幂等）
 * - 已存在的行默认保留 GM 后台的修改（只做「缺失即插入」），因此后台改动不会被启动流程覆盖
 * - 通过 force=true（后台「同步内置配置」按钮）才会覆盖为代码中的最新配置
 */
export async function seedContent(options: { force?: boolean } = {}) {
  const db = await getDb();
  if (!db) return { ok: false, reason: "database_unavailable" as const };

  const force = options.force ?? false;
  const counts: Record<string, number> = {};

  const upsertBulk = async (
    table: Parameters<typeof db.insert>[0],
    keyColumn: string,
    rows: Array<Record<string, unknown>>,
  ) => {
    if (rows.length === 0) return 0;
    if (force) {
      // 覆盖模式：必须逐行计算 SET，否则会把第一行的值写到所有行上（曾导致全部角色变成同一个人）
      let written = 0;
      for (const row of rows) {
        const record = row as Record<string, unknown>;
        const set = Object.keys(record).reduce<Record<string, unknown>>((acc, key) => {
          if (key !== keyColumn && key !== "id") acc[key] = record[key];
          return acc;
        }, {});
        await db
          .insert(table)
          .values(record as never)
          .onDuplicateKeyUpdate({ set: set as never });
        written += 1;
      }
      return written;
    }
    // 非覆盖模式：使用 INSERT IGNORE 语义，保留既有行（含后台修改）
    let inserted = 0;
    for (const row of rows) {
      const result = await db
        .insert(table)
        .values(row as never)
        .onDuplicateKeyUpdate({ set: { [keyColumn]: (row as Record<string, unknown>)[keyColumn] } as never });
      void result;
      inserted += 1;
    }
    return inserted;
  };

  counts.skills = await upsertBulk(skills, "skillKey", SKILL_SEEDS as unknown as Array<Record<string, unknown>>);
  counts.equipments = await upsertBulk(equipments, "equipKey", EQUIPMENT_SEEDS as unknown as Array<Record<string, unknown>>);
  counts.buildings = await upsertBulk(buildings, "buildingKey", BUILDING_SEEDS as unknown as Array<Record<string, unknown>>);
  counts.regions = await upsertBulk(regions, "regionKey", REGION_SEEDS as unknown as Array<Record<string, unknown>>);
  counts.worldNodes = await upsertBulk(
    worldNodes,
    "nodeKey",
    NODE_SEEDS.map((node) => ({
      ...node,
      enemyWave: node.enemyWave.map((enemyUnit) => ({
        id: enemyUnit.id,
        name: enemyUnit.name,
        job: enemyUnit.job,
        element: enemyUnit.element,
        rarity: enemyUnit.rarity,
        level: enemyUnit.level,
        stats: enemyUnit.stats,
        skillKeys: enemyUnit.skillKeys,
        note: enemyUnit.note,
      })),
    })) as unknown as Array<Record<string, unknown>>,
  );
  counts.quests = await upsertBulk(quests, "questKey", QUEST_SEEDS as unknown as Array<Record<string, unknown>>);
  counts.storyScenes = await upsertBulk(storyScenes, "sceneKey", STORY_SEEDS as unknown as Array<Record<string, unknown>>);
  counts.recruitPools = await upsertBulk(recruitPools, "poolKey", POOL_SEEDS as unknown as Array<Record<string, unknown>>);
  counts.domainEvents = await upsertBulk(domainEvents, "eventKey", EVENT_SEEDS as unknown as Array<Record<string, unknown>>);
  counts.characters = await upsertBulk(
    characters,
    "charKey",
    CHARACTER_SEEDS.map((char) => ({
      ...char,
      status: "published",
      inRecruitPool: true,
      contentRating: "all-ages",
    })) as unknown as Array<Record<string, unknown>>,
  );

  return { ok: true as const, counts };
}

/** 启动时调用：仅当配置表为空时写入（不影响后台改动） */
let seedPromise: Promise<unknown> | null = null;
export function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = (async () => {
      try {
        const db = await getDb();
        if (!db) return;
        const [row] = await db.select({ count: sql<number>`count(*)` }).from(characters);
        if (Number(row?.count ?? 0) > 0) return;
        const result = await seedContent();
        console.log("[seed] 内置策划配置已写入:", result);
      } catch (error) {
        console.warn("[seed] 初始化策划配置失败（可稍后在后台手动同步）:", error);
        seedPromise = null;
      }
    })();
  }
  return seedPromise;
}
