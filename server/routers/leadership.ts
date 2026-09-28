import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { gameProfiles, profileBuildings } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  INTERIOR_LEADERSHIP_SKILLS,
  LEADERSHIP_BY_KEY,
  LEADER_POWER_DAILY_LIMIT,
  LEADER_POWER_PER_COUNCIL,
  TACTICAL_LEADERSHIP_SKILLS,
  leadershipDayKey,
  leaderSkillCost,
  normalizeLeaderLoadout,
  normalizeLeaderSkillLevels,
} from "../game/leadership";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveProfile } from "./_shared";

function profileLeadershipView(profile: typeof gameProfiles.$inferSelect, councilLevel: number) {
  const levels = normalizeLeaderSkillLevels(profile.leaderSkills);
  const loadout = normalizeLeaderLoadout(profile.leaderLoadout, levels);
  const dayKey = leadershipDayKey();
  const dailyUses = profile.leaderDailyKey === dayKey ? Math.min(LEADER_POWER_DAILY_LIMIT, profile.leaderDailyUses) : 0;
  const toView = (skill: typeof INTERIOR_LEADERSHIP_SKILLS[number]) => {
    const level = levels[skill.key] ?? 0;
    const cost = leaderSkillCost(skill, level);
    return {
      key: skill.key,
      name: skill.name,
      category: skill.category,
      description: skill.description,
      maxLevel: skill.maxLevel,
      level,
      learned: level > 0,
      currentEffect: level > 0 ? skill.effectAtLevel(level) : null,
      nextEffect: level < skill.maxLevel ? skill.effectAtLevel(level + 1) : null,
      nextCost: cost,
      pointsCost: skill.pointsCost ?? null,
      targetType: skill.targetType ?? null,
      equipped: loadout.includes(skill.key),
    };
  };
  return {
    unlocked: councilLevel >= 1,
    councilLevel,
    leaderPower: profile.leaderPower,
    daily: {
      rewarded: dailyUses,
      limit: LEADER_POWER_DAILY_LIMIT,
      remaining: Math.max(0, LEADER_POWER_DAILY_LIMIT - dailyUses),
      rewardPerMeeting: LEADER_POWER_PER_COUNCIL,
    },
    loadout,
    interior: INTERIOR_LEADERSHIP_SKILLS.map(toView),
    tactics: TACTICAL_LEADERSHIP_SKILLS.map(toView),
  };
}

async function loadCouncilLevel(profileId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
  const [row] = await db
    .select({ level: profileBuildings.level })
    .from(profileBuildings)
    .where(and(eq(profileBuildings.profileId, profileId), eq(profileBuildings.buildingKey, "council")))
    .limit(1);
  return row?.level ?? 0;
}

export const leadershipRouter = router({
  /** 聊天框下方的领主统御面板数据。 */
  state: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const councilLevel = await loadCouncilLevel(profile.id);
    return profileLeadershipView(profile, councilLevel);
  }),

  /** 学习或升级一项内政/战术能力，领袖力由服务端扣除。 */
  upgrade: protectedProcedure
    .input(z.object({ skillKey: z.string().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
      const councilLevel = await loadCouncilLevel(profile.id);
      if (councilLevel < 1) throw new TRPCError({ code: "BAD_REQUEST", message: "需先建造议事厅（1 级）才能统御领地" });

      const skill = LEADERSHIP_BY_KEY.get(input.skillKey);
      if (!skill) throw new TRPCError({ code: "NOT_FOUND", message: "领主能力不存在" });
      const levels = normalizeLeaderSkillLevels(profile.leaderSkills);
      const currentLevel = levels[skill.key] ?? 0;
      const cost = leaderSkillCost(skill, currentLevel);
      if (cost === null) throw new TRPCError({ code: "BAD_REQUEST", message: "该能力已满级" });
      if (profile.leaderPower < cost) throw new TRPCError({ code: "BAD_REQUEST", message: `领袖力不足，需要 ${cost}` });

      const nextLevels = { ...levels, [skill.key]: currentLevel + 1 };
      await db
        .update(gameProfiles)
        .set({ leaderPower: profile.leaderPower - cost, leaderSkills: nextLevels })
        .where(eq(gameProfiles.id, profile.id));

      const [updated] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profile.id)).limit(1);
      return {
        ok: true,
        skillKey: skill.key,
        level: currentLevel + 1,
        cost,
        state: profileLeadershipView(updated ?? { ...profile, leaderPower: profile.leaderPower - cost, leaderSkills: nextLevels }, councilLevel),
      };
    }),

  /** 战术能力最多装备三项；未学习的能力不能装备。 */
  equip: protectedProcedure
    .input(z.object({ loadout: z.array(z.string().min(1).max(64)).max(3) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
      const councilLevel = await loadCouncilLevel(profile.id);
      if (councilLevel < 1) throw new TRPCError({ code: "BAD_REQUEST", message: "需先建造议事厅（1 级）才能配置领主指令" });

      const levels = normalizeLeaderSkillLevels(profile.leaderSkills);
      const loadout = normalizeLeaderLoadout(input.loadout, levels);
      if (loadout.length !== new Set(input.loadout).size || loadout.length !== input.loadout.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "只能装备已学习的战术能力，且不能重复装备" });
      }
      await db.update(gameProfiles).set({ leaderLoadout: loadout }).where(eq(gameProfiles.id, profile.id));
      const [updated] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profile.id)).limit(1);
      return { ok: true, state: profileLeadershipView(updated ?? { ...profile, leaderLoadout: loadout }, councilLevel) };
    }),
});
