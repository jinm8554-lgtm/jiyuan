import type { RarityKey, StatKey } from "../formulas";

export type EquipmentSeed = {
  equipKey: string;
  name: string;
  slot: "weapon" | "offhand" | "helmet" | "armor" | "boots" | "accessory";
  rarity: RarityKey;
  requiredLevel: number;
  stats: Partial<Record<StatKey, number>>;
  setKey?: string;
  description: string;
  iconKey: string;
  maxLevel: number;
};

const e = (v: EquipmentSeed) => v;

export const EQUIPMENT_SEEDS: EquipmentSeed[] = [
  /* ------------------------------- 武器 ------------------------------- */
  e({ equipKey: "eq_iron_sword", name: "铁制长剑", slot: "weapon", rarity: "R", requiredLevel: 1, stats: { atk: 26 }, setKey: "set_border_guard", description: "边境守备队的制式长剑，剑身布满细小的修补贴片。", iconKey: "sword", maxLevel: 10 }),
  e({ equipKey: "eq_hunting_bow", name: "猎林短弓", slot: "weapon", rarity: "R", requiredLevel: 1, stats: { atk: 24, spd: 4, crit: 3 }, description: "以银杉木与兽筋制成的短弓，适合在林间穿行。", iconKey: "bow", maxLevel: 10 }),
  e({ equipKey: "eq_apprentice_staff", name: "学徒法杖", slot: "weapon", rarity: "R", requiredLevel: 1, stats: { mag: 27, res: 5 }, description: "学院发放的基础法杖，杖头嵌着一枚微光晶石。", iconKey: "staff", maxLevel: 10 }),
  e({ equipKey: "eq_ironoath_hammer", name: "铁誓战锤", slot: "weapon", rarity: "SR", requiredLevel: 8, stats: { atk: 48, def: 12 }, setKey: "set_iron_oath", description: "铁誓商会护卫队长的战锤，锤面刻着第一条契约的原文。", iconKey: "hammer", maxLevel: 15 }),
  e({ equipKey: "eq_long_song_bow", name: "长歌之弓", slot: "weapon", rarity: "SR", requiredLevel: 8, stats: { atk: 46, spd: 7, crit: 6 }, setKey: "set_sylvan", description: "弓臂以林脉枝条雕成，拉弦时会发出极轻的吟唱。", iconKey: "bow", maxLevel: 15 }),
  e({ equipKey: "eq_observation_staff", name: "观测法杖", slot: "weapon", rarity: "SR", requiredLevel: 8, stats: { mag: 52, spd: 5, hit: 4 }, setKey: "set_astral", description: "杖身嵌有星图残片，会在夜空下自行校准刻度。", iconKey: "staff", maxLevel: 15 }),
  e({ equipKey: "eq_dusk_longsword", name: "余晖长剑", slot: "weapon", rarity: "SSR", requiredLevel: 15, stats: { atk: 72, def: 20, res: 12 }, setKey: "set_valden", description: "瓦尔登家族传承的长剑，刃上有一道无法消除的旧痕。", iconKey: "sword", maxLevel: 20 }),
  e({ equipKey: "eq_unnamed_blade", name: "未名短刃", slot: "weapon", rarity: "SSR", requiredLevel: 15, stats: { atk: 68, crit: 12, critDmg: 20, dodge: 6 }, setKey: "set_unringed", description: "印者第九号的随身短刃，刃面空白，等待被刻上名字。", iconKey: "dagger", maxLevel: 20 }),
  e({ equipKey: "eq_dawnlight_rod", name: "晨露圣杖", slot: "weapon", rarity: "SSR", requiredLevel: 15, stats: { mag: 74, res: 18, hp: 180 }, setKey: "set_kindled", description: "教团圣杖，杖端的水晶会随祷词的温度改变颜色。", iconKey: "staff", maxLevel: 20 }),

  /* ------------------------------- 副手 ------------------------------- */
  e({ equipKey: "eq_wooden_buckler", name: "木盾", slot: "offhand", rarity: "R", requiredLevel: 1, stats: { def: 16, hp: 60 }, description: "边境民兵的木盾，缠着几圈修理用的麻绳。", iconKey: "shield", maxLevel: 10 }),
  e({ equipKey: "eq_valden_tower_shield", name: "余晖塔盾", slot: "offhand", rarity: "SR", requiredLevel: 8, stats: { def: 34, res: 14, hp: 180 }, setKey: "set_valden", description: "塔盾上绘着灰隼纹章，边缘有多次修补的锻痕。", iconKey: "shield", maxLevel: 15 }),
  e({ equipKey: "eq_oath_ledger", name: "契约账册", slot: "offhand", rarity: "SR", requiredLevel: 8, stats: { mag: 30, def: 10, spd: 4 }, setKey: "set_iron_oath", description: "商会账册，记录着每一份仍然有效的契约。", iconKey: "book", maxLevel: 15 }),
  e({ equipKey: "eq_star_chart", name: "星轨卷宗", slot: "offhand", rarity: "SSR", requiredLevel: 15, stats: { mag: 44, res: 20, hit: 8 }, setKey: "set_astral", description: "学院观测台上取下的星图，内容仍在缓慢变化。", iconKey: "scroll", maxLevel: 20 }),

  /* ------------------------------- 头盔 ------------------------------- */
  e({ equipKey: "eq_iron_helm", name: "铁盔", slot: "helmet", rarity: "R", requiredLevel: 1, stats: { def: 14, hp: 70 }, description: "厚重的铁盔，内侧刻着前一位主人的名字。", iconKey: "helmet", maxLevel: 10 }),
  e({ equipKey: "eq_scholar_hood", name: "学者兜帽", slot: "helmet", rarity: "R", requiredLevel: 1, stats: { mag: 14, res: 8, hp: 40 }, description: "厚布兜帽，衬里有方便夹放书签的小袋。", iconKey: "hood", maxLevel: 10 }),
  e({ equipKey: "eq_kindled_circlet", name: "明焰额饰", slot: "helmet", rarity: "SSR", requiredLevel: 15, stats: { mag: 36, res: 22, hp: 220 }, setKey: "set_kindled", description: "圣焰教团的额饰，正中嵌着一枚永不熄灭的小火种。", iconKey: "circlet", maxLevel: 20 }),

  /* ------------------------------- 护甲 ------------------------------- */
  e({ equipKey: "eq_padded_jerkin", name: "填絮护甲", slot: "armor", rarity: "R", requiredLevel: 1, stats: { def: 20, hp: 120 }, description: "厚布填絮的护甲，穿着舒适但不耐久战。", iconKey: "armor", maxLevel: 10 }),
  e({ equipKey: "eq_valden_plate", name: "灰隼板甲", slot: "armor", rarity: "SSR", requiredLevel: 15, stats: { def: 62, res: 20, hp: 520 }, setKey: "set_valden", description: "瓦尔登家族的板甲，胸前纹章被重新打磨过。", iconKey: "armor", maxLevel: 20 }),
  e({ equipKey: "eq_rootweave_robe", name: "根织长袍", slot: "armor", rarity: "SR", requiredLevel: 8, stats: { def: 26, res: 30, mag: 18, hp: 260 }, setKey: "set_sylvan", description: "以林脉纤维编成的长袍，会随季节缓慢改变纹路。", iconKey: "robe", maxLevel: 15 }),
  e({ equipKey: "eq_gorget_cloak", name: "无冕斗篷", slot: "armor", rarity: "SR", requiredLevel: 8, stats: { dodge: 12, spd: 8, hp: 220 }, setKey: "set_unringed", description: "不起眼的深色斗篷，能让人在人群中消失。", iconKey: "cloak", maxLevel: 15 }),

  /* ------------------------------- 靴子 ------------------------------- */
  e({ equipKey: "eq_marching_boots", name: "行军短靴", slot: "boots", rarity: "R", requiredLevel: 1, stats: { spd: 8, def: 6 }, description: "走过多条商路的旧靴，鞋底换过三次。", iconKey: "boots", maxLevel: 10 }),
  e({ equipKey: "eq_silent_treads", name: "无声踏靴", slot: "boots", rarity: "SR", requiredLevel: 8, stats: { spd: 14, dodge: 10, crit: 4 }, setKey: "set_unringed", description: "靴底以暗影织线缝合，落地时几乎无声。", iconKey: "boots", maxLevel: 15 }),
  e({ equipKey: "eq_skyline_greaves", name: "星轨胫甲", slot: "boots", rarity: "SSR", requiredLevel: 15, stats: { spd: 22, hit: 10, mag: 20 }, setKey: "set_astral", description: "刻有星轨刻度的胫甲，据说是为了在裂隙中辨认方向而制。", iconKey: "greaves", maxLevel: 20 }),

  /* ------------------------------ 饰品 ------------------------------- */
  e({ equipKey: "eq_heraldic_ring", name: "纹章指环", slot: "accessory", rarity: "R", requiredLevel: 1, stats: { atk: 10, mag: 10, hp: 40 }, description: "刻着简化灰隼纹的指环，守备队每人一枚。", iconKey: "ring", maxLevel: 10 }),
  e({ equipKey: "eq_wax_seal_charm", name: "蜡封护符", slot: "accessory", rarity: "SR", requiredLevel: 8, stats: { res: 16, hit: 8, hp: 120 }, setKey: "set_iron_oath", description: "以商会印鉴蜡封制成的护符，象征契约的效力。", iconKey: "charm", maxLevel: 15 }),
  e({ equipKey: "eq_songleaf_pendant", name: "歌叶吊坠", slot: "accessory", rarity: "SR", requiredLevel: 8, stats: { spd: 10, crit: 8, mag: 18 }, setKey: "set_sylvan", description: "一枚保持翠绿的叶片，贴近耳边时可以听见远处的歌声。", iconKey: "pendant", maxLevel: 15 }),
  e({ equipKey: "eq_aether_core", name: "星辉核心", slot: "accessory", rarity: "SSR", requiredLevel: 15, stats: { mag: 40, res: 24, crit: 10, critDmg: 18 }, setKey: "set_astral", description: "从裂隙边缘带回的晶体核心，内部光点以固定节奏明灭。", iconKey: "crystal", maxLevel: 20 }),
  e({ equipKey: "eq_promises_knot", name: "誓约结", slot: "accessory", rarity: "SSR", requiredLevel: 15, stats: { atk: 34, def: 24, hp: 300, res: 14 }, setKey: "set_valden", description: "以七种颜色的线编成的结，每一种代表一位同伴的承诺。", iconKey: "knot", maxLevel: 20 }),
  e({ equipKey: "eq_kindled_lantern", name: "不熄提灯", slot: "accessory", rarity: "SR", requiredLevel: 8, stats: { mag: 24, res: 18, hp: 160 }, setKey: "set_kindled", description: "巡回医者的提灯，风雨中也不曾熄灭。", iconKey: "lantern", maxLevel: 15 }),
];

