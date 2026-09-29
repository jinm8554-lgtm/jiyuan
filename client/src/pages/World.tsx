/**
 * 世界地图页
 * 结构：手绘地图（区域蜡封 + 节点标记）+ 区域/节点详情面板 + 剧情场景播放
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { BookOpen, Crown, Lock, MapPin, Package, RefreshCw, ShieldAlert, Swords, Timer, TrendingUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { PageSection } from "@/components/game/GameShell";
import { TutorialSkip, TutorialSpotlight } from "@/components/tutorial/TutorialGuide";
import { AllAgesNote, EmptyState, ErrorState, GoldRule, Panel, ProgressBar, RarityBadge, resourceName, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";
import { ELEMENT_ICON, JOB_ICON } from "@/components/game/GameIcons";
import { PageMusic } from "@/components/game/PageMusic";
import { JOB_NAME } from "@/components/game/ui";

const WORLD_MAP_ART = "/aetherfall-assets/worldmap_72ac880b.jpg";

const NODE_TYPE_TONE: Record<string, "neutral" | "gold" | "aether" | "danger" | "good"> = {
  village: "good",
  town: "good",
  trade: "gold",
  fort: "aether",
  ruin: "danger",
  wild: "neutral",
  rift: "danger",
};

export default function World() {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const map = trpc.world.map.useQuery();
  const suggestions = trpc.world.suggestions.useQuery();
  const onboarding = trpc.meta.onboarding.useQuery();

  const [regionKey, setRegionKey] = useState<string | null>(null);
  const [nodeKey, setNodeKey] = useState<string | null>(null);
  const [sceneKey, setSceneKey] = useState<string | null>(null);
  const viewTutorialNode = trpc.world.viewTutorialNode.useMutation({ onSuccess: () => utils.meta.onboarding.invalidate() });

  const nodeDetail = trpc.world.node.useQuery({ nodeKey: nodeKey ?? "" }, { enabled: Boolean(nodeKey) });
  const scene = trpc.world.scene.useQuery({ sceneKey: sceneKey ?? "" }, { enabled: Boolean(sceneKey) });
  const chooseScene = trpc.world.chooseScene.useMutation({
    onSuccess: async (result) => {
      toast.success("抉择已收入档案", { description: result.reply ?? undefined });
      await Promise.all([utils.world.scene.invalidate(), utils.world.node.invalidate(), utils.world.map.invalidate(), utils.keep.home.invalidate(), utils.keep.quests.invalidate()]);
    },
    onError: (error) => toast.error("处理失败", { description: error.message }),
  });

  const toggleTrade = trpc.world.toggleTrade.useMutation({
    onSuccess: async (result) => {
      toast.success(result.tradeActive ? "商队已派出，收益按小时累积（最多累计 8 小时）" : "商队已召回", {
        description: result.rationCost ? `已备下 ${result.rationCost} 粮食作为首轮补给。` : undefined,
      });
      await Promise.all([utils.world.map.invalidate(), utils.world.region.invalidate()]);
    },
    onError: (error) => toast.error("操作失败", { description: error.message }),
  });

  const collectTrade = trpc.world.collectTrade.useMutation({
    onSuccess: async (result) => {
      if (result.hours <= 0) toast.info("暂时没有可收取的贸易收益");
      else toast.success(`收取 ${result.hours} 小时贸易收益`, { description: `${Object.entries(result.gains).map(([key, value]) => `${resourceName(key)} +${value}`).join("、")}${result.autoDispatched ? " · 新一轮商队已启程" : " · 商队已返回"}` });
      await Promise.all([utils.world.map.invalidate(), utils.keep.resources.invalidate()]);
    },
    onError: (error) => toast.error("收取失败", { description: error.message }),
  });

  const resetStamina = trpc.world.resetStamina.useMutation({
    onSuccess: async (result) => {
      toast.success(`体力已重置至 ${result.stamina}`, { description: `今日剩余 ${result.remaining} 次` });
      await Promise.all([utils.world.map.invalidate(), utils.keep.resources.invalidate(), utils.keep.home.invalidate()]);
    },
    onError: (error) => toast.error("体力重置失败", { description: error.message }),
  });

  const rushTrade = trpc.world.rushTrade.useMutation({
    onSuccess: async (result) => {
      const gains = Object.entries(result.gains).map(([key, value]) => `${resourceName(key)} +${value}`).join("、") || "暂无可结算资源";
      toast.success("已立即结算 8 小时商队收益", { description: `${gains}${result.autoDispatched ? " · 商队已自动续派" : " · 商队已返回"}` });
      await Promise.all([utils.world.map.invalidate(), utils.keep.resources.invalidate()]);
    },
    onError: (error) => toast.error("立即收取失败", { description: error.message }),
  });

  const setTradeAutoDispatch = trpc.world.setTradeAutoDispatch.useMutation({
    onSuccess: async (result) => {
      toast.success(result.active ? "商队自动续派已开启" : "商队自动续派已关闭");
      await utils.world.map.invalidate();
    },
    onError: (error) => toast.error("设置失败", { description: error.message }),
  });

  const activeRegion = useMemo(() => map.data?.regions.find((region) => region.regionKey === regionKey) ?? null, [map.data, regionKey]);
  const activeNode = useMemo(() => activeRegion?.nodes.find((node) => node.nodeKey === nodeKey) ?? null, [activeRegion, nodeKey]);
  useEffect(() => {
    if (onboarding.data?.currentKey !== "enter_world" || !map.data || regionKey) return;
    const region = map.data.regions.find((item) => item.nodes.some((node) => node.nodeKey === "sp_keep_road"));
    if (region) setRegionKey(region.regionKey);
  }, [map.data, onboarding.data?.currentKey, regionKey]);
  const selectNode = (key: string) => {
    setNodeKey(key);
    if (key === "sp_keep_road" && onboarding.data?.currentKey === "enter_world") viewTutorialNode.mutate();
  };

  if (map.isLoading) {
    return (
      <>
        <PageMusic src="/aetherfall-assets/world-theme.mp3" areaName="世界地图" />
        <PageSection title="世界地图">
          <SkeletonState rows={5} />
        </PageSection>
      </>
    );
  }

  if (map.isError || !map.data) {
    return (
      <>
        <PageMusic src="/aetherfall-assets/world-theme.mp3" areaName="世界地图" />
        <PageSection title="世界地图">
          <ErrorState message={map.error?.message ?? "地图读取失败"} onRetry={() => map.refetch()} />
        </PageSection>
      </>
    );
  }

  const { regions, summary } = map.data;

  return (
    <>
      <PageMusic src="/aetherfall-assets/world-theme.mp3" areaName="世界地图" />
      <PageSection
      title="世界地图 · 银杉边境与邻境"
      eyebrow={`已探索节点 ${summary.clearedNodes}/${summary.totalNodes} · 区域 ${summary.unlockedRegions}/${summary.totalRegions}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Tag tone="gold">声望 {summary.renown}</Tag>
          <Tag tone="aether">体力 {summary.stamina}/{summary.staminaMax}</Tag>
          <Tag tone="neutral">商队 {summary.activeTradeSlots}/{summary.tradeSlots}</Tag>
          <Tag tone="neutral">顶配战力 {summary.topPower.toLocaleString("zh-CN")}</Tag>
          <Button size="sm" variant="outline" className="border-[color:var(--gold-600)]/50 text-[color:var(--gold-300)]" onClick={() => collectTrade.mutate()} disabled={collectTrade.isPending}>
            <TrendingUp size={13} className="mr-1" />
            收取贸易
          </Button>
        </div>
      }
    >
      {onboarding.data?.currentKey === "enter_world" ? <TutorialSpotlight className="mb-4" targetId="tutorial-node-sp-keep-road" title="前往灰隼堡外郊" description="这里是最安全的出发点。点击高亮节点，查看敌人、体力消耗与首通奖励。" /> : null}
      {onboarding.data?.currentKey === "first_battle" ? <TutorialSpotlight className="mb-4" targetId="tutorial-start-battle" title="开始第一场战斗" description="节点情报已经展开。确认远征队状态后，点击高亮的“出征”进入战场。" /> : null}
      {/* 远征建议 */}
      <Panel gold className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-caption">远征建议</span>
          {(suggestions.data?.recommended ?? []).length === 0 ? (
            <span className="text-xs text-[color:var(--parchment-muted)]">暂无可直接挑战的节点，先完成主线或提升队伍战力。</span>
          ) : (
            (suggestions.data?.recommended ?? []).map((item) => (
              <button
                key={item.nodeKey}
                className="card-tap flex items-center gap-2 rounded-sm border border-[color:var(--ink-500)]/70 bg-[color:var(--ink-900)]/70 px-2.5 py-1.5 text-left text-xs hover:border-[color:var(--gold-600)]/70"
                onClick={() => {
                  const region = regions.find((row) => row.nodes.some((node) => node.nodeKey === item.nodeKey));
                  if (region) {
                    setRegionKey(region.regionKey);
                    selectNode(item.nodeKey);
                  }
                }}
              >
                <MapPin size={13} className="text-[color:var(--ember-400)]" />
                <span>
                  <span className="block text-[color:var(--parchment)]">{item.name}</span>
                  <span className="block text-[0.62rem] text-[color:var(--parchment-muted)]">
                    {item.regionName} · LV.{item.levelRange} · 进度 {item.clearCount}/{item.requiredClears}
                  </span>
                </span>
                {item.storyPending ? <Tag tone="aether">剧情</Tag> : null}
              </button>
            ))
          )}
        </div>
      </Panel>

      {summary.membership?.active ? (
        <Panel className="mb-4 border-[color:var(--aether-500)]/45 p-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5 text-sm text-[color:var(--aether-300)]">
              <Crown size={15} />
              <span>会员便利权益</span>
            </div>
            <span className="text-[0.68rem] text-[color:var(--parchment-muted)]">不改变战斗数值，仅减少等待</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="h-8 border-[color:var(--ember-500)]/55 text-[color:var(--ember-300)]" onClick={() => resetStamina.mutate()} disabled={resetStamina.isPending || summary.membership.staminaResetRemaining <= 0}>
                <Zap size={13} className="mr-1" />
                体力重置 {summary.membership.staminaResetRemaining}/3
              </Button>
              <Button size="sm" variant="outline" className="h-8 border-[color:var(--gold-600)]/55 text-[color:var(--gold-300)]" onClick={() => rushTrade.mutate()} disabled={rushTrade.isPending || summary.membership.tradeRushRemaining <= 0}>
                <RefreshCw size={13} className="mr-1" />
                立即收取 8 小时 {summary.membership.tradeRushRemaining}/5
              </Button>
              <Button size="sm" variant="outline" className={cn("h-8", summary.membership.tradeAutoDispatch ? "border-[color:var(--verdant)]/60 text-[color:var(--verdant)]" : "border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]")} onClick={() => setTradeAutoDispatch.mutate({ active: !summary.membership.tradeAutoDispatch })} disabled={setTradeAutoDispatch.isPending}>
                <Package size={13} className="mr-1" />
                自动续派：{summary.membership.tradeAutoDispatch ? "开" : "关"}
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* 地图 */}
        <Panel className="relative overflow-hidden p-0">
          <div className="relative aspect-[4/3] w-full sm:aspect-[16/11]">
            <img src={WORLD_MAP_ART} alt="瓦尔德兰世界地图" className="absolute inset-0 h-full w-full object-cover opacity-80" onError={(event) => { event.currentTarget.style.display = "none"; }} />
            <div className="absolute inset-0 bg-[color:var(--ink-950)]/25" />

            {regions.map((region) => {
              const isActive = region.regionKey === regionKey;
              return (
                <button
                  key={region.regionKey}
                  className={cn(
                    "card-tap absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-2.5 py-1 text-[0.66rem] backdrop-blur transition-colors",
                    region.unlocked
                      ? "border-[color:var(--gold-500)] bg-[color:var(--ink-950)]/85 text-[color:var(--gold-300)]"
                      : "border-[color:var(--ink-500)] bg-[color:var(--ink-950)]/70 text-[color:var(--parchment-muted)]",
                    isActive && "ring-2 ring-[color:var(--gold-300)]/70",
                  )}
                  style={{ left: `${region.mapX}%`, top: `${region.mapY}%` }}
                  onClick={() => {
                    setRegionKey(region.regionKey);
                    setNodeKey(null);
                  }}
                  title={region.unlocked ? `${region.name} · 控制度 ${region.controlPercent}%` : `${region.name}（${region.lockReason ?? "未解锁"}）`}
                >
                  {region.unlocked ? null : <Lock size={10} className="mr-1 inline" />}
                  {region.name}
                  <span className="text-numeric ml-1 opacity-80">{region.controlPercent}%</span>
                </button>
              );
            })}

            {/* 选中区域的节点标记 */}
            {(activeRegion?.nodes ?? []).map((node) => (
              <button
                key={node.nodeKey}
                className={cn(
                  "card-tap absolute -translate-x-1/2 -translate-y-1/2 rounded-sm border px-1.5 py-0.5 text-[0.6rem]",
                  node.status === "conquered"
                    ? "border-[color:var(--gold-300)] bg-[color:var(--gold-600)]/85 text-[color:var(--ink-950)]"
                    : node.status === "cleared"
                      ? "border-[color:var(--verdant)] bg-[color:var(--ink-950)]/85 text-[color:var(--verdant)]"
                      : node.unlocked
                        ? "border-[color:var(--ember-400)] bg-[color:var(--ink-950)]/85 text-[color:var(--ember-400)]"
                        : "border-[color:var(--ink-500)] bg-[color:var(--ink-950)]/70 text-[color:var(--parchment-muted)]",
                  node.nodeKey === nodeKey && "ring-2 ring-[color:var(--aether-300)]/70",
                )}
                style={{ left: `${node.mapX}%`, top: `${node.mapY}%` }}
                onClick={() => selectNode(node.nodeKey)}
                title={`${node.name} · ${node.nodeTypeLabel}`}
              >
                {node.name}
              </button>
            ))}
          </div>
          <div className="p-4">
            <SectionTitle eyebrow="Regions" title="区域列表" />
            <GoldRule />
            <div className="grid gap-2 sm:grid-cols-2">
              {regions.map((region) => (
                <button
                  key={region.regionKey}
                  data-testid={`world-region-${region.regionKey}`}
                  onClick={() => {
                    setRegionKey(region.regionKey);
                    setNodeKey(null);
                  }}
                  className={cn(
                    "card-tap card-lift rounded-sm border p-2.5 text-left",
                    region.regionKey === regionKey ? "border-[color:var(--gold-600)]/70 bg-[color:var(--ink-800)]/70" : "border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/45",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-[color:var(--parchment)]">{region.name}</span>
                    <span className="text-[0.62rem] text-[color:var(--parchment-muted)]">危险度 {region.dangerTier}</span>
                  </div>
                  <div className="mt-1 text-[0.66rem] text-[color:var(--parchment-muted)]">
                    {region.faction} · 节点 {region.controlledNodes}/{region.totalNodes}
                  </div>
                  <ProgressBar className="mt-1.5" value={region.controlPercent} max={100} height={5} tone={region.unlocked ? "gold" : "aether"} />
                  {!region.unlocked ? <div className="mt-1 truncate text-[0.62rem] text-[color:var(--ember-400)]">{region.lockReason}</div> : null}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        {/* 详情 */}
        <div className="space-y-4">
          {activeRegion ? (
            <Panel gold>
              <SectionTitle
                eyebrow={`危险度 ${activeRegion.dangerTier} · ${activeRegion.faction}`}
                title={activeRegion.name}
                action={activeRegion.unlocked ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className={cn("border-[color:var(--gold-600)]/50 text-[color:var(--gold-300)]", activeRegion.tradeActive && "border-[color:var(--verdant)]/60 text-[color:var(--verdant)]")}
                    onClick={() => toggleTrade.mutate({ regionKey: activeRegion.regionKey, active: !activeRegion.tradeActive })}
                    disabled={toggleTrade.isPending}
                  >
                    <Package size={13} className="mr-1" />
                    {activeRegion.tradeActive ? "召回商队" : "派出商队 · 30 粮"}
                  </Button>
                ) : null}
              />
              <GoldRule />
              <p className="text-sm leading-relaxed text-[color:var(--parchment-dim)]">{activeRegion.description}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-sm border border-[color:var(--ink-500)]/60 p-2">
                  <div className="text-numeric text-sm text-[color:var(--gold-300)]">{activeRegion.controlPercent}%</div>
                  <div className="text-[0.62rem] text-[color:var(--parchment-muted)]">控制度</div>
                </div>
                <div className="rounded-sm border border-[color:var(--ink-500)]/60 p-2">
                  <div className="text-numeric text-sm text-[color:var(--parchment)]">{activeRegion.controlledNodes}/{activeRegion.totalNodes}</div>
                  <div className="text-[0.62rem] text-[color:var(--parchment-muted)]">已攻克节点</div>
                </div>
                <div className="rounded-sm border border-[color:var(--ink-500)]/60 p-2">
                  <div className="text-numeric text-sm text-[color:var(--aether-300)]">{activeRegion.tradeActive ? "营运中" : "未开通"}</div>
                  <div className="text-[0.62rem] text-[color:var(--parchment-muted)]">定期商队 · {summary.activeTradeSlots}/{summary.tradeSlots}</div>
                </div>
              </div>
              <GoldRule />
              <div className="space-y-1.5">
                {activeRegion.nodes.map((node) => (
                  <button
                    key={node.nodeKey}
                    data-testid={`world-node-${node.nodeKey}`}
                    className={cn(
                      "card-tap flex w-full items-center gap-2 rounded-sm border px-2.5 py-2 text-left",
                      node.nodeKey === nodeKey ? "border-[color:var(--aether-500)]/70 bg-[color:var(--ink-800)]/70" : "border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/40 hover:border-[color:var(--gold-600)]/60",
                    )}
                    id={node.nodeKey === "sp_keep_road" ? "tutorial-node-sp-keep-road" : undefined}
                    onClick={() => selectNode(node.nodeKey)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm text-[color:var(--parchment)]">{node.name}</span>
                        <Tag tone={NODE_TYPE_TONE[node.nodeType] ?? "neutral"}>{node.nodeTypeLabel}</Tag>
                        {!node.unlocked ? <Lock size={11} className="text-[color:var(--parchment-muted)]" /> : null}
                      </span>
                      <span className="mt-0.5 block text-[0.66rem] text-[color:var(--parchment-muted)]">
                        LV.{node.levelMin}-{node.levelMax} · 体力 {node.staminaCost} · 进度 {node.clearCount}/{node.requiredClears}
                        {node.hasStory ? " · 含剧情" : ""}
                      </span>
                    </span>
                    <span className="text-[0.66rem] text-[color:var(--parchment-muted)]">
                      {node.status === "conquered" ? "已征服" : node.status === "cleared" ? "已清剿" : node.unlocked ? "可挑战" : "未解锁"}
                    </span>
                  </button>
                ))}
              </div>
            </Panel>
          ) : (
            <Panel>
              <EmptyState
                title="选择一处区域"
                hint="点击地图上的蜡封标记或下方区域卡片，查看节点、敌人与奖励。"
                icon={<MapPin size={22} />}
              />
            </Panel>
          )}

          {activeNode ? (
            <Panel>
              <SectionTitle eyebrow={`${activeRegion?.name ?? ""} · ${activeNode.nodeTypeLabel}`} title={activeNode.name} />
              <GoldRule />
              {!activeNode.unlocked ? (
                <div className="mb-3 flex items-start gap-2 rounded-sm border border-[color:var(--ember-600)]/50 bg-[color:var(--ink-800)]/60 p-2.5 text-xs text-[color:var(--ember-400)]">
                  <ShieldAlert size={15} className="mt-0.5 shrink-0" />
                  <span>解锁条件：{activeNode.lockReason ?? "完成前置节点或提升声望/战力"}</span>
                </div>
              ) : null}

              <div className="text-caption mb-1">敌方编成</div>
              {nodeDetail.isError ? (
                <ErrorState className="mb-3" message={nodeDetail.error?.message} onRetry={() => nodeDetail.refetch()} />
              ) : null}
              <div className="mb-3 space-y-1.5">
                {(nodeDetail.data?.enemies ?? activeNode.enemies).map((enemy, index) => {
                  const JobIcon = JOB_ICON[enemy.job as keyof typeof JOB_ICON] ?? Swords;
                  const ElementIcon = ELEMENT_ICON[enemy.element as keyof typeof ELEMENT_ICON];
                  return (
                    <div key={index} className="flex items-center gap-2 rounded-sm border border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/45 px-2.5 py-1.5">
                      <JobIcon size={15} className="shrink-0 text-[color:var(--ember-400)]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-[color:var(--parchment)]">{enemy.name}</span>
                        <span className="block text-[0.62rem] text-[color:var(--parchment-muted)]">
                          {JOB_NAME[enemy.job]} · LV.{enemy.level} · {enemy.note}
                        </span>
                      </span>
                      <ElementIcon size={14} className="shrink-0 text-[color:var(--frost)]" />
                    </div>
                  );
                })}
              </div>

              <div className="text-caption mb-1">奖励预览</div>
              <div className="mb-3 flex flex-wrap gap-2">
                {Object.entries(activeNode.rewards as Record<string, unknown>)
                  .filter(([key, value]) => typeof value === "number" && Number(value) > 0 && key !== "items" && key !== "charKey")
                  .map(([key, value]) => (
                    <Tag key={key} tone="gold">
                      {resourceName(key)} +{Number(value)}
                    </Tag>
                  ))}
                {activeNode.firstCleared ? null : <Tag tone="aether">首通奖励更丰厚</Tag>}
              </div>

              <div className="flex flex-wrap gap-2">
                {onboarding.data?.currentKey === "enter_world" ? <TutorialSkip /> : null}
                <Button
                  id="tutorial-start-battle"
                  className="btn-gold border-transparent text-[color:var(--ink-950)]"
                  disabled={!activeNode.unlocked}
                  onClick={() => navigate(`/battle/${activeNode.nodeKey}`)}
                >
                  <Swords size={15} className="mr-1.5" />
                  出征（体力 {activeNode.staminaCost}）
                </Button>
                {nodeDetail.data?.storyKey && activeNode.unlocked && !nodeDetail.data.storyCompleted ? (
                  <Button
                    variant="outline"
                    className="border-[color:var(--aether-500)]/50 text-[color:var(--aether-300)]"
                    onClick={() => setSceneKey(nodeDetail.data!.storyKey!)}
                  >
                    <BookOpen size={15} className="mr-1.5" />
                    阅读剧情
                  </Button>
                ) : null}
              </div>
              {nodeDetail.data?.storyKey && nodeDetail.data.storyCompleted ? <p className="mt-2 text-[0.66rem] text-[color:var(--parchment-muted)]">此地纪事已收入编年史。</p> : null}
              {!activeNode.unlocked ? <p className="mt-2 text-[0.66rem] text-[color:var(--parchment-muted)]">该节点尚未解锁，无法出征。</p> : null}
            </Panel>
          ) : null}

          <AllAgesNote />
        </div>
      </div>

      {/* 剧情场景 */}
      <Dialog open={Boolean(sceneKey)} onOpenChange={(open) => { if (!open) setSceneKey(null); }}>
        <DialogContent className="border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-2xl">
          {scene.isLoading ? (
            <div className="py-8 text-center text-sm text-[color:var(--parchment-muted)]">正在读取剧情…</div>
          ) : scene.isError ? (
            <ErrorState message={scene.error?.message ?? "剧情读取失败"} onRetry={() => scene.refetch()} />
          ) : scene.data ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-display text-[color:var(--parchment)]">{scene.data.title}</DialogTitle>
                <DialogDescription className="text-[color:var(--parchment-muted)]">第 {scene.data.chapter} 章 · {scene.data.sceneKey}</DialogDescription>
              </DialogHeader>
              <div className="parchment max-h-[45vh] space-y-3 overflow-y-auto rounded-sm p-3">
                {(scene.data.beats as Array<{ speaker?: string; text?: string; emotion?: string }>).map((beat, index) => (
                  <div key={index}>
                    <div className="text-display text-xs text-[color:var(--gold-300)]">{beat.speaker ?? "旁白"}</div>
                    <p className="mt-0.5 text-sm leading-relaxed text-[color:var(--parchment-dim)]">{beat.text}</p>
                  </div>
                ))}
              </div>
              {scene.data.decision ? (
                <div className="rounded-sm border border-[color:var(--gold-600)]/55 bg-[color:var(--ink-800)]/65 p-3">
                  <div className="text-caption text-[color:var(--gold-400)]">已收入边境纪要</div>
                  <p className="mt-1 text-sm leading-relaxed text-[color:var(--parchment)]">所作抉择：{scene.data.decision.choiceText}</p>
                  {scene.data.decision.reply ? <p className="mt-2 text-xs leading-relaxed text-[color:var(--parchment-muted)]">{scene.data.decision.reply}</p> : null}
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-[0.62rem] text-[color:var(--parchment-muted)]">记录于 {new Date(scene.data.decision.recordedAt).toLocaleString("zh-CN")}</span>
                    <Button variant="outline" className="border-[color:var(--ink-500)]/70" onClick={() => setSceneKey(null)}>合上抄本</Button>
                  </div>
                </div>
              ) : (scene.data.choices as Array<{ text?: string; reply?: string }>).length > 0 ? (
                <div className="space-y-2">
                  {(scene.data.choices as Array<{ text?: string; reply?: string }>).map((choice, index) => (
                    <button
                      key={index}
                      className="card-tap w-full rounded-sm border border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 px-3 py-2 text-left text-sm hover:border-[color:var(--gold-600)]/70"
                      onClick={() => chooseScene.mutate({ sceneKey: sceneKey!, choiceIndex: index, nodeKey: nodeKey ?? undefined })}
                      disabled={chooseScene.isPending}
                    >
                      {choice.text ?? `选项 ${index + 1}`}
                    </button>
                  ))}
                </div>
              ) : (
                <Button variant="outline" className="border-[color:var(--ink-500)]/70" onClick={() => setSceneKey(null)}>关闭</Button>
              )}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      </PageSection>
    </>
  );
}

void RarityBadge;
void Timer;
