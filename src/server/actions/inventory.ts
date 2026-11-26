"use server";
import { z } from "zod";
import { db, tbl } from "@/lib/db";
import { D, Decimal, money, qty3 } from "@/lib/money";
import { orgAction, BusinessError } from "../action";
import { audit } from "../audit";
import { nextNumber } from "../counter";
import { addStock, lockVariants, removeStock } from "../services/inventory";

const qtyStr = z.union([z.string(), z.number()]).transform(String).refine((v) => /^\d+(\.\d{1,3})?$/.test(v) && Number(v) > 0, "invalid_number");
const costStr = z.union([z.string(), z.number()]).transform(String).refine((v) => /^\d+(\.\d{1,4})?$/.test(v), "invalid_number");
const dateStr = z.string().nullish().transform((v) => (v ? new Date(v) : null)).refine((d) => d === null || !isNaN(d.getTime()), "invalid_date");
const optStr = (max = 200) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

async function assertWholeUnits(organizationId: string, items: { variantId: string; quantity: string }[]) {
  const vs = await db.productVariant.findMany({ where: { organizationId, id: { in: items.map((i) => i.variantId) } }, include: { unit: true, product: true } });
  if (vs.length !== new Set(items.map((i) => i.variantId)).size) throw new BusinessError("VARIANT_NOT_FOUND");
  for (const i of items) {
    const v = vs.find((x) => x.id === i.variantId)!;
    if (!v.unit.allowsDecimal && !D(i.quantity).isInteger()) throw new BusinessError("QTY_MUST_BE_WHOLE", { name: v.product.nameEn });
  }
  return vs;
}

// ───────────── Receiving (purchases) ─────────────
export const receivePurchase = orgAction(
  "inventory.manage",
  z.object({
    supplierId: optStr(40),
    invoiceRef: optStr(60),
    receivedAt: dateStr,
    notes: optStr(500),
    updateCost: z.boolean().default(true),
    lines: z.array(z.object({ variantId: z.string(), quantity: qtyStr, unitCost: costStr, lotNumber: optStr(60), expiryDate: dateStr })).min(1).max(200),
  }),
  async (input, user) => {
    const orgId = user.organizationId;
    if (input.supplierId) await db.supplier.findFirstOrThrow({ where: { id: input.supplierId, organizationId: orgId } });
    await assertWholeUnits(orgId, input.lines);
    return db.$transaction(async (tx) => {
      const locked = await lockVariants(tx, orgId, input.lines.map((l) => l.variantId));
      const number = await nextNumber(tx, orgId, "purchase");
      const total = input.lines.reduce((s, l) => s.plus(money(D(l.quantity).mul(D(l.unitCost)))), new Decimal(0));
      const purchase = await tx.purchase.create({
        data: { organizationId: orgId, number, supplierId: input.supplierId, invoiceRef: input.invoiceRef, receivedAt: input.receivedAt ?? new Date(), total: total.toString(), notes: input.notes, userId: user.id },
      });
      for (const l of input.lines) {
        const item = await tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id, variantId: l.variantId, quantity: qty3(l.quantity).toString(), unitCost: l.unitCost,
            lineTotal: money(D(l.quantity).mul(D(l.unitCost))).toString(), lotNumber: l.lotNumber, expiryDate: l.expiryDate,
          },
        });
        await addStock(tx, {
          organizationId: orgId, variantId: l.variantId, type: "PURCHASE", quantity: l.quantity, unitCost: l.unitCost, lotNumber: l.lotNumber,
          expiryDate: l.expiryDate, source: "PURCHASE", purchaseItemId: item.id, refType: "PURCHASE", refId: purchase.id, userId: user.id,
          current: locked.get(l.variantId)!,
        });
        if (input.updateCost) {
          await tx.productVariant.update({ where: { id: l.variantId }, data: { cost: l.unitCost, ...(input.supplierId ? { supplierId: input.supplierId } : {}) } });
        }
      }
      await audit({ organizationId: orgId, userId: user.id, action: "purchase.receive", entity: "Purchase", entityId: purchase.id, details: { number, total: total.toString() } }, tx);
      return { id: purchase.id, number };
    }, { timeout: 30000 });
  },
);

