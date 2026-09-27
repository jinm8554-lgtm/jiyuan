import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { battles, gameProfiles, nodeStates, teams } from "../../drizzle/schema";
import { getDb } from "../db";
import { NODE_BY_KEY, NODE_SEEDS } from "../game/data/world";
import { SKILL_BY_KEY } from "../game/data/skills";
import { JOB_ROLE, MAX_LEVEL_BY_ASCENSION, round, type JobKey, type StatBlock } from "../game/formulas";
import { advanceQuestProgress, recomputeRegionControl, syncUnlocks } from "../game/progress";
import {
  advanceToNextActor,
  autoResolve,
  checkBattleEnd,
  computeRewards,
  createRng,
  executeAction,
  startBattle,
  type BattleState,
  type BattleUnitInput,
} from "../game/battle";
import { addResources, applyCharacterExp, ensureDefaultTeam, ensureUnlockedTeams, grantEquipment, keepBonus, loadRoster } from "../game/service";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveProfile } from "./_shared";

/** 构建参战单位（我方来自队伍，敌方来自节点配置） */
async function buildUnits(profileId: number, node: (typeof NODE_SEEDS)[number], requestedTeamId?: number) {
  const roster = await loadRoster(profileId);
  // 自愈式取主队；预备队必须明确指定，且由调用方验证属于当前档案。
  const activeTeam = requestedTeamId
    ? (await ensureUnlockedTeams(profileId)).find((team) => team.id === requestedTeamId) ?? null
    : await ensureDefaultTeam(profileId);
  const memberIds = activeTeam?.memberIds ?? [];
  const formation = (activeTeam?.formation ?? {}) as Record<string, string>;

  const members = memberIds
    .map((id) => roster.find((entry) => entry.playerCharId === id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (members.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "队伍中没有角色，请先前往「同伴」页编成队伍" });
  }

  const allies: BattleUnitInput[] = members.map((entry, index) => ({
    id: `ally_${entry.playerCharId}`,
    charKey: entry.charKey,
    sourceId: entry.playerCharId,
    name: entry.config.name,
    title: entry.config.title,
    side: "ally",
    job: entry.config.job as JobKey,
    element: entry.config.element as BattleUnitInput["element"],
    rarity: entry.config.rarity as "R" | "SR" | "SSR",
    level: entry.level,
    row: (formation[String(entry.playerCharId)] as "front" | "back") ?? JOB_ROLE[entry.config.job as JobKey] ?? (index < 2 ? "front" : "back"),
    stats: entry.stats as StatBlock,
    skills: [
      { skillKey: "sk_basic_attack", level: 1 },
      { skillKey: "sk_defend", level: 1 },
      ...(entry.config.skillKeys ?? []).map((skillKey) => ({ skillKey, level: entry.skillLevels?.[skillKey] ?? 1 })),
    ],
  }));

  const enemies: BattleUnitInput[] = node.enemyWave.map((enemyUnit, index) => ({
    id: `enemy_${index}_${enemyUnit.id}`,
    charKey: enemyUnit.id,
    name: enemyUnit.name,
    side: "enemy",
    job: enemyUnit.job,
    element: enemyUnit.element,
    rarity: enemyUnit.rarity,
    level: enemyUnit.level,
    row: JOB_ROLE[enemyUnit.job] ?? "front",
    stats: enemyUnit.stats as StatBlock,
    skills: [{ skillKey: "sk_basic_attack", level: 1 }, ...enemyUnit.skillKeys.map((skillKey) => ({ skillKey, level: 1 }))],
  }));

  return { allies, enemies, teamId: activeTeam?.id ?? null, memberIds };
}

async function getReserveTeam(profileId: number, primaryTeamId?: number) {
  const bonus = await keepBonus(profileId);
  if (bonus.barracksLevel < 2) return null;
  const allTeams = await ensureUnlockedTeams(profileId);
  return allTeams
    .filter((team) => team.id !== primaryTeamId && team.slotIndex > 0 && (team.memberIds ?? []).length > 0)
    .sort((a, b) => a.slotIndex - b.slotIndex)[0] ?? null;
}

