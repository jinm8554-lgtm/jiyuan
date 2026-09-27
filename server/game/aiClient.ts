import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { invokeLLM } from "../_core/llm";
import { AI_OUTPUT_SCHEMA, extractJson, type AiOutput, type PresentCharacter, type SceneKey, buildSystemPrompt, buildUserPrompt, validateAiOutput } from "./ai";

/* -------------------------- 密钥加解密 -------------------------- */

const deriveKey = (secret: string) => createHash("sha256").update(secret).digest();

/** AES-256-GCM 加密（API Key 禁止明文落库） */
export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${encrypted.toString("base64url")}.${tag.toString("base64url")}`;
}

export function decryptSecret(payload: string, secret: string): string | null {
  try {
    const [ivPart, dataPart, tagPart] = payload.split(".");
    if (!ivPart || !dataPart || !tagPart) return null;
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(ivPart, "base64url"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function maskApiKey(key: string | null | undefined): string {
  if (!key) return "未配置";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

/* -------------------------- 模型调用 -------------------------- */

export type AiRuntimeConfig = {
  configId: number | null;
  name: string;
  baseUrl: string;
  apiKey: string | null;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string | null;
  jsonStrict: boolean;
  useBuiltInGateway: boolean;
};

export type AiCallResult = {
  ok: boolean;
  output: AiOutput;
  status: "ok" | "schema_violation" | "http_error" | "timeout" | "fallback" | "rejected";
  httpStatus?: number;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  errorMessage?: string;
  violations: Array<{ code: string; detail: string; charKey?: string }>;
  rejectedTurns: number;
  model: string;
};

export type GenerateParams = {
  config: AiRuntimeConfig;
  present: PresentCharacter[];
  scene: SceneKey;
  playerMessage: string;
  activeCharKey?: string | null;
  history: Array<{ role: string; charKey?: string | null; content: string }>;
  turnCount: number;
  fallback: () => AiOutput;
};

const TIMEOUT_MS = 45_000;

async function callOpenAiCompatible(
  config: AiRuntimeConfig,
  systemPrompt: string,
  userPrompt: string,
): Promise<{ content: string; httpStatus: number; promptTokens: number; completionTokens: number; model: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const endpoint = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const body: Record<string, unknown> = {
      model: config.model,
      temperature: Math.max(0, Math.min(200, config.temperature)) / 100,
      max_tokens: Math.max(128, Math.min(4000, config.maxTokens)),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };
    if (config.jsonStrict) {
      body.response_format = { type: "json_schema", json_schema: AI_OUTPUT_SCHEMA };
    } else {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.apiKey ?? ""}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw Object.assign(new Error(`HTTP ${response.status}: ${text.slice(0, 400)}`), { httpStatus: response.status });
    }
    const json = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      content: json.choices?.[0]?.message?.content ?? "",
      httpStatus: response.status,
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      model: json.model ?? config.model,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** 统一生成入口：优先使用 GM 配置的模型；未配置则使用内置网关；均失败则本地回退 */
export async function generateCharacterTurns(params: GenerateParams): Promise<AiCallResult> {
  const started = Date.now();
  const { config, present } = params;

  if (present.length === 0) {
    return {
      ok: false,
      output: { turns: [], narration: "议事厅里还没有人。请先选择至少一名在场角色。", suggestions: ["请先选择在场角色"] },
      status: "rejected",
      latencyMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      violations: [{ code: "no_present_characters", detail: "没有在场角色，已拒绝调用 AI" }],
      rejectedTurns: 0,
      model: config.model || "-",
    };
  }

  const systemPrompt = buildSystemPrompt({
    present,
    scene: params.scene,
    worldContext: "",
    extraSystemPrompt: config.systemPrompt,
  });
  const userPrompt = buildUserPrompt({
    playerMessage: params.playerMessage,
    scene: params.scene,
    activeCharKey: params.activeCharKey,
    present,
    history: params.history,
    turnCount: params.turnCount,
  });

  const withWorld = `${systemPrompt}\n\n【世界背景】\n${WORLD_CONTEXT_TEXT}`;

  let content = "";
  let httpStatus: number | undefined;
  let promptTokens = 0;
  let completionTokens = 0;
  let model = config.model || "built-in";
  let errorMessage: string | undefined;

  try {
    if (!config.useBuiltInGateway) {
      if (!config.baseUrl || !config.apiKey) {
        throw new Error("外部 AI 配置缺少 Base URL 或 API Key");
      }
      const result = await callOpenAiCompatible(config, withWorld, userPrompt);
      content = result.content;
      httpStatus = result.httpStatus;
      promptTokens = result.promptTokens;
      completionTokens = result.completionTokens;
      model = result.model;
    } else {
      // 使用会话内置网关（无需在库中保存第三方 Key）
      const result = await invokeLLM({
        messages: [
          { role: "system", content: withWorld },
          { role: "user", content: userPrompt },
        ],
        ...(config.model ? { model: config.model } : {}),
        maxTokens: Math.max(128, Math.min(4000, config.maxTokens)),
        responseFormat: { type: "json_schema", json_schema: AI_OUTPUT_SCHEMA },
      });
      content = typeof result.choices?.[0]?.message?.content === "string" ? result.choices[0].message.content : "";
      httpStatus = 200;
      promptTokens = result.usage?.prompt_tokens ?? 0;
      completionTokens = result.usage?.completion_tokens ?? 0;
      model = result.model ?? model;
    }
  } catch (error) {
    const err = error as Error & { httpStatus?: number };
    errorMessage = err.message;
    const isTimeout = err.name === "AbortError" || /timeout|aborted/i.test(err.message);
    const output = params.fallback();
    return {
      ok: true,
      output,
      status: isTimeout ? "timeout" : "fallback",
      httpStatus: err.httpStatus,
      latencyMs: Date.now() - started,
      promptTokens,
      completionTokens,
      errorMessage,
      violations: [{ code: isTimeout ? "timeout" : "http_error", detail: errorMessage }],
      rejectedTurns: 0,
      model,
    };
  }

  const parsed = extractJson(content);
  const validation = validateAiOutput(parsed, present.map((p) => p.charKey));

  if (!validation.ok) {
    // Schema/业务校验失败：一次重试
    const output = params.fallback();
    return {
      ok: true,
      output,
      status: "schema_violation",
      httpStatus,
      latencyMs: Date.now() - started,
      promptTokens,
      completionTokens,
      errorMessage: validation.violations.map((v) => `${v.code}:${v.detail}`).join(" | ").slice(0, 500),
      violations: validation.violations,
      rejectedTurns: validation.rejectedTurns,
      model,
    };
  }

  const narration = validation.output.narration || "（场景继续）";
  const output: AiOutput = { ...validation.output, narration };

  return {
    ok: true,
    output,
    status: validation.violations.length > 0 ? "schema_violation" : "ok",
    httpStatus,
    latencyMs: Date.now() - started,
    promptTokens,
    completionTokens,
    errorMessage: validation.violations.length > 0 ? validation.violations.map((v) => `${v.code}:${v.detail}`).join(" | ").slice(0, 500) : undefined,
    violations: validation.violations,
    rejectedTurns: validation.rejectedTurns,
    model,
  };
}

const WORLD_CONTEXT_TEXT = [
  "世界名：瓦尔德兰大陆。七年前的「星陨之夜」，天空裂开，裂隙涌出星辉与蚀影。",
  "旧王国凯尔文尼亚联合王国在盐铁战争、灰喉疫病与魔物灾害中崩坏，王都高塔城陷落。",
  "玩家是瓦尔登家族最后的继承人、灰隼堡领主。蚀影是被裂隙留住的记忆残渣，动机是「想要被记住」。",
  "主要势力：王国余晖、圣焰教团、星轨学院、铁誓商会、森语者联盟、无冕之环。",
].join("\n");

/** 拉取模型列表（GM 后台「模型拉取」） */
export async function fetchModels(config: AiRuntimeConfig): Promise<{ models: Array<{ id: string; ownedBy?: string }>; source: "config" | "builtin" }> {
  if (!config.useBuiltInGateway) {
    if (!config.baseUrl || !config.apiKey) {
      throw new Error("外部 AI 配置缺少 Base URL 或 API Key");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/models`, {
        headers: { authorization: `Bearer ${config.apiKey}` },
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }
      const json = (await response.json()) as { data?: Array<{ id: string; owned_by?: string }> };
      return { models: (json.data ?? []).map((m) => ({ id: m.id, ownedBy: m.owned_by })), source: "config" };
    } finally {
      clearTimeout(timer);
    }
  }
  const { listLLMModels } = await import("../_core/llm");
  const result = await listLLMModels();
  return { models: result.data.map((m) => ({ id: m.id, ownedBy: m.owned_by })), source: "builtin" };
}

