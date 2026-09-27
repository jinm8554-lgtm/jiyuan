/**
 * 游戏外壳：顶部资源条 + 侧边导航（桌面）/ 底部导航（移动）+ 内容区
 * 导航项为游戏主循环的六个入口：主城 / 世界 / 同伴 / 招募 / 议事厅 / 编年史
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, LogOut, Menu, Settings, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { RESOURCE_ICON, FalconCrest, BuildingIcon, CompassIcon, UsersIcon, AetherRune, HallIcon, BookIcon } from "./GameIcons";
import { ProgressBar, ResourcePill } from "./ui";

export const NAV_ITEMS = [
  { path: "/keep", label: "主城", icon: BuildingIcon, hint: "领地 · 建筑 · 议事厅待办" },
  { path: "/world", label: "世界地图", icon: CompassIcon, hint: "探索 · 战斗 · 区域征服" },
  { path: "/roster", label: "同伴", icon: UsersIcon, hint: "角色 · 装备 · 羁绊 · 队伍" },
  { path: "/recruit", label: "招募", icon: AetherRune, hint: "普通/稀有/活动卡池与概率公示" },
  { path: "/council", label: "议事厅", icon: HallIcon, hint: "AI 在场角色互动" },
  { path: "/chronicle", label: "编年史", icon: BookIcon, hint: "世界观 · 势力 · 章节 · 设定" },
] as const;

/** 顶部资源条（服务端为权威数据，前端只展示） */
function ResourceBar() {
  const { data, isLoading } = trpc.keep.resources.useQuery(undefined, { refetchInterval: 60_000 });
  const resources = data?.resources;

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {isLoading || !resources ? (
        <div className="flex items-center gap-2 text-xs text-[color:var(--parchment-muted)]">
          <Loader2 size={13} className="animate-spin" />
          读取领地资源…
        </div>
      ) : (
        <>
          <ResourcePill kind="gold" value={resources.gold} />
          <ResourcePill kind="food" value={resources.food} />
          <ResourcePill kind="wood" value={resources.wood} />
          <ResourcePill kind="iron" value={resources.iron} />
          <ResourcePill kind="aether" value={resources.aether} />
          <ResourcePill kind="renown" value={resources.renown} />
          <div className="ml-1 hidden w-28 shrink-0 sm:block">
            <ProgressBar value={resources.stamina} max={resources.staminaMax} tone="ember" height={6} showLabel label="体力" />
          </div>
        </>
      )}
    </div>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/keep" className="flex min-w-0 items-center gap-2">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-[color:var(--gold-600)]/60 bg-[color:var(--ink-950)] text-[color:var(--gold-500)]">
        <FalconCrest size={18} />
      </span>
      {!compact ? (
        <span className="min-w-0">
          <span className="text-display block truncate text-sm leading-tight text-[color:var(--parchment)]">裂隙纪元</span>
          <span className="block truncate text-[0.62rem] uppercase tracking-[0.16em] text-[color:var(--parchment-muted)]">Aetherfall Chronicle</span>
        </span>
      ) : null}
    </Link>
  );
}

