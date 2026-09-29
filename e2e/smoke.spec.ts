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
    const tutorial = page.getByRole("dialog", { name: "灰隼堡，仍然在等人。" });
    await expect(tutorial).toBeVisible();
    await tutorial.getByRole("button", { name: "开始巡视" }).click();
    await expect(
      page.getByRole("heading", { name: /灰隼堡 · 主城/ })
    ).toBeVisible();
    await expect(page.getByText(username, { exact: true })).toBeVisible();
  });

  await test.step("完成首个建筑与远征队编成", async () => {
    await expect(page.getByText("点击这里查看南墙", { exact: true })).toBeVisible();
    await expect(page.locator("#keep-building-wall")).toHaveClass(/tutorial-spotlight/);
    await expect(page.getByRole("button", { name: "定位操作" })).toHaveCount(0);
    const targetBox = await page.locator("#keep-building-wall").boundingBox();
    const guideBox = await page.getByTestId("tutorial-coachmark").boundingBox();
    expect(targetBox).not.toBeNull();
    expect(guideBox).not.toBeNull();
    const horizontalGap = Math.max(targetBox!.x - (guideBox!.x + guideBox!.width), guideBox!.x - (targetBox!.x + targetBox!.width), 0);
    const verticalGap = Math.max(targetBox!.y - (guideBox!.y + guideBox!.height), guideBox!.y - (targetBox!.y + targetBox!.height), 0);
    expect(Math.hypot(horizontalGap, verticalGap)).toBeLessThan(32);
    await page.locator("#keep-building-wall").click();
    await expect(page.getByRole("heading", { name: "城墙" })).toBeVisible();
    await expect(page.locator("#tutorial-wall-upgrade")).toHaveClass(/tutorial-spotlight/);
    await page.locator("#tutorial-wall-upgrade").click();
    await expect(page.getByText("下一步：结算南墙施工", { exact: true })).toBeVisible();
    await expect(page.getByText("施工中").first()).toBeVisible();
    await page.waitForTimeout(6_000);
    await page.locator("#tutorial-settle-construction").click();
    await expect(page).toHaveURL(/\/roster$/, { timeout: 10_000 });
    await expect(page.locator("#tutorial-team-save")).toBeVisible();
    const companions = page.locator('button[title*=" · "]');
    expect(await companions.count()).toBeGreaterThanOrEqual(1);
    await companions.nth(0).click();
    if (await companions.count() > 1) await companions.nth(1).click();
    await page.locator("#tutorial-team-save").click();
    await expect(page.getByText("远征队已更新")).toBeVisible();
    await expect(page.getByText("下一步：前往灰隼堡外郊", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/world$/, { timeout: 10_000 });
  });

  await test.step("全局静音会跨页面与刷新保留", async () => {
    const musicButton = page.getByRole("button", { name: /静音全局音乐|全局音乐已开启/ });
    await expect(musicButton).toBeVisible();
    await musicButton.click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem("aetherfall:music-muted"))).toBe("true");

    await page.getByRole("link", { name: "世界地图" }).click();
    await expect(page).toHaveURL(/\/world$/);
    await expect(page.getByRole("button", { name: "开启全局音乐" })).toBeVisible();
    const worldMusic = page.locator("audio").filter({ has: page.locator('source[src="/aetherfall-assets/world-theme.mp3"]') });
    await expect.poll(() => worldMusic.evaluate((audio) => audio.paused)).toBe(true);

    await page.reload();
    await expect(page.getByRole("button", { name: "开启全局音乐" })).toBeVisible();
  });

  await test.step("主城领主书房显示命名、体力重置与邮箱入口", async () => {
    await page.getByRole("link", { name: "主城" }).click();
    await expect(page).toHaveURL(/\/keep$/);
    await expect(page.getByRole("heading", { name: "领主书房" })).toBeVisible();
    await expect(page.getByText("烟测·瓦尔登", { exact: true })).toBeVisible();
    await expect(page.getByText(/今日可用 1 \/ 1 次/)).toBeVisible();
    await page.locator('a[href="/mailbox"]').last().click();
    await expect(page).toHaveURL(/\/mailbox$/);
    await expect(page.getByRole("heading", { name: "领主邮箱" })).toBeVisible();
    await expect(page.getByText("邮箱里还没有信函")).toBeVisible();
    await page.getByRole("link", { name: "返回主城" }).click();
    await expect(page).toHaveURL(/\/keep$/);
    await page.getByRole("link", { name: "世界地图" }).click();
    await expect(page).toHaveURL(/\/world$/);
  });

  await test.step("选择首个世界节点", async () => {
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

  await test.step("查看领主书房中的城堡金库", async () => {
    await page.goto("/vault");
    await expect(page).toHaveURL(/\/vault$/);
    await expect(page.getByRole("heading", { name: "城堡金库" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "锻造与契约素材" })).toBeVisible();
    await expect(page.getByText("银杉木料")).toBeVisible();
    await expect(page.getByText("铁制长剑")).toBeVisible();
  });

  await test.step("查阅银杉商会并取得金铢联络方式", async () => {
    await page.goto("/shop");
    await expect(page).toHaveURL(/\/shop$/);
    await expect(page.getByRole("heading", { name: "银杉商会", exact: true })).toBeVisible();
    await expect(page.getByText("守望者契约 · 三十日")).toBeVisible();
    await page.getByRole("button", { name: "补充金铢" }).click();
    const messenger = page.getByRole("dialog", { name: "商会信使在等候" });
    await expect(messenger).toBeVisible();
    await expect(messenger.getByText("1091159024", { exact: true })).toBeVisible();
    await messenger.getByRole("button", { name: "关闭" }).click();
    await expect(messenger).toBeHidden();
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
