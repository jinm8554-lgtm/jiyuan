/**
 * 战斗页（回合制 / 半自动）
 * 数据来源：服务端权威战斗状态（battles.state），前端只做展示与指令提交
 * 反馈：行动条 → 伤害/治疗/护盾飘字 → 事件流日志 → 结算奖励与星级
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, Flag, Heart, Package, Play, Shield, Sparkles, Swords, Wand2, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { PageSection } from "@/components/game/GameShell";
import { ELEMENT_ICON, JOB_ICON } from "@/components/game/GameIcons";
import { ELEMENT_COLOR, ELEMENT_NAME, EmptyState, ErrorState, GoldRule, JOB_NAME, Panel, ProgressBar, SectionTitle, Tag } from "@/components/game/ui";

type UnitView = {
  id: string;
  charKey: string;
  name: string;
  title: string | null;
  side: "ally" | "enemy";
  job: string;
  element: string;
  rarity: "R" | "SR" | "SSR";
  level: number;
  row: "front" | "back";
  hp: number;
  maxHp: number;
  shield: number;
  energy: number;
  energyMax: number;
  alive: boolean;
  statuses: Array<{ type: string; stat: string | null; value: number; duration: number; label?: string | null }>;
  cooldowns: Record<string, number>;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
  stats: Record<string, number>;
  skills: Array<{
    skillKey: string;
    level: number;
    name: string;
    element: string;
    kind: string;
    targetType: string;
    power: number;
    cooldown: number;
    energyCost: number;
    iconKey: string;
    description: string;
    ready: boolean;
    cooldownLeft: number;
  }>;
};

type StateView = {
  turn: number;
  result: "ongoing" | "won" | "lost";
  finished: boolean;
  awaitingUnitId: string | null;
  rating: number;
  units: UnitView[];
};

type EventView = {
  turn: number;
  type: string;
  actorName?: string;
  actionName?: string;
  actorId?: string;
  targetId?: string;
  targetName?: string;
  value?: number;
  element?: string;
  crit?: boolean;
  status?: string;
  text?: string;
};

type FinishedBattleView = {
  settlement?: {
    rewards?: BattleRewardsView;
    droppedItems?: Array<{ equipKey: string; name: string }>;
  } | null;
  reserveAvailable?: boolean;
  reserveTeam?: { name: string; memberCount: number } | null;
};

type BattleRewardsView = {
  gold?: number;
  food?: number;
  wood?: number;
  iron?: number;
  aether?: number;
  renown?: number;
  exp?: number;
  droppedItems?: Array<{ equipKey: string; name: string }>;
};

const REWARD_LABELS = [
  { key: "gold", label: "金币" },
  { key: "food", label: "食物" },
  { key: "wood", label: "木材" },
  { key: "iron", label: "铁" },
  { key: "aether", label: "星辉" },
  { key: "renown", label: "声望" },
  { key: "exp", label: "角色经验" },
] as const;

const BATTLE_ART = "/aetherfall-assets/battlefield_ad38f8db.jpg";

function floatingTextFor(event: EventView) {
  if (event.type === "damage") return { text: `-${event.value ?? 0}`, tone: event.crit ? "crit" : "damage" };
  if (event.type === "heal") return { text: `+${event.value ?? 0}`, tone: "heal" };
  if (event.type === "shield") return { text: `护盾 ${event.value ?? 0}`, tone: "shield" };
  if (event.type === "buff") return { text: event.status ?? "增益", tone: "buff" };
  if (event.type === "debuff") return { text: event.status ?? "减益", tone: "debuff" };
  return null;
}

export default function Battle() {
  const params = useParams<{ nodeKey: string }>();
  const nodeKey = params.nodeKey ?? "";
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();

  const [battleId, setBattleId] = useState<number | null>(null);
  const [state, setState] = useState<StateView | null>(null);
  const [events, setEvents] = useState<EventView[]>([]);
  const [battleRewards, setBattleRewards] = useState<BattleRewardsView>({});
  const [droppedItems, setDroppedItems] = useState<Array<{ equipKey: string; name: string }>>([]);
  const [floating, setFloating] = useState<Record<string, { text: string; tone: string; key: number }>>({});
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const [reserveOffer, setReserveOffer] = useState<{ name: string; memberCount: number } | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const startedRef = useRef(false);

  const node = trpc.world.node.useQuery({ nodeKey }, { enabled: Boolean(nodeKey) });
  const worldMap = trpc.world.map.useQuery(undefined, { enabled: Boolean(nodeKey) });
  const detail = trpc.battle.detail.useQuery({ battleId: battleId! }, { enabled: Boolean(battleId) });

  const start = trpc.battle.start.useMutation({
    onSuccess: (result) => {
      setBattleId(result.battleId);
      setState(result.state as StateView);
      setEvents((result.events ?? []) as EventView[]);
      setBattleRewards({});
      setDroppedItems([]);
      if ((result.state as StateView).finished) {
        if (result.reserveAvailable && result.reserveTeam) setReserveOffer({ name: result.reserveTeam.name, memberCount: result.reserveTeam.memberCount });
        toast.info(result.state.result === "won" ? "战斗已结束：胜利" : "战斗已结束");
      } else {
        toast.success(`远征开始：${result.nodeName}`, { description: `领地加成 减伤 ${Math.round((result.keepBonus?.damageReduction ?? 0) * 100)}%` });
      }
    },
    onError: (error) => toast.error("无法开始战斗", { description: error.message }),
  });

  const act = trpc.battle.act.useMutation({
    onSuccess: (result) => {
      setState(result.state as StateView);
      setEvents((current) => [...current, ...((result.events ?? []) as EventView[])].slice(-80));
      setSelectedSkill(null);
      setPendingTarget(null);
      const newEvents = (result.events ?? []) as EventView[];
      const next: Record<string, { text: string; tone: string; key: number }> = {};
      for (const event of newEvents) {
        const floatingText = floatingTextFor(event);
        if (floatingText && event.targetId) {
          next[event.targetId] = { ...floatingText, key: Date.now() + Math.random() };
        }
      }
      if (Object.keys(next).length > 0) setFloating(next);
      if (result.finished) {
        const finished = result.finished as FinishedBattleView;
        if (finished.settlement) {
          setBattleRewards(finished.settlement.rewards ?? {});
          setDroppedItems(finished.settlement.droppedItems ?? []);
        }
        if (finished.reserveAvailable && finished.reserveTeam) setReserveOffer({ name: finished.reserveTeam.name, memberCount: finished.reserveTeam.memberCount });
        void utils.battle.recent.invalidate();
        void utils.keep.home.invalidate();
        void utils.keep.resources.invalidate();
        void utils.world.map.invalidate();
      }
    },
    onError: (error) => toast.error("指令执行失败", { description: error.message }),
  });

  const auto = trpc.battle.auto.useMutation({
    onSuccess: (result) => {
      setState(result.state as StateView);
      setEvents((current) => [...current, ...((result.events ?? []) as EventView[])].slice(-80));
      const finished = result.finished as FinishedBattleView;
      if (finished.settlement) {
        setBattleRewards(finished.settlement.rewards ?? {});
        setDroppedItems(finished.settlement.droppedItems ?? []);
      }
      if (finished.reserveAvailable && finished.reserveTeam) setReserveOffer({ name: finished.reserveTeam.name, memberCount: finished.reserveTeam.memberCount });
      void utils.battle.recent.invalidate();
      void utils.keep.home.invalidate();
      void utils.keep.resources.invalidate();
      void utils.world.map.invalidate();
    },
    onError: (error) => toast.error("自动推演失败", { description: error.message }),
  });

  const flee = trpc.battle.flee.useMutation({
    onSuccess: () => {
      toast.info("已撤离战场（已消耗的体力不会返还）");
      navigate("/world");
    },
    onError: (error) => toast.error("撤离失败", { description: error.message }),
  });

  const continueWithReserve = trpc.battle.continueWithReserve.useMutation({
    onSuccess: (result) => {
      setReserveOffer(null);
      setBattleId(result.battleId);
      setState(result.state as StateView);
      setBattleRewards({});
      setDroppedItems([]);
      setEvents((current) => [...current, ...((result.events ?? []) as EventView[])].slice(-80));
      setSelectedSkill(null);
      setPendingTarget(null);
      toast.success(`${result.reserveTeam.name} 已接战`, { description: "敌方保留上一场战斗后的剩余生命。" });
      void utils.battle.recent.invalidate();
    },
    onError: (error) => toast.error("预备部队出战失败", { description: error.message }),
  });

  const recent = trpc.battle.recent.useQuery();

  useEffect(() => {
    if (state?.result !== "won" || detail.data?.status !== "won" || !detail.data.rewards) return;
    const rewards = detail.data.rewards as BattleRewardsView;
    setBattleRewards(rewards);
    setDroppedItems(rewards.droppedItems ?? []);
  }, [detail.data?.status, detail.data?.rewards, state?.result]);

  // 进入页面自动开战一次
  useEffect(() => {
    if (!nodeKey || startedRef.current) return;
    startedRef.current = true;
    start.mutate({ nodeKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events.length]);

  useEffect(() => {
    if (Object.keys(floating).length === 0) return;
    const timer = window.setTimeout(() => setFloating({}), 950);
    return () => window.clearTimeout(timer);
  }, [floating]);

  const allies = useMemo(() => state?.units.filter((unit) => unit.side === "ally") ?? [], [state]);
  const enemies = useMemo(() => state?.units.filter((unit) => unit.side === "enemy") ?? [], [state]);
  const awaiting = useMemo(() => state?.units.find((unit) => unit.id === state.awaitingUnitId) ?? null, [state]);

  if (!nodeKey) {
    return (
      <PageSection title="远征">
        <EmptyState title="未指定目标节点" hint="请从世界地图选择一个节点后再出征。" action={<Link href="/world"><Button className="btn-gold border-transparent text-[color:var(--ink-950)]">返回地图</Button></Link>} />
      </PageSection>
    );
  }

  const mapNode = worldMap.data?.regions.flatMap((region) => region.nodes).find((item) => item.nodeKey === nodeKey);
  if (mapNode && !mapNode.unlocked && !state && !start.isPending && !start.isError) {
    return (
      <PageSection title="远征">
        <EmptyState title="节点尚未解锁" hint={mapNode.lockReason ?? "请先完成前置节点或解锁条件。"} action={<Link href="/world"><Button className="btn-gold border-transparent text-[color:var(--ink-950)]">返回地图</Button></Link>} />
      </PageSection>
    );
  }

  return (
    <PageSection
      title={`远征 · ${node.data?.name ?? nodeKey}`}
      eyebrow={node.data ? `${node.data.nodeTypeLabel} · LV.${node.data.levelMin}-${node.data.levelMax} · 体力 ${node.data.staminaCost}` : "读取节点信息…"}
      actions={
        <div className="flex gap-2">
          <Link href="/world">
            <Button size="sm" variant="outline" className="border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]">
              <ArrowLeft size={13} className="mr-1" />
              返回地图
            </Button>
          </Link>
          {state && !state.finished ? (
            <>
              <Button data-testid="battle-auto-resolve" size="sm" className="bg-[color:var(--aether-500)] px-4 font-semibold text-[color:var(--ink-950)] shadow-[0_0_16px_color-mix(in_srgb,var(--aether-500)_35%,transparent)] hover:bg-[color:var(--aether-400)]" onClick={() => auto.mutate({ battleId: battleId! })} disabled={auto.isPending || !battleId}>
                <Play size={14} className="mr-1.5" />
                战斗
              </Button>
              <Button size="sm" variant="outline" className="border-[color:var(--blood)]/50 text-[color:var(--blood)]" onClick={() => flee.mutate({ battleId: battleId! })} disabled={flee.isPending || !battleId}>
                <Flag size={13} className="mr-1" />
                撤离
              </Button>
            </>
          ) : null}
        </div>
      }
    >
      {start.isError ? <ErrorState className="mb-4" message={start.error?.message} onRetry={() => { startedRef.current = true; start.mutate({ nodeKey }); }} /> : null}

      {!state ? (
        <Panel className="py-16 text-center">
          <div className="text-display text-lg text-[color:var(--parchment)]">正在集结远征队…</div>
          <p className="mt-2 text-sm text-[color:var(--parchment-muted)]">服务端正在计算队伍属性、领地加成与敌方编成。</p>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          {/* 战场 */}
          <div className="space-y-4">
            <Panel className="relative overflow-hidden p-0">
              <img src={BATTLE_ART} alt="战场" className="absolute inset-0 h-full w-full object-cover opacity-45" onError={(event) => { event.currentTarget.style.display = "none"; }} />
              <div className="absolute inset-0 bg-gradient-to-b from-[color:var(--ink-950)]/70 via-[color:var(--ink-950)]/45 to-[color:var(--ink-950)]/85" />
              <div className="relative p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Swords size={16} className="text-[color:var(--gold-400)]" />
                    <span className="text-display text-sm text-[color:var(--parchment)]">第 {state.turn} 回合</span>
                    <Tag tone={state.finished ? (state.result === "won" ? "good" : "danger") : "gold"}>
                      {state.finished ? (state.result === "won" ? "胜利" : "失败") : "进行中"}
                    </Tag>
                    {state.finished && state.rating > 0 ? <Tag tone="gold">{"★".repeat(state.rating)}</Tag> : null}
                  </div>
                  <div className="flex flex-wrap gap-2 text-[0.68rem]">
                    <span className="text-[color:var(--verdant)]">我方存活 {allies.filter((unit) => unit.alive).length}/{allies.length}</span>
                    <span className="text-[color:var(--blood)]">敌方存活 {enemies.filter((unit) => unit.alive).length}/{enemies.length}</span>
                  </div>
                </div>

                {/* 敌方 */}
                <div className="mb-4">
                  <div className="text-caption mb-1.5">敌方</div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {enemies.map((unit) => {
                      const ElementIcon = ELEMENT_ICON[unit.element as keyof typeof ELEMENT_ICON];
                      const JobIcon = JOB_ICON[unit.job as keyof typeof JOB_ICON];
                      const targetable = Boolean(selectedSkill) && unit.alive;
                      return (
                        <button
                          key={unit.id}
                          disabled={!targetable}
                          onClick={() => {
                            if (!selectedSkill || !awaiting) return;
                            act.mutate({ battleId: battleId!, unitId: awaiting.id, actionKey: selectedSkill, targetId: unit.id });
                          }}
                          className={cn(
                            "relative rounded-sm border p-2 text-left transition-colors",
                            unit.alive ? "border-[color:var(--blood)]/50 bg-[color:var(--ink-950)]/70" : "border-[color:var(--ink-500)]/40 bg-[color:var(--ink-950)]/40 opacity-45",
                            targetable && "hover:border-[color:var(--gold-300)] hover:bg-[color:var(--ink-800)]/80",
                            pendingTarget === unit.id && "border-[color:var(--gold-300)]",
                          )}
                        >
                          {floating[unit.id] ? (
                            <span
                              className={cn(
                                "float-damage pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 text-numeric text-sm font-bold",
                                floating[unit.id].tone === "damage" && "text-[color:var(--blood)]",
                                floating[unit.id].tone === "crit" && "text-[color:var(--ember-400)]",
                                floating[unit.id].tone === "heal" && "text-[color:var(--verdant)]",
                                floating[unit.id].tone === "shield" && "text-[color:var(--frost)]",
                              )}
                            >
                              {floating[unit.id].text}
                            </span>
                          ) : null}
                          <div className="flex items-center gap-1.5">
                            <JobIcon size={14} className="shrink-0 text-[color:var(--ember-400)]" />
                            <span className="truncate text-xs text-[color:var(--parchment)]">{unit.name}</span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-[0.6rem] text-[color:var(--parchment-muted)]">
                            <ElementIcon size={10} style={{ color: ELEMENT_COLOR[unit.element] }} />
                            {ELEMENT_NAME[unit.element]} · LV.{unit.level} · {unit.row === "front" ? "前排" : "后排"}
                          </div>
                          <ProgressBar className="mt-1" value={unit.hp} max={unit.maxHp} height={5} tone="ember" />
                          {unit.shield > 0 ? <div className="mt-0.5 text-[0.58rem] text-[color:var(--frost)]">护盾 {unit.shield}</div> : null}
                          {unit.statuses.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {unit.statuses.map((status, index) => (
                                <span key={index} className="rounded-sm border border-[color:var(--violet)]/50 px-1 text-[0.56rem] text-[color:var(--violet)]">
                                  {status.label ?? status.type}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 我方 */}
                <div>
                  <div className="text-caption mb-1.5">我方</div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {allies.map((unit) => {
                      const isAwaiting = state.awaitingUnitId === unit.id;
                      const JobIcon = JOB_ICON[unit.job as keyof typeof JOB_ICON];
                      const targetable = Boolean(selectedSkill) && unit.alive && ["self", "ally", "all_allies"].includes(awaiting?.skills.find((skill) => skill.skillKey === selectedSkill)?.targetType ?? "self");
                      return (
                        <button
                          key={unit.id}
                          disabled={!targetable}
                          onClick={() => {
                            if (!selectedSkill || !awaiting) return;
                            act.mutate({ battleId: battleId!, unitId: awaiting.id, actionKey: selectedSkill, targetId: unit.id });
                          }}
                          className={cn(
                            "relative rounded-sm border p-2 text-left transition-colors",
                            !unit.alive ? "border-[color:var(--ink-500)]/40 bg-[color:var(--ink-950)]/40 opacity-45" : "border-[color:var(--gold-600)]/60 bg-[color:var(--ink-950)]/70",
                            isAwaiting && "ring-2 ring-[color:var(--gold-300)]/70",
                            targetable && "hover:border-[color:var(--gold-300)]",
                          )}
                        >
                          {floating[unit.id] ? (
                            <span
                              className={cn(
                                "float-damage pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 text-numeric text-sm font-bold",
                                floating[unit.id].tone === "damage" && "text-[color:var(--blood)]",
                                floating[unit.id].tone === "crit" && "text-[color:var(--ember-400)]",
                                floating[unit.id].tone === "heal" && "text-[color:var(--verdant)]",
                                floating[unit.id].tone === "shield" && "text-[color:var(--frost)]",
                              )}
                            >
                              {floating[unit.id].text}
                            </span>
                          ) : null}
                          <div className="flex items-center gap-1.5">
                            <JobIcon size={14} className="shrink-0 text-[color:var(--gold-400)]" />
                            <span className="truncate text-xs text-[color:var(--parchment)]">{unit.name}</span>
                          </div>
                          <div className="mt-0.5 text-[0.6rem] text-[color:var(--parchment-muted)]">
                            {JOB_NAME[unit.job]} · LV.{unit.level} · {unit.row === "front" ? "前排" : "后排"}
                          </div>
                          <ProgressBar className="mt-1" value={unit.hp} max={unit.maxHp} height={5} tone="verdant" />
                          <ProgressBar className="mt-1" value={unit.energy} max={unit.energyMax} height={3} tone="aether" />
                          <div className="mt-0.5 flex items-center justify-between text-[0.58rem] text-[color:var(--parchment-muted)]">
                            <span className="text-numeric">{Math.max(0, Math.round(unit.hp))}/{unit.maxHp}</span>
                            {unit.shield > 0 ? <span className="text-[color:var(--frost)]">盾 {unit.shield}</span> : null}
                          </div>
                          {isAwaiting ? <div className="mt-1 text-[0.58rem] text-[color:var(--gold-300)]">等待你的指令</div> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Panel>

            {/* 指令面板 */}
            <Panel>
              <SectionTitle eyebrow="Command" title={state.finished ? "战斗结束" : awaiting ? `指挥 ${awaiting.name}` : "等待行动"} />
              <GoldRule />
              {state.finished ? (
                <div className="space-y-2">
                  <p className="text-sm text-[color:var(--parchment-dim)]">
                    {state.result === "won" ? "远征胜利。奖励已结算并写入你的档案。" : "远征失败。调整装备与队伍后再来一次。"}
                  </p>
                  <div className="rounded-sm border border-[color:var(--gold-600)]/45 bg-[color:var(--ink-800)]/45 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-[color:var(--gold-300)]">
                      <Package size={14} />
                      <span>奖励清单</span>
                    </div>
                    {state.result === "won" ? (
                      <>
                        <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                          {REWARD_LABELS.map(({ key, label }) => {
                            const value = battleRewards[key];
                            if (!value) return null;
                            return (
                              <div key={key} className="flex items-center justify-between gap-2 rounded-sm border border-[color:var(--ink-500)]/45 bg-[color:var(--ink-900)]/45 px-2 py-1.5 text-xs">
                                <span className="text-[color:var(--parchment-muted)]">{label}</span>
                                <span className="text-numeric text-[color:var(--gold-300)]">+{value.toLocaleString()}</span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-3 border-t border-[color:var(--ink-500)]/45 pt-2">
                          <div className="text-xs text-[color:var(--parchment-muted)]">装备掉落</div>
                          {droppedItems.length > 0 ? (
                            <div className="mt-1.5 space-y-1.5">
                              {droppedItems.map((item, index) => (
                                <div key={`${item.equipKey}-${index}`} className="flex items-center justify-between gap-2 rounded-sm border border-[color:var(--ink-500)]/45 bg-[color:var(--ink-900)]/45 px-2 py-1.5 text-xs">
                                  <span className="text-[color:var(--parchment)]">{item.name}</span>
                                  <span className="text-[color:var(--parchment-muted)]">已入库</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-1 text-xs text-[color:var(--parchment-muted)]">本次没有装备掉落。</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="mt-1.5 text-xs text-[color:var(--parchment-muted)]">失败战斗不掉落奖励。</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={() => { startedRef.current = true; setState(null); setBattleRewards({}); setDroppedItems([]); setEvents([]); start.mutate({ nodeKey }); }} disabled={start.isPending}>
                      再战一次
                    </Button>
                    <Link href="/world">
                      <Button variant="outline" className="border-[color:var(--ink-500)]/70">返回地图</Button>
                    </Link>
                    <Link href="/roster">
                      <Button variant="outline" className="border-[color:var(--gold-600)]/50 text-[color:var(--gold-300)]">整理队伍</Button>
                    </Link>
                  </div>
                </div>
              ) : awaiting ? (
                <>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="text-caption">元素</span>
                    {(() => {
                      const ElementIcon = ELEMENT_ICON[awaiting.element as keyof typeof ELEMENT_ICON];
                      return (
                        <span className="inline-flex items-center gap-1 text-xs" style={{ color: ELEMENT_COLOR[awaiting.element] }}>
                          <ElementIcon size={13} />
                          {ELEMENT_NAME[awaiting.element]}
                        </span>
                      );
                    })()}
                    <span className="text-caption ml-3">属性</span>
                    <span className="text-numeric text-xs text-[color:var(--parchment-dim)]">
                      攻 {awaiting.stats.atk} · 魔 {awaiting.stats.mag} · 防 {awaiting.stats.def} · 速 {awaiting.stats.spd}
                    </span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {awaiting.skills.map((skill) => {
                      const onCooldown = skill.cooldownLeft > 0;
                      const notEnoughEnergy = skill.energyCost ? awaiting.energy < skill.energyCost : false;
                      const ElementIcon = ELEMENT_ICON[skill.element as keyof typeof ELEMENT_ICON];
                      return (
                        <button
                          key={skill.skillKey}
                          disabled={onCooldown || notEnoughEnergy || act.isPending}
                          onClick={() => {
                            setSelectedSkill(skill.skillKey);
                            if (skill.targetType === "enemy" || skill.targetType === "ally" || skill.targetType === "self") {
                              setPendingTarget(null);
                            } else {
                              act.mutate({ battleId: battleId!, unitId: awaiting.id, actionKey: skill.skillKey });
                            }
                          }}
                          className={cn(
                            "card-tap rounded-sm border p-2.5 text-left",
                            selectedSkill === skill.skillKey ? "border-[color:var(--gold-300)] bg-[color:var(--ink-700)]/70" : "border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/50",
                            (onCooldown || notEnoughEnergy) && "opacity-45",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 truncate text-sm text-[color:var(--parchment)]">
                              <ElementIcon size={13} style={{ color: ELEMENT_COLOR[skill.element] }} />
                              {skill.name}
                            </span>
                            <span className="text-[0.62rem] text-[color:var(--parchment-muted)]">LV.{skill.level}</span>
                          </div>
                          <div className="mt-0.5 text-[0.62rem] text-[color:var(--parchment-muted)]">
                            {skill.kind === "passive" ? "被动" : "主动"} · {
                              skill.targetType === "all_enemies" ? "全体敌人" : skill.targetType === "all_allies" ? "全体友方" : skill.targetType === "enemy" ? "单体敌人" : skill.targetType === "ally" ? "单体友方" : "自身"
                            }
                            {skill.cooldownLeft > 0 ? ` · 冷却 ${skill.cooldownLeft}` : skill.cooldownLeft === 0 && onCooldown ? " · 就绪" : ""}
                            {skill.energyCost ? ` · 消耗能量 ${skill.energyCost}` : ""}
                          </div>
                        </button>
                      );
                    })}
                    <button
                      disabled={act.isPending}
                      onClick={() => {
                        setSelectedSkill(null);
                        act.mutate({ battleId: battleId!, unitId: awaiting.id, actionKey: "sk_defend" });
                      }}
                      className="card-tap rounded-sm border border-[color:var(--frost)]/50 bg-[color:var(--ink-800)]/50 p-2.5 text-left"
                    >
                      <div className="flex items-center gap-1.5 text-sm text-[color:var(--parchment)]">
                        <Shield size={13} className="text-[color:var(--frost)]" />
                        防御
                      </div>
                      <div className="mt-0.5 text-[0.62rem] text-[color:var(--parchment-muted)]">后手减伤并获得护盾，可等待技能冷却</div>
                    </button>
                  </div>
                  {selectedSkill ? (
                    <p className="mt-2 text-xs text-[color:var(--gold-300)]">请在上方点击一个目标释放技能（再次点击技能可切换）。</p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-[color:var(--parchment-muted)]">敌方行动中…</p>
              )}
            </Panel>
          </div>

          {/* 侧栏：日志 / 敌人信息 / 历史 */}
          <div className="space-y-4">
            <Panel>
              <SectionTitle eyebrow="Battle Log" title="战斗记录" />
              <GoldRule />
              <div ref={logRef} className="max-h-72 space-y-1 overflow-y-auto pr-1 text-xs">
                {events.length === 0 ? (
                  <p className="py-4 text-center text-[color:var(--parchment-muted)]">暂无记录</p>
                ) : (
                  events.map((event, index) => (
                    <div
                      key={index}
                      className={cn(
                        "rounded-sm border-l-2 px-2 py-1",
                        event.type === "damage" ? "border-[color:var(--blood)]/70 bg-[color:var(--ink-800)]/40" :
                        event.type === "heal" ? "border-[color:var(--verdant)]/70 bg-[color:var(--ink-800)]/40" :
                        event.type === "shield" ? "border-[color:var(--frost)]/70 bg-[color:var(--ink-800)]/40" :
                        event.type === "victory" ? "border-[color:var(--gold-300)] bg-[color:var(--ink-800)]/60" :
                        event.type === "defeat" ? "border-[color:var(--blood)] bg-[color:var(--ink-800)]/60" :
                        event.type === "turn_start" ? "border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)]/60" :
                        "border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/30",
                      )}
                    >
                      <span className="text-[color:var(--parchment-muted)]">T{event.turn} </span>
                      {event.type === "turn_start" ? (
                        <span className="text-[color:var(--gold-300)]">{event.text ?? "新的回合"}</span>
                      ) : event.type === "action" ? (
                        <span className="text-[color:var(--parchment)]">
                          {event.actorName} 使用 <span className="text-[color:var(--gold-300)]">{event.actionName}</span>
                          {event.targetName ? ` → ${event.targetName}` : ""}
                        </span>
                      ) : event.type === "damage" ? (
                        <span className="text-[color:var(--parchment-dim)]">
                          {event.targetName} 受到 <span className="text-numeric text-[color:var(--blood)]">{event.value}</span> 点伤害
                          {event.crit ? <span className="text-[color:var(--ember-400)]">（暴击）</span> : null}
                          {event.element ? <span style={{ color: ELEMENT_COLOR[event.element] }}>（{ELEMENT_NAME[event.element]}）</span> : null}
                        </span>
                      ) : event.type === "heal" ? (
                        <span className="text-[color:var(--parchment-dim)]">
                          {event.targetName} 回复 <span className="text-numeric text-[color:var(--verdant)]">{event.value}</span> 点生命
                        </span>
                      ) : event.type === "shield" ? (
                        <span className="text-[color:var(--parchment-dim)]">
                          {event.targetName} 获得 <span className="text-numeric text-[color:var(--frost)]">{event.value}</span> 点护盾
                        </span>
                      ) : event.type === "down" ? (
                        <span className="text-[color:var(--blood)]">{event.targetName} 失去战斗能力</span>
                      ) : event.type === "victory" ? (
                        <span className="text-[color:var(--gold-300)]">远征胜利！</span>
                      ) : event.type === "defeat" ? (
                        <span className="text-[color:var(--blood)]">远征失败…</span>
                      ) : (
                        <span className="text-[color:var(--parchment-muted)]">{event.text ?? event.type}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Panel>

            <Panel>
              <SectionTitle eyebrow="Status" title="单位状态" />
              <GoldRule />
              <div className="space-y-2 text-xs">
                {[...allies, ...enemies].map((unit) => (
                  <div key={unit.id} className="flex items-center gap-2">
                    <span className={cn("w-20 shrink-0 truncate", unit.side === "ally" ? "text-[color:var(--gold-300)]" : "text-[color:var(--ember-400)]")}>{unit.name}</span>
                    <span className="min-w-0 flex-1">
                      <ProgressBar value={unit.hp} max={unit.maxHp} height={5} tone={unit.side === "ally" ? "verdant" : "ember"} />
                    </span>
                    <span className="text-numeric w-14 shrink-0 text-right text-[color:var(--parchment-muted)]">
                      {Math.max(0, Math.round(unit.hp))}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel>
              <SectionTitle eyebrow="Recent" title="近期远征" />
              <GoldRule />
              {recent.isLoading ? (
                <p className="py-4 text-center text-xs text-[color:var(--parchment-muted)]">读取中…</p>
              ) : (recent.data ?? []).length === 0 ? (
                <EmptyState title="还没有远征记录" hint="第一次胜利后这里会显示战报。" icon={<Sparkles size={20} />} />
              ) : (
                <div className="space-y-1.5 text-xs">
                  {(recent.data ?? []).map((row) => (
                    <div key={row.battleId} className="flex items-center justify-between border-b border-[color:var(--ink-600)]/40 pb-1 last:border-0">
                      <span className="truncate text-[color:var(--parchment-dim)]">{row.nodeName}</span>
                      <span className="flex items-center gap-2">
                        {row.stars > 0 ? <span className="text-[color:var(--gold-300)]">{"★".repeat(row.stars)}</span> : null}
                        <span className={cn(row.status === "won" ? "text-[color:var(--verdant)]" : row.status === "lost" ? "text-[color:var(--blood)]" : "text-[color:var(--parchment-muted)]")}>
                          {row.status === "won" ? "胜利" : row.status === "lost" ? "失败" : row.status === "fled" ? "撤离" : "进行中"}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <div className="panel p-3 text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">
              <p className="mb-1 flex items-center gap-1.5 text-[color:var(--parchment-dim)]">
                <Wind size={13} />
                战斗规则
              </p>
              <p>· 速度决定行动顺序，前排承担更多单体伤害，后排受到的范围伤害更高。</p>
              <p>· 元素克制：火克冰、冰克雷、雷克火，圣与暗互克；同元素伤害降低。</p>
              <p>· 技能消耗能量并进入冷却；防御可后手减伤并获得护盾。</p>
              <p>· 全部结算在服务端完成，客户端无法修改伤害或奖励。</p>
            </div>
          </div>
        </div>
      )}
      {reserveOffer && state?.finished && state.result === "lost" ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[color:var(--ink-950)]/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-sm border border-[color:var(--gold-600)]/70 bg-[color:var(--ink-900)] p-5 shadow-2xl">
            <div className="mb-1 text-caption text-[color:var(--gold-300)]">RESERVE FORCE</div>
            <h2 className="text-display text-xl text-[color:var(--parchment)]">首队战败，但战场尚未失守</h2>
            <p className="mt-3 text-sm leading-relaxed text-[color:var(--parchment-dim)]">
              {reserveOffer.name} 已完成编成，共 {reserveOffer.memberCount} 名成员。是否立即接替第一支远征队，继续挑战上一场战斗中已经受伤的敌人？
            </p>
            <div className="mt-3 rounded-sm border border-[color:var(--blood)]/35 bg-[color:var(--blood)]/10 p-2.5 text-xs text-[color:var(--parchment-muted)]">
              预备部队只可接战一次；不会再次消耗本次远征体力，敌方生命、护盾与状态会从上一场战斗继承。
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="outline" className="border-[color:var(--ink-500)]/70" onClick={() => setReserveOffer(null)} disabled={continueWithReserve.isPending}>放弃接战</Button>
              <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={() => battleId && continueWithReserve.mutate({ battleId })} disabled={continueWithReserve.isPending || !battleId}>
                {continueWithReserve.isPending ? "正在接战…" : "派出预备部队"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </PageSection>
  );
}

void Heart;
void Wand2;
