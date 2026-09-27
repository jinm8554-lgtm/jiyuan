/**
 * GM 备份与运维
 * 备份创建 / 上传校验 / 恢复（含预演）/ 配置同步 / 审计日志
 */
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Database, Download, HardDriveDownload, History, RefreshCw, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { GMShell } from "@/components/game/GMShell";
import { EmptyState, ErrorState, GoldRule, Panel, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";

type BackupRow = {
  id: number;
  backupKey: string;
  scope: string;
  targetProfileId: number | null;
  filename: string;
  sizeBytes: number;
  checksum: string;
  recordCounts: Record<string, number> | null;
  status: string;
  note: string | null;
  createdAt: Date | string;
  restoredAt: Date | string | null;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function GMOps() {
  const utils = trpc.useUtils();
  const backups = trpc.admin.listBackups.useQuery();
  const profiles = trpc.admin.listPlayerProfiles.useQuery();
  const audit = trpc.admin.listAuditLogs.useQuery();
  const [createDialog, setCreateDialog] = useState<null | { scope: "full" | "config" | "profile"; targetProfileId: string; note: string }>(null);
  const [restoreDialog, setRestoreDialog] = useState<null | { backup: BackupRow }>(null);
  const [restoreResult, setRestoreResult] = useState<null | { ok: boolean; dryRun?: boolean; scope?: string; summary?: Record<string, number>; restored?: Record<string, number>; reason?: string; message?: string }>(null);
  const [verifyResult, setVerifyResult] = useState<null | { ok: boolean; reason?: string; scope?: string; createdAt?: string; summary?: Record<string, number> }>(null);

  const createBackup = trpc.admin.createBackup.useMutation({
    onSuccess: async (result) => {
      if (result.ok) toast.success(`备份完成：${result.filename}`, { description: `校验和 ${result.checksum}` });
      else toast.error("备份未完成", { description: String(result.reason ?? "") });
      setCreateDialog(null);
      await Promise.all([utils.admin.listBackups.invalidate(), utils.admin.overview.invalidate()]);
    },
    onError: (error) => toast.error("备份失败", { description: error.message }),
  });

  const restoreBackup = trpc.admin.restoreBackup.useMutation({
    onSuccess: async (result) => {
      setRestoreResult(result as typeof restoreResult);
      if (result.ok) toast.success(result.dryRun ? "恢复预演通过（未写入数据库）" : "恢复完成");
      else toast.error("恢复失败", { description: (result as { reason?: string; message?: string }).reason ?? (result as { message?: string }).message });
      await Promise.all([utils.admin.listBackups.invalidate(), utils.admin.listAuditLogs.invalidate()]);
    },
    onError: (error) => toast.error("恢复失败", { description: error.message }),
  });

  const verifyUpload = trpc.admin.verifyBackupUpload.useMutation({
    onSuccess: (result) => {
      setVerifyResult(result as typeof verifyResult);
      if (result.ok) toast.success("备份文件校验通过");
      else toast.error("校验失败", { description: result.reason });
    },
    onError: (error) => toast.error("校验失败", { description: error.message }),
  });

  const sync = trpc.admin.syncBuiltInContent.useMutation({
    onSuccess: async (result: unknown) => {
      toast.success("内置配置同步完成", { description: typeof result === "object" && result ? JSON.stringify(result).slice(0, 240) : undefined });
      await Promise.all([utils.admin.overview.invalidate(), utils.admin.listAuditLogs.invalidate()]);
    },
    onError: (error) => toast.error("同步失败", { description: error.message }),
  });

  function pickBackupFile() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        verifyUpload.mutate({ filename: file.name, base64: String(reader.result ?? "") });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  return (
    <GMShell
      title="备份与运维"
      eyebrow="快照创建 / 文件校验 / 恢复预演 / 配置同步 / 审计日志"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="border-[color:var(--gold-600)]/50 text-[color:var(--gold-300)]" onClick={() => sync.mutate({ force: false })} disabled={sync.isPending}>
            <RefreshCw size={13} className={cn("mr-1", sync.isPending && "animate-spin")} />
            同步内置配置
          </Button>
          <Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={() => setCreateDialog({ scope: "full", targetProfileId: "", note: "" })}>
            <HardDriveDownload size={13} className="mr-1" />
            创建备份
          </Button>
        </div>
      }
    >
      <Tabs defaultValue="backups">
        <TabsList className="border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/60">
          <TabsTrigger value="backups" className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">
            <Database size={12} className="mr-1" />
            备份与恢复
          </TabsTrigger>
          <TabsTrigger value="audit" className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">
            <History size={12} className="mr-1" />
            审计日志
          </TabsTrigger>
        </TabsList>

        <TabsContent value="backups">
          <Panel className="mb-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" className="h-8 border-[color:var(--aether-500)]/50 text-[0.68rem] text-[color:var(--aether-300)]" onClick={pickBackupFile} disabled={verifyUpload.isPending}>
                <Upload size={12} className="mr-1" />
                上传备份文件校验
              </Button>
              <span className="text-[0.66rem] text-[color:var(--parchment-muted)]">
                上传只做格式与版本校验，不会写入数据库；如需恢复请使用下方列表中的已入库备份。
              </span>
            </div>
            {verifyResult ? (
              <div className={cn("mt-2 rounded-sm border p-2 text-[0.66rem]", verifyResult.ok ? "border-[color:var(--verdant)]/50 text-[color:var(--verdant)]" : "border-[color:var(--blood)]/50 text-[color:var(--blood)]")}>
                校验结果：{verifyResult.ok ? "通过" : "失败"}
                {verifyResult.scope ? ` · 范围 ${verifyResult.scope}` : ""}
                {verifyResult.createdAt ? ` · 生成于 ${new Date(verifyResult.createdAt).toLocaleString("zh-CN")}` : ""}
                {verifyResult.reason ? ` · ${verifyResult.reason}` : ""}
                {verifyResult.summary ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(verifyResult.summary).map(([key, value]) => (
                      <span key={key} className="rounded-sm border border-[color:var(--ink-500)]/50 px-1.5 py-0.5 text-[0.6rem] text-[color:var(--parchment-dim)]">
                        {key}: {value}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </Panel>

          {backups.isLoading ? (
            <SkeletonState rows={4} />
          ) : backups.isError ? (
            <ErrorState message={backups.error?.message} onRetry={() => backups.refetch()} />
          ) : (backups.data ?? []).length === 0 ? (
            <EmptyState
              title="还没有备份"
              hint="建议在每次内容大改前创建 full 备份；恢复时会自动生成「恢复前快照」，避免误操作导致数据不可逆。"
              icon={<Database size={20} />}
              action={<Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={() => setCreateDialog({ scope: "full", targetProfileId: "", note: "" })}>创建首个备份</Button>}
            />
          ) : (
            <div className="space-y-2">
              {(backups.data as BackupRow[]).map((row) => (
                <Panel key={row.id} className="p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-[240px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-[color:var(--parchment)]">#{row.id} {row.backupKey}</span>
                        <Tag tone={row.scope === "full" ? "gold" : row.scope === "config" ? "aether" : "neutral"}>
                          {row.scope === "full" ? "全量" : row.scope === "config" ? "配置" : `档案 #${row.targetProfileId ?? "-"}`}
                        </Tag>
                        <Tag tone={row.status === "completed" ? "good" : "danger"}>{row.status}</Tag>
                        {row.restoredAt ? <Tag tone="gold">已于 {new Date(row.restoredAt).toLocaleString("zh-CN")} 恢复</Tag> : null}
                      </div>
                      <div className="mt-0.5 text-[0.64rem] text-[color:var(--parchment-muted)]">
                        {row.filename} · {formatBytes(row.sizeBytes)} · 校验和 {row.checksum} · 创建 {new Date(row.createdAt).toLocaleString("zh-CN")}
                      </div>
                      {row.note ? <div className="mt-0.5 text-[0.64rem] text-[color:var(--parchment-dim)]">备注：{row.note}</div> : null}
                      {row.recordCounts ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(row.recordCounts).slice(0, 10).map(([key, value]) => (
                            <span key={key} className="rounded-sm border border-[color:var(--ink-500)]/50 px-1.5 py-0.5 text-[0.6rem] text-[color:var(--parchment-muted)]">
                              {key}: {value}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-[color:var(--aether-500)]/50 text-[0.66rem] text-[color:var(--aether-300)]"
                        onClick={() => { setRestoreResult(null); restoreBackup.mutate({ backupId: row.id, dryRun: true }); }}
                        disabled={restoreBackup.isPending}
                      >
                        恢复预演
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 border-[color:var(--gold-600)]/50 text-[0.66rem] text-[color:var(--gold-300)]" onClick={() => { setRestoreResult(null); setRestoreDialog({ backup: row }); }}>
                        <RotateCcw size={11} className="mr-1" />
                        恢复
                      </Button>
                    </div>
                  </div>
                </Panel>
              ))}
            </div>
          )}

          {restoreResult ? (
            <Panel className={cn("mt-3 p-3", restoreResult.ok ? "border-[color:var(--verdant)]/40" : "border-[color:var(--blood)]/40")}>
              <div className="text-caption mb-1">最近一次恢复操作</div>
              <p className={cn("text-xs", restoreResult.ok ? "text-[color:var(--verdant)]" : "text-[color:var(--blood)]")}>
                {restoreResult.ok ? (restoreResult.dryRun ? "预演通过，未修改任何数据" : "恢复完成（恢复前已自动生成快照）") : `失败：${restoreResult.reason ?? ""} ${restoreResult.message ?? ""}`}
              </p>
              {restoreResult.summary ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(restoreResult.summary).map(([key, value]) => (
                    <span key={key} className="rounded-sm border border-[color:var(--ink-500)]/50 px-1.5 py-0.5 text-[0.6rem] text-[color:var(--parchment-dim)]">
                      将恢复 {key}: {value}
                    </span>
                  ))}
                </div>
              ) : null}
              {restoreResult.restored ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {Object.entries(restoreResult.restored).map(([key, value]) => (
                    <span key={key} className="rounded-sm border border-[color:var(--verdant)]/40 px-1.5 py-0.5 text-[0.6rem] text-[color:var(--verdant)]">
                      已恢复 {key}: {value}
                    </span>
                  ))}
                </div>
              ) : null}
            </Panel>
          ) : null}

          <Panel className="mt-3 p-3">
            <SectionTitle eyebrow="Backup Policy" title="备份策略建议" />
            <GoldRule />
            <ul className="space-y-1 text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">
              <li>· 每次大批量修改角色库或卡池前，执行一次 <code>config</code> 备份。</li>
              <li>· 版本发布或数据库迁移前，执行一次 <code>full</code> 备份，并记录校验和。</li>
              <li>· 恢复操作会先自动生成「恢复前快照」，因此恢复本身可回退。</li>
              <li>· 备份文件存放在对象存储，数据库仅保存元数据与校验和；恢复时按业务键 upsert，不删除玩家已有数据。</li>
            </ul>
          </Panel>
        </TabsContent>

        <TabsContent value="audit">
          <Panel>
            <SectionTitle eyebrow="Audit Trail" title="后台操作审计（最近 100 条）" />
            <GoldRule />
            {audit.isLoading ? (
              <SkeletonState rows={4} />
            ) : (audit.data ?? []).length === 0 ? (
              <EmptyState title="暂无审计记录" hint="后台的任何保存、发布、恢复、Token 操作都会记录在此。" />
            ) : (
              <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
                {(audit.data ?? []).map((log) => (
                  <div key={log.id} className="rounded-sm border border-[color:var(--ink-500)]/40 bg-[color:var(--ink-800)]/40 p-2 text-[0.66rem]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag tone={log.result === "ok" ? "good" : "danger"}>{log.result ?? "ok"}</Tag>
                      <span className="text-[color:var(--gold-300)]">{log.action}</span>
                      <span className="text-[color:var(--parchment-dim)]">{log.targetType}{log.targetKey ? ` / ${log.targetKey}` : ""}</span>
                      <span className="text-[color:var(--parchment-muted)]">{log.adminName ?? `admin#${log.adminUserId}`}</span>
                      <span className="ml-auto text-[color:var(--parchment-muted)]">{new Date(log.createdAt).toLocaleString("zh-CN")}</span>
                    </div>
                    {log.payload && Object.keys(log.payload).length > 0 ? (
                      <pre className="mt-1 max-h-24 overflow-auto rounded-sm border border-[color:var(--ink-500)]/40 bg-[color:var(--ink-950)]/60 p-1.5 text-[0.58rem] text-[color:var(--parchment-muted)]">
                        {JSON.stringify(log.payload)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </TabsContent>
      </Tabs>

      {/* 创建备份 */}
      <Dialog open={Boolean(createDialog)} onOpenChange={(open) => { if (!open) setCreateDialog(null); }}>
        <DialogContent className="border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">创建备份</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">
              全量备份包含配置表与指定玩家档案；配置备份仅包含角色、技能、装备、地图、卡池等策划内容。
            </DialogDescription>
          </DialogHeader>
          {createDialog ? (
            <div className="space-y-3">
              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">备份范围</Label>
                <Select value={createDialog.scope} onValueChange={(value) => setCreateDialog({ ...createDialog, scope: value as "full" })}>
                  <SelectTrigger className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                    <SelectItem value="full">全量（配置 + 指定档案）</SelectItem>
                    <SelectItem value="config">仅策划配置</SelectItem>
                    <SelectItem value="profile">仅单个玩家档案</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {createDialog.scope !== "config" ? (
                <div>
                  <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">目标档案 ID（可选）</Label>
                  <Input
                    type="number"
                    value={createDialog.targetProfileId}
                    onChange={(event) => setCreateDialog({ ...createDialog, targetProfileId: event.target.value })}
                    placeholder="留空表示只备份配置"
                    className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]"
                  />
                  {profiles.data && profiles.data.length > 0 ? (
                    <p className="mt-1 text-[0.62rem] text-[color:var(--parchment-muted)]">
                      可用档案：{profiles.data.slice(0, 8).map((profile) => `#${profile.id}(${profile.lordName})`).join("、")}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">备注</Label>
                <Input value={createDialog.note} onChange={(event) => setCreateDialog({ ...createDialog, note: event.target.value })} placeholder="例如：V1.1 上线前快照" className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setCreateDialog(null)}>取消</Button>
            <Button
              className="btn-gold border-transparent text-[color:var(--ink-950)]"
              disabled={createBackup.isPending || !createDialog}
              onClick={() => {
                if (!createDialog) return;
                const targetProfileId = createDialog.targetProfileId ? Number(createDialog.targetProfileId) : null;
                if (createDialog.scope === "profile" && !targetProfileId) {
                  toast.error("请填写目标档案 ID");
                  return;
                }
                createBackup.mutate({ scope: createDialog.scope, targetProfileId, note: createDialog.note || undefined });
              }}
            >
              <Download size={13} className="mr-1" />
              {createBackup.isPending ? "备份中…" : "开始备份"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 恢复确认 */}
      <Dialog open={Boolean(restoreDialog)} onOpenChange={(open) => { if (!open) setRestoreDialog(null); }}>
        <DialogContent className="border-[color:var(--blood)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">确认恢复备份 #{restoreDialog?.backup.id}</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">
              恢复将按业务键 upsert 覆盖配置与档案数据；系统会先自动创建「恢复前快照」，可用于回退。
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-sm border border-[color:var(--blood)]/40 bg-[color:var(--ink-800)]/60 p-2 text-[0.68rem] text-[color:var(--parchment-dim)]">
            <p className="flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[color:var(--ember-400)]" />
              <span>
                备份文件：{restoreDialog?.backup.filename}
                <br />
                范围：{restoreDialog?.backup.scope === "full" ? "全量" : restoreDialog?.backup.scope === "config" ? "策划配置" : `档案 #${restoreDialog?.backup.targetProfileId}`}
                <br />
                校验和：{restoreDialog?.backup.checksum}
              </span>
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setRestoreDialog(null)}>取消</Button>
            <Button
              className="border-transparent bg-[color:var(--blood)] text-[color:var(--parchment)] hover:bg-[color:var(--blood)]/85"
              disabled={restoreBackup.isPending || !restoreDialog}
              onClick={() => {
                if (!restoreDialog) return;
                restoreBackup.mutate({ backupId: restoreDialog.backup.id });
                setRestoreDialog(null);
              }}
            >
              <RotateCcw size={13} className="mr-1" />
              {restoreBackup.isPending ? "恢复中…" : "确认恢复"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </GMShell>
  );
}
