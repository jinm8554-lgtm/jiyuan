#!/usr/bin/env node
/**
 * 《裂隙纪元》数据库迁移执行器
 * 用法：
 *   node scripts/migrate.mjs            # 应用所有未执行的迁移
 *   node scripts/migrate.mjs --status   # 只查看状态
 *
 * 机制：
 *   - 读取 drizzle/meta/_journal.json 中的迁移顺序
 *   - 已执行记录写入 __aetherfall_migrations 表（迁移表自身不参与业务逻辑）
 *   - 对「表已存在」的语句做幂等跳过（用于将已被模板创建的表纳入版本管理，即 baseline）
 *   - 每一步独立执行，失败即中止并打印上下文
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import mysql from "mysql2/promise";

const root = path.resolve(import.meta.dirname, "..");
const journalPath = path.join(root, "drizzle/meta/_journal.json");
const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("未找到 DATABASE_URL，无法执行迁移");
  process.exit(1);
}

const onlyStatus = process.argv.includes("--status");
const conn = await mysql.createConnection({ uri: url, multipleStatements: false });

await conn.query(`
  CREATE TABLE IF NOT EXISTS \`__aetherfall_migrations\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`tag\` varchar(128) NOT NULL,
    \`checksum\` varchar(80) NOT NULL,
    \`statements\` int NOT NULL,
    \`skipped\` int NOT NULL DEFAULT 0,
    \`appliedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uq_migration_tag\` (\`tag\`)
  )
`);

const [appliedRows] = await conn.query("SELECT tag, appliedAt FROM `__aetherfall_migrations`");
const applied = new Map(appliedRows.map((r) => [r.tag, r.appliedAt]));

const tableExists = async (name) => {
  const [rows] = await conn.query(
    "SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [name],
  );
  return rows[0].c > 0;
};

const targetTable = (stmt) => {
  const m = stmt.match(/CREATE TABLE\s+`([^`]+)`/i);
  return m ? m[1] : null;
};

let failures = 0;

for (const entry of journal.entries) {
  const tag = entry.tag;
  const file = path.join(root, `drizzle/${tag}.sql`);
  if (!fs.existsSync(file)) {
    console.warn(`· 跳过 ${tag}（SQL 文件不存在）`);
    continue;
  }
  const sql = fs.readFileSync(file, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex").slice(0, 32);
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  if (applied.has(tag)) {
    console.log(`· 已应用 ${tag}（${new Date(applied.get(tag)).toISOString()}）`);
    continue;
  }
  if (onlyStatus) {
    console.log(`· 待应用 ${tag}（${statements.length} 条语句）`);
    continue;
  }

  console.log(`▶ 应用 ${tag}（${statements.length} 条语句）`);
  let ok = 0;
  let skipped = 0;
  for (const stmt of statements) {
    const t = targetTable(stmt);
    try {
      if (t && (await tableExists(t))) {
        skipped += 1;
        continue;
      }
      await conn.query(stmt);
      ok += 1;
    } catch (error) {
      failures += 1;
      console.error(`\n✖ 迁移失败：${tag}`);
      console.error(`  语句：${stmt.slice(0, 220).replace(/\s+/g, " ")}…`);
      console.error(`  原因：${error.message}`);
      break;
    }
  }
  if (failures > 0) break;

  await conn.query(
    "INSERT INTO `__aetherfall_migrations` (`tag`, `checksum`, `statements`, `skipped`) VALUES (?, ?, ?, ?)",
    [tag, checksum, ok, skipped],
  );
  console.log(`✓ ${tag} 完成（执行 ${ok}，幂等跳过 ${skipped}）`);
}

await conn.end();
if (failures > 0) process.exit(1);
console.log("迁移流程结束。");