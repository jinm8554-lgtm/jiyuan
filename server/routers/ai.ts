import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { aiCallLogs, aiConfigs, aiConversations, aiMessages, characters, playerCharacters } from "../../drizzle/schema";
import { getDb } from "../db";
import { decryptSecret, generateCharacterTurns, type AiRuntimeConfig } from "../game/aiClient";
import { SCENE_LABEL, fallbackTurns, type AiOutput, type PresentCharacter, type SceneKey } from "../game/ai";
import { applyBondExp } from "../game/formulas";
import { advanceQuestProgress } from "../game/progress";
import { loadRoster } from "../game/service";
import { ENV } from "../_core/env";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveProfile } from "./_shared";

const SCENES: SceneKey[] = ["council", "campfire", "debate", "banquet"];

/** 玩家输入的内容准则过滤（全年龄向） */
const PLAYER_BANNED = [/色情/, /性奴/, /裸露/, /羞辱/, /脱衣/];

/** 读取当前生效的 AI 配置（仅服务端可见；API Key 解密后仅用于当次调用，不返回前端） */
async function loadRuntimeConfig(): Promise<AiRuntimeConfig> {
  const fallbackGateway: AiRuntimeConfig = {
    configId: null,
    name: "内置网关",
    baseUrl: "",
    apiKey: null,
    model: "",
    temperature: 70,
    maxTokens: 1200,
    systemPrompt: null,
    jsonStrict: true,
    useBuiltInGateway: true,
  };
  const db = await getDb();
  if (!db) return fallbackGateway;

  const secret = process.env.JWT_SECRET ?? ENV.cookieSecret ?? "aetherfall-dev-secret";
  const [row] = await db.select().from(aiConfigs).where(eq(aiConfigs.isActive, true)).limit(1);
  if (!row) return fallbackGateway;

  const apiKey = row.apiKeyCipher ? decryptSecret(row.apiKeyCipher, secret) : null;
  return {
    configId: row.id,
    name: row.name,
    baseUrl: row.useBuiltInGateway ? "" : (row.baseUrl ?? ""),
    apiKey,
    model: row.model ?? "",
    temperature: row.temperature,
    maxTokens: row.maxTokens,
    systemPrompt: row.systemPrompt,
    jsonStrict: row.jsonStrict,
    useBuiltInGateway: row.useBuiltInGateway,
  };
}

