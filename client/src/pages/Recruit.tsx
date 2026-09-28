/**
 * 招募页
 * 要点：概率与保底公示（数据来自服务端配置）、十连保底、重复转化为信物、招募历史
 * 所有随机结果由服务端生成，前端仅展示与动画
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Coins, History, Info, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { PageSection } from "@/components/game/GameShell";
import { AetherRune } from "@/components/game/GameIcons";
import { PageMusic } from "@/components/game/PageMusic";
import { Avatar, EmptyState, ErrorState, GoldRule, Panel, ProgressBar, RarityBadge, SectionTitle, SkeletonState, Tag } from "@/components/game/ui";

const POOL_BANNER = "/aetherfall-assets/keep_banner_999e1122.jpg";

type DrawResult = {
  charKey: string;
  name?: string;
  title?: string;
  rarity: "R" | "SR" | "SSR";
  isNew: boolean;
  shards: number;
  pityTriggered: boolean;
  avatarUrl?: string | null;
  portraitUrl?: string | null;
};

export default function Recruit() {
  const utils = trpc.useUtils();
  const pools = trpc.recruit.pools.useQuery();
  const history = trpc.recruit.history.useQuery({ limit: 50 });
  const shop = trpc.recruit.exchangeShop.useQuery();
  const resources = trpc.keep.resources.useQuery();

  const [activePool, setActivePool] = useState<string | null>(null);
  const [results, setResults] = useState<DrawResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [ratePool, setRatePool] = useState<string | null>(null);

  const pool = useMemo(() => pools.data?.find((item) => item.poolKey === activePool) ?? pools.data?.[0] ?? null, [pools.data, activePool]);
  const rates = trpc.recruit.rates.useQuery({ poolKey: ratePool ?? "" }, { enabled: Boolean(ratePool) });

  const draw = trpc.recruit.draw.useMutation({
    onSuccess: async (result) => {
      setResults(result.results as DrawResult[]);
      setShowResults(true);
      if (result.highlights.hasSSR) toast.success("英杰降临！", { description: `本次获得 ${result.highlights.newCount} 名新伙伴` });
      await Promise.all([
        utils.recruit.pools.invalidate(),
        utils.recruit.history.invalidate(),
        utils.keep.resources.invalidate(),
        utils.keep.home.invalidate(),
        utils.character.roster.invalidate(),
      ]);
    },
    onError: (error) => toast.error("抽取失败", { description: error.message }),
  });

  const exchange = trpc.recruit.exchangeShards.useMutation({
    onSuccess: async (result) => {
      toast.success(`已兑换「${result.name}」`, { description: `消耗星辉信物 ${result.cost}` });
      await Promise.all([utils.keep.resources.invalidate(), utils.character.roster.invalidate()]);
    },
    onError: (error) => toast.error("兑换失败", { description: error.message }),
  });

  if (pools.isLoading) {
    return (
      <>
        <PageMusic src="/aetherfall-assets/recruit-theme.mp3" storageKey="aetherfall:recruit-music-muted" areaName="招募" />
        <PageSection title="招募">
          <SkeletonState rows={4} />
        </PageSection>
      </>
    );
  }

  if (pools.isError || !pools.data) {
    return (
      <>
        <PageMusic src="/aetherfall-assets/recruit-theme.mp3" storageKey="aetherfall:recruit-music-muted" areaName="招募" />
        <PageSection title="招募">
          <ErrorState message={pools.error?.message ?? "卡池读取失败"} onRetry={() => pools.refetch()} />
        </PageSection>
      </>
    );
  }

  const aether = resources.data?.resources.aether ?? 0;
  const recruitShards = resources.data?.resources.recruitShards ?? 0;

  return (
    <>
      <PageMusic src="/aetherfall-assets/recruit-theme.mp3" storageKey="aetherfall:recruit-music-muted" areaName="招募" />
      <PageSection
      title="招募 · 星辉誓约"
      eyebrow="概率与保底由服务端配置统一管理，客户端无法修改"
      actions={
        <div className="flex flex-wrap gap-2">
          <Tag tone="aether">星辉 {aether.toLocaleString("zh-CN")}</Tag>
          <Tag tone="gold">星辉信物 {recruitShards.toLocaleString("zh-CN")}</Tag>
        </div>
      }
    >
      {/* 卡池选择 */}
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {pools.data.map((item) => (
          <button
            key={item.poolKey}
            onClick={() => setActivePool(item.poolKey)}
            className={cn(
              "card-tap rounded-sm border p-3 text-left",
              pool?.poolKey === item.poolKey ? "border-[color:var(--gold-300)] bg-[color:var(--ink-800)]/70" : "border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/40",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm text-[color:var(--parchment)]">{item.name}</span>
              <Tag tone={item.poolType === "event" ? "aether" : item.poolType === "rare" ? "gold" : "neutral"}>
                {item.poolType === "event" ? "活动" : item.poolType === "rare" ? "稀有" : "普通"}
              </Tag>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[0.62rem] text-[color:var(--parchment-muted)]">
              <span className={item.open ? "text-[color:var(--verdant)]" : "text-[color:var(--blood)]"}>{item.open ? "开放中" : "未开放"}</span>
              <span>单抽 {item.costSingle} · 十连 {item.costTen}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        {pool ? (
          <>
            {/* 主卡池 */}
            <div className="space-y-3">
              <Panel className="overflow-hidden p-0">
                <div className="relative">
                  <img src={pool.bannerUrl ?? POOL_BANNER} alt={pool.name} className="h-40 w-full object-cover opacity-70 sm:h-52" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[color:var(--ink-950)] via-[color:var(--ink-950)]/40 to-transparent" />
                  <div className="absolute bottom-3 left-4 right-4">
                    <div className="text-caption">招募卡池</div>
                    <div className="text-display text-lg text-[color:var(--parchment)]">{pool.name}</div>
                    {!pool.open ? <div className="mt-1 text-xs text-[color:var(--blood)]">该卡池当前未开放（{pool.enabled ? "不在开放时间窗口内" : "已被关闭"}）</div> : null}
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-sm leading-relaxed text-[color:var(--parchment-dim)]">{pool.description}</p>
                  <GoldRule />

                  {/* 保底进度 */}
                  <div className="mb-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-[0.68rem] text-[color:var(--parchment-muted)]">
                        <span>距离硬保底</span>
                          <span className="text-numeric">{pool.pity.pullsSinceSSR} / {pool.pity.hardPity || "—"}</span>
                        </div>
                        <ProgressBar value={pool.pity.pullsSinceSSR} max={Math.max(1, pool.pity.hardPity)} height={7} tone="gold" />
                      <p className="mt-1 text-[0.62rem] text-[color:var(--parchment-muted)]">{pool.pityRules.softPityText}</p>
                    </div>
                    <div className="rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/50 p-2.5 text-[0.68rem] text-[color:var(--parchment-dim)]">
                      <p className="mb-1 flex items-center gap-1.5 text-[color:var(--parchment)]">
                        <Info size={12} />
                        保底与规则
                      </p>
                      <p>{pool.pityRules.hardPityText}</p>
                      <p>{pool.pityRules.tenPullGuarantee}</p>
                      {pool.pity.untilHardPity <= 1 ? <p className="mt-1 text-[color:var(--gold-300)]">下一抽必出英杰</p> : null}
                    </div>
                  </div>

                  {/* 概率公示 */}
                  <div className="mb-3 flex flex-wrap gap-2">
                    {pool.rates.map((rate) => (
                      <span key={rate.rarity} className="rounded-sm border border-[color:var(--ink-500)]/70 bg-[color:var(--ink-950)]/60 px-2 py-1 text-[0.68rem] text-[color:var(--parchment-dim)]">
                        {rate.label} {rate.rarity} <span className="text-numeric text-[color:var(--gold-300)]">{(rate.rate * 100).toFixed(2)}%</span>
                      </span>
                    ))}
                    <button className="text-[0.68rem] text-[color:var(--aether-300)] underline" onClick={() => setRatePool(pool.poolKey)}>
                      查看完整概率说明
                    </button>
                  </div>

                  {/* 抽取按钮 */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      data-testid="recruit-single-draw"
                      className="btn-gold border-transparent text-[color:var(--ink-950)]"
                      disabled={!pool.open || draw.isPending || aether < pool.costSingle}
                      onClick={() => draw.mutate({ poolKey: pool.poolKey, count: 1 })}
                    >
                      <AetherRune size={15} className="mr-1.5" />
                      单次招募（{pool.costSingle} 星辉）
                    </Button>
                    <Button
                      variant="outline"
                      className="border-[color:var(--gold-600)]/60 text-[color:var(--gold-300)]"
                      disabled={!pool.open || draw.isPending || aether < pool.costTen}
                      onClick={() => draw.mutate({ poolKey: pool.poolKey, count: 10 })}
                    >
                      <Sparkles size={15} className="mr-1.5" />
                      十连招募（{pool.costTen} 星辉）
                    </Button>
                  </div>
                  {aether < pool.costSingle ? <p className="mt-2 text-[0.68rem] text-[color:var(--blood)]">星辉不足：可通过远征、贸易产出与建筑产出获得星辉。</p> : null}
                </div>
              </Panel>

              {/* 卡池角色 */}
              {pool.featured.length > 0 ? (
                <Panel>
                  <SectionTitle eyebrow="Featured" title="本期可选角色" />
                  <GoldRule />
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {pool.featured.map((item) => (
                      <a key={item.charKey} href={`/character/${item.charKey}`} className="card-tap card-lift rounded-sm border border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/40 p-1.5 text-center">
                        <Avatar src={item.avatarUrl} name={item.name} rarity={item.rarity as "R" | "SR" | "SSR"} size={44} className="mx-auto" />
                        <span className="mt-1 block truncate text-[0.62rem] text-[color:var(--parchment-dim)]">{item.name}</span>
                      </a>
                    ))}
                  </div>
                </Panel>
              ) : null}
            </div>

            {/* 侧栏：历史 / 兑换 */}
            <div className="space-y-3">
              <Tabs defaultValue="history">
                <TabsList className="border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/60">
                  <TabsTrigger value="history" className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">
                    <History size={12} className="mr-1" />
                    招募历史
                  </TabsTrigger>
                  <TabsTrigger value="shop" className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">
                    <Coins size={12} className="mr-1" />
                    信物兑换
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="history">
                  <Panel>
                    {history.isLoading ? (
                      <SkeletonState rows={4} />
                    ) : history.isError ? (
                      <ErrorState message={history.error?.message} onRetry={() => history.refetch()} />
                    ) : (history.data ?? []).length === 0 ? (
                      <EmptyState title="还没有招募记录" hint="进行一次招募后，这里会显示完整的历史（含保底触发标记）。" icon={<History size={20} />} />
                    ) : (
                      <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                        {(history.data ?? []).map((row) => (
                          <div key={row.id} className="flex items-center gap-2 rounded-sm border border-[color:var(--ink-500)]/40 bg-[color:var(--ink-800)]/40 p-1.5">
                            <Avatar src={row.avatarUrl} name={row.name} rarity={row.rarity as "R" | "SR" | "SSR"} size={32} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-xs text-[color:var(--parchment)]">{row.name}</span>
                                <RarityBadge rarity={row.rarity as "R" | "SR" | "SSR"} />
                                {row.isNew ? <Tag tone="aether">NEW</Tag> : null}
                                {row.pityTriggered ? <Tag tone="gold">保底</Tag> : null}
                              </span>
                              <span className="mt-0.5 block text-[0.6rem] text-[color:var(--parchment-muted)]">
                                {new Date(row.createdAt).toLocaleString("zh-CN")}
                                {row.shards > 0 ? ` · 重复转化 +${row.shards} 信物` : ""}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>
                </TabsContent>

                <TabsContent value="shop">
                  <Panel>
                    <SectionTitle eyebrow="Exchange" title="星辉信物兑换" />
                    <GoldRule />
                    <p className="mb-2 text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">
                      重复角色自动转化为星辉信物。信物与招募消耗的星辉分开计算，可在这里兑换装备。
                    </p>
                    {shop.isLoading ? (
                      <SkeletonState rows={3} />
                    ) : shop.isError ? (
                      <ErrorState message={shop.error?.message} onRetry={() => shop.refetch()} />
                    ) : (
                      <div className="max-h-[380px] space-y-1.5 overflow-y-auto pr-1">
                        {(shop.data ?? []).map((item) => (
                          <div key={item.equipKey} className="flex items-center gap-2 rounded-sm border border-[color:var(--ink-500)]/40 bg-[color:var(--ink-800)]/40 p-2">
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                <span className="truncate text-xs text-[color:var(--parchment)]">{item.name}</span>
                                <RarityBadge rarity={item.rarity as "R" | "SR" | "SSR"} />
                              </span>
                              <span className="mt-0.5 block text-[0.6rem] text-[color:var(--parchment-muted)]">
                                {Object.entries(item.stats as Record<string, number>).map(([key, value]) => `${key} +${value}`).join(" · ")}
                              </span>
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 shrink-0 border-[color:var(--gold-600)]/50 text-[0.64rem] text-[color:var(--gold-300)]"
                              disabled={exchange.isPending || recruitShards < item.cost}
                              onClick={() => exchange.mutate({ equipKey: item.equipKey })}
                            >
                              {item.cost} 信物
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>
                </TabsContent>
              </Tabs>

              <div className="panel p-3 text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">
                <p className="mb-1 flex items-center gap-1.5 text-[color:var(--parchment-dim)]">
                  <Star size={13} />
                  概率透明承诺
                </p>
                <p>· 概率、软保底增量与硬保底次数全部由服务端配置下发，客户端不参与任何随机计算。</p>
                <p>· 十连必出至少 1 名精锐（SR）及以上角色。</p>
                <p>· 重复角色转化为星辉信物与羁绊经验，不会浪费。</p>
                <p>· 本作角色均为全年龄向设计，不含任何成人向内容作为卖点。</p>
              </div>
            </div>
          </>
        ) : (
          <Panel>
            <EmptyState title="暂无可用卡池" hint="GM 后台可以新建普通、稀有或活动卡池，保存后客户端会自动同步。" icon={<AetherRune size={22} />} />
          </Panel>
        )}
      </div>

      {/* 抽取结果 */}
      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent data-testid="recruit-results" className="border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">招募结果</DialogTitle>
          </DialogHeader>
          <div className={cn("grid gap-2", results.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-5")}>
            {results.map((result, index) => (
              <div
                key={`${result.charKey}-${index}`}
                className={cn(
                  "rise-in overflow-hidden rounded-sm border bg-[color:var(--ink-800)]/70",
                  result.rarity === "SSR" ? "rarity-SSR border-[#E0B84C]/90" : result.rarity === "SR" ? "rarity-SR border-[#A9B7C6]/70" : "rarity-R border-[#B08050]/60",
                  results.length > 1 && `stagger-${(index % 5) + 1}`,
                )}
              >
                {result.portraitUrl ? (
                  <img src={result.portraitUrl} alt={result.name ?? result.charKey} className="aspect-[3/4] w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                ) : (
                  <div className="grid aspect-[3/4] w-full place-items-center bg-[color:var(--ink-900)]">
                    <span className="text-display text-xl text-[color:var(--gold-600)]/70">{(result.name ?? result.charKey).slice(0, 1)}</span>
                  </div>
                )}
                <div className="p-1.5">
                  <div className="truncate text-[0.7rem] text-[color:var(--parchment)]">{result.name ?? result.charKey}</div>
                  <div className="mt-0.5 flex items-center gap-1">
                    <RarityBadge rarity={result.rarity} />
                    {result.isNew ? <Tag tone="aether">NEW</Tag> : <Tag tone="neutral">+{result.shards}</Tag>}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[0.68rem] text-[color:var(--parchment-muted)]">
              新伙伴 {results.filter((item) => item.isNew).length} 名 · 重复转化 {results.reduce((sum, item) => sum + item.shards, 0)} 信物
              {results.some((item) => item.pityTriggered) ? " · 本次触发了保底" : ""}
            </p>
            <Button className="btn-gold border-transparent text-[color:var(--ink-950)]" onClick={() => setShowResults(false)}>确认</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 概率说明 */}
      <Dialog open={Boolean(ratePool)} onOpenChange={(open) => { if (!open) setRatePool(null); }}>
        <DialogContent className="border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">概率与保底公示</DialogTitle>
          </DialogHeader>
          {rates.isLoading ? (
            <SkeletonState rows={3} />
          ) : rates.isError ? (
            <ErrorState message={rates.error?.message} onRetry={() => rates.refetch()} />
          ) : rates.data ? (
            <div className="space-y-3 text-sm">
              <div className="text-caption">基础概率</div>
              <div className="grid grid-cols-3 gap-2">
                {rates.data.rates.map((rate) => (
                  <div key={rate.rarity} className="rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/60 p-2 text-center">
                    <div className="text-xs text-[color:var(--parchment-dim)]">{rate.label} {rate.rarity}</div>
                    <div className="text-numeric text-lg text-[color:var(--gold-300)]">{(rate.rate * 100).toFixed(2)}%</div>
                  </div>
                ))}
              </div>
              <GoldRule />
              <div className="space-y-1 text-xs text-[color:var(--parchment-dim)]">
                <p>{rates.data.softPityText}</p>
                <p>{rates.data.hardPityText}</p>
                <p>{rates.data.tenPullGuarantee}</p>
                <p>{rates.data.duplicateText}</p>
                <p className="pt-1 text-[color:var(--parchment-muted)]">{rates.data.contentNote}</p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
      </PageSection>
    </>
  );
}
