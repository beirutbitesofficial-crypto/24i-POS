/**
 * Inventory engine. All stock changes go through here, inside a DB transaction:
 *  - the variant row is locked (SELECT … FOR UPDATE) so concurrent sales can't oversell,
 *  - an append-only StockMovement row is written,
 *  - the cached ProductVariant.stockQty is updated,
 *  - lots are consumed FEFO (first-expiring, first-out), giving the real cost of goods.
 * Quantities are always in the variant's stock unit (kg for weight items).
 */
import { Prisma, type MovementType } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { D, Decimal, qty3 } from "@/lib/money";
import { BusinessError } from "../action";

export interface LockedVariant {
  id: string;
  stockQty: Decimal;
  cost: Decimal | null;
  name: string;
  allowsDecimal: boolean;
}

/** Lock variants in a stable order (prevents deadlocks between concurrent sales). */
export async function lockVariants(tx: Tx, organizationId: string, variantIds: string[]): Promise<Map<string, LockedVariant>> {
  const ids = [...new Set(variantIds)].sort();
  if (!ids.length) return new Map();
  const rows = await tx.$queryRaw<{ id: string; stockQty: Prisma.Decimal; cost: Prisma.Decimal | null; nameEn: string; allowsDecimal: boolean }[]>`
    SELECT v."id", v."stockQty", v."cost", p."nameEn", u."allowsDecimal"
    FROM "ProductVariant" v
    JOIN "Product" p ON p."id" = v."productId"
    JOIN "Unit" u ON u."id" = v."unitId"
    WHERE v."organizationId" = ${organizationId} AND v."id" IN (${Prisma.join(ids)})
    ORDER BY v."id"
    FOR UPDATE OF v`;
  if (rows.length !== ids.length) throw new BusinessError("VARIANT_NOT_FOUND");
  return new Map(
    rows.map((r) => [r.id, { id: r.id, stockQty: D(r.stockQty), cost: r.cost === null ? null : D(r.cost), name: r.nameEn, allowsDecimal: r.allowsDecimal }]),
  );
}

interface MoveBase {
  organizationId: string;
  variantId: string;
  type: MovementType;
  refType?: string | null;
  refId?: string | null;
  userId?: string | null;
  reason?: string | null;
}

async function setBalance(tx: Tx, variantId: string, delta: Decimal): Promise<Decimal> {
  const updated = await tx.productVariant.update({
    where: { id: variantId },
    data: { stockQty: { increment: delta.toString() } },
    select: { stockQty: true },
  });
  return D(updated.stockQty);
}

/**
 * Add stock as a new lot (purchase, positive adjustment, conversion output, opening stock).
 * If the variant is currently negative (sold before it was received), the deficit is
 * back-filled first so lots never hold more than physical stock.
 */
export async function addStock(
  tx: Tx,
  args: MoveBase & {
    quantity: Decimal.Value;
    unitCost: Decimal.Value;
    lotNumber?: string | null;
    expiryDate?: Date | null;
    source: "PURCHASE" | "ADJUSTMENT" | "CONVERSION" | "RETURN" | "OPENING";
    purchaseItemId?: string | null;
    current: LockedVariant;
  },
) {
  const q = qty3(args.quantity);
  if (q.lte(0)) throw new BusinessError("QTY_MUST_BE_POSITIVE");
  const deficit = Decimal.max(0, args.current.stockQty.neg());
  const lotQty = Decimal.max(0, q.minus(deficit));
  const lot = await tx.inventoryLot.create({
    data: {
      organizationId: args.organizationId,
      variantId: args.variantId,
      lotNumber: args.lotNumber || null,
      expiryDate: args.expiryDate ?? null,
      quantityIn: q.toString(),
      quantityLeft: lotQty.toString(),
      unitCost: D(args.unitCost).toString(),
      source: args.source,
      purchaseItemId: args.purchaseItemId ?? null,
    },
  });
  const balance = await setBalance(tx, args.variantId, q);
  args.current.stockQty = balance;
  await tx.stockMovement.create({
    data: {
      organizationId: args.organizationId,
      variantId: args.variantId,
      lotId: lot.id,
      type: args.type,
      quantity: q.toString(),
      unitCost: D(args.unitCost).toString(),
      balanceAfter: balance.toString(),
      reason: args.reason ?? null,
      refType: args.refType ?? null,
      refId: args.refId ?? null,
      userId: args.userId ?? null,
    },
  });
  return lot;
}

export interface Consumption {
  cost: Decimal;
  allocations: { lotId: string | null; quantity: Decimal; unitCost: Decimal; expiryDate: Date | null }[];
}

/**
 * Remove stock FEFO (optionally from a preferred lot first).
 * Returns the actual cost of the quantity removed, from recorded lot costs.
 */
