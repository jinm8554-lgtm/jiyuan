/**
 * GM 角色库：检索 / 编辑资料 / 上传立绘 / 发布下架 / 全年龄向自检
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Eye, EyeOff, Image as ImageIcon, Save, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { GMShell } from "@/components/game/GMShell";
import { Avatar, EmptyState, ErrorState, GoldRule, Panel, RarityBadge, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";
import { JOB_NAME } from "@/components/game/ui";

const ALL = "__all__";

type CharacterRow = {
  id: number;
  charKey: string;
  name: string;
  title: string;
  rarity: "R" | "SR" | "SSR";
  rarityLabel: string;
  job: string;
  race: string;
  element: string;
  faction: string;
  status: string;
  inRecruitPool: boolean;
  avatarUrl: string | null;
  portraitUrl: string | null;
  contentRating: string | null;
  version: number;
  updatedAt: Date | string;
  skillCount: number;
};

type EditorState = {
  charKey: string;
  name: string;
  title: string;
  rarity: "R" | "SR" | "SSR";
  job: string;
  race: string;
  weapon: string;
  element: string;
  faction: string;
  portraitUrl: string;
  avatarUrl: string;
  intro: string;
  appearance: string;
  background: string;
  personality: string;
  goal: string;
  skillKeys: string;
  baseStats: string;
  growth: string;
  relations: string;
  quotes: string;
  contentRating: string;
  sortOrder: number;
  status: "draft" | "published" | "archived";
  inRecruitPool: boolean;
};

const EMPTY_EDITOR: EditorState = {
  charKey: "",
  name: "",
  title: "",
  rarity: "R",
  job: "warrior",
  race: "",
  weapon: "",
  element: "physical",
  faction: "",
  portraitUrl: "",
  avatarUrl: "",
  intro: "",
  appearance: "",
  background: "",
  personality: "",
  goal: "",
  skillKeys: "",
  baseStats: '{"hp":900,"atk":82,"def":60,"mag":20,"res":40,"spd":72,"crit":6,"critDmg":50,"hit":95,"dodge":6}',
  growth: '{"curve":1.25,"growth":1.1}',
  relations: "[]",
  quotes: '{"battle":[""],"idle":[""],"bond":[""]}',
  contentRating: "all-ages",
  sortOrder: 100,
  status: "draft",
  inRecruitPool: false,
};

function toEditor(row: Record<string, unknown>): EditorState {
  return {
    charKey: String(row.charKey ?? ""),
    name: String(row.name ?? ""),
    title: String(row.title ?? ""),
    rarity: (row.rarity as EditorState["rarity"]) ?? "R",
    job: String(row.job ?? "warrior"),
    race: String(row.race ?? ""),
    weapon: String(row.weapon ?? ""),
    element: String(row.element ?? "physical"),
    faction: String(row.faction ?? ""),
    portraitUrl: String(row.portraitUrl ?? ""),
    avatarUrl: String(row.avatarUrl ?? ""),
    intro: String(row.intro ?? ""),
    appearance: String(row.appearance ?? ""),
    background: String(row.background ?? ""),
    personality: String(row.personality ?? ""),
    goal: String(row.goal ?? ""),
    skillKeys: Array.isArray(row.skillKeys) ? (row.skillKeys as string[]).join(",") : "",
    baseStats: JSON.stringify(row.baseStats ?? {}, null, 0),
    growth: JSON.stringify(row.growth ?? { curve: 1.2, growth: 1.05 }, null, 0),
    relations: JSON.stringify(row.relations ?? [], null, 0),
    quotes: JSON.stringify(row.quotes ?? {}, null, 0),
    contentRating: String(row.contentRating ?? "all-ages"),
    sortOrder: Number(row.sortOrder ?? 100),
    status: (row.status as EditorState["status"]) ?? "draft",
    inRecruitPool: Boolean(row.inRecruitPool),
  };
}

export default function GMCharacters() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [rarity, setRarity] = useState<string>(ALL);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const list = trpc.admin.listCharacters.useQuery({ search: search || undefined, status: status === ALL ? undefined : (status as "all"), rarity: rarity === ALL ? undefined : (rarity as "all") });
  const skills = trpc.admin.listSkills.useQuery();
  const detail = trpc.admin.getCharacter.useQuery({ charKey: editingKey ?? "" }, { enabled: Boolean(editingKey) });

  useEffect(() => {
    if (detail.data) setEditor(toEditor(detail.data as unknown as Record<string, unknown>));
  }, [detail.data]);

  const save = trpc.admin.saveCharacter.useMutation({
    onSuccess: async () => {
      toast.success("角色资料已保存，客户端将立即生效");
      await Promise.all([utils.admin.listCharacters.invalidate(), utils.admin.getCharacter.invalidate(), utils.admin.overview.invalidate()]);
    },
    onError: (error) => toast.error("保存失败", { description: error.message }),
  });

  const setStatusMutation = trpc.admin.setCharacterStatus.useMutation({
    onSuccess: async () => {
      toast.success("发布状态已更新");
      await Promise.all([utils.admin.listCharacters.invalidate(), utils.admin.overview.invalidate()]);
    },
    onError: (error) => toast.error("操作失败", { description: error.message }),
  });

  const upload = trpc.admin.uploadCharacterAsset.useMutation({
    onSuccess: async (result) => {
      toast.success("资源已上传", { description: result.url });
      await Promise.all([utils.admin.listCharacters.invalidate(), utils.admin.getCharacter.invalidate()]);
    },
    onError: (error) => toast.error("上传失败", { description: error.message }),
  });

  function pickFile(kind: "portrait" | "avatar") {
    if (!editor) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 6 * 1024 * 1024) {
        toast.error("图片不能超过 6MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result ?? "");
        upload.mutate({
          charKey: editor.charKey,
          kind,
          filename: file.name,
          contentType: file.type === "image/png" ? "image/png" : file.type === "image/webp" ? "image/webp" : "image/jpeg",
          base64: dataUrl,
        });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  function submitEditor() {
    if (!editor) return;
    let baseStats: Record<string, number>;
    let growth: { curve: number; growth: number };
    let relations: Array<{ charKey: string; relation: string; note: string }>;
    let quotes: Record<string, string[]>;
    try {
      baseStats = JSON.parse(editor.baseStats) as Record<string, number>;
      growth = JSON.parse(editor.growth) as { curve: number; growth: number };
      relations = JSON.parse(editor.relations) as Array<{ charKey: string; relation: string; note: string }>;
      quotes = JSON.parse(editor.quotes) as Record<string, string[]>;
    } catch (error) {
      toast.error("JSON 字段解析失败", { description: (error as Error).message });
      return;
    }
    save.mutate({
      charKey: editor.charKey,
      name: editor.name,
      title: editor.title,
      rarity: editor.rarity,
      job: editor.job as "warrior",
      race: editor.race,
      weapon: editor.weapon,
      element: editor.element as "physical",
      faction: editor.faction,
      portraitUrl: editor.portraitUrl || null,
      avatarUrl: editor.avatarUrl || null,
      intro: editor.intro,
      appearance: editor.appearance,
      background: editor.background,
      personality: editor.personality,
      goal: editor.goal,
      skillKeys: editor.skillKeys.split(",").map((item) => item.trim()).filter(Boolean),
      baseStats,
      growth,
      relations,
      quotes,
      contentRating: editor.contentRating,
      sortOrder: editor.sortOrder,
      status: editor.status,
      inRecruitPool: editor.inRecruitPool,
    });
  }

  return (
    <GMShell
      title="角色库"
      eyebrow="角色资料 / 立绘上传 / 发布与下架 —— 保存后客户端立即生效"
      actions={
        <Button
          size="sm"
          className="btn-gold border-transparent text-[color:var(--ink-950)]"
          onClick={() => {
            setEditingKey(null);
            setEditor({ ...EMPTY_EDITOR });
          }}
        >
          新建角色
        </Button>
      }
    >
      <Panel className="mb-4 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[color:var(--parchment-muted)]" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称 / 标识 / 称号" className="h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 pl-7 text-xs text-[color:var(--parchment)]" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-8 w-[120px] border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
              <SelectItem value={ALL}>全部状态</SelectItem>
              <SelectItem value="draft">草稿</SelectItem>
              <SelectItem value="published">已发布</SelectItem>
              <SelectItem value="archived">已下架</SelectItem>
            </SelectContent>
          </Select>
          <Select value={rarity} onValueChange={setRarity}>
            <SelectTrigger className="h-8 w-[110px] border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
              <SelectItem value={ALL}>全部品质</SelectItem>
              <SelectItem value="SSR">SSR</SelectItem>
              <SelectItem value="SR">SR</SelectItem>
              <SelectItem value="R">R</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Panel>

      {list.isLoading ? (
        <SkeletonState rows={5} />
      ) : list.isError ? (
        <ErrorState message={list.error?.message} onRetry={() => list.refetch()} />
      ) : (list.data ?? []).length === 0 ? (
        <EmptyState title="没有匹配的角色" hint="调整筛选条件，或点击「新建角色」添加。新角色入库后可以选择是否进入招募池。" />
      ) : (
        <div className="space-y-2">
          {(list.data as CharacterRow[]).map((row) => (
            <Panel key={row.charKey} className="flex flex-wrap items-center gap-3 p-3">
              <Avatar src={row.avatarUrl} name={row.name} rarity={row.rarity} size={44} />
              <div className="min-w-[180px] flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-display text-sm text-[color:var(--parchment)]">{row.name}</span>
                  <span className="text-[0.68rem] text-[color:var(--gold-300)]">{row.title}</span>
                  <RarityBadge rarity={row.rarity} />
                  <Tag tone={row.status === "published" ? "good" : row.status === "draft" ? "gold" : "neutral"}>
                    {row.status === "published" ? "已发布" : row.status === "draft" ? "草稿" : "已下架"}
                  </Tag>
                  {row.inRecruitPool ? <Tag tone="aether">招募池</Tag> : null}
                </div>
                <div className="mt-0.5 text-[0.66rem] text-[color:var(--parchment-muted)]">
                  {row.charKey} · {JOB_NAME[row.job] ?? row.job} · {row.race} · {row.faction} · 技能 {row.skillCount} · v{row.version} · 更新 {new Date(row.updatedAt).toLocaleString("zh-CN")}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="h-7 border-[color:var(--ink-500)]/70 text-[0.68rem] text-[color:var(--parchment-dim)]" onClick={() => setEditingKey(row.charKey)}>
                  编辑
                </Button>
                {row.status === "published" ? (
                  <Button size="sm" variant="outline" className="h-7 border-[color:var(--blood)]/50 text-[0.68rem] text-[color:var(--blood)]" onClick={() => setStatusMutation.mutate({ charKey: row.charKey, status: "archived" })} disabled={setStatusMutation.isPending}>
                    <EyeOff size={12} className="mr-1" />
                    下架
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 border-[color:var(--verdant)]/50 text-[0.68rem] text-[color:var(--verdant)]" onClick={() => setStatusMutation.mutate({ charKey: row.charKey, status: "published" })} disabled={setStatusMutation.isPending}>
                    <Eye size={12} className="mr-1" />
                    发布
                  </Button>
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}

      {/* 编辑器 */}
      <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open) { setEditor(null); setEditingKey(null); } }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">{editingKey ? `编辑：${editor?.name ?? editingKey}` : "新建角色"}</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">
              角色资料全部来自后台配置；保存后客户端立即生效。内容分级固定为全年龄向，禁止成人向设定。
            </DialogDescription>
          </DialogHeader>

          {editingKey && detail.isLoading ? (
            <SkeletonState rows={4} />
          ) : editor ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">标识 charKey（小写字母/数字/下划线，保存后不可更改）</Label>
                  <Input
                    value={editor.charKey}
                    disabled={Boolean(editingKey)}
                    onChange={(event) => setEditor({ ...editor, charKey: event.target.value })}
                    className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]"
                  />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">姓名</Label>
                  <Input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">称号</Label>
                  <Input value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">品质</Label>
                    <Select value={editor.rarity} onValueChange={(value) => setEditor({ ...editor, rarity: value as EditorState["rarity"] })}>
                      <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                        <SelectItem value="R">R 常民</SelectItem>
                        <SelectItem value="SR">SR 精锐</SelectItem>
                        <SelectItem value="SSR">SSR 英杰</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">职业</Label>
                    <Select value={editor.job} onValueChange={(value) => setEditor({ ...editor, job: value })}>
                      <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                        {Object.entries(JOB_NAME).map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">种族</Label>
                  <Input value={editor.race} onChange={(event) => setEditor({ ...editor, race: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">武器</Label>
                  <Input value={editor.weapon} onChange={(event) => setEditor({ ...editor, weapon: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">元素</Label>
                  <Select value={editor.element} onValueChange={(value) => setEditor({ ...editor, element: value })}>
                    <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                      <SelectItem value="physical">物理</SelectItem>
                      <SelectItem value="fire">火</SelectItem>
                      <SelectItem value="frost">冰</SelectItem>
                      <SelectItem value="lightning">雷</SelectItem>
                      <SelectItem value="holy">圣</SelectItem>
                      <SelectItem value="shadow">暗</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">阵营</Label>
                  <Input value={editor.faction} onChange={(event) => setEditor({ ...editor, faction: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
              </div>

              <GoldRule />

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">立绘路径（可上传）</Label>
                  <div className="mt-1 flex gap-2">
                    <Input value={editor.portraitUrl} onChange={(event) => setEditor({ ...editor, portraitUrl: event.target.value })} className="h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                    <Button size="sm" variant="outline" className="h-8 shrink-0 border-[color:var(--gold-600)]/50 text-[0.68rem] text-[color:var(--gold-300)]" onClick={() => pickFile("portrait")} disabled={!editingKey || upload.isPending}>
                      <Upload size={12} className="mr-1" />
                      上传
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">头像路径（可上传）</Label>
                  <div className="mt-1 flex gap-2">
                    <Input value={editor.avatarUrl} onChange={(event) => setEditor({ ...editor, avatarUrl: event.target.value })} className="h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                    <Button size="sm" variant="outline" className="h-8 shrink-0 border-[color:var(--gold-600)]/50 text-[0.68rem] text-[color:var(--gold-300)]" onClick={() => pickFile("avatar")} disabled={!editingKey || upload.isPending}>
                      <Upload size={12} className="mr-1" />
                      上传
                    </Button>
                  </div>
                </div>
              </div>
              {!editingKey ? <p className="text-[0.66rem] text-[color:var(--ember-400)]">先保存角色后再上传立绘（需要已有标识）。</p> : null}
              {editor.portraitUrl ? (
                <div className="flex items-center gap-2 rounded-sm border border-[color:var(--ink-500)]/50 p-2">
                  <ImageIcon size={14} className="text-[color:var(--gold-500)]" />
                  <img src={editor.portraitUrl} alt="立绘预览" className="h-20 rounded-sm object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                  <span className="text-[0.62rem] text-[color:var(--parchment-muted)]">立绘预览（加载失败时会回退为纹章首字母牌）</span>
                </div>
              ) : null}

              <GoldRule />

              {([
                ["intro", "简介"],
                ["appearance", "外貌"],
                ["background", "背景"],
                ["personality", "性格"],
                ["goal", "个人目标"],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">{label}</Label>
                  <Textarea
                    value={editor[key]}
                    onChange={(event) => setEditor({ ...editor, [key]: event.target.value })}
                    rows={key === "background" ? 4 : 2}
                    className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]"
                  />
                </div>
              ))}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">技能（逗号分隔的 skillKey）</Label>
                  <Input value={editor.skillKeys} onChange={(event) => setEditor({ ...editor, skillKeys: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                  {skills.data ? (
                    <p className="mt-1 text-[0.62rem] leading-relaxed text-[color:var(--parchment-muted)]">
                      可用：{(skills.data as Array<{ skillKey: string }>).slice(0, 18).map((skill) => skill.skillKey).join("、")}
                      {(skills.data as Array<unknown>).length > 18 ? " …" : ""}
                    </p>
                  ) : null}
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">关系（JSON 数组）</Label>
                  <Input value={editor.relations} onChange={(event) => setEditor({ ...editor, relations: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">基础属性（JSON）</Label>
                  <Textarea value={editor.baseStats} onChange={(event) => setEditor({ ...editor, baseStats: event.target.value })} rows={3} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 font-mono text-[0.66rem] text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">成长曲线（JSON：curve / growth）</Label>
                  <Textarea value={editor.growth} onChange={(event) => setEditor({ ...editor, growth: event.target.value })} rows={3} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 font-mono text-[0.66rem] text-[color:var(--parchment)]" />
                </div>
              </div>

              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">台词（JSON：battle / idle / bond 三个数组）</Label>
                <Textarea value={editor.quotes} onChange={(event) => setEditor({ ...editor, quotes: event.target.value })} rows={4} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 font-mono text-[0.66rem] text-[color:var(--parchment)]" />
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">排序</Label>
                  <Input type="number" value={editor.sortOrder} onChange={(event) => setEditor({ ...editor, sortOrder: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">状态</Label>
                  <Select value={editor.status} onValueChange={(value) => setEditor({ ...editor, status: value as EditorState["status"] })}>
                    <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                      <SelectItem value="draft">草稿</SelectItem>
                      <SelectItem value="published">发布</SelectItem>
                      <SelectItem value="archived">下架</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">内容分级</Label>
                  <Input value={editor.contentRating} onChange={(event) => setEditor({ ...editor, contentRating: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    className={cn("h-8 w-full border text-[0.68rem]", editor.inRecruitPool ? "border-[color:var(--aether-500)]/60 text-[color:var(--aether-300)]" : "border-[color:var(--ink-500)]/70 text-[color:var(--parchment-muted)]")}
                    onClick={() => setEditor({ ...editor, inRecruitPool: !editor.inRecruitPool })}
                  >
                    {editor.inRecruitPool ? <Check size={12} className="mr-1" /> : null}
                    进入招募池
                  </Button>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-sm border border-[color:var(--gold-600)]/40 bg-[color:var(--ink-800)]/60 p-2 text-[0.66rem] text-[color:var(--parchment-muted)]">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[color:var(--gold-500)]" />
                <span>全年龄向自检：角色应以冒险者、骑士、法师、学者、工匠等正向身份呈现；禁止色情、色情服装、身体羞辱与成人向互动描述。</span>
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => { setEditor(null); setEditingKey(null); }}>取消</Button>
            <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={submitEditor} disabled={save.isPending || !editor?.charKey || !editor?.name}>
              <Save size={13} className="mr-1" />
              {save.isPending ? "保存中…" : "保存并同步到客户端"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GMShell>
  );
}
