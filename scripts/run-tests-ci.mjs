import { spawnSync } from "node:child_process";

const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(packageManager, ["exec", "vitest", "run", "--run"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, REQUIRE_DB_TESTS: "true" },
});

if (result.error) {
  console.error(`无法启动测试进程：${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
