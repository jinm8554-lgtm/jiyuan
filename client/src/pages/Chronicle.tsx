/**
 * 编年史（世界观设定集）
 * 用途：无需登录即可阅读；同时作为游戏内「世界百科」入口
 */
import { Link } from "wouter";
import { ArrowLeft, BookOpen, Globe2, Scroll, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { PageSection } from "@/components/game/GameShell";
import { FalconCrest } from "@/components/game/GameIcons";
import { AllAgesNote, ErrorState, GoldRule, Panel, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";

const WORLD_ART = "/aetherfall-assets/worldmap_72ac880b.jpg";

export default function Chronicle() {
  const lore = trpc.meta.lore.useQuery();
  const chapters = trpc.meta.chapters.useQuery();

  if (lore.isLoading) {
    return (
      <PageSection title="编年史">
        <SkeletonState rows={5} />
      </PageSection>
    );
  }

  if (lore.isError || !lore.data) {
    return (
      <PageSection title="编年史">
        <ErrorState message={lore.error?.message ?? "世界观读取失败"} onRetry={() => lore.refetch()} />
      </PageSection>
    );
  }

  const data = lore.data;

  return (
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
            <SectionTitle eyebrow="Six Chapters" title="章节编年" />
            <GoldRule />
            <ol className="space-y-2">
              {chapters.data?.chapters.map((chapter) => {
                const sceneCount = (chapters.data?.scenes ?? []).filter((scene) => scene.chapter === chapter.chapter).length;
                return (
                  <li key={chapter.chapter} className="flex gap-3 rounded-sm border border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/40 p-2.5">
                    <span className="text-display shrink-0 text-lg text-[color:var(--gold-600)]">{String(chapter.chapter).padStart(2, "0")}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-display text-sm text-[color:var(--parchment)]">{chapter.title}</span>
                        <Tag tone="neutral">{sceneCount} 个场景</Tag>
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-[color:var(--parchment-muted)]">{chapter.summary}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel>
            <SectionTitle eyebrow="Factions" title="六大势力" />
            <GoldRule />
            <div className="space-y-2">
              {data.factions.map((faction) => (
                <div key={faction.key} className="rounded-sm border border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/45 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm text-[color:var(--parchment)]">
                      <FalconCrest size={14} className="text-[color:var(--gold-500)]" />
                      {faction.name}
                    </span>
                    <Tag tone={faction.alignment === "秩序" ? "gold" : faction.alignment === "自由" ? "aether" : "neutral"}>{faction.alignment}</Tag>
                  </div>
                  <p className="mt-1 text-xs italic text-[color:var(--gold-300)]/85">「{faction.motto}」</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--parchment-muted)]">{faction.note}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Glossary" title="名词释义" />
            <GoldRule />
            <div className="space-y-2">
              {data.glossary.map((entry) => (
                <div key={entry.term}>
                  <div className="flex items-center gap-1.5 text-xs text-[color:var(--gold-300)]">
                    <Sparkles size={11} />
                    {entry.term}
                  </div>
                  <p className="text-[0.7rem] leading-relaxed text-[color:var(--parchment-muted)]">{entry.text}</p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <SectionTitle eyebrow="Reading Guide" title="阅读提示" />
            <GoldRule />
            <ul className="space-y-1.5 text-[0.7rem] leading-relaxed text-[color:var(--parchment-muted)]">
              <li className="flex gap-1.5"><Globe2 size={12} className="mt-0.5 shrink-0 text-[color:var(--gold-500)]" />世界地图上带「剧情」标记的节点会在出征前后播放对应场景。</li>
              <li className="flex gap-1.5"><Scroll size={12} className="mt-0.5 shrink-0 text-[color:var(--gold-500)]" />剧情选择会写入服务器档案（storyFlags），影响后续对话与任务。</li>
              <li className="flex gap-1.5"><BookOpen size={12} className="mt-0.5 shrink-0 text-[color:var(--gold-500)]" />角色详情页可查看每个角色在故事当前阶段的个人状态。</li>
            </ul>
            <AllAgesNote className="mt-3" />
          </Panel>
        </div>
      </div>
    </PageSection>
  );
}