export const aiRouter = router({
  /** 可参与互动的角色 + 场景 + 历史会话 */
  cast: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

    const roster = await loadRoster(profile.id);
    const conversations = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.profileId, profile.id))
      .orderBy(desc(aiConversations.id))
      .limit(20);

    return {
      scenes: SCENES.map((scene) => ({ sceneKey: scene, label: SCENE_LABEL[scene] })),
      characters: roster.map((entry) => ({
        charKey: entry.charKey,
        playerCharId: entry.playerCharId,
        name: entry.config.name,
        title: entry.config.title,
        rarity: entry.config.rarity,
        job: entry.config.job,
        element: entry.config.element,
        avatarUrl: entry.config.avatarUrl,
        portraitUrl: entry.config.portraitUrl,
        bondLevel: entry.bondLevel,
        affection: entry.affection,
        level: entry.level,
        faction: entry.config.faction,
        personality: entry.config.personality,
        goal: entry.config.goal,
      })),
      conversations: conversations.map((row) => ({
        conversationId: row.id,
        title: row.title,
        scene: row.sceneKey,
        sceneLabel: SCENE_LABEL[row.sceneKey as SceneKey] ?? row.sceneKey,
        presentCharKeys: row.presentCharKeys ?? [],
        turnCount: row.turnCount,
        status: row.status,
        updatedAt: row.updatedAt,
      })),
      aiConfigured: await (async () => {
        const [active] = await db.select().from(aiConfigs).where(eq(aiConfigs.isActive, true)).limit(1);
        if (!active) return { source: "builtin" as const, name: "内置网关（未配置外部模型）", model: "" };
        return {
          source: active.useBuiltInGateway ? ("builtin" as const) : ("external" as const),
          name: active.name,
          model: active.model,
        };
      })(),
      contentNote: "AI 只会扮演你当前选中的在场角色；全部互动遵守全年龄向内容准则。",
    };
  }),

  /** 创建会话（校验在场角色均属玩家名册） */
  openConversation: protectedProcedure
    .input(
      z.object({
        scene: z.enum(["council", "campfire", "debate", "banquet"]),
        presentKeys: z.array(z.string().min(1).max(64)).max(4),
        title: z.string().max(60).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const owned = await db.select().from(playerCharacters).where(eq(playerCharacters.profileId, profile.id));
      const ownedKeys = new Set(owned.map((row) => row.charKey));
      const invalid = input.presentKeys.filter((key) => !ownedKeys.has(key));
      if (invalid.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `以下角色不在你的名册中：${invalid.join("、")}` });
      }

      const [row] = await db
        .insert(aiConversations)
        .values({
          profileId: profile.id,
          title: input.title ?? `${SCENE_LABEL[input.scene]} · ${new Date().toLocaleDateString("zh-CN")}`,
          sceneKey: input.scene,
          presentCharKeys: input.presentKeys,
          turnCount: 0,
        })
        .$returningId();

      return { ok: true, conversationId: row.id };
    }),

  /** 会话详情（消息历史） */
  conversation: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

    const [conversation] = await db
      .select()
      .from(aiConversations)
      .where(and(eq(aiConversations.id, input.conversationId), eq(aiConversations.profileId, profile.id)))
      .limit(1);
    if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "会话不存在" });

    const messages = await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversation.id))
      .orderBy(aiMessages.id)
      .limit(400);

    const keys = Array.from(new Set(messages.map((msg) => msg.charKey).filter(Boolean))) as string[];
    const configs = keys.length > 0 ? await db.select().from(characters).where(inArray(characters.charKey, keys)) : [];
    const infoMap = new Map(configs.map((config) => [config.charKey, config]));

    return {
      conversationId: conversation.id,
      title: conversation.title,
      scene: conversation.sceneKey,
      sceneLabel: SCENE_LABEL[conversation.sceneKey as SceneKey] ?? conversation.sceneKey,
      presentCharKeys: conversation.presentCharKeys ?? [],
      activeCharKey: conversation.activeCharKey,
      turnCount: conversation.turnCount,
      status: conversation.status,
      messages: messages.map((msg) => {
        const info = msg.charKey ? infoMap.get(msg.charKey) : undefined;
        return {
          id: msg.id,
          role: msg.role,
          charKey: msg.charKey,
          speakerName: msg.charKey ? (info?.name ?? msg.charKey) : msg.role === "player" ? "领主" : "旁白",
          avatarUrl: info?.avatarUrl ?? null,
          rarity: info?.rarity ?? null,
          content: msg.content,
          structured: msg.structured ?? null,
          source: msg.source,
          createdAt: msg.createdAt,
        };
      }),
    };
  }),

  /** 关闭会话 */
  closeConversation: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    await db
      .update(aiConversations)
      .set({ status: "closed" })
      .where(and(eq(aiConversations.id, input.conversationId), eq(aiConversations.profileId, profile.id)));
    return { ok: true };
  }),

  /** 删除一段会谈及其消息、调用日志；仅限会谈所属玩家自行清理。 */
  deleteConversation: protectedProcedure.input(z.object({ conversationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const [conversation] = await db
      .select({ id: aiConversations.id })
      .from(aiConversations)
      .where(and(eq(aiConversations.id, input.conversationId), eq(aiConversations.profileId, profile.id)))
      .limit(1);
    if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "会谈不存在或无权删除" });

    await db.delete(aiMessages).where(eq(aiMessages.conversationId, conversation.id));
    await db.delete(aiCallLogs).where(eq(aiCallLogs.conversationId, conversation.id));
    await db.delete(aiConversations).where(eq(aiConversations.id, conversation.id));
    return { ok: true };
  }),

  /**
   * 与在场角色对话
   * 规则：只允许 presentCharKeys 中的角色发言；输出经 JSON Schema + 业务校验；
   *      未知角色发言被服务端拒绝；羁绊与对话全部落库；调用记录写入 aiCallLogs（不含密钥）。
   */
  talk: protectedProcedure
    .input(
      z.object({
        conversationId: z.number().int().positive(),
        message: z.string().min(1).max(500),
        activeCharKey: z.string().max(64).nullable().optional(),
        presentKeys: z.array(z.string().min(1).max(64)).max(4).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

      const [conversation] = await db
        .select()
        .from(aiConversations)
        .where(and(eq(aiConversations.id, input.conversationId), eq(aiConversations.profileId, profile.id)))
        .limit(1);
      if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "会话不存在" });

      const presentKeys = (input.presentKeys ?? conversation.presentCharKeys ?? []).slice(0, 4);

      // 无在场角色：不调用 AI，直接提示
      if (presentKeys.length === 0) {
        return {
          ok: true,
          status: "no_present_characters" as const,
          turns: [] as Array<Record<string, unknown>>,
          narration: "议事厅里还没有人。请先在下方选择至少一名在场角色，他们才能回应你。",
          suggestions: ["从名册中选择 1-3 名在场角色", "选择角色后再试一次"],
          violations: [] as Array<{ code: string; detail: string }>,
          presentCharKeys: [] as string[],
          turnCount: conversation.turnCount,
        };
      }

      if (PLAYER_BANNED.some((pattern) => pattern.test(input.message))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "该发言不符合全年龄向内容准则，请调整后再发送。" });
      }

      const roster = await loadRoster(profile.id);
      const ownedMap = new Map(roster.map((entry) => [entry.charKey, entry]));
      const invalid = presentKeys.filter((key) => !ownedMap.has(key));
      if (invalid.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `角色不在名册中：${invalid.join("、")}` });
      }
      if (input.activeCharKey && !presentKeys.includes(input.activeCharKey)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "选中的发言者不在当前在场角色中" });
      }

      const present: PresentCharacter[] = presentKeys.map((key) => {
        const entry = ownedMap.get(key)!;
        return {
          charKey: entry.charKey,
          name: entry.config.name,
          title: entry.config.title,
          job: entry.config.job,
          race: entry.config.race,
          faction: entry.config.faction,
          personality: entry.config.personality ?? "（未记录）",
          goal: entry.config.goal ?? "（未记录）",
          background: entry.config.background ?? "（未记录）",
          bondLevel: entry.bondLevel,
          affection: entry.affection,
          level: entry.level,
          storyState: entry.storyState,
          relations: (entry.config.relations ?? []).map((rel) => ({ charKey: rel.charKey, relation: rel.relation, note: rel.note })),
        };
      });

      const history = await db
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, conversation.id))
        .orderBy(aiMessages.id)
        .limit(30);

      await db.insert(aiMessages).values({
        conversationId: conversation.id,
        profileId: profile.id,
        role: "player",
        charKey: null,
        content: input.message.slice(0, 500),
        structured: {},
        source: "system",
        tokens: 0,
      });

      const config = await loadRuntimeConfig();
      const started = Date.now();
      const result = await generateCharacterTurns({
        config,
        present,
        scene: conversation.sceneKey as SceneKey,
        playerMessage: input.message,
        activeCharKey: input.activeCharKey ?? null,
        history: history.map((msg) => ({ role: msg.role, charKey: msg.charKey, content: msg.content })),
        turnCount: conversation.turnCount,
        fallback: () =>
          fallbackTurns({
            present,
            activeCharKey: input.activeCharKey ?? null,
            playerMessage: input.message,
            scene: conversation.sceneKey as SceneKey,
            seed: conversation.turnCount + input.message.length,
          }),
      });

      const output: AiOutput = result.output;
      const savedTurns: Array<Record<string, unknown>> = [];

      for (const turn of output.turns) {
        const entry = ownedMap.get(turn.charKey);
        if (!entry) continue; // 防御性：仅接受在场角色（校验已在 ai.ts 中完成）
        await db.insert(aiMessages).values({
          conversationId: conversation.id,
          profileId: profile.id,
          role: "character",
          charKey: turn.charKey,
          content: turn.content,
          structured: {
            action: turn.action,
            mood: turn.mood,
            targetCharKey: turn.targetCharKey ?? null,
            bondDelta: turn.bondDelta,
            suggestedAction: turn.suggestedAction ?? null,
          },
          source: result.status === "ok" || result.status === "schema_violation" ? "ai" : "fallback",
          tokens: 0,
        });

        if (turn.bondDelta > 0) {
          const bond = applyBondExp(entry.bondLevel, entry.bondExp, turn.bondDelta * 4);
          await db
            .update(playerCharacters)
            .set({ bondLevel: bond.level, bondExp: bond.exp, affection: Math.max(-100, Math.min(100, entry.affection + 1)) })
            .where(eq(playerCharacters.id, entry.playerCharId));
          entry.bondLevel = bond.level;
          entry.bondExp = bond.exp;
        }

        savedTurns.push({
          charKey: turn.charKey,
          name: entry.config.name,
          title: entry.config.title,
          avatarUrl: entry.config.avatarUrl,
          rarity: entry.config.rarity,
          action: turn.action,
          mood: turn.mood,
          content: turn.content,
          bondDelta: turn.bondDelta,
          targetCharKey: turn.targetCharKey ?? null,
          suggestedAction: turn.suggestedAction ?? null,
        });
      }

      if (output.narration) {
        await db.insert(aiMessages).values({
          conversationId: conversation.id,
          profileId: profile.id,
          role: "narrator",
          charKey: null,
          content: output.narration.slice(0, 400),
          structured: { suggestions: output.suggestions },
          source: result.status === "ok" ? "ai" : "fallback",
          tokens: 0,
        });
      }

      await db
        .update(aiConversations)
        .set({
          turnCount: conversation.turnCount + 1,
          presentCharKeys: presentKeys,
          activeCharKey: input.activeCharKey ?? conversation.activeCharKey,
          updatedAt: new Date(),
        })
        .where(eq(aiConversations.id, conversation.id));

      await db.insert(aiCallLogs).values({
        profileId: profile.id,
        conversationId: conversation.id,
        configId: config.configId,
        model: result.model,
        endpoint: config.useBuiltInGateway ? "builtin-gateway" : config.baseUrl.replace(/^https?:\/\//, "").slice(0, 120),
        status: result.status,
        httpStatus: result.httpStatus ?? null,
        latencyMs: result.latencyMs || Date.now() - started,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        presentCharKeys: presentKeys,
        violationCount: result.violations.length,
        errorMessage: result.errorMessage ? result.errorMessage.slice(0, 480) : null,
      });

      await advanceQuestProgress(profile.id, [{ type: "talk_ai", charKey: input.activeCharKey ?? null }]);

      return {
        ok: true,
        status: result.status,
        turns: savedTurns,
        narration: output.narration,
        suggestions: output.suggestions,
        violations: result.violations.map((violation) => ({ code: violation.code, detail: violation.detail })),
        rejectedTurns: result.rejectedTurns,
        model: result.model,
        latencyMs: result.latencyMs,
        presentCharKeys: presentKeys,
        turnCount: conversation.turnCount + 1,
        configuredVia: config.name,
      };
    }),

  /** 最近一次会话摘要（首页卡片） */
  latest: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });
    const [conversation] = await db
      .select()
      .from(aiConversations)
      .where(eq(aiConversations.profileId, profile.id))
      .orderBy(desc(aiConversations.id))
      .limit(1);
    if (!conversation) {
      return { hasConversation: false as const, conversationId: null, turnCount: 0, presentCharKeys: [] as string[], sceneLabel: null };
    }
    return {
      hasConversation: true as const,
      conversationId: conversation.id,
      turnCount: conversation.turnCount,
      presentCharKeys: conversation.presentCharKeys ?? [],
      sceneLabel: SCENE_LABEL[conversation.sceneKey as SceneKey] ?? conversation.sceneKey,
    };
  }),
});
