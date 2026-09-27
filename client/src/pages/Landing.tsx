/**
 * 首页（未登录可见）：世界观引入 + 玩法概览 + 登录入口
 * 布局原则：非对称双栏（左侧叙事、右侧数据面板），避免通用居中大 Hero
 */
import { Link } from "wouter";
import { ArrowRight, BookOpen, Compass, Loader2, ShieldCheck, Sparkles, Users } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { FalconCrest, HallIcon } from "@/components/game/GameIcons";
import { AllAgesNote, ErrorState } from "@/components/game/ui";

const SCENE = {
  keep: "/aetherfall-assets/keep_home_34f36c55.jpg",
  banner: "/aetherfall-assets/keep_banner_999e1122.jpg",
};

export default function Landing() {
  const { isAuthenticated, loading } = useAuth();
  const landing = trpc.meta.landing.useQuery();
  const lore = trpc.meta.lore.useQuery();
  const health = trpc.meta.health.useQuery();

  return (
    <div className="min-h-screen">
      <header className="border-b border-[color:var(--ink-500)]/50 bg-[color:var(--ink-950)]/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-sm border border-[color:var(--gold-600)]/60 bg-[color:var(--ink-950)] text-[color:var(--gold-500)]">
            <FalconCrest size={20} />
          </span>
          <div className="min-w-0">
            <div className="text-display truncate text-sm text-[color:var(--parchment)]">裂隙纪元</div>
            <div className="truncate text-[0.6rem] uppercase tracking-[0.2em] text-[color:var(--parchment-muted)]">Aetherfall Chronicle</div>
          </div>
          <nav className="ml-auto hidden items-center gap-4 text-sm text-[color:var(--parchment-dim)] md:flex">
            <a href="#world" className="hover:text-[color:var(--gold-300)]">世界</a>
            <a href="#play" className="hover:text-[color:var(--gold-300)]">玩法</a>
            <a href="#chapters" className="hover:text-[color:var(--gold-300)]">章节</a>
            <a href="#allages" className="hover:text-[color:var(--gold-300)]">内容分级</a>
          </nav>
          <div className="ml-auto md:ml-0">
            {loading ? (
              <Loader2 size={16} className="animate-spin text-[color:var(--gold-500)]" />
            ) : isAuthenticated ? (
              <Link href="/keep">
                <Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]">
                  进入领地
                  <ArrowRight size={14} className="ml-1" />
                </Button>
              </Link>
            ) : (
              <Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={() => startLogin()}>
                登录 / 注册
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* 首屏：非对称双栏 */}
      <section className="relative overflow-hidden border-b border-[color:var(--ink-500)]/40">
        <img src={SCENE.banner} alt="灰隼堡黄昏全景" className="absolute inset-0 h-full w-full object-cover opacity-40" onError={(event) => { event.currentTarget.style.display = "none"; }} />
        <div className="absolute inset-0 bg-gradient-to-r from-[color:var(--ink-950)] via-[color:var(--ink-950)]/85 to-transparent" />
        <div className="relative mx-auto grid max-w-[1400px] gap-8 px-4 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
          <div className="rise-in">
            <div className="mb-4 inline-flex items-center gap-2 rounded-sm border border-[color:var(--aether-500)]/50 bg-[color:var(--ink-950)]/70 px-2.5 py-1 text-[0.7rem] text-[color:var(--aether-300)]">
              <Sparkles size={12} />
              全年龄向 · 原创中世纪西幻领地 RPG
            </div>
            <h1 className="text-display text-3xl leading-[1.15] text-[color:var(--parchment)] sm:text-5xl">
              当天空裂开，
              <br />
              世界学会用记忆当作燃料。
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-[color:var(--parchment-dim)] sm:text-base">
              {lore.data?.summary ??
                "旧王国在战争、瘟疫与魔物灾害中崩坏。你继承了瓦尔登家族最后的封地——银杉边境上的灰隼堡。修好南墙、点亮灯塔、让流亡者知道这里还有屋檐。"}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {isAuthenticated ? (
                <Link href="/keep">
                  <Button className="btn-gold border-transparent text-[color:var(--ink-950)]">
                    回到我的领地
                    <ArrowRight size={15} className="ml-1" />
                  </Button>
                </Link>
              ) : (
                <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={() => startLogin()}>
                  创建我的领地档案
                  <ArrowRight size={15} className="ml-1" />
                </Button>
              )}
              <Link href="/chronicle">
                <Button variant="outline" className="border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)]/70 text-[color:var(--gold-300)]">
                  <BookOpen size={15} className="mr-1.5" />
                  阅读世界观设定
                </Button>
              </Link>
            </div>
            {health.data && !health.data.ok ? (
              <p className="mt-4 text-xs text-[color:var(--ember-400)]">提示：{health.data.message}（登录后部分功能可能暂不可用）</p>
            ) : null}
          </div>

          <div className="rise-in stagger-2 space-y-3">
            <div className="panel panel-gold p-4">
              <div className="text-caption mb-2">领地状态 · 灰隼堡</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {[
                  { k: "南墙", v: "漏风中", tone: "text-[color:var(--ember-400)]" },
                  { k: "账本", v: "赤字", tone: "text-[color:var(--ember-400)]" },
                  { k: "灰隼旗", v: "仍在", tone: "text-[color:var(--gold-300)]" },
                  { k: "守备队", v: "2 人", tone: "text-[color:var(--parchment)]" },
                ].map((item) => (
                  <div key={item.k} className="flex items-center justify-between border-b border-[color:var(--ink-600)]/50 pb-1.5">
                    <span className="text-[color:var(--parchment-muted)]">{item.k}</span>
                    <span className={item.tone}>{item.v}</span>
                  </div>
                ))}
              </div>
              <hr className="rule-gold my-3" />
              <p className="text-xs leading-relaxed text-[color:var(--parchment-dim)]">
                领地是你的存档：建筑等级、资源、任务、地图进度、聊天记录全部保存在服务器数据库，客户端更新不会覆盖玩家数据。
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { n: "6", l: "区域" },
                { n: "35", l: "可攻克节点" },
                { n: "7", l: "可建建筑" },
                { n: "7", l: "职业分工" },
                { n: "15", l: "原创角色" },
                { n: "6", l: "剧情章节" },
              ].map((item) => (
                <div key={item.l} className="panel p-2.5">
                  <div className="text-display text-lg text-[color:var(--gold-300)]">{item.n}</div>
                  <div className="text-[0.66rem] text-[color:var(--parchment-muted)]">{item.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 玩法 */}
      <section id="play" className="mx-auto max-w-[1400px] px-4 py-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <div className="text-caption mb-1">Core Loop</div>
            <h2 className="text-display text-2xl text-[color:var(--parchment)]">经营 → 集结 → 探索 → 征服</h2>
          </div>
          <p className="hidden max-w-sm text-xs leading-relaxed text-[color:var(--parchment-muted)] sm:block">
            所有数值在服务端结算：概率与保底、战斗结果、区域控制度与奖励都不可被客户端修改。
          </p>
        </div>

        {landing.isError ? (
          <ErrorState message="首页信息读取失败" onRetry={() => landing.refetch()} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(landing.data?.features ?? []).map((feature, index) => (
              <article key={feature.title} className={`panel card-tap card-lift rise-in stagger-${(index % 4) + 1} p-4`}>
                <div className="mb-2 flex items-center gap-2 text-[color:var(--gold-500)]">
                  {index === 0 ? <FalconCrest size={18} /> : index === 1 ? <Users size={18} /> : index === 2 ? <Compass size={18} /> : index === 3 ? <ShieldCheck size={18} /> : <HallIcon size={18} />}
                  <h3 className="text-display text-base text-[color:var(--parchment)]">{feature.title}</h3>
                </div>
                <p className="text-sm leading-relaxed text-[color:var(--parchment-dim)]">{feature.text}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 世界与势力 */}
      <section id="world" className="border-y border-[color:var(--ink-500)]/40 bg-[color:var(--ink-950)]/60">
        <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="text-caption mb-1">The World</div>
            <h2 className="text-display text-2xl text-[color:var(--parchment)]">{lore.data?.world ?? "瓦尔德兰大陆"}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[color:var(--parchment-dim)]">{lore.data?.playerRole}</p>
            <hr className="rule-gold my-4" />
            <div className="space-y-2">
              {(lore.data?.glossary ?? []).slice(0, 5).map((entry) => (
                <div key={entry.term} className="parchment rounded-sm p-2.5">
                  <div className="text-display text-xs text-[color:var(--gold-300)]">{entry.term}</div>
                  <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--parchment-dim)]">{entry.text}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-caption mb-2">六大势力</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(lore.data?.factions ?? []).map((faction) => (
                <div key={faction.key} className="panel p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-display text-sm text-[color:var(--parchment)]">{faction.name}</span>
                    <span className="rounded-sm border border-[color:var(--ink-500)]/70 px-1.5 py-0.5 text-[0.62rem] text-[color:var(--parchment-muted)]">{faction.alignment}</span>
                  </div>
                  <p className="mt-1 text-xs italic text-[color:var(--gold-300)]/85">「{faction.motto}」</p>
                  <p className="mt-1 text-xs leading-relaxed text-[color:var(--parchment-muted)]">{faction.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 章节 */}
      <section id="chapters" className="mx-auto max-w-[1400px] px-4 py-12">
        <div className="text-caption mb-1">Six Chapters</div>
        <h2 className="text-display mb-5 text-2xl text-[color:var(--parchment)]">六个章节的故事弧</h2>
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(lore.data?.chapters ?? []).map((chapter) => (
            <li key={chapter.chapter} className="panel flex gap-3 p-3">
              <span className="text-display shrink-0 text-lg text-[color:var(--gold-600)]">{String(chapter.chapter).padStart(2, "0")}</span>
              <span className="min-w-0">
                <span className="text-display block text-sm text-[color:var(--parchment)]">{chapter.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[color:var(--parchment-muted)]">{chapter.summary}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <footer id="allages" className="border-t border-[color:var(--ink-500)]/40 bg-[color:var(--ink-950)]/70">
        <div className="mx-auto max-w-[1400px] px-4 py-8">
          <div className="panel panel-gold p-4">
            <div className="text-caption mb-2">内容分级声明</div>
            <p className="text-sm leading-relaxed text-[color:var(--parchment-dim)]">{lore.data?.allAgesNote}</p>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[color:var(--parchment-muted)]">
            <span>© 裂隙纪元 · Aetherfall Chronicle — 原创世界观、角色与美术，独立开发</span>
            <span className="flex items-center gap-3">
              <Link href="/chronicle" className="hover:text-[color:var(--gold-300)]">编年史</Link>
              {isAuthenticated ? (
                <Link href="/keep" className="hover:text-[color:var(--gold-300)]">进入领地</Link>
              ) : (
                <button className="hover:text-[color:var(--gold-300)]" onClick={() => startLogin()}>登录 / 注册</button>
              )}
            </span>
          </div>
          <AllAgesNote className="mt-3" />
        </div>
      </footer>
    </div>
  );
}
