import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../_core/context";
import { ensureProfile, getProfileByUserId } from "../game/service";

/** 统一的数据库不可用错误（前端据此展示友好提示） */
export function dbUnavailable(): never {
  throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用，请稍后重试" });
}

export function badRequest(message: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message });
}

/**
 * 解析当前登录用户的游戏档案；若不存在则创建。
 * 所有存档均以服务端为准，客户端不持有任何权威数据。
 */
export async function resolveProfile(ctx: TrpcContext) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "会话已过期，请重新登录" });
  const existing = await getProfileByUserId(ctx.user.id);
  if (existing) return existing;
  const lordName = (ctx.user.name ?? "领主").slice(0, 16) || "领主";
  await ensureProfile(ctx.user.id, lordName);
  const created = await getProfileByUserId(ctx.user.id);
  if (!created) dbUnavailable();
  return created;
}

/** 权限校验：管理员 */
export function requireAdmin(ctx: TrpcContext) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "会话已过期，请重新登录" });
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "需要管理员权限" });
  return ctx.user;
}