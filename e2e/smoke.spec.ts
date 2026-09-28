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
    const ritual = page.getByRole("dialog", { name: "首次命名仪式" });
    await expect(ritual).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(ritual).toBeVisible();
    await page.getByRole("button", { name: "继续" }).click();
    await expect(ritual.getByRole("heading", { name: "门" })).toBeVisible();
    await page.getByRole("button", { name: "继续" }).click();
    await expect(
      ritual.getByRole("heading", { name: "账本，和一面旗" })
    ).toBeVisible();
    await page.getByRole("button", { name: "继续" }).click();
    await expect(
      ritual.getByRole("heading", { name: "你自己写" })
    ).toBeVisible();
    await ritual.getByLabel("名").fill("烟测");
    await ritual.getByLabel("姓").fill("瓦尔登");
    await ritual.getByRole("button", { name: "落 笔" }).click();
    await expect(ritual).toBeHidden();
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
    await page.getByRole("button", { name: /下场战斗 · 废弃麦田/ }).click({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/battle\/sp_ruined_field$/);
    await expect(page.getByText("正在集结远征队…")).toBeHidden({ timeout: 30_000 });
    await expect(page.getByTestId("battle-auto-resolve")).toBeVisible();
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

  await test.step("阅览皇家图书馆馆藏", async () => {
    await page.goto("/chronicle");
    await expect(page).toHaveURL(/\/chronicle$/);
    await expect(page.getByRole("heading", { name: "凯尔文尼亚皇家图书馆" })).toBeVisible();
    await page.getByRole("button", { name: "阅览《王国的六大势力》" }).click();
    const archive = page.getByRole("dialog");
    await expect(archive.getByRole("heading", { name: "《王国的六大势力》" })).toBeVisible();
    await expect(archive.getByText("馆吏按旧卷所记：旧王国的骑士团残部，把秩序当作信仰。")).toBeVisible();
    await archive.getByRole("button", { name: "合卷" }).click();
    await expect(archive).toBeHidden();
  });
});