function serializeState(state: BattleState) {
  return {
    turn: state.turn,
    /**
     * 以下字段都必须在持久化时保留，否则「恢复战斗继续打」会出错：
     *  - rngSeed：继续用同一随机种子，保证服务端推演可复现
     *  - cursor：行动条游标，缺失会导致 autoResolve 永远无法推进（战斗卡住）
     *  - log：引擎会向 state.log 追加事件，缺失会直接抛错
     *  - nodeKey / regionKey / keepBonusReduction：结算与领地加成依赖
     */
    rngSeed: state.rngSeed,
    nodeKey: state.nodeKey,
    regionKey: state.regionKey,
    cursor: state.cursor,
    keepBonusReduction: state.keepBonusReduction ?? 0,
    result: state.result,
    finished: state.finished,
    awaitingUnitId: state.awaitingUnitId,
    rating: state.rating,
    order: state.order,
    /** 只保留最近 200 条，避免行数据无限膨胀 */
    log: state.log.slice(-200),
    units: state.units.map((unit) => ({
      id: unit.id,
      charKey: unit.charKey,
      sourceId: unit.sourceId,
      name: unit.name,
      title: unit.title ?? null,
      side: unit.side,
      job: unit.job,
      element: unit.element,
      rarity: unit.rarity,
      level: unit.level,
      row: unit.row,
      hp: unit.hp,
      maxHp: unit.maxHp,
      shield: unit.shield,
      energy: unit.energy,
      energyMax: unit.energyMax,
      alive: unit.alive,
      statuses: unit.statuses.map((status) => ({ type: status.type, stat: status.stat ?? null, value: status.value, duration: status.duration, label: status.label })),
      cooldowns: unit.cooldowns,
      damageDealt: unit.damageDealt,
      damageTaken: unit.damageTaken,
      healingDone: unit.healingDone,
      stats: unit.stats,
      skills: unit.skills.filter((skill) => skill.skillKey !== "sk_defend").map((skill) => {
        const config = SKILL_BY_KEY.get(skill.skillKey);
        return {
          skillKey: skill.skillKey,
          level: skill.level,
          name: config?.name ?? skill.skillKey,
          element: config?.element ?? "physical",
          kind: config?.kind ?? "active",
          targetType: config?.targetType ?? "enemy",
          power: config?.power ?? 100,
          cooldown: config?.cooldown ?? 0,
          energyCost: config?.energyCost ?? 0,
          iconKey: config?.iconKey ?? "sword",
          description: config?.description ?? "",
          ready: (unit.cooldowns[skill.skillKey] ?? 0) <= 0 && unit.energy >= (config?.energyCost ?? 0),
          cooldownLeft: unit.cooldowns[skill.skillKey] ?? 0,
        };
      }),
    })),
  };
}

