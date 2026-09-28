/**
 * 同伴页：角色图鉴 + 队伍编成
 * 卡片规则：稀有度边框、职业与元素标识、等级/战力/羁绊一览
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Filter, Save, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { PageSection } from "@/components/game/GameShell";
import { ELEMENT_ICON, JOB_ICON } from "@/components/game/GameIcons";
import { PageMusic } from "@/components/game/PageMusic";
import { AllAgesNote, Avatar, ELEMENT_COLOR, EmptyState, ErrorState, GoldRule, JOB_NAME, Panel, RarityBadge, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";

const ALL = "__all__";

export default function Roster() {
  const utils = trpc.useUtils();
  const [filter, setFilter] = useState<"all" | "owned" | "missing">("all");
  const [job, setJob] = useState<string>(ALL);
  const [rarity, setRarity] = useState<string>(ALL);
  const [sort, setSort] = useState<"rarity" | "power" | "level" | "bond" | "name">("rarity");

  const query = useMemo(
    () => ({
      filter,
      job: job === ALL ? undefined : job,
      rarity: rarity === ALL ? undefined : rarity,
      sort,
    }),
    [filter, job, rarity, sort],
  );

  const roster = trpc.character.roster.useQuery(query);
  const teams = trpc.keep.teams.useQuery();
  const home = trpc.keep.home.useQuery();

  const [draftIds, setDraftIds] = useState<number[]>([]);
  const [draftRows, setDraftRows] = useState<Record<number, "front" | "back">>({});
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  const activeTeam = teams.data?.find((team) => team.id === selectedTeamId) ?? teams.data?.find((team) => team.isActive) ?? teams.data?.[0];

  /**
   * 只在「队伍切换 / 服务器数据真正变化」时同步草稿，
   * 依赖里不能放 activeTeam 对象本身：tRPC 每次重新取数都会产生新对象引用，
   * 会把玩家还没保存的编队改动直接冲掉。
   */
  const teamSignature = activeTeam
    ? `${activeTeam.id}:${(activeTeam.memberIds ?? []).join(",")}:${JSON.stringify(activeTeam.formation ?? {})}`
    : "";
  useEffect(() => {
    if (!activeTeam) return;
    setDraftIds(activeTeam.memberIds ?? []);
    setDraftRows((activeTeam.formation ?? {}) as Record<number, "front" | "back">);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamSignature]);

  const setTeam = trpc.keep.setTeam.useMutation({
    onSuccess: async () => {
      toast.success("远征队已更新");
      await Promise.all([utils.keep.teams.invalidate(), utils.keep.home.invalidate()]);
    },
    onError: (error) => toast.error("保存失败", { description: error.message }),
  });

  const ownedCharacters = useMemo(() => (roster.data?.list ?? []).filter((item) => item.owned), [roster.data]);

  const toggleMember = (playerCharId: number, jobKey: string) => {
    setDraftIds((current) => {
      if (current.includes(playerCharId)) {
        const next = current.filter((id) => id !== playerCharId);
        toast.info("已从队伍中移除");
        return next;
      }
      if (current.length >= 4) {
        toast.warning("队伍最多 4 人");
        return current;
      }
      setDraftRows((rows) => ({ ...rows, [playerCharId]: ["warrior", "knight", "assassin"].includes(jobKey) ? "front" : "back" }));
      return [...current, playerCharId];
    });
  };

  if (roster.isLoading) {
    return (
      <>
        <PageMusic src="/aetherfall-assets/keep-theme.mp3" storageKey="aetherfall:roster-music-muted" areaName="同伴" />
        <PageSection title="同伴">
          <SkeletonState rows={4} />
        </PageSection>
      </>
    );
  }

  if (roster.isError || !roster.data) {
    return (
      <>
        <PageMusic src="/aetherfall-assets/keep-theme.mp3" storageKey="aetherfall:roster-music-muted" areaName="同伴" />
        <PageSection title="同伴">
          <ErrorState message={roster.error?.message ?? "名册读取失败"} onRetry={() => roster.refetch()} />
        </PageSection>
      </>
    );
  }

  const summary = roster.data.summary;

  return (
    <>
      <PageMusic src="/aetherfall-assets/keep-theme.mp3" storageKey="aetherfall:roster-music-muted" areaName="同伴" />
      <PageSection
        title="同伴 · 名册"
      eyebrow={`已招募 ${summary.owned}/${summary.total} · 英杰 ${summary.ssrOwned}/${summary.ssrTotal} · 总战力 ${summary.totalPower.toLocaleString("zh-CN")}`}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} onValueChange={(value) => setFilter(value as "all" | "owned" | "missing")}>
            <SelectTrigger className="h-8 w-[104px] border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="owned">已拥有</SelectItem>
              <SelectItem value="missing">未拥有</SelectItem>
            </SelectContent>
          </Select>
          <Select value={job} onValueChange={setJob}>
            <SelectTrigger className="h-8 w-[104px] border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
              <SelectItem value={ALL}>全部职业</SelectItem>
              {Object.entries(JOB_NAME).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={rarity} onValueChange={setRarity}>
            <SelectTrigger className="h-8 w-[104px] border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
              <SelectItem value={ALL}>全部品质</SelectItem>
              <SelectItem value="SSR">英杰 SSR</SelectItem>
              <SelectItem value="SR">精锐 SR</SelectItem>
              <SelectItem value="R">常民 R</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(value) => setSort(value as typeof sort)}>
            <SelectTrigger className="h-8 w-[112px] border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
              <SelectItem value="rarity">按品质</SelectItem>
              <SelectItem value="power">按战力</SelectItem>
              <SelectItem value="level">按等级</SelectItem>
              <SelectItem value="bond">按羁绊</SelectItem>
              <SelectItem value="name">按名称</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        {/* 角色网格 */}
        <div>
          {roster.data.list.length === 0 ? (
            <EmptyState
              title="没有符合条件的角色"
              hint="调整筛选条件，或前往「招募」使用星辉召唤新的伙伴。"
              icon={<Filter size={22} />}
              action={<Link href="/recruit"><Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]">去招募</Button></Link>}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {roster.data.list.map((item) => {
                const JobIcon = JOB_ICON[item.job as keyof typeof JOB_ICON];
                const ElementIcon = ELEMENT_ICON[item.element as keyof typeof ELEMENT_ICON];
                const inTeam = draftIds.includes(item.playerCharId ?? -1);
                return (
                  <Link
                    key={item.charKey}
                    href={`/character/${item.charKey}`}
                    className={cn(
                      "card-tap card-lift group relative overflow-hidden rounded-sm border bg-[color:var(--ink-800)]/60",
                      item.rarity === "SSR" ? "rarity-SSR border-[#E0B84C]/90" : item.rarity === "SR" ? "rarity-SR border-[#A9B7C6]/70" : "rarity-R border-[#B08050]/60",
                      !item.owned && "opacity-60",
                    )}
                  >
                    <div className="relative">
                      {item.portraitUrl ? (
                        <img src={item.portraitUrl} alt={item.name} loading="lazy" className="aspect-[3/4] w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                      ) : (
                        <div className="grid aspect-[3/4] w-full place-items-center bg-[color:var(--ink-900)]">
                          <span className="text-display text-2xl text-[color:var(--gold-600)]/70">{item.name.slice(0, 1)}</span>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[color:var(--ink-950)] via-[color:var(--ink-950)]/70 to-transparent p-2 pt-6">
                        <div className="truncate text-sm font-medium text-[color:var(--parchment)]">{item.name}</div>
                        <div className="truncate text-[0.62rem] text-[color:var(--gold-300)]/85">{item.title}</div>
                      </div>
                      <div className="absolute left-1.5 top-1.5 flex flex-col gap-1">
                        <RarityBadge rarity={item.rarity as "R" | "SR" | "SSR"} />
                        {item.isNew ? <Tag tone="aether">NEW</Tag> : null}
                      </div>
                      {inTeam ? (
                        <span className="absolute right-1.5 top-1.5 rounded-sm border border-[color:var(--gold-300)] bg-[color:var(--ink-950)]/80 px-1.5 py-0.5 text-[0.6rem] text-[color:var(--gold-300)]">出阵</span>
                      ) : null}
                    </div>
                    <div className="p-2">
                      <div className="flex items-center justify-between text-[0.68rem] text-[color:var(--parchment-dim)]">
                        <span className="flex items-center gap-1">
                          <JobIcon size={12} />
                          {JOB_NAME[item.job]}
                        </span>
                        <span className="flex items-center gap-1" style={{ color: ELEMENT_COLOR[item.element] }}>
                          <ElementIcon size={12} />
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[0.66rem]">
                        <span className="text-numeric text-[color:var(--parchment-muted)]">
                          {item.owned ? `LV.${item.level} · 羁绊 ${item.bondLevel}` : "未招募"}
                        </span>
                        <span className="text-numeric text-[color:var(--gold-300)]">{item.power.toLocaleString("zh-CN")}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* 队伍编成 */}
        <div className="space-y-4">
          {(teams.data ?? []).length > 1 ? (
            <Panel className="p-2">
              <div className="grid grid-cols-2 gap-2">
                {(teams.data ?? []).map((team) => (
                  <button
                    key={team.id}
                    type="button"
                    onClick={() => setSelectedTeamId(team.id)}
                    className={cn(
                      "rounded-sm border px-2.5 py-2 text-left transition-colors",
                      activeTeam?.id === team.id
                        ? "border-[color:var(--gold-300)] bg-[color:var(--gold-900)]/25 text-[color:var(--gold-200)]"
                        : "border-[color:var(--ink-500)]/60 bg-[color:var(--ink-900)]/40 text-[color:var(--parchment-dim)] hover:border-[color:var(--gold-600)]/70",
                    )}
                  >
                    <span className="block text-xs">{team.name}</span>
                    <span className="mt-0.5 block text-[0.6rem]">{team.memberIds.length > 0 ? `${team.memberIds.length}/4 人 · 战力 ${team.power.toLocaleString("zh-CN")}` : "待编成 · 可作为预备部队"}</span>
                  </button>
                ))}
              </div>
            </Panel>
          ) : null}
          <Panel gold>
            <SectionTitle
              eyebrow="Expedition Team"
              title={activeTeam ? activeTeam.name : "远征队"}
              action={
                <Button
                  size="sm"
                  className="btn-gold border-transparent text-[color:var(--ink-950)]"
                  disabled={!activeTeam || setTeam.isPending}
                  onClick={() => activeTeam && setTeam.mutate({ teamId: activeTeam.id, memberIds: draftIds, formation: Object.fromEntries(Object.entries(draftRows).map(([key, value]) => [String(key), value])) })}
                >
                  <Save size={13} className="mr-1" />
                  保存编成
                </Button>
              }
            />
            <GoldRule />
            {!activeTeam ? (
              <EmptyState title="没有可用的队伍" hint="创建档案时会自动生成一支远征队。" icon={<Users size={20} />} />
            ) : (
              <>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  {[0, 1, 2, 3].map((index) => {
                    const id = draftIds[index];
                    const member = ownedCharacters.find((item) => item.playerCharId === id);
                    return (
                      <div
                        key={index}
                        className={cn(
                          "relative rounded-sm border p-2",
                          member ? "border-[color:var(--gold-600)]/60 bg-[color:var(--ink-800)]/70" : "border-dashed border-[color:var(--ink-500)]/60 bg-[color:var(--ink-900)]/40",
                        )}
                      >
                        {member ? (
                          <>
                            <div className="flex items-center gap-2">
                              <Avatar src={member.avatarUrl} name={member.name} rarity={member.rarity as "R" | "SR" | "SSR"} size={38} />
                              <span className="min-w-0">
                                <span className="block truncate text-xs text-[color:var(--parchment)]">{member.name}</span>
                                <span className="block text-[0.6rem] text-[color:var(--parchment-muted)]">LV.{member.level} · {JOB_NAME[member.job]}</span>
                              </span>
                            </div>
                            <div className="mt-1.5 flex items-center justify-between">
                              <button
                                className="rounded-sm border border-[color:var(--ink-500)]/70 px-1.5 py-0.5 text-[0.6rem] text-[color:var(--parchment-dim)] hover:border-[color:var(--gold-600)]/70"
                                onClick={() => setDraftRows((rows) => ({ ...rows, [member.playerCharId!]: rows[member.playerCharId!] === "front" ? "back" : "front" }))}
                              >
                                {draftRows[member.playerCharId!] === "front" ? "前排" : "后排"}
                              </button>
                              <button className="text-[color:var(--blood)]" onClick={() => toggleMember(member.playerCharId!, member.job)} aria-label="移除">
                                <X size={13} />
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="grid h-[86px] place-items-center text-[0.68rem] text-[color:var(--parchment-muted)]">空位 {index + 1}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-xs text-[color:var(--parchment-muted)]">
                  <span>单击下方角色加入队伍（最多 4 人）</span>
                  <span className="text-numeric text-[color:var(--gold-300)]">
                    预计战力 {ownedCharacters.filter((item) => draftIds.includes(item.playerCharId ?? -1)).reduce((sum, item) => sum + item.power, 0).toLocaleString("zh-CN")}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                  {ownedCharacters.map((item) => {
                    const selected = draftIds.includes(item.playerCharId ?? -1);
                    return (
                      <button
                        key={item.charKey}
                        onClick={() => toggleMember(item.playerCharId!, item.job)}
                        className={cn(
                          "card-tap rounded-sm border p-1 text-center",
                          selected ? "border-[color:var(--gold-300)] bg-[color:var(--ink-700)]/70" : "border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/40 hover:border-[color:var(--gold-600)]/60",
                        )}
                        title={`${item.name} · ${JOB_NAME[item.job]}`}
                      >
                        <Avatar src={item.avatarUrl} name={item.name} rarity={item.rarity as "R" | "SR" | "SSR"} size={34} className="mx-auto" />
                        <span className="mt-1 block truncate text-[0.58rem] text-[color:var(--parchment-dim)]">{item.name.slice(0, 3)}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Team Bonus" title="当前加成" />
            <GoldRule />
            <div className="space-y-1 text-xs text-[color:var(--parchment-dim)]">
              <p>· 城墙减伤：<span className="text-[color:var(--gold-300)]">{Math.round((home.data?.bonus.damageReduction ?? 0) * 100)}%</span></p>
              <p>· 兵营攻击加成：<span className="text-[color:var(--gold-300)]">{Math.round((home.data?.bonus.attackBonus ?? 0) * 100)}%</span></p>
              <p>· 兵营防御加成：<span className="text-[color:var(--gold-300)]">{Math.round((home.data?.bonus.defenseBonus ?? 0) * 100)}%</span></p>
              <p>· 兵营生命加成：<span className="text-[color:var(--gold-300)]">{Math.round((home.data?.bonus.hpBonus ?? 0) * 100)}%</span></p>
              <p className="pt-1 text-[color:var(--parchment-muted)]">
                建筑等级会直接改变战斗结果——把这些加成算进你的编成策略。
              </p>
            </div>
          </Panel>

          <AllAgesNote />
        </div>
      </div>
      </PageSection>
    </>
  );
}