// ───────────── Adjustments & waste ─────────────
export const adjustStock = orgAction(
  "inventory.manage",
  z.object({
    variantId: z.string(),
    kind: z.enum(["ADD", "REMOVE", "WASTE"]),
    quantity: qtyStr,
    unitCost: costStr.nullish(),
    expiryDate: dateStr,
    lotId: optStr(40),
    reason: z.string().trim().min(2).max(300),
  }),
  async (input, user) => {
    const orgId = user.organizationId;
    const [v] = await assertWholeUnits(orgId, [input]);
    return db.$transaction(async (tx) => {
      const locked = await lockVariants(tx, orgId, [input.variantId]);
      const current = locked.get(input.variantId)!;
      if (input.kind === "ADD") {
        const cost = input.unitCost ?? v.cost?.toString() ?? "0";
        await addStock(tx, {
          organizationId: orgId, variantId: input.variantId, type: "ADJUSTMENT", quantity: input.quantity, unitCost: cost, expiryDate: input.expiryDate,
          source: "ADJUSTMENT", reason: input.reason, refType: "ADJUSTMENT", userId: user.id, current,
        });
      } else {
        await removeStock(tx, {
          organizationId: orgId, variantId: input.variantId, type: input.kind === "WASTE" ? "WASTE" : "ADJUSTMENT", quantity: input.quantity,
          allowNegative: false, preferredLotId: input.lotId, reason: input.reason, refType: "ADJUSTMENT", userId: user.id, current,
        });
      }
      await audit({ organizationId: orgId, userId: user.id, action: `stock.${input.kind.toLowerCase()}`, entity: "ProductVariant", entityId: input.variantId,
        details: { quantity: input.quantity, reason: input.reason } }, tx);
      return { balance: current.stockQty.toString() };
    });
  },
);

// ───────────── Conversion (bulk → packed) ─────────────
export const convertStock = orgAction(
  "inventory.manage",
  z.object({ fromVariantId: z.string(), fromQty: qtyStr, toVariantId: z.string(), toQty: qtyStr, notes: optStr(300) }),
  async (input, user) => {
    const orgId = user.organizationId;
    if (input.fromVariantId === input.toVariantId) throw new BusinessError("SAME_VARIANT");
    await assertWholeUnits(orgId, [{ variantId: input.fromVariantId, quantity: input.fromQty }, { variantId: input.toVariantId, quantity: input.toQty }]);
    return db.$transaction(async (tx) => {
      const locked = await lockVariants(tx, orgId, [input.fromVariantId, input.toVariantId]);
      const conv = await tx.stockConversion.create({
        data: { organizationId: orgId, fromVariantId: input.fromVariantId, fromQty: input.fromQty, toVariantId: input.toVariantId, toQty: input.toQty, totalCost: "0", notes: input.notes, userId: user.id },
      });
      const out = await removeStock(tx, {
        organizationId: orgId, variantId: input.fromVariantId, type: "CONVERSION_OUT", quantity: input.fromQty, allowNegative: false,
        refType: "CONVERSION", refId: conv.id, userId: user.id, reason: input.notes, current: locked.get(input.fromVariantId)!,
      });
      const unitCost = out.cost.div(D(input.toQty)).toDecimalPlaces(4);
      const expiries = out.allocations.map((a) => a.expiryDate).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
      await addStock(tx, {
        organizationId: orgId, variantId: input.toVariantId, type: "CONVERSION_IN", quantity: input.toQty, unitCost, expiryDate: expiries[0] ?? null,
        source: "CONVERSION", refType: "CONVERSION", refId: conv.id, userId: user.id, reason: input.notes, current: locked.get(input.toVariantId)!,
      });
      await tx.stockConversion.update({ where: { id: conv.id }, data: { totalCost: out.cost.toString() } });
      await audit({ organizationId: orgId, userId: user.id, action: "stock.convert", entity: "StockConversion", entityId: conv.id, details: { fromQty: input.fromQty, toQty: input.toQty } }, tx);
      return { id: conv.id, unitCost: unitCost.toString() };
    });
  },
);

// ───────────── Stock counts ─────────────
export const startCount = orgAction("inventory.manage", z.object({ categoryId: optStr(40), notes: optStr(300) }), async (input, user) => {
  const orgId = user.organizationId;
  const variants = await db.productVariant.findMany({
    where: { organizationId: orgId, active: true, trackStock: true, ...(input.categoryId ? { product: { categoryId: input.categoryId } } : {}) },
    select: { id: true, stockQty: true },
  });
  const count = await db.stockCount.create({
    data: {
      organizationId: orgId, notes: input.notes, createdById: user.id,
      items: { create: variants.map((v) => ({ variantId: v.id, expectedQty: v.stockQty })) },
    },
  });
  return { id: count.id };
});

