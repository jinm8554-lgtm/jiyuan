import { eq } from "drizzle-orm";
import { z } from "zod";
import { gameProfiles, playerCharacters, regionStates, recruitPools, storyScenes } from "../../drizzle/schema";
import { getDb } from "../db";
import { BUILDING_SEEDS } from "../game/data/buildings";
import { SET_BONUSES } from "../game/data/equipments";
import { NODE_SEEDS, REGION_SEEDS } from "../game/data/world";
import { ELEMENT_LABEL, JOB_LABEL, RARITY_LABEL, RESOURCE_LABEL } from "../game/formulas";
import { loadRoster } from "../game/service";
import { completeTutorialAction, syncTutorialProgress, TUTORIAL_STEPS } from "../game/tutorial";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { resolveProfile } from "./_shared";

/** 世界观设定文本（原创，全年龄向） */
const LORE = {
  world: "瓦尔德兰大陆",
  subtitle: "裂隙纪元 · Aetherfall Chronicle",
  tagline: "当天空裂开，世界学会了用记忆当作燃料。",
  era: "裂隙纪元第 7 年",
  summary:
    "七年前的「星陨之夜」，天空裂开一道长缝。裂缝中涌出两样东西：星辉（Aether）与蚀影（Blightborn）。星辉让凡人第一次摸到魔法的温度，蚀影则把一切未曾安葬的记忆重新拖回地面。旧王国凯尔文尼亚联合王国在盐铁战争、灰喉疫病与魔物灾害中崩坏，王都高塔城陷落，贵族各自固守。你继承了瓦尔登家族最后的封地——银杉边境上的灰隼堡。",
  playerRole:
    "你是瓦尔登家族最后的继承人。家族留下的不是财富，而是一张写满债务与承诺的账本，以及一面被反复缝补的灰隼旗。你的选择将决定边境是成为新的王国，还是一个被遗忘的避难所。",
  tone: "克制、温暖、带着疲惫的希望。冲突来自资源、信仰、误会与旧战争创伤，而非堕落或猎奇。",
  factions: [
    { key: "crown_remnant", name: "王国余晖", motto: "旗不倒，就不算亡国。", note: "旧王国的骑士团残部，把秩序当作信仰。", alignment: "秩序" },
    { key: "ember_creed", name: "圣焰教团", motto: "火只用来照亮，不用来判决。", note: "从救灾中诞生的教团，救治与传道并行。", alignment: "慈悲" },
    { key: "starcourse_academy", name: "星轨学院", motto: "记录本身就是抵抗。", note: "研究者团体，用观测与档案对抗遗忘。", alignment: "求知" },
    { key: "ironsworn_guild", name: "铁誓商会", motto: "契约比城墙更牢固。", note: "以契约为法的商旅联盟，掌控盐路与铁矿。", alignment: "中立" },
    { key: "forestspeakers", name: "森语者联盟", motto: "树记得的事，人未必记得。", note: "林地守护者与草药师的共同体。", alignment: "自然" },
    { key: "crownless_ring", name: "无冕之环", motto: "不属于任何王座。", note: "流浪者与流亡者组成的松散联盟。", alignment: "自由" },
  ],
  glossary: [
    { term: "裂隙", text: "天空裂缝的统称，也是星辉与蚀影的源头。共 7 处，已知可通行 3 处。" },
    { term: "星辉", text: "从裂隙渗出的乳白色浮尘，可储存、可锻打，是炼金与魔法的燃料。" },
    { term: "蚀影", text: "被裂隙留住的记忆残渣。它们并非种族，而是执念的具象，动机是「想要被记住」。" },
    { term: "灰隼堡", text: "银杉边境南缘的旧堡。南墙多处漏风，账册常有赤字，城门上的灰隼旗经年补缀不止。" },
    { term: "银杉边境", text: "王国最北的封地，松林、旧矿道与一条时常改道的河。" },
    { term: "誓约联结", text: "骑士之间的承伤誓约：把同伴的伤分一半给自己。" },
  ],
  chapters: [
    { chapter: 1, title: "灰隼之旗", summary: "修好南墙，点亮灯塔，让流亡者知道这里还有屋檐。" },
    { chapter: 2, title: "灰喉之后", summary: "疫病过境的第二年，粮食比刀剑更锋利。" },
    { chapter: 3, title: "盐路与铁", summary: "与铁誓商会谈判，盐路穿过的村子里有人还没吃上饭。" },
    { chapter: 4, title: "旧战争的名字", summary: "南方荒原上埋着的不是尸体，是没被念出的名字。" },
    { chapter: 5, title: "第一道裂隙", summary: "裂隙第一次开口说话，它只是想要一个人记得它。" },
    { chapter: 6, title: "黎明之前", summary: "高塔城的方向亮了。要不要去，由你决定。" },
  ],
  allAgesNote:
    "《裂隙纪元》为全年龄向作品：不含色情内容、性奴役、色情服装或身体羞辱。全部角色以冒险者、骑士、法师、领主、学者、工匠等正向身份登场，亲密表达限于友情、同伴信任、家族羁绊、骑士精神与轻度恋爱。",
};

