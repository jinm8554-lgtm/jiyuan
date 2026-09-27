/**
 * GM 总览：运行状态、内容统计、AI 调用概览、快捷入口
 */
import { Link } from "wouter";
import { toast } from "sonner";
import { ArrowRight, Cpu, Database, Layers, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { GMShell } from "@/components/game/GMShell";
import { EmptyState, ErrorState, GoldRule, Panel, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";

export default function GMOverview() {
  const utils = trpc.useUtils();
  const overview = trpc.admin.overview.useQuery(undefined, { refetchInterval: 60_000 });
  const sync = trpc.admin.syncBuiltInContent.useMutation({
    onSuccess: async (result: unknown) => {
      toast.success("内置配置已同步", { description: typeof result === "object" && result ? JSON.stringify(result).slice(0, 200) : undefined });
      await utils.admin.overview.invalidate();
    },
    onError: (error) => toast.error("同步失败", { description: error.message }),
  });

  if (overview.isLoading) {
    return (
      <GMShell title="总览">
        <SkeletonState rows={4} />
      </GMShell>
    );
  }

  if (overview.isError || !overview.data) {
    return (
      <GMShell title="总览">
        <ErrorState message={overview.error?.message ?? "读取失败"} onRetry={() => overview.refetch()} />
      </GMShell>
    );
  }

  const data = overview.data;

  return (
    <GMShell
      title="运行总览"
      eyebrow={`环境：Node ${data.environment.node} · 数据库 ${data.environment.hasDatabase ? "已连接" : "未连接"}`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="border-[color:var(--gold-600)]/50 text-[color:var(--gold-300)]" onClick={() => sync.mutate({ force: false })} disabled={sync.isPending}>
            <RefreshCw size={13} className={cn("mr-1", sync.isPending && "animate-spin")} />
            同步内置配置
          </Button>
          <Link href="/gm/characters">
            <Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]">
              角色库
              <ArrowRight size={13} className="ml-1" />
            </Button>
          </Link>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "角色总数", value: data.counts.characters, sub: `草稿 ${data.counts.draftCharacters}`, icon: Users, href: "/gm/characters" },
          { label: "注册会员", value: data.counts.users, sub: `游戏档案 ${data.counts.profiles}`, icon: ShieldCheck, href: "/gm/members" },
          { label: "招募池", value: data.counts.pools, sub: "概率与保底", icon: Layers, href: "/gm/pools" },
          { label: "世界节点", value: data.counts.nodes, sub: "区域与关卡", icon: Database, href: "/gm/world" },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href} className="card-tap card-lift panel p-3">
              <div className="flex items-center justify-between">
                <span className="text-caption">{card.label}</span>
                <Icon size={15} className="text-[color:var(--gold-500)]" />
              </div>
              <div className="text-display mt-1 text-2xl text-[color:var(--parchment)]">{card.value}</div>
              <div className="text-[0.66rem] text-[color:var(--parchment-muted)]">{card.sub}</div>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Panel>
          <SectionTitle eyebrow="AI Runtime" title="当前 AI 配置" action={<Link href="/gm/ai"><Button size="sm" variant="ghost" className="text-[color:var(--parchment-muted)]">配置 <ArrowRight size={12} className="ml-1" /></Button></Link>} />
          <GoldRule />
          {data.activeAi ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--parchment-muted)]">配置名称</span>
                <span className="text-[color:var(--gold-300)]">{data.activeAi.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--parchment-muted)]">模型</span>
                <span className="text-[color:var(--parchment-dim)]">{data.activeAi.model || "（未指定）"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--parchment-muted)]">网关模式</span>
                <Tag tone={data.activeAi.useBuiltInGateway ? "aether" : "gold"}>{data.activeAi.useBuiltInGateway ? "内置网关" : "外部兼容接口"}</Tag>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--parchment-muted)]">密钥</span>
                <span className="text-[0.7rem] text-[color:var(--parchment-dim)]">{data.activeAi.keyHint ?? "未配置"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[color:var(--parchment-muted)]">最近测试</span>
                <span className={cn("text-[0.7rem]", data.activeAi.lastTestStatus === "ok" ? "text-[color:var(--verdant)]" : "text-[color:var(--ember-400)]")}>
                  {data.activeAi.lastTestStatus ?? "未测试"}
                  {data.activeAi.lastTestAt ? ` · ${new Date(data.activeAi.lastTestAt).toLocaleString("zh-CN")}` : ""}
                </span>
              </div>
              <p className="pt-1 text-[0.66rem] leading-relaxed text-[color:var(--parchment-muted)]">
                密钥以加密形式存储，后台仅显示掩码；客户端永远不会收到密钥。所有模型与校验策略均由此处统一控制。
              </p>
            </div>
          ) : (
            <EmptyState
              title="尚未启用任何 AI 配置"
              hint="可在「AI 配置」中连接外部兼容接口，或使用平台内置网关。未配置时议事厅会使用本地兜底文本。"
              icon={<Cpu size={20} />}
              action={<Link href="/gm/ai"><Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]">去配置</Button></Link>}
            />
          )}
        </Panel>

        <Panel>
          <SectionTitle eyebrow="AI Calls" title="最近 AI 调用" action={<span className="text-[0.66rem] text-[color:var(--parchment-muted)]">共 {data.counts.aiCalls} 次</span>} />
          <GoldRule />
          {data.recentCalls.length === 0 ? (
            <EmptyState title="暂无调用记录" hint="玩家在议事厅与角色对话后，这里会记录模型、耗时与校验结果。" />
          ) : (
            <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
              {data.recentCalls.map((call) => (
                <div key={call.id} className="flex items-center gap-2 rounded-sm border border-[color:var(--ink-500)]/40 bg-[color:var(--ink-800)]/40 p-1.5 text-[0.68rem]">
                  <span className={cn("shrink-0 rounded-sm border px-1.5 py-0.5", call.status === "ok" ? "border-[color:var(--verdant)]/50 text-[color:var(--verdant)]" : "border-[color:var(--ember-600)]/60 text-[color:var(--ember-400)]")}>
                    {call.status}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[color:var(--parchment-dim)]">{(call.presentCharKeys ?? []).join("、") || "无在场角色"}</span>
                  <span className="shrink-0 text-[color:var(--parchment-muted)]">{call.latencyMs}ms</span>
                  {call.violationCount > 0 ? <Tag tone="danger">拒绝 {call.violationCount}</Tag> : null}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "招募池管理", href: "/gm/pools", text: "配置概率、软硬保底、开放时间并做抽样模拟" },
          { label: "世界地图管理", href: "/gm/world", text: "区域解锁条件、节点敌人与奖励、贸易产出" },
          { label: "装备与技能", href: "/gm/content", text: "装备属性、套装、技能倍率与效果" },
          { label: "备份与恢复", href: "/gm/ops", text: "创建快照、校验文件、恢复并查看审计日志" },
        ].map((entry) => (
          <Link key={entry.href} href={entry.href} className="card-tap panel card-lift p-3">
            <div className="text-display text-sm text-[color:var(--parchment)]">{entry.label}</div>
            <p className="mt-1 text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">{entry.text}</p>
          </Link>
        ))}
      </div>
    </GMShell>
  );
}