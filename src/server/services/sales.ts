import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { D, Decimal, money, qty3, roundLbp, type RoundingMode } from "@/lib/money";
import { priceCart, settle, tenderToBase } from "@/lib/pricing";
import { authorize, type OrgUser } from "@/lib/auth";
import { BusinessError } from "../action";
import { nextNumber } from "../counter";
import { audit } from "../audit";
import { lockVariants, removeStock, returnSoldStock } from "./inventory";

const decimalStr = z.union([z.string(), z.number()]).transform((v) => String(v)).refine((v) => /^-?\d+(\.\d+)?$/.test(v), "invalid_number");

export const saleInputSchema = z.object({
  clientRef: z.string().min(8).max(64),
  lines: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: decimalStr,
        discountType: z.enum(["PERCENT", "AMOUNT"]).nullish(),
        discountValue: decimalStr.nullish(),
        priceOverride: decimalStr.nullish(),
      }),
    )
    .min(1, "empty_cart")
    .max(300),
  cartDiscount: z.object({ type: z.enum(["PERCENT", "AMOUNT"]), value: decimalStr }).nullish(),
  payments: z
    .array(z.object({ method: z.enum(["CASH", "CARD", "TRANSFER"]), currency: z.enum(["USD", "LBP"]), amount: decimalStr }))
    .min(1)
    .max(10),
  changeCurrency: z.enum(["USD", "LBP", "MIXED"]).default("USD"),
  approverPin: z.string().max(6).nullish(),
  note: z.string().max(300).nullish(),
});
export type SaleInput = z.infer<typeof saleInputSchema>;

export async function getOpenShift(organizationId: string, userId: string) {
  return db.cashShift.findFirst({ where: { organizationId, userId, closedAt: null } });
}