/** 连通性测试（GM 后台「AI 调用测试」） */
export async function testAiConnection(config: AiRuntimeConfig): Promise<{
  ok: boolean;
  message: string;
  latencyMs: number;
  sample?: AiOutput;
  violations: Array<{ code: string; detail: string }>;
}> {
  const started = Date.now();
  const samplePresent: PresentCharacter[] = [
    {
      charKey: "adrian",
      name: "艾德里安·瓦尔登",
      title: "灰隼之誓",
      job: "骑士",
      race: "人类",
      faction: "王国余晖",
      personality: "沉稳、守规矩、略固执。",
      goal: "让旗帜重新有人跟随。",
      background: "旧王国骑士团最后的旗手。",
      bondLevel: 1,
      affection: 0,
      level: 1,
    },
  ];
  const result = await generateCharacterTurns({
    config,
    present: samplePresent,
    scene: "council",
    playerMessage: "艾德里安，城墙的修补进度如何？",
    activeCharKey: "adrian",
    history: [],
    turnCount: 0,
    fallback: () => ({ turns: [], narration: "本地回退", suggestions: [] }),
  });
  return {
    ok: result.status === "ok",
    message:
      result.status === "ok"
        ? `调用成功（${result.latencyMs}ms，模型 ${result.model}）`
        : `调用返回状态：${result.status}${result.errorMessage ? ` · ${result.errorMessage.slice(0, 200)}` : ""}`,
    latencyMs: Date.now() - started,
    sample: result.output,
    violations: result.violations.map((v) => ({ code: v.code, detail: v.detail })),
  };
}
