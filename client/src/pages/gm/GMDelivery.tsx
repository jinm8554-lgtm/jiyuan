/** GM 投递中心：信件可附带资源、装备和可堆叠物品，并可投递给一位或全体领主。 */
import { useMemo, useState } from "react";
import { Box, Gift, MailPlus, PackagePlus, Send, Trash2, UserRound, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GMShell } from "@/components/game/GMShell";
import { EmptyState, ErrorState, GoldRule, Panel, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const RESOURCE_FIELDS = [
  ["gold", "金币"], ["food", "粮食"], ["wood", "木材"], ["iron", "铁矿"],
  ["aether", "星辉"], ["crownCoins", "王冠金铢"], ["renown", "声望"], ["stamina", "体力"], ["recruitShards", "星辉信物"],
] as const;

const EMPTY_REWARDS = { gold: 0, food: 0, wood: 0, iron: 0, aether: 0, crownCoins: 0, renown: 0, stamina: 0, recruitShards: 0 };
const ATTACHMENT_KIND_LABEL = { equipment: "装备", item: "物品", character: "角色" } as const;
type Attachment = { kind: keyof typeof ATTACHMENT_KIND_LABEL; key: string; quantity: number; name: string };

export default function GMDelivery() {
  const catalog = trpc.admin.deliveryCatalog.useQuery();
  const [target, setTarget] = useState<"profile" | "all">("profile");
  const [profileId, setProfileId] = useState("");
  const [profileSearch, setProfileSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [rewards, setRewards] = useState(EMPTY_REWARDS);
  const [attachmentKind, setAttachmentKind] = useState<Attachment["kind"]>("equipment");
  const [attachmentKey, setAttachmentKey] = useState("");
  const [attachmentQuantity, setAttachmentQuantity] = useState(1);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const visibleProfiles = useMemo(() => {
    const query = profileSearch.trim().toLocaleLowerCase();
    if (!query) return catalog.data?.profiles ?? [];
    return (catalog.data?.profiles ?? []).filter((profile) => `${profile.lordName} ${profile.keepName} ${profile.id}`.toLocaleLowerCase().includes(query));
  }, [catalog.data?.profiles, profileSearch]);
  const candidates = attachmentKind === "equipment"
    ? (catalog.data?.equipments ?? []).map((equipment) => ({ key: equipment.equipKey, name: equipment.name, detail: `${equipment.rarity} · ${equipment.slot} · 等级 ${equipment.requiredLevel}` }))
    : attachmentKind === "item"
      ? (catalog.data?.items ?? []).map((item) => ({ key: item.itemKey, name: item.name, detail: item.description }))
      : (catalog.data?.characters ?? []).map((character) => ({ key: character.charKey, name: character.name, detail: `${character.rarity} · ${character.job} · ${character.title}` }));
  const selectedCandidate = candidates.find((candidate) => candidate.key === attachmentKey) ?? candidates[0];
  const recipientLabel = target === "all"
    ? `全部 ${catalog.data?.profileCount ?? 0} 名领主`
    : catalog.data?.profiles.find((profile) => String(profile.id) === profileId)?.lordName ?? "选定领主";

  const delivery = trpc.admin.deliverMail.useMutation({
    onSuccess: (result) => {
      toast.success("投递记录已盖印", { description: `已向 ${result.recipientCount} 名领主的邮箱投递信函。` });
      setSubject("");
      setContent("");
      setRewards(EMPTY_REWARDS);
      setAttachments([]);
    },
    onError: (error) => toast.error("投递未完成", { description: error.message }),
  });

  function addAttachment() {
    if (!selectedCandidate) return;
    setAttachments((current) => {
      const existing = current.find((attachment) => attachment.kind === attachmentKind && attachment.key === selectedCandidate.key);
      if (existing) return current.map((attachment) => attachment === existing ? { ...attachment, quantity: attachment.quantity + attachmentQuantity } : attachment);
      if (current.length >= 8) {
        toast.error("一封信最多附带 8 种物品");
        return current;
      }
      return [...current, { kind: attachmentKind, key: selectedCandidate.key, quantity: attachmentQuantity, name: selectedCandidate.name }];
    });
  }

  function submit() {
    if (!subject.trim() || !content.trim()) return;
    delivery.mutate({
      target,
      profileId: target === "profile" ? Number(profileId) : undefined,
      subject,
      content,
      rewards,
      attachments: attachments.map(({ kind, key, quantity }) => ({ kind, key, quantity })),
    });
  }

  if (catalog.isLoading) return <GMShell title="投递中心" eyebrow="Courier Ledger"><SkeletonState rows={7} /></GMShell>;
  if (catalog.error || !catalog.data) return <GMShell title="投递中心" eyebrow="Courier Ledger"><ErrorState message={catalog.error?.message ?? "投递清单无法读取，请稍后重试"} onRetry={() => { void catalog.refetch(); }} /></GMShell>;

  const canSubmit = Boolean(subject.trim() && content.trim() && (target === "all" || profileId) && !delivery.isPending);
  return (
    <GMShell title="投递中心" eyebrow="Courier Ledger">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <Panel gold className="min-w-0">
          <SectionTitle eyebrow="Sealed Dispatch" title="撰写领主信函" action={<MailPlus size={18} className="text-[color:var(--gold-400)]" />} />
          <GoldRule />
          <p className="text-sm leading-6 text-[color:var(--parchment-dim)]">资源与附件不会直接写入领主档案；领主需要在游戏邮箱中亲自拆封并领取。王冠金铢与角色同样会在领取时由服务端登记。</p>

          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <Label className="text-[0.7rem] text-[color:var(--parchment-muted)]">投递对象</Label>
              <span className="text-[0.68rem] text-[color:var(--gold-400)]">当前将投递给：{recipientLabel}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setTarget("profile")} className={cn("flex items-center gap-2 rounded-sm border p-3 text-left text-sm", target === "profile" ? "border-[color:var(--gold-600)] bg-[color:var(--gold-500)]/10 text-[color:var(--gold-300)]" : "border-[color:var(--ink-500)]/60 text-[color:var(--parchment-dim)]")}>
                <UserRound size={16} />指定领主
              </button>
              <button type="button" onClick={() => setTarget("all")} className={cn("flex items-center gap-2 rounded-sm border p-3 text-left text-sm", target === "all" ? "border-[color:var(--gold-600)] bg-[color:var(--gold-500)]/10 text-[color:var(--gold-300)]" : "border-[color:var(--ink-500)]/60 text-[color:var(--parchment-dim)]")}>
                <Users size={16} />全体领主（{catalog.data.profileCount}）
              </button>
            </div>
            {target === "profile" ? <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
              <Input value={profileSearch} onChange={(event) => setProfileSearch(event.target.value)} placeholder="按领主、城堡或档案编号筛选" className="h-9 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)] text-xs text-[color:var(--parchment)]" />
              <Select value={profileId || undefined} onValueChange={setProfileId}>
                <SelectTrigger className="h-9 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)] text-xs text-[color:var(--parchment)]"><SelectValue placeholder="选择领主档案" /></SelectTrigger>
                <SelectContent>{visibleProfiles.length > 0 ? visibleProfiles.map((profile) => <SelectItem key={profile.id} value={String(profile.id)}>{profile.lordName} · {profile.keepName}（#{profile.id}）</SelectItem>) : <SelectItem value="no-profile" disabled>没有匹配的领主</SelectItem>}</SelectContent>
              </Select>
            </div> : null}
          </section>

          <section className="mt-5 grid gap-3 md:grid-cols-2">
            <div>
              <Label className="text-[0.7rem] text-[color:var(--parchment-muted)]">信函标题</Label>
              <Input value={subject} maxLength={120} onChange={(event) => setSubject(event.target.value)} placeholder="例如：冬季商路补给已抵达" className="mt-1 h-9 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)] text-sm text-[color:var(--parchment)]" />
            </div>
            <div>
              <Label className="text-[0.7rem] text-[color:var(--parchment-muted)]">信函正文</Label>
              <textarea value={content} maxLength={4000} onChange={(event) => setContent(event.target.value)} placeholder="写下这份投递的来由与交代…" className="mt-1 min-h-20 w-full resize-y rounded-sm border border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)] p-2 text-sm text-[color:var(--parchment)] outline-none placeholder:text-[color:var(--parchment-muted)] focus:border-[color:var(--gold-600)]" />
            </div>
          </section>

          <section className="mt-5">
            <SectionTitle eyebrow="Resources" title="随信资源" action={<Gift size={17} className="text-[color:var(--gold-400)]" />} />
            <GoldRule />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RESOURCE_FIELDS.map(([key, label]) => <div key={key}>
                <Label className="text-[0.64rem] text-[color:var(--parchment-muted)]">{label}</Label>
                <Input type="number" min={0} value={rewards[key]} onChange={(event) => setRewards((current) => ({ ...current, [key]: Math.max(0, Number(event.target.value) || 0) }))} className="mt-1 h-8 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)] text-xs text-[color:var(--parchment)]" />
              </div>)}
            </div>
          </section>

          <section className="mt-5">
            <SectionTitle eyebrow="Attachments" title="随信物品" action={<PackagePlus size={17} className="text-[color:var(--gold-400)]" />} />
            <GoldRule />
            <div className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)_84px_auto]">
              <Select value={attachmentKind} onValueChange={(value) => { setAttachmentKind(value as Attachment["kind"]); setAttachmentKey(""); }}>
                <SelectTrigger className="h-9 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)] text-xs text-[color:var(--parchment)]"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="equipment">装备</SelectItem><SelectItem value="item">商会物品</SelectItem><SelectItem value="character">角色</SelectItem></SelectContent>
              </Select>
              <Select value={attachmentKey || selectedCandidate?.key} onValueChange={setAttachmentKey} disabled={!selectedCandidate}>
                <SelectTrigger className="h-9 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)] text-xs text-[color:var(--parchment)]"><SelectValue placeholder="选择附件" /></SelectTrigger>
                <SelectContent>{candidates.map((candidate) => <SelectItem key={candidate.key} value={candidate.key}>{candidate.name} · {candidate.detail}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="number" min={1} max={attachmentKind === "item" ? 999 : 10} value={attachmentQuantity} onChange={(event) => setAttachmentQuantity(Math.max(1, Number(event.target.value) || 1))} className="h-9 border-[color:var(--ink-500)]/70 bg-[color:var(--ink-800)] text-xs text-[color:var(--parchment)]" />
              <Button type="button" variant="outline" onClick={addAttachment} disabled={!selectedCandidate} className="h-9 border-[color:var(--gold-600)]/65 text-[color:var(--gold-300)]"><Box size={14} className="mr-1" />加入</Button>
            </div>
            {attachments.length ? <div className="mt-3 flex flex-wrap gap-2">{attachments.map((attachment) => <Tag key={`${attachment.kind}:${attachment.key}`} tone={attachment.kind === "equipment" ? "gold" : attachment.kind === "character" ? "aether" : "good"} className="gap-1.5 py-1"><span>{ATTACHMENT_KIND_LABEL[attachment.kind]} · {attachment.name} ×{attachment.quantity}</span><button type="button" onClick={() => setAttachments((current) => current.filter((item) => item !== attachment))} aria-label={`移除 ${attachment.name}`} className="rounded-sm text-current/75 hover:text-[color:var(--blood)]"><Trash2 size={12} /></button></Tag>)}</div> : <p className="mt-3 text-xs text-[color:var(--parchment-muted)]">没有附件时，这将作为一封纯通知信函投递。</p>}
          </section>

          <div className="mt-6 flex justify-end border-t border-[color:var(--ink-500)]/50 pt-4">
            <Button onClick={submit} disabled={!canSubmit} className="btn-gold min-w-44 border-transparent text-[color:var(--ink-950)]"><Send size={15} className="mr-1.5" />{delivery.isPending ? "封缄投递中…" : target === "all" ? `投递给全部 ${catalog.data.profileCount} 名领主` : "投递给选定领主"}</Button>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel>
            <SectionTitle eyebrow="Dispatch Rules" title="投递说明" />
            <GoldRule />
            <ul className="space-y-3 text-sm leading-6 text-[color:var(--parchment-dim)]">
              <li>每位收件人都会收到一封独立信函，领取状态彼此独立。</li>
              <li>资源、王冠金铢、装备、商会物品与角色均在玩家领取时由服务端写入档案。</li>
              <li>装备按件进入城堡金库；商会物品按数量加入库存；重复角色会按现有规则转化为信物与羁绊经验。</li>
              <li>所有投递都会记入 GM 审计账本。</li>
            </ul>
          </Panel>
          <Panel>
            <SectionTitle eyebrow="Attached Ledger" title={`已附 ${attachments.length} 种物品`} />
            <GoldRule />
            {attachments.length ? <div className="space-y-2">{attachments.map((attachment) => <div key={`ledger:${attachment.kind}:${attachment.key}`} className="flex items-center justify-between rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-900)]/70 px-3 py-2 text-sm"><span className="text-[color:var(--parchment)]">{ATTACHMENT_KIND_LABEL[attachment.kind]} · {attachment.name}</span><span className="text-numeric text-[color:var(--gold-400)]">×{attachment.quantity}</span></div>)}</div> : <EmptyState title="尚未封入物品" hint="可只发送通知或资源；需要时再加入装备、物品或角色。" />}
          </Panel>
        </div>
      </div>
    </GMShell>
  );
}
