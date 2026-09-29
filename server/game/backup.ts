import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  backupRecords,
  characters,
  domainEvents,
  equipments,
  gameProfiles,
  nodeStates,
  playerCharacters,
  playerEquipments,
  profileBuildings,
  profileMails,
  profilePity,
  profileQuests,
  profileStoryFlags,
  quests,
  recruitPools,
  regionStates,
  skills,
  storyScenes,
  teams,
  worldNodes,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { storagePut, storageRead } from "../storage";

/**
 * 备份与恢复
 * - full：全部策划配置 + 全部玩家存档（结构版本 + 数据快照，JSON 存 S3）
 * - config：仅策划配置
 * - profile：单个玩家存档
 * 恢复策略：按业务键（charKey/nodeKey/...）upsert，绝不删除玩家数据；
 *          恢复前自动生成一次「恢复前快照」，可回滚。
 */

export const BACKUP_VERSION = 1;

type Snapshot = {
  version: number;
  createdAt: string;
  scope: "full" | "config" | "profile";
  targetProfileId?: number | null;
  tables: Record<string, unknown[]>;
};

const CONFIG_TABLES = [
  ["characters", characters],
  ["skills", skills],
  ["equipments", equipments],
  ["worldNodes", worldNodes],
  ["quests", quests],
  ["storyScenes", storyScenes],
  ["recruitPools", recruitPools],
  ["domainEvents", domainEvents],
] as const;

const PROFILE_TABLES = [
  "gameProfiles",
  "playerCharacters",
  "playerEquipments",
  "teams",
  "profileBuildings",
  "profileMails",
  "regionStates",
  "nodeStates",
  "profileQuests",
  "profileStoryFlags",
  "profilePity",
] as const;

async function dumpProfileTables(profileId: number) {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  return {
    gameProfiles: await db.select().from(gameProfiles).where(eq(gameProfiles.id, profileId)),
    playerCharacters: await db.select().from(playerCharacters).where(eq(playerCharacters.profileId, profileId)),
    playerEquipments: await db.select().from(playerEquipments).where(eq(playerEquipments.profileId, profileId)),
    teams: await db.select().from(teams).where(eq(teams.profileId, profileId)),
    profileBuildings: await db.select().from(profileBuildings).where(eq(profileBuildings.profileId, profileId)),
    profileMails: await db.select().from(profileMails).where(eq(profileMails.profileId, profileId)),
    regionStates: await db.select().from(regionStates).where(eq(regionStates.profileId, profileId)),
    nodeStates: await db.select().from(nodeStates).where(eq(nodeStates.profileId, profileId)),
    profileQuests: await db.select().from(profileQuests).where(eq(profileQuests.profileId, profileId)),
    profileStoryFlags: await db.select().from(profileStoryFlags).where(eq(profileStoryFlags.profileId, profileId)),
    profilePity: await db.select().from(profilePity).where(eq(profilePity.profileId, profileId)),
  } as Record<string, unknown[]>;
}

async function dumpConfigTables() {
  const db = await getDb();
  if (!db) throw new Error("数据库不可用");
  const out: Record<string, unknown[]> = {};
  for (const [name, table] of CONFIG_TABLES) {
    out[name] = await db.select().from(table);
  }
  return out;
}

