/**
 * GM AI 配置
 * Base URL / API Key / 模型拉取与选择 / 调用测试 / 调用记录
 * 安全约定：密钥仅以掩码返回；客户端无法覆盖任何模型设置。
 */
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Activity, Check, KeyRound, RefreshCw, Save, ShieldAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { GMShell } from "@/components/game/GMShell";
import { EmptyState, ErrorState, GoldRule, Panel, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";

type AiConfigRow = {
  id: number;
  name: string;
  baseUrl: string | null;
  model: string | null;
  temperature: number;
  maxTokens: number;
  systemPrompt: string | null;
  jsonStrict: boolean;
  useBuiltInGateway: boolean;
  enabled: boolean;
  isActive: boolean;
  apiKeyConfigured: boolean;
  apiKeyHint: string | null;
  keyPreview: string;
  lastTestAt: Date | string | null;
  lastTestStatus: string | null;
  models: Array<{ modelId: string; label: string; isDefault: boolean; enabled: boolean }>;
  updatedAt: Date | string;
};

type Editor = {
  id?: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  jsonStrict: boolean;
  useBuiltInGateway: boolean;
  enabled: boolean;
  isActive: boolean;
};

function emptyEditor(): Editor {
  return {
    name: "默认 AI 配置",
    baseUrl: "",
    apiKey: "",
    model: "",
    temperature: 80,
    maxTokens: 900,
    systemPrompt: "",
    jsonStrict: true,
    useBuiltInGateway: false,
    enabled: true,
    isActive: true,
  };
}

export default function GMAi() {
  const utils = trpc.useUtils();
  const configs = trpc.admin.listAiConfigs.useQuery();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [testResult, setTestResult] = useState<null | { ok: boolean; message: string; output?: unknown; models?: string[] }>(null);
  const [modelDialog, setModelDialog] = useState<number | null>(null);
  const [modelCandidates, setModelCandidates] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const fetchAfterSave = useRef(false);

  const fetchModels = trpc.admin.fetchAiModels.useMutation({
    onSuccess: async (result, variables) => {
      if (result.ok) toast.success(result.message);
      else toast.warning("模型拉取未成功", { description: result.message });
      const candidates = result.models.map((model) => model.id);
      setModelCandidates(candidates);
      const current = (configs.data as AiConfigRow[] | undefined)?.find((row) => row.id === variables.id)?.model ?? null;
      setSelectedModel(current && candidates.includes(current) ? current : candidates[0] ?? null);
      setModelDialog(candidates.length > 0 ? variables.id : null);
      await utils.admin.listAiConfigs.invalidate();
    },
    onError: (error) => toast.error("拉取失败", { description: error.message }),
  });

  const save = trpc.admin.saveAiConfig.useMutation({
    onSuccess: async (result) => {
      toast.success("AI 配置已保存（密钥加密存储）");
      const shouldFetchModels = fetchAfterSave.current;
      fetchAfterSave.current = false;
      setEditor(null);
      await Promise.all([utils.admin.listAiConfigs.invalidate(), utils.admin.overview.invalidate()]);
      if (shouldFetchModels) fetchModels.mutate({ id: result.id });
    },
    onError: (error) => toast.error("保存失败", { description: error.message }),
  });

  const activate = trpc.admin.activateAiConfig.useMutation({
    onSuccess: async () => {
      toast.success("已切换为当前启用配置");
      await Promise.all([utils.admin.listAiConfigs.invalidate(), utils.admin.overview.invalidate()]);
    },
    onError: (error) => toast.error("切换失败", { description: error.message }),
  });

  const remove = trpc.admin.deleteAiConfig.useMutation({
    onSuccess: async () => {
      toast.success("配置已删除");
      await utils.admin.listAiConfigs.invalidate();
    },
    onError: (error) => toast.error("删除失败", { description: error.message }),
  });

  const selectModel = trpc.admin.selectAiModel.useMutation({
    onSuccess: async (result) => {
      toast.success("已选择模型：" + result.model);
      setModelDialog(null);
      setModelCandidates([]);
      setSelectedModel(null);
      await Promise.all([utils.admin.listAiConfigs.invalidate(), utils.admin.overview.invalidate()]);
    },
    onError: (error) => toast.error("选择模型失败", { description: error.message }),
  });

  const test = trpc.admin.testAiConfig.useMutation({
    onSuccess: (result) => {
      setTestResult(result as typeof testResult);
      if (result.ok) toast.success("AI 调用测试通过");
      else toast.error("AI 调用测试失败", { description: result.message });
      void utils.admin.listAiConfigs.invalidate();
    },
    onError: (error) => toast.error("测试失败", { description: error.message }),
  });

  const logs = trpc.admin.aiLogs.useQuery({ limit: 50 });
  const [onlyViolations, setOnlyViolations] = useState(false);
  const filteredLogs = trpc.admin.aiLogs.useQuery({ limit: 100, onlyViolations });

  const saveEditor = (andFetchModels = false) => {
    if (!editor) return;
    fetchAfterSave.current = andFetchModels;
    save.mutate({
      id: editor.id,
      name: editor.name,
      baseUrl: editor.baseUrl,
      apiKey: editor.apiKey ? editor.apiKey : undefined,
      model: editor.model,
      temperature: editor.temperature,
      maxTokens: editor.maxTokens,
      systemPrompt: editor.systemPrompt || null,
      jsonStrict: editor.jsonStrict,
      useBuiltInGateway: editor.useBuiltInGateway,
      enabled: editor.enabled,
      isActive: editor.isActive,
    });
  };

  return (
    <GMShell
      title="AI 配置"
      eyebrow="Base URL / 密钥 / 模型 / JSON 校验 / 调用日志 —— 客户端不可覆盖任何设置"
      actions={
        <Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={() => setEditor(emptyEditor())}>
          新建配置
        </Button>
      }
    >
      <Tabs defaultValue="configs">
        <TabsList className="border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/60">
          <TabsTrigger value="configs" className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">
            <KeyRound size={12} className="mr-1" />
            配置列表
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">
            <Activity size={12} className="mr-1" />
            调用记录
          </TabsTrigger>
        </TabsList>

        <TabsContent value="configs">
          {configs.isLoading ? (
            <SkeletonState rows={4} />
          ) : configs.isError ? (
            <ErrorState message={configs.error?.message} onRetry={() => configs.refetch()} />
          ) : (configs.data ?? []).length === 0 ? (
            <EmptyState
              title="尚未配置 AI"
              hint="可使用平台内置网关（无需自备密钥），或填写任意 OpenAI 兼容接口的 Base URL 与密钥。未配置时议事厅使用本地兜底文本。"
              icon={<KeyRound size={20} />}
            />
          ) : (
            <div className="mt-3 space-y-2">
              {(configs.data as AiConfigRow[]).map((row) => (
                <Panel key={row.id} className="p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-[240px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-display text-sm text-[color:var(--parchment)]">{row.name}</span>
                        {row.isActive ? <Tag tone="good">当前启用</Tag> : null}
                        {row.useBuiltInGateway ? <Tag tone="aether">内置网关</Tag> : <Tag tone="gold">外部接口</Tag>}
                        <Tag tone={row.enabled ? "neutral" : "danger"}>{row.enabled ? "已启用" : "已停用"}</Tag>
                        {row.jsonStrict ? <Tag tone="neutral">严格 JSON</Tag> : null}
                      </div>
                      <div className="mt-1 text-[0.66rem] text-[color:var(--parchment-muted)]">
                        模型：{row.model || "（未指定）"} · 温度 {row.temperature} · 最大 Token {row.maxTokens}
                      </div>
                      <div className="mt-0.5 text-[0.66rem] text-[color:var(--parchment-muted)]">
                        Base URL：{row.useBuiltInGateway ? "平台内置网关" : row.baseUrl || "—"} · 密钥：{row.keyPreview}
                      </div>
                      <div className="mt-0.5 text-[0.64rem]">
                        <span className="text-[color:var(--parchment-muted)]">最近测试：</span>
                        <span className={cn(row.lastTestStatus === "ok" ? "text-[color:var(--verdant)]" : "text-[color:var(--ember-400)]")}>
                          {row.lastTestStatus ?? "未测试"}
                          {row.lastTestAt ? ` · ${new Date(row.lastTestAt).toLocaleString("zh-CN")}` : ""}
                        </span>
                      </div>
                      {row.models.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {row.models.slice(0, 6).map((model) => (
                            <span key={model.modelId} className="rounded-sm border border-[color:var(--ink-500)]/50 px-1.5 py-0.5 text-[0.6rem] text-[color:var(--parchment-dim)]">
                              {model.modelId}
                              {model.isDefault ? <Check size={9} className="ml-1 inline text-[color:var(--verdant)]" /> : null}
                            </span>
                          ))}
                          {row.models.length > 6 ? <span className="text-[0.6rem] text-[color:var(--parchment-muted)]">…共 {row.models.length} 个</span> : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 border-[color:var(--ink-500)]/70 text-[0.66rem] text-[color:var(--parchment-dim)]" onClick={() => {
                        setEditor({
                          id: row.id,
                          name: row.name,
                          baseUrl: row.baseUrl ?? "",
                          apiKey: "",
                          model: row.model ?? "",
                          temperature: row.temperature,
                          maxTokens: row.maxTokens,
                          systemPrompt: row.systemPrompt ?? "",
                          jsonStrict: row.jsonStrict,
                          useBuiltInGateway: row.useBuiltInGateway,
                          enabled: row.enabled,
                          isActive: row.isActive,
                        });
                        setTestResult(null);
                      }}>
                        编辑
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 border-[color:var(--aether-500)]/50 text-[0.66rem] text-[color:var(--aether-300)]" onClick={() => fetchModels.mutate({ id: row.id })} disabled={fetchModels.isPending}>
                        <RefreshCw size={11} className={cn("mr-1", fetchModels.isPending && "animate-spin")} />
                        拉取模型
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 border-[color:var(--gold-600)]/50 text-[0.66rem] text-[color:var(--gold-300)]" onClick={() => { test.mutate({ id: row.id }); setEditor((current) => current ?? null); }} disabled={test.isPending}>
                        <Zap size={11} className="mr-1" />
                        调用测试
                      </Button>
                      {!row.isActive ? (
                        <Button size="sm" variant="outline" className="h-7 border-[color:var(--verdant)]/50 text-[0.66rem] text-[color:var(--verdant)]" onClick={() => activate.mutate({ id: row.id })} disabled={activate.isPending}>
                          设为启用
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" className="h-7 border-[color:var(--blood)]/50 text-[0.66rem] text-[color:var(--blood)]" onClick={() => remove.mutate({ id: row.id })} disabled={remove.isPending}>
                        删除
                      </Button>
                    </div>
                  </div>
                </Panel>
              ))}
            </div>
          )}

          {testResult ? (
            <Panel className={cn("mt-3 p-3", testResult.ok ? "border-[color:var(--verdant)]/40" : "border-[color:var(--blood)]/40")}>
              <div className="text-caption mb-1">最近一次调用测试</div>
              <p className={cn("text-xs", testResult.ok ? "text-[color:var(--verdant)]" : "text-[color:var(--blood)]")}>{testResult.message}</p>
              {testResult.output ? (
                <pre className="mt-2 max-h-40 overflow-auto rounded-sm border border-[color:var(--ink-500)]/50 bg-[color:var(--ink-950)]/70 p-2 text-[0.6rem] text-[color:var(--parchment-muted)]">
                  {JSON.stringify(testResult.output, null, 2)}
                </pre>
              ) : null}
            </Panel>
          ) : null}

          <Panel className="mt-3 p-3">
            <div className="flex items-start gap-2 text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">
              <ShieldAlert size={14} className="mt-0.5 shrink-0 text-[color:var(--gold-500)]" />
              <span>
                安全说明：API Key 使用 AES-256-GCM 加密后存库，界面仅显示掩码（如 sk-****abcd）；密钥不会下发到前端，也不会写入日志。
                所有模型、温度、Token 上限与 JSON 校验策略均由本页统一控制，游戏客户端无法覆盖。
              </span>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="logs">
          <Panel className="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-caption">AI 调用记录（最近 100 条）</div>
              <label className="flex items-center gap-2 text-[0.68rem] text-[color:var(--parchment-muted)]">
                <Switch checked={onlyViolations} onCheckedChange={setOnlyViolations} />
                仅显示异常 / 被拒记录
              </label>
            </div>
            <GoldRule />
            {filteredLogs.isLoading ? (
              <SkeletonState rows={4} />
            ) : (filteredLogs.data ?? []).length === 0 ? (
              <EmptyState title={onlyViolations ? "没有异常记录" : "暂无调用记录"} hint="记录包含模型、耗时、Token、在场角色与被拒绝的输出数量。" />
            ) : (
              <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
                {(filteredLogs.data ?? []).map((log) => (
                  <div key={log.id} className="rounded-sm border border-[color:var(--ink-500)]/40 bg-[color:var(--ink-800)]/40 p-2 text-[0.66rem]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-sm border px-1.5 py-0.5", log.status === "ok" ? "border-[color:var(--verdant)]/50 text-[color:var(--verdant)]" : "border-[color:var(--ember-600)]/60 text-[color:var(--ember-400)]")}>
                        {log.status}
                      </span>
                      <span className="text-[color:var(--parchment-dim)]">{log.model ?? "—"}</span>
                      <span className="text-[color:var(--parchment-muted)]">HTTP {log.httpStatus ?? "-"} · {log.latencyMs ?? 0}ms</span>
                      <span className="text-[color:var(--parchment-muted)]">prompt {log.promptTokens ?? 0} / completion {log.completionTokens ?? 0}</span>
                      {log.violationCount > 0 ? <Tag tone="danger">拒绝 {log.violationCount}</Tag> : null}
                      <span className="ml-auto text-[color:var(--parchment-muted)]">{new Date(log.createdAt).toLocaleString("zh-CN")}</span>
                    </div>
                    <div className="mt-1 text-[color:var(--parchment-muted)]">
                      档案 #{log.profileId ?? "-"} · 在场角色：{(log.presentCharKeys ?? []).join("、") || "无"}
                    </div>
                    {log.errorMessage ? <div className="mt-1 text-[color:var(--ember-400)]">错误：{log.errorMessage.slice(0, 240)}</div> : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <p className="mt-2 text-[0.66rem] text-[color:var(--parchment-muted)]">共 {logs.data?.length ?? 0} 条记录被加载（默认最近 50 条）。</p>
        </TabsContent>
      </Tabs>

      {/* 配置编辑 */}
      <Dialog open={Boolean(editor)} onOpenChange={(open) => { if (!open) setEditor(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">{editor?.id ? "编辑 AI 配置" : "新建 AI 配置"}</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">
              外部接口请填写 Base URL 与 API Key；保存后可直接拉取并确认模型。内置网关开启时会使用平台模型，但仍可预先填写外部接口信息。
            </DialogDescription>
          </DialogHeader>
          {editor ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">配置名称</Label>
                  <Input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">模型标识</Label>
                  <Input value={editor.model} onChange={(event) => setEditor({ ...editor, model: event.target.value })} placeholder="例如 gpt-4o-mini / 自定义模型名" className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">Base URL（OpenAI 兼容，需包含 /v1）</Label>
                  <Input value={editor.baseUrl} onChange={(event) => setEditor({ ...editor, baseUrl: event.target.value })} placeholder="https://api.example.com/v1" className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">API Key（{editor.id ? "留空表示不修改" : "外部接口必填"}）</Label>
                  <Input type="password" value={editor.apiKey} onChange={(event) => setEditor({ ...editor, apiKey: event.target.value })} placeholder="sk-…" className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">温度（0-200，100 = 1.0）</Label>
                  <Input type="number" value={editor.temperature} onChange={(event) => setEditor({ ...editor, temperature: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">最大 Token</Label>
                  <Input type="number" value={editor.maxTokens} onChange={(event) => setEditor({ ...editor, maxTokens: Number(event.target.value) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                </div>
              </div>

              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">追加 System Prompt（可空；游戏规则提示词始终由服务端强制拼接）</Label>
                <Textarea value={editor.systemPrompt} onChange={(event) => setEditor({ ...editor, systemPrompt: event.target.value })} rows={4} className="mt-1 resize-none border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ["useBuiltInGateway", "使用平台内置网关（地址与密钥仍会保留）"],
                  ["jsonStrict", "严格 JSON 输出（Schema 校验）"],
                  ["enabled", "启用该配置"],
                  ["isActive", "设为当前使用的配置"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between rounded-sm border border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/50 px-3 py-2 text-xs text-[color:var(--parchment-dim)]">
                    {label}
                    <Switch checked={Boolean(editor[key])} onCheckedChange={(checked) => setEditor({ ...editor, [key]: checked })} />
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setEditor(null)}>取消</Button>
            <Button
              variant="outline"
              className="border-[color:var(--aether-500)]/50 text-[color:var(--aether-300)]"
              disabled={save.isPending || !editor?.name}
              onClick={() => saveEditor(true)}
            >
              <RefreshCw size={13} className="mr-1" />
              保存并拉取模型
            </Button>
            <Button
              className="btn-gold border-transparent text-[color:var(--ink-950)]"
              disabled={save.isPending || !editor?.name}
              onClick={() => saveEditor()}
            >
              <Save size={13} className="mr-1" />
              {save.isPending ? "保存中…" : "保存配置"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 模型选择 */}
      <Dialog open={Boolean(modelDialog)} onOpenChange={(open) => { if (!open) { setModelDialog(null); setModelCandidates([]); setSelectedModel(null); } }}>
        <DialogContent className="max-h-[80vh] overflow-y-auto border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">可用模型</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">选择一个模型后，点击「确认选择」才会写入当前配置。</DialogDescription>
          </DialogHeader>
          {modelCandidates.length ? (
            <div className="space-y-1">
              {modelCandidates.map((model) => (
                <button
                  key={model}
                  className={cn(
                    "card-tap flex w-full items-center justify-between rounded-sm border px-2.5 py-1.5 text-left text-xs",
                    selectedModel === model ? "border-[color:var(--gold-300)] bg-[color:var(--ink-700)]/70 text-[color:var(--gold-300)]" : "border-[color:var(--ink-500)]/50 text-[color:var(--parchment-dim)]",
                  )}
                  onClick={() => setSelectedModel(model)}
                >
                  <span className="min-w-0 truncate">{model}</span>
                  {selectedModel === model ? <Check size={12} /> : null}
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="没有可选模型" hint="请先点击「拉取模型」，或手动在配置中填写模型标识。" />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setModelDialog(null)}>取消</Button>
            <Button
              className="btn-gold border-transparent text-[color:var(--ink-950)]"
              disabled={!modelDialog || !selectedModel || selectModel.isPending}
              onClick={() => {
                if (!modelDialog || !selectedModel) return;
                selectModel.mutate({ configId: modelDialog, modelId: selectedModel });
              }}
            >
              <Check size={13} className="mr-1" />
              {selectModel.isPending ? "确认中…" : "确认选择"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Panel className="mt-4 p-3">
        <SectionTitle eyebrow="Prompt Contract" title="AI 输出契约（服务端强制）" />
        <GoldRule />
        <ul className="space-y-1 text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">
          <li>· 只把玩家选中的在场角色写入提示词；其他角色不会出现，也不会被允许发言。</li>
          <li>· 输出必须为 JSON：包含 narration、turns[]、suggestions[]；turns 中的 charKey 必须属于在场角色集合。</li>
          <li>· 服务端逐条校验：未知角色 ID、越界设定改动、不合规内容、结构错误都会被拒绝并写入调用日志。</li>
          <li>· 模型不可改变角色身份、阵营或性格；这些字段由角色库统一维护。</li>
        </ul>
      </Panel>
    </GMShell>
  );
}
