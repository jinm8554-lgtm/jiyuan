/** 任务 / 招募池 / 领地事件 配置数据（原创内容） */

export type QuestSeed = {
  questKey: string;
  name: string;
  chapter: number;
  questType: "main" | "side" | "daily";
  description: string;
  objectives: Array<Record<string, unknown>>;
  rewards: Record<string, unknown>;
  prerequisite: Record<string, unknown>;
  sortOrder: number;
};

const q = (v: QuestSeed) => v;

export const QUEST_SEEDS: QuestSeed[] = [
  q({
    questKey: "mq_ch1_01",
    name: "第一章 · 灰隼堡的第七个冬天",
    chapter: 1,
    questType: "main",
    description: "城墙南段还在漏风，粮仓见底，而你是这里唯一被叫做领主的人。先把能站住的地方站住。",
    objectives: [
      { type: "upgrade_building", key: "wall", count: 1, label: "将城墙提升至 1 级" },
      { type: "clear_node", key: "sp_keep_road", count: 1, label: "清剿城堡外的商道" },
      { type: "own_character", key: "adrian", count: 1, label: "让艾德里安加入你的队伍" },
    ],
    rewards: { gold: 320, food: 200, wood: 200, iron: 80, aether: 20, renown: 15, items: [{ equipKey: "eq_iron_sword", quantity: 1 }] },
    prerequisite: {},
    sortOrder: 1,
  }),
  q({
    questKey: "mq_ch1_02",
    name: "第一章 · 麦田与商路",
    chapter: 1,
    questType: "main",
    description: "流民在城墙外蹲了两天。给他们一个可以干活的地方，比给他们一顿饭更有用。",
    objectives: [
      { type: "clear_node", key: "sp_ruined_field", count: 1, label: "肃清废弃麦田的威胁" },
      { type: "clear_node", key: "sp_silk_road", count: 1, label: "打通被劫的商路" },
      { type: "upgrade_building", key: "market", count: 1, label: "建造市场" },
      { type: "upgrade_building", key: "tavern", count: 1, label: "建造酒馆" },
    ],
    rewards: { gold: 460, food: 320, wood: 260, iron: 120, aether: 30, renown: 20, items: [{ equipKey: "eq_padded_jerkin", quantity: 1 }] },
    prerequisite: { questKey: "mq_ch1_01" },
    sortOrder: 2,
  }),
  q({
    questKey: "mq_ch1_03",
    name: "第一章 · 断桥堡的通行证",
    chapter: 1,
    questType: "main",
    description: "旧哨塔里还站着一个不肯解散的守塔兵。断桥堡的桥上，也还有人等着验看通行证。",
    objectives: [
      { type: "clear_node", key: "sp_old_watchtower", count: 1, label: "清理旧哨塔的蚀影" },
      { type: "clear_node", key: "sp_fort_ruin", count: 1, label: "夺回断桥堡" },
      { type: "level_character", key: "any", count: 8, label: "使任意角色达到 8 级" },
    ],
    rewards: { gold: 700, food: 400, wood: 400, iron: 240, aether: 60, renown: 40, items: [{ equipKey: "eq_valden_tower_shield", quantity: 1 }] },
    prerequisite: { questKey: "mq_ch1_02" },
    sortOrder: 3,
  }),
  q({
    questKey: "mq_ch2_01",
    name: "第二章 · 断旗之地",
    chapter: 2,
    questType: "main",
    description: "灰烬平原上插满了看不清纹章的旗。带人去看看，那里究竟留下了什么。",
    objectives: [
      { type: "clear_node", key: "af_rust_banner", count: 1, label: "清剿锈旗坡" },
      { type: "clear_node", key: "af_dry_well", count: 1, label: "进入枯井村" },
      { type: "talk_ai", key: "any", count: 2, label: "在议事厅与同伴讨论一次" },
    ],
    rewards: { gold: 900, wood: 500, iron: 300, aether: 80, renown: 45, items: [{ equipKey: "eq_kindled_lantern", quantity: 1 }] },
    prerequisite: { questKey: "mq_ch1_03" },
    sortOrder: 4,
  }),
  q({
    questKey: "mq_ch2_02",
    name: "第二章 · 旗手之墓",
    chapter: 2,
    questType: "main",
    description: "旗手之墓前站着一个不愿意散去的记忆。它坚持战斗，是因为没有人愿意听它说完。",
    objectives: [
      { type: "clear_node", key: "af_abandoned_camp", count: 1, label: "清剿弃营" },
      { type: "clear_node", key: "af_broken_standard", count: 1, label: "夺回断旗岗" },
      { type: "clear_node", key: "af_flag_bearer_tomb", count: 1, label: "进入旗手之墓" },
    ],
    rewards: { gold: 1200, iron: 400, aether: 110, renown: 55, items: [{ equipKey: "eq_promises_knot", quantity: 1 }] },
    prerequisite: { questKey: "mq_ch2_01" },
    sortOrder: 5,
  }),
  q({
    questKey: "mq_ch3_01",
    name: "第三章 · 长歌之林",
    chapter: 3,
    questType: "main",
    description: "莉赛尔说，林脉记得所有进过林子的人。她说这句话的时候，第一次没有笑。",
    objectives: [
      { type: "clear_node", key: "sv_forest_edge", count: 1, label: "抵达林缘哨所" },
      { type: "clear_node", key: "sv_moss_path", count: 1, label: "穿过苔径" },
      { type: "own_character", key: "liesel", count: 1, label: "让莉赛尔加入你的队伍" },
    ],
    rewards: { gold: 1300, wood: 700, aether: 130, renown: 60, items: [{ equipKey: "eq_long_song_bow", quantity: 1 }] },
    prerequisite: { questKey: "mq_ch2_02" },
    sortOrder: 6,
  }),
  q({
    questKey: "mq_ch3_02",
    name: "第三章 · 歌者石台",
    chapter: 3,
    questType: "main",
    description: "有一首歌缺了一段。缺的那一段，正好是银杉边境的那几年。",
    objectives: [
      { type: "clear_node", key: "sv_old_grove", count: 1, label: "通过古树环的试炼" },
      { type: "clear_node", key: "sv_singer_stone", count: 1, label: "登上歌者石台" },
      { type: "control_region", key: "silverpine", count: 40, label: "使银杉边境控制度达到 40%" },
    ],
    rewards: { gold: 1600, wood: 800, aether: 160, renown: 70, items: [{ equipKey: "eq_observation_staff", quantity: 1 }] },
    prerequisite: { questKey: "mq_ch3_01" },
    sortOrder: 7,
  }),
  q({
    questKey: "mq_ch4_01",
    name: "第四章 · 铁誓与星辉",
    chapter: 4,
    questType: "main",
    description: "商会的账册上，有一笔七年前挂到现在都没结清的账。债主已经死了，欠债的也是。",
    objectives: [
      { type: "clear_node", key: "tv_market_mouth", count: 1, label: "进入矿口集市" },
      { type: "clear_node", key: "tv_water_works", count: 1, label: "平息水力锻场的失控" },
      { type: "upgrade_building", key: "workshop", count: 4, label: "将工坊提升至 4 级" },
    ],
    rewards: { gold: 2000, iron: 700, aether: 190, renown: 80, items: [{ equipKey: "eq_aether_core", quantity: 1 }] },
    prerequisite: { questKey: "mq_ch3_02" },
    sortOrder: 8,
  }),
  q({
    questKey: "mq_ch4_02",
    name: "第四章 · 熔炉厅的余温",
    chapter: 4,
    questType: "main",
    description: "那炉炭火燃了七十年。关掉它，矿谷的人会冷；不关，裂隙就会从炉心撕开。",
    objectives: [
      { type: "clear_node", key: "tv_collapsed_shaft", count: 1, label: "深入坍塌坑道" },
      { type: "clear_node", key: "tv_furnace_hall", count: 1, label: "进入熔炉厅" },
      { type: "level_character", key: "any", count: 25, label: "使任意角色达到 25 级" },
    ],
    rewards: { gold: 2400, iron: 900, aether: 220, renown: 95, items: [{ equipKey: "eq_kindled_circlet", quantity: 1 }] },
    prerequisite: { questKey: "mq_ch4_01" },
    sortOrder: 9,
  }),
  q({
    questKey: "mq_ch5_01",
    name: "第五章 · 伤口",
    chapter: 5,
    questType: "main",
    description: "薇奥拉说，裂隙不是伤口，是一封信。现在轮到你走进信封里，确认这句话。",
    objectives: [
      { type: "clear_node", key: "sf_rift_edge", count: 1, label: "抵达裂谷边缘" },
      { type: "clear_node", key: "sf_crystal_flats", count: 1, label: "穿越晶簇荒原" },
      { type: "clear_node", key: "sf_whisper_cavern", count: 1, label: "走出低语洞窟" },
    ],
    rewards: { gold: 2800, iron: 1100, aether: 300, renown: 110, items: [{ equipKey: "eq_unnamed_blade", quantity: 1 }] },
    prerequisite: { questKey: "mq_ch4_02" },
    sortOrder: 10,
  }),
  q({
    questKey: "mq_ch6_01",
    name: "第六章 · 钟塔报时",
    chapter: 6,
    questType: "main",
    description: "钟塔还在报时，只是没有人在意时辰。你带着人回到那座城，去把时间重新写一遍。",
    objectives: [
      { type: "clear_node", key: "ht_gate_ruin", count: 1, label: "攻入城门残骸" },
      { type: "clear_node", key: "ht_clock_square", count: 1, label: "抵达钟塔广场" },
      { type: "clear_node", key: "ht_council_chamber", count: 1, label: "进入议会厅" },
    ],
    rewards: { gold: 3600, aether: 380, renown: 130, items: [{ equipKey: "eq_dusk_longsword", quantity: 1 }] },
    prerequisite: { questKey: "mq_ch5_01" },
    sortOrder: 11,
  }),
  q({
    questKey: "mq_ch6_02",
    name: "第六章 · 灰隼的未来",
    chapter: 6,
    questType: "main",
    description: "所有旗帜都摆在桌上。你可以把它们拼在一起，也可以让它们各自飘着。",
    objectives: [
      { type: "clear_node", key: "ht_throne_shadow", count: 1, label: "直面王座之影" },
      { type: "clear_node", key: "ht_clock_tower", count: 1, label: "登上钟塔顶" },
      { type: "control_region", key: "hightower", count: 50, label: "使高塔城废墟控制度达到 50%" },
    ],
    rewards: { gold: 5000, aether: 500, renown: 180 },
    prerequisite: { questKey: "mq_ch6_01" },
    sortOrder: 12,
  }),

  /* ------------------------------- 支线 ------------------------------- */
  q({
    questKey: "sq_greta_roster",
    name: "支线 · 花名册上的第二个名字",
    chapter: 1,
    questType: "side",
    description: "格蕾塔想给守备队重新做一本花名册。她说，至少要有两个人的名字。",
    objectives: [
      { type: "own_character", key: "greta", count: 1, label: "让格蕾塔加入队伍" },
      { type: "clear_node", key: "sp_silk_road", count: 2, label: "再次巡逻被劫的商路（2 次）" },
      { type: "talk_ai", key: "greta", count: 2, label: "与格蕾塔交谈 2 次" },
    ],
    rewards: { gold: 400, renown: 20, items: [{ equipKey: "eq_heraldic_ring", quantity: 1 }] },
    prerequisite: {},
    sortOrder: 13,
  }),
  q({
    questKey: "sq_theo_books",
    name: "支线 · 抄本的第一页",
    chapter: 1,
    questType: "side",
    description: "提奥想让你看看他抄的书。他说，每一本的第一页都写着同一句话。",
    objectives: [
      { type: "upgrade_building", key: "library", count: 1, label: "建造图书馆" },
      { type: "own_character", key: "theo", count: 1, label: "让提奥加入队伍" },
      { type: "equip_item", key: "any", count: 1, label: "为任意角色装备一件饰品" },
    ],
    rewards: { gold: 420, aether: 40, renown: 18 },
    prerequisite: {},
    sortOrder: 14,
  }),
  q({
    questKey: "sq_ink_name",
    name: "支线 · 名字",
    chapter: 3,
    questType: "side",
    description: "九号问过你三次它的名字。它每次问的时候，面部面板上的光纹都会亮一下。",
    objectives: [
      { type: "own_character", key: "ink_nine", count: 1, label: "让印·九号加入队伍" },
      { type: "talk_ai", key: "ink_nine", count: 3, label: "与印·九号交谈 3 次" },
      { type: "level_character", key: "ink_nine", count: 20, label: "使印·九号达到 20 级" },
    ],
    rewards: { gold: 900, aether: 120, renown: 40, items: [{ equipKey: "eq_unnamed_blade", quantity: 1 }] },
    prerequisite: { questKey: "mq_ch3_01" },
    sortOrder: 15,
  }),

  /* ------------------------------- 日常 ------------------------------- */
  q({
    questKey: "dq_daily_patrol",
    name: "日常 · 边境巡逻",
    chapter: 1,
    questType: "daily",
    description: "格蕾塔把今日的巡逻路线钉在了议事厅的墙上。",
    objectives: [
      { type: "clear_node", key: "any", count: 3, label: "完成任意 3 次节点战斗" },
      { type: "upgrade_building", key: "any", count: 1, label: "进行 1 次建筑升级" },
    ],
    rewards: { gold: 260, food: 120, aether: 20, renown: 8 },
    prerequisite: {},
    sortOrder: 16,
  }),
  q({
    questKey: "dq_daily_council",
    name: "日常 · 议事厅会议",
    chapter: 1,
    questType: "daily",
    description: "梅芙琳建议每天留一刻钟，让所有人把话说完。",
    objectives: [{ type: "talk_ai", key: "any", count: 1, label: "在议会场景完成 1 次角色互动" }],
    rewards: { gold: 180, aether: 16, renown: 6 },
    prerequisite: {},
    sortOrder: 17,
  }),
];

