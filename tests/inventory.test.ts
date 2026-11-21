import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { addStock, lockVariants, removeStock } from "@/server/services/inventory";
import { makeOrg, makeVariant } from "./helpers";

describe("bulk → jar conversion", () => {
  let ctx: Awaited<ReturnType<typeof makeOrg>>;
  beforeAll(async () => { ctx = await makeOrg(); });

  it("moves stock without double counting and carries cost and expiry", async () => {
    const loose = await makeVariant(ctx.org.id, ctx.product.id, ctx.units.get("kg")!, { price: "8" });
    const jar = await makeVariant(ctx.org.id, ctx.product.id, ctx.units.get("jar")!, { price: "5", mode: "UNIT" });
    await db.$transaction(async (tx) => {
      const l = await lockVariants(tx, ctx.org.id, [loose.id]);
      await addStock(tx, { organizationId: ctx.org.id, variantId: loose.id, type: "PURCHASE", quantity: "10", unitCost: "4", expiryDate: new Date("2031-03-01"), source: "PURCHASE", current: l.get(loose.id)! });
    });
    // Pack 2 kg loose into 4 × 500 g jars
    await db.$transaction(async (tx) => {
      const l = await lockVariants(tx, ctx.org.id, [loose.id, jar.id]);
      const out = await removeStock(tx, { organizationId: ctx.org.id, variantId: loose.id, type: "CONVERSION_OUT", quantity: "2", allowNegative: false, current: l.get(loose.id)! });
      expect(out.cost.toString()).toBe("8");
      await addStock(tx, { organizationId: ctx.org.id, variantId: jar.id, type: "CONVERSION_IN", quantity: "4", unitCost: out.cost.div(4), expiryDate: out.allocations[0].expiryDate, source: "CONVERSION", current: l.get(jar.id)! });
    });
    const [a, b] = await Promise.all([db.productVariant.findUniqueOrThrow({ where: { id: loose.id } }), db.productVariant.findUniqueOrThrow({ where: { id: jar.id } })]);
    expect(a.stockQty.toString()).toBe("8");
    expect(b.stockQty.toString()).toBe("4");
    const jarLot = await db.inventoryLot.findFirstOrThrow({ where: { variantId: jar.id } });
    expect(jarLot.unitCost.toString()).toBe("2");
    expect(jarLot.expiryDate?.toISOString().slice(0, 10)).toBe("2031-03-01");
  });
});
