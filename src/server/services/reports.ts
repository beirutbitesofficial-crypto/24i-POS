import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { D, Decimal } from "@/lib/money";

/**
 * All figures are in USD (base). Line amounts are net of refunds: each sale line
 * is scaled by (quantity − refundedQty) / quantity. Profit uses the recorded
 * FEFO lot cost captured at the time of sale (SaleItem.costTotal).
 * LBP figures use each sale's own recorded exchange rate.
 */
const NET = Prisma.sql`(si."quantity" - si."refundedQty") / NULLIF(si."quantity", 0)`;

type Row = Record<string, unknown>;
const num = (v: unknown) => D(v as string | number | null);

export async function salesReport(organizationId: string, from: Date, to: Date) {
  const range = Prisma.sql`s."organizationId" = ${organizationId} AND s."createdAt" >= ${from} AND s."createdAt" < ${to}`;

  const [summary] = await db.$queryRaw<Row[]>`
    SELECT COUNT(*)::int AS orders,
           COALESCE(SUM(s."subtotal"),0) AS gross,
           COALESCE(SUM(s."discountTotal"),0) AS discounts,
           COALESCE(SUM(s."total"),0) AS total,
           COALESCE(SUM(s."taxTotal"),0) AS tax,
           COALESCE(SUM(s."costTotal"),0) AS cost,
           COALESCE(SUM(s."total" * s."exchangeRate"),0) AS "totalLbp"
    FROM "Sale" s WHERE ${range}`;
  const [refunds] = await db.$queryRaw<Row[]>`
    SELECT COUNT(*)::int AS count, COALESCE(SUM(r."total"),0) AS total, COALESCE(SUM(r."costTotal"),0) AS cost
    FROM "Refund" r WHERE r."organizationId" = ${organizationId} AND r."createdAt" >= ${from} AND r."createdAt" < ${to}`;

  const byCategory = await db.$queryRaw<Row[]>`
    SELECT c."id", c."nameEn", c."nameAr",
           COALESCE(SUM(si."lineTotal" * ${NET}),0) AS revenue,
           COALESCE(SUM(si."costTotal" * ${NET}),0) AS cost
    FROM "SaleItem" si JOIN "Sale" s ON s."id" = si."saleId" JOIN "Category" c ON c."id" = si."categoryId"
    WHERE ${range} GROUP BY c."id" ORDER BY revenue DESC`;

  const byProduct = await db.$queryRaw<Row[]>`
    SELECT si."variantId" AS id, MAX(si."nameEn") AS "nameEn", MAX(si."nameAr") AS "nameAr",
           MAX(si."brandName") AS "brandName", MAX(si."variantLabel") AS "variantLabel", MAX(si."unitCode") AS "unitCode",
           COALESCE(SUM(si."quantity" - si."refundedQty"),0) AS qty,
           COALESCE(SUM(si."lineTotal" * ${NET}),0) AS revenue,
           COALESCE(SUM(si."costTotal" * ${NET}),0) AS cost
    FROM "SaleItem" si JOIN "Sale" s ON s."id" = si."saleId"
    WHERE ${range} GROUP BY si."variantId" ORDER BY revenue DESC LIMIT 200`;

  const byBrand = await db.$queryRaw<Row[]>`
    SELECT si."brandName" AS name,
           COALESCE(SUM(si."lineTotal" * ${NET}),0) AS revenue,
           COALESCE(SUM(si."costTotal" * ${NET}),0) AS cost
    FROM "SaleItem" si JOIN "Sale" s ON s."id" = si."saleId"
    WHERE ${range} GROUP BY si."brandName" ORDER BY revenue DESC`;

  const byCashier = await db.$queryRaw<Row[]>`
    SELECT u."id", u."name", COUNT(*)::int AS orders, COALESCE(SUM(s."total"),0) AS revenue,
           COALESCE(SUM(s."discountTotal"),0) AS discounts
    FROM "Sale" s JOIN "User" u ON u."id" = s."cashierId"
    WHERE ${range} GROUP BY u."id" ORDER BY revenue DESC`;

  const byPayment = await db.$queryRaw<Row[]>`
    SELECT p."method", p."currency", COALESCE(SUM(p."amount"),0) AS amount, COALESCE(SUM(p."amountBase"),0) AS base
    FROM "Payment" p JOIN "Sale" s ON s."id" = p."saleId"
    WHERE ${range} GROUP BY p."method", p."currency" ORDER BY base DESC`;

  const daily = await db.$queryRaw<Row[]>`
    SELECT to_char(date_trunc('day', s."createdAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS orders,
           COALESCE(SUM(s."total"),0) AS revenue, COALESCE(SUM(s."costTotal"),0) AS cost
    FROM "Sale" s WHERE ${range} GROUP BY 1 ORDER BY 1`;

  const total = num(summary.total);
  const tax = num(summary.tax);
  const cost = num(summary.cost);
  const refundTotal = num(refunds.total);
  const refundCost = num(refunds.cost);
  const orders = Number(summary.orders);
  const netSales = total.minus(refundTotal);
  const profit = total.minus(tax).minus(cost).minus(refundTotal.minus(refundCost));
  const mapRev = (r: Row) => ({ revenue: num(r.revenue), cost: num(r.cost), profit: num(r.revenue).minus(num(r.cost)) });

  return {
    orders,
    gross: num(summary.gross),
    discounts: num(summary.discounts),
    total,
    totalLbp: num(summary.totalLbp).toDecimalPlaces(0),
    tax,
    cost,
    refunds: { count: Number(refunds.count), total: refundTotal, cost: refundCost },
    netSales,
    profit,
    margin: netSales.gt(0) ? profit.div(netSales.minus(tax)).mul(100).toDecimalPlaces(1) : new Decimal(0),
    avgOrder: orders ? total.div(orders) : new Decimal(0),
    byCategory: byCategory.map((r) => ({ id: String(r.id), nameEn: String(r.nameEn), nameAr: String(r.nameAr), ...mapRev(r) })),
    byProduct: byProduct.map((r) => ({
      id: String(r.id), nameEn: String(r.nameEn), nameAr: String(r.nameAr), brandName: (r.brandName as string) ?? null,
      variantLabel: (r.variantLabel as string) ?? null, unitCode: String(r.unitCode), qty: num(r.qty), ...mapRev(r),
    })),
    byBrand: byBrand.map((r) => ({ name: (r.name as string) ?? null, ...mapRev(r) })),
    byCashier: byCashier.map((r) => ({ id: String(r.id), name: String(r.name), orders: Number(r.orders), revenue: num(r.revenue), discounts: num(r.discounts) })),
    byPayment: byPayment.map((r) => ({ method: String(r.method), currency: String(r.currency), amount: num(r.amount), base: num(r.base) })),
    daily: daily.map((r) => ({ day: String(r.day), orders: Number(r.orders), revenue: num(r.revenue), cost: num(r.cost) })),
  };
}

export type SalesReport = Awaited<ReturnType<typeof salesReport>>;