/* ============================ 招募池 ============================ */

export type PoolSeed = {
  poolKey: string;
  name: string;
  poolType: "normal" | "rare" | "event";
  description: string;
  rates: Array<{ rarity: string; rate: number }>;
  pity: Record<string, number | string>;
  costSingle: number;
  costTen: number;
  currency: string;
  characterKeys: string[];
  enabled: boolean;
  sortOrder: number;
};

export const POOL_SEEDS: PoolSeed[] = [
  {
    poolKey: "pool_border_road",
    name: "边境之路 · 常驻招募",
    poolType: "normal",
    description: "所有愿意来边境找活干的人都会先到酒馆报个到。常驻池包含全部已公开角色。",
    rates: [
      { rarity: "SSR", rate: 0.03 },
      { rarity: "SR", rate: 0.17 },
      { rarity: "R", rate: 0.8 },
    ],
    pity: { softStart: 60, softStep: 0.06, hardPity: 80, tenPullMinRarity: "SR", duplicateShards: 1 },
    costSingle: 1,
    costTen: 10,
    currency: "aether",
    characterKeys: [],
    enabled: true,
    sortOrder: 1,
  },
  {
    poolKey: "pool_old_standard",
    name: "旧旗之下 · 稀有招募",
    poolType: "rare",
    description: "那些曾经举着旗的人，偶尔会回到边境。本池仅包含 SSR 与 SR 角色，概率更高但消耗更多星辉。",
    rates: [
      { rarity: "SSR", rate: 0.08 },
      { rarity: "SR", rate: 0.42 },
      { rarity: "R", rate: 0.5 },
    ],
    pity: { softStart: 45, softStep: 0.08, hardPity: 60, tenPullMinRarity: "SR", duplicateShards: 1 },
    costSingle: 3,
    costTen: 30,
    currency: "aether",
    characterKeys: [],
    enabled: true,
    sortOrder: 2,
  },
  {
    poolKey: "pool_song_of_forest",
    name: "长歌之林 · 活动招募",
    poolType: "event",
    description: "限定活动池：莉赛尔、塞西莉亚、薇奥拉的出现概率显著提升。活动结束后角色将进入常驻池。",
    rates: [
      { rarity: "SSR", rate: 0.05 },
      { rarity: "SR", rate: 0.25 },
      { rarity: "R", rate: 0.7 },
    ],
    pity: { softStart: 50, softStep: 0.07, hardPity: 70, tenPullMinRarity: "SR", duplicateShards: 2 },
    costSingle: 2,
    costTen: 20,
    currency: "aether",
    characterKeys: ["liesel", "cecilia", "viola", "mira"],
    enabled: true,
    sortOrder: 3,
  },
];

