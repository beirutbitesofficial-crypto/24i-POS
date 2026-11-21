import "server-only";
import { db } from "@/lib/db";
import { D } from "@/lib/money";
import { shiftExpectedCash } from "./sales";

export async function shiftReport(shiftId: string) {
  const [exp, sales, nonCash, refunds, moves] = await Promise.all([
    shiftExpectedCash(shiftId),
    db.sale.aggregate({ where: { shiftId }, _sum: { total: true, discountTotal: true }, _count: true }),
    db.payment.groupBy({ by: ["method", "currency"], where: { sale: { shiftId }, method: { not: "CASH" } }, _sum: { amount: true } }),
    db.refund.aggregate({ where: { shiftId }, _sum: { total: true }, _count: true }),
    db.cashMovement.findMany({ where: { shiftId }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    expected: exp,
    salesCount: sales._count,
    salesTotal: D(sales._sum.total),
    discounts: D(sales._sum.discountTotal),
    nonCash: nonCash.map((n) => ({ method: n.method, currency: n.currency, amount: D(n._sum.amount) })),
    refundsTotal: D(refunds._sum.total),
    refundsCount: refunds._count,
    moves,
  };
}
