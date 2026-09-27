/** 剧情场景数据（原创文本，全年龄向：冲突来源为资源、信仰差异、旧战争创伤与蚀影威胁） */

export type BeatSeed = {
  speaker: string;
  charKey?: string;
  text: string;
  emotion?: "calm" | "warm" | "tense" | "sad" | "hopeful" | "wry";
  bg?: string;
};

export type StorySeed = {
  sceneKey: string;
  chapter: number;
  title: string;
  trigger: Record<string, unknown>;
  beats: BeatSeed[];
  choices: Array<Record<string, unknown>>;
  unlockFlags: string[];
};

/** 剧情星辉是一次性奖励，保留分支差异但缩减为新版经济可承受的数值。 */
const s = (v: StorySeed): StorySeed => ({
  ...v,
  choices: v.choices.map((choice) => {
    const rewards = choice.rewards;
    if (!rewards || typeof rewards !== "object") return choice;
    const aether = Number((rewards as Record<string, unknown>).aether ?? 0);
    if (!Number.isFinite(aether) || aether === 0) return choice;
    return {
      ...choice,
      rewards: {
        ...(rewards as Record<string, unknown>),
        aether: Math.sign(aether) * Math.max(1, Math.round(Math.abs(aether) / 5)),
      },
    };
  }),
});

