/**
 * 角色详情页
 * 结构：立绘 + 基本信息 → 属性与成长曲线 → 技能 → 装备 → 羁绊与关系
 * 全部数值来自服务端；装备加成清晰展示（基础 / 加成 / 合计）
 */
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, ArrowUp, BookOpen, Gift, Heart, Shield, Sparkles, Swords, TrendingUp, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { PageSection } from "@/components/game/GameShell";
import { ELEMENT_ICON, JOB_ICON } from "@/components/game/GameIcons";
import { Avatar, ELEMENT_COLOR, ELEMENT_NAME, EmptyState, ErrorState, GoldRule, JOB_NAME, JOB_ROLE_TEXT, Panel, ProgressBar, RarityBadge, SectionTitle, SkeletonState, StatRow, Tag } from "@/components/game/ui";

const STAT_NAME: Record<string, string> = {
  hp: "生命",
  atk: "攻击",
  def: "防御",
  mag: "魔力",
  res: "抗性",
  spd: "速度",
  crit: "暴击",
  critDmg: "暴击伤害",
  hit: "命中",
  dodge: "闪避",
};

const SLOT_NAME: Record<string, string> = {
  weapon: "武器",
  offhand: "副手",
  helmet: "头盔",
  armor: "护甲",
  boots: "鞋子",
  accessory: "饰品",
};

