/**
 * 内置策划配置写入脚本
 * 用法：
 *   pnpm tsx scripts/seed.ts            # 缺失即插入（保留 GM 后台改动）
 *   pnpm tsx scripts/seed.ts --force    # 覆盖为代码中的最新配置
 *   pnpm tsx scripts/seed.ts --admin <openId|userId>   # 将指定账号提升为管理员（便于本地调试）
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { users } from "../drizzle/schema";
import { seedContent } from "../server/game/seed";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("缺少 DATABASE_URL 环境变量");
    process.exit(1);
  }
  const force = process.argv.includes("--force");

  const result = await seedContent({ force });
  if (!result.ok) {
    console.error("写入失败：数据库不可用");
    process.exit(1);
  }
  console.log(`策划配置写入完成（${force ? "覆盖模式" : "增量模式"}）：`);
  for (const [key, value] of Object.entries(result.counts)) {
    console.log(`  - ${key}: ${value}`);
  }

  const adminIndex = process.argv.indexOf("--admin");
  if (adminIndex >= 0) {
    const identity = process.argv[adminIndex + 1];
    if (identity) {
      const db = drizzle(process.env.DATABASE_URL);
      const numeric = Number(identity);
      const rows = Number.isFinite(numeric) && String(numeric) === identity
        ? await db.select().from(users).where(eq(users.id, numeric)).limit(1)
        : await db.select().from(users).where(eq(users.openId, identity)).limit(1);
      if (rows.length === 0) {
        console.error(`未找到账号：${identity}`);
      } else {
        await db.update(users).set({ role: "admin" }).where(eq(users.id, rows[0].id));
        console.log(`已将账号 ${rows[0].name ?? rows[0].openId}（id=${rows[0].id}）设为管理员`);
      }
    }
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("脚本执行失败：", error);
  process.exit(1);
});