export async function createSale(user: OrgUser, input: SaleInput) {
  const orgId = user.organizationId;

  // Idempotency: a retried submission returns the original sale.
  const existing = await db.sale.findUnique({ where: { organizationId_clientRef: { organizationId: orgId, clientRef: input.clientRef } } });
  if (existing) return { saleId: existing.id, number: existing.number, duplicate: true, changeUsd: existing.changeUsd.toString(), changeLbp: existing.changeLbp.toString() };

  const shift = await getOpenShift(orgId, user.id);
  if (!shift) throw new BusinessError("NO_OPEN_SHIFT");

  const settings = await db.storeSettings.findUniqueOrThrow({ where: { organizationId: orgId } });
  const variants = await db.productVariant.findMany({
    where: { organizationId: orgId, id: { in: input.lines.map((l) => l.variantId) } },
    include: { product: { include: { category: true } }, brand: true, variety: true, unit: true },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  let needsPriceOverride = false;
  const lines = input.lines.map((l) => {
    const v = byId.get(l.variantId);
    if (!v || !v.active || !v.product.active) throw new BusinessError("PRODUCT_UNAVAILABLE");
    const q = qty3(l.quantity);
    if (q.lte(0)) throw new BusinessError("QTY_MUST_BE_POSITIVE");
    if (!v.unit.allowsDecimal && !q.isInteger()) throw new BusinessError("QTY_MUST_BE_WHOLE", { name: v.product.nameEn });
    let unitPrice: Decimal;
    let overridden = false;
    if (l.priceOverride !== null && l.priceOverride !== undefined) {
      unitPrice = D(l.priceOverride);
      if (unitPrice.lt(0)) throw new BusinessError("INVALID_PRICE");
      overridden = v.price === null || !unitPrice.eq(D(v.price));
      if (overridden) needsPriceOverride = true;
    } else {
      if (v.price === null) throw new BusinessError("PRICE_NOT_CONFIGURED", { name: v.product.nameEn });
      unitPrice = D(v.price);
    }
    return { input: l, variant: v, quantity: q, unitPrice, overridden };
  });

  const tax = { enabled: settings.taxEnabled, rate: D(settings.taxRate), inclusive: settings.taxInclusive };
  const priced = priceCart(
    lines.map((l) => ({
      quantity: l.quantity, unitPrice: l.unitPrice, discountType: l.input.discountType, discountValue: l.input.discountValue,
      taxable: l.variant.product.taxable,
    })),
    input.cartDiscount ?? {},
    tax,
  );
  if (priced.total.lt(0)) throw new BusinessError("INVALID_TOTAL");

  // Approvals (server-enforced): discounts beyond the cashier limit, price overrides
  let approvedBy: string | null = null;
  if (priced.discountTotal.gt(0) && !priced.subtotal.isZero()) {
    const pct = priced.discountTotal.div(priced.subtotal).mul(100);
    if (pct.gt(D(settings.cashierMaxDiscount))) {
      approvedBy = (await authorize(user, "pos.discount", input.approverPin)).approvedBy ?? approvedBy;
    }
  }
  if (needsPriceOverride) approvedBy = (await authorize(user, "pos.price_override", input.approverPin)).approvedBy ?? approvedBy;

  // Payments
  const rate = D(settings.exchangeRate);
  const cfg = { rate, lbpIncrement: settings.lbpRounding, lbpMode: settings.lbpRoundingMode as RoundingMode };
  const tenders = input.payments.map((p) => ({ ...p, amount: D(p.amount) })).filter((p) => p.amount.gt(0));
  if (!tenders.length && priced.total.gt(0)) throw new BusinessError("PAYMENT_REQUIRED");
  const nonCash = tenders.filter((t) => t.method !== "CASH").reduce((s, t) => s.plus(tenderToBase(t, rate)), new Decimal(0));
  if (nonCash.gt(priced.total.plus("0.005"))) throw new BusinessError("NON_CASH_OVERPAY");
  const st = settle(priced.total, tenders, cfg, input.changeCurrency);
  if (!st.covered) throw new BusinessError("PAYMENT_INSUFFICIENT", { remaining: st.remainingUsd.toString() });

  try {
    return await db.$transaction(
      async (tx) => {
        const locked = await lockVariants(tx, orgId, lines.map((l) => l.variant.id));
        const number = await nextNumber(tx, orgId, "sale");
        const sale = await tx.sale.create({
          data: {
            organizationId: orgId, number, clientRef: input.clientRef, cashierId: user.id, shiftId: shift.id,
            subtotal: priced.subtotal.toString(), discountTotal: priced.discountTotal.toString(),
            cartDiscountType: input.cartDiscount?.type ?? null, cartDiscountValue: input.cartDiscount ? D(input.cartDiscount.value).toString() : null,
            taxTotal: priced.taxTotal.toString(), total: priced.total.toString(), costTotal: "0",
            exchangeRate: rate.toString(), paidTotal: st.paidBase.toDecimalPlaces(4).toString(),
            changeUsd: st.changeUsd.toString(), changeLbp: st.changeLbp.toString(), roundingAdj: st.roundingAdj.toDecimalPlaces(4).toString(),
            approvedById: approvedBy, note: input.note ?? null,
          },
        });

        let costTotal = new Decimal(0);
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          const p = priced.lines[i];
          const v = l.variant;
          const consumption = await removeStock(tx, {
            organizationId: orgId, variantId: v.id, type: "SALE", quantity: l.quantity, allowNegative: settings.allowNegativeStock,
            refType: "SALE", refId: sale.id, userId: user.id, current: locked.get(v.id)!,
          });
          costTotal = costTotal.plus(consumption.cost);
          await tx.saleItem.create({
            data: {
              saleId: sale.id, variantId: v.id, nameAr: v.product.nameAr, nameEn: v.product.nameEn,
              brandName: v.brand ? `${v.brand.nameEn}|${v.brand.nameAr}` : null,
              variantLabel: [v.variety ? `${v.variety.nameEn}|${v.variety.nameAr}` : null, v.labelEn ? `${v.labelEn}|${v.labelAr ?? v.labelEn}` : null].filter(Boolean).join(" · ") || null,
              categoryId: v.product.categoryId, unitCode: v.unit.code, sellMode: v.sellMode,
              quantity: l.quantity.toString(), unitPrice: l.unitPrice.toString(), priceOverridden: l.overridden,
              discountType: l.input.discountType ?? null, discountValue: l.input.discountValue ? D(l.input.discountValue).toString() : null,
              discountAmount: p.discountAmount.toString(), lineTotal: p.lineTotal.toString(), taxAmount: p.tax.toString(),
              costTotal: consumption.cost.toString(),
            },
          });
        }
        await tx.sale.update({ where: { id: sale.id }, data: { costTotal: costTotal.toDecimalPlaces(4).toString() } });
        await tx.payment.createMany({
          data: tenders.map((t) => ({
            saleId: sale.id, method: t.method, currency: t.currency, amount: money(t.amount).toString(),
            amountBase: tenderToBase(t, rate).toDecimalPlaces(4).toString(),
          })),
        });
        if (approvedBy || lines.some((l) => l.overridden)) {
          await audit({ organizationId: orgId, userId: user.id, action: "sale.approved_adjustment", entity: "Sale", entityId: sale.id,
            details: { approvedBy, discountTotal: priced.discountTotal.toString(), overrides: lines.filter((l) => l.overridden).map((l) => l.variant.sku) } }, tx);
        }
        return { saleId: sale.id, number, duplicate: false, changeUsd: st.changeUsd.toString(), changeLbp: st.changeLbp.toString() };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20000 },
    );
  } catch (e) {
    // Two identical submissions raced: return the winner.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const s = await db.sale.findUnique({ where: { organizationId_clientRef: { organizationId: orgId, clientRef: input.clientRef } } });
      if (s) return { saleId: s.id, number: s.number, duplicate: true, changeUsd: s.changeUsd.toString(), changeLbp: s.changeLbp.toString() };
    }
    throw e;
  }
}

