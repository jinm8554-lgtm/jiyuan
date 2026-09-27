/**
 * 议事厅 · AI 角色互动
 * 前端只负责「选择在场角色 → 提交发言 → 展示结构化结果」：
 *  - 只有被选中的在场角色会进入请求；未选中角色不会发言或行动
 *  - 未选择任何在场角色时，界面直接提示，不发起 AI 调用
 *  - 展示服务端校验拒绝的越界输出（未知角色 ID / 不合规内容）
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { AlertTriangle, Check, MessageSquarePlus, Send, Sparkles, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { PageSection } from "@/components/game/GameShell";
import { AetherRune } from "@/components/game/GameIcons";
import { AllAgesNote, Avatar, EmptyState, ErrorState, GoldRule, Panel, RarityBadge, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";

const COUNCIL_SCENE = "/aetherfall-assets/council_d4b84b1c.jpg";
const ALL_ACTIVE = "__auto__";

/** 会话中的一条消息（玩家 / 角色 / 旁白） */
type MessageView = {
  id?: number;
  role: string;
  charKey?: string | null;
  speakerName: string;
  avatarUrl?: string | null;
  rarity?: string | null;
  content: string;
  source?: string | null;
  structured?: Record<string, unknown> | null;
  createdAt?: Date | string;
};

const ACTION_LABEL: Record<string, string> = {
  speak: "发言",
  silent: "保持沉默",
  act: "采取行动",
  respond: "回应他人",
  propose: "提出建议",
};

