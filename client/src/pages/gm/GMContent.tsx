/**
 * GM 装备与技能管理
 * 装备：部位/品质/属性/套装/强化上限；技能：元素/类型/倍率/冷却/效果
 */
import { useState } from "react";
import { toast } from "sonner";
import { Save, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { GMShell } from "@/components/game/GMShell";
import { EmptyState, ErrorState, GoldRule, Panel, RarityBadge, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";

const SLOTS = [
  { key: "weapon", label: "武器" },
  { key: "offhand", label: "副手" },
  { key: "helmet", label: "头盔" },
  { key: "armor", label: "护甲" },
  { key: "boots", label: "鞋子" },
  { key: "accessory", label: "饰品" },
];

type EquipmentRow = {
  equipKey: string;
  name: string;
  slot: string;
  rarity: "R" | "SR" | "SSR";
  requiredLevel: number;
  stats: Record<string, number>;
  setKey: string | null;
  description: string | null;
  iconKey: string | null;
  upgradeRate: number;
  maxLevel: number;
  status: string;
};

type SkillRow = {
  skillKey: string;
  name: string;
  element: string;
  kind: string;
  targetType: string;
  power: number;
  cooldown: number;
  energyCost: number;
  maxLevel: number;
  description: string;
  effects: Array<Record<string, unknown>>;
  iconKey: string | null;
};

export default function GMContent() {
  const utils = trpc.useUtils();
  const equipments = trpc.admin.listEquipments.useQuery();
  const skills = trpc.admin.listSkills.useQuery();
  const [equipEditor, setEquipEditor] = useState<(EquipmentRow & { statsJson: string }) | null>(null);
  const [skillEditor, setSkillEditor] = useState<(SkillRow & { effectsJson: string }) | null>(null);

  const saveEquipment = trpc.admin.saveEquipment.useMutation({
    onSuccess: async () => {
      toast.success("装备已保存，客户端字典同步更新");
      setEquipEditor(null);
      await Promise.all([utils.admin.listEquipments.invalidate(), utils.meta.dictionaries.invalidate()]);
    },
    onError: (error) => toast.error("保存失败", { description: error.message }),
  });

  const saveSkill = trpc.admin.saveSkill.useMutation({
    onSuccess: async () => {
      toast.success("技能已保存，战斗结算立即使用新配置");
      setSkillEditor(null);
      await Promise.all([utils.admin.listSkills.invalidate(), utils.meta.dictionaries.invalidate()]);
    },
    onError: (error) => toast.error("保存失败", { description: error.message }),
  });

  return (
    <GMShell title="装备与技能" eyebrow="属性与倍率直接影响战斗结果；保存后立即生效">
      <Tabs defaultValue="equipment">
        <TabsList className="border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/60">
          <TabsTrigger value="equipment" className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">
            <Shield size={12} className="mr-1" />
            装备（{equipments.data?.length ?? 0}）
          </TabsTrigger>
          <TabsTrigger value="skills" className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">
            <Sparkles size={12} className="mr-1" />
            技能（{skills.data?.length ?? 0}）
          </TabsTrigger>
        </TabsList>

        <TabsContent value="equipment">
          {equipments.isLoading ? (
            <SkeletonState rows={5} />
          ) : equipments.isError ? (
            <ErrorState message={equipments.error?.message} onRetry={() => equipments.refetch()} />
          ) : (equipments.data ?? []).length === 0 ? (
            <EmptyState title="暂无装备" hint="装备配置来自策划数据；在此编辑后立即同步到客户端。" />
          ) : (
            <div className="mt-3 space-y-2">
              {(equipments.data as EquipmentRow[]).map((row) => (
                <Panel key={row.equipKey} className="flex flex-wrap items-center gap-3 p-2.5">
                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-[color:var(--parchment)]">{row.name}</span>
                      <RarityBadge rarity={row.rarity} />
                      <Tag tone="neutral">{SLOTS.find((slot) => slot.key === row.slot)?.label ?? row.slot}</Tag>
                      {row.setKey ? <Tag tone="aether">套装 {row.setKey}</Tag> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(row.stats ?? {}).map(([key, value]) => (
                        <span key={key} className="rounded-sm border border-[color:var(--gold-600)]/40 px-1.5 py-0.5 text-[0.6rem] text-[color:var(--gold-300)]">
                          {key} +{value}
                        </span>
                      ))}
                    </div>
                    <div className="mt-0.5 text-[0.62rem] text-[color:var(--parchment-muted)]">
                      {row.equipKey} · 需求等级 {row.requiredLevel} · 强化上限 +{row.maxLevel - 1} · 每级成长 {row.upgradeRate}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 border-[color:var(--ink-500)]/70 text-[0.68rem] text-[color:var(--parchment-dim)]" onClick={() => setEquipEditor({ ...row, statsJson: JSON.stringify(row.stats ?? {}, null, 0) })}>
                    编辑
                  </Button>
                </Panel>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="skills">
          {skills.isLoading ? (
            <SkeletonState rows={5} />
          ) : skills.isError ? (
            <ErrorState message={skills.error?.message} onRetry={() => skills.refetch()} />
          ) : (skills.data ?? []).length === 0 ? (
            <EmptyState title="暂无技能" />
          ) : (
            <div className="mt-3 space-y-2">
              {(skills.data as SkillRow[]).map((row) => (
                <Panel key={row.skillKey} className="flex flex-wrap items-center gap-3 p-2.5">
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-[color:var(--parchment)]">{row.name}</span>
                      <Tag tone={row.kind === "passive" ? "neutral" : "gold"}>{row.kind === "passive" ? "被动" : "主动"}</Tag>
                      <Tag tone="aether">{row.element}</Tag>
                      <Tag tone="neutral">{row.targetType}</Tag>
                    </div>
                    <div className="mt-0.5 text-[0.62rem] text-[color:var(--parchment-muted)]">
                      {row.skillKey} · 倍率 {row.power}% · 冷却 {row.cooldown} 回合 · 能量 {row.energyCost} · 上限 LV.{row.maxLevel}
                    </div>
                    <p className="mt-0.5 text-[0.66rem] leading-relaxed text-[color:var(--parchment-dim)]">{row.description}</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-7 border-[color:var(--ink-500)]/70 text-[0.68rem] text-[color:var(--parchment-dim)]" onClick={() => setSkillEditor({ ...row, effectsJson: JSON.stringify(row.effects ?? [], null, 0) })}>
                    编辑
                  </Button>
                </Panel>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* 装备编辑 */}
      <Dialog open={Boolean(equipEditor)} onOpenChange={(open) => { if (!open) setEquipEditor(null); }}>
        <DialogContent className="border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">编辑装备：{equipEditor?.name}</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">装备属性会直接加到角色面板并影响战斗结算。</DialogDescription>
          </DialogHeader>
          {equipEditor ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">名称</Label>
                  <Input value={equipEditor.name} onChange={(event) => setEquipEditor({ ...equipEditor, name: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">部位</Label>
                  <Select value={equipEditor.slot} onValueChange={(value) => setEquipEditor({ ...equipEditor, slot: value })}>
                    <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                      {SLOTS.map((slot) => (
                        <SelectItem key={slot.key} value={slot.key}>{slot.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">品质</Label>
                  <Select value={equipEditor.rarity} onValueChange={(value) => setEquipEditor({ ...equipEditor, rarity: value as "R" })}>
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
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">需求等级</Label>
                  <Input type="number" value={equipEditor.requiredLevel} onChange={(event) => setEquipEditor({ ...equipEditor, requiredLevel: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">强化上限（等级）</Label>
                  <Input type="number" value={equipEditor.maxLevel} onChange={(event) => setEquipEditor({ ...equipEditor, maxLevel: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">强化每级成长（%）</Label>
                  <Input type="number" value={equipEditor.upgradeRate} onChange={(event) => setEquipEditor({ ...equipEditor, upgradeRate: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">套装 Key（可空）</Label>
                  <Input value={equipEditor.setKey ?? ""} onChange={(event) => setEquipEditor({ ...equipEditor, setKey: event.target.value || null })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">图标 Key</Label>
                  <Input value={equipEditor.iconKey ?? ""} onChange={(event) => setEquipEditor({ ...equipEditor, iconKey: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
              </div>
              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">属性（JSON）</Label>
                <Textarea value={equipEditor.statsJson} onChange={(event) => setEquipEditor({ ...equipEditor, statsJson: event.target.value })} rows={4} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 font-mono text-[0.64rem] text-[color:var(--parchment)]" />
              </div>
              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">描述</Label>
                <Textarea value={equipEditor.description ?? ""} onChange={(event) => setEquipEditor({ ...equipEditor, description: event.target.value })} rows={2} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setEquipEditor(null)}>取消</Button>
            <Button
              className="btn-gold border-transparent text-[color:var(--ink-950)]"
              disabled={saveEquipment.isPending || !equipEditor}
              onClick={() => {
                if (!equipEditor) return;
                try {
                  const stats = JSON.parse(equipEditor.statsJson) as Record<string, number>;
                  saveEquipment.mutate({
                    equipKey: equipEditor.equipKey,
                    name: equipEditor.name,
                    slot: equipEditor.slot as "weapon",
                    rarity: equipEditor.rarity,
                    requiredLevel: equipEditor.requiredLevel,
                    stats,
                    setKey: equipEditor.setKey,
                    description: equipEditor.description ?? "",
                    iconKey: equipEditor.iconKey ?? undefined,
                    upgradeRate: equipEditor.upgradeRate,
                    maxLevel: equipEditor.maxLevel,
                    status: "published",
                  });
                } catch (error) {
                  toast.error("属性 JSON 解析失败", { description: (error as Error).message });
                }
              }}
            >
              <Save size={13} className="mr-1" />
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 技能编辑 */}
      <Dialog open={Boolean(skillEditor)} onOpenChange={(open) => { if (!open) setSkillEditor(null); }}>
        <DialogContent className="border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">编辑技能：{skillEditor?.name}</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">倍率单位为百分比（100 = 100% 攻击力）；效果为结构化数组，支持 status / heal / shield / buff / debuff。</DialogDescription>
          </DialogHeader>
          {skillEditor ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">名称</Label>
                  <Input value={skillEditor.name} onChange={(event) => setSkillEditor({ ...skillEditor, name: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">元素</Label>
                  <Select value={skillEditor.element} onValueChange={(value) => setSkillEditor({ ...skillEditor, element: value })}>
                    <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                      {["physical", "fire", "frost", "lightning", "holy", "shadow"].map((element) => (
                        <SelectItem key={element} value={element}>{element}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">类型</Label>
                  <Select value={skillEditor.kind} onValueChange={(value) => setSkillEditor({ ...skillEditor, kind: value })}>
                    <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                      <SelectItem value="active">主动</SelectItem>
                      <SelectItem value="passive">被动</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">目标</Label>
                  <Select value={skillEditor.targetType} onValueChange={(value) => setSkillEditor({ ...skillEditor, targetType: value })}>
                    <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                      <SelectItem value="self">自身</SelectItem>
                      <SelectItem value="ally">单体友方</SelectItem>
                      <SelectItem value="all_allies">全体友方</SelectItem>
                      <SelectItem value="enemy">单体敌人</SelectItem>
                      <SelectItem value="all_enemies">全体敌人</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {([
                  ["power", "倍率 (%)"],
                  ["cooldown", "冷却（回合）"],
                  ["energyCost", "能量消耗"],
                  ["maxLevel", "技能等级上限"],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">{label}</Label>
                    <Input type="number" value={skillEditor[key]} onChange={(event) => setSkillEditor({ ...skillEditor, [key]: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                  </div>
                ))}
              </div>
              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">效果（JSON 数组）</Label>
                <Textarea value={skillEditor.effectsJson} onChange={(event) => setSkillEditor({ ...skillEditor, effectsJson: event.target.value })} rows={4} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 font-mono text-[0.64rem] text-[color:var(--parchment)]" />
              </div>
              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">描述</Label>
                <Textarea value={skillEditor.description} onChange={(event) => setSkillEditor({ ...skillEditor, description: event.target.value })} rows={2} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setSkillEditor(null)}>取消</Button>
            <Button
              className="btn-gold border-transparent text-[color:var(--ink-950)]"
              disabled={saveSkill.isPending || !skillEditor}
              onClick={() => {
                if (!skillEditor) return;
                try {
                  const effects = JSON.parse(skillEditor.effectsJson) as Array<Record<string, string | number | boolean>>;
                  saveSkill.mutate({
                    skillKey: skillEditor.skillKey,
                    name: skillEditor.name,
                    element: skillEditor.element as "physical",
                    kind: skillEditor.kind as "active",
                    targetType: skillEditor.targetType as "enemy",
                    power: skillEditor.power,
                    cooldown: skillEditor.cooldown,
                    energyCost: skillEditor.energyCost,
                    maxLevel: skillEditor.maxLevel,
                    description: skillEditor.description,
                    effects,
                    iconKey: skillEditor.iconKey ?? undefined,
                  });
                } catch (error) {
                  toast.error("效果 JSON 解析失败", { description: (error as Error).message });
                }
              }}
            >
              <Save size={13} className="mr-1" />
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Panel className="mt-4 p-3">
        <SectionTitle eyebrow="Balance Note" title="数值调整提示" />
        <GoldRule />
        <ul className="space-y-1 text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">
          <li>· 装备属性以「加法」进入角色面板，再叠加建筑加成与突破加成后进入战斗。</li>
          <li>· 技能倍率为百分比，克制关系会使最终伤害乘以 1.25（被克制 0.8，同元素 0.9）。</li>
          <li>· 调整后建议先在「招募池 → 抽样模拟」与实战中验证平衡，再长期开放。</li>
        </ul>
      </Panel>
    </GMShell>
  );
}