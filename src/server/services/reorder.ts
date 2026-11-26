import "server-only";
import { db } from "@/lib/db";
import { D, Decimal } from "@/lib/money";

/** Variants at/below minimum stock, with 30-day average daily sales and a suggested order quantity. */
export async function reorderSuggestions(organizationId: string) {
  const variants = await db.productVariant.findMany({
    where: { organizationId, active: true, trackStock: true, minStock: { not: null } },
    include: { product: true, brand: true, variety: true, unit: true, packageUnit: true, supplier: true },
  });
  const low = variants.filter((v) => D(v.stockQty).lte(D(v.minStock)));
  if (!low.length) return [];
  const since = new Date(Date.now() - 30 * 86400000);
  const sold = await db.saleItem.groupBy({
    by: ["variantId"], where: { variantId: { in: low.map((v) => v.id) }, sale: { createdAt: { gte: since } } }, _sum: { quantity: true, refundedQty: true },
  });
  return low.map((v) => {
    const s = sold.find((x) => x.variantId === v.id);
    const net = D(s?._sum.quantity).minus(D(s?._sum.refundedQty));
    const avg = net.div(30);
    const stock = D(v.stockQty);
    // Target: two weeks of cover or the configured reorder qty, whichever is larger, above the minimum
    const target = Decimal.max(D(v.minStock).plus(avg.mul(14)), D(v.minStock).plus(D(v.reorderQty)));
    let suggested = Decimal.max(0, target.minus(stock));
    if (!v.unit.allowsDecimal) suggested = suggested.toDecimalPlaces(0, Decimal.ROUND_CEIL);
    else suggested = suggested.toDecimalPlaces(3);
    return { v, avg: avg.toDecimalPlaces(3), daysLeft: avg.gt(0) ? Decimal.max(0, stock).div(avg).toDecimalPlaces(1) : null, suggested };
  });
}