export default function Council() {
  const utils = trpc.useUtils();
  const cast = trpc.ai.cast.useQuery();

  const [conversationId, setConversationId] = useState<number | null>(null);
  const [presentKeys, setPresentKeys] = useState<string[]>([]);
  const [activeCharKey, setActiveCharKey] = useState<string>(ALL_ACTIVE);
  type SceneKey = "council" | "campfire" | "debate" | "banquet";
const [scene, setScene] = useState<SceneKey>("council");
  const [input, setInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [liveMessages, setLiveMessages] = useState<MessageView[]>([]);
  const [violations, setViolations] = useState<Array<{ code: string; detail: string }>>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const conversation = trpc.ai.conversation.useQuery({ conversationId: conversationId ?? 0 }, { enabled: Boolean(conversationId) });

  const openConversation = trpc.ai.openConversation.useMutation({
    onSuccess: async (result) => {
      setConversationId(result.conversationId);
      setLiveMessages([]);
      setViolations([]);
      setPickerOpen(false);
      toast.success("已开启一次议事厅会谈");
      await utils.ai.cast.invalidate();
    },
    onError: (error) => toast.error("创建会话失败", { description: error.message }),
  });

  const talk = trpc.ai.talk.useMutation({
    onSuccess: async (result) => {
      const turns = (result.turns ?? []) as Array<Record<string, unknown>>;
      const messages: MessageView[] = turns.map((turn) => ({
        role: "character",
        charKey: String(turn.charKey ?? ""),
        speakerName: String(turn.name ?? turn.charKey ?? "角色"),
        avatarUrl: (turn.avatarUrl as string | null) ?? null,
        rarity: (turn.rarity as string | null) ?? null,
        content: String(turn.content ?? ""),
        source: result.status === "ok" ? "ai" : "fallback",
        structured: {
          action: turn.action ?? "speak",
          mood: turn.mood ?? null,
          bondDelta: turn.bondDelta ?? 0,
          targetCharKey: turn.targetCharKey ?? null,
          suggestedAction: turn.suggestedAction ?? null,
        },
      }));
      if (result.narration) {
        messages.push({ role: "narrator", speakerName: "旁白", content: result.narration, source: "system" });
      }
      setLiveMessages((current) => [...current, ...messages]);
      setViolations(result.violations ?? []);
      setInput("");
      if (result.status === "no_present_characters") toast.warning("尚未选择在场角色", { description: result.narration ?? undefined });
      else if (result.status !== "ok") toast.warning("本次回复使用兜底内容", { description: "模型输出未通过格式或内容校验，已由本地规则接管。" });
      await Promise.all([utils.ai.latest.invalidate(), utils.ai.cast.invalidate(), utils.keep.quests.invalidate()]);
    },
    onError: (error) => toast.error("发言失败", { description: error.message }),
  });

  const closeConversation = trpc.ai.closeConversation.useMutation({
    onSuccess: async () => {
      toast.info("会谈已结束");
      await utils.ai.cast.invalidate();
    },
    onError: (error) => toast.error("操作失败", { description: error.message }),
  });

  const characters = useMemo(() => cast.data?.characters ?? [], [cast.data]);
  const hasPresence = presentKeys.length > 0;
  const activeCharacter = useMemo(() => characters.find((item) => item.charKey === activeCharKey) ?? null, [characters, activeCharKey]);

  // 打开历史会话时同步在场角色与场景
  const historyKey = conversation.data?.conversationId ?? null;
  useEffect(() => {
    if (!historyKey || !conversation.data) return;
    setPresentKeys(conversation.data.presentCharKeys ?? []);
    setActiveCharKey(conversation.data.activeCharKey ?? ALL_ACTIVE);
    setScene(conversation.data.scene as SceneKey);
    setViolations([]);
    setLiveMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyKey]);

  // 历史消息 + 本次新增消息合并展示
  const messages: MessageView[] = useMemo(() => {
    const history: MessageView[] = (conversation.data?.messages ?? []).map((message) => ({
      id: message.id,
      role: message.role,
      charKey: message.charKey,
      speakerName: message.speakerName,
      avatarUrl: message.avatarUrl,
      rarity: message.rarity,
      content: message.content,
      source: message.source,
      structured: (message.structured as Record<string, unknown> | null) ?? null,
      createdAt: message.createdAt as unknown as string,
    }));
    return [...history, ...liveMessages];
  }, [conversation.data?.messages, liveMessages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  if (cast.isLoading) {
    return (
      <PageSection title="议事厅">
        <SkeletonState rows={4} />
      </PageSection>
    );
  }

  if (cast.isError || !cast.data) {
    return (
      <PageSection title="议事厅">
        <ErrorState message={cast.error?.message ?? "读取失败"} onRetry={() => cast.refetch()} />
      </PageSection>
    );
  }

  const castData = cast.data;

  return (
    <PageSection
      title="议事厅 · 角色会谈"
      eyebrow={castData.aiConfigured.model ? `${castData.aiConfigured.name} · ${castData.aiConfigured.model}` : castData.aiConfigured.name}
      actions={
        <div className="flex flex-wrap gap-2">
          {conversationId ? (
            <Button size="sm" variant="outline" className="border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]" onClick={() => closeConversation.mutate({ conversationId })} disabled={closeConversation.isPending}>
              结束会谈
            </Button>
          ) : null}
          <Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={() => setPickerOpen(true)} disabled={characters.length === 0}>
            <MessageSquarePlus size={13} className="mr-1" />
            开启新会谈
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* 对话区 */}
        <div className="space-y-3">
          <Panel className="relative overflow-hidden p-0">
            <img src={COUNCIL_SCENE} alt="议事厅" className="absolute inset-0 h-full w-full object-cover opacity-30" onError={(event) => { event.currentTarget.style.display = "none"; }} />
            <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--ink-950)] via-[color:var(--ink-950)]/75 to-[color:var(--ink-950)]/40" />
            <div className="relative flex h-[58vh] min-h-[380px] flex-col p-4">
              {/* 在场角色条 */}
              <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-caption shrink-0">在场</span>
                {hasPresence ? (
                  presentKeys.map((key) => {
                    const character = characters.find((item) => item.charKey === key);
                    if (!character) return null;
                    return (
                      <span key={key} className="flex shrink-0 items-center gap-1.5 rounded-sm border border-[color:var(--gold-600)]/60 bg-[color:var(--ink-950)]/85 px-1.5 py-1">
                        <Avatar src={character.avatarUrl} name={character.name} rarity={character.rarity as "R" | "SR" | "SSR"} size={22} />
                        <span className="text-[0.66rem] text-[color:var(--parchment)]">{character.name}</span>
                        <button
                          className="text-[color:var(--parchment-muted)] hover:text-[color:var(--blood)]"
                          onClick={() => {
                            setPresentKeys((current) => current.filter((item) => item !== key));
                            if (activeCharKey === key) setActiveCharKey(ALL_ACTIVE);
                          }}
                          aria-label="移出场"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })
                ) : (
                  <span className="text-[0.68rem] text-[color:var(--ember-400)]">未选择在场角色 —— 请先在右侧选择角色</span>
                )}
              </div>

              {/* 消息流 */}
              <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                {messages.length === 0 ? (
                  <div className="grid h-full place-items-center">
                    <EmptyState
                      title={conversationId ? "会谈已开始" : "还没有进行中的会谈"}
                      hint={conversationId ? "向在场角色提出问题，他们会按自己的性格与目标回应。" : "点击右上角「开启新会谈」，选择在场角色与场景。"}
                      icon={<Users size={22} />}
                    />
                  </div>
                ) : (
                  messages.map((message, index) => {
                    const isPlayer = message.role === "player";
                    const isNarrator = message.role === "narrator";
                    const structured = message.structured ?? null;
                    const action = structured ? String(structured.action ?? "") : "";
                    return (
                      <div key={message.id ?? `live-${index}`} className={cn("flex gap-2", isPlayer && "flex-row-reverse")}>
                        {!isNarrator ? (
                          <Avatar src={message.avatarUrl ?? null} name={message.speakerName} rarity={(message.rarity as "R" | "SR" | "SSR") ?? "R"} size={34} className="mt-0.5 shrink-0" />
                        ) : null}
                        <div className={cn("max-w-[78%] rounded-sm border p-2.5", isPlayer ? "border-[color:var(--gold-600)]/50 bg-[color:var(--ink-800)]/85" : isNarrator ? "border-[color:var(--aether-500)]/40 bg-[color:var(--ink-900)]/75" : "border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/60")}>
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <span className="text-[0.68rem] text-[color:var(--gold-300)]">{message.speakerName}</span>
                            {message.rarity ? <RarityBadge rarity={message.rarity as "R" | "SR" | "SSR"} /> : null}
                            {!isPlayer && message.source === "fallback" ? <Tag tone="neutral">兜底文本</Tag> : null}
                            {!isPlayer && message.source === "ai" ? <Tag tone="aether">AI</Tag> : null}
                            {action && ACTION_LABEL[action] && action !== "speak" ? <Tag tone="gold">{ACTION_LABEL[action]}</Tag> : null}
                            {structured && Number(structured.bondDelta ?? 0) > 0 ? <Tag tone="good">羁绊 +{Number(structured.bondDelta)}</Tag> : null}
                            <span className="ml-auto text-[0.58rem] text-[color:var(--parchment-muted)]">
                              {message.createdAt ? new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : ""}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--parchment-dim)]">{message.content}</p>
                          {structured && structured.targetCharKey ? (
                            <p className="mt-1 text-[0.62rem] text-[color:var(--aether-300)]">回应：{characters.find((item) => item.charKey === String(structured.targetCharKey))?.name ?? String(structured.targetCharKey)}</p>
                          ) : null}
                          {structured && structured.suggestedAction ? (
                            <p className="mt-1 text-[0.62rem] text-[color:var(--parchment-muted)]">建议行动：{String(structured.suggestedAction)}</p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* 输入区 */}
              <div className="mt-3 space-y-2">
                {violations.length > 0 ? (
                  <div className="rounded-sm border border-[color:var(--ember-600)]/60 bg-[color:var(--ink-900)]/90 p-2 text-[0.66rem] text-[color:var(--ember-400)]">
                    <p className="mb-1 flex items-center gap-1.5">
                      <AlertTriangle size={12} />
                      以下模型输出被服务端拒绝（未知角色 ID / 越界设定 / 内容不合规 / 结构错误）：
                    </p>
                    {violations.map((violation, index) => (
                      <p key={index}>· [{violation.code}] {violation.detail}</p>
                    ))}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder={hasPresence ? "向在场角色提问，例如：南墙的修缮应该先动哪里？" : "请先选择在场角色"}
                    disabled={!conversationId || !hasPresence || talk.isPending}
                    rows={2}
                    maxLength={500}
                    className="min-h-[44px] resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-950)]/85 text-sm text-[color:var(--parchment)]"
                  />
                  <Button
                    className="btn-gold shrink-0 border-transparent text-[color:var(--ink-950)]"
                    disabled={!conversationId || !hasPresence || !input.trim() || talk.isPending}
                    onClick={() => talk.mutate({ conversationId: conversationId!, message: input.trim(), activeCharKey: activeCharKey === ALL_ACTIVE ? null : activeCharKey, presentKeys })}
                  >
                    {talk.isPending ? "发言中…" : (<><Send size={14} className="mr-1" />发言</>)}
                  </Button>
                </div>
                {activeCharacter ? (
                  <p className="text-[0.66rem] text-[color:var(--parchment-muted)]">
                    当前点名：<span className="text-[color:var(--gold-300)]">{activeCharacter.name}</span>（{activeCharacter.title}）优先回应；在场其他角色仍可插话或保持沉默。
                  </p>
                ) : (
                  <p className="text-[0.66rem] text-[color:var(--parchment-muted)]">未点名时，由在场角色自行决定谁先开口——也允许他们保持沉默。</p>
                )}
              </div>
            </div>
          </Panel>

          <div className="grid gap-2 sm:grid-cols-2">
            <Panel className="p-3">
              <div className="text-caption mb-1.5">互动规则（服务端强制）</div>
              <ul className="space-y-1 text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">
                <li>· 只有「在场角色」会被写入提示词；未选中角色不会发言或行动。</li>
                <li>· 模型必须返回结构化 JSON；角色 ID 逐一校验，未知 ID 的发言直接被拒绝。</li>
                <li>· 角色身份、阵营与性格由后台配置，AI 无法改写。</li>
                <li>· 角色可选择发言、沉默、行动或回应其他在场角色。</li>
                <li>· 无在场角色时，界面不会发起任何 AI 调用。</li>
              </ul>
            </Panel>
            <Panel className="p-3">
              <div className="text-caption mb-1.5">羁绊与剧情联动</div>
              <p className="text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">
                每次有效会谈都会推进「与同伴交谈」类任务并按角色的 bondDelta 增加羁绊经验。角色的当前剧情状态（章节、支线标记、羁绊等级）会一并传给模型，同一个角色在故事前后会有不同的态度与措辞。
              </p>
              <AllAgesNote className="mt-2" />
            </Panel>
          </div>
        </div>

        {/* 侧栏 */}
        <div className="space-y-3">
          <Panel>
            <SectionTitle eyebrow="Present" title="可选在场角色" action={<span className="text-[0.66rem] text-[color:var(--parchment-muted)]">最多 4 人</span>} />
            <GoldRule />
            {characters.length === 0 ? (
              <EmptyState
                title="名册为空"
                hint="先在「招募」中获得伙伴，才能与他们交谈。"
                icon={<Users size={20} />}
                action={<Link href="/recruit"><Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]">去招募</Button></Link>}
              />
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {characters.map((character) => {
                  const selected = presentKeys.includes(character.charKey);
                  return (
                    <button
                      key={character.charKey}
                      onClick={() =>
                        setPresentKeys((current) => {
                          if (current.includes(character.charKey)) {
                            if (activeCharKey === character.charKey) setActiveCharKey(ALL_ACTIVE);
                            return current.filter((key) => key !== character.charKey);
                          }
                          if (current.length >= 4) {
                            toast.warning("最多选择 4 名在场角色");
                            return current;
                          }
                          return [...current, character.charKey];
                        })
                      }
                      className={cn(
                        "card-tap relative rounded-sm border p-1.5 text-center",
                        selected ? "border-[color:var(--gold-300)] bg-[color:var(--ink-700)]/70" : "border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/40 hover:border-[color:var(--gold-600)]/60",
                      )}
                    >
                      <Avatar src={character.avatarUrl} name={character.name} rarity={character.rarity as "R" | "SR" | "SSR"} size={40} className="mx-auto" />
                      <span className="mt-1 block truncate text-[0.62rem] text-[color:var(--parchment-dim)]">{character.name}</span>
                      <span className="block text-[0.56rem] text-[color:var(--parchment-muted)]">羁绊 {character.bondLevel}</span>
                      {selected ? <Check size={11} className="absolute right-1 top-1 text-[color:var(--gold-300)]" /> : null}
                    </button>
                  );
                })}
              </div>
            )}
            {characters.length > 0 ? (
              <>
                <GoldRule />
                <div className="space-y-2">
                  <div className="text-caption">点名回应者</div>
                  <Select value={activeCharKey} onValueChange={setActiveCharKey}>
                    <SelectTrigger className="h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                      <SelectValue placeholder="不点名" />
                    </SelectTrigger>
                    <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                      <SelectItem value={ALL_ACTIVE}>不点名（角色自行决定）</SelectItem>
                      {presentKeys.map((key) => {
                        const character = characters.find((item) => item.charKey === key);
                        if (!character) return null;
                        return <SelectItem key={key} value={key}>{character.name}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                  <div className="text-caption">场景</div>
                  <Select value={scene} onValueChange={(value) => setScene(value as SceneKey)}>
                    <SelectTrigger className="h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                      {castData.scenes.map((item) => (
                        <SelectItem key={item.sceneKey} value={item.sceneKey}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    className="btn-gold w-full border-transparent text-[color:var(--ink-950)]"
                    disabled={!hasPresence || openConversation.isPending}
                    onClick={() => openConversation.mutate({ scene, presentKeys })}
                  >
                    <Sparkles size={13} className="mr-1" />
                    {conversationId ? "以此配置开启新会谈" : "开启会谈"}
                  </Button>
                </div>
              </>
            ) : null}
          </Panel>

          <Panel>
            <SectionTitle eyebrow="History" title="历次会谈" />
            <GoldRule />
            {(castData.conversations ?? []).length === 0 ? (
              <EmptyState title="暂无会谈记录" icon={<MessageSquarePlus size={20} />} />
            ) : (
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {(castData.conversations ?? []).map((row) => (
                  <button
                    key={row.conversationId}
                    onClick={() => setConversationId(row.conversationId)}
                    className={cn(
                      "card-tap w-full rounded-sm border p-2 text-left",
                      conversationId === row.conversationId ? "border-[color:var(--gold-300)] bg-[color:var(--ink-700)]/70" : "border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/40 hover:border-[color:var(--gold-600)]/60",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-[color:var(--parchment)]">{row.title}</span>
                      <span className="shrink-0 text-[0.58rem] text-[color:var(--parchment-muted)]">{row.turnCount} 轮</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[0.58rem] text-[color:var(--parchment-muted)]">
                      <span>{row.sceneLabel}</span>
                      <span>· {new Date(row.updatedAt as unknown as string).toLocaleDateString("zh-CN")}</span>
                      {row.status === "closed" ? <Tag tone="neutral">已结束</Tag> : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel className="p-3">
            <div className="text-caption mb-1.5">AI 配置来源</div>
            <p className="text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">
              当前使用：<span className="text-[color:var(--gold-300)]">{castData.aiConfigured.name}</span>
              {castData.aiConfigured.model ? `（${castData.aiConfigured.model}）` : ""}
              <br />
              模型、Base URL、密钥与校验策略全部由 GM 后台统一配置，客户端无法覆盖。API 密钥不会下发到浏览器。
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-[0.66rem] text-[color:var(--aether-300)]">
              <AetherRune size={12} />
              {castData.contentNote}
            </p>
          </Panel>
        </div>
      </div>

      {/* 开启会谈弹窗 */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">开启一次议事厅会谈</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">
              选择 1-4 名在场角色。只有被选中的角色会被提供给 AI，其他角色不会发言。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[45vh] overflow-y-auto">
            {characters.length === 0 ? (
              <EmptyState title="名册为空" hint="先去招募伙伴吧。" />
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {characters.map((character) => {
                  const selected = presentKeys.includes(character.charKey);
                  return (
                    <button
                      key={character.charKey}
                      className={cn(
                        "card-tap rounded-sm border p-2 text-center",
                        selected ? "border-[color:var(--gold-300)] bg-[color:var(--ink-700)]/70" : "border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/40",
                      )}
                      onClick={() =>
                        setPresentKeys((current) => {
                          if (current.includes(character.charKey)) return current.filter((key) => key !== character.charKey);
                          if (current.length >= 4) {
                            toast.warning("最多选择 4 名在场角色");
                            return current;
                          }
                          return [...current, character.charKey];
                        })
                      }
                    >
                      <Avatar src={character.avatarUrl} name={character.name} rarity={character.rarity as "R" | "SR" | "SSR"} size={42} className="mx-auto" />
                      <span className="mt-1 block truncate text-[0.66rem] text-[color:var(--parchment-dim)]">{character.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="text-caption">场景</div>
            <Select value={scene} onValueChange={(value) => setScene(value as SceneKey)}>
              <SelectTrigger className="h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                {castData.scenes.map((item) => (
                  <SelectItem key={item.sceneKey} value={item.sceneKey}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="btn-gold w-full border-transparent text-[color:var(--ink-950)]"
            disabled={!hasPresence || openConversation.isPending}
            onClick={() => openConversation.mutate({ scene, presentKeys })}
          >
            {openConversation.isPending ? "创建中…" : `开启会谈（在场 ${presentKeys.length} 人）`}
          </Button>
        </DialogContent>
      </Dialog>
    </PageSection>
  );
}