/* ============================ 领地事件 ============================ */

export type EventSeed = {
  eventKey: string;
  title: string;
  category: "economy" | "people" | "military" | "diplomacy" | "rift";
  description: string;
  choices: Array<Record<string, unknown>>;
  minKeepLevel: number;
  weight: number;
  once: boolean;
};

export const EVENT_SEEDS: EventSeed[] = [
  {
    eventKey: "ev_refugee_wave",
    title: "城外的流民",
    category: "people",
    description: "十七个从南方来的人蹲在城墙外的空地上，其中一个抱着还不会走路的孩子。格蕾塔问你要不要开城门。",
    choices: [
      { label: "全部接纳，安排进麦田干活", effect: { food: -120, gold: 60, renown: 12 }, note: "食物减少，但声望与人口增加。" },
      { label: "只接收有手艺的人", effect: { gold: 120, iron: 40, renown: 2 }, note: "获得工匠，但民间评价保守。" },
      { label: "派人护送他们去别的领地", effect: { food: -40, renown: 6 }, note: "消耗少量粮食，声望小幅提升。" },
    ],
    minKeepLevel: 1,
    weight: 22,
    once: false,
  },
  {
    eventKey: "ev_broken_bridge",
    title: "商路上的断桥",
    category: "economy",
    description: "铁誓商会的人站在断桥边，问领主愿不愿意分摊修桥的费用。他们说，桥修好了，商队自然会来。",
    choices: [
      { label: "全额出资修桥", effect: { gold: -280, wood: -160, renown: 14 }, note: "商路收益显著提升。" },
      { label: "与商会各出五成", effect: { gold: -140, wood: -80, renown: 8 }, note: "折中方案。" },
      { label: "暂时搁置", effect: { renown: -4 }, note: "商队会绕行，声望略降。" },
    ],
    minKeepLevel: 2,
    weight: 16,
    once: true,
  },
  {
    eventKey: "ev_wall_crack",
    title: "城墙再度开裂",
    category: "military",
    description: "夜里南段城墙又裂了一道口子。格蕾塔说，不补的话，冬天之前会有东西从那里进来。",
    choices: [
      { label: "立刻动用库存石料修补", effect: { wood: -200, iron: -60 }, note: "防止夜袭损失。" },
      { label: "先用木栅临时挡一下", effect: { wood: -70 }, note: "节省材料，但下次被袭损失更大。" },
    ],
    minKeepLevel: 1,
    weight: 18,
    once: false,
  },
  {
    eventKey: "ev_priest_visit",
    title: "教团的巡回医者",
    category: "people",
    description: "圣焰教团派来一位巡回医者，想在领地开设一间常驻诊疗室，条件是领主提供一处房屋与每月补给。",
    choices: [
      { label: "拨出房屋与每月补给", effect: { gold: -180, food: -100, renown: 16 }, note: "长线提升声望与队伍恢复能力。" },
      { label: "只提供场地，不承担补给", effect: { gold: -60, renown: 6 }, note: "折中方案。" },
      { label: "婉拒", effect: { renown: -2 }, note: "维持现状。" },
    ],
    minKeepLevel: 3,
    weight: 14,
    once: true,
  },
  {
    eventKey: "ev_rift_glow",
    title: "夜里的星辉异动",
    category: "rift",
    description: "银杉林方向在昨夜亮了一次。薇奥拉在观测记录上写了三行字，然后把它递给你。",
    choices: [
      { label: "派遣小队前往调查", effect: { aether: 90, food: -60 }, note: "获得星辉结晶，消耗补给。" },
      { label: "加强巡逻，暂不深入", effect: { renown: 4 }, note: "保守但安全。" },
      { label: "请薇奥拉远程观测 12 小时", effect: { aether: 40 }, note: "获得部分数据。" },
    ],
    minKeepLevel: 4,
    weight: 12,
    once: false,
  },
  {
    eventKey: "ev_harvest_festival",
    title: "第一次丰收",
    category: "economy",
    description: "麦田今年收成不错。格蕾塔建议办一场小型的收获节——她说，让人记得住的好日子越多，就越不会走。",
    choices: [
      { label: "举办收获节，全体放假一天", effect: { food: -80, gold: -60, renown: 20 }, note: "声望大幅提升。" },
      { label: "只发放额外口粮", effect: { food: -120, renown: 8 }, note: "实惠但平常。" },
      { label: "全部入库，留着过冬", effect: { food: 240, renown: -3 }, note: "资源充足，但人心略有失落。" },
    ],
    minKeepLevel: 3,
    weight: 15,
    once: false,
  },
];