export const SET_BONUSES: Record<string, { name: string; pieces: number; stats: Partial<Record<StatKey, number>> }[]> = {
  set_valden: [
    { name: "灰隼守誓", pieces: 2, stats: { def: 20, hp: 200 } },
    { name: "灰隼守誓", pieces: 4, stats: { atk: 30, res: 20 } },
  ],
  set_astral: [
    { name: "星轨观测", pieces: 2, stats: { mag: 30, hit: 10 } },
    { name: "星轨观测", pieces: 4, stats: { crit: 10, spd: 12 } },
  ],
  set_sylvan: [
    { name: "林脉共鸣", pieces: 2, stats: { spd: 12, dodge: 8 } },
    { name: "林脉共鸣", pieces: 4, stats: { mag: 24, res: 18 } },
  ],
  set_iron_oath: [
    { name: "铁誓契约", pieces: 2, stats: { def: 18, hp: 180 } },
    { name: "铁誓契约", pieces: 4, stats: { atk: 26, crit: 8 } },
  ],
  set_unringed: [
    { name: "无冕之行", pieces: 2, stats: { dodge: 12, spd: 10 } },
    { name: "无冕之行", pieces: 4, stats: { crit: 14, critDmg: 24 } },
  ],
  set_kindled: [
    { name: "明焰守护", pieces: 2, stats: { hp: 260, res: 16 } },
    { name: "明焰守护", pieces: 4, stats: { mag: 30, res: 24 } },
  ],
  set_border_guard: [{ name: "边境守备", pieces: 2, stats: { def: 10, hp: 100 } }],
};

export const EQUIP_BY_KEY = new Map(EQUIPMENT_SEEDS.map((item) => [item.equipKey, item]));
export const SLOT_LABEL: Record<EquipmentSeed["slot"], string> = {
  weapon: "武器",
  offhand: "副手",
  helmet: "头盔",
  armor: "护甲",
  boots: "靴子",
  accessory: "饰品",
};