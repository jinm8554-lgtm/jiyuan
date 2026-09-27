import type { ElementKey, JobKey, RarityKey, StatKey } from "../formulas";
import { REGION_ASSETS } from "./assets";

/* ============================ 敌人模板 ============================ */

export type EnemySpec = {
  id: string;
  name: string;
  job: JobKey;
  element: ElementKey;
  rarity: RarityKey;
  level: number;
  stats: Record<StatKey, number>;
  skillKeys: string[];
  /** 图鉴风格一句话（GM 后台可编辑） */
  note: string;
};

const ENEMY_STAT_BASE: Record<JobKey, Record<StatKey, number>> = {
  warrior: { hp: 900, atk: 86, def: 76, mag: 20, res: 52, spd: 58, crit: 6, critDmg: 50, hit: 86, dodge: 4 },
  knight: { hp: 1150, atk: 74, def: 96, mag: 24, res: 66, spd: 52, crit: 5, critDmg: 50, hit: 84, dodge: 3 },
  mage: { hp: 640, atk: 40, def: 48, mag: 108, res: 74, spd: 68, crit: 8, critDmg: 52, hit: 92, dodge: 6 },
  ranger: { hp: 700, atk: 98, def: 50, mag: 40, res: 56, spd: 84, crit: 12, critDmg: 54, hit: 96, dodge: 10 },
  cleric: { hp: 760, atk: 46, def: 56, mag: 96, res: 84, spd: 70, crit: 5, critDmg: 50, hit: 92, dodge: 6 },
  assassin: { hp: 660, atk: 112, def: 48, mag: 40, res: 52, spd: 92, crit: 16, critDmg: 62, hit: 94, dodge: 12 },
  sage: { hp: 720, atk: 50, def: 58, mag: 92, res: 78, spd: 82, crit: 8, critDmg: 50, hit: 94, dodge: 8 },
};

const ENEMY_SKILLS: Record<JobKey, string[]> = {
  warrior: ["sk_cleave_strike"],
  knight: ["sk_take_the_blow"],
  mage: ["sk_frost_script"],
  ranger: ["sk_accurate_shot"],
  cleric: ["sk_dawn_dew"],
  assassin: ["sk_shadow_raid"],
  sage: ["sk_root_bind"],
};

/** 敌人属性随等级成长（与角色公式分离，敌人使用更平缓的曲线） */
export function enemy(id: string, name: string, job: JobKey, element: ElementKey, level: number, note: string): EnemySpec {
  const base = ENEMY_STAT_BASE[job];
  const scale = 1 + (level - 1) * 0.145;
  const stats = {} as Record<StatKey, number>;
  for (const [key, value] of Object.entries(base) as Array<[StatKey, number]>) {
    stats[key] = Math.round(key === "crit" || key === "critDmg" || key === "hit" || key === "dodge" ? value * (1 + (level - 1) * 0.02) : value * scale);
  }
  return {
    id,
    name,
    job,
    element,
    rarity: level >= 26 ? "SSR" : level >= 14 ? "SR" : "R",
    level,
    stats,
    skillKeys: ENEMY_SKILLS[job],
    note,
  };
}

/* ============================ 区域 ============================ */

export type RegionSeed = {
  regionKey: string;
  name: string;
  subtitle: string;
  dangerTier: number;
  faction: string;
  description: string;
  mapX: number;
  mapY: number;
  sortOrder: number;
  unlock: Record<string, unknown>;
  /** 区域插画（可选，上传至对象存储后的路径） */
  artUrl?: string;
};

const REGION_BASE: RegionSeed[] = [
  {
    regionKey: "silverpine",
    name: "银杉边境",
    subtitle: "灰隼之地",
    dangerTier: 1,
    faction: "凯尔文尼亚余境",
    description: "玩家的封地。银杉林、废耕的麦田、被劫掠的商道，以及一座半塌的城堡。这里的人还在等一个愿意留下的人。",
    mapX: 26,
    mapY: 62,
    sortOrder: 1,
    unlock: {},
  },
  {
    regionKey: "ashenfield",
    name: "灰烬平原",
    subtitle: "断旗之地",
    dangerTier: 2,
    faction: "无主",
    description: "盐铁战争的旧战场。锈蚀的旗杆插满大地，风吹过时会发出类似叹息的声音。蚀影在这里格外密集——它们是被遗忘的士兵。",
    mapX: 46,
    mapY: 68,
    sortOrder: 2,
    unlock: { nodeKey: "sp_fort_ruin", renown: 120 },
  },
  {
    regionKey: "sylvan",
    name: "森语秘境",
    subtitle: "长歌之林",
    dangerTier: 2,
    faction: "森语者联盟",
    description: "千年古木遮天蔽日，小径会在夜里移动。林脉对闯入者有自己的判断标准：你是否尊重过这片土地。",
    mapX: 34,
    mapY: 36,
    sortOrder: 3,
    unlock: { chapter: 2, charKey: "liesel" },
  },
  {
    regionKey: "tidevale",
    name: "潮汐矿谷",
    subtitle: "铁誓之脉",
    dangerTier: 3,
    faction: "铁誓商会",
    description: "被掏空的山腹里水声轰鸣，水力锻锤日夜不停。这里的一切都可以谈，只要你能守住约定。",
    mapX: 62,
    mapY: 44,
    sortOrder: 4,
    unlock: { chapter: 2, minSrCharacters: 3 },
  },
  {
    regionKey: "starfall",
    name: "星陨裂谷",
    subtitle: "伤口",
    dangerTier: 4,
    faction: "无主",
    description: "裂隙最深的地方。星辉结晶成片生长，空间在这里折叠错位。走进去的人说，他们听见了别人的记忆。",
    mapX: 70,
    mapY: 24,
    sortOrder: 5,
    unlock: { chapter: 4, power: 5200 },
  },
  {
    regionKey: "hightower",
    name: "高塔城废墟",
    subtitle: "王座之影",
    dangerTier: 5,
    faction: "凯尔文尼亚余境",
    description: "陷落的王都。钟塔仍在报时，只是没有人在意时辰。议会厅的桌上还摊开着七年前没写完的那份议程。",
    mapX: 86,
    mapY: 52,
    sortOrder: 6,
    unlock: { chapter: 5, controlPercent: 60 },
  },
];
/** 自动绑定原创区域插画（assets.ts），区域数据无需重复维护图片路径 */
export const REGION_SEEDS: RegionSeed[] = REGION_BASE.map((region) => ({
  ...region,
  artUrl: region.artUrl ?? REGION_ASSETS[region.regionKey] ?? undefined,
}));

