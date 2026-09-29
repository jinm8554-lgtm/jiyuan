import { and, desc, eq, gte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { gameProfiles, playerEquipments, playerItems, shopPurchases, users } from "../../drizzle/schema";
import { getDb } from "../db";
import { EQUIP_BY_KEY } from "../game/data/equipments";
import { SHOP_ITEM_BY_KEY, SHOP_PRODUCTS, SHOP_PRODUCT_BY_KEY, type ShopProduct } from "../game/data/shop";
import { accrueProfile } from "../game/service";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveProfile } from "./_shared";

const crownCoinName = "王冠金铢";

function productGrant(product: ShopProduct) {
  if (product.grant.kind === "subscription") return { type: "subscription", days: product.grant.days };
  if (product.grant.kind === "item") return { type: "item", itemKey: product.grant.itemKey, quantity: product.grant.quantity };
  return { type: "equipment", equipKey: product.grant.equipKey, quantity: product.grant.quantity };
}

function serializeProduct(product: ShopProduct, purchaseCount: number) {
  return {
    ...product,
    purchaseCount,
    remainingPurchases: product.limitPerProfile === null ? null : Math.max(0, product.limitPerProfile - purchaseCount),
  };
}

export const shopRouter = router({
  /** 商品目录、专用货币余额、商会库存与最近账本。 */
  catalog: protectedProcedure.query(async ({ ctx }) => {
    const profile = await resolveProfile(ctx);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

    const [purchases, items, user] = await Promise.all([
      db.select().from(shopPurchases).where(eq(shopPurchases.profileId, profile.id)).orderBy(desc(shopPurchases.createdAt), desc(shopPurchases.id)).limit(50),
      db.select().from(playerItems).where(eq(playerItems.profileId, profile.id)),
      db.select({ membership: users.membership, membershipExpiresAt: users.membershipExpiresAt }).from(users).where(eq(users.id, profile.userId)).limit(1),
    ]);
    const purchaseCounts = new Map<string, number>();
    for (const purchase of purchases) purchaseCounts.set(purchase.productKey, (purchaseCounts.get(purchase.productKey) ?? 0) + 1);
    const now = new Date();
    const member = user[0];
    const membershipActive = member?.membership === "supporter" && (!member.membershipExpiresAt || member.membershipExpiresAt.getTime() > now.getTime());

    return {
      currency: { key: "crownCoins", name: crownCoinName, balance: profile.crownCoins },
      membership: { active: membershipActive, expiresAt: member?.membershipExpiresAt ?? null },
      products: SHOP_PRODUCTS.map((product) => serializeProduct(product, purchaseCounts.get(product.productKey) ?? 0)),
      inventory: items.flatMap((row) => {
        const item = SHOP_ITEM_BY_KEY.get(row.itemKey);
        return item && row.quantity > 0 ? [{ ...item, playerItemId: row.id, quantity: row.quantity, source: row.source }] : [];
      }),
      purchases: purchases.map((purchase) => ({
        ...purchase,
        productName: SHOP_PRODUCT_BY_KEY.get(purchase.productKey)?.name ?? purchase.productKey,
      })),
    };
  }),

  /** 使用商会消耗品。效果与库存扣除均在服务端事务中完成。 */
  useItem: protectedProcedure.input(z.object({ itemKey: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const item = SHOP_ITEM_BY_KEY.get(input.itemKey);
    const staminaRestore = item?.staminaRestore;
    if (!item || !item.usable || staminaRestore === undefined) throw new TRPCError({ code: "BAD_REQUEST", message: "该物品暂不可使用" });
    await accrueProfile(profile.id);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

    return db.transaction(async (tx) => {
      const [current] = await tx.select().from(gameProfiles).where(eq(gameProfiles.id, profile.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "档案不存在" });
      const [result] = await tx
        .update(playerItems)
        .set({ quantity: sql`${playerItems.quantity} - 1` })
        .where(and(eq(playerItems.profileId, profile.id), eq(playerItems.itemKey, item.itemKey), gte(playerItems.quantity, 1)));
      if (result.affectedRows !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: "库存不足" });
      const stamina = Math.min(current.staminaMax, current.stamina + staminaRestore);
      await tx.update(gameProfiles).set({ stamina, staminaUpdatedAt: new Date() }).where(eq(gameProfiles.id, profile.id));
      return { ok: true, itemKey: item.itemKey, stamina, restored: Math.max(0, stamina - current.stamina) };
    });
  }),

  /** 以王冠金铢购买商品。支付渠道只负责补充金铢，商品发放不信任客户端。 */
  purchase: protectedProcedure.input(z.object({ productKey: z.string().min(1).max(64) })).mutation(async ({ ctx, input }) => {
    const profile = await resolveProfile(ctx);
    const product = SHOP_PRODUCT_BY_KEY.get(input.productKey);
    if (!product) throw new TRPCError({ code: "NOT_FOUND", message: "商会未登记这件货物" });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "数据库连接暂不可用" });

    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(gameProfiles).where(eq(gameProfiles.id, profile.id)).limit(1);
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "档案不存在" });
      const purchases = await tx.select({ id: shopPurchases.id }).from(shopPurchases).where(and(eq(shopPurchases.profileId, profile.id), eq(shopPurchases.productKey, product.productKey)));
      if (product.limitPerProfile !== null && purchases.length >= product.limitPerProfile) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "这件货物的领主限购次数已用完" });
      }
      const [deduct] = await tx
        .update(gameProfiles)
        .set({ crownCoins: sql`${gameProfiles.crownCoins} - ${product.price}` })
        .where(and(eq(gameProfiles.id, profile.id), gte(gameProfiles.crownCoins, product.price)));
      if (deduct.affectedRows !== 1) throw new TRPCError({ code: "BAD_REQUEST", message: `${crownCoinName}不足` });

      const granted = productGrant(product);
      if (product.grant.kind === "subscription") {
        const [account] = await tx.select().from(users).where(eq(users.id, current.userId)).limit(1);
        if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "账号不存在" });
        const now = new Date();
        const base = account.membership === "supporter" && account.membershipExpiresAt && account.membershipExpiresAt.getTime() > now.getTime()
          ? account.membershipExpiresAt
          : now;
        const expiresAt = new Date(base.getTime() + product.grant.days * 24 * 60 * 60 * 1000);
        await tx.update(users).set({ membership: "supporter", membershipExpiresAt: expiresAt }).where(eq(users.id, current.userId));
      } else if (product.grant.kind === "item") {
        const [existing] = await tx.select().from(playerItems).where(and(eq(playerItems.profileId, profile.id), eq(playerItems.itemKey, product.grant.itemKey))).limit(1);
        if (existing) {
          await tx.update(playerItems).set({ quantity: existing.quantity + product.grant.quantity, source: "shop" }).where(eq(playerItems.id, existing.id));
        } else {
          await tx.insert(playerItems).values({ profileId: profile.id, itemKey: product.grant.itemKey, quantity: product.grant.quantity, source: "shop" });
        }
      } else {
        const { equipKey, quantity } = product.grant;
        if (!EQUIP_BY_KEY.has(equipKey)) throw new TRPCError({ code: "NOT_FOUND", message: "商品装备配置缺失" });
        await tx.insert(playerEquipments).values(Array.from({ length: quantity }, () => ({ profileId: profile.id, equipKey, source: "shop", rolls: {} })));
      }
      await tx.insert(shopPurchases).values({ profileId: profile.id, productKey: product.productKey, crownCoinsSpent: product.price, granted });
      return { balance: current.crownCoins - product.price, granted };
    });
    return { ok: true, productKey: product.productKey, ...result };
  }),
});