export const battleRouter = router({
  /** 开始战斗 */
  start: protectedProcedure.input(z.object({ nodeKey: z.string().min(1).max(64), useAuto: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

    const node = NODE_BY_KEY.get(input.nodeKey);
    if (!node) throw new TRPCError({ code: "NOT_FOUND", message: "节点不存在" });

    const [profileRow] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profile.id)).limit(1);
    if (!profileRow) throw new TRPCError({ code: "NOT_FOUND", message: "档案不存在" });

    if (profileRow.stamina < node.staminaCost) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `体力不足，本次远征需要 ${node.staminaCost} 点` });
    }

    // 解锁校验（服务端权威）
    await syncUnlocks(profile.id);
    const [nodeState] = await db
      .select()
      .from(nodeStates)
      .where(and(eq(nodeStates.profileId, profile.id), eq(nodeStates.nodeKey, input.nodeKey)))
      .limit(1);
    // 没有节点状态行等同于尚未解锁，禁止通过直接 URL 绕过地图按钮。
    if (!nodeState || nodeState.status === "locked") {
      throw new TRPCError({ code: "FORBIDDEN", message: "该节点尚未解锁" });
    }

    const { allies, enemies, teamId } = await buildUnits(profile.id, node);
    const bonus = await keepBonus(profile.id);

    const seed = Math.floor(Math.random() * 2 ** 31);
    const state = startBattle([...allies, ...enemies], {
      nodeKey: node.nodeKey,
      regionKey: node.regionKey,
      keepBonus: { attackBonus: bonus.attackBonus, defenseBonus: bonus.defenseBonus, hpBonus: bonus.hpBonus },
      seed,
    });
    state.keepBonusReduction = bonus.damageReduction;

    // 扣除体力
    await db
      .update(gameProfiles)
      .set({ stamina: profileRow.stamina - node.staminaCost })
      .where(eq(gameProfiles.id, profile.id));

    let events = state.log;
    if (input.useAuto) {
      const rng = createRng(state.rngSeed);
      events = [...state.log, ...autoResolve(state, rng)];
    }

    const [inserted] = await db
      .insert(battles)
      .values({
        profileId: profile.id,
        nodeKey: node.nodeKey,
        regionKey: node.regionKey,
        teamId,
        status: state.finished ? (state.result === "won" ? "won" : "lost") : "active",
        turn: state.turn,
        state: serializeState(state) as unknown as Record<string, unknown>,
        log: events.slice(-200) as unknown as Array<Record<string, unknown>>,
        rewards: {} as Record<string, unknown>,
        finishedAt: state.finished ? new Date() : null,
      })
      .$returningId();

    if (!state.finished) {
      await db
        .update(battles)
        .set({ state: serializeState(state) as unknown as Record<string, unknown> })
        .where(eq(battles.id, inserted.id));
    }

    const reserveTeam = state.finished && state.result === "lost" ? await getReserveTeam(profile.id, teamId ?? undefined) : null;

    return {
      ok: true,
      battleId: inserted.id,
      nodeKey: node.nodeKey,
      nodeName: node.name,
      events: events.slice(-60),
      state: serializeState(state),
      autoResolved: Boolean(input.useAuto),
      keepBonus: bonus,
      reserveAvailable: Boolean(reserveTeam),
      reserveTeam: reserveTeam ? { id: reserveTeam.id, name: reserveTeam.name, memberCount: (reserveTeam.memberIds ?? []).length } : null,
    };
  }),

  /** 玩家行动（服务端结算 → 敌方自动行动 → 下一回合） */
  act: protectedProcedure
    .input(
      z.object({
        battleId: z.number().int().positive(),
        actionKey: z.string().min(1).max(64),
        targetId: z.string().max(64).optional(),
        unitId: z.string().max(64).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const [row] = await db
        .select()
        .from(battles)
        .where(and(eq(battles.id, input.battleId), eq(battles.profileId, profile.id)))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "战斗记录不存在" });
      if (row.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "战斗已结束" });

      const state = row.state as unknown as BattleState;
      if (state.finished) throw new TRPCError({ code: "BAD_REQUEST", message: "战斗已结束" });

      const unitId = input.unitId ?? state.awaitingUnitId;
      if (!unitId) throw new TRPCError({ code: "BAD_REQUEST", message: "当前没有等待行动的我方单位" });
      const actor = state.units.find((unit) => unit.id === unitId);
      if (!actor || actor.side !== "ally") throw new TRPCError({ code: "FORBIDDEN", message: "该单位不可被操作" });
      if (actor.id !== state.awaitingUnitId) throw new TRPCError({ code: "BAD_REQUEST", message: "行动顺序已变化，请刷新战斗状态" });

      const allowed = new Set([...actor.skills.map((skill) => skill.skillKey), "defend"]);
      if (!allowed.has(input.actionKey)) throw new TRPCError({ code: "FORBIDDEN", message: "该单位不具备此技能" });

      const rng = createRng(state.rngSeed + state.turn * 7919 + Math.floor(Math.random() * 1000));
      const events = executeAction(state, { unitId: actor.id, actionKey: input.actionKey, targetId: input.targetId }, rng);
      state.awaitingUnitId = null;

      if (!checkBattleEnd(state, events)) {
        advanceToNextActor(state, rng);
      }

      const finished = await persistBattle(profile.id, row.id, state, events);
      return { ok: true, events, state: serializeState(state), finished };
    }),

  /** 半自动战斗：由服务端推演至结束 */
  auto: protectedProcedure.input(z.object({ battleId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

    const [row] = await db
      .select()
      .from(battles)
      .where(and(eq(battles.id, input.battleId), eq(battles.profileId, profile.id)))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "战斗记录不存在" });
    if (row.status !== "active") throw new TRPCError({ code: "BAD_REQUEST", message: "战斗已结束" });

    const state = row.state as unknown as BattleState;
    const rng = createRng(state.rngSeed + 104729);
    const events = autoResolve(state, rng);
    const finished = await persistBattle(profile.id, row.id, state, events);
    return { ok: true, events, state: serializeState(state), finished };
  }),

  /** 预备部队接战：首队全灭后，不返还体力，使用第二队接续上一场的残血敌人。 */
  continueWithReserve: protectedProcedure.input(z.object({ battleId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const [row] = await db.select().from(battles).where(and(eq(battles.id, input.battleId), eq(battles.profileId, profile.id))).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "战斗记录不存在" });
    if (row.status !== "lost") throw new TRPCError({ code: "BAD_REQUEST", message: "只有首队战败后才能派出预备部队" });
    if (row.reserveUsed) throw new TRPCError({ code: "BAD_REQUEST", message: "预备部队已经接战过，不能重复派出" });

    const node = NODE_BY_KEY.get(row.nodeKey);
    if (!node) throw new TRPCError({ code: "NOT_FOUND", message: "节点不存在" });
    const reserveTeam = await getReserveTeam(profile.id, row.teamId ?? undefined);
    if (!reserveTeam) throw new TRPCError({ code: "FORBIDDEN", message: "需要兵营 2 级并先编成一支预备队" });

    const { allies, enemies } = await buildUnits(profile.id, node, reserveTeam.id);
    const bonus = await keepBonus(profile.id);
    const previousState = row.state as unknown as BattleState;
    const state = startBattle([...allies, ...enemies], {
      nodeKey: node.nodeKey,
      regionKey: node.regionKey,
      keepBonus: { attackBonus: bonus.attackBonus, defenseBonus: bonus.defenseBonus, hpBonus: bonus.hpBonus },
      seed: previousState.rngSeed + 9176,
    });
    state.keepBonusReduction = bonus.damageReduction;

    const previousEnemies = new Map(previousState.units.filter((unit) => unit.side === "enemy").map((unit) => [unit.id, unit]));
    for (const enemy of state.units.filter((unit) => unit.side === "enemy")) {
      const previous = previousEnemies.get(enemy.id);
      if (!previous) continue;
      enemy.hp = Math.max(0, Math.min(enemy.maxHp, previous.hp));
      enemy.alive = previous.alive && enemy.hp > 0;
      enemy.shield = Math.max(0, previous.shield ?? 0);
      enemy.statuses = previous.statuses ?? [];
      enemy.energy = previous.energy ?? enemy.energy;
      enemy.cooldowns = previous.cooldowns ?? {};
      enemy.damageDealt = previous.damageDealt ?? 0;
      enemy.damageTaken = previous.damageTaken ?? 0;
    }
    const reserveEvent = { turn: state.turn, type: "info" as const, text: `${reserveTeam.name} 接替战场，敌方保留上一战的剩余生命。` };
    state.log.push(reserveEvent);
    const log = [...((row.log ?? []) as Array<Record<string, unknown>>), reserveEvent].slice(-300);
    await db.update(battles).set({
      teamId: reserveTeam.id,
      reserveUsed: true,
      status: "active",
      turn: state.turn,
      state: serializeState(state) as unknown as Record<string, unknown>,
      log,
      rewards: {},
      stars: 0,
      finishedAt: null,
    }).where(eq(battles.id, row.id));

    return { ok: true, battleId: row.id, reserveTeam: { id: reserveTeam.id, name: reserveTeam.name }, events: [reserveEvent], state: serializeState(state) };
  }),

  /** 逃跑（判定失败，退回领地，消耗已扣除的体力） */
  flee: protectedProcedure.input(z.object({ battleId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const [row] = await db
      .select()
      .from(battles)
      .where(and(eq(battles.id, input.battleId), eq(battles.profileId, profile.id)))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "战斗记录不存在" });
    await db.update(battles).set({ status: "fled", finishedAt: new Date() }).where(eq(battles.id, row.id));
    return { ok: true };
  }),

  /** 战斗详情（刷新页面后恢复战斗） */
  detail: protectedProcedure.input(z.object({ battleId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const [row] = await db
      .select()
      .from(battles)
      .where(and(eq(battles.id, input.battleId), eq(battles.profileId, profile.id)))
      .limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "战斗记录不存在" });
    const node = NODE_BY_KEY.get(row.nodeKey);
    return {
      battleId: row.id,
      nodeKey: row.nodeKey,
      nodeName: node?.name ?? row.nodeKey,
      status: row.status,
      state: row.state,
      log: row.log ?? [],
      rewards: row.rewards ?? {},
      stars: row.stars,
      turn: row.turn,
    };
  }),

  /** 最近的战斗记录 */
  recent: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const rows = await db.select().from(battles).where(eq(battles.profileId, profile.id)).limit(50);
    return rows
      .sort((a, b) => b.id - a.id)
      .slice(0, 12)
      .map((row) => ({
        battleId: row.id,
        nodeKey: row.nodeKey,
        nodeName: NODE_BY_KEY.get(row.nodeKey)?.name ?? row.nodeKey,
        status: row.status,
        turn: row.turn,
        stars: row.stars,
        rewards: row.rewards,
        createdAt: row.createdAt,
      }));
  }),
});

