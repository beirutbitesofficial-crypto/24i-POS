import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { AuthError, requireOrgUser } from "@/lib/auth";
import { can, type Permission } from "@/lib/permissions";
import { D } from "@/lib/money";
import { salesReport } from "@/server/services/reports";
import { audit } from "@/server/audit";

const PERMS: Record<string, Permission> = { variants: "catalog.manage", stock: "inventory.view", sales: "sales.view_all", "report-products": "reports.view" };

function csv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Neutralise spreadsheet formula injection
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

function range(req: NextRequest) {
  const f = req.nextUrl.searchParams.get("from");
  const t = req.nextUrl.searchParams.get("to");
  const from = f ? new Date(f + "T00:00:00") : new Date(new Date().setHours(0, 0, 0, 0));
  const to = t ? new Date(t + "T00:00:00") : new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await params;
    const perm = PERMS[kind];
    if (!perm) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const user = await requireOrgUser(perm);
    const orgId = user.organizationId;
    const canCost = can(user.role, "catalog.costs");
    let rows: (string | number | null)[][] = [];

    if (kind === "variants" || kind === "stock") {
      const vs = await db.productVariant.findMany({
        where: { organizationId: orgId },
        include: { product: { include: { category: true } }, brand: true, variety: true, unit: true, barcodes: true },
        orderBy: [{ product: { category: { sortOrder: "asc" } } }, { product: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      });
      rows = [["sku", "category", "product_en", "product_ar", "brand", "variety", "label", "sell_mode", "unit", "price", "price_is_default", "wholesale_price", ...(canCost ? ["cost"] : []), "stock", "min_stock", "reorder_qty", "barcodes", "active"]];
      for (const v of vs) rows.push([
        v.sku, v.product.category.nameEn, v.product.nameEn, v.product.nameAr, v.brand?.nameEn ?? "", v.variety?.nameEn ?? "", v.labelEn ?? "",
        v.sellMode, v.unit.code, v.price?.toString() ?? "", v.priceIsDefault ? "1" : "0", v.wholesalePrice?.toString() ?? "", ...(canCost ? [v.cost?.toString() ?? ""] : []),
        v.stockQty.toString(), v.minStock?.toString() ?? "", v.reorderQty?.toString() ?? "", v.barcodes.map((b) => b.code).join(" "), v.active ? "1" : "0",
      ]);
    } else if (kind === "sales") {
      const { from, to } = range(req);
      const sales = await db.sale.findMany({ where: { organizationId: orgId, createdAt: { gte: from, lt: to } }, orderBy: { createdAt: "asc" }, include: { cashier: true, payments: true } });
      const fin = can(user.role, "reports.financial");
      rows = [["number", "date", "cashier", "status", "subtotal", "discount", "tax", "total_usd", "rate", "total_lbp", ...(fin ? ["cost", "profit"] : []), "payments"]];
      for (const s of sales) rows.push([
        s.number, s.createdAt.toISOString(), s.cashier.name, s.status, s.subtotal.toString(), s.discountTotal.toString(), s.taxTotal.toString(), s.total.toString(),
        s.exchangeRate.toString(), D(s.total).mul(D(s.exchangeRate)).toDecimalPlaces(0).toString(),
        ...(fin ? [s.costTotal.toString(), D(s.total).minus(D(s.costTotal)).toString()] : []),
        s.payments.map((p) => `${p.method}:${p.currency}:${p.amount}`).join(" "),
      ]);
    } else if (kind === "report-products") {
      const { from, to } = range(req);
      const r = await salesReport(orgId, from, to);
      const fin = can(user.role, "reports.financial");
      rows = [["product_en", "product_ar", "brand", "variant", "qty", "unit", "revenue_usd", ...(fin ? ["cost_usd", "profit_usd"] : [])]];
      for (const p of r.byProduct) rows.push([p.nameEn, p.nameAr, p.brandName?.split("|")[0] ?? "", p.variantLabel ?? "", p.qty.toString(), p.unitCode, p.revenue.toFixed(2), ...(fin ? [p.cost.toFixed(2), p.profit.toFixed(2)] : [])]);
    }
    await audit({ organizationId: orgId, userId: user.id, action: "export." + kind });
    return new NextResponse(csv(rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"` },
    });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