const TUTORIAL_COPY = {
  welcome_keep: { label: "巡视灰隼堡", hint: "先看看你继承的建筑与物资。", href: "/keep" },
  inspect_keep: { label: "认识灰隼堡主城", hint: "查看建筑和资源，了解领地的发展基础。", href: "/keep" },
  build_wall: { label: "修复南墙", hint: "城墙升级完成后，灰隼堡才能拥有第一项防御加成。", href: "/keep" },
  finish_wall: { label: "结算南墙施工", hint: "让灰隼堡正式获得这项防御加成。", href: "/keep" },
  form_expedition: { label: "编成第一支远征队", hint: "至少安排一名同伴进入队伍并保存编成。", href: "/roster" },
  enter_world: { label: "前往灰隼堡外郊", hint: "在世界地图查看第一个可探索节点。", href: "/world" },
  first_battle: { label: "完成第一场战斗", hint: "可手动战斗，也可在合适时使用自动战斗。", href: "/world" },
  claim_battle_rewards: { label: "查看第一次远征收获", hint: "战利品已经由远征结算写入档案。", href: "/keep" },
  council_talk: { label: "在议事厅听取意见", hint: "与至少一名同伴完成一次会谈。", href: "/council" },
  first_recruit: { label: "完成一次普通招募", hint: "普通招募的概率与消耗均在招募页公开。", href: "/recruit" },
  tutorial_complete: { label: "灰隼堡的第一天", hint: "第一条远征循环已经完成。", href: "/keep" },
} as const;