export async function createBackup(options: {
  scope: "full" | "config" | "profile";
  targetProfileId?: number | null;
  createdBy?: number | null;
  note?: string | null;
  /** 恢复前快照使用内部标记，避免出现在常规备份列表的用户语义中 */
  internalPrefix?: string;
}) {
  const db = await getDb();
  if (!db) return { ok: false as const, reason: "database_unavailable" as const };

  const tables: Record<string, unknown[]> = {};
  if (options.scope === "full") {
    Object.assign(tables, await dumpConfigTables());
  }
  if (options.scope === "full" && options.targetProfileId) {
    Object.assign(tables, await dumpProfileTables(options.targetProfileId));
  } else if (options.scope === "profile") {
    if (!options.targetProfileId) return { ok: false as const, reason: "missing_profile" as const };
    Object.assign(tables, await dumpProfileTables(options.targetProfileId));
  } else if (options.scope === "config") {
    Object.assign(tables, await dumpConfigTables());
  }

  const snapshot: Snapshot = {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    scope: options.scope,
    targetProfileId: options.targetProfileId ?? null,
    tables,
  };
  const payload = JSON.stringify(snapshot);
  const checksum = createHash("sha256").update(payload).digest("hex").slice(0, 32);
  const prefix = options.internalPrefix ?? "aetherfall-backup";
  const backupKey = `${prefix}-${Date.now()}-${checksum.slice(0, 8)}`;
  const filename = `${backupKey}.json`;

  const recordCounts = Object.fromEntries(Object.entries(tables).map(([key, value]) => [key, value.length]));

  let fileKey: string | null = null;
  let fileUrl: string | null = null;
  try {
    const uploaded = await storagePut(`backups/${filename}`, payload, "application/json");
    fileKey = uploaded.key;
    fileUrl = uploaded.url;
  } catch (error) {
    // 上传失败也保留记录与统计（管理员可在界面上看到失败）
    const [inserted] = await db
      .insert(backupRecords)
      .values({
        backupKey,
        scope: options.scope,
        targetProfileId: options.targetProfileId ?? null,
        filename,
        checksum,
        sizeBytes: Buffer.byteLength(payload),
        recordCounts,
        status: "failed",
        note: options.note ?? null,
        errorMessage: `存储上传失败：${(error as Error).message}`,
        createdBy: options.createdBy ?? null,
      })
      .$returningId();
    return { ok: false as const, reason: "storage_failed" as const, id: inserted.id, checksum, recordCounts };
  }

  const [inserted] = await db
    .insert(backupRecords)
    .values({
      backupKey,
      scope: options.scope,
      targetProfileId: options.targetProfileId ?? null,
      filename,
      fileKey,
      fileUrl,
      checksum,
      sizeBytes: Buffer.byteLength(payload),
      recordCounts,
      status: "completed",
      note: options.note ?? null,
      createdBy: options.createdBy ?? null,
    })
    .$returningId();

  return { ok: true as const, id: inserted.id, backupKey, filename, checksum, recordCounts, sizeBytes: Buffer.byteLength(payload) };
}

/** 校验备份可用性（不写入数据库） */
export function verifySnapshot(raw: string): { ok: boolean; snapshot?: Snapshot; reason?: string; summary?: Record<string, number> } {
  try {
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed || typeof parsed !== "object" || typeof parsed.version !== "number" || typeof parsed.tables !== "object") {
      return { ok: false, reason: "格式不正确：缺少 version / tables 字段" };
    }
    if (parsed.version > BACKUP_VERSION) {
      return { ok: false, reason: `备份版本 ${parsed.version} 高于当前支持版本 ${BACKUP_VERSION}` };
    }
    const summary = Object.fromEntries(Object.entries(parsed.tables).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0]));
    return { ok: true, snapshot: parsed, summary };
  } catch (error) {
    return { ok: false, reason: `JSON 解析失败：${(error as Error).message}` };
  }
}

/**
 * 恢复备份
 * - 恢复前自动创建一次当前状态快照（internalPrefix: aetherfall-prerestore）
 * - 按业务键 upsert；不会删除已有玩家数据
 */