/** 战斗状态落库 + 胜利结算 */
async function persistBattle(
  profileId: number,
  battleId: number,
  state: BattleState,
  newEvents: Array<Record<string, unknown>>,
) {
  const db = await getDb();
  if (!db) return { finished: false };

  const [row] = await db.select().from(battles).where(eq(battles.id, battleId)).limit(1);
  if (!row) return { finished: false };

  const node = NODE_BY_KEY.get(state.nodeKey);
  const rewards = state.finished && state.result === "won" && node
    ? computeRewards(node.rewards, node.firstClearRewards, state, false)
    : { gold: 0, food: 0, wood: 0, iron: 0, aether: 0, renown: 0, exp: 0, items: [], starMultiplier: 1 };

  const mergedLog = [...((row.log ?? []) as Array<Record<string, unknown>>), ...newEvents].slice(-300);

  await db
    .update(battles)
    .set({
      state: serializeState(state) as unknown as Record<string, unknown>,
      log: mergedLog,
      turn: state.turn,
      status: state.finished ? (state.result === "won" ? "won" : "lost") : "active",
      stars: state.rating,
      rewards: rewards as unknown as Record<string, unknown>,
      finishedAt: state.finished ? new Date() : null,
    })
    .where(eq(battles.id, battleId));

  let settlement: Record<string, unknown> | null = null;

  if (state.finished && state.result === "won" && node) {
    const [nodeStateRow] = await db
      .select()
      .from(nodeStates)
      .where(and(eq(nodeStates.profileId, profileId), eq(nodeStates.nodeKey, state.nodeKey)))
      .limit(1);
    const isFirstClear = !nodeStateRow?.firstClearedAt;

    const finalRewards = computeRewards(node.rewards, node.firstClearRewards, state, isFirstClear);
    const clearCount = (nodeStateRow?.clearCount ?? 0) + 1;
    const conquered = clearCount >= node.requiredClears;

    if (nodeStateRow) {
      await db
        .update(nodeStates)
        .set({
          status: conquered ? "conquered" : "cleared",
          clearCount,
          firstClearedAt: nodeStateRow.firstClearedAt ?? new Date(),
          lastClearedAt: new Date(),
        })
        .where(eq(nodeStates.id, nodeStateRow.id));
    } else {
      await db.insert(nodeStates).values({
        profileId,
        nodeKey: state.nodeKey,
        status: conquered ? "conquered" : "cleared",
        clearCount,
        firstClearedAt: new Date(),
        lastClearedAt: new Date(),
      });
    }

    await addResources(profileId, {
      gold: finalRewards.gold,
      food: finalRewards.food,
      wood: finalRewards.wood,
      iron: finalRewards.iron,
      aether: finalRewards.aether,
      renown: finalRewards.renown,
    });

    // 装备掉落（概率判定在服务端）
    const droppedItems: Array<{ equipKey: string; name: string }> = [];
    for (const item of finalRewards.items) {
      const chance = isFirstClear ? 1 : item.chance;
      if (Math.random() <= chance) {
        await grantEquipment(profileId, item.equipKey, isFirstClear ? "first_clear" : "battle");
        const { EQUIPMENT_SEEDS } = await import("../game/data/equipments");
        droppedItems.push({ equipKey: item.equipKey, name: EQUIPMENT_SEEDS.find((e) => e.equipKey === item.equipKey)?.name ?? item.equipKey });
      }
    }

    // 角色经验（参战角色平分）
    const participants = state.units.filter((unit) => unit.side === "ally" && unit.sourceId);
    const expEach = participants.length > 0 ? round(finalRewards.exp / participants.length) : 0;
    const levelUps: Array<{ charKey: string; name: string; level: number }> = [];
    for (const unit of participants) {
      if (!unit.sourceId) continue;
      const result = await applyCharacterExp(unit.sourceId, expEach);
      if (result && result.gainedLevels > 0) {
        levelUps.push({ charKey: unit.charKey, name: unit.name, level: result.level });
        await advanceQuestProgress(profileId, [{ type: "level_character", charKey: unit.charKey, level: result.level }]);
      }
    }

    await recomputeRegionControl(profileId, node.regionKey);
    const progress = await advanceQuestProgress(profileId, [
      { type: "clear_node", nodeKey: node.nodeKey, regionKey: node.regionKey, firstClear: isFirstClear },
    ]);
    await syncUnlocks(profileId);

    const [regionRow] = await db
      .select()
      .from(battles)
      .where(eq(battles.id, battleId))
      .limit(1);
    void regionRow;

    settlement = {
      result: "won",
      stars: state.rating,
      isFirstClear,
      clearCount,
      conquered,
      rewards: finalRewards,
      droppedItems,
      levelUps,
      expEach,
      questUpdates: progress.updated,
      completedQuests: progress.completedKeys,
    };

    await db
      .update(battles)
      .set({ rewards: { ...finalRewards, droppedItems, levelUps, isFirstClear } as unknown as Record<string, unknown> })
      .where(eq(battles.id, battleId));
  } else if (state.finished && state.result === "lost") {
    const reserveTeam = !row.reserveUsed ? await getReserveTeam(profileId, row.teamId ?? undefined) : null;
    settlement = {
      result: "lost",
      stars: 0,
      message: "队伍被击退，撤回领地。装备与角色没有损失。",
      reserveAvailable: Boolean(reserveTeam),
      reserveTeam: reserveTeam ? { id: reserveTeam.id, name: reserveTeam.name, memberCount: (reserveTeam.memberIds ?? []).length } : null,
    };
  }

  return {
    finished: state.finished,
    settlement,
    reserveAvailable: Boolean((settlement as { reserveAvailable?: boolean } | null)?.reserveAvailable),
    reserveTeam: (settlement as { reserveTeam?: unknown } | null)?.reserveTeam ?? null,
  };
}
