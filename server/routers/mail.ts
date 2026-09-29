import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { characters, playerEquipments, playerItems, profileMails } from "../../drizzle/schema";
import { getDb } from "../db";
import { EQUIP_BY_KEY } from "../game/data/equipments";
import { SHOP_ITEM_BY_KEY } from "../game/data/shop";
import { addResources, grantCharacter } from "../game/service";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveProfile } from "./_shared";

export const rewardSchema = z.object({
  gold: z.number().int().min(0).max(2_000_000_000).optional(),
  food: z.number().int().min(0).max(2_000_000_000).optional(),
  wood: z.number().int().min(0).max(2_000_000_000).optional(),
  iron: z.number().int().min(0).max(2_000_000_000).optional(),
  aether: z.number().int().min(0).max(2_000_000_000).optional(),
  crownCoins: z.number().int().min(0).max(2_000_000_000).optional(),
  renown: z.number().int().min(0).max(2_000_000_000).optional(),
  stamina: z.number().int().min(0).max(999).optional(),
  recruitShards: z.number().int().min(0).max(2_000_000_000).optional(),
});

export const mailAttachmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("equipment"), key: z.string().trim().min(1).max(64), quantity: z.number().int().min(1).max(10) }),
  z.object({ kind: z.literal("item"), key: z.string().trim().min(1).max(64), quantity: z.number().int().min(1).max(999) }),
  z.object({ kind: z.literal("character"), key: z.string().trim().min(1).max(64), quantity: z.number().int().min(1).max(10) }),
]);
export type MailAttachment = z.infer<typeof mailAttachmentSchema>;

const mailPayloadSchema = z.object({
  subject: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(4000),
  rewards: rewardSchema.default({}),
  attachments: z.array(mailAttachmentSchema).max(8).default([]),
});

function hasRewards(rewards: Record<string, number>) {
  return Object.values(rewards).some((value) => Number(value) > 0);
}

function hasClaimable(rewards: Record<string, number>, attachments: MailAttachment[]) {
  return hasRewards(rewards) || attachments.some((attachment) => attachment.quantity > 0);
}

export function normalizeMailRewards(rewards: Record<string, number>) {
  return Object.fromEntries(Object.entries(rewards).filter(([, value]) => Number(value) > 0)) as Record<string, number>;
}

export function normalizeMailAttachments(attachments: MailAttachment[]) {
  const merged = new Map<string, MailAttachment>();
  for (const attachment of attachments) {
    const identity = `${attachment.kind}:${attachment.key}`;
    const existing = merged.get(identity);
    merged.set(identity, existing ? { ...attachment, quantity: existing.quantity + attachment.quantity } : attachment);
  }
  return Array.from(merged.values());
}

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function attachmentView(attachment: MailAttachment, characterNames = new Map<string, string>()) {
  const name = attachment.kind === "equipment"
    ? EQUIP_BY_KEY.get(attachment.key)?.name
    : attachment.kind === "item"
      ? SHOP_ITEM_BY_KEY.get(attachment.key)?.name
      : characterNames.get(attachment.key);
  return { ...attachment, name: name ?? attachment.key };
}

async function attachmentViews(db: Database, attachments: MailAttachment[]) {
  const characterKeys = attachments.filter((attachment) => attachment.kind === "character").map((attachment) => attachment.key);
  if (characterKeys.length === 0) return attachments.map((attachment) => attachmentView(attachment));
  const rows = await db.select({ charKey: characters.charKey, name: characters.name }).from(characters).where(inArray(characters.charKey, Array.from(new Set(characterKeys))));
  const names = new Map(rows.map((row) => [row.charKey, row.name]));
  return attachments.map((attachment) => attachmentView(attachment, names));
}

