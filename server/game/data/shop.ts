export type ShopCategory = "contract" | "supply" | "equipment";

type SubscriptionGrant = { kind: "subscription"; days: number };
type ItemGrant = { kind: "item"; itemKey: string; quantity: number };
type EquipmentGrant = { kind: "equipment"; equipKey: string; quantity: number };
export type ShopGrant = SubscriptionGrant | ItemGrant | EquipmentGrant;

/** 面向商会账册展示的真实权益、属性与套装词条。 */
export type ShopProperty = { label: string; value: string };

export type ShopProduct = {
  productKey: string;
  category: ShopCategory;
  name: string;
  subtitle: string;
  description: string;
  price: number;
  image: string;
  tags: string[];
  properties: ShopProperty[];
  limitPerProfile: number | null;
  grant: ShopGrant;
};

export type ShopItem = {
  itemKey: string;
  name: string;
  description: string;
  image: string;
  usable: boolean;
  staminaRestore?: number;
};

export const SHOP_ITEMS: ShopItem[] = [
  {
    itemKey: "item_march_ration",
    name: "行军补给券",
    description: "由商会配发的密封口粮与药剂。使用后恢复 12 点体力。",
    image: "/img/shop/field_supplies.png",
    usable: true,
    staminaRestore: 12,
  },
  {
    itemKey: "item_forge_coal",
    name: "锻炉炭盒",
    description: "含有三份耐燃锻炉炭，日后可在工坊用于锻造与强化。",
    image: "/img/shop/merchant_hammer.png",
    usable: false,
  },
];

export const SHOP_ITEM_BY_KEY = new Map(SHOP_ITEMS.map((item) => [item.itemKey, item]));

export const SHOP_PRODUCTS: ShopProduct[] = [
  {
    productKey: "shop_watcher_contract_30",
    category: "contract",
    name: "守望者契约 · 三十日",
    subtitle: "银杉商会的领主便利契约",
    description: "签订后立即延长有效会员三十日。契约期间可享更多体力重置、商队速收与自动续派权益。",
    price: 80,
    image: "/img/shop/watcher_contract.png",
    tags: ["30 日", "会员权益", "可续签"],
    properties: [
      { label: "体力重置", value: "每日 3 次（额外 +2 次）" },
      { label: "商队速收", value: "每日 5 次，每次结算 8 小时" },
      { label: "商队续派", value: "可开启自动续派" },
      { label: "议事额度", value: "每日 10 次（普通领主为 5 次）" },
    ],
    limitPerProfile: null,
    grant: { kind: "subscription", days: 30 },
  },
  {
    productKey: "shop_march_rations",
    category: "supply",
    name: "边境行军补给",
    subtitle: "五张行军补给券",
    description: "获得 5 张行军补给券；每张可在商会库存中使用，恢复 12 点体力。",
    price: 12,
    image: "/img/shop/field_supplies.png",
    tags: ["消耗品", "×5", "恢复体力"],
    properties: [
      { label: "即刻效果", value: "每份恢复 12 点体力" },
      { label: "整匣合计", value: "5 份，最多恢复 60 点体力" },
      { label: "使用位置", value: "商会库存" },
    ],
    limitPerProfile: null,
    grant: { kind: "item", itemKey: "item_march_ration", quantity: 5 },
  },
  {
    productKey: "shop_forge_coal",
    category: "supply",
    name: "锻炉炭盒",
    subtitle: "三份工造备用炭",
    description: "获得 3 份锻炉炭。材料会保存于商会库存，待工坊锻造功能启用后使用。",
    price: 16,
    image: "/img/shop/merchant_hammer.png",
    tags: ["锻造材料", "×3", "金库可查"],
    properties: [
      { label: "交付数量", value: "锻炉炭 ×3" },
      { label: "工造词条", value: "工坊启用后用于锻造与强化" },
      { label: "储存位置", value: "商会库存" },
    ],
    limitPerProfile: null,
    grant: { kind: "item", itemKey: "item_forge_coal", quantity: 3 },
  },
  {
    productKey: "shop_iron_oath_hammer",
    category: "equipment",
    name: "铁誓战锤",
    subtitle: "精锐 · 武器 · 需求等级 8",
    description: "商会护卫队长使用的战锤。装备属性、强化上限与普通获得的同名器具一致。",
    price: 72,
    image: "/img/shop/merchant_hammer.png",
    tags: ["SR 精锐", "直接入库", "账号限购 1 件"],
    properties: [
      { label: "基础属性", value: "攻击 +48 · 防御 +12" },
      { label: "套装词条", value: "铁誓契约 2 件：防御 +18 · 生命 +180" },
      { label: "强化规格", value: "需求等级 8 · 可强化至 15" },
    ],
    limitPerProfile: 1,
    grant: { kind: "equipment", equipKey: "eq_ironoath_hammer", quantity: 1 },
  },
  {
    productKey: "shop_wax_seal_charm",
    category: "equipment",
    name: "蜡封护符",
    subtitle: "精锐 · 饰品 · 需求等级 8",
    description: "以商会印鉴封存的护符。装备属性、强化上限与普通获得的同名器具一致。",
    price: 44,
    image: "/img/shop/watcher_contract.png",
    tags: ["SR 精锐", "直接入库", "账号限购 1 件"],
    properties: [
      { label: "基础属性", value: "抗性 +16 · 命中 +8 · 生命 +120" },
      { label: "套装词条", value: "铁誓契约 2 件：防御 +18 · 生命 +180" },
      { label: "强化规格", value: "需求等级 8 · 可强化至 15" },
    ],
    limitPerProfile: 1,
    grant: { kind: "equipment", equipKey: "eq_wax_seal_charm", quantity: 1 },
  },
];

export const SHOP_PRODUCT_BY_KEY = new Map(SHOP_PRODUCTS.map((product) => [product.productKey, product]));
