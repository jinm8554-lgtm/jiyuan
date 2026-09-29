import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Archive, Box, Hammer, PackageOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageSection } from "@/components/game/GameShell";
import { PageMusic } from "@/components/game/PageMusic";
import { EmptyState, ErrorState, GoldRule, Panel, RarityBadge, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const STAT_LABEL: Record<string, string> = {
  hp: "生命", atk: "攻击", def: "防御", mag: "法强", res: "抗性",
  spd: "速度", crit: "暴击", critDmg: "暴伤", hit: "命中", dodge: "闪避",
};

const MATERIAL_ICON: Record<string, typeof Box> = {
  wood: Box,
  iron: Hammer,
  aether: Sparkles,
  recruitShards: Archive,
};

type Filter = "all" | "stored" | "equipped";

export default function Vault() {
  const vault = trpc.keep.vault.useQuery();
  const [filter, setFilter] = useState<Filter>("all");
  const visibleEquipment = useMemo(() => {
    if (!vault.data) return [];
    if (filter === "stored") return vault.data.equipment.filter((item) => !item.equipped);
    if (filter === "equipped") return vault.data.equipment.filter((item) => item.equipped);
    return vault.data.equipment;
  }, [filter, vault.data]);

  if (vault.isLoading) {
    return <><PageMusic src="/aetherfall-assets/desolate-dusk.mp3" areaName="城堡金库" volume={0.2} /><PageSection title="城堡金库"><SkeletonState rows={5} /></PageSection></>;
  }
  if (vault.isError || !vault.data) {
    return <><PageMusic src="/aetherfall-assets/desolate-dusk.mp3" areaName="城堡金库" volume={0.2} /><PageSection title="城堡金库"><ErrorState message={vault.error?.message ?? "金库读取失败"} onRetry={() => vault.refetch()} /></PageSection></>;
  }

  const storedCount = vault.data.summary.totalEquipment - vault.data.summary.equippedEquipment;
  return (
    <>
      <PageMusic src="/aetherfall-assets/desolate-dusk.mp3" areaName="城堡金库" volume={0.2} />
      <PageSection
        title="城堡金库"
        eyebrow="Grey Falcon Keep Treasury"
        actions={<Link href="/keep"><Button size="sm" variant="outline" className="border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]">返回主城</Button></Link>}
      >
        <Panel gold className="mb-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-sm border border-[color:var(--gold-600)]/65 bg-[color:var(--ink-950)] text-[color:var(--gold-400)]"><Archive size={20} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-caption">Keep Treasury</div>
              <p className="mt-1 text-sm leading-6 text-[color:var(--parchment-dim)]">战利品、任务奖赏与工造素材均由书记官登记于此。已穿戴的装备也会保留在账册中。</p>
            </div>
            <div className="flex gap-2 text-center text-xs">
              <div className="rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-900)]/55 px-3 py-2"><span className="block text-numeric text-base text-[color:var(--parchment)]">{vault.data.summary.totalEquipment}</span><span className="text-[color:var(--parchment-muted)]">装备总数</span></div>
              <div className="rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-900)]/55 px-3 py-2"><span className="block text-numeric text-base text-[color:var(--gold-300)]">{storedCount}</span><span className="text-[color:var(--parchment-muted)]">库中待用</span></div>
            </div>
          </div>
        </Panel>

        <Panel className="mb-4">
          <SectionTitle eyebrow="Materials" title="锻造与契约素材" />
          <GoldRule />
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {vault.data.materials.map((material) => {
              const Icon = MATERIAL_ICON[material.key] ?? Box;
              return (
                <div key={material.key} className="rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/55 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn("grid h-8 w-8 place-items-center rounded-sm border", material.tone === "aether" ? "border-[color:var(--aether-500)]/55 text-[color:var(--aether-300)]" : material.tone === "verdant" ? "border-[color:var(--verdant)]/55 text-[color:var(--verdant)]" : "border-[color:var(--gold-600)]/55 text-[color:var(--gold-400)]")}><Icon size={16} /></span>
                    <span className="text-numeric text-lg text-[color:var(--parchment)]">{material.quantity.toLocaleString("zh-CN")}</span>
                  </div>
                  <div className="mt-2 text-sm font-medium text-[color:var(--parchment)]">{material.name}</div>
                  <p className="mt-1 text-[0.66rem] leading-5 text-[color:var(--parchment-muted)]">{material.description}</p>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle eyebrow="Equipment Ledger" title="装备账册" />
            <div className="flex gap-1 rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-900)]/60 p-1" aria-label="装备筛选">
              {([ ["all", "全部"], ["stored", "库中待用"], ["equipped", "已穿戴"] ] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setFilter(key)} className={cn("rounded-sm px-2.5 py-1 text-xs transition-colors", filter === key ? "bg-[color:var(--gold-700)] text-[color:var(--ink-950)]" : "text-[color:var(--parchment-muted)] hover:text-[color:var(--parchment)]")}>{label}</button>
              ))}
            </div>
          </div>
          <GoldRule />
          {visibleEquipment.length === 0 ? (
            <EmptyState title={filter === "stored" ? "金库中暂无待用装备" : filter === "equipped" ? "当前没有角色穿戴装备" : "金库里还没有装备"} hint="完成远征、领取任务奖赏或使用星辉信物兑换后，物品会登记在这里。" icon={<PackageOpen size={24} />} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleEquipment.map((item) => (
                <article key={item.playerEquipId} className={cn("rounded-sm border bg-[color:var(--ink-800)]/55 p-3", item.rarity === "SSR" ? "border-[#E0B84C]/80" : item.rarity === "SR" ? "border-[#A9B7C6]/70" : "border-[#B08050]/60")}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-sm border border-[color:var(--gold-600)]/50 bg-[color:var(--ink-950)] text-[color:var(--gold-400)]"><PackageOpen size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5"><span className="truncate text-sm font-medium text-[color:var(--parchment)]">{item.name}</span><RarityBadge rarity={item.rarity} /></div>
                      <div className="mt-1 flex flex-wrap gap-1.5"><Tag tone="neutral">{item.slotName}</Tag><Tag tone="aether">强化 +{Math.max(0, item.level - 1)}</Tag><Tag tone="neutral">{item.sourceName}</Tag></div>
                    </div>
                  </div>
                  <p className="mt-3 min-h-10 text-[0.68rem] leading-5 text-[color:var(--parchment-muted)]">{item.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(item.stats).filter(([, value]) => Number(value) !== 0).map(([key, value]) => <Tag key={key} tone="gold">{STAT_LABEL[key] ?? key} +{Number(value)}</Tag>)}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-[color:var(--ink-500)]/45 pt-2 text-[0.66rem]">
                    <span className="text-[color:var(--parchment-muted)]">{item.equipped ? "已穿戴" : "存放于金库"}</span>
                    {item.equipped && item.ownerName && item.ownerCharKey ? <Link href={`/character/${item.ownerCharKey}`} className="text-[color:var(--gold-300)] hover:text-[color:var(--gold-200)]">{item.ownerName} →</Link> : <Link href="/roster" className="text-[color:var(--aether-300)] hover:text-[color:var(--aether-200)]">前往同伴穿戴 →</Link>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Panel>
      </PageSection>
    </>
  );
}
