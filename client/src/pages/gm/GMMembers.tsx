/** GM 会员管理：角色（user/admin）、会员等级与封禁。 */
import { useState } from "react";
import { toast } from "sonner";
import { Ban, PackageOpen, Search, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { GMShell } from "@/components/game/GMShell";
import { EmptyState, ErrorState, GoldRule, Panel, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";

type Member = {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  membership: string;
  membershipExpiresAt: Date | string | null;
  banned: boolean;
  createdAt: Date | string;
  lastSignedIn: Date | string;
  profile: { id: number; lordName: string; keepName: string; chapter: number; keepLevel: number; renown: number; createdAt: Date | string } | null;
};

type PlayerProfile = {
  id: number;
  userId: number;
  lordName: string;
  keepName: string;
  chapter: number;
  keepLevel: number;
  renown: number;
  gold: number;
  food: number;
  wood: number;
  iron: number;
  aether: number;
  stamina: number;
  staminaMax: number;
  characterCount: number;
};

export default function GMMembers() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const members = trpc.admin.listMembers.useQuery({ search: search || undefined, page, pageSize: 20 });
  const profiles = trpc.admin.listPlayerProfiles.useQuery();
  const [resourceDialog, setResourceDialog] = useState<null | PlayerProfile>(null);
  const [deleteTarget, setDeleteTarget] = useState<null | { id: number; name: string }>(null);
  const [resourceForm, setResourceForm] = useState({ gold: 0, food: 0, wood: 0, iron: 0, aether: 0, renown: 0, stamina: 0, reason: "" });

  const updateMember = trpc.admin.updateMember.useMutation({
    onSuccess: async () => {
      toast.success("会员信息已更新");
      await utils.admin.listMembers.invalidate();
    },
    onError: (error) => toast.error("更新失败", { description: error.message }),
  });

  const setResources = trpc.admin.setResources.useMutation({
    onSuccess: async () => {
      toast.success("玩家资源已更新");
      setResourceDialog(null);
      await utils.admin.listPlayerProfiles.invalidate();
    },
    onError: (error) => toast.error("资源更新失败", { description: error.message }),
  });

  const deleteMember = trpc.admin.deleteMember.useMutation({
    onSuccess: async (result) => {
      setDeleteTarget(null);
      toast.success("账号已永久删除", { description: `${result.deletedName} 的 ${result.deletedProfileCount} 份游戏档案已一并清除。` });
      await Promise.all([utils.admin.listMembers.invalidate(), utils.admin.listPlayerProfiles.invalidate()]);
    },
    onError: (error) => toast.error("删除账号失败", { description: error.message }),
  });

  const openResourceEditor = (profile: PlayerProfile) => {
    setResourceDialog(profile);
    setResourceForm({ gold: profile.gold, food: profile.food, wood: profile.wood, iron: profile.iron, aether: profile.aether, renown: profile.renown, stamina: profile.stamina, reason: "GM 调整" });
  };

  return (
    <GMShell title="会员管理" eyebrow="会员等级 / 封禁 / 管理员权限">
      {members.data ? (
            <div className="mb-3 grid gap-2 sm:grid-cols-5">
              {[
                { label: "会员总数", value: members.data.stats.total },
                { label: "管理员", value: members.data.stats.admins },
                { label: "订阅会员", value: members.data.stats.supporters },
                { label: "已封禁", value: members.data.stats.banned },
                { label: "已建档案", value: members.data.stats.linkedProfiles },
              ].map((stat) => (
                <Panel key={stat.label} className="p-2.5 text-center">
                  <div className="text-caption">{stat.label}</div>
                  <div className="text-display text-lg text-[color:var(--parchment)]">{stat.value}</div>
                </Panel>
              ))}
            </div>
          ) : null}

          <Panel className="mb-3 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[color:var(--parchment-muted)]" />
                <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="搜索昵称 / 邮箱 / openId" className="h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 pl-7 text-xs text-[color:var(--parchment)]" />
              </div>
              <Button size="sm" variant="outline" className="h-8 border-[color:var(--ink-500)]/70 text-[0.68rem] text-[color:var(--parchment-dim)]" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
                上一页
              </Button>
              <span className="text-[0.68rem] text-[color:var(--parchment-muted)]">
                第 {members.data?.page ?? 1} 页 / 共 {members.data ? Math.max(1, Math.ceil(members.data.total / members.data.pageSize)) : 1} 页
              </span>
              <Button size="sm" variant="outline" className="h-8 border-[color:var(--ink-500)]/70 text-[0.68rem] text-[color:var(--parchment-dim)]" onClick={() => setPage((value) => value + 1)} disabled={!members.data || page >= Math.ceil(members.data.total / members.data.pageSize)}>
                下一页
              </Button>
            </div>
          </Panel>

          {members.isLoading ? (
            <SkeletonState rows={5} />
          ) : members.isError ? (
            <ErrorState message={members.error?.message} onRetry={() => members.refetch()} />
          ) : (members.data?.members ?? []).length === 0 ? (
            <EmptyState title="没有匹配的会员" hint="玩家首次登录并进入游戏后，会自动创建档案并出现在这里。" />
          ) : (
            <div className="space-y-2">
              {(members.data?.members as Member[]).map((member) => (
                <Panel key={member.id} className="p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-[220px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-[color:var(--parchment)]">{member.name ?? "未命名"}</span>
                        <Tag tone={member.role === "admin" ? "gold" : "neutral"}>
                          {member.role === "admin" ? <><ShieldCheck size={10} className="mr-1 inline" />管理员</> : "普通会员"}
                        </Tag>
                        <Tag tone={member.membership === "supporter" ? "aether" : "neutral"}>{member.membership === "supporter" ? "订阅" : "免费"}</Tag>
                        {member.banned ? <Tag tone="danger">已封禁</Tag> : null}
                      </div>
                      <div className="mt-0.5 text-[0.64rem] text-[color:var(--parchment-muted)]">
                        #{member.id} · {member.email ?? "无邮箱"} · 注册 {new Date(member.createdAt).toLocaleDateString("zh-CN")} · 最近登录 {new Date(member.lastSignedIn).toLocaleString("zh-CN")}
                      </div>
                      {member.profile ? (
                        <div className="mt-0.5 text-[0.64rem] text-[color:var(--parchment-muted)]">
                          档案 #{member.profile.id} · 领主 {member.profile.lordName} · {member.profile.keepName} · 第 {member.profile.chapter} 章 · 城堡 Lv.{member.profile.keepLevel} · 声望 {member.profile.renown}
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[0.64rem] text-[color:var(--parchment-muted)]">尚未创建游戏档案</div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-[color:var(--ink-500)]/70 text-[0.66rem] text-[color:var(--parchment-dim)]"
                        onClick={() => updateMember.mutate({ userId: member.id, role: member.role === "admin" ? "user" : "admin" })}
                        disabled={updateMember.isPending}
                      >
                        {member.role === "admin" ? "降为普通" : "设为管理员"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-[color:var(--aether-500)]/50 text-[0.66rem] text-[color:var(--aether-300)]"
                        onClick={() => updateMember.mutate({ userId: member.id, membership: member.membership === "supporter" ? "free" : "supporter", membershipMonths: 1 })}
                        disabled={updateMember.isPending}
                      >
                        {member.membership === "supporter" ? "取消订阅" : "授予订阅 1 月"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn("h-7 text-[0.66rem]", member.banned ? "border-[color:var(--verdant)]/50 text-[color:var(--verdant)]" : "border-[color:var(--blood)]/50 text-[color:var(--blood)]")}
                        onClick={() => updateMember.mutate({ userId: member.id, banned: !member.banned })}
                        disabled={updateMember.isPending}
                      >
                        <Ban size={11} className="mr-1" />
                        {member.banned ? "解除封禁" : "封禁"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 border-[color:var(--blood)]/60 text-[0.66rem] text-[color:var(--blood)] hover:bg-[color:var(--blood)]/10"
                        onClick={() => setDeleteTarget({ id: member.id, name: member.name ?? `账号 #${member.id}` })}
                        disabled={deleteMember.isPending}
                      >
                        <Trash2 size={11} className="mr-1" />
                        删除账号
                      </Button>
                    </div>
                  </div>
                </Panel>
              ))}
            </div>
          )}

          <Panel className="mt-4">
            <SectionTitle eyebrow="Player Profiles" title="游戏档案（最近 100）" action={<span className="text-[0.64rem] text-[color:var(--parchment-muted)]">GM 可编辑货币、资源与体力</span>} />
            <GoldRule />
            {profiles.isLoading ? (
              <SkeletonState rows={3} />
            ) : (profiles.data ?? []).length === 0 ? (
              <EmptyState title="暂无游戏档案" />
            ) : (
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-left text-[0.66rem]">
                  <thead className="text-[color:var(--parchment-muted)]">
                    <tr>
                      <th className="py-1 pr-2">档案</th>
                      <th className="py-1 pr-2">领主</th>
                      <th className="py-1 pr-2">城堡</th>
                      <th className="py-1 pr-2">章节</th>
                      <th className="py-1 pr-2">城堡等级</th>
                      <th className="py-1 pr-2">角色数</th>
                        <th className="py-1 pr-2">金币</th>
                        <th className="py-1 pr-2">粮食/木材/铁矿</th>
                        <th className="py-1 pr-2">星辉</th>
                        <th className="py-1 pr-2">体力</th>
                        <th className="py-1">操作</th>
                    </tr>
                  </thead>
                  <tbody className="text-[color:var(--parchment-dim)]">
                    {(profiles.data ?? []).map((profile) => (
                      <tr key={profile.id} className="border-t border-[color:var(--ink-500)]/30">
                        <td className="py-1 pr-2">#{profile.id}</td>
                        <td className="py-1 pr-2">{profile.lordName}</td>
                        <td className="py-1 pr-2">{profile.keepName}</td>
                        <td className="py-1 pr-2">{profile.chapter}</td>
                        <td className="py-1 pr-2">{profile.keepLevel}</td>
                        <td className="py-1 pr-2 text-numeric">{profile.characterCount}</td>
                        <td className="py-1 pr-2 text-numeric">{profile.gold}</td>
                        <td className="py-1 pr-2 text-numeric">{profile.food}/{profile.wood}/{profile.iron}</td>
                        <td className="py-1 pr-2 text-numeric">{profile.aether}</td>
                        <td className="py-1 pr-2 text-numeric">{profile.stamina}/{profile.staminaMax}</td>
                        <td className="py-1">
                          <Button size="sm" variant="outline" className="h-7 border-[color:var(--gold-600)]/50 text-[0.64rem] text-[color:var(--gold-300)]" onClick={() => openResourceEditor(profile as PlayerProfile)}>
                            <PackageOpen size={11} className="mr-1" /> 编辑资源
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="border-[color:var(--blood)]/60 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">永久删除账号</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">
              将永久删除「{deleteTarget?.name ?? "该账号"}」及其角色、资源、战斗、招募与议事记录。此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button
              variant="destructive"
              disabled={!deleteTarget || deleteMember.isPending}
              onClick={() => deleteTarget && deleteMember.mutate({ userId: deleteTarget.id })}
            >
              <Trash2 size={13} className="mr-1" />
              {deleteMember.isPending ? "删除中…" : "永久删除"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* GM 资源编辑：绝对值写入，服务端校验并记录 before/after 审计 */}
      <Dialog open={Boolean(resourceDialog)} onOpenChange={(open) => { if (!open) setResourceDialog(null); }}>
        <DialogContent className="border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">编辑玩家货币与资源</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">
              {resourceDialog ? `档案 #${resourceDialog.id} · ${resourceDialog.lordName} · ${resourceDialog.keepName}` : ""}。这是绝对值设置，不是增减；修改会写入 GM 审计日志。
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {([
              ["gold", "金币"], ["food", "粮食"], ["wood", "木材"], ["iron", "铁矿"],
              ["aether", "星辉"], ["renown", "声望"], ["stamina", "体力"],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">{label}</Label>
                <Input type="number" min={0} value={resourceForm[key]} onChange={(event) => setResourceForm({ ...resourceForm, [key]: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
              </div>
            ))}
            <div className="col-span-2">
              <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">调整原因（必填建议）</Label>
              <Input value={resourceForm.reason} onChange={(event) => setResourceForm({ ...resourceForm, reason: event.target.value })} placeholder="例如：活动补偿 / 测试修正" className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setResourceDialog(null)}>取消</Button>
            <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" disabled={setResources.isPending || !resourceDialog} onClick={() => resourceDialog && setResources.mutate({ profileId: resourceDialog.id, ...resourceForm })}>保存资源</Button>
          </div>
        </DialogContent>
      </Dialog>
    </GMShell>
  );
}
