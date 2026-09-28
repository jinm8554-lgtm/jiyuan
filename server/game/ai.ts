/**
 * AI 角色互动引擎
 * 硬性规则：
 *  1) 只把「当前在场角色」传入模型；未选中的角色不得发言或行动（服务端白名单校验）
 *  2) 输出必须为结构化 JSON，并通过 JSON Schema + 业务校验（角色 ID / 枚举 / 长度 / 数值范围）
 *  3) 角色身份、设定、阵营、性格不可被模型修改（不在 Schema 中暴露可写字段）
 *  4) 无在场角色 → 直接返回「请先选择角色」提示，不调用模型
 *  5) AI 配置（Base URL / Key / 模型 / 提示词）只能由 GM 后台设定，客户端不可覆盖
 */

export type SceneKey = "council" | "campfire" | "debate" | "banquet";

export const SCENE_LABEL: Record<SceneKey, string> = {
  council: "议事厅会议",
  campfire: "篝火夜谈",
  debate: "战略辩论",
  banquet: "战后复盘",
};

export const SCENE_PROMPT: Record<SceneKey, string> = {
  council: "领地在议事厅召开会议，讨论当前的领地状况、资源与下一步行动。",
  campfire: "夜里，队伍在营地篝火旁休息，气氛放松，可以聊起各自的过去与打算。",
  debate: "针对一个具体决策，队伍内部出现了不同意见，需要各自陈述理由。",
  banquet: "一场小型的庆功或答谢场合，气氛温和，适合表达感谢与结盟。",
};

export type PresentCharacter = {
  charKey: string;
  name: string;
  title: string;
  job: string;
  race: string;
  faction: string;
  personality: string;
  goal: string;
  background: string;
  bondLevel: number;
  affection: number;
  level: number;
  /** 当前剧情状态（来自存档） */
  storyState?: Record<string, unknown>;
  relations?: Array<{ charKey: string; relation: string; note: string }>;
};

export type TurnAction = "speak" | "silent" | "act" | "respond";

export type AiTurn = {
  charKey: string;
  action: TurnAction;
  targetCharKey?: string | null;
  content: string;
  mood: "calm" | "warm" | "tense" | "sad" | "hopeful" | "wry";
  bondDelta: number;
  suggestedAction?: { type: string; note: string } | null;
};

export type AiOutput = {
  turns: AiTurn[];
  narration: string;
  suggestions: string[];
};

/** 结构化输出 JSON Schema（用于模型侧约束 + 服务端校验） */
export const AI_OUTPUT_SCHEMA = {
  name: "aetherfall_character_turns",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["turns", "narration", "suggestions"],
    properties: {
      turns: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["charKey", "action", "content", "mood", "bondDelta"],
          properties: {
            charKey: { type: "string", maxLength: 64 },
            action: { type: "string", enum: ["speak", "silent", "act", "respond"] },
            targetCharKey: { type: ["string", "null"], maxLength: 64 },
            content: { type: "string", maxLength: 400 },
            mood: { type: "string", enum: ["calm", "warm", "tense", "sad", "hopeful", "wry"] },
            bondDelta: { type: "integer", minimum: 0, maximum: 3 },
            suggestedAction: {
              type: ["object", "null"],
              additionalProperties: false,
              required: ["type", "note"],
              properties: {
                type: { type: "string", enum: ["build", "battle", "rest", "talk", "explore", "trade"] },
                note: { type: "string", maxLength: 200 },
              },
            },
          },
        },
      },
      narration: { type: "string", maxLength: 400 },
      suggestions: { type: "array", maxItems: 4, items: { type: "string", maxLength: 120 } },
    },
  },
} as const;

export const ALL_AGES_GUARD = [
  "【内容准则 · 强制】本作面向全年龄玩家：",
  "1. 禁止任何色情内容、露骨性暗示、性奴役、色情服装与身体羞辱描写。",
  "2. 亲密表达上限为：并肩作战、信任交付、家族羁绊、骑士誓约、礼貌的关心与轻度好感。",
  "3. 角色均为冒险者、骑士、法师、学者、工匠、商旅等正向身份；不得描写角色堕落、被支配或羞辱。",
  "4. 冲突来源限于：资源匮乏、信仰差异、道路归属、误会、旧战争创伤、蚀影威胁。",
  "5. 暴力描写保持克制（击退、护盾破裂、星辉逸散），不得出现血腥与虐待细节。",
].join("\n");

