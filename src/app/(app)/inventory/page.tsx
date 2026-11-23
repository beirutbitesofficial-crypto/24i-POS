import Link from "next/link";
import { Boxes, Download, AlertTriangle } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db, tbl } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getI18n } from "@/lib/i18n/server";
import { ln } from "@/lib/i18n";
import { D, Decimal, formatUsd } from "@/lib/money";
import { variantLabel } from "@/server/queries";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SearchBox } from "@/components/ui/search-box";
import { cn } from "@/lib/utils";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; status?: string }> }) {
  const user = await requirePageOrgUser("inventory.view");
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const orgId = user.organizationId;
  const canCost = can(user.role, "catalog.costs");
  const where: Prisma.ProductVariantWhereInput = { organizationId: orgId, active: true };
  if (sp.category) where.product = { categoryId: sp.category };
  if (sp.q) where.OR = [
    { product: { nameEn: { contains: sp.q, mode: "insensitive" } } }, { product: { nameAr: { contains: sp.q } } },
    { sku: { contains: sp.q, mode: "insensitive" } }, { barcodes: { some: { code: sp.q } } },
  ];
  const [categories, variants, lotValue] = await Promise.all([
    db.category.findMany({ where: { organizationId: orgId }, orderBy: { sortOrder: "asc" } }),
    db.productVariant.findMany({
      where, include: { product: { include: { category: true } }, brand: true, variety: true, unit: true, packageUnit: true },
      orderBy: [{ product: { category: { sortOrder: "asc" } } }, { product: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    }),
    canCost
      ? db.$queryRaw<{ v: string | null }[]>`SELECT SUM("quantityLeft" * "unitCost")::text AS v FROM ${tbl("InventoryLot")} WHERE "organizationId" = ${orgId} AND "quantityLeft" > 0`
      : Promise.resolve([{ v: null }]),
  ]);
  const status = (v: (typeof variants)[number]) => {
    const q = D(v.stockQty);
    if (q.lte(0)) return "out";
    if (v.minStock !== null && q.lte(D(v.minStock))) return "low";
    return "ok";
  };
  const rows = variants.filter((v) => !sp.status || (sp.status === "low" ? status(v) !== "ok" : status(v) === sp.status));
  const lowCount = variants.filter((v) => status(v) === "low").length;
  const outCount = variants.filter((v) => status(v) === "out").length;
  const href = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, category: sp.category, status: sp.status, ...patch })) if (v) u.set(k, v);
    return `/inventory?${u}`;
  };
  const chip = "rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition";

  return (
    <>
      <PageHeader eyebrow={t("nav.inventory")} title={t("nav.stock")}
        actions={<Button asChild variant="outline"><a href="/api/export/stock"><Download className="size-4" />{t("common.exportCsv")}</a></Button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {canCost && <StatCard tone="dark" label={t("inv.value")} value={formatUsd(lotValue[0]?.v ?? 0)} />}
        <StatCard label={t("inv.low")} value={lowCount} icon={<AlertTriangle className="size-4" />} />
        <StatCard label={t("inv.out")} value={outCount} icon={<Boxes className="size-4" />} />
      </div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchBox placeholder={t("cat.searchProducts")} className="lg:w-80" />
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <Link prefetch={false} href={href({ category: undefined })} className={cn(chip, !sp.category ? "border-ink-900 bg-ink-900 text-ivory-50" : "border-ivory-300 bg-ivory-50")}>{t("common.all")}</Link>
          {categories.map((c) => (
            <Link prefetch={false} key={c.id} href={href({ category: c.id })} className={cn(chip, sp.category === c.id ? "border-ink-900 bg-ink-900 text-ivory-50" : "border-ivory-300 bg-ivory-50")}>{ln(locale, c)}</Link>
          ))}
          <Link prefetch={false} href={href({ status: sp.status === "low" ? undefined : "low" })} className={cn(chip, sp.status === "low" ? "border-danger bg-danger text-white" : "border-danger/30 bg-danger-soft text-danger")}>{t("inv.low")} / {t("inv.out")}</Link>
        </div>
      </div>
      <Card>
        {rows.length === 0 ? <EmptyState icon={<Boxes className="size-6" />} title={t("common.none")} /> : (
          <Table>
            <THead>
              <tr>
                <TH>{t("cat.product")}</TH><TH>{t("cat.sku")}</TH><TH className="text-end">{t("inv.onHand")}</TH><TH className="text-end">{t("cat.minStock")}</TH>
                {canCost && <TH className="text-end">{t("common.cost")}</TH>}{canCost && <TH className="text-end">{t("inv.value")}</TH>}<TH>{t("common.status")}</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((v) => {
                const st = status(v);
                const value = canCost && v.cost ? Decimal.max(0, D(v.stockQty)).mul(D(v.cost)) : null;
                return (
                  <TR key={v.id}>
                    <TD>
                      <Link prefetch={false} href={`/inventory/movements?variant=${v.id}`} className="hover:text-gold-700">
                        <div className="font-medium">{ln(locale, v.product)}</div>
                        <div className="text-xs text-muted">{variantLabel(locale, v) || ln(locale, v.product.category)}</div>
                      </Link>
                    </TD>
                    <TD className="num text-xs text-muted">{v.sku}</TD>
                    <TD className={cn("num text-end font-semibold", st === "out" && "text-danger", st === "low" && "text-warn")}>{D(v.stockQty).toString()} <span className="text-xs font-normal text-muted">{v.unit.code}</span></TD>
                    <TD className="num text-end text-muted">{v.minStock ? D(v.minStock).toString() : "—"}</TD>
                    {canCost && <TD className="num text-end text-muted">{v.cost ? formatUsd(v.cost) : "—"}</TD>}
                    {canCost && <TD className="num text-end">{value ? formatUsd(value) : "—"}</TD>}
                    <TD><Badge tone={st === "ok" ? "success" : st === "low" ? "warn" : "danger"}>{t(`inv.${st}`)}</Badge></TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
