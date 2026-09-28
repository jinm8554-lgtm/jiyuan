import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3020";
const serverPort = new URL(baseURL).port || "3020";
const noProxy = [
  process.env.NO_PROXY,
  process.env.no_proxy,
  "127.0.0.1",
  "localhost",
]
  .filter(Boolean)
  .join(",");
process.env.NO_PROXY = noProxy;
process.env.no_proxy = noProxy;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // 用例会共同写入本地游戏数据库；串行执行避免并行建档时的登录请求互相阻塞。
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: "pnpm start",
        url: `${baseURL}/login`,
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          ...process.env,
          PORT: serverPort,
          NO_PROXY: noProxy,
          no_proxy: noProxy,
        },
      },
});
