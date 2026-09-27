/**
 * 主城页（领地经营首页）
 * 布局：左侧领地插画与建筑热点（可点击升级），右侧议事厅待办 + 任务 + 队伍 + 事件
 * 目标：玩家进入游戏即可看到「当前目标」与「可执行行动」
 */
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Coins, Hammer, ScrollText, Swords, Timer, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { PageSection } from "@/components/game/GameShell";
import { RESOURCE_ICON, AetherRune, BuildingIcon } from "@/components/game/GameIcons";
import { AllAgesNote, Avatar, EmptyState, ErrorState, GoldRule, LoadingState, Panel, ProgressBar, RarityBadge, ResourcePill, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";

const KEEP_SCENE = "/aetherfall-assets/keep_home_34f36c55.jpg";

const BUILDING_CATEGORY_NAME: Record<string, string> = {
  economy: "经济",
  military: "军事",
  research: "研究",
  governance: "治理",
};

type BuildingView = {
  buildingKey: string;
  name: string;
  category: string;
  iconKey: string | null;
  level: number;
  maxLevel: number;
  upgradingTo: number | null;
  upgradeDoneAt: Date | string | null;
  status: string;
  nextLevel: number | null;
  nextCost: Record<string, number> | null;
  nextSeconds: number | null;
  nextUnlock: string | null;
  nextEffect: string | null;
  currentProduce: Record<string, number>;
  currentEffect: string | null;
  currentUnlock: string | null;
  description: string | null;
  hotspotX: number;
  hotspotY: number;
};

export default function Keep() {
  const utils = trpc.useUtils();
  const home = trpc.keep.home.useQuery(undefined, { refetchInterval: 90_000 });
  const quests = trpc.keep.quests.useQuery();
  const teams = trpc.keep.teams.useQuery();
  const onboarding = trpc.meta.onboarding.useQuery();

  const [selected, setSelected] = useState<BuildingView | null>(null);
  const [claimingQuest, setClaimingQuest] = useState<string | null>(null);

  const upgrade = trpc.keep.upgradeBuilding.useMutation({
    onSuccess: async (result) => {
      toast.success(`「${selected?.name ?? result.buildingKey}」已开始升级至 ${result.upgradingTo} 级`, {
        description: `预计 ${Math.max(1, Math.round(result.seconds / 60))} 分钟完成，可随时在议事厅结算。`,
      });
      setSelected(null);
      await Promise.all([utils.keep.home.invalidate(), utils.keep.quests.invalidate(), utils.meta.onboarding.invalidate(), utils.keep.resources.invalidate()]);
    },
    onError: (error) => toast.error("升级失败", { description: error.message }),
  });

  const settle = trpc.keep.settleConstruction.useMutation({
    onSuccess: async (result) => {
      if (result.finished.length > 0) {
        toast.success(`施工完成：${result.finished.map((item) => `${item.buildingKey} → ${item.level} 级`).join("、")}`);
      } else {
        toast.info("暂时没有完成的施工");
      }
      await Promise.all([utils.keep.home.invalidate(), utils.keep.resources.invalidate()]);
    },
    onError: (error) => toast.error("结算失败", { description: error.message }),
  });

  const rollEvent = trpc.keep.rollEvent.useMutation({
    onSuccess: async (result) => {
      if (result.eventKey && !result.alreadyPending) toast.info("议事厅收到新的领地事件");
      else if (!result.eventKey) toast.info("暂时没有新的事件");
      await utils.keep.home.invalidate();
    },
    onError: (error) => toast.error("触发事件失败", { description: error.message }),
  });

  const resolveEvent = trpc.keep.resolveEvent.useMutation({
    onSuccess: async (result) => {
      toast.success("你的决定已经记录在案", { description: result.effect ? Object.entries(result.effect).map(([key, value]) => `${key} ${value > 0 ? "+" : ""}${value}`).join("、") : undefined });
      await Promise.all([utils.keep.home.invalidate(), utils.keep.resources.invalidate(), utils.keep.quests.invalidate()]);
    },
    onError: (error) => toast.error("处理事件失败", { description: error.message }),
  });

  const claimQuest = trpc.keep.claimQuest.useMutation({
    onMutate: (input) => setClaimingQuest(input.questKey),
    onSuccess: async (result) => {
      toast.success("奖励已入库", { description: result.rewards ? Object.entries(result.rewards).map(([key, value]) => `${key} +${value}`).join("、") : undefined });
      await Promise.all([utils.keep.home.invalidate(), utils.keep.quests.invalidate(), utils.keep.resources.invalidate()]);
    },
    onError: (error) => toast.error("领取失败", { description: error.message }),
    onSettled: () => setClaimingQuest(null),
  });

  const data = home.data;
  const goalText = useMemo(() => {
    const next = onboarding.data?.steps.find((step) => !step.done);
    return next ?? null;
  }, [onboarding.data]);

  if (home.isLoading) {
    return (
      <PageSection title="灰隼堡 · 主城">
        <SkeletonState rows={4} />
      </PageSection>
    );
  }

  if (home.isError || !data) {
    return (
      <PageSection title="灰隼堡 · 主城">
        <ErrorState message={home.error?.message ?? "主城数据读取失败"} onRetry={() => home.refetch()} />
      </PageSection>
    );
  }

  const activeTeam = teams.data?.find((team) => team.isActive) ?? teams.data?.[0];
  const cap = data.resources.cap;

  return (
    <PageSection title={`${data.lord.keepName} · 主城`} eyebrow={`第 ${data.lord.chapter} 章 · 领主 ${data.lord.name} · 城堡 ${data.lord.level} 级`}>
      {/* 当前目标条 */}
      <Panel gold className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-[color:var(--gold-600)]/60 bg-[color:var(--ink-950)] text-[color:var(--gold-500)]">
            <AetherRune size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-caption">当前目标</div>
            <p className="truncate text-sm font-medium text-[color:var(--parchment)]">{goalText ? goalText.label : "领地运转良好，继续扩张吧"}</p>
            {goalText?.hint ? <p className="truncate text-xs text-[color:var(--parchment-muted)]">{goalText.hint}</p> : null}
          </div>
          <div className="flex gap-2">
            {data.todos.length > 0 ? (
              <Link href="/world">
                <Button size="sm" variant="outline" className="border-[color:var(--gold-600)]/50 text-[color:var(--gold-300)]">
                  <Swords size={14} className="mr-1" />
                  出征
                </Button>
              </Link>
            ) : null}
            <Button size="sm" variant="outline" className="border-[color:var(--aether-500)]/50 text-[color:var(--aether-300)]" onClick={() => rollEvent.mutate()} disabled={rollEvent.isPending}>
              <Timer size={14} className="mr-1" />
              议事厅抽签
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.todos.length === 0 ? (
            <Tag tone="neutral">暂无待办：可以升级建筑、招募伙伴或远征</Tag>
          ) : (
            data.todos.map((todo) => (
              <Tag key={todo.id} tone={todo.tone === "gold" ? "gold" : todo.tone === "aether" ? "aether" : "danger"}>
                {todo.title}
              </Tag>
            ))
          )}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* 左：领地视图 */}
        <div className="space-y-4">
          <Panel className="overflow-hidden p-0">
            <div className="relative">
              <img src={KEEP_SCENE} alt="灰隼堡主城" className="h-56 w-full object-cover opacity-75 sm:h-72" onError={(event) => { event.currentTarget.style.display = "none"; }} />
              <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--ink-950)] via-[color:var(--ink-950)]/35 to-transparent" />
              {/* 建筑热点 */}
              {(data.buildings as BuildingView[]).map((building) => {
                const built = building.level > 0;
                return (
                  <button
                    key={building.buildingKey}
                    onClick={() => setSelected(building)}
                    className={cn(
                      "card-tap absolute -translate-x-1/2 -translate-y-1/2 rounded-sm border px-1.5 py-1 text-[0.62rem] backdrop-blur transition-colors",
                      built
                        ? "border-[color:var(--gold-600)]/70 bg-[color:var(--ink-950)]/85 text-[color:var(--gold-300)]"
                        : "border-[color:var(--ink-500)]/70 bg-[color:var(--ink-950)]/70 text-[color:var(--parchment-muted)]",
                    )}
                    style={{ left: `${building.hotspotX}%`, top: `${building.hotspotY}%` }}
                    title={`${building.name}${built ? ` LV.${building.level}` : "（未建造）"}`}
                  >
                    {building.name}
                    <span className="ml-1 text-numeric">{built ? building.level : "+"}</span>
                    {building.upgradingTo ? <span className="ml-1 text-[color:var(--aether-300)]">施工中</span> : null}
                  </button>
                );
              })}
              <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <div className="text-caption">领地</div>
                  <div className="text-display text-lg text-[color:var(--parchment)]">{data.lord.keepName}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ResourcePill kind="stamina" value={data.resources.stamina} suffix={`/${data.resources.staminaMax}`} />
                  <ResourcePill kind="renown" value={data.resources.renown} />
                </div>
              </div>
            </div>
            <div className="p-4">
              <SectionTitle
                eyebrow="Buildings"
                title="领地建筑"
                action={
                  <Button size="sm" variant="outline" className="border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]" onClick={() => settle.mutate()} disabled={settle.isPending}>
                    <Timer size={13} className="mr-1" />
                    结算施工
                  </Button>
                }
              />
              <GoldRule />
              <div className="grid gap-2 sm:grid-cols-2">
                {(data.buildings as BuildingView[]).map((building) => {
                  const built = building.level > 0;
                  const building_ = building;
                  return (
                    <button
                      key={building.buildingKey}
                      onClick={() => setSelected(building_)}
                      className="card-tap card-lift flex items-center gap-3 rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/60 p-2.5 text-left hover:border-[color:var(--gold-600)]/60"
                    >
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-sm border", built ? "border-[color:var(--gold-600)]/60 text-[color:var(--gold-400)]" : "border-[color:var(--ink-500)]/60 text-[color:var(--parchment-muted)]")}>
                        <BuildingIcon size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-[color:var(--parchment)]">{building.name}</span>
                          <span className="text-numeric text-xs text-[color:var(--gold-300)]">{built ? `LV.${building.level}` : "未建造"}</span>
                        </span>
                        <span className="mt-1 block">
                          <ProgressBar value={building.level} max={building.maxLevel} height={5} tone={built ? "gold" : "aether"} />
                        </span>
                        <span className="mt-1 flex items-center gap-2 text-[0.66rem] text-[color:var(--parchment-muted)]">
                          <span>{BUILDING_CATEGORY_NAME[building.category] ?? building.category}</span>
                          {building.upgradingTo ? <span className="text-[color:var(--aether-300)]">→ {building.upgradingTo} 级施工中</span> : null}
                          {!built && building.nextCost ? <span>需 {Object.entries(building.nextCost).filter(([, v]) => v > 0).slice(0, 2).map(([k, v]) => `${k} ${v}`).join(" · ")}</span> : null}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Panel>

          {/* 队伍 */}
          <Panel>
            <SectionTitle
              eyebrow="Expedition"
              title="远征队"
              action={
                <Link href="/roster">
                  <Button size="sm" variant="outline" className="border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]">
                    <Users size={13} className="mr-1" />
                    编成
                  </Button>
                </Link>
              }
            />
            <GoldRule />
            {activeTeam && activeTeam.members.length > 0 ? (
              <>
                <div className="mb-3 flex items-center justify-between text-xs text-[color:var(--parchment-muted)]">
                  <span>{activeTeam.name} · {activeTeam.members.length} 人</span>
                  <span className="text-numeric text-[color:var(--gold-300)]">战力 {activeTeam.power.toLocaleString("zh-CN")}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {activeTeam.members.filter((member): member is NonNullable<typeof member> => Boolean(member)).map((member) => (
                    <Link key={member.playerCharId} href={`/character/${member.charKey}`} className="card-tap card-lift rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/60 p-2 text-center">
                      <Avatar src={member.avatarUrl ?? data.roster.find((row) => row.charKey === member.charKey)?.avatarUrl ?? null} name={member.name} rarity={member.rarity as "R" | "SR" | "SSR"} size={48} className="mx-auto" />
                      <div className="mt-1.5 truncate text-xs text-[color:var(--parchment)]">{member.name}</div>
                      <div className="text-[0.62rem] text-[color:var(--parchment-muted)]">
                        LV.{member.level} · {member.row === "front" ? "前排" : "后排"}
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState
                title="还没有编成远征队"
                hint="前往「同伴」选择最多 4 名角色上阵，前排承担更多伤害。"
                icon={<Users size={22} />}
                action={
                  <Link href="/roster">
                    <Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]">去编成</Button>
                  </Link>
                }
              />
            )}
          </Panel>
        </div>

        {/* 右：待办 / 任务 / 事件 */}
        <div className="space-y-4">
          {/* 领地产出 */}
          <Panel>
            <SectionTitle eyebrow="Domain" title="领地资源" />
            <GoldRule />
            {Object.keys(data.accrual.gains).length > 0 ? (
              <p className="mb-3 text-xs text-[color:var(--parchment-muted)]">
                离线 {Math.round(data.accrual.secondsElapsed / 60)} 分钟期间产出：
                <span className="text-[color:var(--verdant)]">
                  {Object.entries(data.accrual.gains).map(([key, value]) => `${key} +${value}`).join("、")}
                </span>
              </p>
            ) : (
              <p className="mb-3 text-xs text-[color:var(--parchment-muted)]">提升建筑等级可提高每小时产出与资源上限。</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {(["gold", "food", "wood", "iron", "aether", "renown"] as const).map((key) => {
                const Icon = RESOURCE_ICON[key];
                const value = Number((data.resources as unknown as Record<string, number>)[key] ?? 0);
                const isCapped = cap > 0 && value >= cap && key !== "renown";
                return (
                  <div key={key} className="rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/60 p-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-[color:var(--parchment-dim)]">
                        <Icon size={13} className={key === "aether" ? "text-[color:var(--aether-300)]" : "text-[color:var(--gold-500)]"} />
                        {key}
                      </span>
                      <span className={cn("text-numeric", isCapped ? "text-[color:var(--ember-400)]" : "text-[color:var(--parchment)]")}>{value.toLocaleString("zh-CN")}</span>
                    </div>
                    {key !== "renown" ? <ProgressBar className="mt-1.5" value={value} max={cap} height={4} tone={isCapped ? "ember" : "gold"} /> : null}
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[0.66rem] text-[color:var(--parchment-muted)]">资源上限 {cap.toLocaleString("zh-CN")}（提升城墙与市场可提高上限）</p>
          </Panel>

          {/* 领地事件 */}
          {data.pendingEvent ? (
            <Panel gold>
              <SectionTitle eyebrow="Domain Event" title={data.pendingEvent.title} />
              <GoldRule />
              <p className="text-sm leading-relaxed text-[color:var(--parchment-dim)]">{data.pendingEvent.description}</p>
              <div className="mt-3 space-y-2">
                {((data.pendingEvent.choices ?? []) as Array<{ label?: string; effect?: Record<string, number> }>).map((choice, index) => (
                  <button
                    key={index}
                    className="card-tap w-full rounded-sm border border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 px-3 py-2 text-left text-sm hover:border-[color:var(--gold-600)]/70"
                    onClick={() => resolveEvent.mutate({ eventKey: data.pendingEvent!.eventKey, choiceIndex: index })}
                    disabled={resolveEvent.isPending}
                  >
                    <span className="block text-[color:var(--parchment)]">{choice.label ?? `选项 ${index + 1}`}</span>
                    {choice.effect ? (
                      <span className="mt-0.5 block text-[0.68rem] text-[color:var(--parchment-muted)]">
                        {Object.entries(choice.effect).map(([key, value]) => `${key} ${value > 0 ? "+" : ""}${value}`).join(" · ")}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </Panel>
          ) : null}

          {/* 任务 */}
          <Panel>
            <SectionTitle eyebrow="Quests" title="任务与目标" action={<Link href="/world"><Button size="sm" variant="ghost" className="text-[color:var(--parchment-muted)]">远征 <ArrowRight size={13} className="ml-1" /></Button></Link>} />
            <GoldRule />
            {quests.isLoading ? (
              <LoadingState label="读取任务…" />
            ) : quests.isError ? (
              <ErrorState message={quests.error?.message} onRetry={() => quests.refetch()} />
            ) : (quests.data ?? []).length === 0 ? (
              <EmptyState title="暂无任务" hint="推进章节后会解锁新的主线与支线。" icon={<ScrollText size={20} />} />
            ) : (
              <div className="space-y-2">
                {(quests.data ?? [])
                  .filter((quest) => quest.status === "active" || quest.status === "completed")
                  .slice(0, 6)
                  .map((quest) => {
                    const done = quest.objectives.filter((objective) => objective.done).length;
                    const allDone = done === quest.objectives.length && quest.objectives.length > 0;
                    return (
                      <div key={quest.questKey} className="rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/55 p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm text-[color:var(--parchment)]">{quest.name}</span>
                              <Tag tone={quest.questType === "main" ? "gold" : quest.questType === "side" ? "aether" : "neutral"}>
                                {quest.questType === "main" ? "主线" : quest.questType === "side" ? "支线" : "日常"}
                              </Tag>
                            </div>
                            <div className="mt-0.5 text-[0.66rem] text-[color:var(--parchment-muted)]">第 {quest.chapter} 章 · 进度 {done}/{quest.objectives.length}</div>
                          </div>
                          {quest.status === "completed" ? (
                            <Button size="sm" className="btn-gold h-7 border-transparent px-2 text-[0.68rem] text-[color:var(--ink-950)]" onClick={() => claimQuest.mutate({ questKey: quest.questKey })} disabled={claimingQuest === quest.questKey}>
                              {claimingQuest === quest.questKey ? "领取中…" : "领取"}
                            </Button>
                          ) : quest.status === "claimed" ? (
                            <span className="flex items-center gap-1 text-[0.68rem] text-[color:var(--verdant)]">
                              <CheckCircle2 size={13} />
                              已领取
                            </span>
                          ) : (
                            <span className="text-[0.68rem] text-[color:var(--parchment-muted)]">{allDone ? "可领取" : "进行中"}</span>
                          )}
                        </div>
                        <div className="mt-2 space-y-1">
                          {quest.objectives.map((objective, index) => (
                            <div key={index} className="flex items-center justify-between text-[0.68rem]">
                              <span className={objective.done ? "text-[color:var(--verdant)]" : "text-[color:var(--parchment-muted)]"}>{objective.label}</span>
                              <span className="text-numeric text-[color:var(--parchment-dim)]">
                                {objective.current}/{objective.target}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </Panel>

          {/* 区域进度 */}
          <Panel>
            <SectionTitle eyebrow="Conquest" title="区域控制度" action={<Link href="/world"><Button size="sm" variant="ghost" className="text-[color:var(--parchment-muted)]">地图 <ArrowRight size={13} className="ml-1" /></Button></Link>} />
            <GoldRule />
            <div className="space-y-2">
              {data.regions.map((region) => (
                <div key={region.regionKey} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-xs text-[color:var(--parchment-dim)]">{region.name}</span>
                  <span className="min-w-0 flex-1">
                    <ProgressBar value={region.controlPercent} max={100} height={6} tone={region.unlocked ? "gold" : "aether"} />
                  </span>
                  <span className="text-numeric w-10 shrink-0 text-right text-xs text-[color:var(--parchment-muted)]">{region.controlPercent}%</span>
                  {!region.unlocked ? <Tag tone="neutral">未解锁</Tag> : null}
                </div>
              ))}
            </div>
          </Panel>

          <AllAgesNote />
        </div>
      </div>

      {/* 建筑详情弹窗 */}
      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-lg">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-display flex items-center gap-2 text-[color:var(--parchment)]">
                  <BuildingIcon size={18} className="text-[color:var(--gold-500)]" />
                  {selected.name}
                  <span className="text-numeric text-sm text-[color:var(--gold-300)]">LV.{selected.level}/{selected.maxLevel}</span>
                </DialogTitle>
                <DialogDescription className="text-[color:var(--parchment-muted)]">{selected.description ?? "领地建筑"}</DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                {selected.upgradingTo ? (
                  <div className="rounded-sm border border-[color:var(--aether-500)]/50 bg-[color:var(--ink-800)]/60 p-2.5 text-xs text-[color:var(--aether-300)]">
                    正在施工：目标 {selected.upgradingTo} 级
                    {selected.upgradeDoneAt ? `（预计 ${new Date(selected.upgradeDoneAt).toLocaleString("zh-CN")} 完成）` : ""}
                  </div>
                ) : null}

                {selected.nextLevel && selected.nextCost ? (
                  <>
                    <div>
                      <div className="text-caption mb-1">升级至 {selected.nextLevel} 级所需</div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(selected.nextCost)
                          .filter(([, value]) => Number(value) > 0)
                          .map(([key, value]) => {
                            const owned = Number((data.resources as unknown as Record<string, number>)[key] ?? 0);
                            const enough = owned >= Number(value);
                            return (
                              <span
                                key={key}
                                className={cn("rounded-sm border px-2 py-1 text-xs", enough ? "border-[color:var(--verdant)]/50 text-[color:var(--verdant)]" : "border-[color:var(--blood)]/50 text-[color:var(--blood)]")}
                              >
                                {key} {Number(value).toLocaleString("zh-CN")} / 持有 {owned.toLocaleString("zh-CN")}
                              </span>
                            );
                          })}
                      </div>
                    </div>
                    {selected.nextSeconds ? (
                      <p className="text-xs text-[color:var(--parchment-dim)]">
                        施工时长：约 {Math.max(1, Math.round(selected.nextSeconds / 60))} 分钟（可立即建造跳过等待）
                      </p>
                    ) : null}
                    {selected.nextUnlock ? <p className="text-xs text-[color:var(--gold-300)]">解锁：{selected.nextUnlock}</p> : null}
                    {selected.nextEffect ? <p className="text-xs text-[color:var(--parchment-dim)]">效果：{selected.nextEffect}</p> : null}
                  </>
                ) : (
                  <p className="text-xs text-[color:var(--parchment-muted)]">该建筑已达最高等级。</p>
                )}

                {Object.keys(selected.currentProduce ?? {}).length > 0 && selected.level > 0 ? (
                  <div>
                    <div className="text-caption mb-1">当前产出（每小时）</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(selected.currentProduce).map(([key, value]) => (
                        <ResourcePill key={key} kind={key} value={Number(value)} suffix="/h" />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <DialogFooter className="gap-2">
                <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setSelected(null)}>关闭</Button>
                <Button
                  className="btn-gold border-transparent text-[color:var(--ink-950)]"
                  disabled={upgrade.isPending || !selected.nextLevel}
                  onClick={() => upgrade.mutate({ buildingKey: selected.buildingKey, instant: true })}
                >
                  {upgrade.isPending ? "处理中…" : (
                    <>
                      <Hammer size={14} className="mr-1.5" />
                      立即建造（跳过等待）
                    </>
                  )}
                </Button>
              </DialogFooter>
              <p className="text-[0.66rem] leading-relaxed text-[color:var(--parchment-muted)]">
                立即建造不额外收费，仅节省等待时间——所有数值与产出均由服务端结算。
              </p>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageSection>
  );
}

void RarityBadge;
void Coins;
