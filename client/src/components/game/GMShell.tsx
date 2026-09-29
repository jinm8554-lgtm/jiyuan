/**
 * GM 管理后台外壳
 * 与游戏客户端共用同一套设计令牌，但使用更紧凑的表单式布局
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { AlertTriangle, ArrowLeft, BookOpen, Compass, Cpu, Database, Layers, Loader2, Menu, Package, ScrollText, Send, ShieldCheck, Users, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { FalconCrest } from "./GameIcons";
import { AllAgesNote, Panel } from "./ui";

export const GM_NAV = [
  { path: "/gm", label: "总览", icon: ShieldCheck, hint: "运行状态与快捷入口" },
  { path: "/gm/pools", label: "招募池", icon: Layers, hint: "概率 / 保底 / 开放时间 / 模拟" },
  { path: "/gm/world", label: "世界地图", icon: Compass, hint: "区域 / 节点 / 敌人 / 奖励" },
  { path: "/gm/content", label: "装备与技能", icon: Package, hint: "装备、技能与套装" },
  { path: "/gm/story", label: "任务与剧情", icon: ScrollText, hint: "任务 / 剧情 / 事件 / 建筑" },
  { path: "/gm/ai", label: "AI 配置", icon: Cpu, hint: "Base URL / 密钥 / 模型 / 测试 / 日志" },
  { path: "/gm/members", label: "会员与角色", icon: Users, hint: "账号 / 档案 / 角色 / 权限" },
  { path: "/gm/delivery", label: "投递中心", icon: Send, hint: "全体或指定领主的信函与附件" },
  { path: "/gm/ops", label: "备份与运维", icon: Database, hint: "备份恢复 / 配置同步 / 审计" },
] as const;

export function GMShell({ children, title, eyebrow, actions }: { children: React.ReactNode; title: string; eyebrow?: string; actions?: React.ReactNode }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const overview = trpc.admin.overview.useQuery(undefined, { enabled: Boolean(isAuthenticated && user?.role === "admin"), refetchInterval: 120_000 });

  useEffect(() => setNavOpen(false), [location]);

  // 后台退出或会话失效时直接回到根登录页，不短暂显示访问限制页。
  useEffect(() => {
    if (!loading && !isAuthenticated) setLocation("/", { replace: true });
  }, [isAuthenticated, loading, setLocation]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 size={22} className="animate-spin text-[color:var(--gold-500)]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (user?.role !== "admin") {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <Panel className="max-w-md p-6 text-center">
          <AlertTriangle size={26} className="mx-auto text-[color:var(--ember-400)]" />
          <h1 className="text-display mt-3 text-lg text-[color:var(--parchment)]">权限不足</h1>
          <p className="mt-2 text-sm text-[color:var(--parchment-muted)]">
            当前账号（{user?.name ?? user?.openId}）不是管理员。请在数据库 `users.role` 中将其设为 `admin` 后重新登录。
          </p>
          <Link href="/keep" className="mt-4 inline-block">
            <Button variant="outline" className="border-[color:var(--ink-500)]/70">
              <ArrowLeft size={14} className="mr-1" />
              返回游戏
            </Button>
          </Link>
        </Panel>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-[color:var(--ink-500)]/60 bg-[color:var(--ink-950)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2 sm:px-5">
          <button className="grid h-8 w-8 place-items-center rounded-sm border border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)] lg:hidden" onClick={() => setNavOpen((value) => !value)} aria-label="切换导航">
            {navOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
          <Link href="/gm" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-sm border border-[color:var(--gold-600)]/60 text-[color:var(--gold-500)]">
              <FalconCrest size={17} />
            </span>
            <span className="min-w-0">
              <span className="text-display block text-sm leading-tight text-[color:var(--parchment)]">GM 管理后台</span>
              <span className="block text-[0.6rem] uppercase tracking-[0.16em] text-[color:var(--parchment-muted)]">Aetherfall Chronicle</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[0.68rem] text-[color:var(--parchment-muted)] md:block">
              {overview.data ? `角色 ${overview.data.counts.characters} · 会员 ${overview.data.counts.users} · AI 调用 ${overview.data.counts.aiCalls}` : ""}
            </span>
            <Link href="/keep">
              <Button size="sm" variant="outline" className="h-8 border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]">
                <BookOpen size={13} className="mr-1" />
                游戏客户端
              </Button>
            </Link>
            <Button size="sm" variant="ghost" className="h-8 text-[color:var(--parchment-muted)]" onClick={() => logout()}>
              退出
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 gap-4 px-3 py-4 sm:px-5">
        {/* 侧边导航 */}
        <aside className={cn("w-56 shrink-0 lg:block", navOpen ? "block" : "hidden")}>
          <nav className="sticky top-16 space-y-1">
            {GM_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = item.path === "/gm" ? location === "/gm" : location.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={cn(
                    "card-tap flex items-start gap-2 rounded-sm border px-2.5 py-2 text-sm",
                    isActive ? "border-[color:var(--gold-600)]/70 bg-[color:var(--ink-800)] text-[color:var(--gold-300)]" : "border-[color:var(--ink-500)]/40 text-[color:var(--parchment-dim)] hover:border-[color:var(--gold-600)]/50",
                  )}
                >
                  <Icon size={15} className="mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate">{item.label}</span>
                    <span className="block truncate text-[0.6rem] text-[color:var(--parchment-muted)]">{item.hint}</span>
                  </span>
                </Link>
              );
            })}
            <AllAgesNote className="mt-3" />
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              {eyebrow ? <div className="text-caption mb-1">{eyebrow}</div> : null}
              <h1 className="text-display text-xl text-[color:var(--parchment)]">{title}</h1>
            </div>
            {actions}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
