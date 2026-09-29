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
import { AlertTriangle, Check, MessageSquarePlus, Send, Sparkles, Trash2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { usePlayerName } from "@/hooks/usePlayerName";
import { PageMusic } from "@/components/game/PageMusic";
import { PageSection } from "@/components/game/GameShell";
import { TutorialSkip, TutorialSpotlight } from "@/components/tutorial/TutorialGuide";
import { Avatar, EmptyState, ErrorState, GoldRule, Panel, RarityBadge, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";

const COUNCIL_SCENE = "/aetherfall-assets/council_d4b84b1c.jpg";
const ALL_ACTIVE = "__auto__";
const RECENT_TURN_LIMIT = 5;

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

function groupMessagesByTurn(messages: MessageView[]) {
  const turns: MessageView[][] = [];
  let current: MessageView[] = [];
  for (const message of messages) {
    if (message.role === "player" && current.length > 0) {
      turns.push(current);
      current = [];
    }
    current.push(message);
  }
  if (current.length > 0) turns.push(current);
  return turns;
}

export default function Council() {
  const utils = trpc.useUtils();
  const cast = trpc.ai.cast.useQuery();
  const leadership = trpc.leadership.state.useQuery();
  const onboarding = trpc.meta.onboarding.useQuery();
  const playerName = usePlayerName();

  const [conversationId, setConversationId] = useState<number | null>(null);
  const [presentKeys, setPresentKeys] = useState<string[]>([]);
  const [activeCharKey, setActiveCharKey] = useState<string>(ALL_ACTIVE);
  type SceneKey = "council" | "campfire" | "debate" | "banquet";
const [scene, setScene] = useState<SceneKey>("council");
  const [input, setInput] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [liveMessages, setLiveMessages] = useState<MessageView[]>([]);
  const [violations, setViolations] = useState<Array<{ code: string; detail: string }>>([]);
  const [olderTurnsOpen, setOlderTurnsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const tutorialCouncil = onboarding.data?.currentKey === "council_talk";
  useEffect(() => {
    if (!tutorialCouncil || !cast.data || presentKeys.length > 0) return;
    const recommended = cast.data.characters.filter((item) => ["adrian", "greta"].includes(item.charKey)).slice(0, 2).map((item) => item.charKey);
    setPresentKeys(recommended.length > 0 ? recommended : cast.data.characters.slice(0, 2).map((item) => item.charKey));
    setInput("灰隼堡接下来最应该优先修复什么？");
  }, [cast.data, presentKeys.length, tutorialCouncil]);

  const conversation = trpc.ai.conversation.useQuery({ conversationId: conversationId ?? 0 }, { enabled: Boolean(conversationId) });

  const upgradeLeadership = trpc.leadership.upgrade.useMutation({
    onSuccess: async (result) => {
      toast.success("统御能力已提升", { description: `消耗 ${result.cost} 点领袖力，当前等级 ${result.level}` });
      await leadership.refetch();
    },
    onError: (error) => toast.error("学习失败", { description: error.message }),
  });

  const equipLeadership = trpc.leadership.equip.useMutation({
    onSuccess: async () => {
      toast.success("战术指令配置已保存");
      await leadership.refetch();
    },
    onError: (error) => toast.error("配置失败", { description: error.message }),
  });

  const openConversation = trpc.ai.openConversation.useMutation({
    onSuccess: async (result) => {
      setConversationId(result.conversationId);
      setLiveMessages([]);
      setViolations([]);
      setOlderTurnsOpen(false);
      setPickerOpen(false);
      toast.success("已开启一次议事厅会谈");
      await utils.ai.cast.invalidate();
    },
    onError: (error) => toast.error("创建会话失败", { description: error.message }),
  });

  const talk = trpc.ai.talk.useMutation({
    onSuccess: async (result, variables) => {
      const turns = (result.turns ?? []) as Array<Record<string, unknown>>;
      const messages: MessageView[] = [
        {
          role: "player",
          speakerName: "领主",
          content: variables.message,
          source: "system",
          createdAt: new Date(),
        },
        ...turns.map((turn) => ({
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
        })),
      ];
      if (result.narration) {
        messages.push({ role: "narrator", speakerName: "旁白", content: result.narration, source: "system" });
      }
      setLiveMessages((current) => [...current, ...messages]);
      setViolations(result.violations ?? []);
      setInput("");
      if (result.status === "no_present_characters") toast.warning("尚未选择在场角色", { description: result.narration ?? undefined });
      else if (result.status !== "ok") toast.warning("本次回复使用兜底内容", { description: "模型输出未通过格式或内容校验，已由本地规则接管。" });
      await Promise.all([
        utils.ai.conversation.invalidate({ conversationId: variables.conversationId }),
        utils.ai.latest.invalidate(),
        utils.ai.cast.invalidate(),
        utils.keep.quests.invalidate(),
        utils.leadership.state.invalidate(),
        utils.meta.onboarding.invalidate(),
      ]);
      if (result.leaderReward?.awarded) {
        toast.success(`有效议事 · 领袖力 +${result.leaderReward.amount}`, { description: `今日议事奖励 ${result.leaderReward.rewarded}/5` });
      }
      // 查询已刷新为服务端完整记录，清除临时消息，避免随后切换会谈时重复显示。
      setLiveMessages([]);
    },
    onError: (error) => toast.error("发言失败", { description: error.message }),
  });

  const closeConversation = trpc.ai.closeConversation.useMutation({
    onSuccess: async (_result, variables) => {
      toast.info("会谈已结束");
      await Promise.all([
        utils.ai.cast.invalidate(),
        utils.ai.conversation.invalidate({ conversationId: variables.conversationId }),
      ]);
    },
    onError: (error) => toast.error("操作失败", { description: error.message }),
  });

  const deleteConversation = trpc.ai.deleteConversation.useMutation({
    onSuccess: async (_result, variables) => {
      if (conversationId === variables.conversationId) {
        setConversationId(null);
        setLiveMessages([]);
        setViolations([]);
      }
      toast.success("会谈记录已删除");
      await Promise.all([
        utils.ai.cast.invalidate(),
        utils.ai.conversation.invalidate({ conversationId: variables.conversationId }),
        utils.ai.latest.invalidate(),
      ]);
    },
    onError: (error) => toast.error("删除会谈失败", { description: error.message }),
  });

  const characters = useMemo(() => cast.data?.characters ?? [], [cast.data]);
  const hasPresence = presentKeys.length > 0;
  const isConversationOpen = Boolean(conversationId && conversation.data?.status === "open");
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
    setOlderTurnsOpen(false);
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
  const messageTurns = useMemo(() => groupMessagesByTurn(messages), [messages]);
  const olderTurnCount = Math.max(0, messageTurns.length - RECENT_TURN_LIMIT);
  const olderMessages = useMemo(() => messageTurns.slice(0, olderTurnCount).flat(), [messageTurns, olderTurnCount]);
  const recentMessages = useMemo(() => messageTurns.slice(-RECENT_TURN_LIMIT).flat(), [messageTurns]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  if (cast.isLoading) {
    return (
      <>
        <PageMusic src="/aetherfall-assets/council-theme.mp3" areaName="议事厅" />
        <PageSection title="议事厅">
          <SkeletonState rows={4} />
        </PageSection>
      </>
    );
  }

  if (cast.isError || !cast.data) {
    return (
      <>
        <PageMusic src="/aetherfall-assets/council-theme.mp3" areaName="议事厅" />
        <PageSection title="议事厅">
          <ErrorState message={cast.error?.message ?? "读取失败"} onRetry={() => cast.refetch()} />
        </PageSection>
      </>
    );
  }

  const castData = cast.data;
  const hasCouncilQuota = castData.councilQuota.remaining > 0;
  const canTalk = hasCouncilQuota || tutorialCouncil;
  const renderMessage = (message: MessageView, index: number, keyPrefix: string) => {
    const isPlayer = message.role === "player";
    const isNarrator = message.role === "narrator";
    const structured = message.structured ?? null;
    const action = structured ? String(structured.action ?? "") : "";
    return (
      <div key={message.id ?? [keyPrefix, index].join("-")} className={cn("flex gap-2", isPlayer && "flex-row-reverse")}>
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
  };

  return (
    <>
      <PageMusic src="/aetherfall-assets/council-theme.mp3" areaName="议事厅" />
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
      {tutorialCouncil ? (
        <TutorialSpotlight
          targetId={isConversationOpen ? "tutorial-council-send" : pickerOpen ? "tutorial-council-dialog-open" : "tutorial-council-open"}
          title={isConversationOpen ? "点击这里聊天" : "点击这里开始会谈"}
          description={isConversationOpen ? "问题已经为你填好，点击“发言”听取同伴意见。本次不消耗 AI 额度。" : "在场角色已经选好，先开启会谈。"}
        />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* 对话区 */}
        <div className="space-y-3">
          <Panel className="relative overflow-hidden p-0">
            <img src={COUNCIL_SCENE} alt="议事厅" className="absolute inset-0 h-full w-full object-cover opacity-30" onError={(event) => { event.currentTarget.style.display = "none"; }} />
            <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--ink-950)] via-[color:var(--ink-950)]/75 to-[color:var(--ink-950)]/40" />
            <div className="relative flex h-[58vh] min-h-[380px] flex-col p-4">
              <p className="mb-3 text-sm text-[color:var(--gold-300)]">{playerName}，议事厅已经备好，众人正在等候你的决定。</p>
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
                  <>
                    {olderTurnCount > 0 ? (
                      <Collapsible open={olderTurnsOpen} onOpenChange={setOlderTurnsOpen}>
                        <CollapsibleTrigger asChild>
                          <button className="w-full rounded-sm border border-[color:var(--ink-500)]/50 bg-[color:var(--ink-900)]/80 px-2.5 py-1.5 text-left text-[0.66rem] text-[color:var(--parchment-muted)] hover:border-[color:var(--gold-600)]/60">
                            {olderTurnsOpen ? "收起" : "展开"}早前 {olderTurnCount} 轮会谈
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-3 border-b border-[color:var(--ink-500)]/35 pb-3 pt-2">
                          {olderMessages.map((message, index) => renderMessage(message, index, "older"))}
                        </CollapsibleContent>
                      </Collapsible>
                    ) : null}
                    {recentMessages.map((message, index) => renderMessage(message, index, "recent"))}
                  </>
                )}
              </div>

              {/* 输入区 */}
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-[color:var(--aether-500)]/45 bg-[color:var(--ink-950)]/65 px-2.5 py-1.5 text-[0.66rem]">
                  {leadership.data?.unlocked ? <span className="flex items-center gap-1.5 text-[color:var(--aether-300)]"><Sparkles size={12} /> 领袖力 {leadership.data.leaderPower}</span> : <span className="text-[color:var(--parchment-muted)]">建造议事厅 1 级后可获得领袖力</span>}
                  <span className="text-[color:var(--parchment-muted)]">今日议事 {castData.councilQuota.used}/{castData.councilQuota.limit}</span>
                  {leadership.data?.unlocked ? <span className="text-[color:var(--parchment-muted)]">{leadership.data.daily.remaining > 0 ? `本次成功议事可得 +${leadership.data.daily.rewardPerMeeting}` : "今日领袖力奖励已领完"}</span> : null}
                </div>
                {violations.length > 0 ? (
                  <div className="rounded-sm border border-[color:var(--gold-600)]/55 bg-[color:var(--ink-900)]/90 p-2 text-[0.66rem] text-[color:var(--parchment-dim)]">
                    <p className="mb-1 flex items-center gap-1.5">
                      <AlertTriangle size={12} />
                      本次模型回复格式未通过校验，已自动改用本地叙事；详细诊断已记录在 GM 后台的「最近 AI 调用」。
                    </p>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <Textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder={hasPresence ? "向在场角色提问，例如：南墙的修缮应该先动哪里？" : "请先选择在场角色"}
                    disabled={!isConversationOpen || !hasPresence || !canTalk || talk.isPending}
                    rows={2}
                    maxLength={500}
                    className="min-h-[44px] resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-950)]/85 text-sm text-[color:var(--parchment)]"
                  />
                  <Button
                    id={tutorialCouncil && isConversationOpen ? "tutorial-council-send" : undefined}
                    className="btn-gold shrink-0 border-transparent text-[color:var(--ink-950)]"
                    disabled={!isConversationOpen || !hasPresence || !canTalk || !input.trim() || talk.isPending}
                    onClick={() => talk.mutate({ conversationId: conversationId!, message: input.trim(), activeCharKey: activeCharKey === ALL_ACTIVE ? null : activeCharKey, presentKeys, tutorialFallback: tutorialCouncil })}
                  >
                    {talk.isPending ? "发言中…" : !isConversationOpen ? "会谈已结束" : !canTalk ? "今日已用完" : (<><Send size={14} className="mr-1" />发言</>)}
                  </Button>
                </div>
                {conversationId && !isConversationOpen && !conversation.isLoading ? <p className="text-[0.66rem] text-[color:var(--parchment-muted)]">本次会谈已经结束；历史记录仍可查看，开启新会谈后才能继续发言。</p> : null}
                {tutorialCouncil ? <div className="flex items-center justify-between gap-2"><p className="text-[0.66rem] text-[color:var(--aether-300)]">本次将显示“本地角色回应”，不消耗外部 AI 额度。</p><TutorialSkip /></div> : null}
                {!hasCouncilQuota && !tutorialCouncil ? <p className="text-[0.66rem] text-[color:var(--danger-400)]">今日议事次数已用完，明日重置。{castData.councilQuota.membershipActive ? "" : "会员可获得更多会谈机会。"}</p> : null}
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

          <Panel>
            <SectionTitle
              eyebrow="Leadership"
              title="领主统御"
              action={leadership.data ? <span className="text-numeric text-xs text-[color:var(--gold-300)]">领袖力 {leadership.data.leaderPower}</span> : null}
            />
            <GoldRule />
            {leadership.isLoading ? (
              <p className="text-xs text-[color:var(--parchment-muted)]">统御档案读取中…</p>
            ) : leadership.data?.unlocked ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-[color:var(--aether-500)]/45 bg-[color:var(--ink-950)]/45 px-3 py-2 text-xs">
                  <span className="text-[color:var(--aether-300)]">每日议事奖励 {leadership.data.daily.rewarded}/{leadership.data.daily.limit}</span>
                  <span className="text-[color:var(--parchment-muted)]">每次有效议事 +{leadership.data.daily.rewardPerMeeting}，额外会谈不再增加领袖力</span>
                </div>

                <div>
                  <div className="text-caption mb-2">内政能力</div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {leadership.data.interior.map((skill) => {
                      const maxed = skill.level >= skill.maxLevel;
                      return (
                        <div key={skill.key} className="rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/50 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-[color:var(--parchment)]">{skill.name}</span>
                            <span className="text-numeric text-[0.66rem] text-[color:var(--gold-300)]">LV.{skill.level}/{skill.maxLevel}</span>
                          </div>
                          <p className="mt-1 min-h-9 text-[0.66rem] leading-relaxed text-[color:var(--parchment-muted)]">{skill.currentEffect ?? skill.description}</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 h-7 w-full border-[color:var(--gold-600)]/55 text-[0.66rem] text-[color:var(--gold-300)]"
                            disabled={maxed || upgradeLeadership.isPending || leadership.data.leaderPower < (skill.nextCost ?? 0)}
                            onClick={() => upgradeLeadership.mutate({ skillKey: skill.key })}
                          >
                            {maxed ? "已满级" : `${skill.level === 0 ? "学习" : "升级"}（${skill.nextCost}）`}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-caption">战术指令</span>
                    <span className="text-[0.66rem] text-[color:var(--parchment-muted)]">已装备 {leadership.data.loadout.length}/3 · 战斗中不占伙伴行动</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {leadership.data.tactics.map((skill) => {
                      const maxed = skill.level >= skill.maxLevel;
                      const equipped = leadership.data.loadout.includes(skill.key);
                      return (
                        <div key={skill.key} className={cn("rounded-sm border p-2.5", equipped ? "border-[color:var(--gold-300)]/70 bg-[color:var(--gold-600)]/10" : "border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/50")}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm text-[color:var(--parchment)]">{skill.name}</span>
                            <span className="text-numeric text-[0.66rem] text-[color:var(--gold-300)]">LV.{skill.level}/{skill.maxLevel}</span>
                          </div>
                          <p className="mt-1 text-[0.66rem] leading-relaxed text-[color:var(--parchment-muted)]">{skill.currentEffect ?? skill.description}</p>
                          <div className="mt-2 flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 flex-1 border-[color:var(--gold-600)]/55 text-[0.66rem] text-[color:var(--gold-300)]"
                              disabled={maxed || upgradeLeadership.isPending || leadership.data.leaderPower < (skill.nextCost ?? 0)}
                              onClick={() => upgradeLeadership.mutate({ skillKey: skill.key })}
                            >
                              {maxed ? "已满级" : `${skill.level === 0 ? "学习" : "升级"}（${skill.nextCost}）`}
                            </Button>
                            <Button
                              size="sm"
                              variant={equipped ? "default" : "outline"}
                              className={cn("h-7 flex-1 text-[0.66rem]", equipped && "btn-gold border-transparent text-[color:var(--ink-950)]")}
                              disabled={!skill.learned || equipLeadership.isPending}
                              onClick={() => {
                                const next = equipped
                                  ? leadership.data.loadout.filter((key) => key !== skill.key)
                                  : [...leadership.data.loadout, skill.key];
                                if (next.length > 3) {
                                  toast.warning("每场战斗最多装备 3 条领主指令");
                                  return;
                                }
                                equipLeadership.mutate({ loadout: next });
                              }}
                            >
                              {equipped ? "卸下" : "装备"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-[color:var(--parchment-muted)]">建造议事厅至 1 级后，可通过每日前 5 次有效会谈获得领袖力，并学习领主内政与战术能力。</p>
            )}
          </Panel>

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
                    id={tutorialCouncil && !isConversationOpen && !pickerOpen ? "tutorial-council-open" : undefined}
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
                  <div key={row.conversationId} className="relative">
                    <button
                      onClick={() => setConversationId(row.conversationId)}
                      className={cn(
                        "card-tap w-full rounded-sm border p-2 pr-8 text-left",
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
                    <button
                      className="absolute right-1.5 top-1.5 rounded-sm p-1 text-[color:var(--parchment-muted)] hover:bg-[color:var(--blood)]/15 hover:text-[color:var(--blood)]"
                      aria-label={`删除会谈：${row.title}`}
                      title="删除会谈"
                      disabled={deleteConversation.isPending || talk.isPending}
                      onClick={() => deleteConversation.mutate({ conversationId: row.conversationId })}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
            id={tutorialCouncil && pickerOpen ? "tutorial-council-dialog-open" : undefined}
            className="btn-gold w-full border-transparent text-[color:var(--ink-950)]"
            disabled={!hasPresence || openConversation.isPending}
            onClick={() => openConversation.mutate({ scene, presentKeys })}
          >
            {openConversation.isPending ? "创建中…" : `开启会谈（在场 ${presentKeys.length} 人）`}
          </Button>
        </DialogContent>
      </Dialog>
      </PageSection>
    </>
  );
}