export const saveCount = orgAction(
  "inventory.manage",
  z.object({ countId: z.string(), items: z.array(z.object({ variantId: z.string(), countedQty: z.string().nullable() })) }),
  async (input, user) => {
    const count = await db.stockCount.findFirst({ where: { id: input.countId, organizationId: user.organizationId } });
    if (!count || count.status !== "OPEN") throw new BusinessError("COUNT_NOT_OPEN");
    await db.$transaction(
      input.items.map((i) => {
        const v = i.countedQty === null || i.countedQty.trim() === "" ? null : i.countedQty.trim();
        if (v !== null && !/^\d+(\.\d{1,3})?$/.test(v)) throw new BusinessError("VALIDATION");
        return db.stockCountItem.update({ where: { countId_variantId: { countId: count.id, variantId: i.variantId } }, data: { countedQty: v } });
      }),
    );
    return { id: count.id };
  },
);

/** Post a count: stock is set to the counted quantity (difference vs. the live balance is booked as COUNT movements). */
export const postCount = orgAction("inventory.manage", z.object({ countId: z.string() }), async ({ countId }, user) => {
  const orgId = user.organizationId;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM ${tbl("StockCount")} WHERE id = ${countId} AND "organizationId" = ${orgId} FOR UPDATE`;
    const count = await tx.stockCount.findFirst({ where: { id: countId, organizationId: orgId }, include: { items: { where: { countedQty: { not: null } } } } });
    if (!count || count.status !== "OPEN") throw new BusinessError("COUNT_NOT_OPEN");
    const locked = await lockVariants(tx, orgId, count.items.map((i) => i.variantId));
    const variants = await tx.productVariant.findMany({ where: { id: { in: count.items.map((i) => i.variantId) } }, select: { id: true, cost: true } });
    let adjusted = 0;
    for (const item of count.items) {
      const cur = locked.get(item.variantId)!;
      const diff = D(item.countedQty).minus(cur.stockQty);
      if (diff.isZero()) continue;
      adjusted++;
      if (diff.gt(0)) {
        await addStock(tx, {
          organizationId: orgId, variantId: item.variantId, type: "COUNT", quantity: diff, unitCost: variants.find((v) => v.id === item.variantId)?.cost?.toString() ?? "0",
          source: "ADJUSTMENT", refType: "COUNT", refId: count.id, userId: user.id, reason: "stock count", current: cur,
        });
      } else {
        await removeStock(tx, {
          organizationId: orgId, variantId: item.variantId, type: "COUNT", quantity: diff.neg(), allowNegative: true,
          refType: "COUNT", refId: count.id, userId: user.id, reason: "stock count", current: cur,
        });
      }
    }
    await tx.stockCount.update({ where: { id: count.id }, data: { status: "POSTED", postedAt: new Date() } });
    await audit({ organizationId: orgId, userId: user.id, action: "stock.count_post", entity: "StockCount", entityId: count.id, details: { adjusted } }, tx);
    return { adjusted };
  }, { timeout: 60000 });
});

export const cancelCount = orgAction("inventory.manage", z.object({ countId: z.string() }), async ({ countId }, user) => {
  const c = await db.stockCount.findFirst({ where: { id: countId, organizationId: user.organizationId } });
  if (!c || c.status !== "OPEN") throw new BusinessError("COUNT_NOT_OPEN");
  await db.stockCount.update({ where: { id: c.id }, data: { status: "CANCELLED" } });
  return { id: c.id };
});

// ───────────── Suppliers ─────────────
export const saveSupplier = orgAction(
  "suppliers.manage",
  z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(120), contactName: optStr(120), phone: optStr(40), address: optStr(300), notes: optStr(500), active: z.boolean().default(true) }),
  async (input, user) => {
    const { id, ...data } = input;
    if (id) {
      await db.supplier.update({ where: { id, organizationId: user.organizationId }, data });
      return { id };
    }
    const s = await db.supplier.create({ data: { ...data, organizationId: user.organizationId } });
    return { id: s.id };
  },
);

export const deleteSupplier = orgAction("suppliers.manage", z.object({ id: z.string() }), async ({ id }, user) => {
  const used = await db.purchase.count({ where: { supplierId: id, organizationId: user.organizationId } });
  if (used) throw new BusinessError("HAS_TRANSACTIONS");
  await db.productVariant.updateMany({ where: { supplierId: id, organizationId: user.organizationId }, data: { supplierId: null } });
  await db.supplier.delete({ where: { id, organizationId: user.organizationId } });
  return { id };
});