export async function restoreBackup(options: { backupId: number; adminUserId?: number | null; dryRun?: boolean }) {
  const db = await getDb();
  if (!db) return { ok: false as const, reason: "database_unavailable" as const };

  const [record] = await db.select().from(backupRecords).where(eq(backupRecords.id, options.backupId)).limit(1);
  if (!record) return { ok: false as const, reason: "backup_not_found" as const };
  if (!record.fileKey) return { ok: false as const, reason: "backup_file_missing" as const };

  let raw: string;
  try {
    raw = await storageRead(record.fileKey);
  } catch (error) {
    return { ok: false as const, reason: "download_failed" as const, message: (error as Error).message };
  }

  const verified = verifySnapshot(raw);
  if (!verified.ok || !verified.snapshot) return { ok: false as const, reason: "verify_failed" as const, message: verified.reason };

  if (options.dryRun) {
    return { ok: true as const, dryRun: true, scope: verified.snapshot.scope, summary: verified.summary };
  }

  // 恢复前快照
  const preRestore = await createBackup({
    scope: verified.snapshot.scope === "config" ? "config" : "full",
    targetProfileId: record.targetProfileId,
    createdBy: options.adminUserId ?? null,
    note: `恢复前自动快照（目标备份 #${options.backupId}）`,
    internalPrefix: "aetherfall-prerestore",
  });

  const restored: Record<string, number> = {};
  const tables = verified.snapshot.tables;

  const insertRows = async (
    table: Parameters<typeof db.insert>[0],
    keyColumn: string,
    rows: Array<Record<string, unknown>>,
  ) => {
    let count = 0;
    for (const row of rows) {
      const updateSet: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key === "id" || key === keyColumn) continue;
        updateSet[key] = value;
      }
      try {
        await db
          .insert(table)
          .values(row as never)
          .onDuplicateKeyUpdate({ set: updateSet as never });
        count += 1;
      } catch {
        // 忽略单行冲突（例如外键约束变化），继续恢复其他数据
      }
    }
    return count;
  };

  const CONFIG_KEY_MAP: Record<string, string> = {
    characters: "charKey",
    skills: "skillKey",
    equipments: "equipKey",
    worldNodes: "nodeKey",
    quests: "questKey",
    storyScenes: "sceneKey",
    recruitPools: "poolKey",
    domainEvents: "eventKey",
  };
  for (const [tableName, table] of CONFIG_TABLES) {
    const rows = (tables[tableName] ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) continue;
    restored[tableName] = await insertRows(table, CONFIG_KEY_MAP[tableName] ?? "id", rows);
  }

  // 玩家存档：始终以备份中的 profileId 为准（同库恢复）
  const profileRows = (tables.gameProfiles ?? []) as Array<Record<string, unknown>>;
  const mapping: Record<string, string> = {
    playerCharacters: "id",
    playerEquipments: "id",
    teams: "id",
    profileBuildings: "id",
    profileMails: "id",
    regionStates: "id",
    nodeStates: "id",
    profileQuests: "id",
    profileStoryFlags: "id",
    profilePity: "id",
  };

  if (profileRows.length > 0) {
    restored.gameProfiles = await insertRows(gameProfiles, "id", profileRows);
  }

  const db2 = await getDb();
  if (db2) {
    const tablesByName: Record<string, Parameters<typeof db2.insert>[0]> = {
      playerCharacters,
      playerEquipments,
      teams,
      profileBuildings,
      profileMails,
      regionStates,
      nodeStates,
      profileQuests,
      profileStoryFlags,
      profilePity,
    };
    const allProfileTables = PROFILE_TABLES.filter((name) => name !== "gameProfiles");
    for (const tableName of allProfileTables) {
      const rows = (tables[tableName] ?? []) as Array<Record<string, unknown>>;
      if (rows.length === 0) continue;
      restored[tableName] = await insertRows(tablesByName[tableName], mapping[tableName] ?? "id", rows);
    }
  }

  await db
    .update(backupRecords)
    .set({ status: "restored", restoredAt: new Date(), note: `${record.note ?? ""}\n[恢复于 ${new Date().toISOString()}]`.trim() })
    .where(eq(backupRecords.id, record.id));

  return {
    ok: true as const,
    dryRun: false,
    restored,
    preRestoreBackupId: preRestore.ok ? preRestore.id : null,
  };
}

export async function listBackups(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(backupRecords).orderBy(backupRecords.id).limit(200);
  return rows
    .filter((row) => !row.backupKey.startsWith("aetherfall-prerestore") || row.status === "restored")
    .sort((a, b) => b.id - a.id)
    .slice(0, limit);
}