export async function validateMailAttachments(db: Database, attachments: MailAttachment[]) {
  for (const attachment of attachments) {
    if (attachment.kind === "equipment" && !EQUIP_BY_KEY.has(attachment.key)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `未登记的装备附件：${attachment.key}` });
    }
    if (attachment.kind === "item" && !SHOP_ITEM_BY_KEY.has(attachment.key)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `未登记的物品附件：${attachment.key}` });
    }
  }
  const characterKeys = Array.from(new Set(attachments.filter((attachment) => attachment.kind === "character").map((attachment) => attachment.key)));
  if (characterKeys.length === 0) return;
  const rows = await db.select({ charKey: characters.charKey }).from(characters).where(inArray(characters.charKey, characterKeys));
  const known = new Set(rows.map((row) => row.charKey));
  const missing = characterKeys.find((key) => !known.has(key));
  if (missing) throw new TRPCError({ code: "BAD_REQUEST", message: `未登记的角色附件：${missing}` });
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
    return Promise.all(mails.map(async (mail) => {
      const rewards = mail.rewards ?? {};
      const attachments = (mail.attachments ?? []) as MailAttachment[];
      return { ...mail, rewards, attachments: await attachmentViews(db, attachments), hasAttachments: hasClaimable(rewards, attachments) };
    }));
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

  /** 纯通知可直接删除；含附件的信需先领取，避免误删尚未入库的奖励。 */
  delete: protectedProcedure.input(z.object({ mailId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const [mail] = await db.select().from(profileMails).where(and(eq(profileMails.id, input.mailId), eq(profileMails.profileId, profile.id))).limit(1);
    if (!mail) throw new TRPCError({ code: "NOT_FOUND", message: "信函不存在" });
    const attachments = (mail.attachments ?? []) as MailAttachment[];
    if (hasClaimable(mail.rewards ?? {}, attachments) && !mail.claimedAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "请先领取附件，再删除这封信函" });
    }
    await db.delete(profileMails).where(and(eq(profileMails.id, mail.id), eq(profileMails.profileId, profile.id)));
    return { ok: true };
  }),

  /** 资源与物品附件均只允许领取一次，发放清单由服务端校验。 */
  claim: protectedProcedure.input(z.object({ mailId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const [mail] = await db.select().from(profileMails).where(and(eq(profileMails.id, input.mailId), eq(profileMails.profileId, profile.id))).limit(1);
    if (!mail) throw new TRPCError({ code: "NOT_FOUND", message: "信函不存在" });
    const rewards = mail.rewards ?? {};
    const attachments = (mail.attachments ?? []) as MailAttachment[];
    if (!hasClaimable(rewards, attachments)) throw new TRPCError({ code: "BAD_REQUEST", message: "这是一封通知，没有可领取的附件" });
    if (mail.claimedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "附件已经领取" });
    await validateMailAttachments(db, attachments);
    const namedAttachments = await attachmentViews(db, attachments);

    const now = new Date();
    const [result] = await db.update(profileMails).set({ claimedAt: now, readAt: mail.readAt ?? now }).where(and(eq(profileMails.id, mail.id), isNull(profileMails.claimedAt)));
    if (result.affectedRows !== 1) throw new TRPCError({ code: "CONFLICT", message: "附件状态已变化，请刷新后重试" });

    if (hasRewards(rewards)) await addResources(profile.id, rewards);
    for (const attachment of attachments) {
      if (attachment.kind === "equipment") {
        await db.insert(playerEquipments).values(Array.from({ length: attachment.quantity }, () => ({ profileId: profile.id, equipKey: attachment.key, source: "mail", rolls: {} })));
      } else if (attachment.kind === "item") {
        const [existing] = await db.select({ id: playerItems.id }).from(playerItems).where(and(eq(playerItems.profileId, profile.id), eq(playerItems.itemKey, attachment.key))).limit(1);
        if (existing) {
          await db.update(playerItems).set({ quantity: sql`${playerItems.quantity} + ${attachment.quantity}`, source: "mail" }).where(eq(playerItems.id, existing.id));
        } else {
          await db.insert(playerItems).values({ profileId: profile.id, itemKey: attachment.key, quantity: attachment.quantity, source: "mail" });
        }
      } else {
        for (let index = 0; index < attachment.quantity; index += 1) await grantCharacter(profile.id, attachment.key, "mail");
      }
    }
    return { ok: true, rewards, attachments: namedAttachments };
  }),
});

/** 兼容原有的单档案投递入口。 */
export const adminMailInput = mailPayloadSchema.extend({
  profileId: z.number().int().positive(),
});

/** 投递中心：可指定一位领主或向当前全部已建档领主投递同一封信。 */
export const adminDeliveryInput = mailPayloadSchema
  .extend({
    target: z.enum(["profile", "all"]),
    profileId: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.target === "profile" && !value.profileId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["profileId"], message: "请选择一位领主" });
    }
  });
