/**
 * GM 招募池管理：概率 / 保底 / 开放时间 / 池限定角色 / 抽样模拟
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, BarChart3, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { GMShell } from "@/components/game/GMShell";
import { EmptyState, ErrorState, GoldRule, Panel, RarityBadge, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";

type PoolRow = {
  id: number;
  poolKey: string;
  name: string;
  poolType: "normal" | "rare" | "event";
  description: string | null;
  bannerUrl: string | null;
  rates: Array<{ rarity: string; rate: number }>;
  pity: Record<string, number | string>;
  costSingle: number;
  costTen: number;
  currency: string;
  characterKeys: string[];
  openAt: Date | string | null;
  closeAt: Date | string | null;
  enabled: boolean;
  sortOrder: number;
  stats: { totalPulls: number; ssrCount: number; srCount: number };
  rateTotal: number;
};

type PoolEditor = {
  poolKey: string;
  name: string;
  poolType: "normal" | "rare" | "event";
  description: string;
  bannerUrl: string;
  rateSSR: number;
  rateSR: number;
  rateR: number;
  softStart: number;
  softStep: number;
  hardPity: number;
  tenPullMinRarity: "R" | "SR" | "SSR";
  duplicateShards: number;
  costSingle: number;
  costTen: number;
  currency: "aether" | "gold";
  characterKeys: string;
  openAt: string;
  closeAt: string;
  enabled: boolean;
  sortOrder: number;
};

function emptyEditor(): PoolEditor {
  return {
    poolKey: "",
    name: "",
    poolType: "normal",
    description: "",
    bannerUrl: "",
    rateSSR: 0.02,
    rateSR: 0.18,
    rateR: 0.8,
    softStart: 60,
    softStep: 0.06,
    hardPity: 80,
    tenPullMinRarity: "SR",
    duplicateShards: 1,
    costSingle: 160,
    costTen: 1600,
    currency: "aether",
    characterKeys: "",
    openAt: "",
    closeAt: "",
    enabled: true,
    sortOrder: 10,
  };
}

function toEditor(row: PoolRow): PoolEditor {
  const rateOf = (rarity: string) => Number(row.rates.find((item) => item.rarity === rarity)?.rate ?? 0);
  const pity = row.pity ?? {};
  return {
    poolKey: row.poolKey,
    name: row.name,
    poolType: row.poolType,
    description: row.description ?? "",
    bannerUrl: row.bannerUrl ?? "",
    rateSSR: rateOf("SSR"),
    rateSR: rateOf("SR"),
    rateR: rateOf("R"),
    softStart: Number(pity.softStart ?? 0),
    softStep: Number(pity.softStep ?? 0),
    hardPity: Number(pity.hardPity ?? 0),
    tenPullMinRarity: (String(pity.tenPullMinRarity ?? "SR") as "R" | "SR" | "SSR"),
    duplicateShards: Number(pity.duplicateShards ?? 1),
    costSingle: row.costSingle,
    costTen: row.costTen,
    currency: row.currency as "aether" | "gold",
    characterKeys: (row.characterKeys ?? []).join(","),
    openAt: row.openAt ? new Date(row.openAt).toISOString().slice(0, 16) : "",
    closeAt: row.closeAt ? new Date(row.closeAt).toISOString().slice(0, 16) : "",
    enabled: row.enabled,
    sortOrder: row.sortOrder,
  };
}

export default function GMPools() {
  const utils = trpc.useUtils();
  const pools = trpc.admin.listPools.useQuery();
  const characters = trpc.admin.listCharacters.useQuery({ status: "published" });
  const [editor, setEditor] = useState<PoolEditor | null>(null);
  const [simulation, setSimulation] = useState<{ poolKey: string; pulls: number } | null>(null);
  const [simResult, setSimResult] = useState<null | {
    pulls: number;
    rarityCounts: Record<string, number>;
    observed: Record<string, number>;
    configured: Record<string, number>;
    maxSSRGap: number;
    hardPity: number;
  }>(null);

  useEffect(() => {
    setSimResult(null);
  }, [simulation?.poolKey]);

  const save = trpc.admin.savePool.useMutation({
    onSuccess: async () => {
      toast.success("卡池已保存，客户端概率公示同步更新");
      setEditor(null);
      await utils.admin.listPools.invalidate();
    },
    onError: (error) => toast.error("保存失败", { description: error.message }),
  });

  const simulate = trpc.admin.simulatePool.useMutation({
    onSuccess: (result) => {
      setSimResult(result as typeof simResult);
      toast.success(`完成 ${result.pulls} 次抽样`);
    },
    onError: (error) => toast.error("模拟失败", { description: error.message }),
  });

  return (
    <GMShell
      title="招募池管理"
      eyebrow="概率与保底由服务端统一管理；客户端只展示，不参与计算"
      actions={
        <Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={() => setEditor(emptyEditor())}>
          新建卡池
        </Button>
      }
    >
      {pools.isLoading ? (
        <SkeletonState rows={4} />
      ) : pools.isError ? (
        <ErrorState message={pools.error?.message} onRetry={() => pools.refetch()} />
      ) : (pools.data ?? []).length === 0 ? (
        <EmptyState title="还没有卡池" hint="新建普通、稀有或活动卡池，并配置概率、保底与开放时间。" />
      ) : (
        <div className="space-y-2">
          {(pools.data as PoolRow[]).map((row) => (
            <Panel key={row.poolKey} className="p-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-display text-sm text-[color:var(--parchment)]">{row.name}</span>
                    <Tag tone={row.poolType === "event" ? "aether" : row.poolType === "rare" ? "gold" : "neutral"}>
                      {row.poolType === "event" ? "活动" : row.poolType === "rare" ? "稀有" : "普通"}
                    </Tag>
                    <Tag tone={row.enabled ? "good" : "danger"}>{row.enabled ? "启用中" : "已停用"}</Tag>
                    {Math.abs(row.rateTotal - 1) > 0.001 ? <Tag tone="danger">概率和为 {row.rateTotal}</Tag> : null}
                  </div>
                  <div className="mt-1 text-[0.66rem] text-[color:var(--parchment-muted)]">
                    {row.poolKey} · 单抽 {row.costSingle} / 十连 {row.costTen} {row.currency === "aether" ? "星辉" : "金币"} · 硬保底 {String(row.pity.hardPity ?? 0)} · 软保底起 {String(row.pity.softStart ?? 0)}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {(["SSR", "SR", "R"] as const).map((rarity) => {
                      const rate = row.rates.find((item) => item.rarity === rarity)?.rate ?? 0;
                      return (
                        <span key={rarity} className="rounded-sm border border-[color:var(--ink-500)]/60 px-1.5 py-0.5 text-[0.64rem] text-[color:var(--parchment-dim)]">
                          {rarity} <span className="text-numeric text-[color:var(--gold-300)]">{(rate * 100).toFixed(2)}%</span>
                        </span>
                      );
                    })}
                  </div>
                  <div className="mt-1.5 text-[0.64rem] text-[color:var(--parchment-muted)]">
                    累计抽取 {row.stats.totalPulls} 次 · 出英杰 {row.stats.ssrCount} · 出精锐 {row.stats.srCount}
                    {row.openAt || row.closeAt ? ` · 开放 ${row.openAt ? new Date(row.openAt).toLocaleString("zh-CN") : "—"} ~ ${row.closeAt ? new Date(row.closeAt).toLocaleString("zh-CN") : "—"}` : " · 长期开放"}
                  </div>
                  {row.characterKeys.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {row.characterKeys.map((key) => {
                        const character = (characters.data as Array<{ charKey: string; name: string; rarity: "R" | "SR" | "SSR" }> | undefined)?.find((item) => item.charKey === key);
                        return (
                          <span key={key} className="flex items-center gap-1 rounded-sm border border-[color:var(--ink-500)]/50 px-1 py-0.5 text-[0.6rem] text-[color:var(--parchment-dim)]">
                            {character?.name ?? key}
                            {character ? <RarityBadge rarity={character.rarity} /> : null}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[0.64rem] text-[color:var(--parchment-muted)]">未限定角色：使用全部已发布且在招募池中的角色。</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-7 border-[color:var(--ink-500)]/70 text-[0.68rem] text-[color:var(--parchment-dim)]" onClick={() => setEditor(toEditor(row))}>
                    编辑
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 border-[color:var(--aether-500)]/50 text-[0.68rem] text-[color:var(--aether-300)]" onClick={() => { setSimulation({ poolKey: row.poolKey, pulls: 500 }); setSimResult(null); }}>
                    <BarChart3 size={12} className="mr-1" />
                    抽样模拟
                  </Button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {/* 编辑器 */}
      <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">{editor?.poolKey ? `编辑卡池：${editor.name}` : "新建卡池"}</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">概率之和必须为 1；软保底起始抽数不能大于硬保底。保存后客户端公示与抽卡立即使用新配置。</DialogDescription>
          </DialogHeader>
          {editor ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">卡池标识 poolKey</Label>
                  <Input value={editor.poolKey} disabled={Boolean(editor.poolKey && pools.data?.some((row) => row.poolKey === editor.poolKey))} onChange={(event) => setEditor({ ...editor, poolKey: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">名称</Label>
                  <Input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">类型</Label>
                  <Select value={editor.poolType} onValueChange={(value) => setEditor({ ...editor, poolType: value as PoolEditor["poolType"] })}>
                    <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                      <SelectItem value="normal">普通</SelectItem>
                      <SelectItem value="rare">稀有</SelectItem>
                      <SelectItem value="event">活动</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">货币</Label>
                  <Select value={editor.currency} onValueChange={(value) => setEditor({ ...editor, currency: value as "aether" | "gold" })}>
                    <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                      <SelectItem value="aether">星辉</SelectItem>
                      <SelectItem value="gold">金币</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">描述</Label>
                <Textarea value={editor.description} onChange={(event) => setEditor({ ...editor, description: event.target.value })} rows={2} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
              </div>

              <GoldRule />
              <div className="text-caption">概率（合计必须为 1）</div>
              <div className="grid gap-3 sm:grid-cols-3">
                {([
                  ["rateSSR", "SSR 概率"],
                  ["rateSR", "SR 概率"],
                  ["rateR", "R 概率"],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">{label}</Label>
                    <Input
                      type="number"
                      step="0.001"
                      value={editor[key]}
                      onChange={(event) => setEditor({ ...editor, [key]: Number(event.target.value) })}
                      className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]"
                    />
                  </div>
                ))}
              </div>
              <p className={cn("text-[0.66rem]", Math.abs(editor.rateSSR + editor.rateSR + editor.rateR - 1) > 0.001 ? "text-[color:var(--blood)]" : "text-[color:var(--verdant)]")}>
                当前合计：{(editor.rateSSR + editor.rateSR + editor.rateR).toFixed(4)}
              </p>

              <GoldRule />
              <div className="text-caption">保底</div>
              <div className="grid gap-3 sm:grid-cols-5">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">软保底起点</Label>
                  <Input type="number" value={editor.softStart} onChange={(event) => setEditor({ ...editor, softStart: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">每抽增量</Label>
                  <Input type="number" step="0.01" value={editor.softStep} onChange={(event) => setEditor({ ...editor, softStep: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">硬保底抽数</Label>
                  <Input type="number" value={editor.hardPity} onChange={(event) => setEditor({ ...editor, hardPity: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">十连最低稀有度</Label>
                  <Select value={editor.tenPullMinRarity} onValueChange={(value) => setEditor({ ...editor, tenPullMinRarity: value as "R" | "SR" | "SSR" })}>
                    <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                      <SelectItem value="R">R</SelectItem>
                      <SelectItem value="SR">SR</SelectItem>
                      <SelectItem value="SSR">SSR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">重复转化信物</Label>
                  <Input type="number" value={editor.duplicateShards} onChange={(event) => setEditor({ ...editor, duplicateShards: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
              </div>

              <GoldRule />
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">单抽消耗</Label>
                  <Input type="number" value={editor.costSingle} onChange={(event) => setEditor({ ...editor, costSingle: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">十连消耗</Label>
                  <Input type="number" value={editor.costTen} onChange={(event) => setEditor({ ...editor, costTen: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">开放时间（留空表示长期开放）</Label>
                  <Input type="datetime-local" value={editor.openAt} onChange={(event) => setEditor({ ...editor, openAt: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">关闭时间</Label>
                  <Input type="datetime-local" value={editor.closeAt} onChange={(event) => setEditor({ ...editor, closeAt: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
              </div>

              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">池限定角色（逗号分隔 charKey；留空使用全部在池角色）</Label>
                <Input value={editor.characterKeys} onChange={(event) => setEditor({ ...editor, characterKeys: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                {characters.data ? (
                  <p className="mt-1 text-[0.62rem] leading-relaxed text-[color:var(--parchment-muted)]">
                    已发布角色：{(characters.data as Array<{ charKey: string }>).map((item) => item.charKey).join("、")}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">排序</Label>
                  <Input type="number" value={editor.sortOrder} onChange={(event) => setEditor({ ...editor, sortOrder: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    className={cn("h-8 w-full border text-[0.68rem]", editor.enabled ? "border-[color:var(--verdant)]/60 text-[color:var(--verdant)]" : "border-[color:var(--blood)]/50 text-[color:var(--blood)]")}
                    onClick={() => setEditor({ ...editor, enabled: !editor.enabled })}
                  >
                    {editor.enabled ? "启用中（点击停用）" : "已停用（点击启用）"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setEditor(null)}>取消</Button>
            <Button
              className="btn-gold border-transparent text-[color:var(--ink-950)]"
              disabled={save.isPending || !editor?.poolKey || !editor?.name}
              onClick={() => {
                if (!editor) return;
                save.mutate({
                  poolKey: editor.poolKey,
                  name: editor.name,
                  poolType: editor.poolType,
                  description: editor.description,
                  bannerUrl: editor.bannerUrl || null,
                  rates: [
                    { rarity: "SSR", rate: editor.rateSSR },
                    { rarity: "SR", rate: editor.rateSR },
                    { rarity: "R", rate: editor.rateR },
                  ],
                  pity: {
                    softStart: editor.softStart,
                    softStep: editor.softStep,
                    hardPity: editor.hardPity,
                    tenPullMinRarity: editor.tenPullMinRarity,
                    duplicateShards: editor.duplicateShards,
                  },
                  costSingle: editor.costSingle,
                  costTen: editor.costTen,
                  currency: editor.currency,
                  characterKeys: editor.characterKeys.split(",").map((item) => item.trim()).filter(Boolean),
                  openAt: editor.openAt ? new Date(editor.openAt).toISOString() : null,
                  closeAt: editor.closeAt ? new Date(editor.closeAt).toISOString() : null,
                  enabled: editor.enabled,
                  sortOrder: editor.sortOrder,
                });
              }}
            >
              <Save size={13} className="mr-1" />
              {save.isPending ? "保存中…" : "保存"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 抽样模拟 */}
      <Dialog open={Boolean(simulation)} onOpenChange={(open) => { if (!open) { setSimulation(null); setSimResult(null); } }}>
        <DialogContent className="border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">概率抽样模拟</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">
              使用真实抽取逻辑在服务端模拟，不消耗任何玩家资源、不写入真实数据。
            </DialogDescription>
          </DialogHeader>
          {simulation ? (
            <div className="space-y-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">抽取次数（10 - 2000）</Label>
                  <Input
                    type="number"
                    value={simulation.pulls}
                    min={10}
                    max={2000}
                    onChange={(event) => setSimulation({ ...simulation, pulls: Math.max(10, Math.min(2000, Number(event.target.value))) })}
                    className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]"
                  />
                </div>
                <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" disabled={simulate.isPending} onClick={() => simulate.mutate({ poolKey: simulation.poolKey, pulls: simulation.pulls })}>
                  {simulate.isPending ? "模拟中…" : "开始模拟"}
                </Button>
              </div>
              {simResult ? (
                <>
                  <GoldRule />
                  <div className="grid grid-cols-3 gap-2">
                    {(["SSR", "SR", "R"] as const).map((rarity) => (
                      <div key={rarity} className="rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/60 p-2 text-center">
                        <div className="text-xs text-[color:var(--parchment-dim)]">{rarity}</div>
                        <div className="text-numeric text-lg text-[color:var(--gold-300)]">{((simResult.observed[rarity] ?? 0) * 100).toFixed(2)}%</div>
                        <div className="text-[0.6rem] text-[color:var(--parchment-muted)]">
                          配置 {((simResult.configured[rarity] ?? 0) * 100).toFixed(2)}% · {simResult.rarityCounts[rarity] ?? 0} 次
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[0.68rem] text-[color:var(--parchment-dim)]">
                    最大英杰间隔：{simResult.maxSSRGap} 抽（硬保底 {simResult.hardPity}）——若最大间隔明显超过硬保底，说明配置存在冲突。
                  </p>
                  <p className="flex items-start gap-1.5 text-[0.64rem] text-[color:var(--parchment-muted)]">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0 text-[color:var(--gold-500)]" />
                    抽样为随机过程，短样本存在波动；建议 ≥2000 次评估真实概率区间。
                  </p>
                </>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </GMShell>
  );
}

void SectionTitle;