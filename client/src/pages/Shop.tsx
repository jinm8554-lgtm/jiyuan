import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Archive, BadgeCheck, Crown, HandCoins, PackageOpen, ScrollText, ShoppingBag, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageSection } from "@/components/game/GameShell";
import { PageMusic } from "@/components/game/PageMusic";
import { EmptyState, ErrorState, GoldRule, Panel, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Product = {
  productKey: string;
  category: "contract" | "supply" | "equipment";
  name: string;
  subtitle: string;
  description: string;
  price: number;
  image: string;
  tags: string[];
  properties: Array<{ label: string; value: string }>;
  remainingPurchases: number | null;
  grant: { kind: "subscription"; days: number } | { kind: "item"; itemKey: string; quantity: number } | { kind: "equipment"; equipKey: string; quantity: number };
};
type Category = "contract" | "supply" | "equipment";

const CATEGORY: Array<{ key: Category; label: string; eyebrow: string }> = [
  { key: "contract", label: "守望契约", eyebrow: "Charters" },
  { key: "supply", label: "行装补给", eyebrow: "Provisions" },
  { key: "equipment", label: "商会器具", eyebrow: "Arms & Relics" },
];

function formatDate(value: Date | string | null) {
  if (!value) return "未登记期限";
  return new Date(value).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

function grantSummary(product: Product) {
  switch (product.grant.kind) {
    case "subscription": return `守望者权益延长 ${product.grant.days} 日`;
    case "item": return `收入商会库存：${product.grant.quantity} 件补给`;
    case "equipment": return `送入城堡金库：${product.grant.quantity} 件器具`;
  }
}

function ShopImage({ src, alt, fit = "cover", backdrop = false, className }: { src: string; alt: string; fit?: "cover" | "contain"; backdrop?: boolean; className?: string }) {
  const [missing, setMissing] = useState(false);
  return (
    <div className={cn("relative overflow-hidden bg-[radial-gradient(circle_at_50%_20%,rgba(216,178,80,0.24),transparent_42%),linear-gradient(145deg,#18202b,#080c12)]", className)}>
      {!missing ? <>{backdrop ? <img src={src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-xl" /> : null}<img src={src} alt={alt} className={cn("relative z-10 h-full w-full", fit === "contain" ? "object-contain" : "object-cover")} onError={() => setMissing(true)} /></> : <span className="grid h-full min-h-24 place-items-center text-[color:var(--gold-500)]"><ShoppingBag size={26} /></span>}
    </div>
  );
}

export default function Shop() {
  const utils = trpc.useUtils();
  const catalog = trpc.shop.catalog.useQuery();
  const [category, setCategory] = useState<Category>("contract");
  const [selected, setSelected] = useState<Product | null>(null);
  const [showRecharge, setShowRecharge] = useState(false);

  const invalidateShop = async () => {
    await Promise.all([
      utils.shop.catalog.invalidate(),
      utils.keep.home.invalidate(),
      utils.keep.resources.invalidate(),
      utils.keep.vault.invalidate(),
    ]);
  };
  const purchase = trpc.shop.purchase.useMutation({
    onSuccess: async (result) => {
      setSelected(null);
      toast.success("商会账册已盖印", { description: `已完成购入，余下 ${result.balance.toLocaleString("zh-CN")} 王冠金铢。` });
      await invalidateShop();
    },
    onError: (error) => toast.error("这笔账暂未办成", { description: error.message }),
  });
  const useItem = trpc.shop.useItem.useMutation({
    onSuccess: async (result) => {
      toast.success("补给已启用", { description: `恢复 ${result.restored} 点体力，当前体力 ${result.stamina}。` });
      await invalidateShop();
    },
    onError: (error) => toast.error("暂时无法使用", { description: error.message }),
  });

  const products = useMemo(() => catalog.data?.products.filter((product) => product.category === category) ?? [], [catalog.data?.products, category]);

  if (catalog.isLoading) {
    return <><PageMusic src="/aetherfall-assets/desolate-dusk.mp3" areaName="银杉商会" volume={0.2} /><PageSection title="银杉商会"><SkeletonState rows={6} /></PageSection></>;
  }
  if (catalog.isError || !catalog.data) {
    return <><PageMusic src="/aetherfall-assets/desolate-dusk.mp3" areaName="银杉商会" volume={0.2} /><PageSection title="银杉商会"><ErrorState message={catalog.error?.message ?? "商会账册未能送达"} onRetry={() => catalog.refetch()} /></PageSection></>;
  }

  const { currency, membership, inventory, purchases } = catalog.data;
  return (
    <>
      <PageMusic src="/aetherfall-assets/desolate-dusk.mp3" areaName="银杉商会" volume={0.2} />
      <PageSection
        title="银杉商会"
        eyebrow="The Silverpine Merchant Guild"
        actions={<Link href="/keep"><Button size="sm" variant="outline" className="border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]">返回主城</Button></Link>}
      >
        <Panel gold className="relative mb-4 overflow-hidden p-0">
          <div className="absolute inset-0 bg-cover bg-center opacity-55" style={{ backgroundImage: "url('/img/shop/merchant_hall.png')" }} />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,10,15,0.97)_0%,rgba(8,13,20,0.84)_48%,rgba(6,10,15,0.52)_100%)]" />
          <div className="relative grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:p-6">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3">
                <ShopImage src="/img/shop/silverpine_seal.png" alt="银杉商会印鉴" fit="contain" className="h-12 w-12 shrink-0 rounded-full border border-[color:var(--gold-500)]/75" />
                <div><div className="text-caption">By warrant of the Silverpine Guild</div><h2 className="text-display text-2xl text-[color:var(--parchment)]">银杉商会 · 灰隼堡分会</h2></div>
              </div>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[color:var(--parchment-dim)]">账册、契约与边境货物皆由商会书记官核验。王冠金铢一经入账，即可在此换取领地行装与守望者权益。</p>
            </div>
            <div className="min-w-52 rounded-sm border border-[color:var(--gold-500)]/60 bg-[color:var(--ink-950)]/75 p-3 backdrop-blur-sm">
              <div className="flex items-center gap-2 text-[color:var(--gold-300)]"><Crown size={17} /><span className="text-caption">商会存额</span></div>
              <div className="mt-1 text-numeric text-2xl text-[color:var(--parchment)]">{currency.balance.toLocaleString("zh-CN")}</div>
              <div className="text-[0.68rem] text-[color:var(--parchment-muted)]">{currency.name}</div>
              <Button size="sm" className="btn-gold mt-3 w-full border-transparent text-[color:var(--ink-950)]" onClick={() => setShowRecharge(true)}><HandCoins size={14} className="mr-1" />补充金铢</Button>
            </div>
          </div>
        </Panel>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <Panel>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionTitle eyebrow={CATEGORY.find((item) => item.key === category)?.eyebrow} title="商会货架" />
                <div className="flex flex-wrap gap-1 rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-900)]/70 p-1" aria-label="商品类别">
                  {CATEGORY.map((item) => <button key={item.key} type="button" onClick={() => setCategory(item.key)} className={cn("rounded-sm px-2.5 py-1.5 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--gold-400)]", category === item.key ? "bg-[color:var(--gold-700)] text-[color:var(--ink-950)]" : "text-[color:var(--parchment-muted)] hover:text-[color:var(--parchment)]")}>{item.label}</button>)}
                </div>
              </div>
              <GoldRule />
              <div className={cn("grid gap-3", products.length === 1 ? "grid-cols-1" : "md:grid-cols-2")}>
                {products.map((product) => {
                  const limited = product.remainingPurchases !== null && product.remainingPurchases <= 0;
                  const affordable = currency.balance >= product.price;
                  return (
                    <article key={product.productKey} className={cn("overflow-hidden rounded-sm border border-[color:var(--ink-500)]/65 bg-[color:var(--ink-800)]/55", products.length === 1 && "md:grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]") }>
                      <ShopImage src={product.image} alt={product.name} fit="contain" backdrop className={cn("h-40 border-b border-[color:var(--ink-500)]/55", products.length === 1 && "md:h-full md:min-h-[332px] md:border-r md:border-b-0")} />
                      <div className="p-3">
                        <div className="flex items-start justify-between gap-2"><div><h3 className="text-display text-base text-[color:var(--parchment)]">{product.name}</h3><p className="mt-1 text-[0.66rem] text-[color:var(--gold-300)]">{product.subtitle}</p></div><span className="shrink-0 text-numeric text-sm text-[color:var(--gold-300)]">{product.price} <small className="text-[0.62rem] text-[color:var(--parchment-muted)]">金铢</small></span></div>
                        <p className="mt-3 min-h-12 text-[0.7rem] leading-5 text-[color:var(--parchment-muted)]">{product.description}</p>
                        <div className="mt-3 border-y border-[color:var(--ink-500)]/45 py-2.5">
                          <div className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-[color:var(--gold-400)]">{product.category === "contract" ? "守望者权益" : "货物属性"}</div>
                          <ul className="mt-2 space-y-1.5">
                            {product.properties.map((property) => <li key={property.label} className="flex items-start justify-between gap-3 text-[0.66rem] leading-5"><span className="shrink-0 text-[color:var(--parchment-muted)]">{property.label}</span><span className="text-right text-[color:var(--parchment-dim)]">{property.value}</span></li>)}
                          </ul>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-1.5">{product.tags.map((tag) => <Tag key={tag} tone="gold">{tag}</Tag>)}</div>
                        {product.remainingPurchases !== null ? <p className="mt-2 text-[0.63rem] text-[color:var(--parchment-muted)]">本领主尚可购入 {product.remainingPurchases} 次</p> : null}
                        <div className="mt-3 flex gap-2">
                          <Button className={cn("flex-1", affordable && !limited ? "btn-gold border-transparent text-[color:var(--ink-950)]" : "border-[color:var(--gold-600)]/55 text-[color:var(--gold-300)]")} size="sm" variant={affordable && !limited ? "default" : "outline"} disabled={limited} onClick={() => affordable ? setSelected(product) : setShowRecharge(true)}>
                            {limited ? "本领主已购入" : affordable ? "查验并购入" : "补充王冠金铢"}
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </Panel>

            <Panel>
              <SectionTitle eyebrow="Guild Stock" title="商会库存" action={<Link href="/vault" className="text-xs text-[color:var(--gold-300)] hover:text-[color:var(--gold-200)]">查看城堡金库 →</Link>} />
              <GoldRule />
              {inventory.length === 0 ? <EmptyState title="商会库存尚无封存货物" hint="购入边境补给或锻炉材料后，会登记在这里；装备则直接送入城堡金库。" icon={<PackageOpen size={23} />} /> : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {inventory.map((item) => <div key={item.itemKey} className="flex gap-3 rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/45 p-2.5"><ShopImage src={item.image} alt={item.name} fit="contain" className="h-14 w-14 shrink-0 rounded-sm border border-[color:var(--gold-600)]/45" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="text-sm text-[color:var(--parchment)]">{item.name}</div><span className="text-numeric text-[color:var(--gold-300)]">×{item.quantity}</span></div><p className="mt-1 text-[0.64rem] leading-5 text-[color:var(--parchment-muted)]">{item.description}</p>{item.usable ? <Button size="sm" variant="outline" className="mt-2 h-7 border-[color:var(--aether-500)]/55 text-[0.66rem] text-[color:var(--aether-300)]" disabled={useItem.isPending} onClick={() => useItem.mutate({ itemKey: item.itemKey })}>{useItem.isPending ? "启用中…" : "使用补给"}</Button> : <span className="mt-2 block text-[0.62rem] text-[color:var(--gold-300)]">待工坊启用</span>}</div></div>)}
                </div>
              )}
            </Panel>
          </div>

          <aside className="space-y-4">
            <Panel gold>
              <SectionTitle eyebrow="Watcher Charter" title="守望者契约" action={<BadgeCheck size={17} className={membership.active ? "text-[color:var(--gold-300)]" : "text-[color:var(--parchment-muted)]"} />}/>
              <GoldRule />
              <p className="text-sm text-[color:var(--parchment)]">{membership.active ? "契约正在生效" : "尚未签订守望契约"}</p>
              <p className="mt-2 text-[0.68rem] leading-5 text-[color:var(--parchment-muted)]">{membership.active ? `书记官记载的效期至 ${formatDate(membership.expiresAt)}。` : "签订后可享每日额外体力重置与商队便利权益。"}</p>
              <ul className="mt-3 space-y-2 border-t border-[color:var(--ink-500)]/45 pt-3">
                {catalog.data.products.find((product) => product.productKey === "shop_watcher_contract_30")?.properties.map((property) => <li key={property.label} className="flex gap-2 text-[0.65rem] leading-5"><BadgeCheck size={13} className="mt-0.5 shrink-0 text-[color:var(--gold-400)]" /><span><strong className="font-medium text-[color:var(--parchment-dim)]">{property.label}：</strong><span className="text-[color:var(--parchment-muted)]">{property.value}</span></span></li>)}
              </ul>
            </Panel>
            <Panel>
              <SectionTitle eyebrow="Ledger" title="最近账本" action={<ScrollText size={16} className="text-[color:var(--gold-400)]" />} />
              <GoldRule />
              {purchases.length === 0 ? <EmptyState title="尚未落下商会账目" hint="每次购入都会在这里留下书记官的印记。" icon={<Archive size={20} />} /> : <ol className="space-y-3">{purchases.slice(0, 8).map((entry) => <li key={entry.id} className="border-l border-[color:var(--gold-600)]/60 pl-3"><p className="text-xs text-[color:var(--parchment)]">{entry.productName}</p><p className="mt-1 text-[0.64rem] text-[color:var(--parchment-muted)]">{formatDate(entry.createdAt)} · 支出 <span className="text-[color:var(--gold-300)]">{entry.crownCoinsSpent} 金铢</span></p></li>)}</ol>}
            </Panel>
            <Panel className="border-[color:var(--aether-500)]/35 bg-[color:var(--ink-800)]/45">
              <div className="flex gap-3"><Sparkles size={18} className="shrink-0 text-[color:var(--aether-300)]" /><p className="text-[0.68rem] leading-5 text-[color:var(--parchment-muted)]">王冠金铢只由商会书记官验印入账；此处的每一次购入都会记录在领主名下。</p></div>
            </Panel>
          </aside>
        </div>
      </PageSection>

      <Dialog open={showRecharge} onOpenChange={setShowRecharge}>
        <DialogContent className="border-[color:var(--gold-600)]/70 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-md">
          <DialogHeader><DialogTitle className="text-display text-[color:var(--parchment)]">商会信使在等候</DialogTitle><DialogDescription className="text-[color:var(--parchment-muted)]">王冠金铢须由商会书记官验印入账。</DialogDescription></DialogHeader>
          <div className="rounded-sm border border-[color:var(--gold-600)]/50 bg-[color:var(--ink-950)]/60 p-4"><p className="text-sm leading-7 text-[color:var(--parchment-dim)]">若要补充金铢，请加入灰隼堡商会联络群，向值守书记官报上领主名与所需补给。信使会在那里等候。</p><div className="mt-4 flex items-center gap-3 rounded-sm border border-[color:var(--gold-500)]/55 bg-[color:var(--ink-800)] p-3"><HandCoins size={19} className="text-[color:var(--gold-400)]" /><div><div className="text-caption">商会联络群</div><div className="text-numeric mt-1 text-xl tracking-wider text-[color:var(--parchment)]">1091159024</div></div></div></div>
          <DialogFooter><Button className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={() => setShowRecharge(false)}>我已记下</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !purchase.isPending) setSelected(null); }}>
        <DialogContent className="border-[color:var(--gold-600)]/70 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-md">
          {selected ? <><DialogHeader><DialogTitle className="text-display text-[color:var(--parchment)]">核验商会账册</DialogTitle><DialogDescription className="text-[color:var(--parchment-muted)]">书记官将把货物登记到领主名下。</DialogDescription></DialogHeader><div className="rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-950)]/55 p-4"><p className="font-medium text-[color:var(--parchment)]">{selected.name}</p><p className="mt-2 text-[0.7rem] text-[color:var(--parchment-muted)]">{grantSummary(selected)}</p><div className="mt-4 flex items-end justify-between border-t border-[color:var(--ink-500)]/45 pt-3"><span className="text-[0.68rem] text-[color:var(--parchment-muted)]">需用王冠金铢</span><span className="text-numeric text-lg text-[color:var(--gold-300)]">{selected.price}</span></div><p className="mt-2 text-[0.64rem] text-[color:var(--parchment-muted)]">交易后余下 {Math.max(0, currency.balance - selected.price).toLocaleString("zh-CN")} 金铢。</p></div><DialogFooter><Button variant="outline" className="border-[color:var(--ink-500)]/65 text-[color:var(--parchment-dim)]" disabled={purchase.isPending} onClick={() => setSelected(null)}>暂不购入</Button><Button className="btn-gold border-transparent text-[color:var(--ink-950)]" disabled={purchase.isPending} onClick={() => purchase.mutate({ productKey: selected.productKey })}>{purchase.isPending ? "登记中…" : "盖印购入"}</Button></DialogFooter></> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
