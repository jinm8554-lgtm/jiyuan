/**
 * 编年史（世界观设定集）
 * 用途：无需登录即可阅读；同时作为游戏内「世界百科」入口
 */
import { Link } from "wouter";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, CheckCircle2, ChevronDown, Feather, ScrollText, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { PageSection } from "@/components/game/GameShell";
import { PageMusic } from "@/components/game/PageMusic";
import { WelcomeRitual } from "@/components/welcome/WelcomeRitual";
import { ErrorState, GoldRule, Panel, resourceName, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { usePlayerName } from "@/hooks/usePlayerName";

const WORLD_ART = "/aetherfall-assets/worldmap_72ac880b.jpg";

const ARCHIVE_VOLUMES = [
  { id: "factions", title: "《王国的六大势力》", shelf: "王国志 · 卷二", kind: "封蜡卷轴", description: "王都档案官在高塔城陷落前抄录的各方名册。", icon: ScrollText },
  { id: "rift", title: "《裂隙考》", shelf: "天象录 · 卷七", kind: "星图册", description: "关于裂天之痕的残存观测与勘验。", icon: Sparkles },
  { id: "aether", title: "《星辉锻造注记》", shelf: "工造集 · 卷三", kind: "工坊手札", description: "锻炉与术士塔共同留下的星辉使用守则。", icon: Feather },
  { id: "blightborn", title: "《蚀影录》", shelf: "异象簿 · 卷一", kind: "封存卷", description: "巡夜人收集的目击记录，边缘多有烧痕。", icon: ScrollText },
  { id: "greyfalcon", title: "《北境地志：灰隼堡》", shelf: "边境志 · 卷九", kind: "地志册", description: "银杉边境的旧堡、南墙与往来道路。", icon: BookOpen },
  { id: "silverpine", title: "《银杉边境行记》", shelf: "行旅录 · 卷四", kind: "行旅册", description: "一位王国测绘师留下的林地与矿道笔记。", icon: BookOpen },
  { id: "oath", title: "《骑士誓约摘录》", shelf: "誓词集 · 卷六", kind: "羊皮卷", description: "旧骑士团关于承伤誓约的手抄副本。", icon: Feather },
] as const;

type ArchiveVolumeId = (typeof ARCHIVE_VOLUMES)[number]["id"];

export default function Chronicle() {
  const { isAuthenticated } = useAuth();
  const playerName = usePlayerName(isAuthenticated);
  const lore = trpc.meta.lore.useQuery();
  const chapters = trpc.meta.chapters.useQuery();
  const utils = trpc.useUtils();
  const questHistory = trpc.keep.questHistory.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const storyArchive = trpc.world.storyArchive.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const [claimingQuest, setClaimingQuest] = useState<string | null>(null);
  const [prologueOpen, setPrologueOpen] = useState(false);
  const [openArchive, setOpenArchive] = useState<ArchiveVolumeId | null>(null);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null);
  const [openStorySceneKey, setOpenStorySceneKey] = useState<string | null>(null);
  const claimQuest = trpc.keep.claimQuest.useMutation({
    onMutate: (input) => setClaimingQuest(input.questKey),
    onSuccess: async () => {
      toast.success("奖励已入库");
      await Promise.all([questHistory.refetch(), utils.keep.home.invalidate(), utils.keep.quests.invalidate(), utils.keep.resources.invalidate()]);
    },
    onError: (error) => toast.error("领取失败", { description: error.message }),
    onSettled: () => setClaimingQuest(null),
  });

  if (lore.isLoading) {
    return (
      <>
        <PageMusic src="/aetherfall-assets/chronicle-theme.mp3" storageKey="aetherfall:chronicle-music-muted" areaName="编年史" />
        <PageSection title="编年史">
          <SkeletonState rows={5} />
        </PageSection>
      </>
    );
  }

  if (lore.isError || !lore.data) {
    return (
      <>
        <PageMusic src="/aetherfall-assets/chronicle-theme.mp3" storageKey="aetherfall:chronicle-music-muted" areaName="编年史" />
        <PageSection title="编年史">
          <ErrorState message={lore.error?.message ?? "世界观读取失败"} onRetry={() => lore.refetch()} />
        </PageSection>
      </>
    );
  }

  const data = lore.data;
  const activeVolume = ARCHIVE_VOLUMES.find((volume) => volume.id === openArchive) ?? null;
  const archivedScenes = storyArchive.data ?? [];
  const openStory = archivedScenes.find((scene) => scene.sceneKey === openStorySceneKey) ?? null;
  const archiveText = (term: string) => data.glossary.find((entry) => entry.term === term)?.text ?? "此卷散佚，仅余题签。";

  return (
    <>
      <PageMusic src="/aetherfall-assets/chronicle-theme.mp3" storageKey="aetherfall:chronicle-music-muted" areaName="编年史" />
      <PageSection
      title="编年史"
      eyebrow={`${data.world} · ${data.era}`}
      actions={
        <Link href="/keep">
          <Button size="sm" variant="outline" className="border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]">
            <ArrowLeft size={13} className="mr-1" />
            返回领地
          </Button>
        </Link>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <Panel className="overflow-hidden p-0">
            <div className="relative">
              <img src={WORLD_ART} alt={data.world} className="h-44 w-full object-cover opacity-60 sm:h-56" onError={(event) => { event.currentTarget.style.display = "none"; }} />
              <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--ink-950)] via-[color:var(--ink-950)]/50 to-transparent" />
              <div className="absolute bottom-3 left-4 right-4">
                <div className="text-caption">{data.subtitle}</div>
                <div className="text-display text-xl text-[color:var(--parchment)]">{data.world}</div>
                <p className="text-xs italic text-[color:var(--gold-300)]">「{data.tagline}」</p>
              </div>
            </div>
            <div className="p-4">
              <p className="text-sm leading-relaxed text-[color:var(--parchment-dim)]">{data.summary}</p>
              <GoldRule />
              <div className="text-caption mb-1">你的身份</div>
              <p className="text-sm leading-relaxed text-[color:var(--parchment-dim)]">{data.playerRole}</p>
              <div className="mt-3 rounded-sm border border-[color:var(--gold-600)]/40 bg-[color:var(--ink-800)]/60 p-2.5">
                <div className="text-caption mb-1">叙事基调</div>
                <p className="text-xs leading-relaxed text-[color:var(--parchment-muted)]">{data.tone}</p>
              </div>
            </div>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Border Annals" title="边境纪要" />
            <GoldRule />
            <p className="mb-3 text-xs leading-relaxed text-[color:var(--parchment-muted)]">节点剧情的最终抉择会按章节誊入此处。展开章节，再取阅其中的单份纪事。</p>
            {!isAuthenticated ? <p className="text-xs text-[color:var(--parchment-muted)]">登入领地后，可查阅已收录的边境纪事。</p> : null}
            {isAuthenticated && storyArchive.isLoading ? <SkeletonState rows={3} /> : null}
            {isAuthenticated && storyArchive.isError ? <ErrorState message={storyArchive.error?.message ?? "边境纪要读取失败"} onRetry={() => storyArchive.refetch()} /> : null}
            {!isAuthenticated || storyArchive.isLoading || storyArchive.isError ? null : (
            <ol className="space-y-2">
              <li>
                <button type="button" className="flex w-full gap-3 rounded-sm border border-[color:var(--gold-600)]/60 bg-[color:var(--ink-800)]/55 p-2.5 text-left hover:border-[color:var(--gold-400)]" onClick={() => setPrologueOpen(true)}>
                  <span className="text-display shrink-0 text-lg text-[color:var(--gold-500)]">00</span>
                  <span className="min-w-0">
                    <span className="text-display block text-sm text-[color:var(--parchment)]">序章 · 第零章</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-[color:var(--parchment-muted)]">灰隼堡的门前，写下第一个被记住的名字。</span>
                  </span>
                </button>
              </li>
              {chapters.data?.chapters.map((chapter) => {
                const sceneCount = (chapters.data?.scenes ?? []).filter((scene) => scene.chapter === chapter.chapter).length;
                const entries = archivedScenes.filter((scene) => scene.chapter === chapter.chapter);
                const expanded = expandedChapter === chapter.chapter;
                return (
                  <li key={chapter.chapter} className="overflow-hidden rounded-sm border border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/40">
                    <button type="button" className="flex w-full gap-3 p-2.5 text-left hover:bg-[color:var(--ink-700)]/35" onClick={() => setExpandedChapter(expanded ? null : chapter.chapter)} aria-expanded={expanded}>
                      <span className="text-display shrink-0 text-lg text-[color:var(--gold-600)]">{String(chapter.chapter).padStart(2, "0")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-display text-sm text-[color:var(--parchment)]">{chapter.title}</span>
                          <Tag tone={entries.length > 0 ? "aether" : "neutral"}>{entries.length > 0 ? `收录 ${entries.length}/${sceneCount}` : `${sceneCount} 个场景`}</Tag>
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-[color:var(--parchment-muted)]">{chapter.summary}</span>
                      </span>
                      <ChevronDown size={16} className={`mt-1 shrink-0 text-[color:var(--gold-500)] transition-transform ${expanded ? "rotate-180" : ""}`} />
                    </button>
                    {expanded ? (
                      <div className="border-t border-[color:var(--ink-500)]/45 bg-[color:var(--ink-950)]/25 p-2.5">
                        {entries.length === 0 ? <p className="px-1 py-1 text-xs text-[color:var(--parchment-muted)]">本章尚无已收录的节点纪事。</p> : (
                          <div className="space-y-1.5">
                            {entries.map((entry) => (
                              <button key={entry.sceneKey} type="button" className="card-tap w-full rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/55 px-2.5 py-2 text-left hover:border-[color:var(--gold-500)]/75" onClick={() => setOpenStorySceneKey(entry.sceneKey)}>
                                <span className="flex items-center justify-between gap-2">
                                  <span className="text-sm text-[color:var(--parchment)]">{entry.title}</span>
                                  <span className="text-[0.62rem] text-[color:var(--gold-300)]">取阅</span>
                                </span>
                                <span className="mt-0.5 block truncate text-[0.68rem] text-[color:var(--parchment-muted)]">所录抉择：{entry.choiceText}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            )}
          </Panel>

          {isAuthenticated ? (
            <Panel>
              <SectionTitle eyebrow="Quest Archive" title="任务记录" />
              <GoldRule />
              {questHistory.isLoading ? (
                <SkeletonState rows={2} />
              ) : questHistory.isError ? (
                <ErrorState message={questHistory.error?.message ?? "任务记录读取失败"} onRetry={() => questHistory.refetch()} />
              ) : (questHistory.data ?? []).length === 0 ? (
                <p className="text-xs text-[color:var(--parchment-muted)]">完成的任务会在这里留下记录。</p>
              ) : (
                <div className="space-y-2">
                  {(questHistory.data ?? []).map((quest) => {
                    const rewards = Object.entries(quest.rewards ?? {}).filter(([key, value]) => key !== "items" && Number(value) > 0);
                    const items = Array.isArray(quest.rewards?.items) ? quest.rewards.items : [];
                    return (
                      <div key={quest.questKey} className="rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/45 p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm text-[color:var(--parchment)]">{quest.name}</span>
                              <Tag tone={quest.questType === "main" ? "gold" : quest.questType === "side" ? "aether" : "neutral"}>
                                {quest.questType === "main" ? "主线" : quest.questType === "side" ? "支线" : "日常"}
                              </Tag>
                              {quest.status === "claimed" ? <Tag tone="neutral">已领取</Tag> : <Tag tone="gold">待领取</Tag>}
                            </div>
                            <div className="mt-0.5 text-[0.66rem] text-[color:var(--parchment-muted)]">
                              第 {quest.chapter} 章 · 完成于 {quest.completedAt ? new Date(quest.completedAt).toLocaleString("zh-CN") : "未知时间"}
                            </div>
                          </div>
                          {quest.status === "completed" ? (
                            <Button size="sm" className="btn-gold h-7 border-transparent px-2 text-[0.68rem] text-[color:var(--ink-950)]" onClick={() => claimQuest.mutate({ questKey: quest.questKey })} disabled={claimingQuest === quest.questKey}>
                              {claimingQuest === quest.questKey ? "领取中…" : "领取"}
                            </Button>
                          ) : (
                            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[color:var(--verdant)]" />
                          )}
                        </div>
                        {quest.description ? <p className="mt-1 text-xs leading-relaxed text-[color:var(--parchment-muted)]">{quest.description}</p> : null}
                        {rewards.length > 0 || items.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.68rem] text-[color:var(--gold-300)]">
                            {rewards.map(([key, value]) => <span key={key}>{resourceName(key)} +{Number(value).toLocaleString("zh-CN")}</span>)}
                            {items.map((item, index) => {
                              const entry = item as { equipKey?: string; quantity?: number };
                              return <span key={`${entry.equipKey ?? "item"}-${index}`}>装备 {entry.equipKey ?? "未知"} ×{entry.quantity ?? 1}</span>;
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          ) : null}
        </div>

        <div className="space-y-4">
          <Panel className="overflow-hidden p-0">
            <div className="border-b border-[color:var(--gold-600)]/35 bg-[linear-gradient(135deg,rgba(211,170,67,0.12),rgba(12,20,30,0.15)_45%,rgba(12,20,30,0.6))] p-4">
              <SectionTitle eyebrow="Royal Archive" title="凯尔文尼亚皇家图书馆" />
              <p className="mt-2 max-w-xl text-xs leading-relaxed text-[color:var(--parchment-muted)]">
                王都陷落后，自北塔库房寻回的残存抄本。取下一卷，方可阅览馆藏记述。
              </p>
            </div>
            <div className="p-4">
            <GoldRule />
            <div className="grid gap-2 sm:grid-cols-2">
              {ARCHIVE_VOLUMES.map((volume, index) => {
                const Icon = volume.icon;
                return (
                  <button
                    key={volume.id}
                    type="button"
                    onClick={() => setOpenArchive(volume.id)}
                    className="group relative min-h-28 overflow-hidden rounded-sm border border-[color:var(--ink-500)]/65 bg-[color:var(--ink-800)]/55 p-3 text-left transition-colors hover:border-[color:var(--gold-400)] hover:bg-[color:var(--ink-700)]/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--gold-400)]"
                    aria-label={`阅览${volume.title}`}
                  >
                    <span className="absolute inset-y-2 left-0 w-px bg-[color:var(--gold-500)]/70" />
                    <span className="absolute -right-4 -top-5 text-6xl font-serif text-[color:var(--gold-500)]/[0.06]">{String(index + 1).padStart(2, "0")}</span>
                    <span className="relative flex items-start gap-2.5">
                      <span className="mt-0.5 rounded-sm border border-[color:var(--gold-600)]/50 bg-[color:var(--ink-950)]/55 p-1.5 text-[color:var(--gold-400)]">
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0">
                        <span className="text-caption block text-[0.6rem] tracking-[0.13em]">{volume.shelf}</span>
                        <span className="text-display mt-0.5 block text-sm leading-snug text-[color:var(--parchment)] group-hover:text-[color:var(--gold-200)]">{volume.title}</span>
                        <span className="mt-1 block text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">{volume.description}</span>
                      </span>
                    </span>
                    <span className="absolute bottom-2 right-2 rounded-sm border border-[color:var(--ink-500)]/60 px-1.5 py-0.5 text-[0.58rem] tracking-[0.08em] text-[color:var(--gold-300)]/80">{volume.kind}</span>
                  </button>
                );
              })}
            </div>
            </div>
          </Panel>
        </div>
      </div>
      </PageSection>
      {activeVolume ? (
        <Dialog open onOpenChange={(open) => { if (!open) setOpenArchive(null); }}>
          <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] max-w-2xl gap-0 overflow-y-auto border-[color:var(--gold-600)]/60 bg-[color:var(--ink-950)] p-0 text-[color:var(--parchment)] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[color:var(--gold-600)]/40 bg-[color:var(--ink-950)]/95 p-4 backdrop-blur">
              <DialogHeader className="gap-1 text-left">
                <DialogDescription className="text-caption text-[color:var(--gold-500)]">凯尔文尼亚皇家图书馆 · {activeVolume.shelf}</DialogDescription>
                <DialogTitle className="text-display text-xl text-[color:var(--parchment)]">{activeVolume.title}</DialogTitle>
              </DialogHeader>
              <Button size="sm" variant="outline" className="shrink-0 border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]" onClick={() => setOpenArchive(null)}>
                <X size={14} className="mr-1" />
                合卷
              </Button>
            </div>
            <article className="p-5 sm:p-7">
              <p className="border-l-2 border-[color:var(--gold-600)]/70 pl-3 text-sm leading-7 text-[color:var(--gold-200)]/90">
                {activeVolume.description}
              </p>
              <GoldRule />
              {activeVolume.id === "factions" ? (
                <div className="space-y-4">
                  <p className="text-sm leading-7 text-[color:var(--parchment-dim)]">抄录于裂隙纪元第七年冬末。以下六方常见于边境文书、商路印信与巡夜人的口述之中。</p>
                  {data.factions.map((faction, index) => (
                    <section key={faction.key} className="rounded-sm border border-[color:var(--ink-500)]/55 bg-[color:var(--ink-900)]/55 p-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-display text-base text-[color:var(--parchment)]">{String(index + 1).padStart(2, "0")} · {faction.name}</h3>
                        <span className="text-caption rounded-sm border border-[color:var(--gold-600)]/45 px-1.5 py-0.5">{faction.alignment}</span>
                      </div>
                      <p className="mt-2 text-sm italic leading-6 text-[color:var(--gold-300)]">“{faction.motto}”</p>
                      <p className="mt-2 text-sm leading-7 text-[color:var(--parchment-dim)]">馆吏按旧卷所记：{faction.note}</p>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="space-y-4 text-sm leading-7 text-[color:var(--parchment-dim)]">
                  <p>抄写员注：{archiveText(activeVolume.id === "rift" ? "裂隙" : activeVolume.id === "aether" ? "星辉" : activeVolume.id === "blightborn" ? "蚀影" : activeVolume.id === "greyfalcon" ? "灰隼堡" : activeVolume.id === "silverpine" ? "银杉边境" : "誓约联结")}</p>
                  <p>{activeVolume.id === "rift" ? "此页旁以红墨标有七道短线；其中三道下方留着渡口、矿井与废塔的地名，余下四道皆被后人刮去。" : activeVolume.id === "aether" ? "卷末特别写明：凡收集星辉者，应以铅匣隔潮，以蜡封记数；来历不明的浮尘不可投入民宅炉火。" : activeVolume.id === "blightborn" ? "夜巡簿的页边反复出现同一句提醒：遇见会呼唤旧名的影子，先记下其所言，再点灯离去。" : activeVolume.id === "greyfalcon" ? "北墙旧刻已不可辨，南墙的补石却有七种颜色。馆藏地图将此处标作通往银杉林的最后一座有名城堡。" : activeVolume.id === "silverpine" ? "春融时道路常被雪水改写；测绘师建议行旅者沿银杉树皮上的白痕辨认北向，切莫信赖旧里程碑。" : "旧誓词载于骑士团晨祷之后：持盾者可分担同袍所受之伤，直至誓词断绝或一方离场。"}</p>
                  <p className="text-xs italic text-[color:var(--gold-300)]/80">——北塔抄写室副本，封存印记尚存。</p>
                </div>
              )}
            </article>
          </DialogContent>
        </Dialog>
      ) : null}
      {openStory ? (
        <Dialog open onOpenChange={(open) => { if (!open) setOpenStorySceneKey(null); }}>
          <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] max-w-2xl gap-0 overflow-y-auto border-[color:var(--gold-600)]/60 bg-[color:var(--ink-950)] p-0 text-[color:var(--parchment)] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[color:var(--gold-600)]/40 bg-[color:var(--ink-950)]/95 p-4 backdrop-blur">
              <DialogHeader className="gap-1 text-left">
                <DialogDescription className="text-caption text-[color:var(--gold-500)]">边境纪要 · 第 {openStory.chapter} 章 · 收录副本</DialogDescription>
                <DialogTitle className="text-display text-xl text-[color:var(--parchment)]">{openStory.title}</DialogTitle>
              </DialogHeader>
              <Button size="sm" variant="outline" className="shrink-0 border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]" onClick={() => setOpenStorySceneKey(null)}>
                <X size={14} className="mr-1" />
                合卷
              </Button>
            </div>
            <article className="p-5 sm:p-7">
              <div className="parchment space-y-3 rounded-sm p-4">
                {(openStory.beats as Array<{ speaker?: string; text?: string }>).map((beat, index) => (
                  <section key={index}>
                    <h3 className="text-display text-xs text-[color:var(--gold-300)]">{beat.speaker ?? "旁白"}</h3>
                    <p className="mt-1 text-sm leading-7 text-[color:var(--parchment-dim)]">{beat.text}</p>
                  </section>
                ))}
              </div>
              <GoldRule />
              <section className="rounded-sm border border-[color:var(--gold-600)]/55 bg-[color:var(--ink-800)]/65 p-3.5">
                <div className="text-caption text-[color:var(--gold-400)]">最终抉择</div>
                <p className="mt-1 text-sm leading-relaxed text-[color:var(--parchment)]">{openStory.choiceText}</p>
                {openStory.reply ? <p className="mt-2 text-sm leading-7 text-[color:var(--parchment-muted)]">{openStory.reply}</p> : null}
                <p className="mt-3 text-[0.62rem] text-[color:var(--parchment-muted)]">誊录于 {new Date(openStory.recordedAt).toLocaleString("zh-CN")}</p>
              </section>
            </article>
          </DialogContent>
        </Dialog>
      ) : null}
      {prologueOpen ? <WelcomeRitual mode="replay" playerName={playerName} onClose={() => setPrologueOpen(false)} /> : null}
    </>
  );
}
