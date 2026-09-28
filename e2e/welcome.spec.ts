import { expect, test } from "@playwright/test";

async function loginAsNewPlayer(
  page: import("@playwright/test").Page,
  username: string
) {
  await page.goto("/login");
  await page.getByLabel("账号").fill(username);
  await page.getByRole("textbox", { name: "密码" }).fill("welcome-password");
  await page.getByRole("button", { name: "进入领地" }).click();
  await expect(page).toHaveURL(/\/keep$/);
  return page.getByRole("dialog", { name: "首次命名仪式" });
}

async function advanceToNaming(page: import("@playwright/test").Page) {
  const ritual = page.getByRole("dialog", { name: "首次命名仪式" });
  for (const title of ["门", "账本，和一面旗", "你自己写"]) {
    await page.getByRole("button", { name: "继续" }).click();
    await expect(ritual.getByRole("heading", { name: title })).toBeVisible();
  }
  return ritual;
}

test("首次仪式隔离主界面，空名显示兜底台词并完成", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const ritual = await loginAsNewPlayer(page, `e2e-welcome-${Date.now()}`);
  await expect(ritual).toBeVisible();
  await expect(ritual.locator("audio")).toHaveAttribute("loop", "");
  await expect(ritual.locator("img")).toHaveJSProperty("naturalWidth", 1916);

  const shell = page.locator("header").locator("..");
  await expect(shell).toHaveAttribute("aria-hidden", "true");
  await expect(shell).toHaveJSProperty("inert", true);
  expect((await page.locator("header").boundingBox())?.y).toBe(0);

  await page.keyboard.press("Escape");
  await expect(ritual).toBeVisible();
  await advanceToNaming(page);
  await page.getByRole("button", { name: "落 笔" }).click();
  await expect(ritual.getByText("那我就按旧名册记了。")).toBeVisible();
  await expect(ritual).toBeHidden();
  await page.reload();
  await expect(ritual).toBeHidden();

  await page.getByRole("link", { name: "编年史" }).click();
  await expect(page).toHaveURL(/\/chronicle$/);
  await page.getByRole("button", { name: /序章 · 第零章/ }).click();
  const replay = page.getByRole("dialog", { name: "序章 · 第零章" });
  await expect(replay).toBeVisible();
  await expect(replay).toHaveCSS("backdrop-filter", "none");
  await replay.getByRole("button", { name: "继续" }).click();
  await replay.getByRole("button", { name: "继续" }).click();
  await replay.getByRole("button", { name: "继续" }).click();
  await expect(replay.getByText(/^—— /)).toBeVisible();
  await replay.getByRole("button", { name: "关闭序章" }).click();
  await expect(replay).toBeHidden();
});

test("首次仪式在 375px 宽度内显示，移动导航仍停在视口底部", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const ritual = await loginAsNewPlayer(
    page,
    `e2e-welcome-mobile-${Date.now()}`
  );
  const panel = ritual.locator("section");
  await expect(panel).toBeVisible();
  await expect(ritual.locator("img")).toHaveJSProperty("naturalWidth", 1122);
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);

  const bottomNav = page.locator("nav.fixed");
  const navBox = await bottomNav.boundingBox();
  expect(navBox).not.toBeNull();
  expect(Math.round(navBox!.y + navBox!.height)).toBe(667);

  await advanceToNaming(page);
  await ritual.getByLabel("名").fill("伊莲");
  await ritual.getByLabel("姓").fill("晨星");
  await ritual.getByRole("button", { name: "落 笔" }).click();
  await expect(ritual).toBeHidden();
});