export const metaRouter = router({
  /** 世界观百科（无需登录即可阅读） */
  lore: publicProcedure.query(() => LORE),

  /** 设计字典（职业 / 元素 / 属性 / 稀有度的展示名称） */
  dictionaries: publicProcedure.query(() => ({
    jobs: JOB_LABEL,
    elements: ELEMENT_LABEL,
    stats: {
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
    },
    resources: RESOURCE_LABEL,
    rarities: RARITY_LABEL,
    buildings: BUILDING_SEEDS.map((building) => ({ buildingKey: building.buildingKey, name: building.name, category: building.category, iconKey: building.iconKey, maxLevel: building.maxLevel })),
    equipmentSets: Object.entries(SET_BONUSES).map(([setKey, tiers]) => ({
      setKey,
      name: tiers[0]?.name ?? setKey,
      bonuses: tiers,
    })),
  })),

  /** 系统健康（用于前端错误提示与运维检查） */
  health: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) {
      return { ok: false, database: "unavailable" as const, message: "数据库连接不可用，部分功能将不可用" };
    }
    try {
      await db.select().from(recruitPools).limit(1);
      return { ok: true, database: "ok" as const, message: "运行正常" };
    } catch (error) {
      return { ok: false, database: "error" as const, message: `数据库查询失败：${(error as Error).message.slice(0, 120)}` };
    }
  }),

  /** 新手引导状态 */
  onboarding: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    const tutorial = await syncTutorialProgress(profile.id);
    const [profileRow] = db ? await db.select().from(gameProfiles).where(eq(gameProfiles.id, profile.id)).limit(1) : [];
    const regions = db ? await db.select().from(regionStates).where(eq(regionStates.profileId, profile.id)) : [];
    const owned = db ? await db.select().from(playerCharacters).where(eq(playerCharacters.profileId, profile.id)) : [];
    const completed = new Set(tutorial?.completedKeys ?? []);
    const steps = TUTORIAL_STEPS.map((key) => ({ id: key, ...TUTORIAL_COPY[key], done: Boolean(tutorial?.skipped || completed.has(key)) }));
    const nextStep = tutorial && !tutorial.skipped ? { key: tutorial.currentKey, ...TUTORIAL_COPY[tutorial.currentKey] } : null;

    return {
      tutorialStep: profileRow?.tutorialStep ?? 0,
      tutorialVersion: tutorial?.version ?? null,
      skipped: tutorial?.skipped ?? true,
      currentKey: tutorial?.currentKey ?? null,
      completedKeys: tutorial?.completedKeys ?? [],
      chapter: profileRow?.chapter ?? 1,
      targets: profileRow?.settings && typeof (profileRow.settings as Record<string, unknown>).targets === "object" ? (profileRow.settings as Record<string, unknown>).targets : null,
      steps,
      nextStep,
      summary: {
        characterCount: owned.length,
        regionUnlocked: regions.filter((region) => region.unlocked).length,
        totalRegions: REGION_SEEDS.length,
        totalNodes: NODE_SEEDS.length,
      },
    };
  }),

  /** 仅记录可由界面完成的引导行为；游戏业务步骤由各自 router 在落库后推进。 */
  completeTutorialAction: protectedProcedure
    .input(z.object({ action: z.enum(["dismiss_welcome", "inspect_keep", "enter_world", "skip_tutorial"]) }))
    .mutation(async ({ ctx, input }) => {
      const profile = await resolveProfile(ctx);
      const tutorial = await completeTutorialAction(profile.id, input.action);
      return { ok: Boolean(tutorial), tutorial };
    }),

  /** 更新引导进度（仅推进，不回退） */
  setOnboardingStep: protectedProcedure.input(z.object({ step: z.number().int().min(0).max(20) })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) return { ok: false };
    const [row] = await db.select().from(gameProfiles).where(eq(gameProfiles.id, profile.id)).limit(1);
    if (!row) return { ok: false };
    if (input.step > row.tutorialStep) {
      await db.update(gameProfiles).set({ tutorialStep: input.step }).where(eq(gameProfiles.id, profile.id));
    }
    return { ok: true, tutorialStep: Math.max(row.tutorialStep, input.step) };
  }),

  /** 剧情章节索引 */
  chapters: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { chapters: LORE.chapters, scenes: [] };
    const scenes = await db.select().from(storyScenes);
    return {
      chapters: LORE.chapters,
      scenes: scenes.map((scene) => ({ sceneKey: scene.sceneKey, chapter: scene.chapter, title: scene.title, beatCount: (scene.beats ?? []).length })),
    };
  }),

  /** 首页营销信息（未登录可见） */
  landing: publicProcedure.query(() => ({
    title: "裂隙纪元 · Aetherfall Chronicle",
    subtitle: "全年龄向中世纪西幻领地 RPG",
    tagline: LORE.tagline,
    features: [
      { title: "领地经营", text: "从漏风的南墙开始，重建酒馆、兵营、工坊、图书馆、议事厅、市场与城墙。" },
      { title: "伙伴集结", text: "原创角色各有立场与目标，羁绊与好感由你的选择累积。" },
      { title: "区域征服", text: "35 个节点、6 大区域，控制度与贸易收益实时保存。" },
      { title: "回合战斗", text: "7 大职业分工明确，元素克制、阵型与装备真正影响胜负。" },
      { title: "AI 角色互动", text: "只有你选中的在场角色会发言，AI 不会替你改写任何设定。" },
      { title: "全年龄向", text: "冲突来自资源、信仰与旧伤，没有成人向内容作为卖点。" },
    ],
    chapters: LORE.chapters.map((chapter) => ({ chapter: chapter.chapter, title: chapter.title })),
  })),
});
