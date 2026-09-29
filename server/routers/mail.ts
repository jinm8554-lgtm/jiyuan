import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { profileMails } from "../../drizzle/schema";
import { getDb } from "../db";
import { addResources } from "../game/service";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveProfile } from "./_shared";

const rewardSchema = z.object({
  gold: z.number().int().min(0).max(2_000_000_000).optional(),
  food: z.number().int().min(0).max(2_000_000_000).optional(),
  wood: z.number().int().min(0).max(2_000_000_000).optional(),
  iron: z.number().int().min(0).max(2_000_000_000).optional(),
  aether: z.number().int().min(0).max(2_000_000_000).optional(),
  renown: z.number().int().min(0).max(2_000_000_000).optional(),
  stamina: z.number().int().min(0).max(999).optional(),
  recruitShards: z.number().int().min(0).max(2_000_000_000).optional(),
});

function hasRewards(rewards: Record<string, number>) {
  return Object.values(rewards).some((value) => Number(value) > 0);
}

export const mailRouter = router({
  /** 仅返回未读数，供游戏主界面的邮箱提醒轻量轮询。 */
  summary: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const unread = await db.select({ id: profileMails.id }).from(profileMails).where(and(eq(profileMails.profileId, profile.id), isNull(profileMails.readAt)));
    return { unreadCount: unread.length };
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const mails = await db.select().from(profileMails).where(eq(profileMails.profileId, profile.id)).orderBy(desc(profileMails.createdAt), desc(profileMails.id)).limit(100);
    return mails.map((mail) => ({ ...mail, hasRewards: hasRewards(mail.rewards ?? {}) }));
  }),

  read: protectedProcedure.input(z.object({ mailId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const [mail] = await db.select().from(profileMails).where(and(eq(profileMails.id, input.mailId), eq(profileMails.profileId, profile.id))).limit(1);
    if (!mail) throw new TRPCError({ code: "NOT_FOUND", message: "信函不存在" });
    if (!mail.readAt) await db.update(profileMails).set({ readAt: new Date() }).where(eq(profileMails.id, mail.id));
    return { ok: true };
  }),

  claim: protectedProcedure.input(z.object({ mailId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const [mail] = await db.select().from(profileMails).where(and(eq(profileMails.id, input.mailId), eq(profileMails.profileId, profile.id))).limit(1);
    if (!mail) throw new TRPCError({ code: "NOT_FOUND", message: "信函不存在" });
    const rewards = mail.rewards ?? {};
    if (!hasRewards(rewards)) throw new TRPCError({ code: "BAD_REQUEST", message: "这是一封通知，没有可领取的资源" });
    if (mail.claimedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "附件已经领取" });

    const now = new Date();
    const [result] = await db.update(profileMails).set({ claimedAt: now, readAt: mail.readAt ?? now }).where(and(eq(profileMails.id, mail.id), isNull(profileMails.claimedAt)));
    if (result.affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "附件状态已变化，请刷新后重试" });
    await addResources(profile.id, rewards);
    return { ok: true, rewards };
  }),
});

export const adminMailInput = z.object({
  profileId: z.number().int().positive(),
  subject: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(4000),
  rewards: rewardSchema.default({}),
});