export default function CharacterDetail() {
  const params = useParams<{ charKey: string }>();
  const charKey = params.charKey ?? "";
  const utils = trpc.useUtils();

  const detail = trpc.character.detail.useQuery({ charKey }, { enabled: Boolean(charKey) });
  const [levelTimes, setLevelTimes] = useState(1);
  const [equipSlot, setEquipSlot] = useState<string | null>(null);

  const levelUp = trpc.character.levelUp.useMutation({
    onSuccess: async (result) => {
      toast.success(`${detail.data?.config.name ?? ""} 提升至 ${result.level} 级`, { description: `消耗金币 ${result.spentGold.toLocaleString("zh-CN")}${result.levels > 1 ? ` · 共提升 ${result.levels} 级` : ""}` });
      await Promise.all([utils.character.detail.invalidate({ charKey }), utils.character.roster.invalidate(), utils.keep.resources.invalidate(), utils.keep.home.invalidate()]);
    },
    onError: (error) => toast.error("升级失败", { description: error.message }),
  });

  const upgradeSkill = trpc.character.upgradeSkill.useMutation({
    onSuccess: async (result) => {
      toast.success("技能已强化", { description: `等级 ${result.level} · 消耗金币 ${result.costGold} / 星辉 ${result.costAether}` });
      await Promise.all([utils.character.detail.invalidate({ charKey }), utils.keep.resources.invalidate()]);
    },
    onError: (error) => toast.error("技能升级失败", { description: error.message }),
  });

  const ascend = trpc.character.ascend.useMutation({
    onSuccess: async (result) => {
      toast.success(`突破成功：${result.ascension} 阶`, { description: `等级上限提升至 ${result.newMaxLevel}` });
      await Promise.all([utils.character.detail.invalidate({ charKey }), utils.keep.resources.invalidate()]);
    },
    onError: (error) => toast.error("突破失败", { description: error.message }),
  });

  const equip = trpc.character.equip.useMutation({
    onSuccess: async () => {
      toast.success("装备已更新");
      setEquipSlot(null);
      await Promise.all([utils.character.detail.invalidate({ charKey }), utils.character.roster.invalidate(), utils.keep.home.invalidate()]);
    },
    onError: (error) => toast.error("装备失败", { description: error.message }),
  });

  const enhance = trpc.character.enhanceEquipment.useMutation({
    onSuccess: async (result) => {
      toast.success(`强化至 +${result.level}`, { description: `消耗铁矿 ${result.costIron} / 金币 ${result.costGold}` });
      await Promise.all([utils.character.detail.invalidate({ charKey }), utils.keep.resources.invalidate()]);
    },
    onError: (error) => toast.error("强化失败", { description: error.message }),
  });

  const bond = trpc.character.bondInteract.useMutation({
    onSuccess: async (result) => {
      toast.success(`羁绊提升 +${result.gain}`, { description: result.line ?? undefined });
      await Promise.all([utils.character.detail.invalidate({ charKey }), utils.keep.resources.invalidate()]);
    },
    onError: (error) => toast.error("互动失败", { description: error.message }),
  });

  const markSeen = trpc.character.markSeen.useMutation();
  useEffect(() => {
    if (detail.data?.owned) markSeen.mutate({ charKey });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charKey, detail.data?.owned]);

  const equippedInventory = useMemo(() => {
    if (!detail.data || !equipSlot) return [];
    return detail.data.inventory.filter((item) => item?.slot === equipSlot);
  }, [detail.data, equipSlot]);

  if (detail.isLoading) {
    return (
      <PageSection title="角色详情">
        <SkeletonState rows={5} />
      </PageSection>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <PageSection title="角色详情">
        <ErrorState message={detail.error?.message ?? "角色读取失败"} onRetry={() => detail.refetch()} />
        <Link href="/roster" className="mt-3 inline-block text-xs text-[color:var(--parchment-muted)] underline">返回名册</Link>
      </PageSection>
    );
  }

  const data = detail.data;
  const config = data.config;
  const JobIcon = JOB_ICON[config.job as keyof typeof JOB_ICON];
  const ElementIcon = ELEMENT_ICON[config.element as keyof typeof ELEMENT_ICON];
  const totalStats = Object.fromEntries(Object.entries(data.stats).map(([key, value]) => [key, Number(value) + Number((data.equipmentBonus as Record<string, number>)[key] ?? 0)]));

  return (
    <PageSection
      title={config.name}
      eyebrow={`${config.title} · ${JOB_NAME[config.job]} · ${config.race} · ${config.faction}`}
      actions={
        <div className="flex gap-2">
          <Link href="/roster">
            <Button size="sm" variant="outline" className="border-[color:var(--ink-500)]/70 text-[color:var(--parchment-dim)]">
              <ArrowLeft size={13} className="mr-1" />
              返回名册
            </Button>
          </Link>
          <Link href="/council">
            <Button size="sm" variant="outline" className="border-[color:var(--aether-500)]/50 text-[color:var(--aether-300)]">
              <Users size={13} className="mr-1" />
              去议事厅
            </Button>
          </Link>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        {/* 立绘与基本信息 */}
        <div className="space-y-3">
          <Panel className="overflow-hidden p-0">
            <div className="relative">
              {config.portraitUrl ? (
                <img src={config.portraitUrl} alt={config.name} className="aspect-[2/3] w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} />
              ) : (
                <div className="grid aspect-[2/3] w-full place-items-center bg-[color:var(--ink-900)]">
                  <span className="text-display text-5xl text-[color:var(--gold-600)]/70">{config.name.slice(0, 1)}</span>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[color:var(--ink-950)] to-transparent p-3 pt-10">
                <div className="flex items-center gap-2">
                  <RarityBadge rarity={config.rarity as "R" | "SR" | "SSR"} />
                  <Tag tone="neutral">{config.race}</Tag>
                  {data.owned ? <Tag tone="good">已招募</Tag> : <Tag tone="danger">未招募</Tag>}
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-xs text-[color:var(--parchment-dim)]">
                  <span className="flex items-center gap-1"><JobIcon size={13} />{JOB_NAME[config.job]}</span>
                  <span className="flex items-center gap-1" style={{ color: ELEMENT_COLOR[config.element] }}><ElementIcon size={13} />{ELEMENT_NAME[config.element]}</span>
                </div>
              </div>
            </div>
            <div className="p-3">
              <p className="text-xs leading-relaxed text-[color:var(--parchment-dim)]">{config.intro}</p>
              <GoldRule />
              <div className="space-y-1 text-[0.7rem] text-[color:var(--parchment-muted)]">
                <p>武器：{config.weapon}</p>
                <p>定位：{JOB_ROLE_TEXT[config.job]}</p>
                <p>内容分级：{config.contentRating === "all-ages" ? "全年龄向" : config.contentRating}</p>
              </div>
            </div>
          </Panel>

          {data.owned ? (
            <Panel>
              <SectionTitle eyebrow="Growth" title="养成" />
              <GoldRule />
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[color:var(--parchment-muted)]">等级</span>
                  <span className="text-numeric text-[color:var(--gold-300)]">LV.{data.level} / {data.maxLevel}</span>
                </div>
                <ProgressBar value={data.level} max={data.maxLevel} height={6} tone="gold" />
                <div className="flex items-center justify-between">
                  <span className="text-[color:var(--parchment-muted)]">经验</span>
                  <span className="text-numeric text-[color:var(--parchment-dim)]">{data.exp} / {data.expToNext}</span>
                </div>
                <ProgressBar value={data.exp} max={data.expToNext} height={5} tone="aether" />
                <div className="flex items-center justify-between">
                  <span className="text-[color:var(--parchment-muted)]">突破阶数</span>
                  <span className="text-numeric text-[color:var(--parchment-dim)]">{data.ascension} / 4（每阶 +{Math.round(data.ascensionBonus * 100)}% 属性）</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[color:var(--parchment-muted)]">升级次数</span>
                  <div className="ml-auto flex gap-1">
                    {[1, 5, 10].map((times) => (
                      <button
                        key={times}
                        className={cn("rounded-sm border px-1.5 py-0.5 text-[0.66rem]", levelTimes === times ? "border-[color:var(--gold-300)] text-[color:var(--gold-300)]" : "border-[color:var(--ink-500)]/70 text-[color:var(--parchment-muted)]")}
                        onClick={() => setLevelTimes(times)}
                      >
                        ×{times}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" className="btn-gold flex-1 border-transparent text-[color:var(--ink-950)]" disabled={levelUp.isPending} onClick={() => levelUp.mutate({ charKey, times: levelTimes })}>
                    <ArrowUp size={13} className="mr-1" />
                    升级（{data.levelUpCost.gold.toLocaleString("zh-CN")} 金币/级）
                  </Button>
                  <Button size="sm" variant="outline" className="border-[color:var(--aether-500)]/50 text-[color:var(--aether-300)]" disabled={ascend.isPending} onClick={() => ascend.mutate({ charKey })}>
                    <Sparkles size={13} className="mr-1" />
                    突破
                  </Button>
                </div>
                <p className="text-[0.62rem] leading-relaxed text-[color:var(--parchment-muted)]">
                  突破需达到当前等级上限，消耗金币、星辉与铁矿；突破提升等级上限与全属性成长。
                </p>
              </div>
            </Panel>
          ) : (
            <Panel>
              <EmptyState title="尚未招募该角色" hint="可在「招募」中通过卡池获得。未拥有的角色同样可以在名册中查看设定与数值。" icon={<Users size={20} />} action={<Link href="/recruit"><Button size="sm" className="btn-gold border-transparent text-[color:var(--ink-950)]">前往招募</Button></Link>} />
            </Panel>
          )}
        </div>

        {/* 详细内容 */}
        <div className="space-y-4">
          <Tabs defaultValue="stats">
            <TabsList className="border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/60">
              <TabsTrigger value="stats" className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">属性</TabsTrigger>
              <TabsTrigger value="skills" className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">技能</TabsTrigger>
              <TabsTrigger value="equip" className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">装备</TabsTrigger>
              <TabsTrigger value="bond" className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">羁绊</TabsTrigger>
              <TabsTrigger value="lore" className="text-xs data-[state=active]:bg-[color:var(--ink-700)] data-[state=active]:text-[color:var(--gold-300)]">设定</TabsTrigger>
            </TabsList>

            {/* 属性 */}
            <TabsContent value="stats" className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Panel>
                  <SectionTitle eyebrow="Attributes" title="战斗属性" action={<span className="text-numeric text-sm text-[color:var(--gold-300)]">战力 {data.power.toLocaleString("zh-CN")}</span>} />
                  <GoldRule />
                  {(["hp", "atk", "def", "mag", "res", "spd", "crit", "critDmg", "hit", "dodge"] as const).map((key) => (
                    <StatRow
                      key={key}
                      label={STAT_NAME[key]}
                      value={Math.round(Number((data.stats as Record<string, number>)[key] ?? 0))}
                      bonus={Math.round(Number((data.equipmentBonus as Record<string, number>)[key] ?? 0))}
                      suffix={key === "crit" || key === "critDmg" || key === "hit" || key === "dodge" ? "%" : ""}
                    />
                  ))}
                  <div className="mt-2 rounded-sm border border-[color:var(--gold-600)]/40 bg-[color:var(--ink-800)]/60 p-2 text-[0.68rem] text-[color:var(--parchment-muted)]">
                    合计属性（含装备加成）：
                    <span className="text-numeric text-[color:var(--gold-300)]"> 生命 {Math.round(totalStats.hp ?? 0)} · 攻击 {Math.round(totalStats.atk ?? 0)} · 防御 {Math.round(totalStats.def ?? 0)}</span>
                  </div>
                </Panel>

                <Panel>
                  <SectionTitle eyebrow="Growth Curve" title="成长预览" />
                  <GoldRule />
                  <div className="space-y-1.5">
                    {data.curve.map((point) => {
                      const maxPower = Math.max(...data.curve.map((item) => item.power));
                      return (
                        <div key={point.level} className="flex items-center gap-2 text-[0.68rem]">
                          <span className="text-numeric w-10 shrink-0 text-[color:var(--parchment-muted)]">LV.{point.level}</span>
                          <span className="min-w-0 flex-1">
                            <ProgressBar value={point.power} max={maxPower} height={5} tone={data.owned ? "gold" : "aether"} />
                          </span>
                          <span className="text-numeric w-14 shrink-0 text-right text-[color:var(--parchment-dim)]">{point.power.toLocaleString("zh-CN")}</span>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[0.62rem] text-[color:var(--parchment-muted)]">
                    成长曲线由品质系数（{config.rarityLabel} ×{config.rarityFactor}）与角色成长率共同决定：稀有度越高，同级属性与战力越强。
                  </p>
                </Panel>
              </div>
            </TabsContent>

            {/* 技能 */}
            <TabsContent value="skills">
              <Panel>
                <SectionTitle eyebrow="Skills" title="技能与升级" />
                <GoldRule />
                {data.skills.length === 0 ? (
                  <EmptyState title="暂无技能数据" icon={<Swords size={20} />} />
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {data.skills.map((skill) => {
                      const ElementIcon = ELEMENT_ICON[skill.element as keyof typeof ELEMENT_ICON];
                      const maxed = skill.level >= skill.maxLevel;
                      return (
                        <div key={skill.skillKey} className="rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/50 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 truncate text-sm text-[color:var(--parchment)]">
                              <ElementIcon size={14} style={{ color: ELEMENT_COLOR[skill.element] }} />
                              {skill.name}
                            </span>
                            <span className="text-numeric text-xs text-[color:var(--gold-300)]">LV.{skill.level}/{skill.maxLevel}</span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-2 text-[0.62rem] text-[color:var(--parchment-muted)]">
                            <span>{skill.kind === "passive" ? "被动" : "主动"}</span>
                            {skill.power > 0 ? (
                              <span className="text-[color:var(--gold-300)]">当前倍率 {skill.currentPower}%</span>
                            ) : (
                              <span className="text-[color:var(--gold-300)]">当前效果强度 LV.{skill.level}</span>
                            )}
                            {skill.maxLevel > 1 ? <span>{skill.power > 0 ? `每级 +${skill.powerPerLevel} 倍率` : `每级提升效果 ${skill.powerPerLevel}%`}</span> : null}
                            <span>冷却 {skill.cooldown} 回合</span>
                            {skill.energyCost > 0 ? <span>能量 {skill.energyCost}</span> : null}
                            <span>
                              目标：{skill.targetType === "all_enemies" ? "全体敌人" : skill.targetType === "all_allies" ? "全体友方" : skill.targetType === "enemy" ? "单体敌人" : skill.targetType === "ally" ? "单体友方" : "自身"}
                            </span>
                          </div>
                          <p className="mt-1 text-[0.68rem] leading-relaxed text-[color:var(--parchment-dim)]">{skill.description}</p>
                          {(skill.effects as Array<Record<string, unknown>>).length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {(skill.effects as Array<Record<string, unknown>>).map((effect, index) => (
                                <Tag key={index} tone="aether">
                                  {String(effect.type)}{effect.currentValue !== undefined ? ` ${effect.currentValue}` : effect.value !== undefined ? ` ${effect.value}` : ""}{effect.duration ? ` · ${effect.duration} 回合` : ""}
                                </Tag>
                              ))}
                            </div>
                          ) : null}
                          {data.owned ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="mt-2 h-7 border-[color:var(--gold-600)]/50 text-[0.68rem] text-[color:var(--gold-300)]"
                              disabled={maxed || upgradeSkill.isPending}
                              onClick={() => upgradeSkill.mutate({ charKey, skillKey: skill.skillKey, times: 1 })}
                            >
                              {maxed ? "已满级" : `升级（${skill.nextCost.gold} 金币 / ${skill.nextCost.aether} 星辉）`}
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="mt-2 text-[0.62rem] text-[color:var(--parchment-muted)]">技能升级需要图书馆 1 级；装备强化需要工坊 1 级。</p>
              </Panel>
            </TabsContent>

            {/* 装备 */}
            <TabsContent value="equip" className="space-y-3">
              <Panel>
                <SectionTitle eyebrow="Equipment" title="装备栏" action={<span className="text-numeric text-xs text-[color:var(--parchment-muted)]">库存 {data.inventory.length} 件</span>} />
                <GoldRule />
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.equipped.map((slot) => (
                    <div key={slot.slot} className={cn("rounded-sm border p-2.5", slot.playerEquipId ? "border-[color:var(--gold-600)]/60 bg-[color:var(--ink-800)]/60" : "border-dashed border-[color:var(--ink-500)]/60 bg-[color:var(--ink-900)]/40")}>
                      <div className="flex items-center justify-between text-[0.66rem] text-[color:var(--parchment-muted)]">
                        <span>{slot.slotLabel}</span>
                        {slot.rarity ? <RarityBadge rarity={slot.rarity as "R" | "SR" | "SSR"} /> : null}
                      </div>
                      {slot.name ? (
                        <>
                          <div className="mt-1 truncate text-sm text-[color:var(--parchment)]">
                            {slot.name} {slot.level > 1 ? <span className="text-numeric text-[color:var(--gold-300)]">+{slot.level - 1}</span> : null}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {Object.entries(slot.stats as Record<string, number>).map(([key, value]) => (
                              <Tag key={key} tone="gold">{STAT_NAME[key] ?? key} +{value}</Tag>
                            ))}
                          </div>
                          {data.owned ? (
                            <div className="mt-2 flex gap-1.5">
                              <Button size="sm" variant="outline" className="h-7 flex-1 border-[color:var(--ink-500)]/70 text-[0.64rem] text-[color:var(--parchment-dim)]" onClick={() => setEquipSlot(slot.slot)}>更换</Button>
                              <Button size="sm" variant="outline" className="h-7 border-[color:var(--blood)]/50 text-[0.64rem] text-[color:var(--blood)]" onClick={() => equip.mutate({ charKey, playerEquipId: null, slot: slot.slot })}>卸下</Button>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div className="mt-1 text-sm text-[color:var(--parchment-muted)]">空</div>
                          {data.owned ? (
                            <Button size="sm" variant="outline" className="mt-2 h-7 w-full border-[color:var(--ink-500)]/70 text-[0.64rem] text-[color:var(--parchment-dim)]" onClick={() => setEquipSlot(slot.slot)}>装备</Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  ))}
                </div>
                {data.activeSets.length > 0 ? (
                  <>
                    <GoldRule />
                    <div className="text-caption mb-1">套装效果</div>
                    <div className="space-y-1">
                      {data.activeSets.map((set) => (
                        <div key={set.setKey} className="text-[0.68rem]">
                          {set.tiers.map((tier, index) => (
                            <div key={index} className={cn("flex items-center gap-2", tier.active ? "text-[color:var(--gold-300)]" : "text-[color:var(--parchment-muted)]")}>
                              <Shield size={12} />
                              {tier.name}（{tier.pieces} 件）：{Object.entries(tier.stats).map(([key, value]) => `${STAT_NAME[key] ?? key} +${value}`).join(" · ")}
                              {tier.active ? <Tag tone="good">生效</Tag> : null}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </Panel>

              <Panel>
                <SectionTitle eyebrow="Inventory" title="装备库" />
                <GoldRule />
                {data.inventory.length === 0 ? (
                  <EmptyState title="暂无可替换的装备" hint="通过战斗、兑换商店或强化获得新装备。" icon={<Sparkles size={20} />} />
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {data.inventory.filter((item): item is NonNullable<typeof item> => Boolean(item)).map((item) => (
                      <div key={item.playerEquipId} className="rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/50 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm text-[color:var(--parchment)]">
                            {item.name} {item.level > 1 ? <span className="text-numeric text-[color:var(--gold-300)]">+{item.level - 1}</span> : null}
                          </span>
                          <RarityBadge rarity={item.rarity as "R" | "SR" | "SSR"} />
                        </div>
                        <div className="mt-0.5 text-[0.62rem] text-[color:var(--parchment-muted)]">{item.slotLabel} · 需要等级 {item.requiredLevel} · 上限 +{item.maxLevel - 1}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {Object.entries(item.stats as Record<string, number>).map(([key, value]) => (
                            <Tag key={key} tone="gold">{STAT_NAME[key] ?? key} +{value}</Tag>
                          ))}
                        </div>
                        {data.owned ? (
                          <div className="mt-2 flex gap-1.5">
                            <Button size="sm" className="h-7 flex-1 border-transparent text-[0.64rem]" variant="outline" onClick={() => equip.mutate({ charKey, playerEquipId: item.playerEquipId })}>装备</Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 border-[color:var(--aether-500)]/50 text-[0.64rem] text-[color:var(--aether-300)]"
                              disabled={enhance.isPending}
                              onClick={() => enhance.mutate({ playerEquipId: item.playerEquipId, times: 1 })}
                            >
                              强化
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </TabsContent>

            {/* 羁绊 */}
            <TabsContent value="bond" className="space-y-3">
              <Panel>
                <SectionTitle eyebrow="Bond" title="羁绊与好感" action={<span className="text-numeric text-xs text-[color:var(--gold-300)]">羁绊 {data.bondLevel} · 好感 {data.affection}</span>} />
                <GoldRule />
                <p className="mb-3 text-xs leading-relaxed text-[color:var(--parchment-dim)]">
                  羁绊通过交谈、赠礼与共同训练提升；提升后解锁更多台词与个人剧情。本作的亲密表达限于同伴信任、家族羁绊与轻度恋爱，全年龄向。
                </p>
                {data.owned ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    {([
                      { key: "talk", label: "交谈", cost: "免费", tone: "aether" as const },
                      { key: "gift", label: "赠送礼物", cost: "120 金币", tone: "gold" as const },
                      { key: "train", label: "共同训练", cost: "60 金币 / 40 粮食", tone: "neutral" as const },
                    ] as const).map((option) => (
                      <button
                        key={option.key}
                        className="card-tap rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/50 p-3 text-left hover:border-[color:var(--gold-600)]/70"
                        disabled={bond.isPending}
                        onClick={() => bond.mutate({ charKey, interaction: option.key })}
                      >
                        <div className="flex items-center gap-1.5 text-sm text-[color:var(--parchment)]">
                          {option.key === "gift" ? <Gift size={14} className="text-[color:var(--gold-400)]" /> : option.key === "talk" ? <Heart size={14} className="text-[color:var(--aether-300)]" /> : <TrendingUp size={14} />}
                          {option.label}
                        </div>
                        <div className="mt-0.5 text-[0.62rem] text-[color:var(--parchment-muted)]">{option.cost}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState title="尚未招募，无法互动" hint="羁绊互动需要先拥有该角色。" icon={<Heart size={20} />} />
                )}
              </Panel>

              <Panel>
                <SectionTitle eyebrow="Relations" title="人物关系" />
                <GoldRule />
                {data.relations.length === 0 ? (
                  <EmptyState title="暂无记录的关系" icon={<Users size={20} />} />
                ) : (
                  <div className="space-y-2">
                    {data.relations.map((relation) => (
                      <Link key={relation.charKey} href={`/character/${relation.charKey}`} className="card-tap flex items-center gap-3 rounded-sm border border-[color:var(--ink-500)]/50 bg-[color:var(--ink-800)]/45 p-2.5 hover:border-[color:var(--gold-600)]/60">
                        <Avatar src={relation.avatarUrl} name={relation.name} size={38} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm text-[color:var(--parchment)]">{relation.name}</span>
                            <Tag tone="aether">{relation.relation}</Tag>
                          </span>
                          <span className="mt-0.5 block text-[0.68rem] leading-relaxed text-[color:var(--parchment-muted)]">{relation.note}</span>
                        </span>
                      </Link>
                    ))}
                  </div>
                )}
              </Panel>
            </TabsContent>

            {/* 设定 */}
            <TabsContent value="lore" className="space-y-3">
              <Panel>
                <SectionTitle eyebrow="Profile" title="角色设定" />
                <GoldRule />
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-caption mb-1">外貌</div>
                    <p className="leading-relaxed text-[color:var(--parchment-dim)]">{config.appearance}</p>
                  </div>
                  <div>
                    <div className="text-caption mb-1">背景</div>
                    <p className="leading-relaxed text-[color:var(--parchment-dim)]">{config.background}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-caption mb-1">性格</div>
                      <p className="text-xs leading-relaxed text-[color:var(--parchment-dim)]">{config.personality}</p>
                    </div>
                    <div>
                      <div className="text-caption mb-1">个人目标</div>
                      <p className="text-xs leading-relaxed text-[color:var(--parchment-dim)]">{config.goal}</p>
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel>
                <SectionTitle eyebrow="Voice Lines" title="台词" />
                <GoldRule />
                <div className="space-y-3">
                  {Object.entries(config.quotes as Record<string, string[]>).map(([category, lines]) => (
                    <div key={category}>
                      <div className="text-caption mb-1">{category === "battle" ? "战斗" : category === "idle" ? "待机" : category === "bond" ? "羁绊" : category}</div>
                      <div className="space-y-1">
                        {lines.map((line, index) => (
                          <p key={index} className="parchment rounded-sm px-2.5 py-1.5 text-xs leading-relaxed text-[color:var(--parchment-dim)]">「{line}」</p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel>
                <SectionTitle eyebrow="Story State" title="剧情状态" />
                <GoldRule />
                {Object.keys(data.storyState as Record<string, unknown>).length === 0 ? (
                  <p className="text-xs text-[color:var(--parchment-muted)]">该角色的个人剧情尚未推进。在世界地图中完成相关节点后解锁。</p>
                ) : (
                  <pre className="overflow-x-auto rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-950)]/70 p-2.5 text-[0.66rem] text-[color:var(--parchment-dim)]">
                    {JSON.stringify(data.storyState, null, 2)}
                  </pre>
                )}
                <p className="mt-2 flex items-center gap-1.5 text-[0.62rem] text-[color:var(--parchment-muted)]">
                  <BookOpen size={12} />
                  角色播报与议事厅对话会参考这些剧情状态；AI 不得擅自改动角色设定。
                </p>
              </Panel>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* 装备选择弹窗 */}
      <Dialog open={Boolean(equipSlot)} onOpenChange={(open) => { if (!open) setEquipSlot(null); }}>
        <DialogContent className="border-[color:var(--gold-600)]/50 bg-[color:var(--ink-900)] text-[color:var(--parchment)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-display text-[color:var(--parchment)]">选择{equipSlot ? SLOT_NAME[equipSlot] ?? equipSlot : ""}装备</DialogTitle>
          </DialogHeader>
          {equippedInventory.length === 0 ? (
            <EmptyState title="该槽位暂无可用装备" hint="通过战斗掉落或兑换商店获取。" />
          ) : (
            <div className="max-h-[50vh] space-y-2 overflow-y-auto">
              {equippedInventory.map((item) => (
                <button
                  key={item!.playerEquipId}
                  className="card-tap w-full rounded-sm border border-[color:var(--ink-500)]/60 bg-[color:var(--ink-800)]/60 p-2.5 text-left hover:border-[color:var(--gold-600)]/70"
                  onClick={() => equip.mutate({ charKey, playerEquipId: item!.playerEquipId })}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-[color:var(--parchment)]">{item!.name} +{item!.level - 1}</span>
                    <RarityBadge rarity={item!.rarity as "R" | "SR" | "SSR"} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(item!.stats as Record<string, number>).map(([key, value]) => (
                      <Tag key={key} tone="gold">{STAT_NAME[key] ?? key} +{value}</Tag>
                    ))}
                  </div>
                  <div className="mt-1 text-[0.62rem] text-[color:var(--parchment-muted)]">需要等级 {item!.requiredLevel}</div>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageSection>
  );
}
