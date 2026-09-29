import { useState } from "react";
import { Link } from "wouter";
import { Check, ChevronDown, ChevronUp, Gift, Inbox, MailOpen, PackageCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageSection } from "@/components/game/GameShell";
import { PageMusic } from "@/components/game/PageMusic";
import { EmptyState, ErrorState, GoldRule, Panel, resourceName, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

function formatDate(value: Date | string) {
  return new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Mailbox() {
  const utils = trpc.useUtils();
  const mail = trpc.mail.list.useQuery();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const markRead = trpc.mail.read.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.mail.list.invalidate(), utils.mail.summary.invalidate()]);
    },
  });
  const claim = trpc.mail.claim.useMutation({
    onSuccess: async (result) => {
      const resources = Object.entries(result.rewards).filter(([, value]) => Number(value) > 0).map(([key, value]) => `${resourceName(key)} +${value}`);
      const attachments = result.attachments.map((attachment) => `${attachment.name} ×${attachment.quantity}`);
      const detail = [...resources, ...attachments].join("、");
      toast.success("附件已收入领地库房", { description: detail || undefined });
      await Promise.all([utils.mail.list.invalidate(), utils.mail.summary.invalidate(), utils.keep.home.invalidate(), utils.keep.resources.invalidate(), utils.keep.vault.invalidate(), utils.shop.catalog.invalidate()]);
    },
    onError: (error) => toast.error("领取失败", { description: error.message }),
  });
  const deleteMail = trpc.mail.delete.useMutation({
    onSuccess: async () => {
      setExpandedId(null);
      toast.success("信函已归入销毁册");
      await Promise.all([utils.mail.list.invalidate(), utils.mail.summary.invalidate()]);
    },
    onError: (error) => toast.error("删除失败", { description: error.message }),
  });

  if (mail.isLoading) {
    return <><PageMusic src="/aetherfall-assets/desolate-dusk.mp3" areaName="领主邮箱" volume={0.2} /><PageSection title="领主邮箱"><SkeletonState rows={5} /></PageSection></>;
  }
  if (mail.isError || !mail.data) {
    return <><PageMusic src="/aetherfall-assets/desolate-dusk.mp3" areaName="领主邮箱" volume={0.2} /><PageSection title="领主邮箱"><ErrorState message={mail.error?.message ?? "邮箱读取失败"} onRetry={() => mail.refetch()} /></PageSection></>;
  }

  return (
    <>
      <PageMusic src="/aetherfall-assets/desolate-dusk.mp3" areaName="领主邮箱" volume={0.2} />
      <PageSection
        title="领主邮箱"
        eyebrow="Lord's Correspondence"
        actions={<Link href="/keep"><Button size="sm" variant="outline" className="border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]">返回主城</Button></Link>}
      >
        <Panel gold className="mb-4 p-3">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-sm border border-[color:var(--gold-600)]/60 bg-[color:var(--ink-950)] text-[color:var(--gold-400)]"><Inbox size={18} /></span>
            <p className="text-sm text-[color:var(--parchment-dim)]">来自灰隼堡、边境与王国各处的信函都会保存在这里。附带的资源须由领主亲自收下。</p>
          </div>
        </Panel>

        {mail.data.length === 0 ? (
          <EmptyState title="邮箱里还没有信函" hint="王国的消息抵达后，会在主界面提示你。" icon={<Inbox size={24} />} />
        ) : (
          <div className="space-y-3">
            {mail.data.map((item) => {
              const expanded = expandedId === item.id;
              const rewards = Object.entries(item.rewards ?? {}).filter(([, value]) => Number(value) > 0);
              const attachments = item.attachments ?? [];
              const canDelete = !item.hasAttachments || Boolean(item.claimedAt);
              return (
                <Panel key={item.id} gold={!item.readAt} className={cn("p-0 transition-colors", !item.readAt && "border-[color:var(--gold-600)]/65")}>
                  <button
                    className="flex w-full items-center gap-3 p-3 text-left"
                    onClick={() => {
                      setExpandedId(expanded ? null : item.id);
                      if (!item.readAt) markRead.mutate({ mailId: item.id });
                    }}
                    aria-expanded={expanded}
                  >
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-sm border", item.readAt ? "border-[color:var(--ink-500)]/60 text-[color:var(--parchment-muted)]" : "border-[color:var(--gold-600)]/65 text-[color:var(--gold-400)]")}>
                      {item.readAt ? <MailOpen size={17} /> : <Inbox size={17} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium text-[color:var(--parchment)]">{item.subject}</span>{!item.readAt ? <Tag tone="gold">新信</Tag> : null}{item.hasAttachments ? <Tag tone="aether">附件</Tag> : null}</span>
                      <span className="mt-1 block text-[0.66rem] text-[color:var(--parchment-muted)]">{formatDate(item.createdAt)}</span>
                    </span>
                    {expanded ? <ChevronUp size={16} className="text-[color:var(--parchment-muted)]" /> : <ChevronDown size={16} className="text-[color:var(--parchment-muted)]" />}
                  </button>
                  {expanded ? (
                    <div className="border-t border-[color:var(--ink-500)]/45 p-3">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-[color:var(--parchment-dim)]">{item.content}</p>
                      {item.hasAttachments ? (
                        <>
                          <GoldRule className="my-3" />
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 text-xs text-[color:var(--gold-300)]"><Gift size={13} />附件</span>
                            {rewards.map(([key, value]) => <Tag key={key} tone="aether">{resourceName(key)} +{Number(value).toLocaleString("zh-CN")}</Tag>)}
                            {attachments.map((attachment) => <Tag key={`${attachment.kind}-${attachment.key}`} tone={attachment.kind === "equipment" ? "gold" : attachment.kind === "character" ? "aether" : "good"}>{attachment.kind === "equipment" ? "装备" : attachment.kind === "character" ? "角色" : "物品"} · {attachment.name} ×{attachment.quantity}</Tag>)}
                            <Button size="sm" className="btn-gold ml-auto border-transparent text-[color:var(--ink-950)]" disabled={Boolean(item.claimedAt) || claim.isPending} onClick={() => claim.mutate({ mailId: item.id })}>
                              {item.claimedAt ? <><Check size={13} className="mr-1" />已领取</> : <><PackageCheck size={13} className="mr-1" />领取附件</>}
                            </Button>
                          </div>
                        </>
                      ) : null}
                      <div className={cn("mt-3 flex", item.hasAttachments ? "justify-end" : "justify-end")}>
                        <Button size="sm" variant="outline" className="border-[color:var(--blood)]/60 text-[color:var(--blood)] hover:bg-[color:var(--blood)]/10" disabled={!canDelete || deleteMail.isPending} title={canDelete ? "删除这封信函" : "请先领取附件，再删除这封信函"} onClick={() => deleteMail.mutate({ mailId: item.id })}>
                          <Trash2 size={13} className="mr-1" />删除
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </Panel>
              );
            })}
          </div>
        )}
      </PageSection>
    </>
  );
}