/** 组装系统提示词（只能用「在场角色」信息） */
export function buildSystemPrompt(params: {
  present: PresentCharacter[];
  scene: SceneKey;
  worldContext: string;
  extraSystemPrompt?: string | null;
}): string {
  const { present, scene } = params;
  const roster = present
    .map((char) => {
      const relations = (char.relations ?? [])
        .filter((rel) => present.some((p) => p.charKey === rel.charKey))
        .map((rel) => `${rel.relation}：${rel.note}`)
        .join("；");
      return [
        `- 角色ID：${char.charKey}`,
        `  姓名：${char.name}（${char.title}）`,
        `  身份：${char.race}${char.job}，阵营：${char.faction}`,
        `  性格：${char.personality}`,
        `  个人目标：${char.goal}`,
        `  背景：${char.background}`,
        `  当前状态：Lv.${char.level}，羁绊 ${char.bondLevel} 级，好感 ${char.affection}`,
        char.storyState && Object.keys(char.storyState).length > 0 ? `  剧情状态：${JSON.stringify(char.storyState)}` : "",
        relations ? `  与在场角色的关系：${relations}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return [
    "你是叙事引擎，负责扮演《裂隙纪元》中「当前在场」的角色进行多角色对话与反应。",
    ALL_AGES_GUARD,
    "",
    "【世界背景】",
    params.worldContext,
    "",
    "【场景】",
    SCENE_PROMPT[scene],
    "",
    "【当前在场角色（只有下列角色可以发言或行动）】",
    roster || "（无）",
    "",
    "【严格规则】",
    "1. 只能让下列在场角色发言或行动。任何不在列表中的角色一律不得出现（不得创建新角色、不得引入未出场者）。",
    "1a. 每一条 turns 条目的 charKey 都必须逐字复制上方的「角色ID」，且必须非空；不得填写角色姓名、称号、中文名或自行编造的 ID。",
    "2. 不得改动任何角色的身份、姓名、称号、阵营、种族、性格、目标或背景事实；不得替角色做违背其设定的事。",
    "3. 角色可以选择发言(speak)、回应他人(respond)、采取行动(act)或保持沉默(silent)。沉默的条目 content 写简短的动作/神态描述。",
    "4. 每名角色一次只输出一条 turns 条目（可由多名在场角色各输出一条，也可以只有一名角色开口）。",
    "5. 若某角色性格上不会主动开口，就让 ta 沉默——不要为了热闹而让所有人说话。",
    "6. 语言使用中文，风格贴合中世纪西幻但通俗易懂；每条 content 不超过 200 字。",
    "7. bondDelta 表示本次互动对羁绊的推进（0-3 的整数），沉默或冲突可以是 0。",
    "8. 输出必须是符合给定 JSON Schema 的 JSON 对象，不要输出任何额外文字。",
    params.extraSystemPrompt ? `\n【GM 追加指令】\n${params.extraSystemPrompt}` : "",
  ].join("\n");
}

export function buildUserPrompt(params: {
  playerMessage: string;
  scene: SceneKey;
  activeCharKey?: string | null;
  present: PresentCharacter[];
  history: Array<{ role: string; charKey?: string | null; content: string }>;
  turnCount: number;
}): string {
  const historyText = params.history
    .slice(-12)
    .map((msg) => {
      if (msg.role === "player") return `领主：${msg.content}`;
      if (msg.role === "narrator") return `旁白：${msg.content}`;
      const char = params.present.find((p) => p.charKey === msg.charKey);
      return `${char?.name ?? msg.charKey ?? "角色"}：${msg.content}`;
    })
    .join("\n");

  const active = params.activeCharKey ? params.present.find((p) => p.charKey === params.activeCharKey) : null;
  const allowedIds = params.present.map((p) => p.charKey).join("、");

  return [
    historyText ? `【最近的对话】\n${historyText}\n` : "",
    active
      ? `【玩家当前选中的在场角色】${active.name}（${active.charKey}）—— 优先让 ${active.name} 回应；其他在场角色可以简短回应或保持沉默。`
      : `【玩家当前未指定发言者】请从在场角色中自然选择一名回应。为保证格式稳定，本轮只输出 1 条 turns；charKey 必须填写且只能是下列 ID 之一：${allowedIds}。`,
    `【本轮玩家发言】${params.playerMessage}`,
    `【已进行回合】${params.turnCount}`,
    "请输出 JSON。",
  ]
    .filter(Boolean)
    .join("\n");
}

/* --------------------------- 输出校验 --------------------------- */

export type ViolationCode =
  | "not_object"
  | "turns_not_array"
  | "too_many_turns"
  | "unknown_char"
  | "duplicate_char"
  | "duplicate_content"
  | "invalid_action"
  | "invalid_mood"
  | "empty_content"
  | "content_too_long"
  | "bond_out_of_range"
  | "narration_too_long"
  | "too_many_suggestions";

export type ValidationResult = {
  ok: boolean;
  output: AiOutput;
  violations: Array<{ code: ViolationCode; detail: string; charKey?: string }>;
  rejectedTurns: number;
};

const ACTION_SET: TurnAction[] = ["speak", "silent", "act", "respond"];
const MOOD_SET = ["calm", "warm", "tense", "sad", "hopeful", "wry"] as const;
/** 会话黑名单：模型输出中出现这些关键词即判定越界（身份/设定篡改或成人向内容） */
const FORBIDDEN_PATTERNS = [
  /色情/,
  /性奴/,
  /裸/,
  /脱衣/,
  /羞辱/,
  /(?:我|她|他)(?:是|其实是).{0,6}(?:神|魔王|王|转世)/,
  /改写(?:设定|身份|阵营)/,
];

export function validateAiOutput(raw: unknown, presentCharKeys: string[]): ValidationResult {
  const violations: ValidationResult["violations"] = [];
  const allowed = new Set(presentCharKeys);
  const empty: AiOutput = { turns: [], narration: "", suggestions: [] };

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, output: empty, violations: [{ code: "not_object", detail: "输出不是 JSON 对象" }], rejectedTurns: 0 };
  }
  const candidate = raw as Record<string, unknown>;
  if (!Array.isArray(candidate.turns)) {
    return { ok: false, output: empty, violations: [{ code: "turns_not_array", detail: "turns 不是数组" }], rejectedTurns: 0 };
  }
  if (candidate.turns.length > 6) {
    violations.push({ code: "too_many_turns", detail: `turns 数量 ${candidate.turns.length} 超限` });
  }

  const turns: AiTurn[] = [];
  const seenKeys = new Set<string>();
  const seenContent = new Set<string>();
  let rejected = 0;

  for (const entry of candidate.turns.slice(0, 12) as Array<Record<string, unknown>>) {
    if (!entry || typeof entry !== "object") {
      rejected += 1;
      violations.push({ code: "not_object", detail: "turn 不是对象" });
      continue;
    }
    const charKey = typeof entry.charKey === "string" ? entry.charKey : "";
    if (!allowed.has(charKey)) {
      // 关键规则：拒绝未知/未在场角色发言
      rejected += 1;
      violations.push({ code: "unknown_char", detail: `角色 ${charKey || "(空)"} 不在场，已拒绝其发言`, charKey });
      continue;
    }
    if (seenKeys.has(charKey)) {
      // 同一角色在一轮内只能保留第一条有效发言。模型偶尔会把同一人的两句
      // 拆成两条，属于可安全归一化的冗余，不应导致整轮回退或向玩家报错。
      rejected += 1;
      continue;
    }
    const action = String(entry.action ?? "");
    if (!ACTION_SET.includes(action as TurnAction)) {
      rejected += 1;
      violations.push({ code: "invalid_action", detail: `未知 action：${action}`, charKey });
      continue;
    }
    const moodRaw = String(entry.mood ?? "calm");
    const mood = (MOOD_SET.includes(moodRaw as (typeof MOOD_SET)[number]) ? moodRaw : "calm") as AiTurn["mood"];
    if (moodRaw !== mood) violations.push({ code: "invalid_mood", detail: `未知 mood：${moodRaw}，已回退 calm`, charKey });

    let content = typeof entry.content === "string" ? entry.content.trim() : "";
    if (!content) {
      violations.push({ code: "empty_content", detail: `角色 ${charKey} 的 content 为空`, charKey });
      content = action === "silent" ? "（沉默）" : "……";
    }
    if (content.length > 400) {
      violations.push({ code: "content_too_long", detail: `角色 ${charKey} 的 content 过长，已截断`, charKey });
      content = `${content.slice(0, 396)}…`;
    }
    if (seenContent.has(content)) {
      rejected += 1;
      violations.push({ code: "duplicate_content", detail: `角色 ${charKey} 的内容与其他人重复，已拒绝`, charKey });
      continue;
    }
    if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(content))) {
      rejected += 1;
      violations.push({ code: "invalid_action", detail: `角色 ${charKey} 的输出触发内容准则过滤，已拒绝`, charKey });
      continue;
    }

    const targetRaw = entry.targetCharKey;
    const targetCharKey = typeof targetRaw === "string" && allowed.has(targetRaw) ? targetRaw : null;

    const bondRaw = Number(entry.bondDelta ?? 0);
    let bondDelta = Number.isFinite(bondRaw) ? Math.round(bondRaw) : 0;
    if (bondDelta < 0 || bondDelta > 3) {
      violations.push({ code: "bond_out_of_range", detail: `角色 ${charKey} 的 bondDelta=${bondRaw} 越界，已收敛到 0-3`, charKey });
      bondDelta = Math.max(0, Math.min(3, bondDelta));
    }

    const suggested = entry.suggestedAction as { type?: unknown; note?: unknown } | null | undefined;
    const suggestedAction =
      suggested && typeof suggested === "object" && typeof suggested.type === "string"
        ? { type: String(suggested.type).slice(0, 24), note: String(suggested.note ?? "").slice(0, 200) }
        : null;

    seenKeys.add(charKey);
    seenContent.add(content);
    turns.push({ charKey, action: action as TurnAction, targetCharKey, content, mood, bondDelta, suggestedAction });
  }

  let narration = typeof candidate.narration === "string" ? candidate.narration.trim() : "";
  if (narration.length > 400) {
    violations.push({ code: "narration_too_long", detail: "narration 过长，已截断" });
    narration = `${narration.slice(0, 396)}…`;
  }

  const suggestionsRaw = Array.isArray(candidate.suggestions) ? candidate.suggestions : [];
  const suggestions = suggestionsRaw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, 4)
    .map((item) => item.trim().slice(0, 120));
  if (suggestionsRaw.length > 4) violations.push({ code: "too_many_suggestions", detail: "suggestions 超过 4 条，已截断" });

  const output: AiOutput = { turns, narration, suggestions };
  const ok = violations.every((v) => v.code === "invalid_mood" || v.code === "content_too_long" || v.code === "narration_too_long" || v.code === "too_many_suggestions" || v.code === "bond_out_of_range" || v.code === "empty_content") && turns.length > 0;

  return { ok, output, violations, rejectedTurns: rejected };
}

/** 从模型返回中安全提取 JSON 对象（容忍代码块与前后缀文本） */
export function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/* --------------------------- 本地回退（无 AI 配置或调用失败时） --------------------------- */

const FALLBACK_LINES: Record<string, string[]> = {
  adrian: ["「我听着，领主。」他把披风的下摆整理好，「先说结论也行，我不着急。」", "「这件事我照办。但如果可以，我想先知道理由。」"],
  greta: ["「规矩不能因为人少就改。」她把手里的花名册合上，「说下一步吧。」", "「两个人在岗就是两个人。够了。」"],
  maevrin: ["「先坐下。」她把药袋放到一旁，「你说话的速度，听起来像是三天没睡了。」", "「我会记下来。包括你没说出口的那部分。」"],
  viola: ["「数据上，这个方案可行。」她顿了顿，「直觉上，我保留意见。」", "「让我记录一下——不是记录命令，是记录你犹豫的地方。」"],
  liesel: ["「这事儿要是能唱出来，我早就唱了。」她笑了笑，「可惜这一段没有词。」", "「风一直往东吹。往东走，是矿谷。」"],
  ink_nine: ["「……请求确认。」它把手放在刀柄上，又挪开了，「不，是请求说明。」", "「我记下了。连同你说这句话时的语气。」"],
  thor: ["「契约里没写这一条。」他敲了敲桌面，「要么补一条，要么不做。」", "「我按约定来。你按约定给。」"],
  kalan: ["「从后门走，人少。」他靠着墙，「要跟就跟紧点。」", "「……不用谢我。顺手。」"],
  mira: ["「可以修！」她已经开始拆袖子上的工具袋，「给我两个小时——不，一个小时。」", "「误差 3% 以内。我说了算。」"],
  nova: ["「火只用来照亮。」她把灯举高了一些，「先让人看得见路，再谈别的。」", "「汤还在炉子上，先喝完。」"],
  cecilia: ["「慢慢说。」她把手里的一段藤蔓绕好，「树皮很便宜，字可以多写一些。」", "「这片土地记得你们。它不着急。」"],
  orok: ["「……请下令。」他把巨盾挪正，动作很慢，「我站着就行。」", "「热汤很好。谢谢。」"],
  theo: ["「我抄下来了。」他推了推袖口的墨迹，「这一页……可能写得不太好看。」", "「如果有人说要烧书，请先告诉我。我先抄一遍。」"],
  fran: ["「从我这里过不去。」他没有后退，也没有前进一步，「你决定吧，领主。」", "「这面盾有点裂，不过还能用。」"],
  ethan: ["「算过了。」他把算盘拨回零位，「这笔划算，但要快。」", "「三枚铜币，不能再少了。」"],
};

export function fallbackTurns(params: {
  present: PresentCharacter[];
  activeCharKey?: string | null;
  playerMessage: string;
  scene: SceneKey;
  seed: number;
}): AiOutput {
  const { present, activeCharKey } = params;
  if (present.length === 0) {
    return {
      turns: [],
      narration: "议事厅里还没有人。请先在下方选择至少一名在场角色，他们才能回应你。",
      suggestions: ["从角色列表中选择 1-3 名在场角色", "再试一次发言"],
    };
  }
  const speakers = activeCharKey
    ? present.filter((p) => p.charKey === activeCharKey)
    : [present[params.seed % present.length]];

  const turns: AiTurn[] = speakers.slice(0, 2).map((char, index) => {
    const lines = FALLBACK_LINES[char.charKey] ?? [`「${char.goal}」——${char.name}点了点头。`];
    return {
      charKey: char.charKey,
      action: index === 0 ? "speak" : "respond",
      targetCharKey: index === 0 ? null : char.charKey,
      content: lines[(params.seed + index) % lines.length],
      mood: index === 0 ? "calm" : "warm",
      bondDelta: 1,
      suggestedAction: null,
    };
  });

  return {
    turns,
    narration: `（本地回退叙事 · 未启用 GM 配置的 AI 模型）${SCENE_LABEL[params.scene]}继续进行。`,
    suggestions: ["在 GM 后台配置 AI Base URL 与模型以启用完整角色互动", "继续发言或切换到其他在场角色"],
  };
}

/** 组装世界背景文本（供提示词使用） */
export const WORLD_CONTEXT = [
  "世界名：瓦尔德兰大陆。七年前的「星陨之夜」，天空裂开，裂隙（Rifts）涌出星辉（Aether）与蚀影（Blightborn）。",
  "旧王国凯尔文尼亚联合王国在盐铁战争、灰喉疫病与魔物灾害中崩坏，王都高塔城陷落，贵族各自为政。",
  "玩家是瓦尔登家族最后的继承人、灰隼堡领主，封地在银杉边境。核心冲突来源于资源匮乏、信仰差异、道路归属、误会、旧战争创伤与蚀影威胁。",
  "蚀影不是邪恶种族，而是被裂隙留住的记忆残渣，它们的动机是「想要被记住」。",
  "主要势力：王国余晖、圣焰教团、星轨学院、铁誓商会、森语者联盟、无冕之环。",
].join("\n");