// ───────────────────────── Refunds ─────────────────────────

export const refundInputSchema = z.object({
  clientRef: z.string().min(8).max(64),
  saleId: z.string(),
  items: z.array(z.object({ saleItemId: z.string(), quantity: decimalStr, restock: z.boolean() })).min(1),
  reason: z.string().trim().min(2).max(300),
  method: z.enum(["CASH", "CARD", "TRANSFER"]),
  currency: z.enum(["USD", "LBP"]),
  approverPin: z.string().max(6).nullish(),
});
export type RefundInput = z.infer<typeof refundInputSchema>;

export async function createRefund(user: OrgUser, input: RefundInput) {
  const orgId = user.organizationId;
  const dup = await db.refund.findUnique({ where: { organizationId_clientRef: { organizationId: orgId, clientRef: input.clientRef } } });
  if (dup) return { refundId: dup.id, number: dup.number, duplicate: true };

  const { approvedBy } = await authorize(user, "pos.refund", input.approverPin);
  const shift = await getOpenShift(orgId, user.id);
  if (input.method === "CASH" && !shift) throw new BusinessError("NO_OPEN_SHIFT");
  const settings = await db.storeSettings.findUniqueOrThrow({ where: { organizationId: orgId } });

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${input.saleId} AND "organizationId" = ${orgId} FOR UPDATE`;
    const sale = await tx.sale.findFirst({ where: { id: input.saleId, organizationId: orgId }, include: { items: true } });
    if (!sale) throw new BusinessError("NOT_FOUND");

    const itemMap = new Map(sale.items.map((i) => [i.id, i]));
    const plan = input.items
      .map((r) => {
        const it = itemMap.get(r.saleItemId);
        if (!it) throw new BusinessError("NOT_FOUND");
        const q = qty3(r.quantity);
        if (q.lte(0)) return null;
        const left = D(it.quantity).minus(D(it.refundedQty));
        if (q.gt(left)) throw new BusinessError("REFUND_EXCEEDS_SOLD", { name: it.nameEn, available: left.toString() });
        // Full remaining quantity → exact remaining amount (avoids cent drift)
        const fullLeft = q.eq(left);
        const refundedSoFar = money(D(it.lineTotal).mul(D(it.refundedQty)).div(D(it.quantity)));
        const amount = fullLeft ? D(it.lineTotal).minus(refundedSoFar) : money(D(it.lineTotal).mul(q).div(D(it.quantity)));
        const costAmount = D(it.costTotal).mul(q).div(D(it.quantity)).toDecimalPlaces(4);
        return { item: it, q, amount, costAmount, restock: r.restock };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (!plan.length) throw new BusinessError("NOTHING_TO_REFUND");

    const total = plan.reduce((s, p) => s.plus(p.amount), new Decimal(0));
    const costTotal = plan.reduce((s, p) => s.plus(p.costAmount), new Decimal(0));
    const rate = D(sale.exchangeRate);
    const amountPaid = input.currency === "USD" ? money(total) : roundLbp(total.mul(rate), settings.lbpRounding, settings.lbpRoundingMode as RoundingMode);

    const number = await nextNumber(tx, orgId, "refund");
    const refund = await tx.refund.create({
      data: {
        organizationId: orgId, number, clientRef: input.clientRef, saleId: sale.id, userId: user.id, approvedById: approvedBy,
        shiftId: shift?.id ?? null, reason: input.reason, total: total.toString(), costTotal: costTotal.toString(),
        method: input.method, currency: input.currency, amountPaid: amountPaid.toString(), exchangeRate: rate.toString(),
      },
    });

    const restockIds = plan.filter((p) => p.restock).map((p) => p.item.variantId);
    const locked = await lockVariants(tx, orgId, restockIds);
    for (const p of plan) {
      await tx.refundItem.create({
        data: { refundId: refund.id, saleItemId: p.item.id, quantity: p.q.toString(), amount: p.amount.toString(), costAmount: p.costAmount.toString(), restocked: p.restock },
      });
      await tx.saleItem.update({ where: { id: p.item.id }, data: { refundedQty: { increment: p.q.toString() } } });
      if (p.restock) {
        await returnSoldStock(tx, {
          organizationId: orgId, variantId: p.item.variantId, saleId: sale.id, quantity: p.q,
          unitCost: D(p.item.costTotal).div(D(p.item.quantity)).toDecimalPlaces(4), userId: user.id, refundId: refund.id,
          current: locked.get(p.item.variantId)!,
        });
      }
    }
    const items = await tx.saleItem.findMany({ where: { saleId: sale.id } });
    const fully = items.every((i) => D(i.refundedQty).gte(D(i.quantity)));
    await tx.sale.update({ where: { id: sale.id }, data: { status: fully ? "REFUNDED" : "PARTIALLY_REFUNDED" } });
    await audit({ organizationId: orgId, userId: user.id, action: "refund.create", entity: "Refund", entityId: refund.id,
      details: { saleNumber: sale.number, total: total.toString(), approvedBy, reason: input.reason } }, tx);
    return { refundId: refund.id, number, duplicate: false };
  });
}

// ───────────────────────── Shifts ─────────────────────────

export async function shiftExpectedCash(shiftId: string) {
  const shift = await db.cashShift.findUniqueOrThrow({ where: { id: shiftId } });
  const [payments, change, moves, refunds] = await Promise.all([
    db.payment.groupBy({ by: ["currency"], where: { method: "CASH", sale: { shiftId } }, _sum: { amount: true } }),
    db.sale.aggregate({ where: { shiftId }, _sum: { changeUsd: true, changeLbp: true } }),
    db.cashMovement.groupBy({ by: ["direction", "currency"], where: { shiftId }, _sum: { amount: true } }),
    db.refund.groupBy({ by: ["currency"], where: { shiftId, method: "CASH" }, _sum: { amountPaid: true } }),
  ]);
  const pay = (c: string) => D(payments.find((p) => p.currency === c)?._sum.amount);
  const mv = (d: string, c: string) => D(moves.find((m) => m.direction === d && m.currency === c)?._sum.amount);
  const rf = (c: string) => D(refunds.find((r) => r.currency === c)?._sum.amountPaid);
  const usd = D(shift.openingUsd).plus(pay("USD")).minus(D(change._sum.changeUsd)).plus(mv("IN", "USD")).minus(mv("OUT", "USD")).minus(rf("USD"));
  const lbp = D(shift.openingLbp).plus(pay("LBP")).minus(D(change._sum.changeLbp)).plus(mv("IN", "LBP")).minus(mv("OUT", "LBP")).minus(rf("LBP"));
  return {
    usd: money(usd), lbp: lbp.toDecimalPlaces(0),
    breakdown: {
      openingUsd: D(shift.openingUsd), openingLbp: D(shift.openingLbp),
      salesUsd: pay("USD"), salesLbp: pay("LBP"),
      changeUsd: D(change._sum.changeUsd), changeLbp: D(change._sum.changeLbp),
      inUsd: mv("IN", "USD"), inLbp: mv("IN", "LBP"), outUsd: mv("OUT", "USD"), outLbp: mv("OUT", "LBP"),
      refundsUsd: rf("USD"), refundsLbp: rf("LBP"),
    },
  };
}
