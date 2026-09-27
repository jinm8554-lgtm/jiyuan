/**
 * 美术资源映射（原创生成资产的本地静态路径）
 * 全部图片由本项目独立生成并打包进 client/public/aetherfall-assets，
 * 不含任何第三方受版权保护的素材。重新生成资产时替换该目录文件并更新此处映射。
 */

export const CHARACTER_ASSETS: Record<string, { portraitUrl: string; avatarUrl: string }> = {
  adrian: { portraitUrl: "/aetherfall-assets/adrian_8067e277.jpg", avatarUrl: "/aetherfall-assets/adrian_c0d665d6.jpg" },
  maevrin: { portraitUrl: "/aetherfall-assets/maevrin_626f5a89.jpg", avatarUrl: "/aetherfall-assets/maevrin_992c392d.jpg" },
  viola: { portraitUrl: "/aetherfall-assets/viola_854f816a.jpg", avatarUrl: "/aetherfall-assets/viola_60625126.jpg" },
  liesel: { portraitUrl: "/aetherfall-assets/liesel_f93a8b4b.jpg", avatarUrl: "/aetherfall-assets/liesel_9ec5dd35.jpg" },
  ink_nine: { portraitUrl: "/aetherfall-assets/ink_nine_76ceea95.jpg", avatarUrl: "/aetherfall-assets/ink_nine_dfe0492a.jpg" },
  thor: { portraitUrl: "/aetherfall-assets/thor_617e4621.jpg", avatarUrl: "/aetherfall-assets/thor_957bb652.jpg" },
  kalan: { portraitUrl: "/aetherfall-assets/kalan_b4804a3f.jpg", avatarUrl: "/aetherfall-assets/kalan_10b8d660.jpg" },
  mira: { portraitUrl: "/aetherfall-assets/mira_e7721f72.jpg", avatarUrl: "/aetherfall-assets/mira_e00c5f73.jpg" },
  nova: { portraitUrl: "/aetherfall-assets/nova_516c7f23.jpg", avatarUrl: "/aetherfall-assets/nova_e7b50a57.jpg" },
  cecilia: { portraitUrl: "/aetherfall-assets/cecilia_97c6563c.jpg", avatarUrl: "/aetherfall-assets/cecilia_18a30cf3.jpg" },
  orok: { portraitUrl: "/aetherfall-assets/orok_e4541269.jpg", avatarUrl: "/aetherfall-assets/orok_097559a2.jpg" },
  greta: { portraitUrl: "/aetherfall-assets/greta_34f5911a.jpg", avatarUrl: "/aetherfall-assets/greta_cf56bc71.jpg" },
  theo: { portraitUrl: "/aetherfall-assets/theo_b069915d.jpg", avatarUrl: "/aetherfall-assets/theo_7cc8dd6d.jpg" },
  fran: { portraitUrl: "/aetherfall-assets/fran_c8140d67.jpg", avatarUrl: "/aetherfall-assets/fran_71c31899.jpg" },
  ethan: { portraitUrl: "/aetherfall-assets/ethan_30d1b08e.jpg", avatarUrl: "/aetherfall-assets/ethan_e0a32bea.jpg" },
};

export const REGION_ASSETS: Record<string, string> = {
  silverpine: "/aetherfall-assets/keep_home_34f36c55.jpg",
  ashenmoor: "/aetherfall-assets/battlefield_ad38f8db.jpg",
  saltroad: "/aetherfall-assets/keep_29934050.jpg",
  duskridge: "/aetherfall-assets/worldmap_72ac880b.jpg",
  riftscar: "/aetherfall-assets/keep_banner_999e1122.jpg",
  highspire: "/aetherfall-assets/council_d4b84b1c.jpg",
};

export const SCENE_ASSETS = {
  keepHome: "/aetherfall-assets/keep_home_34f36c55.jpg",
  keepBanner: "/aetherfall-assets/keep_banner_999e1122.jpg",
  keep: "/aetherfall-assets/keep_29934050.jpg",
  worldmap: "/aetherfall-assets/worldmap_72ac880b.jpg",
  council: "/aetherfall-assets/council_d4b84b1c.jpg",
  battlefield: "/aetherfall-assets/battlefield_ad38f8db.jpg",
};

/** 头像兜底（图片加载失败时使用的纯 CSS 首字母牌，不依赖网络） */
export const AVATAR_FALLBACK_NOTE = "所有头像/立绘均为本项目原创生成资产；加载失败时前端回退为纹章首字母牌。";

/** 区域美术兜底 */
export const REGION_FALLBACK = "";