export async function removeStock(
  tx: Tx,
  args: MoveBase & {
    quantity: Decimal.Value;
    allowNegative: boolean;
    preferredLotId?: string | null;
    current: LockedVariant;
  },
): Promise<Consumption> {
  const q = qty3(args.quantity);
  if (q.lte(0)) throw new BusinessError("QTY_MUST_BE_POSITIVE");
  if (!args.allowNegative && args.current.stockQty.lt(q)) {
    throw new BusinessError("INSUFFICIENT_STOCK", { name: args.current.name, available: args.current.stockQty.toString() });
  }

  const lots = await tx.inventoryLot.findMany({
    where: { organizationId: args.organizationId, variantId: args.variantId, quantityLeft: { gt: 0 } },
    orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
  });
  if (args.preferredLotId) {
    const i = lots.findIndex((l) => l.id === args.preferredLotId);
    if (i > 0) lots.unshift(...lots.splice(i, 1));
  }

  let remaining = q;
  let cost = new Decimal(0);
  const allocations: Consumption["allocations"] = [];
  for (const lot of lots) {
    if (remaining.lte(0)) break;
    const take = Decimal.min(remaining, D(lot.quantityLeft));
    await tx.inventoryLot.update({ where: { id: lot.id }, data: { quantityLeft: { decrement: take.toString() } } });
    allocations.push({ lotId: lot.id, quantity: take, unitCost: D(lot.unitCost), expiryDate: lot.expiryDate });
    cost = cost.plus(take.mul(D(lot.unitCost)));
    remaining = remaining.minus(take);
  }
  if (remaining.gt(0)) {
    // Not covered by any lot (stock was never received / negative stock allowed)
    const fallback = args.current.cost ?? new Decimal(0);
    allocations.push({ lotId: null, quantity: remaining, unitCost: fallback, expiryDate: null });
    cost = cost.plus(remaining.mul(fallback));
  }

  let balance = args.current.stockQty;
  for (const a of allocations) {
    balance = await setBalance(tx, args.variantId, a.quantity.neg());
    await tx.stockMovement.create({
      data: {
        organizationId: args.organizationId,
        variantId: args.variantId,
        lotId: a.lotId,
        type: args.type,
        quantity: a.quantity.neg().toString(),
        unitCost: a.unitCost.toString(),
        balanceAfter: balance.toString(),
        reason: args.reason ?? null,
        refType: args.refType ?? null,
        refId: args.refId ?? null,
        userId: args.userId ?? null,
      },
    });
  }
  args.current.stockQty = balance;
  return { cost: cost.toDecimalPlaces(4), allocations };
}

/**
 * Return sold stock back to the lots it came from (keeps original expiry & cost).
 * Any portion that was sold without a lot comes back as a new RETURN lot.
 */
export async function returnSoldStock(
  tx: Tx,
  args: { organizationId: string; variantId: string; saleId: string; quantity: Decimal.Value; unitCost: Decimal.Value; userId: string; refundId: string; current: LockedVariant },
) {
  let remaining = qty3(args.quantity);
  const moves = await tx.stockMovement.findMany({
    where: { organizationId: args.organizationId, variantId: args.variantId, refId: args.saleId, type: { in: ["SALE", "REFUND"] }, lotId: { not: null } },
    select: { lotId: true, quantity: true, type: true },
  });
  const outstanding = new Map<string, Decimal>();
  for (const m of moves) {
    const prev = outstanding.get(m.lotId!) ?? new Decimal(0);
    // SALE rows are negative; REFUND rows positive → outstanding = sold − returned
    outstanding.set(m.lotId!, prev.minus(D(m.quantity)));
  }
  for (const [lotId, avail] of outstanding) {
    if (remaining.lte(0)) break;
    if (avail.lte(0)) continue;
    const back = Decimal.min(avail, remaining);
    const lot = await tx.inventoryLot.update({ where: { id: lotId }, data: { quantityLeft: { increment: back.toString() } } });
    const balance = await setBalance(tx, args.variantId, back);
    args.current.stockQty = balance;
    await tx.stockMovement.create({
      data: {
        organizationId: args.organizationId, variantId: args.variantId, lotId, type: "REFUND",
        quantity: back.toString(), unitCost: lot.unitCost, balanceAfter: balance.toString(),
        refType: "SALE", refId: args.saleId, reason: `refund:${args.refundId}`, userId: args.userId,
      },
    });
    remaining = remaining.minus(back);
  }
  if (remaining.gt(0)) {
    await addStock(tx, {
      organizationId: args.organizationId, variantId: args.variantId, type: "REFUND", quantity: remaining,
      unitCost: args.unitCost, source: "RETURN", refType: "SALE", refId: args.saleId, reason: `refund:${args.refundId}`,
      userId: args.userId, current: args.current,
    });
  }
}
