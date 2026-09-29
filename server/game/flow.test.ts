/**
 * 核心流程端到端测试（接口测试 + 核心流程测试）
 *
 * 覆盖：建档 → 主城经营 → 招募 → 编队 → 养成 → 世界探索与战斗结算 → 任务推进
 *        → 剧情选项 → AI 议事的在场角色约束 → GM 后台配置同步 → 备份恢复
 *
 * 说明：本测试直接调用 tRPC router 的 caller，与真实 HTTP 请求共用同一套
 * 中间件、入参校验、权限检查与数据库访问路径，因此等价于接口层端到端验证。
 * 数据库不可用时自动跳过，保证无 DATABASE_URL 的环境仍可运行纯单元测试。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { appRouter } from "../routers";
import { getDb } from "../db";
import type { TrpcContext } from "../_core/context";
import { battles, characters, gameProfiles, nodeStates, playerCharacters, playerEquipments, playerItems, profileBuildings, profileMails, regionStates, shopPurchases, teams, users } from "../../drizzle/schema";
import { accrueProfile } from "../game/service";
import { TUTORIAL_STEPS } from "../game/tutorial";

const TEST_OPEN_ID = "vitest-flow-user";
const ADMIN_OPEN_ID = "vitest-flow-admin";
const dbAvailable = Boolean(process.env.DATABASE_URL);
const requireDbTests = process.env.REQUIRE_DB_TESTS === "true";

function makeCtx(user: TrpcContext["user"]): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

type Caller = ReturnType<typeof appRouter.createCaller>;

const flowDescribe = requireDbTests ? describe : describe.skipIf(!dbAvailable);

flowDescribe("核心流程：从建档到征服", () => {
  let db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  let player: Caller;
  let admin: Caller;
  let playerUserId = 0;
  let adminUserId = 0;
  let profileId = 0;

  async function purge(userIds: number[]) {
    if (userIds.length === 0) return;
    const profiles = await db.select({ id: gameProfiles.id }).from(gameProfiles).where(inArray(gameProfiles.userId, userIds));
    const ids = profiles.map((row) => row.id);
    if (ids.length > 0) {
      await db.delete(shopPurchases).where(inArray(shopPurchases.profileId, ids));
      await db.delete(playerItems).where(inArray(playerItems.profileId, ids));
      await db.delete(playerEquipments).where(inArray(playerEquipments.profileId, ids));
      await db.delete(profileMails).where(inArray(profileMails.profileId, ids));
      await db.delete(playerCharacters).where(inArray(playerCharacters.profileId, ids));
      await db.delete(profileBuildings).where(inArray(profileBuildings.profileId, ids));
      await db.delete(gameProfiles).where(inArray(gameProfiles.id, ids));
    }
    await db.delete(users).where(inArray(users.id, userIds));
  }

  beforeAll(async () => {
    const handle = await getDb();
    if (!handle) throw new Error("数据库连接不可用，无法执行流程测试");
    db = handle;

    const stale = await db.select({ id: users.id }).from(users).where(inArray(users.openId, [TEST_OPEN_ID, ADMIN_OPEN_ID]));
    await purge(stale.map((row) => row.id));

    const [playerInsert] = await db
      .insert(users)
      .values({ openId: TEST_OPEN_ID, name: "流程测试领主", role: "user", loginMethod: "vitest" })
      .$returningId();
    playerUserId = playerInsert.id;
    const [adminInsert] = await db
      .insert(users)
      .values({ openId: ADMIN_OPEN_ID, name: "流程测试管理员", role: "admin", loginMethod: "vitest" })
      .$returningId();
    adminUserId = adminInsert.id;

    const [playerRow] = await db.select().from(users).where(eq(users.id, playerUserId)).limit(1);
    const [adminRow] = await db.select().from(users).where(eq(users.id, adminUserId)).limit(1);
    player = appRouter.createCaller(makeCtx(playerRow));
    admin = appRouter.createCaller(makeCtx(adminRow));
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    const ids = [playerUserId, adminUserId].filter((id) => id > 0);
    await db.delete(characters).where(eq(characters.charKey, "vitest_flow_hero"));
    await purge(ids);
  }, 60_000);

  it("1. 首次进入自动建档：教程状态、初始建筑、任务与待办全部下发", async () => {
    const home = await player.keep.home();
    expect(home.lord.name.length).toBeGreaterThan(0);
    expect(home.lord.level).toBeGreaterThanOrEqual(1);
    expect(home.resources.gold).toBeGreaterThan(0);
    expect(home.resources.aether).toBe(1800);
    expect(home.resources.gold).toBe(2000);
    expect(home.resources.food).toBe(2000);
    expect(home.resources.wood).toBe(2000);
    expect(home.resources.iron).toBe(2000);
    // 起步不空手：至少 2 名初始角色
    expect(home.totalCharacters).toBeGreaterThanOrEqual(2);
    expect(home.roster.length).toBeGreaterThanOrEqual(2);
    // 未建造的建筑也要有等级 0 记录，保证主城升级入口完整
    expect(home.buildings).toHaveLength(7);
    expect(home.buildings.every((item) => item.status === "built" || item.status === "unbuilt")).toBe(true);
    expect(home.quests.active.length).toBeGreaterThan(0);
    expect(home.todos.length).toBeGreaterThan(0);
    // 6 个区域全部下发
    expect(home.regions).toHaveLength(6);
    // 解析档案 id，供后续测试直接使用
    const profiles = await db.select({ id: gameProfiles.id }).from(gameProfiles).where(eq(gameProfiles.userId, playerUserId));
    profileId = profiles[0].id;
    expect(profileId).toBeGreaterThan(0);
    const onboarding = await player.meta.onboarding();
    expect(onboarding).toMatchObject({ tutorialVersion: 2, skipped: false, currentKey: "welcome_keep" });
    // 新手档案从可编辑的空远征队起步，不能把“自动编队”误判为教程已完成。
    expect(home.team?.memberIds).toEqual([]);
  }, 60_000);

  it("1a. 跳过教程只写服务端跳过标记，不发放资源，重复请求保持幂等", async () => {
    const [before] = await db.select({ gold: gameProfiles.gold, food: gameProfiles.food, wood: gameProfiles.wood, iron: gameProfiles.iron, aether: gameProfiles.aether }).from(gameProfiles).where(eq(gameProfiles.id, profileId)).limit(1);
    const once = await player.meta.completeTutorialAction({ action: "skip_tutorial" });
    const twice = await player.meta.completeTutorialAction({ action: "skip_tutorial" });
    const [after] = await db.select({ gold: gameProfiles.gold, food: gameProfiles.food, wood: gameProfiles.wood, iron: gameProfiles.iron, aether: gameProfiles.aether }).from(gameProfiles).where(eq(gameProfiles.id, profileId)).limit(1);
    expect(once.tutorial?.skipped).toBe(true);
    expect(twice.tutorial?.currentKey).toBe("tutorial_complete");
    expect(after).toEqual(before);
    const onboarding = await player.meta.onboarding();
    expect(onboarding.tutorialStep).toBeGreaterThanOrEqual(TUTORIAL_STEPS.length);
  }, 60_000);

  async function resetIntro() {
    let [profile] = await db.select({ id: gameProfiles.id }).from(gameProfiles).where(eq(gameProfiles.userId, playerUserId)).limit(1);
    if (!profile) {
      await player.keep.home();
      [profile] = await db.select({ id: gameProfiles.id }).from(gameProfiles).where(eq(gameProfiles.userId, playerUserId)).limit(1);
    }
    if (!profile) throw new Error("首次命名仪式测试未能创建档案");

    const introProfileId = profile.id;
    await db
      .update(gameProfiles)
      .set({ introCompleted: false, playerGivenName: null, playerFamilyName: "瓦尔登", familyNameChanged: false, lordName: "流程测试领主" })
      .where(eq(gameProfiles.id, introProfileId));
    return introProfileId;
  }

  it("1a. 首次命名仪式：空名按档案 id 选择兜底名", async () => {
    const introProfileId = await resetIntro();
    const fallback = await player.keep.completeIntro({ givenName: "   ", familyName: "瓦尔登" });
    const fallbackNames = ["阿伦", "科尔", "席恩", "玛洛", "恩雅", "薇拉", "托本", "伊莲"];
    const expectedGivenName = fallbackNames[introProfileId % fallbackNames.length];

    expect(fallback).toMatchObject({
      playerGivenName: expectedGivenName,
      playerFamilyName: "瓦尔登",
      lordName: `${expectedGivenName}·瓦尔登`,
    });
  }, 60_000);

  it("1b. 首次命名仪式：姓留空时保留默认瓦尔登且不置变更标记", async () => {
    await resetIntro();
    const named = await player.keep.completeIntro({ givenName: "莉亚", familyName: "  " });

    expect(named).toMatchObject({
      introCompleted: true,
      playerGivenName: "莉亚",
      playerFamilyName: "瓦尔登",
      familyNameChanged: false,
      lordName: "莉亚·瓦尔登",
    });
  }, 60_000);

  it("1c. 首次命名仪式：改姓只记录变更标记，不影响养成资源", async () => {
    const introProfileId = await resetIntro();
    const [before] = await db
      .select({ gold: gameProfiles.gold, food: gameProfiles.food, wood: gameProfiles.wood, iron: gameProfiles.iron, aether: gameProfiles.aether, renown: gameProfiles.renown, stamina: gameProfiles.stamina, staminaMax: gameProfiles.staminaMax, keepLevel: gameProfiles.keepLevel, keepExp: gameProfiles.keepExp })
      .from(gameProfiles)
      .where(eq(gameProfiles.id, introProfileId))
      .limit(1);

    const named = await player.keep.completeIntro({ givenName: "莉亚", familyName: "晨星" });
    const [after] = await db
      .select({ gold: gameProfiles.gold, food: gameProfiles.food, wood: gameProfiles.wood, iron: gameProfiles.iron, aether: gameProfiles.aether, renown: gameProfiles.renown, stamina: gameProfiles.stamina, staminaMax: gameProfiles.staminaMax, keepLevel: gameProfiles.keepLevel, keepExp: gameProfiles.keepExp })
      .from(gameProfiles)
      .where(eq(gameProfiles.id, introProfileId))
      .limit(1);

    expect(named).toMatchObject({
      playerGivenName: "莉亚",
      playerFamilyName: "晨星",
      familyNameChanged: true,
      lordName: "莉亚·晨星",
      usedFallbackName: false,
    });
    expect(after).toEqual(before);
  }, 60_000);

  it("1d. 首次命名仪式：重复调用不会覆盖已写入的名字", async () => {
    await resetIntro();
    await player.keep.completeIntro({ givenName: "莉亚", familyName: "晨星" });
    const repeated = await player.keep.completeIntro({ givenName: "其他名字", familyName: "其他姓氏" });

    expect(repeated).toMatchObject({
      playerGivenName: "莉亚",
      playerFamilyName: "晨星",
      lordName: "莉亚·晨星",
      usedFallbackName: false,
    });
  }, 60_000);

  it("1e. 首次命名仪式：仅空名提交报告 usedFallbackName", async () => {
    await resetIntro();
    const fallback = await player.keep.completeIntro({ givenName: "\t ", familyName: "  " });

    expect(fallback).toMatchObject({
      playerFamilyName: "瓦尔登",
      familyNameChanged: false,
      usedFallbackName: true,
    });
  }, 60_000);

  it("1a. 资源结算只推进一次时间戳，不会重复领取同一段离线产出", async () => {
    const now = new Date();
    await db
      .update(gameProfiles)
      .set({ lastTickAt: new Date(now.getTime() - 3600_000) })
      .where(eq(gameProfiles.id, profileId));

    const first = await accrueProfile(profileId, now);
    const second = await accrueProfile(profileId, now);
    // MySQL 的 DATETIME 不保存毫秒；跨秒边界时可能多出 1 秒。
    expect(first.secondsElapsed).toBeGreaterThanOrEqual(3600);
    expect(first.secondsElapsed).toBeLessThanOrEqual(3601);
    // 同一时刻再次结算只允许数据库秒精度造成的边界误差，不可再次领取整段离线产出。
    expect(second.secondsElapsed).toBeLessThanOrEqual(1);

    const [saved] = await db.select({ lastTickAt: gameProfiles.lastTickAt }).from(gameProfiles).where(eq(gameProfiles.id, profileId)).limit(1);
    // MySQL 的 DATETIME 按秒存储，允许毫秒在边界处四舍五入。
    expect(Math.abs(saved.lastTickAt.getTime() - now.getTime())).toBeLessThanOrEqual(1000);
  }, 60_000);

  it("1b. 旧档案队伍自愈：历史空队伍仍会自动补入角色", async () => {
    // 模拟没有 v2 标识的历史档案；新档案必须在同伴页由玩家保存编成。
    await db.update(gameProfiles).set({ settings: {} }).where(eq(gameProfiles.id, profileId));
    await db.update(teams).set({ memberIds: [], formation: {} }).where(eq(teams.profileId, profileId));
    const home = await player.keep.home();
    expect(home.team?.memberIds.length).toBeGreaterThan(0);
    // 空队伍也不应阻止开战（这是最容易被玩家遇到的阻断性错误）
    const world = await player.world.map();
    const region = world.regions.find((item) => item.unlocked);
    const node = region?.nodes.find((item) => item.unlocked);
    expect(node).toBeTruthy();
    await expect(player.battle.start({ nodeKey: node!.nodeKey })).resolves.toMatchObject({ ok: true });
    // 清理这场自愈验证产生的战斗（避免影响后续测试的体力预算）
    const recent = await player.battle.recent();
    if (recent.length > 0) await player.battle.flee({ battleId: recent[0].battleId });
  }, 90_000);

  it("1c. 灰色地区不可出征，可用节点不能被当作已通关前置", async () => {
    // 模拟旧版本曾错误持久化的节点状态。潮痕谷此时仍未满足区域解锁条件。
    await db
      .update(nodeStates)
      .set({ status: "available" })
      .where(and(eq(nodeStates.profileId, profileId), inArray(nodeStates.nodeKey, ["tv_market_mouth", "tv_water_works"])));

    const world = await player.world.map();
    const tidevale = world.regions.find((region) => region.regionKey === "tidevale")!;
    expect(tidevale.unlocked).toBe(false);
    expect(tidevale.nodes.every((node) => !node.unlocked)).toBe(true);
    await expect(player.battle.start({ nodeKey: "tv_water_works" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const repaired = await db
      .select({ nodeKey: nodeStates.nodeKey, status: nodeStates.status })
      .from(nodeStates)
      .where(and(eq(nodeStates.profileId, profileId), inArray(nodeStates.nodeKey, ["tv_market_mouth", "tv_water_works"])));
    expect(repaired.every((node) => node.status === "locked")).toBe(true);
  }, 60_000);

  it("1d. 市场的贸易位按 1/3/5 级开放 1/2/3 条路线", async () => {
    await db.update(profileBuildings).set({ level: 1 }).where(and(eq(profileBuildings.profileId, profileId), eq(profileBuildings.buildingKey, "market")));
    await db
      .update(regionStates)
      .set({ controlPercent: 30 })
      .where(and(eq(regionStates.profileId, profileId), inArray(regionStates.regionKey, ["silverpine", "tidevale"])));

    await expect(player.world.toggleTrade({ regionKey: "silverpine", active: true })).resolves.toMatchObject({ tradeSlots: 1, activeTradeSlots: 1, rationCost: 30 });
    await expect(player.world.toggleTrade({ regionKey: "tidevale", active: true })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await db.update(profileBuildings).set({ level: 3 }).where(and(eq(profileBuildings.profileId, profileId), eq(profileBuildings.buildingKey, "market")));
    await expect(player.world.toggleTrade({ regionKey: "tidevale", active: true })).resolves.toMatchObject({ tradeSlots: 2, activeTradeSlots: 2, rationCost: 30 });
    const map = await player.world.map();
    expect(map.summary).toMatchObject({ tradeSlots: 2, activeTradeSlots: 2 });

    await player.world.toggleTrade({ regionKey: "silverpine", active: false });
    await player.world.toggleTrade({ regionKey: "tidevale", active: false });
  }, 60_000);

  it("2. 会话过期与权限隔离：未登录被拒、普通会员访问后台被拒", async () => {
    const anonymous = appRouter.createCaller(makeCtx(undefined as unknown as TrpcContext["user"]));
    await expect(anonymous.keep.home()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(player.admin.overview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(player.ai.cast()).resolves.toBeTruthy();
  }, 60_000);

  it("3. 主城建造：资源不足明确失败，资源充足则扣费并进入施工队列", async () => {
    const target = (await player.keep.home()).buildings.find((item) => item.nextCost)!;
    expect(target.nextLevel).toBe(1);
    expect(target.nextCost).not.toBeNull();

    // 非法建筑必须被拒绝（输入校验，不静默失败）
    await expect(player.keep.upgradeBuilding({ buildingKey: "not_a_building" })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // 新手引导要求：初始资源足以建造第一座建筑
    const goldBefore = (await player.keep.home()).resources.gold;
    const result = await player.keep.upgradeBuilding({ buildingKey: target.buildingKey });
    expect(result.ok).toBe(true);
    expect(result.cost.gold).toBeGreaterThan(0);

    const after = await player.keep.home();
    const built = after.buildings.find((item) => item.buildingKey === target.buildingKey)!;
    expect(built.level + (built.upgradingTo ?? 0)).toBeGreaterThanOrEqual(1);
    // 资源必须真实扣除
    expect(after.resources.gold).toBe(goldBefore - result.cost.gold);

    // 资源不足时必须给出可读失败原因
    const before = (await admin.admin.listPlayerProfiles()).find((item) => item.userId === playerUserId)!;
    profileId = before.id;
    const drained = (await player.keep.home()).resources;
    await admin.admin.grantResources({
      profileId,
      gold: -drained.gold,
      wood: -drained.wood,
      iron: -drained.iron,
      reason: "自动化测试：清空资源",
    });
    const broke = await player.keep.home();
    const expensive = broke.buildings.find((item) => item.nextCost && item.nextCost.gold > broke.resources.gold);
    if (expensive) {
      await expect(player.keep.upgradeBuilding({ buildingKey: expensive.buildingKey })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    await admin.admin.grantResources({ profileId, gold: 50000, food: 50000, wood: 50000, iron: 50000, aether: 5000, reason: "自动化测试补给" });
  }, 90_000);

  it("4. 招募：概率由服务端配置下发、十连保底生效、历史与保底计数落库", async () => {
    const pools = await player.recruit.pools();
    expect(pools.length).toBeGreaterThan(0);
    const pool = pools.find((item) => item.poolType === "normal")!;
    // 概率不可由前端决定：必须来自服务端，且归一化后总和为 1
    const totalRate = pool.rates.reduce((sum, rate) => sum + rate.rate, 0);
    expect(totalRate).toBeCloseTo(1, 3);
    expect(pool.pityRules.hardPityText.length).toBeGreaterThan(0);
    expect(pool.pityRules.tenPullGuarantee).toContain("10");

    const before = await player.character.roster({ filter: "owned" });
    const [resourcesBeforeDraw] = await db
      .select({ aether: gameProfiles.aether, recruitShards: gameProfiles.recruitShards })
      .from(gameProfiles)
      .where(eq(gameProfiles.id, profileId))
      .limit(1);
    const draw = await player.recruit.draw({ poolKey: pool.poolKey, count: 10 });
    expect(draw.ok).toBe(true);
    expect(draw.results).toHaveLength(10);
    // 十连必出 1 名 SR 及以上
    expect(draw.results.filter((item) => item.rarity !== "R").length).toBeGreaterThanOrEqual(1);
    for (const item of draw.results) {
      expect(item.charKey.length).toBeGreaterThan(0);
      expect(item.rarity).toMatch(/^(R|SR|SSR)$/);
      expect(item.name.length).toBeGreaterThan(0);
    }
    const after = await player.character.roster({ filter: "owned" });
    expect(after.summary.owned).toBeGreaterThanOrEqual(before.summary.owned);
    const [resourcesAfterDraw] = await db
      .select({ aether: gameProfiles.aether, recruitShards: gameProfiles.recruitShards })
      .from(gameProfiles)
      .where(eq(gameProfiles.id, profileId))
      .limit(1);
    const shardTotal = draw.results.reduce((sum, item) => sum + Number(item.shards ?? 0), 0);
    expect(resourcesAfterDraw.aether).toBe(resourcesBeforeDraw.aether - draw.cost);
    expect(resourcesAfterDraw.recruitShards).toBe(resourcesBeforeDraw.recruitShards + shardTotal);

    const history = await player.recruit.history({ limit: 50 });
    expect(history.length).toBeGreaterThanOrEqual(10);
    const refreshed = await player.recruit.pools();
    expect(refreshed.find((item) => item.poolKey === pool.poolKey)!.pity.totalPulls).toBeGreaterThanOrEqual(10);
  }, 90_000);

  it("5. 编队：合法队伍可保存，未拥有角色被拒绝", async () => {
    const roster = await player.character.roster({ filter: "owned" });
    const owned = roster.list.filter((item) => item.owned && item.playerCharId);
    expect(owned.length).toBeGreaterThanOrEqual(2);
    const teams = await player.keep.teams();
    const teamId = teams[0].id;
    for (const member of teams[0].members) {
      expect(member.avatarUrl).toBeDefined();
    }
    const memberIds = owned.slice(0, Math.min(4, owned.length)).map((item) => item.playerCharId as number);

    await expect(player.keep.setTeam({ teamId, memberIds })).resolves.toMatchObject({ ok: true });
    const home = await player.keep.home();
    expect(home.team?.memberIds.length).toBe(memberIds.length);

    // 未拥有的角色不得进入编队
    await expect(player.keep.setTeam({ teamId, memberIds: [999_999] })).rejects.toBeTruthy();
  }, 60_000);

  it("6. 养成：升级提升等级与属性，技能与装备影响面板", async () => {
    const roster = await player.character.roster({ filter: "owned" });
    const target = roster.list.find((item) => item.owned)!;
    const before = await player.character.detail({ charKey: target.charKey });
    expect(before.owned).toBe(true);
    expect(before.stats.hp).toBeGreaterThan(0);
    expect(before.skills.length).toBeGreaterThanOrEqual(1);
    // 成长曲线必须真实可用（不依赖前端公式）
    expect(before.curve.length).toBeGreaterThan(1);

    // 升级需要金币：先补给，验证「资源消耗 → 属性增长」闭环
    await admin.admin.grantResources({ profileId, gold: 60000, food: 60000, reason: "自动化测试：养成补给" });
    const levelResult = await player.character.levelUp({ charKey: target.charKey, times: 5 });
    expect(levelResult.ok).toBe(true);
    const after = await player.character.detail({ charKey: target.charKey });
    expect(after.level).toBeGreaterThan(before.level);
    expect(after.stats.hp).toBeGreaterThan(before.stats.hp);
    expect(after.power).toBeGreaterThan(before.power);
  }, 90_000);

  it("6b. 装备：卸下后装备回到库存且可再次穿戴", async () => {
    const roster = await player.character.roster({ filter: "owned" });
    const target = roster.list.find((item) => item.owned && item.playerCharId)!;
    const detail = await player.character.detail({ charKey: target.charKey });
    const inventoryItem = detail.inventory[0];
    expect(inventoryItem?.playerEquipId).toBeTruthy();

    await player.character.equip({ charKey: target.charKey, playerEquipId: inventoryItem!.playerEquipId });
    const equipped = await player.character.detail({ charKey: target.charKey });
    const slot = equipped.equipped.find((item) => item.playerEquipId === inventoryItem!.playerEquipId);
    expect(slot?.playerEquipId).toBe(inventoryItem!.playerEquipId);

    await player.character.equip({ charKey: target.charKey, playerEquipId: null, slot: slot!.slot });
    const afterUnequip = await player.character.detail({ charKey: target.charKey });
    expect(afterUnequip.equipped.find((item) => item.slot === slot!.slot)?.playerEquipId).toBeNull();
    expect(afterUnequip.inventory.some((item) => item.playerEquipId === inventoryItem!.playerEquipId)).toBe(true);

    await player.character.equip({ charKey: target.charKey, playerEquipId: inventoryItem!.playerEquipId });
    const afterEquip = await player.character.detail({ charKey: target.charKey });
    expect(afterEquip.equipped.find((item) => item.slot === slot!.slot)?.playerEquipId).toBe(inventoryItem!.playerEquipId);

    // Simulate the old bug: the character slot was cleared while the item
    // remained marked as equipped. Opening details must recover the item.
    await db.update(playerCharacters).set({ equipped: {} }).where(eq(playerCharacters.id, target.playerCharId!));
    const recovered = await player.character.detail({ charKey: target.charKey });
    expect(recovered.inventory.some((item) => item.playerEquipId === inventoryItem!.playerEquipId)).toBe(true);
    const [recoveredRow] = await db.select().from(playerEquipments).where(eq(playerEquipments.id, inventoryItem!.playerEquipId));
    expect(recoveredRow.equippedBy).toBeNull();
    expect(recoveredRow.equippedSlot).toBeNull();

    await player.character.equip({ charKey: target.charKey, playerEquipId: inventoryItem!.playerEquipId });
    const reequipped = await player.character.detail({ charKey: target.charKey });
    expect(reequipped.equipped.find((item) => item.slot === slot!.slot)?.playerEquipId).toBe(inventoryItem!.playerEquipId);
  }, 90_000);

  it("7. 世界探索：节点信息完整 → 开战 → 半自动结算 → 节点进度落库", async () => {
    const world = await player.world.map();
    expect(world.regions).toHaveLength(6);
    expect(world.summary.totalNodes).toBe(35);

    const region = world.regions.find((item) => item.unlocked)!;
    const node = region.nodes.find((item) => item.unlocked)!;
    expect(node).toBeTruthy();

    const detail = await player.world.node({ nodeKey: node.nodeKey });
    expect(detail.enemies.length).toBeGreaterThan(0);
    expect(detail.staminaCost).toBeGreaterThan(0);
    expect(detail.teamSummary.rosterCount).toBeGreaterThan(0);

    const started = await player.battle.start({ nodeKey: node.nodeKey });
    expect(started.battleId).toBeGreaterThan(0);
    const units = started.state.units;
    expect(units.some((unit) => unit.side === "ally")).toBe(true);
    expect(units.some((unit) => unit.side === "enemy")).toBe(true);

    await player.battle.auto({ battleId: started.battleId });
    const finished = await player.battle.detail({ battleId: started.battleId });
    const state = finished.state as unknown as { finished: boolean; result: string; log: Array<{ type: string }> };
    expect(state.finished).toBe(true);
    expect(["won", "lost"]).toContain(state.result);
    // 战斗日志必须完整持久化（含回合、行动与伤害/治疗反馈）
    const log = finished.log as unknown as Array<{ type: string }>;
    expect(log.length).toBeGreaterThan(0);
    expect(log.some((event) => event.type === "turn_start")).toBe(true);
    expect(log.some((event) => event.type === "action")).toBe(true);
    expect(log.some((event) => event.type === "damage" || event.type === "heal" || event.type === "shield")).toBe(true);

    const nodeAfter = await player.world.node({ nodeKey: node.nodeKey });
    expect(nodeAfter.status).not.toBe("locked");
    // 结算后的资源与体力必须写回服务器（体力有消耗）
    const home = await player.keep.home();
    expect(home.resources.stamina).toBeLessThanOrEqual(home.resources.staminaMax);
  }, 120_000);

  it("7a. 普通领主每日可重置一次体力，第二次由服务端拒绝", async () => {
    await db.update(gameProfiles).set({ stamina: 0, membershipDayKey: "", staminaResetUses: 0 }).where(eq(gameProfiles.id, profileId));
    const initial = await player.world.map();
    expect(initial.summary.membership.active).toBe(false);
    expect(initial.summary.membership.staminaResetRemaining).toBe(1);
    await player.world.resetStamina();
    const after = await player.keep.home();
    expect(after.resources.stamina).toBe(after.resources.staminaMax);
    await expect(player.world.resetStamina()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await db.update(gameProfiles).set({ membershipDayKey: "", staminaResetUses: 0 }).where(eq(gameProfiles.id, profileId));
  }, 60_000);

  it("7b. 会员权益：每日体力重置、商队 8 小时速收与自动续派由服务端限次", async () => {
    await db.update(users).set({ membership: "supporter", membershipExpiresAt: new Date(Date.now() + 7 * 24 * 3600_000) }).where(eq(users.id, playerUserId));
    try {
      const initial = await player.world.map();
      expect(initial.summary.membership.active).toBe(true);
      expect(initial.summary.membership.staminaResetRemaining).toBe(3);
      expect(initial.summary.membership.tradeRushRemaining).toBe(5);

      await player.world.resetStamina();
      await player.world.resetStamina();
      await player.world.resetStamina();
      await expect(player.world.resetStamina()).rejects.toMatchObject({ code: "BAD_REQUEST" });

      await db.update(nodeStates).set({ status: "cleared", clearCount: 3 }).where(and(eq(nodeStates.profileId, profileId), eq(nodeStates.nodeKey, "sp_ruined_field")));
      await db.update(regionStates).set({ controlPercent: 30, tradeActive: true, tradeStartedAt: new Date(Date.now() - 9 * 3600_000) }).where(and(eq(regionStates.profileId, profileId), eq(regionStates.regionKey, "silverpine")));
      await player.world.setTradeAutoDispatch({ active: true });
      const rush = await player.world.rushTrade();
      expect(rush.hours).toBe(8);
      expect(rush.autoDispatched).toBe(true);
      expect(rush.remaining).toBe(4);

      const [tradeState] = await db.select().from(regionStates).where(and(eq(regionStates.profileId, profileId), eq(regionStates.regionKey, "silverpine"))).limit(1);
      expect(tradeState.tradeActive).toBe(true);
      expect(tradeState.tradeStartedAt).not.toBeNull();
    } finally {
      await db.update(gameProfiles).set({ tradeAutoDispatch: false }).where(eq(gameProfiles.id, profileId));
      await db.update(users).set({ membership: "free", membershipExpiresAt: null }).where(eq(users.id, playerUserId));
    }
  }, 90_000);

  it("7bb. 投递中心可向指定领主发送资源、金铢、角色、装备和物品，邮箱只领取一次", async () => {
    const ownedCharacterKeys = new Set((await db.select({ charKey: playerCharacters.charKey }).from(playerCharacters).where(eq(playerCharacters.profileId, profileId))).map((row) => row.charKey));
    const mailCharacter = (await db.select({ charKey: characters.charKey, name: characters.name }).from(characters).where(eq(characters.status, "published"))).find((character) => !ownedCharacterKeys.has(character.charKey));
    if (!mailCharacter) throw new Error("流程测试缺少可通过邮件投递的角色");
    const sent = await admin.admin.deliverMail({
      target: "profile",
      profileId,
      subject: "测试补给已抵达",
      content: "请由领主亲自验收这批边境补给。",
      rewards: { renown: 7, aether: 3, crownCoins: 17 },
      attachments: [
        { kind: "item", key: "item_march_ration", quantity: 2 },
        { kind: "equipment", key: "eq_wax_seal_charm", quantity: 1 },
        { kind: "character", key: mailCharacter.charKey, quantity: 1 },
      ],
    });
    expect(sent).toMatchObject({ ok: true, target: "profile", recipientCount: 1 });
    expect((await player.mail.summary()).unreadCount).toBe(1);

    const inbox = await player.mail.list();
    const letter = inbox.find((item) => item.subject === "测试补给已抵达")!;
    expect(letter.readAt).toBeNull();
    expect(letter.hasAttachments).toBe(true);
    expect(letter.attachments).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "item", key: "item_march_ration", quantity: 2, name: "行军补给券" }),
      expect.objectContaining({ kind: "equipment", key: "eq_wax_seal_charm", quantity: 1 }),
      expect.objectContaining({ kind: "character", key: mailCharacter.charKey, quantity: 1, name: mailCharacter.name }),
    ]));

    await player.mail.read({ mailId: letter.id });
    expect((await player.mail.summary()).unreadCount).toBe(0);
    const before = await player.keep.home();
    const [profileBefore] = await db.select({ crownCoins: gameProfiles.crownCoins }).from(gameProfiles).where(eq(gameProfiles.id, profileId)).limit(1);
    const itemsBefore = await db.select().from(playerItems).where(and(eq(playerItems.profileId, profileId), eq(playerItems.itemKey, "item_march_ration")));
    const equipmentBefore = await db.select().from(playerEquipments).where(and(eq(playerEquipments.profileId, profileId), eq(playerEquipments.equipKey, "eq_wax_seal_charm")));
    const characterBefore = await db.select().from(playerCharacters).where(and(eq(playerCharacters.profileId, profileId), eq(playerCharacters.charKey, mailCharacter.charKey)));
    const claimed = await player.mail.claim({ mailId: letter.id });
    const after = await player.keep.home();
    expect(after.resources.renown).toBe(before.resources.renown + 7);
    expect(claimed.attachments).toHaveLength(3);
    const [profileAfter] = await db.select({ crownCoins: gameProfiles.crownCoins }).from(gameProfiles).where(eq(gameProfiles.id, profileId)).limit(1);
    const itemsAfter = await db.select().from(playerItems).where(and(eq(playerItems.profileId, profileId), eq(playerItems.itemKey, "item_march_ration")));
    const equipmentAfter = await db.select().from(playerEquipments).where(and(eq(playerEquipments.profileId, profileId), eq(playerEquipments.equipKey, "eq_wax_seal_charm")));
    const characterAfter = await db.select().from(playerCharacters).where(and(eq(playerCharacters.profileId, profileId), eq(playerCharacters.charKey, mailCharacter.charKey)));
    expect(profileAfter.crownCoins).toBe(profileBefore.crownCoins + 17);
    expect(itemsAfter.reduce((total, item) => total + item.quantity, 0)).toBe(itemsBefore.reduce((total, item) => total + item.quantity, 0) + 2);
    expect(equipmentAfter).toHaveLength(equipmentBefore.length + 1);
    expect(characterAfter).toHaveLength(characterBefore.length + 1);
    await expect(player.mail.claim({ mailId: letter.id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(player.mail.delete({ mailId: letter.id })).resolves.toMatchObject({ ok: true });
    expect((await player.mail.list()).some((mail) => mail.id === letter.id)).toBe(false);
  }, 60_000);

  it("7c. 预备部队：兵营 2 级解锁第二队，首队战败后可接续残血敌人且只能使用一次", async () => {
    const [barracks] = await db.select().from(profileBuildings).where(and(eq(profileBuildings.profileId, profileId), eq(profileBuildings.buildingKey, "barracks"))).limit(1);
    expect(barracks).toBeTruthy();
    await db.update(profileBuildings).set({ level: Math.max(2, barracks?.level ?? 0) }).where(eq(profileBuildings.id, barracks.id));
    const currentTeams = await player.keep.teams();
    const primary = currentTeams.find((team) => team.slotIndex === 0)!;
    const reserve = currentTeams.find((team) => team.slotIndex === 1);
    const rosterRows = await db.select().from(playerCharacters).where(eq(playerCharacters.profileId, profileId));
    expect(reserve).toBeTruthy();
    expect(rosterRows.length).toBeGreaterThanOrEqual(2);

    const primaryMembers = [rosterRows[0].id];
    const reserveMembers = [rosterRows[1].id];
    await db.update(teams).set({ memberIds: primaryMembers, formation: { [String(primaryMembers[0])]: "front" }, isActive: true }).where(eq(teams.id, primary.id));
    await db.update(teams).set({ memberIds: reserveMembers, formation: { [String(reserveMembers[0])]: "front" }, isActive: false }).where(eq(teams.id, reserve!.id));

    try {
      const started = await player.battle.start({ nodeKey: "sp_keep_road" });
      const [battleRow] = (await db.select().from(battles).where(eq(battles.id, started.battleId))).slice(0, 1);
      const previousState = battleRow.state as any;
      const enemy = previousState.units.find((unit: any) => unit.side === "enemy" && unit.alive);
      expect(enemy).toBeTruthy();
      const remainingHp = Math.max(1, Math.floor(enemy.maxHp / 2));
      previousState.units = previousState.units.map((unit: any) => unit.side === "ally"
        ? { ...unit, hp: 0, alive: false }
        : unit.id === enemy.id
          ? { ...unit, hp: remainingHp, alive: true }
          : { ...unit, hp: 0, alive: false });
      previousState.finished = true;
      previousState.result = "lost";
      await db.update(battles).set({ status: "lost", state: previousState, reserveUsed: false }).where(eq(battles.id, started.battleId));

      const continued = await player.battle.continueWithReserve({ battleId: started.battleId });
      expect(continued.reserveTeam.id).toBe(reserve!.id);
      const continuedEnemy = continued.state.units.find((unit) => unit.side === "enemy" && unit.id === enemy.id);
      expect(continuedEnemy?.hp).toBe(remainingHp);
      expect(continued.state.units.some((unit) => unit.side === "ally" && unit.alive)).toBe(true);
      await expect(player.battle.continueWithReserve({ battleId: started.battleId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      await db.update(profileBuildings).set({ level: barracks?.level ?? 0 }).where(eq(profileBuildings.id, barracks.id));
      await db.update(teams).set({ memberIds: primary.memberIds, formation: primary.formation, isActive: true }).where(eq(teams.id, primary.id));
      await db.update(teams).set({ memberIds: [], formation: {}, isActive: false }).where(eq(teams.id, reserve!.id));
    }
  }, 90_000);

  it("8. 任务推进：行为实时更新进度，完成后可领奖且不可重复领取", async () => {
    const quests = await player.keep.quests();
    expect(quests.length).toBeGreaterThan(0);
    for (const quest of quests) {
      for (const objective of quest.objectives) {
        expect(objective.target).toBeGreaterThan(0);
        expect(objective.current).toBeGreaterThanOrEqual(0);
      }
    }
    const completed = quests.filter((quest) => quest.status === "completed");
    if (completed.length > 0) {
      const claim = await player.keep.claimQuest({ questKey: completed[0].questKey });
      expect(claim.ok).toBe(true);
      await expect(player.keep.claimQuest({ questKey: completed[0].questKey })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
    // 未完成的任务不可领奖
    const active = quests.find((quest) => quest.status !== "completed");
    if (active) {
      await expect(player.keep.claimQuest({ questKey: active.questKey })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    }
  }, 90_000);

  it("9. 剧情：抉择写入档案、重读保留结果且不可重复结算", async () => {
    const chapters = await player.meta.chapters();
    expect(chapters.chapters.length).toBeGreaterThanOrEqual(6);
    const chapter1 = chapters.scenes.filter((item) => item.chapter === 1);
    expect(chapter1.length).toBeGreaterThan(0);
    // 第一章场景必须都有对白内容（剧情真实存在，不是占位）
    expect(chapter1.every((item) => item.beatCount > 0)).toBe(true);

    const scene = await player.world.scene({ sceneKey: chapter1[0].sceneKey });
    expect(scene.title.length).toBeGreaterThan(0);
    expect(scene.beats.length).toBeGreaterThan(0);
    expect(scene.choices.length).toBeGreaterThan(0);
    const chosen = await player.world.chooseScene({ sceneKey: scene.sceneKey, choiceIndex: 0 });
    expect(chosen.ok).toBe(true);
    const reread = await player.world.scene({ sceneKey: scene.sceneKey });
    expect(reread.decision).toMatchObject({ choiceIndex: 0, choiceText: scene.choices[0]?.text });
    const archive = await player.world.storyArchive();
    expect(archive).toEqual(expect.arrayContaining([
      expect.objectContaining({ sceneKey: scene.sceneKey, choiceText: scene.choices[0]?.text }),
    ]));
    const archivedScene = archive.find((entry) => entry.sceneKey === scene.sceneKey);
    expect(archivedScene?.beats.length).toBe(scene.beats.length);
    if (archivedScene?.nodeKey) {
      const node = await player.world.node({ nodeKey: archivedScene.nodeKey });
      expect(node.storyCompleted).toBe(true);
    }
    await expect(player.world.chooseScene({ sceneKey: scene.sceneKey, choiceIndex: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
  }, 90_000);

  it("10. AI 议事：未选角色时直接提示且不调用模型；未在场角色不得发言", async () => {
    const cast = await player.ai.cast();
    expect(cast.characters.length).toBeGreaterThan(0);
    const ownedKeys = cast.characters.map((item) => item.charKey);

    // 无在场角色：服务端直接返回提示，不发起模型调用
    const opened = await player.ai.openConversation({ scene: "council", presentKeys: [] });
    const emptyTalk = await player.ai.talk({ conversationId: opened.conversationId, message: "今天我们该做什么？" });
    expect(emptyTalk.status).toBe("no_present_characters");
    expect(emptyTalk.turns).toHaveLength(0);
    expect(emptyTalk.narration).toContain("请");

    // 未在场 / 未拥有角色不得进入会话
    await expect(player.ai.openConversation({ scene: "council", presentKeys: ["not_owned_char"] })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // 选择真实在场角色后，发言者必须严格来自在场名单
    const selected = ownedKeys.slice(0, 2);

    // 教程会谈即使外部 AI 配置/额度不可用，也必须以本地角色回应落库，且不消耗议事额度。
    const tutorialKeys = ["welcome_keep", "inspect_keep", "build_wall", "finish_wall", "form_expedition", "enter_world", "first_battle", "claim_battle_rewards"];
    await db.update(gameProfiles).set({
      tutorialStep: tutorialKeys.length,
      settings: { tutorial: { version: 2, skipped: false, currentKey: "council_talk", completedKeys: tutorialKeys, dismissedHints: [], lastSeenAt: Date.now() } },
    }).where(eq(gameProfiles.id, profileId));
    const quotaBefore = (await player.ai.cast()).councilQuota.used;
    const tutorialSession = await player.ai.openConversation({ scene: "council", presentKeys: selected });
    const localTalk = await player.ai.talk({ conversationId: tutorialSession.conversationId, message: "灰隼堡接下来最应该优先修复什么？", presentKeys: selected, tutorialFallback: true });
    expect(localTalk.status).toBe("fallback");
    expect((await player.ai.cast()).councilQuota.used).toBe(quotaBefore);
    const localHistory = await player.ai.conversation({ conversationId: tutorialSession.conversationId });
    expect(localHistory.messages.some((message) => message.source === "fallback")).toBe(true);

    const session = await player.ai.openConversation({ scene: "campfire", presentKeys: selected });
    const talk = await player.ai.talk({ conversationId: session.conversationId, message: "聊聊各自的过去吧。" });
    expect(talk.status).not.toBe("no_present_characters");
    const allowed = new Set(selected);
    for (const turn of talk.turns) {
      expect(allowed.has(String(turn.charKey))).toBe(true);
      expect(String(turn.content).length).toBeGreaterThan(0);
      expect(String(turn.mood)).toMatch(/^(calm|warm|tense|sad|hopeful|wry)$/);
    }
    // 结构化输出：turns 为数组，且经过 Schema 校验后不会出现未在场角色
    expect(Array.isArray(talk.turns)).toBe(true);
    const conversation = await player.ai.conversation({ conversationId: session.conversationId });
    expect(conversation.messages.length).toBeGreaterThan(0);
    expect(conversation.messages.some((message) => message.role === "player" && message.content === "聊聊各自的过去吧。")).toBe(true);
    await expect(player.ai.closeConversation({ conversationId: session.conversationId })).resolves.toMatchObject({ ok: true });
    await expect(player.ai.talk({ conversationId: session.conversationId, message: "会谈结束后不应继续发言。", presentKeys: selected })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(player.ai.deleteConversation({ conversationId: session.conversationId })).resolves.toMatchObject({ ok: true });
    await expect(player.ai.conversation({ conversationId: session.conversationId })).rejects.toMatchObject({ code: "NOT_FOUND" });
  }, 150_000);

  it("11. GM 后台：新增角色发布后客户端立即可见，下架后立即消失", async () => {
    const base = {
      charKey: "vitest_flow_hero",
      name: "测试·编年官",
      title: "流程验证者",
      rarity: "R" as const,
      job: "sage" as const,
      race: "人类",
      weapon: "记事笔",
      element: "lightning" as const,
      faction: "星轨学院",
      intro: "由自动化测试创建的角色。",
      appearance: "手持记事笔的学者。",
      background: "用于验证 GM 后台改动能否下发到客户端。",
      personality: "严谨、守时。",
      goal: "确认每一条配置都能生效。",
      quotes: { idle: ["配置已核对。"] },
      skillKeys: ["sk_basic_attack"],
      baseStats: { hp: 700, atk: 70, def: 60, mag: 90, res: 70, spd: 80, crit: 5, critDmg: 50, hit: 95, dodge: 8 },
      growth: { curve: 1, growth: 1.05 },
      relations: [],
      sortOrder: 900,
    };
    const created = await admin.admin.saveCharacter({ ...base, status: "published", inRecruitPool: false });
    expect(created.ok).toBe(true);
    expect(created.mode).toBe("created");

    const roster = await player.character.roster({ filter: "all" });
    const visible = roster.list.find((item) => item.charKey === base.charKey);
    expect(visible?.name).toBe(base.name);
    expect(visible?.contentRating).toBeUndefined(); // 客户端列表不返回内部字段，但角色本身可见

    await admin.admin.saveCharacter({ ...base, status: "archived", inRecruitPool: false });
    const afterArchive = await player.character.roster({ filter: "all" });
    expect(afterArchive.list.some((item) => item.charKey === base.charKey)).toBe(false);
  }, 90_000);

  it("12. GM 后台：调整卡池概率后客户端公示同步变化（概率不写死在前端）", async () => {
    const pools = await admin.admin.listPools();
    const pool = pools[0];
    const pity = pool.pity as { softStart: number; softStep: number; hardPity: number; tenPullMinRarity: "SR"; duplicateShards: number };
    // 记录原始概率，测试结束后恢复，避免污染开发库中的真实卡池配置
    const originalRates = (pool.rates as Array<{ rarity: "R" | "SR" | "SSR"; rate: number }>).map((rate) => ({ rarity: rate.rarity, rate: rate.rate }));
    await admin.admin.savePool({
      poolKey: pool.poolKey,
      name: pool.name,
      poolType: pool.poolType as "normal",
      rates: [
        { rarity: "SSR", rate: 0.12 },
        { rarity: "SR", rate: 0.23 },
        { rarity: "R", rate: 0.65 },
      ],
      pity,
      costSingle: pool.costSingle,
      costTen: pool.costTen,
      currency: pool.currency as "aether",
      characterKeys: [],
      enabled: pool.enabled,
      sortOrder: pool.sortOrder,
    });
    const clientPools = await player.recruit.pools();
    const updated = clientPools.find((item) => item.poolKey === pool.poolKey)!;
    expect(updated.rates.find((rate) => rate.rarity === "SSR")?.rate).toBeCloseTo(0.12, 4);

    // 还原卡池概率（重要：避免自动化测试改动开发/线上库的真实配置）
    await admin.admin.savePool({
      poolKey: pool.poolKey,
      name: pool.name,
      poolType: pool.poolType as "normal",
      rates: originalRates,
      pity,
      costSingle: pool.costSingle,
      costTen: pool.costTen,
      currency: pool.currency as "aether",
      characterKeys: [],
      enabled: pool.enabled,
      sortOrder: pool.sortOrder,
    });
    const restored = (await player.recruit.pools()).find((item) => item.poolKey === pool.poolKey)!;
    expect(restored.rates.find((rate) => rate.rarity === "SSR")?.rate).toBeCloseTo(originalRates.find((rate) => rate.rarity === "SSR")!.rate, 4);
  }, 90_000);

  it("13. 备份与恢复：创建快照含校验和，恢复预演通过，篡改文件被检出", async () => {
    const created = await admin.admin.createBackup({ scope: "config", note: "自动化测试快照" });
    expect(created.ok).toBe(true);
    expect((created.checksum ?? "").length).toBeGreaterThan(0);

    const list = await admin.admin.listBackups();
    const record = list.find((item) => item.backupKey === created.backupKey);
    expect(record).toBeTruthy();

    const dryRun = await admin.admin.restoreBackup({ backupId: record!.id, dryRun: true });
    expect(dryRun.ok).toBe(true);

    // 非快照格式必须被拒绝（防止把任意 JSON 当备份恢复）
    const bogus = await admin.admin.verifyBackupUpload({ filename: "broken.json", base64: Buffer.from('{"hello":"world"}').toString("base64") });
    expect(bogus.ok).toBe(false);
    expect(String(bogus.reason ?? "")).toContain("version");
  }, 120_000);

  it("14. GM 账号删除：清除目标账号及其存档，且禁止删除当前管理员", async () => {
    const openId = "vitest-flow-delete-member";
    const [inserted] = await db.insert(users).values({
      openId,
      name: "删除测试账号",
      loginMethod: "local",
      role: "user",
    }).$returningId();

    try {
      const [victim] = await db.select().from(users).where(eq(users.id, inserted.id)).limit(1);
      expect(victim).toBeTruthy();
      const victimCaller = appRouter.createCaller(makeCtx(victim));
      await victimCaller.keep.home();

      const removed = await admin.admin.deleteMember({ userId: inserted.id });
      expect(removed.ok).toBe(true);
      expect((await db.select().from(users).where(eq(users.id, inserted.id))).length).toBe(0);
      expect((await db.select().from(gameProfiles).where(eq(gameProfiles.userId, inserted.id))).length).toBe(0);
      await expect(admin.admin.deleteMember({ userId: adminUserId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    } finally {
      await db.delete(users).where(eq(users.id, inserted.id));
    }
  }, 90_000);

  it("14a. GM 会员与角色管理：可按在线时长排序并修正会员角色", async () => {
    const activeAt = new Date();
    await db.update(users).set({ onlineSeconds: 5_400, lastActiveAt: activeAt }).where(eq(users.id, playerUserId));

    const listed = await admin.admin.listMembers({ search: TEST_OPEN_ID, sortBy: "onlineSeconds", sortDirection: "desc" });
    const member = listed.members.find((item) => item.id === playerUserId);
    expect(member).toMatchObject({ onlineSeconds: 5_400, online: true });
    expect(member?.profile?.id).toBe(profileId);

    const gameData = await admin.admin.getMemberGameData({ userId: playerUserId });
    expect(gameData.profile?.id).toBe(profileId);
    expect(gameData.characters.length).toBeGreaterThan(0);

    const target = gameData.characters[0];
    const level = Math.min(100, target.level + 1);
    await admin.admin.updateMemberCharacter({ playerCharacterId: target.id, level, affection: 42, locked: true });
    const updated = await admin.admin.getMemberGameData({ userId: playerUserId });
    expect(updated.characters.find((item) => item.id === target.id)).toMatchObject({ level, affection: 42, locked: true });
  }, 60_000);

  it("15. 审计日志：后台关键操作全部留痕（可追溯）", async () => {
    // 审计接口只返回最近 100 条，故在此显式写入一条可识别的操作再读取
    const targetProfileId = profileId > 0 ? profileId : (await admin.admin.listPlayerProfiles())[0]?.id;
    expect(targetProfileId).toBeGreaterThan(0);
    await admin.admin.grantResources({ profileId: targetProfileId!, gold: 1, reason: "审计日志验证" });
    const setResult = await admin.admin.setResources({
      profileId: targetProfileId!,
      gold: 12345,
      food: 2345,
      wood: 3456,
      iron: 456,
      aether: 789,
      renown: 321,
      stamina: 999,
      reason: "GM 资源编辑回归测试",
    });
    expect(setResult.resources).toMatchObject({ gold: 12345, food: 2345, wood: 3456, iron: 456, aether: 789, renown: 321 });
    expect(setResult.resources.stamina).toBeLessThanOrEqual(setResult.resources.staminaMax);
    const profileAfterSet = (await admin.admin.listPlayerProfiles()).find((item) => item.id === targetProfileId)!;
    expect(profileAfterSet).toMatchObject({ gold: 12345, food: 2345, wood: 3456, iron: 456, aether: 789, renown: 321 });
    const logs = await admin.admin.listAuditLogs();
    expect(logs.length).toBeGreaterThan(0);
    const actions = new Set(logs.map((log) => log.action));
    expect(actions.has("resources.grant")).toBe(true);
    expect(actions.has("resources.set")).toBe(true);
    expect(actions.has("backup.create")).toBe(true);
    expect(actions.has("member.delete")).toBe(true);
    expect(actions.has("member.character.update")).toBe(true);
    // 审计日志必须记录操作者，便于追责
    expect(logs.every((log) => log.adminUserId > 0)).toBe(true);
  }, 60_000);

  it("16. 银杉商会：GM 补发金铢后由服务端扣款、入库、使用补给并保留限购账目", async () => {
    await admin.admin.setResources({ profileId, crownCoins: 200, reason: "商会流程测试" });
    const catalog = await player.shop.catalog();
    expect(catalog.currency).toMatchObject({ key: "crownCoins", balance: 200 });
    const rationsBeforePurchase = catalog.inventory.find((item) => item.itemKey === "item_march_ration")?.quantity ?? 0;

    const rations = await player.shop.purchase({ productKey: "shop_march_rations" });
    expect(rations).toMatchObject({ ok: true, balance: 188 });
    const stock = await player.shop.catalog();
    expect(stock.inventory.find((item) => item.itemKey === "item_march_ration")?.quantity).toBe(rationsBeforePurchase + 5);
    expect(stock.purchases[0]).toMatchObject({ productKey: "shop_march_rations", crownCoinsSpent: 12 });

    await db.update(gameProfiles).set({ stamina: 0, staminaUpdatedAt: new Date() }).where(eq(gameProfiles.id, profileId));
    const used = await player.shop.useItem({ itemKey: "item_march_ration" });
    expect(used).toMatchObject({ ok: true, restored: 12, stamina: 12 });
    const afterUse = await player.shop.catalog();
    expect(afterUse.inventory.find((item) => item.itemKey === "item_march_ration")?.quantity).toBe(rationsBeforePurchase + 4);

    const equipment = await player.shop.purchase({ productKey: "shop_iron_oath_hammer" });
    expect(equipment.ok).toBe(true);
    const [hammer] = await db.select().from(playerEquipments).where(and(eq(playerEquipments.profileId, profileId), eq(playerEquipments.equipKey, "eq_ironoath_hammer"))).limit(1);
    expect(hammer?.source).toBe("shop");
    await expect(player.shop.purchase({ productKey: "shop_iron_oath_hammer" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }, 60_000);
});