/* ============================ 节点 ============================ */

export type NodeSeed = {
  nodeKey: string;
  regionKey: string;
  name: string;
  nodeType: "village" | "town" | "fort" | "ruin" | "wild" | "rift" | "trade";
  levelMin: number;
  levelMax: number;
  enemyWave: EnemySpec[];
  rewards: Record<string, unknown>;
  firstClearRewards: Record<string, unknown>;
  unlock: Record<string, unknown>;
  storyKey?: string;
  tradeYield: Record<string, number>;
  controlWeight: number;
  requiredClears: number;
  staminaCost: number;
  mapX: number;
  mapY: number;
  sortOrder: number;
};

/** 战斗奖励以单抽成本的十分之一到一倍多为主，首通仍通过原始档位体现优势。 */
const rewards = (gold: number, exp: number, aether: number, renown: number, items: Array<{ equipKey: string; chance: number }> = []) => ({
  gold,
  exp,
  aether: Math.max(1, Math.round(aether / 10)),
  renown,
  items,
});

export const NODE_SEEDS: NodeSeed[] = [
  /* ------------------------- 银杉边境 silverpine ------------------------- */
  {
    nodeKey: "sp_keep_road", regionKey: "silverpine", name: "城堡外的商道", nodeType: "wild", levelMin: 1, levelMax: 3,
    enemyWave: [enemy("e_bandit_scout", "失序盗匪·斥候", "ranger", "physical", 2, "商路断绝后落草的前农户，武器是削尖的农具。"), enemy("e_bandit_brute", "失序盗匪·力夫", "warrior", "physical", 2, "为了喂饱村子而拦路的壮汉，喊得凶，手会抖。")],
    rewards: rewards(120, 180, 2, 6, [{ equipKey: "eq_iron_sword", chance: 0.18 }]),
    firstClearRewards: rewards(200, 240, 4, 12, [{ equipKey: "eq_marching_boots", chance: 1 }]),
    unlock: { chapter: 0 }, tradeYield: {}, controlWeight: 1, requiredClears: 2, staminaCost: 4, mapX: 24, mapY: 62, sortOrder: 1,
  },
  {
    nodeKey: "sp_ruined_field", regionKey: "silverpine", name: "废弃麦田", nodeType: "wild", levelMin: 2, levelMax: 4,
    enemyWave: [enemy("e_silver_wolf", "银杉狼", "assassin", "physical", 3, "被裂隙惊扰的狼群，毛色泛着淡青。"), enemy("e_aether_mote", "逸散星辉", "mage", "lightning", 3, "未成形的星辉团块，会模仿靠近者的动作。")],
    rewards: rewards(160, 220, 4, 8, [{ equipKey: "eq_hunting_bow", chance: 0.16 }]),
    firstClearRewards: rewards(240, 300, 6, 14, []),
    unlock: { nodeKey: "sp_keep_road" }, tradeYield: {}, controlWeight: 1, requiredClears: 2, staminaCost: 4, mapX: 21, mapY: 56, sortOrder: 2,
  },
  {
    nodeKey: "sp_silk_road", regionKey: "silverpine", name: "被劫的商路", nodeType: "trade", levelMin: 3, levelMax: 6,
    enemyWave: [enemy("e_raider_leader", "盗匪头目·独轮", "warrior", "physical", 5, "推着一辆独轮车抢劫的男人，车比刀更像武器。"), enemy("e_bandit_scout", "失序盗匪·斥候", "ranger", "physical", 4, "负责放哨的瘦小身影。")],
    rewards: rewards(240, 300, 6, 12, [{ equipKey: "eq_padded_jerkin", chance: 0.15 }, { equipKey: "eq_heraldic_ring", chance: 0.12 }]),
    firstClearRewards: rewards(360, 420, 10, 22, [{ equipKey: "eq_wooden_buckler", chance: 1 }]),
    unlock: { nodeKey: "sp_ruined_field" }, storyKey: "story_ch1_silk_road", tradeYield: { gold: 26, food: 14 }, controlWeight: 2, requiredClears: 3, staminaCost: 5, mapX: 29, mapY: 68, sortOrder: 3,
  },
  {
    nodeKey: "sp_old_watchtower", regionKey: "silverpine", name: "旧哨塔", nodeType: "ruin", levelMin: 5, levelMax: 9,
    enemyWave: [enemy("e_wraith_soldier", "蚀影·守塔兵", "knight", "shadow", 7, "仍然在执行一个早已取消的命令。"), enemy("e_wraith_whisper", "蚀影·低语者", "mage", "shadow", 7, "不断重复着某个人名字的残影。"), enemy("e_aether_mote", "逸散星辉", "sage", "lightning", 6, "漫无目的漂浮的光点。")],
    rewards: rewards(320, 420, 8, 16, [{ equipKey: "eq_iron_helm", chance: 0.18 }]),
    firstClearRewards: rewards(480, 560, 14, 26, [{ equipKey: "eq_scholar_hood", chance: 1 }]),
    unlock: { nodeKey: "sp_silk_road" }, storyKey: "story_ch1_watchtower", tradeYield: {}, controlWeight: 2, requiredClears: 3, staminaCost: 6, mapX: 33, mapY: 50, sortOrder: 4,
  },
  {
    nodeKey: "sp_silver_pine_grove", regionKey: "silverpine", name: "银杉林道", nodeType: "wild", levelMin: 7, levelMax: 12,
    enemyWave: [enemy("e_rust_armor", "蚀影·锈甲", "knight", "shadow", 10, "披着锈蚀甲片的记忆残渣，走路会掉下碎屑。"), enemy("e_whisper_choir", "蚀影·窃声", "assassin", "shadow", 10, "会模仿同伴声音的残影，靠声音靠近你。"), enemy("e_aether_mote", "逸散星辉", "mage", "lightning", 9, "越靠近裂隙越亮的光团。")],
    rewards: rewards(420, 520, 12, 20, [{ equipKey: "eq_iron_helm", chance: 0.17 }, { equipKey: "eq_heraldic_ring", chance: 0.14 }]),
    firstClearRewards: rewards(600, 700, 18, 32, [{ equipKey: "eq_apprentice_staff", chance: 1 }]),
    unlock: { nodeKey: "sp_old_watchtower" }, tradeYield: {}, controlWeight: 2, requiredClears: 3, staminaCost: 6, mapX: 22, mapY: 44, sortOrder: 5,
  },
  {
    nodeKey: "sp_fort_ruin", regionKey: "silverpine", name: "断桥堡", nodeType: "fort", levelMin: 10, levelMax: 15,
    enemyWave: [enemy("e_wraith_captain", "蚀影·断桥官", "knight", "shadow", 13, "仍在要求过桥者出示通行证的军官残影。"), enemy("e_wraith_soldier", "蚀影·守塔兵", "warrior", "shadow", 13, "忠于命令直到消散。"), enemy("e_whisper_choir", "蚀影·窃声", "assassin", "shadow", 12, "在桥洞里等待回声的残影。"), enemy("e_wraith_whisper", "蚀影·低语者", "cleric", "shadow", 12, "试图为同伴祈祷却记不起祷词。")],
    rewards: rewards(560, 700, 18, 28, [{ equipKey: "eq_ironoath_hammer", chance: 0.06 }, { equipKey: "eq_iron_helm", chance: 0.15 }]),
    firstClearRewards: rewards(900, 1000, 30, 40, [{ equipKey: "eq_valden_tower_shield", chance: 1 }]),
    unlock: { nodeKey: "sp_silver_pine_grove" }, storyKey: "story_ch1_fort", tradeYield: { gold: 20 }, controlWeight: 3, requiredClears: 3, staminaCost: 8, mapX: 30, mapY: 38, sortOrder: 6,
  },

  /* ------------------------- 灰烬平原 ashenfield ------------------------- */
  {
    nodeKey: "af_rust_banner", regionKey: "ashenfield", name: "锈旗坡", nodeType: "wild", levelMin: 10, levelMax: 16,
    enemyWave: [enemy("e_wraith_banner", "蚀影·旗手", "warrior", "shadow", 13, "举着一面早已看不清纹章的旗。"), enemy("e_rust_armor", "蚀影·锈甲", "knight", "shadow", 13, "甲片缝里长出了草。")],
    rewards: rewards(480, 620, 12, 22, [{ equipKey: "eq_iron_helm", chance: 0.16 }]),
    firstClearRewards: rewards(700, 800, 20, 34, []),
    unlock: { nodeKey: "sp_fort_ruin" }, storyKey: "story_ch2_banner", tradeYield: {}, controlWeight: 1, requiredClears: 3, staminaCost: 6, mapX: 44, mapY: 66, sortOrder: 1,
  },
  {
    nodeKey: "af_abandoned_camp", regionKey: "ashenfield", name: "弃营", nodeType: "ruin", levelMin: 12, levelMax: 18,
    enemyWave: [enemy("e_wraith_quartermaster", "蚀影·辎重官", "sage", "shadow", 15, "仍在清点一批永远不会到达的补给。"), enemy("e_rust_armor", "蚀影·锈甲", "knight", "shadow", 15, "守着空粮车的护卫。"), enemy("e_whisper_choir", "蚀影·窃声", "assassin", "shadow", 14, "翻找着别人的包裹。")],
    rewards: rewards(560, 720, 14, 24, [{ equipKey: "eq_ironoath_hammer", chance: 0.06 }]),
    firstClearRewards: rewards(820, 900, 24, 36, [{ equipKey: "eq_wax_seal_charm", chance: 1 }]),
    unlock: { nodeKey: "af_rust_banner" }, tradeYield: { iron: 8 }, controlWeight: 2, requiredClears: 3, staminaCost: 7, mapX: 47, mapY: 72, sortOrder: 2,
  },
  {
    nodeKey: "af_dry_well", regionKey: "ashenfield", name: "枯井村", nodeType: "village", levelMin: 13, levelMax: 20,
    enemyWave: [enemy("e_wraith_child", "蚀影·井边童影", "cleric", "shadow", 16, "并非恶意，只是想让路过的人听完一首歌。"), enemy("e_wraith_whisper", "蚀影·低语者", "mage", "shadow", 16, "声音从井底升上来。"), enemy("e_rust_armor", "蚀影·锈甲", "warrior", "shadow", 16, "曾经是村里的护院。")],
    rewards: rewards(640, 820, 16, 28, [{ equipKey: "eq_kindled_lantern", chance: 0.06 }]),
    firstClearRewards: rewards(920, 1000, 26, 42, [{ equipKey: "eq_padded_jerkin", chance: 1 }]),
    unlock: { nodeKey: "af_abandoned_camp" }, storyKey: "story_ch2_dry_well", tradeYield: { food: 12 }, controlWeight: 2, requiredClears: 3, staminaCost: 7, mapX: 41, mapY: 76, sortOrder: 3,
  },
  {
    nodeKey: "af_broken_standard", regionKey: "ashenfield", name: "断旗岗", nodeType: "fort", levelMin: 16, levelMax: 23,
    enemyWave: [enemy("e_wraith_standard", "蚀影·掌旗官", "knight", "shadow", 19, "他的旗断了，但他还站在原地。"), enemy("e_wraith_banner", "蚀影·旗手", "warrior", "shadow", 19, "试图把断旗接回去。"), enemy("e_whisper_choir", "蚀影·窃声", "assassin", "shadow", 18, "复述着最后的号令。"), enemy("e_wraith_whisper", "蚀影·低语者", "sage", "shadow", 18, "把命令念成了挽歌。")],
    rewards: rewards(760, 960, 20, 32, [{ equipKey: "eq_valden_tower_shield", chance: 0.06 }, { equipKey: "eq_iron_helm", chance: 0.14 }]),
    firstClearRewards: rewards(1100, 1200, 34, 48, [{ equipKey: "eq_skyline_greaves", chance: 0.3 }]),
    unlock: { nodeKey: "af_dry_well" }, tradeYield: {}, controlWeight: 3, requiredClears: 3, staminaCost: 8, mapX: 50, mapY: 62, sortOrder: 4,
  },
  {
    nodeKey: "af_old_field_center", regionKey: "ashenfield", name: "旧战场中心", nodeType: "ruin", levelMin: 19, levelMax: 26,
    enemyWave: [enemy("e_wraith_host", "蚀影·万人形", "warrior", "shadow", 22, "由无数记忆碎片勉强拼成的人形，动作并不协调。"), enemy("e_wraith_chorus", "蚀影·合声", "mage", "shadow", 22, "很多声音同时说话，听不清任何一句。"), enemy("e_rust_armor", "蚀影·锈甲", "knight", "shadow", 21, "它的盾上刻满了名字。"), enemy("e_whisper_choir", "蚀影·窃声", "assassin", "shadow", 21, "在背后叫你的名字。")],
    rewards: rewards(900, 1100, 24, 36, [{ equipKey: "eq_long_song_bow", chance: 0.05 }]),
    firstClearRewards: rewards(1300, 1500, 40, 55, [{ equipKey: "eq_rootweave_robe", chance: 0.4 }]),
    unlock: { nodeKey: "af_broken_standard" }, storyKey: "story_ch2_field", tradeYield: {}, controlWeight: 3, requiredClears: 4, staminaCost: 9, mapX: 52, mapY: 74, sortOrder: 5,
  },
  {
    nodeKey: "af_flag_bearer_tomb", regionKey: "ashenfield", name: "旗手之墓", nodeType: "ruin", levelMin: 22, levelMax: 30,
    enemyWave: [enemy("e_wraith_memory", "蚀影·留存者", "knight", "holy", 26, "不是敌人，只是想被记住。它坚持战斗，是因为没人愿意听它说完。"), enemy("e_wraith_host", "蚀影·万人形", "warrior", "shadow", 26, "仍在行军。"), enemy("e_aether_warden", "星辉守卫", "sage", "lightning", 26, "由裂隙自行凝聚的守卫。"), enemy("e_wraith_chorus", "蚀影·合声", "cleric", "shadow", 25, "为死者唱着没有词的歌。")],
    rewards: rewards(1100, 1400, 30, 42, [{ equipKey: "eq_star_chart", chance: 0.05 }]),
    firstClearRewards: rewards(1600, 1800, 50, 65, [{ equipKey: "eq_promises_knot", chance: 0.3 }]),
    unlock: { nodeKey: "af_old_field_center" }, storyKey: "story_ch2_tomb", tradeYield: { renown: 2 }, controlWeight: 4, requiredClears: 4, staminaCost: 10, mapX: 46, mapY: 56, sortOrder: 6,
  },

  /* ------------------------- 森语秘境 sylvan ------------------------- */
  {
    nodeKey: "sv_forest_edge", regionKey: "sylvan", name: "林缘哨所", nodeType: "village", levelMin: 12, levelMax: 18,
    enemyWave: [enemy("e_thorn_beast", "棘刺兽", "warrior", "physical", 15, "受裂隙惊扰的林地生物。"), enemy("e_root_stalker", "根须潜行者", "assassin", "physical", 15, "与树根同色的猎手。")],
    rewards: rewards(560, 700, 16, 26, [{ equipKey: "eq_songleaf_pendant", chance: 0.05 }]),
    firstClearRewards: rewards(840, 900, 26, 38, [{ equipKey: "eq_hunting_bow", chance: 1 }]),
    unlock: {}, tradeYield: { wood: 14, food: 8 }, controlWeight: 1, requiredClears: 3, staminaCost: 6, mapX: 30, mapY: 40, sortOrder: 1,
  },
  {
    nodeKey: "sv_moss_path", regionKey: "sylvan", name: "苔径", nodeType: "wild", levelMin: 15, levelMax: 22,
    enemyWave: [enemy("e_root_stalker", "根须潜行者", "assassin", "frost", 18, "小径会自己移动，它们跟着一起移动。"), enemy("e_thorn_beast", "棘刺兽", "knight", "physical", 18, "护着一窝幼兽。"), enemy("e_aether_mote", "逸散星辉", "mage", "lightning", 17, "在苔藓上留下发光脚印。")],
    rewards: rewards(640, 820, 20, 30, [{ equipKey: "eq_rootweave_robe", chance: 0.06 }]),
    firstClearRewards: rewards(960, 1050, 30, 42, []),
    unlock: { nodeKey: "sv_forest_edge" }, tradeYield: {}, controlWeight: 2, requiredClears: 3, staminaCost: 7, mapX: 34, mapY: 33, sortOrder: 2,
  },
  {
    nodeKey: "sv_old_grove", regionKey: "sylvan", name: "古树环", nodeType: "ruin", levelMin: 18, levelMax: 25,
    enemyWave: [enemy("e_grove_warden", "树环守卫", "knight", "frost", 21, "由古树意志凝聚的守卫，只测试来访者的耐心。"), enemy("e_thorn_beast", "棘刺兽", "ranger", "physical", 21, "在树冠间跳跃。"), enemy("e_wraith_chorus", "蚀影·合声", "mage", "shadow", 20, "被树环拦下的记忆。")],
    rewards: rewards(760, 960, 24, 34, [{ equipKey: "eq_songleaf_pendant", chance: 0.08 }]),
    firstClearRewards: rewards(1140, 1250, 36, 48, [{ equipKey: "eq_oath_ledger", chance: 0.25 }]),
    unlock: { nodeKey: "sv_moss_path" }, storyKey: "story_ch3_grove", tradeYield: {}, controlWeight: 2, requiredClears: 3, staminaCost: 8, mapX: 30, mapY: 26, sortOrder: 3,
  },
  {
    nodeKey: "sv_singer_stone", regionKey: "sylvan", name: "歌者石台", nodeType: "ruin", levelMin: 21, levelMax: 28,
    enemyWave: [enemy("e_song_echo", "歌之回声", "sage", "holy", 24, "一首没唱完的歌自己站了起来。"), enemy("e_grove_warden", "树环守卫", "warrior", "frost", 24, "守护着石台。"), enemy("e_wraith_whisper", "蚀影·低语者", "assassin", "shadow", 23, "试图补上缺失的那一段。")],
    rewards: rewards(900, 1100, 28, 38, [{ equipKey: "eq_long_song_bow", chance: 0.07 }]),
    firstClearRewards: rewards(1300, 1400, 44, 54, [{ equipKey: "eq_star_chart", chance: 0.2 }]),
    unlock: { nodeKey: "sv_old_grove" }, storyKey: "story_ch3_singer", tradeYield: {}, controlWeight: 3, requiredClears: 4, staminaCost: 9, mapX: 38, mapY: 22, sortOrder: 4,
  },
  {
    nodeKey: "sv_heartwood", regionKey: "sylvan", name: "林脉核心", nodeType: "rift", levelMin: 24, levelMax: 32,
    enemyWave: [enemy("e_rift_bloom", "裂隙花簇", "mage", "frost", 27, "在裂隙边缘开出的花，会主动靠近温暖的东西。"), enemy("e_aether_warden", "星辉守卫", "knight", "lightning", 27, "裂隙的自发防卫。"), enemy("e_grove_warden", "树环守卫", "sage", "frost", 27, "林脉自己的意志。"), enemy("e_song_echo", "歌之回声", "cleric", "holy", 26, "唱着林脉的名字。")],
    rewards: rewards(1100, 1350, 34, 44, [{ equipKey: "eq_skyline_greaves", chance: 0.07 }]),
    firstClearRewards: rewards(1600, 1750, 52, 62, [{ equipKey: "eq_observation_staff", chance: 0.35 }]),
    unlock: { nodeKey: "sv_singer_stone" }, storyKey: "story_ch3_heartwood", tradeYield: { aether: 0.3 }, controlWeight: 3, requiredClears: 4, staminaCost: 10, mapX: 26, mapY: 30, sortOrder: 5,
  },
  {
    nodeKey: "sv_concord_hall", regionKey: "sylvan", name: "森语议会", nodeType: "fort", levelMin: 27, levelMax: 35,
    enemyWave: [enemy("e_rift_avatar", "裂隙拟态", "warrior", "shadow", 31, "模仿了来访者中最强的那一位。"), enemy("e_thorn_beast", "棘刺兽", "assassin", "physical", 31, "成群出现。"), enemy("e_grove_warden", "树环守卫", "knight", "frost", 30, "最后的防线。"), enemy("e_song_echo", "歌之回声", "sage", "holy", 30, "唱着议会的开场词。")],
    rewards: rewards(1300, 1600, 40, 50, [{ equipKey: "eq_aether_core", chance: 0.06 }]),
    firstClearRewards: rewards(1900, 2100, 60, 72, [{ equipKey: "eq_dawnlight_rod", chance: 0.25 }]),
    unlock: { nodeKey: "sv_heartwood" }, storyKey: "story_ch3_concord", tradeYield: { wood: 20, aether: 0.2 }, controlWeight: 4, requiredClears: 4, staminaCost: 11, mapX: 42, mapY: 30, sortOrder: 6,
  },

  /* ------------------------ 潮汐矿谷 tidevale ------------------------ */
  {
    nodeKey: "tv_market_mouth", regionKey: "tidevale", name: "矿口集市", nodeType: "trade", levelMin: 16, levelMax: 23,
    enemyWave: [enemy("e_market_brawler", "集市斗殴者", "warrior", "physical", 19, "喝多了麦酒的铁匠学徒。"), enemy("e_oath_enforcer", "铁誓执法者", "knight", "physical", 19, "来维持秩序的商会护卫。")],
    rewards: rewards(760, 900, 18, 30, [{ equipKey: "eq_oath_ledger", chance: 0.08 }]),
    firstClearRewards: rewards(1140, 1200, 30, 46, [{ equipKey: "eq_wax_seal_charm", chance: 1 }]),
    unlock: {}, tradeYield: { iron: 18, gold: 22 }, controlWeight: 1, requiredClears: 3, staminaCost: 6, mapX: 60, mapY: 46, sortOrder: 1,
  },
  {
    nodeKey: "tv_water_works", regionKey: "tidevale", name: "水力锻场", nodeType: "town", levelMin: 19, levelMax: 26,
    enemyWave: [enemy("e_runaway_golem", "失控锻炉机偶", "knight", "physical", 22, "水力驱动的锻锤失去制动，仍在工作。"), enemy("e_market_brawler", "集市斗殴者", "ranger", "physical", 22, "趁乱想偷走矿石的人。"), enemy("e_aether_mote", "逸散星辉", "mage", "lightning", 21, "被锻锤火花吸引聚集。")],
    rewards: rewards(900, 1100, 24, 34, [{ equipKey: "eq_ironoath_hammer", chance: 0.08 }]),
    firstClearRewards: rewards(1300, 1400, 38, 52, [{ equipKey: "eq_valden_plate", chance: 0.2 }]),
    unlock: { nodeKey: "tv_market_mouth" }, storyKey: "story_ch4_forge", tradeYield: { iron: 22 }, controlWeight: 2, requiredClears: 3, staminaCost: 8, mapX: 64, mapY: 40, sortOrder: 2,
  },
  {
    nodeKey: "tv_collapsed_shaft", regionKey: "tidevale", name: "坍塌坑道", nodeType: "ruin", levelMin: 22, levelMax: 29,
    enemyWave: [enemy("e_shaft_crawler", "坑道爬行者", "assassin", "physical", 25, "长期生活在黑暗中，怕光。"), enemy("e_runaway_golem", "失控锻炉机偶", "warrior", "physical", 25, "在坑道里乱撞。"), enemy("e_wraith_miner", "蚀影·矿工", "sage", "shadow", 24, "仍在敲打一处早已塌方的矿脉。")],
    rewards: rewards(1000, 1250, 28, 38, [{ equipKey: "eq_aether_core", chance: 0.05 }]),
    firstClearRewards: rewards(1500, 1600, 44, 58, []),
    unlock: { nodeKey: "tv_water_works" }, storyKey: "story_ch4_shaft", tradeYield: { iron: 14, aether: 1 }, controlWeight: 2, requiredClears: 4, staminaCost: 9, mapX: 68, mapY: 50, sortOrder: 3,
  },
  {
    nodeKey: "tv_furnace_hall", regionKey: "tidevale", name: "熔炉厅", nodeType: "fort", levelMin: 25, levelMax: 33,
    enemyWave: [enemy("e_furnace_warden", "熔炉守卫", "knight", "fire", 28, "以一炉永不熄灭的炭火为核心。"), enemy("e_runaway_golem", "失控锻炉机偶", "warrior", "physical", 28, "守在最热的通道口。"), enemy("e_rift_bloom", "裂隙花簇", "mage", "fire", 27, "以热量为食。"), enemy("e_oath_enforcer", "铁誓执法者", "cleric", "physical", 27, "被派来阻止任何人关闭熔炉。")],
    rewards: rewards(1150, 1400, 32, 42, [{ equipKey: "eq_valden_plate", chance: 0.06 }]),
    firstClearRewards: rewards(1700, 1800, 50, 66, [{ equipKey: "eq_kindled_circlet", chance: 0.25 }]),
    unlock: { nodeKey: "tv_collapsed_shaft" }, storyKey: "story_ch4_furnace", tradeYield: { iron: 26 }, controlWeight: 3, requiredClears: 4, staminaCost: 10, mapX: 66, mapY: 33, sortOrder: 4,
  },
  {
    nodeKey: "tv_league_counting", regionKey: "tidevale", name: "商会账房", nodeType: "town", levelMin: 26, levelMax: 34,
    enemyWave: [enemy("e_ledger_shade", "账影", "sage", "shadow", 30, "由无数毁约与追讨凝成的影子，会念出数字。"), enemy("e_oath_enforcer", "铁誓执法者", "knight", "physical", 30, "它认为你是欠款方。"), enemy("e_market_brawler", "集市斗殴者", "assassin", "physical", 29, "来讨债的。")],
    rewards: rewards(1350, 1650, 36, 46, [{ equipKey: "eq_oath_ledger", chance: 0.1 }]),
    firstClearRewards: rewards(1900, 2000, 56, 70, []),
    unlock: { nodeKey: "tv_furnace_hall" }, storyKey: "story_ch4_ledger", tradeYield: { gold: 40 }, controlWeight: 3, requiredClears: 4, staminaCost: 10, mapX: 72, mapY: 42, sortOrder: 5,
  },
  {
    nodeKey: "tv_iron_oath_hall", regionKey: "tidevale", name: "铁誓总堂", nodeType: "fort", levelMin: 29, levelMax: 38,
    enemyWave: [enemy("e_oath_avatar", "誓约化身", "knight", "holy", 33, "商会立誓时敲下的那一锤，如今有了形体。"), enemy("e_ledger_shade", "账影", "mage", "shadow", 33, "念着最后一条未结清的账。"), enemy("e_furnace_warden", "熔炉守卫", "warrior", "fire", 32, "被总堂的誓约唤醒。"), enemy("e_aether_warden", "星辉守卫", "sage", "lightning", 32, "守护总堂地下的星辉矿脉。")],
    rewards: rewards(1600, 1900, 44, 52, [{ equipKey: "eq_aether_core", chance: 0.08 }]),
    firstClearRewards: rewards(2200, 2400, 66, 80, [{ equipKey: "eq_unnamed_blade", chance: 0.22 }]),
    unlock: { nodeKey: "tv_league_counting" }, storyKey: "story_ch4_hall", tradeYield: { gold: 50, iron: 20 }, controlWeight: 4, requiredClears: 5, staminaCost: 11, mapX: 62, mapY: 30, sortOrder: 6,
  },

  /* ------------------------ 星陨裂谷 starfall ------------------------ */
  {
    nodeKey: "sf_rift_edge", regionKey: "starfall", name: "裂谷边缘", nodeType: "rift", levelMin: 24, levelMax: 32,
    enemyWave: [enemy("e_aether_warden", "星辉守卫", "knight", "lightning", 27, "凝视着裂隙的方向，不看来访者。"), enemy("e_rift_bloom", "裂隙花簇", "mage", "frost", 27, "在裂缝边缘连成一片。"), enemy("e_shadow_step", "影步", "assassin", "shadow", 26, "只能看见它的脚步。")],
    rewards: rewards(1150, 1400, 40, 42, [{ equipKey: "eq_skyline_greaves", chance: 0.08 }]),
    firstClearRewards: rewards(1700, 1800, 60, 64, [{ equipKey: "eq_star_chart", chance: 0.35 }]),
    unlock: {}, tradeYield: { aether: 0.15 }, controlWeight: 1, requiredClears: 3, staminaCost: 9, mapX: 68, mapY: 28, sortOrder: 1,
  },
  {
    nodeKey: "sf_crystal_flats", regionKey: "starfall", name: "晶簇荒原", nodeType: "rift", levelMin: 27, levelMax: 35,
    enemyWave: [enemy("e_crystal_hound", "晶簇猎犬", "ranger", "lightning", 30, "由碎晶构成，跑动时会掉下发光碎片。"), enemy("e_aether_warden", "星辉守卫", "warrior", "lightning", 30, "把每一块水晶当作自己的孩子。"), enemy("e_rift_bloom", "裂隙花簇", "cleric", "frost", 29, "会用光修补同伴。")],
    rewards: rewards(1300, 1600, 48, 46, [{ equipKey: "eq_aether_core", chance: 0.08 }]),
    firstClearRewards: rewards(1900, 2000, 70, 70, []),
    unlock: { nodeKey: "sf_rift_edge" }, storyKey: "story_ch5_flats", tradeYield: { aether: 0.2, iron: 6 }, controlWeight: 2, requiredClears: 4, staminaCost: 10, mapX: 72, mapY: 20, sortOrder: 2,
  },
  {
    nodeKey: "sf_misaligned_bridge", regionKey: "starfall", name: "错位之桥", nodeType: "ruin", levelMin: 30, levelMax: 38,
    enemyWave: [enemy("e_mirror_self", "镜中之影", "sage", "shadow", 33, "它复制了队伍中的某一位，包括说话的方式。"), enemy("e_crystal_hound", "晶簇猎犬", "assassin", "lightning", 33, "在桥的上下两层同时出现。"), enemy("e_shadow_step", "影步", "warrior", "shadow", 32, "从错位的空间里走出来。"), enemy("e_aether_warden", "星辉守卫", "cleric", "lightning", 32, "守着桥的中央。")],
    rewards: rewards(1500, 1800, 56, 50, [{ equipKey: "eq_unnamed_blade", chance: 0.06 }]),
    firstClearRewards: rewards(2100, 2300, 80, 76, [{ equipKey: "eq_valden_plate", chance: 0.35 }]),
    unlock: { nodeKey: "sf_crystal_flats" }, storyKey: "story_ch5_bridge", tradeYield: {}, controlWeight: 3, requiredClears: 4, staminaCost: 11, mapX: 76, mapY: 30, sortOrder: 3,
  },
  {
    nodeKey: "sf_whisper_cavern", regionKey: "starfall", name: "低语洞窟", nodeType: "rift", levelMin: 32, levelMax: 40,
    enemyWave: [enemy("e_memory_swarm", "记忆蜂群", "ranger", "shadow", 35, "每一只都带着一句别人说过的话。"), enemy("e_mirror_self", "镜中之影", "knight", "shadow", 35, "它对你的队伍了如指掌。"), enemy("e_wraith_chorus", "蚀影·合声", "mage", "shadow", 34, "洞窟把它们的歌声放大了十倍。"), enemy("e_crystal_hound", "晶簇猎犬", "warrior", "lightning", 34, "在黑暗中只留下光点。")],
    rewards: rewards(1700, 2000, 64, 54, [{ equipKey: "eq_aether_core", chance: 0.1 }]),
    firstClearRewards: rewards(2300, 2500, 90, 82, []),
    unlock: { nodeKey: "sf_misaligned_bridge" }, storyKey: "story_ch5_cavern", tradeYield: { aether: 0.3 }, controlWeight: 3, requiredClears: 5, staminaCost: 12, mapX: 80, mapY: 20, sortOrder: 4,
  },
  {
    nodeKey: "sf_rift_heart", regionKey: "starfall", name: "裂隙之心", nodeType: "rift", levelMin: 34, levelMax: 42,
    enemyWave: [enemy("e_rift_avatar", "裂隙拟态", "sage", "shadow", 38, "它由所有在这里失去过东西的人的记忆拼成。"), enemy("e_memory_swarm", "记忆蜂群", "assassin", "shadow", 38, "在耳边不断重复。"), enemy("e_aether_warden", "星辉守卫", "knight", "lightning", 37, "最后的守门者。"), enemy("e_mirror_self", "镜中之影", "warrior", "shadow", 37, "它看起来很像你自己。")],
    rewards: rewards(2000, 2400, 80, 60, [{ equipKey: "eq_unnamed_blade", chance: 0.1 }, { equipKey: "eq_aether_core", chance: 0.12 }]),
    firstClearRewards: rewards(2800, 3000, 120, 95, [{ equipKey: "eq_unnamed_blade", chance: 1 }]),
    unlock: { nodeKey: "sf_whisper_cavern" }, storyKey: "story_ch5_heart", tradeYield: { aether: 0.85 }, controlWeight: 4, requiredClears: 5, staminaCost: 13, mapX: 84, mapY: 28, sortOrder: 5,
  },

  /* ------------------------ 高塔城废墟 hightower ------------------------ */
  {
    nodeKey: "ht_gate_ruin", regionKey: "hightower", name: "城门残骸", nodeType: "ruin", levelMin: 33, levelMax: 41,
    enemyWave: [enemy("e_gate_wraith", "蚀影·城门官", "knight", "shadow", 36, "要求的通行证名称你从未听过。"), enemy("e_wraith_host", "蚀影·万人形", "warrior", "shadow", 36, "在城门下反复行军。"), enemy("e_memory_swarm", "记忆蜂群", "mage", "shadow", 35, "复述着入城时的对话。")],
    rewards: rewards(1800, 2200, 66, 56, [{ equipKey: "eq_valden_plate", chance: 0.08 }]),
    firstClearRewards: rewards(2400, 2600, 92, 84, [{ equipKey: "eq_valden_longsword", chance: 0.2 }]),
    unlock: {}, tradeYield: {}, controlWeight: 1, requiredClears: 4, staminaCost: 11, mapX: 84, mapY: 54, sortOrder: 1,
  },
  {
    nodeKey: "ht_clock_square", regionKey: "hightower", name: "钟塔广场", nodeType: "town", levelMin: 36, levelMax: 44,
    enemyWave: [enemy("e_clock_warden", "钟塔守卫", "sage", "lightning", 39, "与钟声同步行动，钟响一次它动一次。"), enemy("e_gate_wraith", "蚀影·城门官", "warrior", "shadow", 39, "仍在广场上巡逻。"), enemy("e_mirror_self", "镜中之影", "assassin", "shadow", 38, "模仿了钟楼上的脚步声。"), enemy("e_aether_warden", "星辉守卫", "cleric", "lightning", 38, "被钟声唤醒。")],
    rewards: rewards(2000, 2400, 74, 60, [{ equipKey: "eq_kindled_circlet", chance: 0.08 }]),
    firstClearRewards: rewards(2700, 2900, 100, 90, []),
    unlock: { nodeKey: "ht_gate_ruin" }, storyKey: "story_ch6_square", tradeYield: { gold: 40 }, controlWeight: 2, requiredClears: 4, staminaCost: 12, mapX: 80, mapY: 46, sortOrder: 2,
  },
  {
    nodeKey: "ht_royal_library", regionKey: "hightower", name: "王家图书馆", nodeType: "ruin", levelMin: 38, levelMax: 46,
    enemyWave: [enemy("e_book_shade", "书影", "mage", "shadow", 41, "没有读完自己那一页就被烧掉了。"), enemy("e_clock_warden", "钟塔守卫", "knight", "lightning", 41, "守着图书馆的门。"), enemy("e_wraith_chorus", "蚀影·合声", "cleric", "shadow", 40, "念着失传的目录。"), enemy("e_memory_swarm", "记忆蜂群", "ranger", "shadow", 40, "从书页间飞出。")],
    rewards: rewards(2200, 2700, 86, 64, [{ equipKey: "eq_star_chart", chance: 0.1 }]),
    firstClearRewards: rewards(3000, 3200, 110, 96, [{ equipKey: "eq_star_chart", chance: 1 }]),
    unlock: { nodeKey: "ht_clock_square" }, storyKey: "story_ch6_library", tradeYield: { aether: 0.5 }, controlWeight: 2, requiredClears: 4, staminaCost: 12, mapX: 88, mapY: 44, sortOrder: 3,
  },
  {
    nodeKey: "ht_council_chamber", regionKey: "hightower", name: "议会厅", nodeType: "fort", levelMin: 40, levelMax: 48,
    enemyWave: [enemy("e_council_shade", "议会之影", "sage", "shadow", 43, "七年前那份议程至今没有表决完。"), enemy("e_gate_wraith", "蚀影·城门官", "knight", "shadow", 43, "站在门口等散会。"), enemy("e_book_shade", "书影", "mage", "shadow", 42, "念着第 12 条附则。"), enemy("e_mirror_self", "镜中之影", "warrior", "shadow", 42, "它代表了你从未见过的那一票。")],
    rewards: rewards(2500, 3000, 96, 70, [{ equipKey: "eq_dusk_longsword", chance: 0.08 }]),
    firstClearRewards: rewards(3400, 3600, 126, 104, []),
    unlock: { nodeKey: "ht_royal_library" }, storyKey: "story_ch6_council", tradeYield: { gold: 60, renown: 3 }, controlWeight: 3, requiredClears: 5, staminaCost: 13, mapX: 90, mapY: 58, sortOrder: 4,
  },
  {
    nodeKey: "ht_throne_shadow", regionKey: "hightower", name: "王座之影", nodeType: "ruin", levelMin: 42, levelMax: 50,
    enemyWave: [enemy("e_crown_echo", "王冠回声", "knight", "holy", 46, "旧王国最后的意志。它不愤怒，只是疲惫。"), enemy("e_council_shade", "议会之影", "sage", "shadow", 46, "仍然要求进行表决。"), enemy("e_mirror_self", "镜中之影", "assassin", "shadow", 45, "它戴着与你相同的纹章。"), enemy("e_memory_swarm", "记忆蜂群", "cleric", "shadow", 45, "唱着加冕礼上的歌。")],
    rewards: rewards(2800, 3400, 110, 76, [{ equipKey: "eq_dusk_longsword", chance: 0.1 }]),
    firstClearRewards: rewards(3800, 4000, 140, 115, [{ equipKey: "eq_dusk_longsword", chance: 1 }]),
    unlock: { nodeKey: "ht_council_chamber" }, storyKey: "story_ch6_throne", tradeYield: {}, controlWeight: 4, requiredClears: 5, staminaCost: 14, mapX: 86, mapY: 64, sortOrder: 5,
  },
  {
    nodeKey: "ht_clock_tower", regionKey: "hightower", name: "钟塔顶", nodeType: "rift", levelMin: 45, levelMax: 52,
    enemyWave: [enemy("e_rift_avatar", "裂隙拟态", "mage", "shadow", 49, "它记住了这座城陷落那天的每一句话。"), enemy("e_crown_echo", "王冠回声", "knight", "holy", 49, "最后的守卫。"), enemy("e_clock_warden", "钟塔守卫", "warrior", "lightning", 48, "与钟声一同行动。"), enemy("e_aether_warden", "星辉守卫", "sage", "lightning", 48, "星辉在塔顶聚成了人形。")],
    rewards: rewards(3200, 4000, 130, 90, [{ equipKey: "eq_unnamed_blade", chance: 0.12 }, { equipKey: "eq_dusk_longsword", chance: 0.12 }]),
    firstClearRewards: rewards(4500, 4800, 180, 140, []),
    unlock: { nodeKey: "ht_throne_shadow" }, storyKey: "story_ch6_tower", tradeYield: { aether: 1, renown: 4 }, controlWeight: 4, requiredClears: 6, staminaCost: 15, mapX: 92, mapY: 50, sortOrder: 6,
  },
];

export const NODE_BY_KEY = new Map(NODE_SEEDS.map((n) => [n.nodeKey, n]));
export const NODES_BY_REGION = NODE_SEEDS.reduce<Record<string, NodeSeed[]>>((acc, node) => {
  acc[node.regionKey] = acc[node.regionKey] ?? [];
  acc[node.regionKey].push(node);
  return acc;
}, {});

export const NODE_TYPE_LABEL: Record<NodeSeed["nodeType"], string> = {
  village: "村庄",
  town: "城镇",
  fort: "要塞",
  ruin: "遗迹",
  wild: "荒野",
  rift: "裂隙",
  trade: "贸易点",
};