export const STORY_SEEDS: StorySeed[] = [
  s({
    sceneKey: "story_ch1_silk_road",
    chapter: 1,
    title: "被劫的商路",
    trigger: { nodeKey: "sp_silk_road" },
    beats: [
      { speaker: "旁白", text: "商路上的车辙还很新，但推车的人已经不在了。路边的护路石被砸开，碎石里混着半袋散落的麦子。", emotion: "calm", bg: "road" },
      { speaker: "艾德里安", charKey: "adrian", text: "不是职业的匪徒。他们连车辙都清不干净，麦子也没全部拿走。", emotion: "calm" },
      { speaker: "格蕾塔", charKey: "greta", text: "南边的村子断粮三个月了。抢一车麦子，够一个村撑半个月。", emotion: "tense" },
      { speaker: "艾德里安", charKey: "adrian", text: "所以这不是匪患。是没有粮仓。", emotion: "calm" },
      { speaker: "旁白", text: "你把散落的麦子一袋袋收拢起来。格蕾塔在旁边看着，什么也没说。", emotion: "calm" },
    ],
    choices: [
      { text: "把麦子登记入库，按户分配", flags: { ch1_grain_shared: true }, rewards: { food: 120, renown: 8 }, reply: "格蕾塔在花名册背面写下每一户的名字。她说，这样以后就不会有人再来抢了。" },
      { text: "留一半充作军粮，一半还给他们", flags: { ch1_grain_split: true }, rewards: { food: 60, renown: 4 }, reply: "艾德里安点头：「军粮归军粮，人情归人情。这样两边都站得住。」" },
    ],
    unlockFlags: ["chapter1_started"],
  }),
  s({
    sceneKey: "story_ch1_watchtower",
    chapter: 1,
    title: "旧哨塔的守塔兵",
    trigger: { nodeKey: "sp_old_watchtower" },
    beats: [
      { speaker: "旁白", text: "哨塔的石阶上落满灰。塔顶站着一个模糊的人形，身姿挺直，手里还握着一支已经锈断的长矛。", emotion: "tense", bg: "tower" },
      { speaker: "蚀影·守塔兵", text: "……口令。", emotion: "calm" },
      { speaker: "艾德里安", charKey: "adrian", text: "他没有敌意。他只是在等一个口令，而那个回答他的人三十年前就死了。", emotion: "sad" },
      { speaker: "格蕾塔", charKey: "greta", text: "领主，它在等。我们给它一个回答。", emotion: "calm" },
    ],
    choices: [
      { text: "以灰隼堡领主的名义宣布：哨塔的任务已经结束", flags: { ch1_tower_released: true }, rewards: { aether: 20, renown: 10 }, reply: "蚀影放下了锈矛，身体像灰一样散开。塔顶的风忽然变得很安静。" },
      { text: "告诉他今晚有巡逻，请继续守塔", flags: { ch1_tower_kept: true }, rewards: { aether: 10, renown: 4 }, reply: "它郑重地敬了一个礼。艾德里安转过身去，很久没有说话。" },
    ],
    unlockFlags: ["watchtower_resolved"],
  }),
  s({
    sceneKey: "story_ch1_fort",
    chapter: 1,
    title: "断桥堡的通行证",
    trigger: { nodeKey: "sp_fort_ruin" },
    beats: [
      { speaker: "旁白", text: "断桥堡的吊桥早就没了，只剩两根石柱。桥中央站着一个穿着完整甲胄的蚀影，正在检查每一个经过的人——尽管已经没有人经过。", emotion: "calm", bg: "fort" },
      { speaker: "蚀影·断桥官", text: "通行证。", emotion: "calm" },
      { speaker: "法兰", charKey: "fran", text: "……我当年就是从这座桥上过去的。他站在这里多久了？", emotion: "sad" },
      { speaker: "艾德里安", charKey: "adrian", text: "比我们都要久。", emotion: "sad" },
      { speaker: "艾德里安", charKey: "adrian", text: "领主，通行证上的名字，得由你来写。", emotion: "calm" },
    ],
    choices: [
      { text: "写下全队的名字：这支部队今后常驻此地", flags: { ch1_fort_garrison: true }, rewards: { renown: 22, iron: 120 }, reply: "蚀影逐一念出每一个名字，然后在桥头站直了身子，让开了路。" },
      { text: "写下「边境流民通行」：让这条路重新属于所有人", flags: { ch1_fort_open: true }, rewards: { gold: 300, renown: 14 }, reply: "它把通行证举得很高，像是在让很远的人也能看见。" },
    ],
    unlockFlags: ["chapter1_complete"],
  }),
  s({
    sceneKey: "story_ch2_banner",
    chapter: 2,
    title: "锈旗坡",
    trigger: { nodeKey: "af_rust_banner" },
    beats: [
      { speaker: "旁白", text: "坡上插着四百多根旗杆，旗面全都烂光了，只剩下一点褪色的布条挂在杆头，随风抖动。", emotion: "calm", bg: "field" },
      { speaker: "法兰", charKey: "fran", text: "我们那时候的旗是蓝色的。你看，那边第三根——那块蓝还在。", emotion: "sad" },
      { speaker: "艾德里安", charKey: "adrian", text: "那是我所在的第三队。", emotion: "sad" },
      { speaker: "格蕾塔", charKey: "greta", text: "要拆掉吗？", emotion: "calm" },
      { speaker: "艾德里安", charKey: "adrian", text: "……不。拆了就什么都没了。", emotion: "sad" },
    ],
    choices: [
      { text: "把四百根旗杆全部扶正", flags: { ch2_banners_raised: true }, rewards: { renown: 16, wood: 100 }, reply: "全队从清晨扶到黄昏。风再吹过来时，坡上像有一整支军队还站在那里。" },
      { text: "记录旗帜编号，带回议事厅归档", flags: { ch2_banners_recorded: true }, rewards: { gold: 260, renown: 10 }, reply: "提奥用了三夜抄完编号。他说，只要有记录，就不算彻底消失。" },
    ],
    unlockFlags: ["chapter2_started"],
  }),
  s({
    sceneKey: "story_ch2_dry_well",
    chapter: 2,
    title: "枯井村",
    trigger: { nodeKey: "af_dry_well" },
    beats: [
      { speaker: "旁白", text: "井早就干了。井边坐着一个很小的蚀影，双腿悬在井口外，声音很轻，像是在唱歌，但没有词。", emotion: "sad", bg: "well" },
      { speaker: "蚀影·井边童影", text: "……你会唱吗？", emotion: "sad" },
      { speaker: "梅芙琳", charKey: "maevrin", text: "它不是在攻击。它只是想听完一首歌。", emotion: "sad" },
      { speaker: "旁白", text: "你身后的队伍安静下来。莉赛尔把手放在了弓弦上，又收了回去。", emotion: "calm" },
    ],
    choices: [
      { text: "让莉赛尔为它唱完那一首", flags: { ch2_well_song: true }, rewards: { aether: 40, renown: 18 }, reply: "歌声停下时，井边只剩下一点很淡的光，缓缓升到天上去了。" },
      { text: "把村里的名字抄下来，带回议事厅", flags: { ch2_well_names: true }, rewards: { gold: 300, renown: 12 }, reply: "提奥抄了整整两页。他说这些名字会写进新的花名册。" },
    ],
    unlockFlags: ["dry_well_resolved"],
  }),
  s({
    sceneKey: "story_ch2_field",
    chapter: 2,
    title: "旧战场中心",
    trigger: { nodeKey: "af_old_field_center" },
    beats: [
      { speaker: "旁白", text: "这里是当年最后一战的中心。地面被翻过无数次，锈迹像一层薄薄的霜，覆盖了整片旷野。", emotion: "tense", bg: "field" },
      { speaker: "蚀影·万人形", text: "……前进。", emotion: "tense" },
      { speaker: "艾德里安", charKey: "adrian", text: "它还在执行七年前的最后一条命令。", emotion: "sad" },
      { speaker: "薇奥拉", charKey: "viola", text: "不。它是在重复。它已经不知道自己要去哪了。", emotion: "calm" },
      { speaker: "薇奥拉", charKey: "viola", text: "如果给它一个目的地，它会走过去，然后停下来。这我可以确定。", emotion: "calm" },
    ],
    choices: [
      { text: "指向北方，告诉它「回家」", flags: { ch2_host_dismissed: true }, rewards: { aether: 60, renown: 20 }, reply: "庞大的人形转向北方，一步一步走了出去，走出了所有人的视线。" },
      { text: "指向灰隼堡，让它成为守备队的一部分", flags: { ch2_host_enlisted: true }, rewards: { iron: 300, renown: 8 }, reply: "它停下动作，第一次把目光落在了活人身上。" },
    ],
    unlockFlags: ["field_center_resolved"],
  }),
  s({
    sceneKey: "story_ch2_tomb",
    chapter: 2,
    title: "旗手之墓",
    trigger: { nodeKey: "af_flag_bearer_tomb" },
    beats: [
      { speaker: "旁白", text: "墓很简单，一块被磨得很平的石板，上面刻着一行字：这里躺着第七面旗。", emotion: "sad", bg: "tomb" },
      { speaker: "蚀影·留存者", text: "……你在听吗？", emotion: "sad" },
      { speaker: "艾德里安", charKey: "adrian", text: "（很轻地）我在听。", emotion: "sad" },
      { speaker: "蚀影·留存者", text: "第七面旗，是在桥上倒的。我举着它，一直到最后一刻。", emotion: "sad" },
      { speaker: "蚀影·留存者", text: "……有人记得吗？", emotion: "sad" },
    ],
    choices: [
      { text: "回答：我记得。第七面旗，桥上，最后一刻。", flags: { ch2_tomb_remembered: true }, rewards: { renown: 30, aether: 80 }, reply: "蚀影安静地散开了，散得很慢，像是终于愿意坐下来。" },
      { text: "把墓碑上的字抄下来，刻进议事厅的石墙", flags: { ch2_tomb_carved: true }, rewards: { renown: 24, iron: 260 }, reply: "从那天起，议事厅墙上多了一行字。每一个进门的人都会先看到它。" },
    ],
    unlockFlags: ["chapter2_complete"],
  }),
  s({
    sceneKey: "story_ch3_grove",
    chapter: 3,
    title: "古树环的试炼",
    trigger: { nodeKey: "sv_old_grove" },
    beats: [
      { speaker: "旁白", text: "十二棵古树围成一个环。当你走进环中，树环中央的守卫睁开眼睛，但并没有举起武器。", emotion: "calm", bg: "grove" },
      { speaker: "树环守卫", text: "你带来的东西里，有几件是从这片林子拿走的。", emotion: "calm" },
      { speaker: "莉赛尔", charKey: "liesel", text: "它是说木头。我们修城墙用了北边的银杉。", emotion: "tense" },
      { speaker: "塞西莉亚", charKey: "cecilia", text: "它不要求你还回来。它只想知道，你打算怎么还。", emotion: "calm" },
    ],
    choices: [
      { text: "承诺每一棵砍下的树都补种三棵", flags: { ch3_grove_replant: true }, rewards: { wood: 300, renown: 16 }, reply: "树环守卫让开了路。塞西莉亚说，她会在树皮上记下这句话。" },
      { text: "承诺把城墙的木料换成石料，林子的树不再砍", flags: { ch3_grove_stone: true }, rewards: { iron: 320, renown: 20 }, reply: "守卫深深弯下树干。米拉当天就开始计算石料的用量。" },
    ],
    unlockFlags: ["grove_passed"],
  }),
  s({
    sceneKey: "story_ch3_singer",
    chapter: 3,
    title: "歌者石台",
    trigger: { nodeKey: "sv_singer_stone" },
    beats: [
      { speaker: "旁白", text: "石台中央刻着一首歌，最后一段空白着。风从石缝间穿过时，正好补上了旋律，却补不上词。", emotion: "calm", bg: "stone" },
      { speaker: "莉赛尔", charKey: "liesel", text: "这一段缺的就是银杉边境。缺的那几年，是没有人唱歌的几年。", emotion: "sad" },
      { speaker: "莉赛尔", charKey: "liesel", text: "……领主，填这段词的人，得是真正在那里住下来的人。", emotion: "calm" },
    ],
    choices: [
      { text: "由莉赛尔来填，你只提供那几年发生的事情", flags: { ch3_song_liesel: true }, rewards: { aether: 100, renown: 26 }, reply: "莉赛尔唱了很久。唱到最后一句时，她笑了一下，然后继续唱。" },
      { text: "由全队每人各写一句，拼成最后一段", flags: { ch3_song_together: true }, rewards: { renown: 30, gold: 800 }, reply: "石台上多了一首歌，署着九个人的名字。这是森语秘境第一次出现这样的署名。" },
    ],
    unlockFlags: ["chapter3_midpoint"],
  }),
  s({
    sceneKey: "story_ch3_heartwood",
    chapter: 3,
    title: "林脉核心",
    trigger: { nodeKey: "sv_heartwood" },
    beats: [
      { speaker: "旁白", text: "林脉核心是一棵倒下的巨树，树干内部透着光。裂隙的枝蔓从树心中伸出，却并没有继续扩张——它在被吸收。", emotion: "calm", bg: "heartwood" },
      { speaker: "薇奥拉", charKey: "viola", text: "……它在把裂隙吃掉。不，是消化。它把裂隙变成了可以承受的东西。", emotion: "hopeful" },
      { speaker: "塞西莉亚", charKey: "cecilia", text: "这棵树等了很多年，等一个愿意帮它把剩下的部分接上的人。", emotion: "calm" },
    ],
    choices: [
      { text: "把领地的星辉结晶分出一部分，投入树心", flags: { ch3_heartwood_fed: true }, rewards: { aether: -60, renown: 34, wood: 400 }, reply: "树心的光稳住了。塞西莉亚闭上眼睛，很久才睁开。" },
      { text: "先记录数据，再决定", flags: { ch3_heartwood_studied: true }, rewards: { aether: 120, renown: 18 }, reply: "薇奥拉写满了三页。她说，这是她第一次觉得流放是一种运气。" },
    ],
    unlockFlags: ["heartwood_resolved"],
  }),
  s({
    sceneKey: "story_ch3_concord",
    chapter: 3,
    title: "森语议会",
    trigger: { nodeKey: "sv_concord_hall" },
    beats: [
      { speaker: "旁白", text: "议会厅其实就是一片空地，树上挂着七块木牌，每一块代表一个林区的意见。", emotion: "calm", bg: "concord" },
      { speaker: "塞西莉亚", charKey: "cecilia", text: "林脉同意与你合作。条件是：你控制的每一条通往林子的路，都要留下一条给野兽走的。", emotion: "calm" },
      { speaker: "艾德里安", charKey: "adrian", text: "这在军事上并不明智。", emotion: "tense" },
      { speaker: "塞西莉亚", charKey: "cecilia", text: "在活着这件事上，很明智。", emotion: "wry" },
    ],
    choices: [
      { text: "接受条件，签下林脉之约", flags: { ch3_concord_signed: true }, rewards: { wood: 600, aether: 140, renown: 40 }, reply: "七块木牌同时翻转，露出背面早已刻好的字：盟友。" },
      { text: "提出反建议：把通路留给野兽，但由森语者派人协防", flags: { ch3_concord_joint: true }, rewards: { wood: 400, aether: 100, renown: 34 }, reply: "塞西莉亚笑了。她说，第一次有人愿意跟她谈条件而不是谈请求。" },
    ],
    unlockFlags: ["chapter3_complete"],
  }),
  s({
    sceneKey: "story_ch4_forge",
    chapter: 4,
    title: "水力锻场的失控",
    trigger: { nodeKey: "tv_water_works" },
    beats: [
      { speaker: "旁白", text: "水轮的制动断了，锻锤一记一记砸下去，声音在山谷里滚了很久。工人们远远围着，谁也不肯靠近。", emotion: "tense", bg: "forge" },
      { speaker: "米拉", charKey: "mira", text: "它是照着一条七年前的订单在打东西。订单上写着——三百把矛头，急件。", emotion: "calm" },
      { speaker: "索尔", charKey: "thor", text: "那张订单是我签的。战争第二个月的。", emotion: "sad" },
    ],
    choices: [
      { text: "让米拉把订单作废，改打农具", flags: { ch4_forge_tools: true }, rewards: { iron: 400, food: 200, renown: 22 }, reply: "锻锤的节奏变了。当天下午，第一批锄头下线。" },
      { text: "完成订单：矛头改用护墙钉，交给人手不足的边境哨所", flags: { ch4_forge_nails: true }, rewards: { iron: 300, renown: 26 }, reply: "索尔亲自看着第一箱护墙钉装箱。他说，这是他这辈子第一次按时交货还觉得高兴。" },
    ],
    unlockFlags: ["chapter4_started"],
  }),
  s({
    sceneKey: "story_ch4_shaft",
    chapter: 4,
    title: "坍塌坑道",
    trigger: { nodeKey: "tv_collapsed_shaft" },
    beats: [
      { speaker: "旁白", text: "坑道深处有人在敲矿脉。声音很规律，一下，停一停，再一下。靠近之后才发现，那是一具蚀影在敲已经塌实的岩壁。", emotion: "sad", bg: "shaft" },
      { speaker: "蚀影·矿工", text: "……还有三米。就要通了。", emotion: "sad" },
      { speaker: "伊森", charKey: "ethan", text: "这条矿脉七年前就废弃了。他敲了七年。", emotion: "sad" },
    ],
    choices: [
      { text: "告诉他矿脉已经封闭，带他离开坑道", flags: { ch4_shaft_released: true }, rewards: { iron: 300, aether: 60, renown: 18 }, reply: "蚀影跟着灯走出了坑道。它第一次看见阳光时，愣了一下，然后就散了。" },
      { text: "陪他敲完最后三米", flags: { ch4_shaft_finished: true }, rewards: { iron: 500, renown: 14 }, reply: "三米之后是一小片星辉结晶。蚀影把结晶递给了最靠近它的人。" },
    ],
    unlockFlags: ["shaft_resolved"],
  }),
  s({
    sceneKey: "story_ch4_furnace",
    chapter: 4,
    title: "熔炉厅",
    trigger: { nodeKey: "tv_furnace_hall" },
    beats: [
      { speaker: "旁白", text: "熔炉厅中央的火烧了七十年。炉壁上的星辉管线已经和裂隙长在了一起，分不清哪一段是人工的，哪一段是长出来的。", emotion: "tense", bg: "furnace" },
      { speaker: "薇奥拉", charKey: "viola", text: "熄了它，矿谷会冷；不熄，裂隙会顺着管线一路爬进城里。", emotion: "calm" },
      { speaker: "诺瓦", charKey: "nova", text: "那就别熄。改成用别的东西烧。", emotion: "hopeful" },
      { speaker: "米拉", charKey: "mira", text: "……理论上可以。用星辉结晶做引，用木材做燃料。效率会低一半，但不会烂穿管线。", emotion: "hopeful" },
    ],
    choices: [
      { text: "立项改造：星辉引火 + 木材燃料", flags: { ch4_furnace_retrofit: true }, rewards: { gold: -400, wood: -300, renown: 40, aether: 160 }, reply: "改造用了九天。第九天夜里，炉子重新亮起来，颜色比从前温和。" },
      { text: "暂时维持原状，先加固炉壁", flags: { ch4_furnace_reinforced: true }, rewards: { iron: 400, renown: 16 }, reply: "炉壁撑住了，但薇奥拉在她的记录本上画了一个问号。" },
    ],
    unlockFlags: ["furnace_resolved"],
  }),
  s({
    sceneKey: "story_ch4_ledger",
    chapter: 4,
    title: "商会账房",
    trigger: { nodeKey: "tv_league_counting" },
    beats: [
      { speaker: "旁白", text: "账房的架子上堆着七年的账册。最旧的那一本摊开着，最后一页只写了一行：「应收：银杉边境运费，欠款方——瓦尔登」。", emotion: "calm", bg: "ledger" },
      { speaker: "索尔", charKey: "thor", text: "这笔账挂到现在。债主死了，欠债的也是。理论上……它已经不存在了。", emotion: "calm" },
      { speaker: "伊森", charKey: "ethan", text: "但账面上它还在。只要还在，商队就不敢走这条路。", emotion: "calm" },
    ],
    choices: [
      { text: "以现任领主的身份全额结清这笔旧账", flags: { ch4_ledger_paid: true }, rewards: { gold: -600, renown: 36 }, reply: "索尔在账册上划掉了那一行，并在旁边写下：「已结清，经手人：灰隼堡领主」。" },
      { text: "把这笔账转为新契约：以道路维护折抵", flags: { ch4_ledger_converted: true }, rewards: { gold: 200, renown: 26 }, reply: "伊森算了半个时辰，最后把算盘推到你面前：「成交。」" },
    ],
    unlockFlags: ["ledger_resolved"],
  }),
  s({
    sceneKey: "story_ch4_hall",
    chapter: 4,
    title: "铁誓总堂",
    trigger: { nodeKey: "tv_iron_oath_hall" },
    beats: [
      { speaker: "旁白", text: "总堂地下是一条星辉矿脉。誓约化身站在矿脉入口，手里握着一把锤——那是商会立誓时敲下的第一锤。", emotion: "calm", bg: "hall" },
      { speaker: "誓约化身", text: "说出你要立的誓。说不出来，这扇门就不会开。", emotion: "calm" },
      { speaker: "索尔", charKey: "thor", text: "领主。这句话，得由你说。", emotion: "calm" },
    ],
    choices: [
      { text: "立誓：边境的每一条商路，都将有护送与补给", flags: { ch4_hall_oath_road: true }, rewards: { gold: 900, iron: 400, renown: 40 }, reply: "锤声落下。矿脉入口的星辉亮了一瞬，像是在记住这句话。" },
      { text: "立誓：商会的每一份契约，都由领主亲自作保", flags: { ch4_hall_oath_ledger: true }, rewards: { gold: 1100, renown: 34 }, reply: "誓约化身将锤交给索尔。索尔的手在抖，但接得很稳。" },
    ],
    unlockFlags: ["chapter4_complete"],
  }),
  s({
    sceneKey: "story_ch5_flats",
    chapter: 5,
    title: "晶簇荒原",
    trigger: { nodeKey: "sf_crystal_flats" },
    beats: [
      { speaker: "旁白", text: "地面全部是水晶，走上去会发出很轻的响声。每一块晶簇里都封着一小段画面——你在里面看到了灰隼堡的麦田。", emotion: "calm", bg: "crystal" },
      { speaker: "薇奥拉", charKey: "viola", text: "它在记录。裂隙一直在记录。", emotion: "hopeful" },
      { speaker: "梅芙琳", charKey: "maevrin", text: "……那另一边呢？被封在里面的那些人，还记得自己吗？", emotion: "sad" },
      { speaker: "薇奥拉", charKey: "viola", text: "我不知道。这是我第一次不敢下结论。", emotion: "sad" },
    ],
    choices: [
      { text: "带回几块晶簇，交由议事厅保管", flags: { ch5_flats_collected: true }, rewards: { aether: 160, renown: 20 }, reply: "晶簇被安置在议事厅最内侧的架子上。没有人主张打开它们。" },
      { text: "把晶簇留在原地，只在周围做标记", flags: { ch5_flats_leftasis: true }, rewards: { renown: 26, aether: 80 }, reply: "薇奥拉在标记旁写了一行字：请勿移动。未经许可，任何人不得带走这里的东西。" },
    ],
    unlockFlags: ["chapter5_started"],
  }),
  s({
    sceneKey: "story_ch5_bridge",
    chapter: 5,
    title: "错位之桥",
    trigger: { nodeKey: "sf_misaligned_bridge" },
    beats: [
      { speaker: "旁白", text: "桥的上一半和下一半不在同一个高度。走到桥中央时，你看见对面站着一个人——那是你自己，只是看起来比你疲惫一点。", emotion: "tense", bg: "bridge" },
      { speaker: "镜中之影", text: "你花了这么久，还是没把城墙修完。", emotion: "wry" },
      { speaker: "艾德里安", charKey: "adrian", text: "领主，它不是在说谎。它是在说我们担心的事。", emotion: "calm" },
    ],
    choices: [
      { text: "回答：那就再修一次", flags: { ch5_bridge_defiance: true }, rewards: { renown: 30, aether: 120 }, reply: "镜中之影笑了。它把手里那半块砖递过来，然后散在了雾里。" },
      { text: "回答：修不完的部分，留给愿意接着修的人", flags: { ch5_bridge_inherit: true }, rewards: { renown: 34, gold: 900 }, reply: "镜中之影沉默了一会儿，说：「这比我想的答案好一点。」" },
    ],
    unlockFlags: ["bridge_resolved"],
  }),
  s({
    sceneKey: "story_ch5_cavern",
    chapter: 5,
    title: "低语洞窟",
    trigger: { nodeKey: "sf_whisper_cavern" },
    beats: [
      { speaker: "旁白", text: "洞窟里所有声音都被放大了。你听见格蕾塔在念花名册，听见提奥在念抄本的第一页，听见莉赛尔在唱歌。", emotion: "sad", bg: "cavern" },
      { speaker: "蚀影·合声", text: "我们只是……不想消失。", emotion: "sad" },
      { speaker: "印·九号", charKey: "ink_nine", text: "……我理解这个。", emotion: "calm" },
      { speaker: "印·九号", charKey: "ink_nine", text: "被记住，和活着，不完全一样。但没有被记住，就等于从来没有过。", emotion: "calm" },
    ],
    choices: [
      { text: "记录所有听见的话，带回议事厅", flags: { ch5_cavern_recorded: true }, rewards: { aether: 200, renown: 30 }, reply: "记录用掉了六本册子。提奥说，这是他抄过最好的东西。" },
      { text: "在洞窟入口立碑，写明此处曾有声音", flags: { ch5_cavern_marked: true }, rewards: { renown: 36, iron: 400 }, reply: "碑立好的当晚，洞窟里的声音小了一半。" },
    ],
    unlockFlags: ["cavern_resolved"],
  }),
  s({
    sceneKey: "story_ch5_heart",
    chapter: 5,
    title: "裂隙之心",
    trigger: { nodeKey: "sf_rift_heart" },
    beats: [
      { speaker: "旁白", text: "裂隙之心不是一块晶体，而是一个缓慢旋转的空缺。空缺的边缘，清楚地写着整个大陆的地形。", emotion: "tense", bg: "heart" },
      { speaker: "裂隙拟态", text: "……你们终于来了。我等了很久。", emotion: "calm" },
      { speaker: "裂隙拟态", text: "我不是世界的伤口。我是世界写在外面的一行字。你们要不要读？", emotion: "calm" },
      { speaker: "薇奥拉", charKey: "viola", text: "领主。她说的和我推测的一模一样。我……我需要你替我确认。", emotion: "hopeful" },
    ],
    choices: [
      { text: "读。全体停下武器，听它把话说完", flags: { ch5_heart_read: true }, rewards: { aether: 260, renown: 46 }, reply: "它说的那些话被记成了七页。薇奥拉把那七页缝进了她的观测袍内侧。" },
      { text: "先立与它对话的规则：可以记录，但不接受任何单方面的索取", flags: { ch5_heart_terms: true }, rewards: { aether: 220, renown: 40 }, reply: "它答应了。它说，这是第一次有人跟它谈条件。" },
    ],
    unlockFlags: ["chapter5_complete"],
  }),
  s({
    sceneKey: "story_ch6_square",
    chapter: 6,
    title: "钟塔广场",
    trigger: { nodeKey: "ht_clock_square" },
    beats: [
      { speaker: "旁白", text: "钟塔还在报时，一下一下，很准。广场上没有人，钟声却从七年前一直响到现在。", emotion: "calm", bg: "square" },
      { speaker: "法兰", charKey: "fran", text: "……我听过这个钟声。撤退那天，它也是这样响的。", emotion: "sad" },
      { speaker: "艾德里安", charKey: "adrian", text: "钟是准的。不准的是我们。", emotion: "sad" },
    ],
    choices: [
      { text: "让钟继续响下去", flags: { ch6_clock_kept: true }, rewards: { renown: 30, aether: 140 }, reply: "钟声没有停。它成了这座废墟唯一还在工作的东西。" },
      { text: "派人上塔，把钟的时刻重新对准现在", flags: { ch6_clock_reset: true }, rewards: { renown: 38, gold: 1200 }, reply: "米拉校了两个小时。校完之后，钟声听起来比之前轻快。" },
    ],
    unlockFlags: ["chapter6_started"],
  }),
  s({
    sceneKey: "story_ch6_library",
    chapter: 6,
    title: "王家图书馆",
    trigger: { nodeKey: "ht_royal_library" },
    beats: [
      { speaker: "旁白", text: "图书馆的穹顶还在，但书全没了。残存的架子上贴着一张目录，写到第七百二十条就断了。", emotion: "sad", bg: "library" },
      { speaker: "提奥", charKey: "theo", text: "……这是我抄过的那张目录。断在这里，是因为剩下的我记不起来了。", emotion: "sad" },
      { speaker: "提奥", charKey: "theo", text: "领主。如果我从这里重新开始抄，会不会有一天，能把它补完？", emotion: "hopeful" },
    ],
    choices: [
      { text: "把提奥留下来，由领地供养他继续抄写", flags: { ch6_library_theo: true }, rewards: { renown: 44, aether: 180 }, reply: "提奥在图书馆的门口坐了下来，把最新的那本册子摊开在膝盖上。" },
      { text: "征召志愿者，成立抄写所", flags: { ch6_library_scriptorium: true }, rewards: { renown: 40, gold: 1400 }, reply: "第一天来了十一个人。提奥把他们的名字都写在了目录的第一页。" },
    ],
    unlockFlags: ["library_resolved"],
  }),
  s({
    sceneKey: "story_ch6_council",
    chapter: 6,
    title: "议会厅",
    trigger: { nodeKey: "ht_council_chamber" },
    beats: [
      { speaker: "旁白", text: "长桌还在，椅子翻倒了一半。桌上摊开着七年前没写完的议程，最后一条停在「关于边境封地的处置」。", emotion: "calm", bg: "council" },
      { speaker: "议会之影", text: "……请表决。", emotion: "calm" },
      { speaker: "议会之影", text: "边境封地，是否继续由瓦尔登家族持有？", emotion: "calm" },
      { speaker: "格蕾塔", charKey: "greta", text: "领主。它在等一票。", emotion: "tense" },
    ],
    choices: [
      { text: "投赞成票，以领主身份承担边境的处置权", flags: { ch6_council_hold: true }, rewards: { renown: 50, gold: 1600 }, reply: "议程上多了一行新的记录。议会之影把笔放下，第一次不再重复表决。" },
      { text: "投反对票，提议由边境自行推举代表", flags: { ch6_council_delegate: true }, rewards: { renown: 56, aether: 200 }, reply: "议会之影愣了很久，然后说：「记录：这是七年来第一次有人投反对票。」" },
    ],
    unlockFlags: ["council_resolved"],
  }),
  s({
    sceneKey: "story_ch6_throne",
    chapter: 6,
    title: "王座之影",
    trigger: { nodeKey: "ht_throne_shadow" },
    beats: [
      { speaker: "旁白", text: "王座是空的，但王座前站着一个人形，戴着王冠的轮廓。它并不愤怒，只是非常疲惫。", emotion: "sad", bg: "throne" },
      { speaker: "王冠回声", text: "……我等了七年，等一个愿意接手的人。", emotion: "sad" },
      { speaker: "王冠回声", text: "但我不能把它给你。你得自己决定，这片土地以后由谁说话。", emotion: "calm" },
      { speaker: "艾德里安", charKey: "adrian", text: "领主，这句话不是考验。这是交接。", emotion: "calm" },
    ],
    choices: [
      { text: "接过王冠的轮廓，以领主之名守护边境", flags: { ending_lord: true }, rewards: { renown: 70, gold: 2000 }, reply: "王冠落进你手里，轻得不像一件王权之物。它更像一枚印章。" },
      { text: "把王冠放在桌上，提议成立自由城邦联盟", flags: { ending_league: true }, rewards: { renown: 80, aether: 260 }, reply: "王冠在桌上躺了很久。最后是格蕾塔先开口：「那，谁先签？」" },
      { text: "把王冠交给愿意承担的人，自己只守住灰隼堡", flags: { ending_border: true }, rewards: { renown: 66, gold: 1500 }, reply: "你只带走了灰隼堡的旗。回程的路上，艾德里安一直没说话，到门口才说：「这样也好。」" },
    ],
    unlockFlags: ["chapter6_throne_resolved"],
  }),
  s({
    sceneKey: "story_ch6_tower",
    chapter: 6,
    title: "钟塔顶",
    trigger: { nodeKey: "ht_clock_tower" },
    beats: [
      { speaker: "旁白", text: "塔顶的风很大。从这里可以看见整片大陆——裂谷、林脉、矿谷、边境，全部连在一起。", emotion: "hopeful", bg: "tower_top" },
      { speaker: "裂隙拟态", text: "你已经知道了。裂隙不是终点。它是一道门，或者一封信。", emotion: "calm" },
      { speaker: "裂隙拟态", text: "接下来，由你们决定要不要回信。", emotion: "calm" },
      { speaker: "薇奥拉", charKey: "viola", text: "……我会写的。用我能写的最好的那一种写法。", emotion: "hopeful" },
      { speaker: "旁白", text: "钟声在塔下响起。这一次，它报的是此刻的时刻。", emotion: "hopeful" },
    ],
    choices: [
      { text: "在塔顶留下灰隼堡的旗", flags: { finale_banner: true }, rewards: { renown: 100, aether: 300 }, reply: "旗被钉在钟塔的北面。风一来，它就朝边境的方向展开。" },
      { text: "在塔顶留下一块空白的石板，供后来者书写", flags: { finale_blank: true }, rewards: { renown: 100, gold: 2500 }, reply: "石板上什么也没写。但所有人都知道它在那里。" },
    ],
    unlockFlags: ["story_complete"],
  }),
];

export const getScene = (sceneKey: string) => STORY_SEEDS.find((scene) => scene.sceneKey === sceneKey);
