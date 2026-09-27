/**
 * GM 世界地图管理：区域 / 节点 / 敌人编成 / 奖励 / 解锁条件 / 贸易产出
 */
import { useState } from "react";
import { toast } from "sonner";
import { Compass, MapPin, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { GMShell } from "@/components/game/GMShell";
import { EmptyState, ErrorState, GoldRule, Panel, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";
import { JOB_NAME } from "@/components/game/ui";

type NodeRow = {
  nodeKey: string;
  regionKey: string;
  name: string;
  nodeType: string;
  levelMin: number;
  levelMax: number;
  staminaCost: number;
  requiredClears: number;
  controlWeight: number;
  mapX: number;
  mapY: number;
  storyKey: string | null;
  rewards: Record<string, unknown>;
  firstClearRewards: Record<string, unknown>;
  tradeYield: Record<string, number>;
  unlock: Record<string, unknown>;
  enemyWave: Array<{ id?: string; name: string; job: string; element: string; rarity: string; level: number; stats?: Record<string, number>; skillKeys?: string[]; note?: string }>;
  status?: string;
};

const NODE_TYPES = [
  { key: "village", label: "村庄" },
  { key: "town", label: "城镇" },
  { key: "trade", label: "贸易站" },
  { key: "fort", label: "要塞" },
  { key: "ruin", label: "遗迹" },
  { key: "wild", label: "荒野" },
  { key: "rift", label: "裂隙" },
];

export default function GMWorld() {
  const utils = trpc.useUtils();
  const regions = trpc.admin.listRegions.useQuery();
  const [regionKey, setRegionKey] = useState<string>("");
  const nodes = trpc.admin.listNodes.useQuery({ regionKey: regionKey || undefined });
  const [nodeEditor, setNodeEditor] = useState<(NodeRow & { enemyJson: string; rewardJson: string; firstRewardJson: string; tradeJson: string; unlockJson: string }) | null>(null);

  const saveNode = trpc.admin.saveNode.useMutation({
    onSuccess: async () => {
      toast.success("节点已保存，客户端地图同步更新");
      setNodeEditor(null);
      await utils.admin.listNodes.invalidate();
    },
    onError: (error) => toast.error("保存失败", { description: error.message }),
  });

  const saveRegion = trpc.admin.saveRegion.useMutation({
    onSuccess: async () => {
      toast.success("区域已保存");
      await utils.admin.listRegions.invalidate();
    },
    onError: (error) => toast.error("保存失败", { description: error.message }),
  });

  function openNode(node: NodeRow) {
    setNodeEditor({
      ...node,
      enemyJson: JSON.stringify(node.enemyWave ?? [], null, 2),
      rewardJson: JSON.stringify(node.rewards ?? {}, null, 2),
      firstRewardJson: JSON.stringify(node.firstClearRewards ?? {}, null, 2),
      tradeJson: JSON.stringify(node.tradeYield ?? {}, null, 2),
      unlockJson: JSON.stringify(node.unlock ?? {}, null, 2),
    });
  }

  return (
    <GMShell title="世界地图管理" eyebrow="区域解锁条件 / 节点敌人与奖励 / 贸易产出 —— 保存后客户端实时读取">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Panel>
          <SectionTitle eyebrow="Regions" title="区域" action={<span className="text-[0.66rem] text-[color:var(--parchment-muted)]">{regions.data?.length ?? 0} 个</span>} />
          <GoldRule />
          {regions.isLoading ? (
            <SkeletonState rows={4} />
          ) : regions.isError ? (
            <ErrorState message={regions.error?.message} onRetry={() => regions.refetch()} />
          ) : (
            <div className="space-y-1.5">
              <button
                className={cn("card-tap w-full rounded-sm border p-2 text-left text-xs", regionKey === "" ? "border-[color:var(--gold-300)] bg-[color:var(--ink-700)]/70" : "border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/40")}
                onClick={() => setRegionKey("")}
              >
                全部区域
              </button>
              {(regions.data ?? []).map((region) => (
                <button
                  key={region.regionKey}
                  className={cn("card-tap w-full rounded-sm border p-2 text-left", regionKey === region.regionKey ? "border-[color:var(--gold-300)] bg-[color:var(--ink-700)]/70" : "border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/40")}
                  onClick={() => setRegionKey(region.regionKey)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-[color:var(--parchment)]">{region.name}</span>
                    <Tag tone="neutral">{region.nodeCount} 节点</Tag>
                  </div>
                  <div className="mt-0.5 text-[0.6rem] text-[color:var(--parchment-muted)]">
                    {region.regionKey} · 危险度 {region.dangerTier} · {region.faction}
                  </div>
                  <div className="mt-1 flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 border-[color:var(--gold-600)]/50 px-1.5 text-[0.6rem] text-[color:var(--gold-300)]"
                      onClick={(event) => {
                        event.stopPropagation();
                        saveRegion.mutate({
                          regionKey: region.regionKey,
                          name: region.name,
                          subtitle: region.subtitle ?? "",
                          dangerTier: region.dangerTier,
                          faction: region.faction ?? "",
                          description: region.description ?? "",
                          mapX: region.mapX,
                          mapY: region.mapY,
                          artUrl: region.artUrl ?? null,
                          unlock: (region.unlock ?? {}) as Record<string, unknown>,
                          sortOrder: region.sortOrder,
                          status: (region.status ?? "published") as "published",
                        });
                      }}
                      disabled={saveRegion.isPending}
                    >
                      重新发布
                    </Button>
                  </div>
                </button>
              ))}
            </div>
          )}
          <p className="mt-3 text-[0.62rem] leading-relaxed text-[color:var(--parchment-muted)]">
            区域解锁条件（unlock JSON）支持：<code>regionKey</code>（需先控制某区域）、<code>chapter</code>（章节下限）、<code>renown</code>（声望下限）、<code>power</code>（队伍战力下限）、<code>srCount</code>（精锐数量）、<code>controlPercent</code>（控制度百分比）。
          </p>
        </Panel>

        <Panel>
          <SectionTitle
            eyebrow="Nodes"
            title={regionKey ? `节点 · ${regionKey}` : "全部节点"}
            action={<span className="text-[0.66rem] text-[color:var(--parchment-muted)]">{nodes.data?.length ?? 0} 个</span>}
          />
          <GoldRule />
          {nodes.isLoading ? (
            <SkeletonState rows={5} />
          ) : nodes.isError ? (
            <ErrorState message={nodes.error?.message} onRetry={() => nodes.refetch()} />
          ) : (nodes.data ?? []).length === 0 ? (
            <EmptyState title="该区域暂无节点" hint="节点由策划配置数据提供（server/game/data/world.ts）；后台可编辑已入库的节点。" icon={<MapPin size={20} />} />
          ) : (
            <div className="space-y-2">
              {(nodes.data as unknown as NodeRow[]).map((node) => (
                <div key={node.nodeKey} className="rounded-sm border border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/40 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Compass size={13} className="text-[color:var(--gold-500)]" />
                    <span className="text-sm text-[color:var(--parchment)]">{node.name}</span>
                    <Tag tone="neutral">{NODE_TYPES.find((type) => type.key === node.nodeType)?.label ?? node.nodeType}</Tag>
                    <span className="text-[0.64rem] text-[color:var(--parchment-muted)]">
                      {node.nodeKey} · LV.{node.levelMin}-{node.levelMax} · 体力 {node.staminaCost} · 通关 {node.requiredClears} · 控制权重 {node.controlWeight}
                    </span>
                    {node.storyKey ? <Tag tone="aether">剧情 {node.storyKey}</Tag> : null}
                    <Button size="sm" variant="outline" className="ml-auto h-7 border-[color:var(--ink-500)]/70 text-[0.66rem] text-[color:var(--parchment-dim)]" onClick={() => openNode(node)}>
                      编辑
                    </Button>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {(node.enemyWave ?? []).map((enemy, index) => (
                      <span key={index} className="rounded-sm border border-[color:var(--blood)]/40 px-1.5 py-0.5 text-[0.6rem] text-[color:var(--parchment-dim)]">
                        {enemy.name} · {JOB_NAME[enemy.job] ?? enemy.job} · LV.{enemy.level}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(node.rewards ?? {})
                      .filter(([, value]) => typeof value === "number" && Number(value) > 0)
                      .map(([key, value]) => (
                        <span key={key} className="rounded-sm border border-[color:var(--gold-600)]/40 px-1.5 py-0.5 text-[0.6rem] text-[color:var(--gold-300)]">
                          {key} +{Number(value)}
                        </span>
                      ))}
                    {Object.entries(node.tradeYield ?? {}).map(([key, value]) => (
                      <span key={`trade-${key}`} className="rounded-sm border border-[color:var(--verdant)]/40 px-1.5 py-0.5 text-[0.6rem] text-[color:var(--verdant)]">
                        贸易 {key} {value}/h
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Dialog open={Boolean(nodeEditor)} onOpenChange={(open) => { if (!open) setNodeEditor(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">编辑节点：{nodeEditor?.name}</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">敌人、奖励与解锁条件使用 JSON 配置；保存后客户端世界地图与战斗立即生效。</DialogDescription>
          </DialogHeader>
          {nodeEditor ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">名称</Label>
                  <Input value={nodeEditor.name} onChange={(event) => setNodeEditor({ ...nodeEditor, name: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">类型</Label>
                  <Select value={nodeEditor.nodeType} onValueChange={(value) => setNodeEditor({ ...nodeEditor, nodeType: value })}>
                    <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                      {NODE_TYPES.map((type) => (
                        <SelectItem key={type.key} value={type.key}>{type.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">剧情 Key（可空）</Label>
                  <Input value={nodeEditor.storyKey ?? ""} onChange={(event) => setNodeEditor({ ...nodeEditor, storyKey: event.target.value || null })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-6">
                {([
                  ["levelMin", "最低等级"],
                  ["levelMax", "最高等级"],
                  ["staminaCost", "体力消耗"],
                  ["requiredClears", "通关次数"],
                  ["mapX", "地图 X%"],
                  ["mapY", "地图 Y%"],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">{label}</Label>
                    <Input type="number" value={nodeEditor[key]} onChange={(event) => setNodeEditor({ ...nodeEditor, [key]: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                  </div>
                ))}
              </div>

              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">敌方编成（JSON 数组：id / name / job / element / rarity / level / stats / skillKeys / note）</Label>
                <Textarea value={nodeEditor.enemyJson} onChange={(event) => setNodeEditor({ ...nodeEditor, enemyJson: event.target.value })} rows={7} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 font-mono text-[0.64rem] text-[color:var(--parchment)]" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">常规奖励（JSON）</Label>
                  <Textarea value={nodeEditor.rewardJson} onChange={(event) => setNodeEditor({ ...nodeEditor, rewardJson: event.target.value })} rows={4} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 font-mono text-[0.64rem] text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">首通奖励（JSON）</Label>
                  <Textarea value={nodeEditor.firstRewardJson} onChange={(event) => setNodeEditor({ ...nodeEditor, firstRewardJson: event.target.value })} rows={4} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 font-mono text-[0.64rem] text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">贸易产出（JSON，每小时）</Label>
                  <Textarea value={nodeEditor.tradeJson} onChange={(event) => setNodeEditor({ ...nodeEditor, tradeJson: event.target.value })} rows={3} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 font-mono text-[0.64rem] text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">解锁条件（JSON：nodeKey / renown / chapter / power）</Label>
                  <Textarea value={nodeEditor.unlockJson} onChange={(event) => setNodeEditor({ ...nodeEditor, unlockJson: event.target.value })} rows={3} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 font-mono text-[0.64rem] text-[color:var(--parchment)]" />
                </div>
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setNodeEditor(null)}>取消</Button>
            <Button
              className="btn-gold border-transparent text-[color:var(--ink-950)]"
              disabled={saveNode.isPending || !nodeEditor}
              onClick={() => {
                if (!nodeEditor) return;
                try {
                  const enemyWave = JSON.parse(nodeEditor.enemyJson) as NodeRow["enemyWave"];
                  const rewards = JSON.parse(nodeEditor.rewardJson) as Record<string, unknown>;
                  const firstClearRewards = JSON.parse(nodeEditor.firstRewardJson) as Record<string, unknown>;
                  const tradeYield = JSON.parse(nodeEditor.tradeJson) as Record<string, number>;
                  const unlock = JSON.parse(nodeEditor.unlockJson) as Record<string, unknown>;
                  saveNode.mutate({
                    nodeKey: nodeEditor.nodeKey,
                    regionKey: nodeEditor.regionKey,
                    name: nodeEditor.name,
                    nodeType: nodeEditor.nodeType as "village",
                    levelMin: nodeEditor.levelMin,
                    levelMax: nodeEditor.levelMax,
                    enemyWave: enemyWave.map((enemy) => ({
                      id: String((enemy as unknown as { id?: string }).id ?? enemy.name),
                      name: enemy.name,
                      job: enemy.job as "warrior",
                      element: enemy.element as "physical",
                      rarity: (enemy.rarity ?? "R") as "R",
                      level: enemy.level,
                      stats: ((enemy as unknown as { stats?: Record<string, number> }).stats ?? { hp: 900, atk: 80, def: 55, mag: 20, res: 40, spd: 70 }) as Record<string, number>,
                      skillKeys: ((enemy as unknown as { skillKeys?: string[] }).skillKeys ?? []) as string[],
                      note: enemy.note,
                    })),
                    rewards,
                    firstClearRewards,
                    unlock,
                    storyKey: nodeEditor.storyKey,
                    tradeYield,
                    controlWeight: nodeEditor.controlWeight,
                    requiredClears: nodeEditor.requiredClears,
                    staminaCost: nodeEditor.staminaCost,
                    mapX: nodeEditor.mapX,
                    mapY: nodeEditor.mapY,
                    status: "published",
                  });
                } catch (error) {
                  toast.error("JSON 解析失败", { description: (error as Error).message });
                }
              }}
            >
              <Save size={13} className="mr-1" />
              {saveNode.isPending ? "保存中…" : "保存节点"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </GMShell>
  );
}