export function GameShell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location]);

  const active = NAV_ITEMS.find((item) => location.startsWith(item.path));
  const isAdmin = user?.role === "admin";

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-3 text-[color:var(--parchment-muted)]">
          <Loader2 size={24} className="animate-spin text-[color:var(--gold-500)]" />
          <span className="text-sm">正在校验会话…</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="panel panel-gold max-w-md p-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-sm border border-[color:var(--gold-600)]/60 bg-[color:var(--ink-950)] text-[color:var(--gold-500)]">
            <FalconCrest size={26} />
          </div>
          <h1 className="text-display text-xl text-[color:var(--parchment)]">会话已过期</h1>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--parchment-dim)]">
            登录状态已失效，请重新登录后继续。你的领地进度保存在服务器数据库中，重新登录即可恢复。
          </p>
          <Button className="btn-gold mt-4 w-full border-transparent text-[color:var(--ink-950)]" onClick={() => startLogin()}>
            使用 Manus 账号登录
          </Button>
          <Link href="/" className="mt-3 block text-xs text-[color:var(--parchment-muted)] underline">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* 顶部栏 */}
      <header className="sticky top-0 z-30 border-b border-[color:var(--ink-500)]/60 bg-[color:var(--ink-950)]/92 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center gap-3 px-3 py-2 sm:px-5">
          <button className="grid h-8 w-8 place-items-center rounded-sm border border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)] lg:hidden" onClick={() => setMobileNavOpen((value) => !value)} aria-label="打开导航">
            {mobileNavOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
          <BrandMark />
          <div className="ml-2 hidden min-w-0 flex-1 lg:block">
            <ResourceBar />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[0.68rem] text-[color:var(--parchment-muted)] sm:block">
              {now.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })} · 裂隙纪元第 7 年
            </span>
            {isAdmin ? (
              <Link href="/gm">
                <Button size="sm" variant="outline" className="h-8 border-[color:var(--gold-600)]/60 text-[color:var(--gold-300)]">
                  <Settings size={13} className="mr-1" />
                  GM 后台
                </Button>
              </Link>
            ) : null}
            <div className="hidden items-center gap-2 sm:flex">
              <ShieldCheck size={14} className="text-[color:var(--gold-600)]" />
              <span className="max-w-[120px] truncate text-xs text-[color:var(--parchment-dim)]">{user?.name ?? "领主"}</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-[color:var(--parchment-muted)] hover:text-[color:var(--parchment)]"
              onClick={() => logout()}
              aria-label="退出登录"
            >
              <LogOut size={14} />
            </Button>
          </div>
        </div>
        {/* 移动端资源条 */}
        <div className="border-t border-[color:var(--ink-500)]/40 px-3 py-1.5 sm:px-5 lg:hidden">
          <ResourceBar />
        </div>
        {/* 桌面顶部导航 */}
        <nav className="hidden border-t border-[color:var(--ink-500)]/40 lg:block">
          <div className="mx-auto flex max-w-[1500px] gap-1 px-5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={cn(
                    "group relative flex items-center gap-2 px-3 py-2 text-sm transition-colors",
                    isActive ? "text-[color:var(--gold-300)]" : "text-[color:var(--parchment-dim)] hover:text-[color:var(--parchment)]",
                  )}
                >
                  <Icon size={15} />
                  {item.label}
                  <span
                    className={cn(
                      "absolute inset-x-2 -bottom-px h-[2px] rounded-full transition-opacity",
                      isActive ? "bg-[color:var(--gold-500)] opacity-100" : "opacity-0",
                    )}
                  />
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      {/* 移动端抽屉导航 */}
      {mobileNavOpen ? (
        <div className="border-b border-[color:var(--ink-500)]/50 bg-[color:var(--ink-950)]/98 px-3 py-2 lg:hidden">
          <div className="grid grid-cols-2 gap-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={cn(
                    "card-tap flex items-center gap-2 rounded-sm border px-3 py-2 text-sm",
                    isActive ? "border-[color:var(--gold-600)]/70 bg-[color:var(--ink-800)] text-[color:var(--gold-300)]" : "border-[color:var(--ink-500)]/60 text-[color:var(--parchment-dim)]",
                  )}
                >
                  <Icon size={15} />
                  <span className="min-w-0">
                    <span className="block truncate">{item.label}</span>
                    <span className="block truncate text-[0.62rem] text-[color:var(--parchment-muted)]">{item.hint}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-3 pb-24 pt-4 sm:px-5 lg:pb-10">
        {active ? (
          <div className="mb-4 flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.18em] text-[color:var(--parchment-muted)]">
            <span className="h-px w-6 bg-[color:var(--gold-600)]/60" />
            {active.label} · {active.hint}
          </div>
        ) : null}
        {children}
      </main>

      {/* 移动端底部导航 */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--ink-500)]/60 bg-[color:var(--ink-950)]/96 pb-safe backdrop-blur lg:hidden">
        <div className="grid grid-cols-6">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location.startsWith(item.path);
            return (
              <Link
                key={item.path}
                href={item.path}
                className={cn("flex flex-col items-center gap-0.5 py-2 text-[0.62rem] transition-colors", isActive ? "text-[color:var(--gold-300)]" : "text-[color:var(--parchment-muted)]")}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/** 通用页面容器（统一标题与间距，页面内部不必重复实现） */
export function PageSection({ title, eyebrow, children, actions }: { title: string; eyebrow?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  void RESOURCE_ICON;
  return (
    <section className="rise-in">
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            {eyebrow ? <div className="text-caption mb-1">{eyebrow}</div> : null}
            <h1 className="text-display text-xl text-[color:var(--parchment)] sm:text-2xl">{title}</h1>
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}