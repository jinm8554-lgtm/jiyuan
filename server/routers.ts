import { COOKIE_NAME } from "@shared/const";
import { ONE_YEAR_MS } from "@shared/const";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { users } from "../drizzle/schema";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import { hashLocalPassword, localOpenId, verifyLocalPassword } from "./_core/localAuth";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { aiRouter } from "./routers/ai";
import { adminRouter } from "./routers/admin";
import { battleRouter } from "./routers/battle";
import { characterRouter } from "./routers/character";
import { keepRouter } from "./routers/keep";
import { leadershipRouter } from "./routers/leadership";
import { metaRouter } from "./routers/meta";
import { recruitRouter } from "./routers/recruit";
import { worldRouter } from "./routers/world";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(({ ctx }) => {
      if (!ctx.user) return null;
      const { passwordHash: _passwordHash, ...publicUser } = ctx.user;
      return publicUser;
    }),
    localLogin: publicProcedure
      .input(z.object({ username: z.string().trim().min(1).max(56), password: z.string().min(4).max(128) }))
      .mutation(async ({ ctx, input }) => {
        if (!ENV.localAuthEnabled) {
          throw new TRPCError({ code: "FORBIDDEN", message: "本地登录未启用" });
        }

        const db = await getDb();
        if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

        const openId = localOpenId(input.username);
        const [existing] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

        if (existing?.banned) {
          throw new TRPCError({ code: "FORBIDDEN", message: "账号已被停用" });
        }

        if (existing && !verifyLocalPassword(input.password, existing.passwordHash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "账号或密码错误" });
        }

        if (!existing) {
          await db.insert(users).values({
            openId,
            name: input.username.trim(),
            loginMethod: "local",
            passwordHash: hashLocalPassword(input.password),
            role: "user",
          });
        }

        const [user] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
        if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "账号创建失败" });

        await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name ?? input.username.trim(),
          expiresInMs: ONE_YEAR_MS,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
        return { id: user.id, name: user.name, role: user.role };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  meta: metaRouter,
  keep: keepRouter,
  character: characterRouter,
  recruit: recruitRouter,
  world: worldRouter,
  battle: battleRouter,
  leadership: leadershipRouter,
  ai: aiRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
