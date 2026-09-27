import { expect, test } from "@playwright/test";

test("新玩家可以完成登录、建档、首战和招募", async ({ page }) => {
  const username = `e2e-smoke-${Date.now()}`;

  await test.step("登录并自动建档", async () => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "进入你的领地" })
    ).toBeVisible();

    await page.getByLabel("账号").fill(username);
    await page.getByRole("textbox", { name: "密码" }).fill("smoke-password");
    await page.getByRole("button", { name: "进入领地" }).click();

    await expect(page).toHaveURL(/\/keep$/);
    await expect(
      page.getByRole("heading", { name: /灰隼堡 · 主城/ })
    ).toBeVisible();
    await expect(page.getByText(username, { exact: true })).toBeVisible();
  });

  await test.step("选择首个世界节点", async () => {
    await page.getByRole("link", { name: "世界地图" }).click();
    await expect(page).toHaveURL(/\/world$/);
    await expect(page.getByRole("heading", { name: /世界地图/ })).toBeVisible();

    await page.getByTestId("world-region-silverpine").last().click();
    await page.getByTestId("world-node-sp_keep_road").last().click();
    await expect(
      page.getByRole("heading", { name: "城堡外的商道" })
    ).toBeVisible();
    await page.getByRole("button", { name: /出征（体力 4）/ }).click();
    await expect(page).toHaveURL(/\/battle\/sp_keep_road$/);
  });

  await test.step("自动推演首战", async () => {
    await expect(page.getByText("正在集结远征队…")).toBeHidden({
      timeout: 30_000,
    });
    await expect(page.getByTestId("battle-auto-resolve")).toBeVisible();
    await page.getByTestId("battle-auto-resolve").click();
    await expect(
      page.getByText("远征胜利。奖励已结算并写入你的档案。")
    ).toBeVisible({ timeout: 30_000 });
  });

  await test.step("完成一次招募", async () => {
    await page.getByRole("link", { name: "招募" }).click();
    await expect(page).toHaveURL(/\/recruit$/);
    await expect(
      page.getByRole("heading", { name: /招募 · 星辉誓约/ })
    ).toBeVisible();
    await expect(page.getByTestId("recruit-single-draw")).toBeEnabled();
    await page.getByTestId("recruit-single-draw").click();
    await expect(page.getByTestId("recruit-results")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("heading", { name: "招募结果" })).toBeVisible();
  });
});
