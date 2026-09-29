/** GM 会员与角色管理：账号、档案、已拥有角色与全局角色资料集中维护。 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Ban, Clock3, Mail, PackageOpen, Search, ShieldCheck, Trash2, UserRoundCog } from "lucide-react";
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
import { CharacterLibrary } from "./GMCharacters";

type Member = {
  id: number;
  name: string | null;
  email: string | null;
  role: "user" | "admin";
  membership: "free" | "supporter";
  membershipExpiresAt: Date | string | null;
  banned: boolean;
  createdAt: Date | string;
  lastSignedIn: Date | string;
  onlineSeconds: number;
  lastActiveAt: Date | string | null;
  online: boolean;
  profile: {
    id: number;
    lordName: string;
    keepName: string;
    chapter: number;
    keepLevel: number;
    renown: number;
    createdAt: Date | string;
    characterCount: number;
  } | null;
};

type OwnedCharacter = {
  id: number;
  charKey: string;
  name: string;
  title: string;
  avatarUrl: string | null;
  rarity: string;
  job: string;
  level: number;
  exp: number;
  ascension: number;
  bondLevel: number;
  bondExp: number;
  affection: number;
  locked: boolean;
  isNew: boolean;
  obtainedAt: Date | string;
  updatedAt: Date | string;
};

const sortLabels = {
  createdAt: "注册日期",
  lastSignedIn: "最后登录",
  onlineSeconds: "累计在线时长",
} as const;

function formatOnlineDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${minutes} 分钟`;
}

export default function GMMembers() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<keyof typeof sortLabels>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [memberDialog, setMemberDialog] = useState<Member | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<null | { id: number; name: string }>(null);
  const [characterDialog, setCharacterDialog] = useState<OwnedCharacter | null>(null);
  const [resourceForm, setResourceForm] = useState({ gold: 0, food: 0, wood: 0, iron: 0, aether: 0, renown: 0, stamina: 0, reason: "GM 调整" });
  const [mailForm, setMailForm] = useState({ subject: "", content: "", rewards: { gold: 0, food: 0, wood: 0, iron: 0, aether: 0, renown: 0, stamina: 0, recruitShards: 0 } });
  const [characterForm, setCharacterForm] = useState({ level: 1, exp: 0, ascension: 0, bondLevel: 1, bondExp: 0, affection: 0, locked: false, isNew: false });

  const members = trpc.admin.listMembers.useQuery({ search: search || undefined, page, pageSize: 20, sortBy, sortDirection });
  const memberGameData = trpc.admin.getMemberGameData.useQuery({ userId: memberDialog?.id ?? 0 }, { enabled: Boolean(memberDialog) });
  const activeProfile = memberGameData.data?.profile ?? null;
  const ownedCharacters = memberGameData.data?.characters ?? [];

  useEffect(() => {
    const profile = memberGameData.data?.profile;
    if (!profile) return;
    setResourceForm({
      gold: profile.gold,
      food: profile.food,
      wood: profile.wood,
      iron: profile.iron,
      aether: profile.aether,
      renown: profile.renown,
      stamina: profile.stamina,
      reason: "GM 调整",
    });
  }, [memberGameData.data?.profile]);

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
      await utils.admin.getMemberGameData.invalidate();
    },
    onError: (error) => toast.error("资源更新失败", { description: error.message }),
  });

  const updateMemberCharacter = trpc.admin.updateMemberCharacter.useMutation({
    onSuccess: async () => {
      toast.success("角色成长数据已更新");
      setCharacterDialog(null);
      await utils.admin.getMemberGameData.invalidate();
    },
    onError: (error) => toast.error("角色更新失败", { description: error.message }),
  });

  const sendMail = trpc.admin.sendMail.useMutation({
    onSuccess: () => {
      toast.success("信函已投递到领主邮箱");
      setMailForm({ subject: "", content: "", rewards: { gold: 0, food: 0, wood: 0, iron: 0, aether: 0, renown: 0, stamina: 0, recruitShards: 0 } });
    },
    onError: (error) => toast.error("投递失败", { description: error.message }),
  });

  const deleteMember = trpc.admin.deleteMember.useMutation({
    onSuccess: async (result) => {
      if (memberDialog?.id === deleteTarget?.id) setMemberDialog(null);
      setDeleteTarget(null);
      toast.success("账号已永久删除", { description: `${result.deletedName} 的 ${result.deletedProfileCount} 份游戏档案已一并清除。` });
      await Promise.all([utils.admin.listMembers.invalidate(), utils.admin.getMemberGameData.invalidate()]);
    },
    onError: (error) => toast.error("删除账号失败", { description: error.message }),
  });

  const openCharacterEditor = (character: OwnedCharacter) => {
    setCharacterDialog(character);
    setCharacterForm({
      level: character.level,
      exp: character.exp,
      ascension: character.ascension,
      bondLevel: character.bondLevel,
      bondExp: character.bondExp,
      affection: character.affection,
      locked: character.locked,
      isNew: character.isNew,
    });
  };

  const changeSort = (value: keyof typeof sortLabels) => {
    setSortBy(value);
    setPage(1);
  };

  return (
    <GMShell title="会员与角色管理" eyebrow="会员 / 档案 / 已拥有角色 / 全局角色资料">
      <Tabs defaultValue="members">
        <TabsList className="mb-2 flex border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/60">
          <TabsTrigger value="members" className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">
            <UserRoundCog size={13} className="mr-1" />会员与档案
          </TabsTrigger>
          <TabsTrigger value="library" className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">
            <PackageOpen size={13} className="mr-1" />角色资料库
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members">
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
              <Select value={sortBy} onValueChange={(value) => changeSort(value as keyof typeof sortLabels)}>
                <SelectTrigger className="h-8 w-[145px] border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]">
                  {Object.entries(sortLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="h-8 border-[color:var(--ink-500)]/70 text-[0.68rem] text-[color:var(--parchment-dim)]" onClick={() => { setSortDirection((value) => value === "desc" ? "asc" : "desc"); setPage(1); }}>
                {sortDirection === "desc" ? <ArrowDown size={13} className="mr-1" /> : <ArrowUp size={13} className="mr-1" />}
                {sortDirection === "desc" ? "降序" : "升序"}
              </Button>
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
                    <div className="min-w-[240px] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-[color:var(--parchment)]">{member.name ?? "未命名"}</span>
                        <Tag tone={member.role === "admin" ? "gold" : "neutral"}>
                          {member.role === "admin" ? <><ShieldCheck size={10} className="mr-1 inline" />管理员</> : "普通会员"}
                        </Tag>
                        <Tag tone={member.membership === "supporter" ? "aether" : "neutral"}>{member.membership === "supporter" ? "订阅" : "免费"}</Tag>
                        {member.online ? <Tag tone="good">在线</Tag> : null}
                        {member.banned ? <Tag tone="danger">已封禁</Tag> : null}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.64rem] text-[color:var(--parchment-muted)]">
                        <span>#{member.id} · {member.email ?? "无邮箱"}</span>
                        <span>注册 {new Date(member.createdAt).toLocaleString("zh-CN")}</span>
                        <span>最后登录 {new Date(member.lastSignedIn).toLocaleString("zh-CN")}</span>
                        <span className="inline-flex items-center"><Clock3 size={10} className="mr-1" />在线时长 {formatOnlineDuration(member.onlineSeconds)}</span>
                      </div>
                      {member.profile ? (
                        <div className="mt-1 text-[0.64rem] text-[color:var(--parchment-muted)]">
                          档案 #{member.profile.id} · 领主 {member.profile.lordName} · {member.profile.keepName} · 第 {member.profile.chapter} 章 · 城堡 Lv.{member.profile.keepLevel} · 声望 {member.profile.renown} · 角色 {member.profile.characterCount}
                        </div>
                      ) : (
                        <div className="mt-1 text-[0.64rem] text-[color:var(--parchment-muted)]">尚未创建游戏档案</div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 border-[color:var(--gold-600)]/50 text-[0.66rem] text-[color:var(--gold-300)]" onClick={() => setMemberDialog(member)} disabled={!member.profile}>
                        <PackageOpen size={11} className="mr-1" />管理档案与角色
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 border-[color:var(--ink-500)]/70 text-[0.66rem] text-[color:var(--parchment-dim)]" onClick={() => updateMember.mutate({ userId: member.id, role: member.role === "admin" ? "user" : "admin" })} disabled={updateMember.isPending}>
                        {member.role === "admin" ? "降为普通" : "设为管理员"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 border-[color:var(--aether-500)]/50 text-[0.66rem] text-[color:var(--aether-300)]" onClick={() => updateMember.mutate({ userId: member.id, membership: member.membership === "supporter" ? "free" : "supporter", membershipMonths: 1 })} disabled={updateMember.isPending}>
                        {member.membership === "supporter" ? "取消订阅" : "授予订阅 1 月"}
                      </Button>
                      <Button size="sm" variant="outline" className={cn("h-7 text-[0.66rem]", member.banned ? "border-[color:var(--verdant)]/50 text-[color:var(--verdant)]" : "border-[color:var(--blood)]/50 text-[color:var(--blood)]")} onClick={() => updateMember.mutate({ userId: member.id, banned: !member.banned })} disabled={updateMember.isPending}>
                        <Ban size={11} className="mr-1" />{member.banned ? "解除封禁" : "封禁"}
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 border-[color:var(--blood)]/60 text-[0.66rem] text-[color:var(--blood)] hover:bg-[color:var(--blood)]/10" onClick={() => setDeleteTarget({ id: member.id, name: member.name ?? `账号 #${member.id}` })} disabled={deleteMember.isPending}>
                        <Trash2 size={11} className="mr-1" />删除账号
                      </Button>
                    </div>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="library">
          <CharacterLibrary />
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(memberDialog)} onOpenChange={(open) => { if (!open) setMemberDialog(null); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">管理档案与角色</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">
              {memberDialog ? `${memberDialog.name ?? `账号 #${memberDialog.id}`} 的游戏档案。资源与角色成长修正均写入 GM 审计日志。` : ""}
            </DialogDescription>
          </DialogHeader>
          {memberGameData.isLoading ? (
            <SkeletonState rows={5} />
          ) : memberGameData.isError ? (
            <ErrorState message={memberGameData.error?.message} onRetry={() => memberGameData.refetch()} />
          ) : activeProfile ? (
            <div className="space-y-4">
              <div className="rounded-sm border border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/50 p-3 text-[0.7rem] text-[color:var(--parchment-dim)]">
                档案 #{activeProfile.id} · 领主 {activeProfile.lordName} · {activeProfile.keepName} · 第 {activeProfile.chapter} 章 · 城堡 Lv.{activeProfile.keepLevel}
              </div>

              <section>
                <SectionTitle eyebrow="Resources" title="资源与进度" action={<span className="text-[0.64rem] text-[color:var(--parchment-muted)]">绝对值设置</span>} />
                <GoldRule />
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {([
                    ["gold", "金币"], ["food", "粮食"], ["wood", "木材"], ["iron", "铁矿"],
                    ["aether", "星辉"], ["renown", "声望"], ["stamina", `体力 / ${activeProfile.staminaMax}`],
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">{label}</Label>
                      <Input type="number" min={0} value={resourceForm[key]} onChange={(event) => setResourceForm({ ...resourceForm, [key]: Math.max(0, Number(event.target.value) || 0) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                    </div>
                  ))}
                  <div className="col-span-2 sm:col-span-4">
                    <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">调整原因</Label>
                    <Input value={resourceForm.reason} onChange={(event) => setResourceForm({ ...resourceForm, reason: event.target.value })} placeholder="例如：活动补偿 / 测试修正" className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" disabled={setResources.isPending} onClick={() => setResources.mutate({ profileId: activeProfile.id, ...resourceForm })}>
                    {setResources.isPending ? "保存中…" : "保存资源"}
                  </Button>
                </div>
              </section>

              <section>
                <SectionTitle eyebrow="Lord's Mail" title="投递领主信函" action={<Mail size={15} className="text-[color:var(--gold-400)]" />} />
                <GoldRule />
                <p className="text-[0.68rem] text-[color:var(--parchment-muted)]">纯通知可不附资源；附带资源会由领主在邮箱中主动领取。</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">标题</Label>
                    <Input value={mailForm.subject} onChange={(event) => setMailForm({ ...mailForm, subject: event.target.value })} placeholder="例如：边境补给已抵达" className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                  </div>
                  <div className="sm:row-span-2">
                    <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">正文</Label>
                    <textarea value={mailForm.content} onChange={(event) => setMailForm({ ...mailForm, content: event.target.value })} placeholder="向领主说明这封信函的来由…" className="mt-1 min-h-20 w-full resize-y rounded-sm border border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 p-2 text-xs text-[color:var(--parchment)] outline-none placeholder:text-[color:var(--parchment-muted)] focus:border-[color:var(--gold-600)]/70" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["gold", "金币"], ["food", "粮食"], ["wood", "木材"], ["iron", "铁矿"],
                      ["aether", "星辉"], ["renown", "声望"], ["stamina", "体力"], ["recruitShards", "星辉信物"],
                    ] as const).map(([key, label]) => (
                      <div key={key}>
                        <Label className="text-[0.62rem] text-[color:var(--parchment-muted)]">{label}</Label>
                        <Input type="number" min={0} value={mailForm.rewards[key]} onChange={(event) => setMailForm({ ...mailForm, rewards: { ...mailForm.rewards, [key]: Math.max(0, Number(event.target.value) || 0) } })} className="mt-1 h-7 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" disabled={sendMail.isPending || !mailForm.subject.trim() || !mailForm.content.trim()} onClick={() => sendMail.mutate({ profileId: activeProfile.id, subject: mailForm.subject, content: mailForm.content, rewards: mailForm.rewards })}>
                    <Mail size={13} className="mr-1" />{sendMail.isPending ? "投递中…" : "投递信函"}
                  </Button>
                </div>
              </section>

              <section>
                <SectionTitle eyebrow="Owned characters" title={`已拥有角色（${ownedCharacters.length}）`} />
                <GoldRule />
                {ownedCharacters.length === 0 ? (
                  <EmptyState title="该档案尚未拥有角色" />
                ) : (
                  <div className="mt-3 space-y-2">
                    {(ownedCharacters as OwnedCharacter[]).map((character) => (
                      <div key={character.id} className="flex flex-wrap items-center gap-3 rounded-sm border border-[color:var(--ink-500)]/45 bg-[color:var(--ink-800)]/40 p-2.5">
                        {character.avatarUrl ? <img src={character.avatarUrl} alt="" className="h-9 w-9 rounded-sm object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : <span className="grid h-9 w-9 place-items-center rounded-sm border border-[color:var(--ink-500)]/50 text-[0.68rem] text-[color:var(--gold-300)]">{character.rarity}</span>}
                        <div className="min-w-[160px] flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-sm text-[color:var(--parchment)]"><span>{character.name}</span><Tag tone="gold">{character.rarity}</Tag>{character.locked ? <Tag tone="danger">锁定</Tag> : null}</div>
                          <div className="mt-0.5 text-[0.64rem] text-[color:var(--parchment-muted)]">Lv.{character.level} · 突破 {character.ascension} · 羁绊 {character.bondLevel} · 好感 {character.affection} · {character.charKey}</div>
                        </div>
                        <Button size="sm" variant="outline" className="h-7 border-[color:var(--gold-600)]/50 text-[0.66rem] text-[color:var(--gold-300)]" onClick={() => openCharacterEditor(character)}>
                          编辑成长
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <EmptyState title="该会员尚未创建游戏档案" />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(characterDialog)} onOpenChange={(open) => { if (!open) setCharacterDialog(null); }}>
        <DialogContent className="border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">编辑角色成长</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">{characterDialog ? `${characterDialog.name} · ${characterDialog.charKey}` : ""}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {([
              ["level", "等级", 1, 100], ["exp", "经验", 0, 2_000_000_000], ["ascension", "突破", 0, 10], ["bondLevel", "羁绊等级", 1, 20],
              ["bondExp", "羁绊经验", 0, 2_000_000_000], ["affection", "好感", -100, 100],
            ] as const).map(([key, label, min, max]) => (
              <div key={key}>
                <Label className="text-[0.68rem] text-[color:var(--parchment-muted)]">{label}</Label>
                <Input type="number" min={min} max={max} value={characterForm[key]} onChange={(event) => setCharacterForm({ ...characterForm, [key]: Math.min(max, Math.max(min, Number(event.target.value) || 0)) })} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)]/70 text-xs text-[color:var(--parchment)]" />
              </div>
            ))}
            <div className="col-span-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className={cn("h-8", characterForm.locked ? "border-[color:var(--blood)]/60 text-[color:var(--blood)]" : "border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]")} onClick={() => setCharacterForm({ ...characterForm, locked: !characterForm.locked })}>{characterForm.locked ? "已锁定" : "未锁定"}</Button>
              <Button size="sm" variant="outline" className={cn("h-8", characterForm.isNew ? "border-[color:var(--aether-500)]/60 text-[color:var(--aether-300)]" : "border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]")} onClick={() => setCharacterForm({ ...characterForm, isNew: !characterForm.isNew })}>{characterForm.isNew ? "显示为新角色" : "不显示新角色"}</Button>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setCharacterDialog(null)}>取消</Button>
            <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" disabled={!characterDialog || updateMemberCharacter.isPending} onClick={() => characterDialog && updateMemberCharacter.mutate({ playerCharacterId: characterDialog.id, ...characterForm })}>
              {updateMemberCharacter.isPending ? "保存中…" : "保存角色"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="border-[color:var(--blood)]/60 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">永久删除账号</DialogTitle>
            <DialogDescription className="text-[color:var(--parchment-muted)]">将永久删除「{deleteTarget?.name ?? "该账号"}」及其角色、资源、战斗、招募与议事记录。此操作不可撤销。</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" className="text-[color:var(--parchment-muted)]" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" disabled={!deleteTarget || deleteMember.isPending} onClick={() => deleteTarget && deleteMember.mutate({ userId: deleteTarget.id })}>
              <Trash2 size={13} className="mr-1" />{deleteMember.isPending ? "删除中…" : "永久删除"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </GMShell>
  );
}
