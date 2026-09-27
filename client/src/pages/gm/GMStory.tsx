/**
 * GM 任务 / 剧情 / 领地事件 / 建筑 管理
 * 目的：让「所有后台修改都能同步到游戏客户端」覆盖叙事与领地系统
 */
import { toast } from "sonner";
import { Save } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { GMShell } from "@/components/game/GMShell";
import { EmptyState, ErrorState, GoldRule, Panel, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";

type QuestRow = {
  questKey: string;
  name: string;
  chapter: number;
  questType: string;
  description: string | null;
  objectives: Array<Record<string, unknown>>;
  rewards: Record<string, unknown>;
  prerequisite: Record<string, unknown>;
  sortOrder: number;
  status: string;
};

type SceneRow = {
  sceneKey: string;
  chapter: number;
  title: string;
  trigger: Record<string, unknown>;
  beats: Array<Record<string, unknown>>;
  choices: Array<Record<string, unknown>>;
  unlockFlags: string[];
  status: string;
};

type EventRow = {
  eventKey: string;
  title: string;
  category: string;
  description: string | null;
  choices: Array<Record<string, unknown>>;
  minKeepLevel: number;
  weight: number;
  once: boolean;
  status: string;
};

type BuildingRow = {
  buildingKey: string;
  name: string;
  category: string;
  maxLevel: number;
  levels: Array<Record<string, unknown>>;
  description: string | null;
  iconKey: string | null;
  hotspotX: number;
  hotspotY: number;
};

export default function GMStory() {
  const utils = trpc.useUtils();
  const quests = trpc.admin.listQuests.useQuery();
  const scenes = trpc.admin.listScenes.useQuery();
  const events = trpc.admin.listEvents.useQuery();
  const buildings = trpc.admin.listBuildings.useQuery();

  const [questEditor, setQuestEditor] = useState<null | (QuestRow & { objectivesJson: string; rewardsJson: string; prerequisiteJson: string })>(null);
  const [sceneEditor, setSceneEditor] = useState<null | (SceneRow & { beatsJson: string; choicesJson: string; triggerJson: string })>(null);
  const [eventEditor, setEventEditor] = useState<null | (EventRow & { choicesJson: string })>(null);
  const [buildingEditor, setBuildingEditor] = useState<null | (BuildingRow & { levelsJson: string })>(null);

  const saveQuest = trpc.admin.saveQuest.useMutation({
    onSuccess: async () => { toast.success("任务已保存"); setQuestEditor(null); await utils.admin.listQuests.invalidate(); },
    onError: (error) => toast.error("保存失败", { description: error.message }),
  });
  const saveScene = trpc.admin.saveScene.useMutation({
    onSuccess: async () => { toast.success("剧情场景已保存，客户端下一次触发即生效"); setSceneEditor(null); await utils.admin.listScenes.invalidate(); },
    onError: (error) => toast.error("保存失败", { description: error.message }),
  });
  const saveEvent = trpc.admin.saveEvent.useMutation({
    onSuccess: async () => { toast.success("领地事件已保存"); setEventEditor(null); await utils.admin.listEvents.invalidate(); },
    onError: (error) => toast.error("保存失败", { description: error.message }),
  });
  const saveBuilding = trpc.admin.saveBuilding.useMutation({
    onSuccess: async () => { toast.success("建筑配置已保存"); setBuildingEditor(null); await Promise.all([utils.admin.listBuildings.invalidate(), utils.meta.dictionaries.invalidate()]); },
    onError: (error) => toast.error("保存失败", { description: error.message }),
  });

  return (
    <GMShell title="任务 · 剧情 · 事件 · 建筑" eyebrow="叙事与领地配置 —— 修改后客户端立即读取最新版本">
      <Tabs defaultValue="quests">
        <TabsList className="flex flex-wrap border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/60">
          {[
            ["quests", `任务 (${quests.data?.length ?? 0})`],
            ["scenes", `剧情 (${scenes.data?.length ?? 0})`],
            ["events", `事件 (${events.data?.length ?? 0})`],
            ["buildings", `建筑 (${buildings.data?.length ?? 0})`],
          ].map(([value, label]) => (
            <TabsTrigger key={value} value={value} className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="quests">
          {quests.isLoading ? <SkeletonState rows={5} /> : quests.isError ? <ErrorState message={quests.error?.message} onRetry={() => quests.refetch()} /> : (
            <div className="mt-3 space-y-2">
              {(quests.data as QuestRow[] | undefined ?? []).map((row) => (
                <Panel key={row.questKey} className="p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-[220px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-[color:var(--parchment)]">{row.name}</span>
                        <Tag tone={row.questType === "main" ? "gold" : row.questType === "side" ? "aether" : "neutral"}>
                          {row.questType === "main" ? "主线" : row.questType === "side" ? "支线" : "日常"}
                        </Tag>
                        <Tag tone="neutral">第 {row.chapter} 章</Tag>
                        <Tag tone={row.status === "published" ? "good" : "neutral"}>{row.status === "published" ? "已发布" : "草稿"}</Tag>
                      </div>
                      <p className="mt-1 text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">{row.description}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(row.objectives ?? []).map((objective, index) => (
                          <span key={index} className="rounded-sm border border-[color:var(--ink-500)]/50 px-1.5 py-0.5 text-[0.6rem] text-[color:var(--parchment-dim)]">
                            {String(objective.label ?? objective.type)} ×{String(objective.count ?? 1)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 border-[color:var(--ink-500)]/70 text-[0.66rem] text-[color:var(--parchment-dim)]"
                      onClick={() => setQuestEditor({ ...row, objectivesJson: JSON.stringify(row.objectives ?? [], null, 1), rewardsJson: JSON.stringify(row.rewards ?? {}, null, 1), prerequisiteJson: JSON.stringify(row.prerequisite ?? {}, null, 1) })}>
                      编辑
                    </Button>
                  </div>
                </Panel>
              ))}
              {(quests.data ?? []).length === 0 ? <EmptyState title="暂无任务" /> : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="scenes">
          {scenes.isLoading ? <SkeletonState rows={5} /> : scenes.isError ? <ErrorState message={scenes.error?.message} onRetry={() => scenes.refetch()} /> : (
            <div className="mt-3 space-y-2">
              {(scenes.data as SceneRow[] | undefined ?? []).map((row) => (
                <Panel key={row.sceneKey} className="p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-[220px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-[color:var(--parchment)]">{row.title}</span>
                        <Tag tone="neutral">第 {row.chapter} 章</Tag>
                        <Tag tone="aether">{row.sceneKey}</Tag>
                        <span className="text-[0.62rem] text-[color:var(--parchment-muted)]">{(row.beats ?? []).length} 段 · {(row.choices ?? []).length} 选项</span>
                      </div>
                      <p className="mt-1 text-[0.66rem] text-[color:var(--parchment-muted)]">
                        {String((row.beats ?? [])[0]?.text ?? "").slice(0, 90)}
                        {(row.beats ?? []).length > 1 ? " …" : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 border-[color:var(--ink-500)]/70 text-[0.66rem] text-[color:var(--parchment-dim)]"
                      onClick={() => setSceneEditor({ ...row, beatsJson: JSON.stringify(row.beats ?? [], null, 1), choicesJson: JSON.stringify(row.choices ?? [], null, 1), triggerJson: JSON.stringify(row.trigger ?? {}, null, 1) })}>
                      编辑
                    </Button>
                  </div>
                </Panel>
              ))}
              {(scenes.data ?? []).length === 0 ? <EmptyState title="暂无剧情场景" /> : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="events">
          {events.isLoading ? <SkeletonState rows={5} /> : events.isError ? <ErrorState message={events.error?.message} onRetry={() => events.refetch()} /> : (
            <div className="mt-3 space-y-2">
              {(events.data as EventRow[] | undefined ?? []).map((row) => (
                <Panel key={row.eventKey} className="p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-[220px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-[color:var(--parchment)]">{row.title}</span>
                        <Tag tone="neutral">{row.category}</Tag>
                        <Tag tone="neutral">权重 {row.weight}</Tag>
                        <Tag tone="neutral">城堡 Lv.{row.minKeepLevel}+</Tag>
                        {row.once ? <Tag tone="gold">仅一次</Tag> : null}
                      </div>
                      <p className="mt-1 text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">{row.description}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(row.choices ?? []).map((choice, index) => (
                          <span key={index} className="rounded-sm border border-[color:var(--ink-500)]/50 px-1.5 py-0.5 text-[0.6rem] text-[color:var(--parchment-dim)]">
                            {String(choice.text ?? `选项 ${index + 1}`)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 border-[color:var(--ink-500)]/70 text-[0.66rem] text-[color:var(--parchment-dim)]"
                      onClick={() => setEventEditor({ ...row, choicesJson: JSON.stringify(row.choices ?? [], null, 1) })}>
                      编辑
                    </Button>
                  </div>
                </Panel>
              ))}
              {(events.data ?? []).length === 0 ? <EmptyState title="暂无领地事件" /> : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="buildings">
          {buildings.isLoading ? <SkeletonState rows={5} /> : buildings.isError ? <ErrorState message={buildings.error?.message} onRetry={() => buildings.refetch()} /> : (
            <div className="mt-3 space-y-2">
              {(buildings.data as BuildingRow[] | undefined ?? []).map((row) => (
                <Panel key={row.buildingKey} className="p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-[220px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-[color:var(--parchment)]">{row.name}</span>
                        <Tag tone="neutral">{row.category}</Tag>
                        <Tag tone="neutral">上限 Lv.{row.maxLevel}</Tag>
                        <span className="text-[0.62rem] text-[color:var(--parchment-muted)]">{row.buildingKey} · 热点 ({row.hotspotX}%, {row.hotspotY}%)</span>
                      </div>
                      <p className="mt-1 text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">{row.description}</p>
                    </div>
                    <Button size="sm" variant="outline" className="h-7 border-[color:var(--ink-500)]/70 text-[0.66rem] text-[color:var(--parchment-dim)]"
                      onClick={() => setBuildingEditor({ ...row, levelsJson: JSON.stringify(row.levels ?? [], null, 1) })}>
                      编辑
                    </Button>
                  </div>
                </Panel>
              ))}
              {(buildings.data ?? []).length === 0 ? <EmptyState title="暂无建筑" /> : null}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Panel className="mt-4 p-3">
        <SectionTitle eyebrow="Publish Flow" title="同步说明" />
        <GoldRule />
        <ul className="space-y-1 text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">
          <li>· 本页数据全部来自服务端配置表；保存即生效，客户端下一次请求即可读取（无需重启、无需发版）。</li>
          <li>· 任务目标类型支持：clear_node / upgrade_building / recruit / own_character / level_character / talk_ai / equip_item / control_region。</li>
          <li>· 剧情 trigger 常用字段：nodeKey（进入节点时播放）、chapter（进入章节时播放）。</li>
          <li>· 建筑 levels 为长度等于最高等级的数组，每一项描述该等级的资源产出、加成或解锁内容。</li>
        </ul>
      </Panel>

      {/* 任务编辑 */}
      <Dialog open={Boolean(questEditor)} onOpenChange={(open) => { if (!open) setQuestEditor(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">编辑任务：{questEditor?.name}</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">任务目标与奖励均为结构化 JSON；保存后客户端任务列表将使用新配置。</DialogDescription>
          </DialogHeader>
          {questEditor ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">名称</Label>
                  <Input value={questEditor.name} onChange={(event) => setQuestEditor({ ...questEditor, name: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">章节</Label>
                    <Input type="number" value={questEditor.chapter} onChange={(event) => setQuestEditor({ ...questEditor, chapter: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                  </div>
                  <div>
                    <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">类型</Label>
                    <Select value={questEditor.questType} onValueChange={(value) => setQuestEditor({ ...questEditor, questType: value })}>
                      <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]"><SelectValue /></SelectTrigger>
                      <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                        <SelectItem value="main">主线</SelectItem>
                        <SelectItem value="side">支线</SelectItem>
                        <SelectItem value="daily">日常</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">描述</Label>
                <Textarea value={questEditor.description ?? ""} onChange={(event) => setQuestEditor({ ...questEditor, description: event.target.value })} rows={2} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
              </div>
              {([
                ["objectivesJson", "目标（JSON 数组）"],
                ["rewardsJson", "奖励（JSON）"],
                ["prerequisiteJson", "前置条件（JSON）"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">{label}</Label>
                  <Textarea value={questEditor[key]} onChange={(event) => setQuestEditor({ ...questEditor, [key]: event.target.value })} rows={4} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 font-mono text-[0.62rem] text-[color:var(--parchment)]" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">排序</Label>
                  <Input type="number" value={questEditor.sortOrder} onChange={(event) => setQuestEditor({ ...questEditor, sortOrder: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">状态</Label>
                  <Select value={questEditor.status} onValueChange={(value) => setQuestEditor({ ...questEditor, status: value })}>
                    <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                      <SelectItem value="draft">草稿</SelectItem>
                      <SelectItem value="published">发布</SelectItem>
                      <SelectItem value="archived">下架</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setQuestEditor(null)}>取消</Button>
            <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" disabled={saveQuest.isPending || !questEditor}
              onClick={() => {
                if (!questEditor) return;
                try {
                  saveQuest.mutate({
                    questKey: questEditor.questKey,
                    name: questEditor.name,
                    chapter: questEditor.chapter,
                    questType: questEditor.questType as "main",
                    description: questEditor.description ?? "",
                    objectives: JSON.parse(questEditor.objectivesJson) as Array<Record<string, unknown>>,
                    rewards: JSON.parse(questEditor.rewardsJson) as Record<string, unknown>,
                    prerequisite: JSON.parse(questEditor.prerequisiteJson) as Record<string, unknown>,
                    sortOrder: questEditor.sortOrder,
                    status: questEditor.status as "draft",
                  });
                } catch (error) {
                  toast.error("JSON 解析失败", { description: (error as Error).message });
                }
              }}>
              <Save size={13} className="mr-1" />
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 剧情编辑 */}
      <Dialog open={Boolean(sceneEditor)} onOpenChange={(open) => { if (!open) setSceneEditor(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">编辑剧情：{sceneEditor?.title}</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">beats 为对白/旁白序列（speaker、charKey、text、emotion）；choices 支持 flags 与 rewards。</DialogDescription>
          </DialogHeader>
          {sceneEditor ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">标题</Label>
                  <Input value={sceneEditor.title} onChange={(event) => setSceneEditor({ ...sceneEditor, title: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">章节</Label>
                  <Input type="number" value={sceneEditor.chapter} onChange={(event) => setSceneEditor({ ...sceneEditor, chapter: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
              </div>
              {([
                ["triggerJson", "触发条件（JSON）"],
                ["beatsJson", "剧情段落（JSON 数组）"],
                ["choicesJson", "选项（JSON 数组）"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">{label}</Label>
                  <Textarea value={sceneEditor[key]} onChange={(event) => setSceneEditor({ ...sceneEditor, [key]: event.target.value })} rows={key === "triggerJson" ? 2 : 7} className={cn("mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 font-mono text-[0.62rem] text-[color:var(--parchment)]")} />
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setSceneEditor(null)}>取消</Button>
            <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" disabled={saveScene.isPending || !sceneEditor}
              onClick={() => {
                if (!sceneEditor) return;
                try {
                  saveScene.mutate({
                    sceneKey: sceneEditor.sceneKey,
                    chapter: sceneEditor.chapter,
                    title: sceneEditor.title,
                    trigger: JSON.parse(sceneEditor.triggerJson) as Record<string, unknown>,
                    beats: JSON.parse(sceneEditor.beatsJson) as Array<Record<string, unknown>>,
                    choices: JSON.parse(sceneEditor.choicesJson) as Array<Record<string, unknown>>,
                    unlockFlags: sceneEditor.unlockFlags ?? [],
                    status: sceneEditor.status as "published",
                  });
                } catch (error) {
                  toast.error("JSON 解析失败", { description: (error as Error).message });
                }
              }}>
              <Save size={13} className="mr-1" />
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 事件编辑 */}
      <Dialog open={Boolean(eventEditor)} onOpenChange={(open) => { if (!open) setEventEditor(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">编辑领地事件：{eventEditor?.title}</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">先抑后扬的取舍类事件最容易让玩家记住；每个选项的 effects 支持资源增减与标记。</DialogDescription>
          </DialogHeader>
          {eventEditor ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">标题</Label>
                  <Input value={eventEditor.title} onChange={(event) => setEventEditor({ ...eventEditor, title: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">分类</Label>
                  <Select value={eventEditor.category} onValueChange={(value) => setEventEditor({ ...eventEditor, category: value })}>
                    <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]"><SelectValue /></SelectTrigger>
                    <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                      <SelectItem value="economy">经济</SelectItem>
                      <SelectItem value="people">民生</SelectItem>
                      <SelectItem value="military">军事</SelectItem>
                      <SelectItem value="diplomacy">外交</SelectItem>
                      <SelectItem value="rift">裂隙</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">最低城堡等级</Label>
                  <Input type="number" value={eventEditor.minKeepLevel} onChange={(event) => setEventEditor({ ...eventEditor, minKeepLevel: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">权重</Label>
                  <Input type="number" value={eventEditor.weight} onChange={(event) => setEventEditor({ ...eventEditor, weight: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
              </div>
              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">描述</Label>
                <Textarea value={eventEditor.description ?? ""} onChange={(event) => setEventEditor({ ...eventEditor, description: event.target.value })} rows={2} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
              </div>
              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">选项（JSON 数组，含 text / effects / reply）</Label>
                <Textarea value={eventEditor.choicesJson} onChange={(event) => setEventEditor({ ...eventEditor, choicesJson: event.target.value })} rows={7} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 font-mono text-[0.62rem] text-[color:var(--parchment)]" />
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setEventEditor(null)}>取消</Button>
            <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" disabled={saveEvent.isPending || !eventEditor}
              onClick={() => {
                if (!eventEditor) return;
                try {
                  saveEvent.mutate({
                    eventKey: eventEditor.eventKey,
                    title: eventEditor.title,
                    category: eventEditor.category as "economy",
                    description: eventEditor.description ?? "",
                    choices: JSON.parse(eventEditor.choicesJson) as Array<Record<string, unknown>>,
                    minKeepLevel: eventEditor.minKeepLevel,
                    weight: eventEditor.weight,
                    once: eventEditor.once,
                    status: eventEditor.status as "published",
                  });
                } catch (error) {
                  toast.error("JSON 解析失败", { description: (error as Error).message });
                }
              }}>
              <Save size={13} className="mr-1" />
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 建筑编辑 */}
      <Dialog open={Boolean(buildingEditor)} onOpenChange={(open) => { if (!open) setBuildingEditor(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">编辑建筑：{buildingEditor?.name}</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">levels 数组长度应等于最高等级；每项包含该等级的产出、加成与费用。</DialogDescription>
          </DialogHeader>
          {buildingEditor ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">名称</Label>
                  <Input value={buildingEditor.name} onChange={(event) => setBuildingEditor({ ...buildingEditor, name: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">最高等级</Label>
                  <Input type="number" value={buildingEditor.maxLevel} onChange={(event) => setBuildingEditor({ ...buildingEditor, maxLevel: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
              </div>
              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">等级配置（JSON 数组）</Label>
                <Textarea value={buildingEditor.levelsJson} onChange={(event) => setBuildingEditor({ ...buildingEditor, levelsJson: event.target.value })} rows={12} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 font-mono text-[0.62rem] text-[color:var(--parchment)]" />
              </div>
              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">描述</Label>
                <Textarea value={buildingEditor.description ?? ""} onChange={(event) => setBuildingEditor({ ...buildingEditor, description: event.target.value })} rows={2} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setBuildingEditor(null)}>取消</Button>
            <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" disabled={saveBuilding.isPending || !buildingEditor}
              onClick={() => {
                if (!buildingEditor) return;
                try {
                  saveBuilding.mutate({
                    buildingKey: buildingEditor.buildingKey,
                    name: buildingEditor.name,
                    category: buildingEditor.category as "economy",
                    maxLevel: buildingEditor.maxLevel,
                    levels: JSON.parse(buildingEditor.levelsJson) as Array<Record<string, unknown>>,
                    description: buildingEditor.description ?? "",
                    iconKey: buildingEditor.iconKey ?? undefined,
                    hotspotX: buildingEditor.hotspotX,
                    hotspotY: buildingEditor.hotspotY,
                  });
                } catch (error) {
                  toast.error("JSON 解析失败", { description: (error as Error).message });
                }
              }}>
              <Save size={13} className="mr-1" />
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </GMShell>
  );
}