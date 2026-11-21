import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { createSale, createRefund, shiftExpectedCash } from "@/server/services/sales";
import { addStock, lockVariants, removeStock } from "@/server/services/inventory";
import { makeOrg, makeUser, makeVariant, openShift } from "./helpers";

async function receive(orgId: string, variantId: string, qty: string, cost: string, expiry?: string) {
  await db.$transaction(async (tx) => {
    const locked = await lockVariants(tx, orgId, [variantId]);
    await addStock(tx, {
      organizationId: orgId, variantId, type: "PURCHASE", quantity: qty, unitCost: cost, source: "PURCHASE",
      expiryDate: expiry ? new Date(expiry) : null, current: locked.get(variantId)!,
    });
  });
}

describe("sales engine", () => {
  let ctx: Awaited<ReturnType<typeof makeOrg>>;
  beforeAll(async () => { ctx = await makeOrg(); });

  it("deducts weight in kg, uses FEFO lot costs and is idempotent", async () => {
    const cashier = await makeUser(ctx.org.id, "CASHIER");
    await openShift(ctx.org.id, cashier.id);
    const v = await makeVariant(ctx.org.id, ctx.product.id, ctx.units.get("kg")!, { price: "12" });
    await receive(ctx.org.id, v.id, "2", "6", "2030-01-10");
    await receive(ctx.org.id, v.id, "2", "8", "2030-01-05"); // expires first → consumed first

    const input = {
      clientRef: "sale-abc-123456",
      lines: [{ variantId: v.id, quantity: "0.5" }],
      payments: [{ method: "CASH" as const, currency: "USD" as const, amount: "10" }],
      changeCurrency: "USD" as const,
    };
    const r1 = await createSale(cashier, input);
    const r2 = await createSale(cashier, input);
    expect(r2.duplicate).toBe(true);
    expect(r2.saleId).toBe(r1.saleId);

    const sale = await db.sale.findUniqueOrThrow({ where: { id: r1.saleId }, include: { items: true } });
    expect(sale.total.toString()).toBe("6");
    expect(sale.changeUsd.toString()).toBe("4");
    expect(sale.costTotal.toString()).toBe("4"); // 0.5 kg × $8 from the earlier-expiring lot
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(after.stockQty.toString()).toBe("3.5");
    const lots = await db.inventoryLot.findMany({ where: { variantId: v.id }, orderBy: { expiryDate: "asc" } });
    expect(lots[0].quantityLeft.toString()).toBe("1.5");
  });

  it("concurrent duplicate submissions create exactly one sale", async () => {
    const cashier = await makeUser(ctx.org.id, "CASHIER");
    await openShift(ctx.org.id, cashier.id);
    const v = await makeVariant(ctx.org.id, ctx.product.id, ctx.units.get("piece")!, { price: "1", mode: "UNIT" });
    await receive(ctx.org.id, v.id, "10", "0.5");
    const input = {
      clientRef: "race-0000-1111", lines: [{ variantId: v.id, quantity: "1" }],
      payments: [{ method: "CASH" as const, currency: "USD" as const, amount: "1" }], changeCurrency: "USD" as const,
    };
    const results = await Promise.all([createSale(cashier, input), createSale(cashier, input), createSale(cashier, input)]);
    expect(new Set(results.map((r) => r.saleId)).size).toBe(1);
    const stock = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(stock.stockQty.toString()).toBe("9");
  });

  it("blocks unpriced products, oversell, fractional pieces and short payment", async () => {
    const cashier = await makeUser(ctx.org.id, "CASHIER");
    await openShift(ctx.org.id, cashier.id);
    const unpriced = await makeVariant(ctx.org.id, ctx.product.id, ctx.units.get("kg")!, { price: null });
    const pay = [{ method: "CASH" as const, currency: "USD" as const, amount: "100" }];
    await expect(createSale(cashier, { clientRef: "x-unpriced-1", lines: [{ variantId: unpriced.id, quantity: "1" }], payments: pay, changeCurrency: "USD" }))
      .rejects.toThrow("PRICE_NOT_CONFIGURED");

    const v = await makeVariant(ctx.org.id, ctx.product.id, ctx.units.get("kg")!, { price: "10" });
    await receive(ctx.org.id, v.id, "1", "5");
    await expect(createSale(cashier, { clientRef: "x-oversell-1", lines: [{ variantId: v.id, quantity: "1.5" }], payments: pay, changeCurrency: "USD" }))
      .rejects.toThrow("INSUFFICIENT_STOCK");

    const pc = await makeVariant(ctx.org.id, ctx.product.id, ctx.units.get("jar")!, { price: "3", mode: "UNIT" });
    await receive(ctx.org.id, pc.id, "5", "1");
    await expect(createSale(cashier, { clientRef: "x-frac-0001", lines: [{ variantId: pc.id, quantity: "1.5" }], payments: pay, changeCurrency: "USD" }))
      .rejects.toThrow("QTY_MUST_BE_WHOLE");
    await expect(createSale(cashier, { clientRef: "x-short-001", lines: [{ variantId: pc.id, quantity: "2" }], payments: [{ method: "CASH", currency: "USD", amount: "5" }], changeCurrency: "USD" }))
      .rejects.toThrow("PAYMENT_INSUFFICIENT");
    // nothing was deducted by the failed attempts
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stockQty.toString()).toBe("1");
  });

  it("requires manager PIN for discounts above the cashier limit", async () => {
    const cashier = await makeUser(ctx.org.id, "CASHIER");
    await makeUser(ctx.org.id, "MANAGER", "4321");
    await openShift(ctx.org.id, cashier.id);
    const v = await makeVariant(ctx.org.id, ctx.product.id, ctx.units.get("piece")!, { price: "10", mode: "UNIT" });
    await receive(ctx.org.id, v.id, "10", "4");
    const base = {
      lines: [{ variantId: v.id, quantity: "1" }], cartDiscount: { type: "PERCENT" as const, value: "20" },
      payments: [{ method: "CASH" as const, currency: "USD" as const, amount: "8" }], changeCurrency: "USD" as const,
    };
    await expect(createSale(cashier, { ...base, clientRef: "disc-no-pin-1" })).rejects.toThrow("APPROVAL_REQUIRED");
    await expect(createSale(cashier, { ...base, clientRef: "disc-bad-pin-1", approverPin: "0000" })).rejects.toThrow("INVALID_PIN");
    const ok = await createSale(cashier, { ...base, clientRef: "disc-good-pin", approverPin: "4321" });
    const sale = await db.sale.findUniqueOrThrow({ where: { id: ok.saleId } });
    expect(sale.total.toString()).toBe("8");
    expect(sale.approvedById).not.toBeNull();
  });

  it("split USD/LBP payment, refund restocks to the original lot, shift cash reconciles", async () => {
    const cashier = await makeUser(ctx.org.id, "CASHIER");
    const manager = await makeUser(ctx.org.id, "MANAGER", "9876");
    const shift = await openShift(ctx.org.id, cashier.id);
    await openShift(ctx.org.id, manager.id);
    const v = await makeVariant(ctx.org.id, ctx.product.id, ctx.units.get("kg")!, { price: "10" });
    await receive(ctx.org.id, v.id, "3", "6", "2030-02-01");

    const r = await createSale(cashier, {
      clientRef: "split-sale-0001", lines: [{ variantId: v.id, quantity: "2.5" }], // $25
      payments: [{ method: "CASH", currency: "USD", amount: "20" }, { method: "CASH", currency: "LBP", amount: "450000" }],
      changeCurrency: "LBP",
    });
    const sale = await db.sale.findUniqueOrThrow({ where: { id: r.saleId }, include: { items: true } });
    expect(sale.total.toString()).toBe("25");

    const exp = await shiftExpectedCash(shift.id);
    expect(exp.usd.toString()).toBe("120");
    expect(exp.lbp.toString()).toBe(sale.changeLbp.neg().plus(450000).toString());

    // Cashier can't refund without PIN
    await expect(createRefund(cashier, {
      clientRef: "refund-nopin-1", saleId: sale.id, items: [{ saleItemId: sale.items[0].id, quantity: "1", restock: true }],
      reason: "customer return", method: "CASH", currency: "USD",
    })).rejects.toThrow("APPROVAL_REQUIRED");

    const rf = await createRefund(manager, {
      clientRef: "refund-0000-01", saleId: sale.id, items: [{ saleItemId: sale.items[0].id, quantity: "1", restock: true }],
      reason: "customer return", method: "CASH", currency: "USD",
    });
    const refund = await db.refund.findUniqueOrThrow({ where: { id: rf.refundId } });
    expect(refund.total.toString()).toBe("10");
    expect(refund.costTotal.toString()).toBe("6");
    const lot = await db.inventoryLot.findFirstOrThrow({ where: { variantId: v.id } });
    expect(lot.quantityLeft.toString()).toBe("1.5"); // 3 − 2.5 + 1
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stockQty.toString()).toBe("1.5");

    // Over-refund is rejected
    await expect(createRefund(manager, {
      clientRef: "refund-0000-02", saleId: sale.id, items: [{ saleItemId: sale.items[0].id, quantity: "2", restock: false }],
      reason: "again", method: "CASH", currency: "USD",
    })).rejects.toThrow("REFUND_EXCEEDS_SOLD");
    expect((await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("PARTIALLY_REFUNDED");
  });

  it("stock ledger always equals cached balance", async () => {
    const rows = await db.$queryRaw<{ id: string; stock: string; ledger: string }[]>`
      SELECT v.id, v."stockQty"::text AS stock, COALESCE(SUM(m.quantity),0)::text AS ledger
      FROM "ProductVariant" v LEFT JOIN "StockMovement" m ON m."variantId" = v.id
      WHERE v."organizationId" = ${ctx.org.id} GROUP BY v.id`;
    for (const r of rows) expect(Number(r.stock)).toBe(Number(r.ledger));
  });

  it("FEFO removal with a negative balance falls back to standard cost", async () => {
    const v = await makeVariant(ctx.org.id, ctx.product.id, ctx.units.get("kg")!, { price: "10", cost: "3" });
    const c = await db.$transaction(async (tx) => {
      const locked = await lockVariants(tx, ctx.org.id, [v.id]);
      return removeStock(tx, { organizationId: ctx.org.id, variantId: v.id, type: "WASTE", quantity: "1", allowNegative: true, current: locked.get(v.id)! });
    });
    expect(c.cost.toString()).toBe("3");
    await receive(ctx.org.id, v.id, "5", "4");
    const lot = await db.inventoryLot.findFirstOrThrow({ where: { variantId: v.id } });
    expect(lot.quantityLeft.toString()).toBe("4"); // 1 kg deficit back-filled
  });
});
