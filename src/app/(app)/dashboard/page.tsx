import Link from "next/link";
import { DollarSign, ShoppingBag, TrendingUp, Undo2, AlertTriangle, CalendarClock, Settings2, Tag } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getI18n } from "@/lib/i18n/server";
import { ln, lpair } from "@/lib/i18n";
import { D, formatLbp, formatUsd } from "@/lib/money";
import { resolveRange, isoDate } from "@/lib/dates";
import { salesReport } from "@/server/services/reports";
import { getSettings } from "@/server/context";
import { variantLabel } from "@/server/queries";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RangeFilter } from "@/components/ui/range-filter";
import { TrendBars, ShareBars } from "@/components/charts/charts";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requirePageOrgUser("dashboard.view");
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const orgId = user.organizationId;
  const fin = can(user.role, "reports.financial");
  const { from, to } = resolveRange(sp);
  const trendFrom = new Date(to.getTime() - 14 * 86400000);
  const s = await getSettings(orgId);
  const expiryLimit = new Date(Date.now() + s.expiryAlertDays * 86400000);

  const [rep, trend, lowVariants, expiring, unpriced, noVariant, defaultPriced] = await Promise.all([
    salesReport(orgId, from, to),
    salesReport(orgId, trendFrom, to),
    db.productVariant.findMany({ where: { organizationId: orgId, active: true, minStock: { not: null } }, include: { product: true, brand: true, variety: true, unit: true, packageUnit: true } }),
    db.inventoryLot.findMany({
      where: { organizationId: orgId, quantityLeft: { gt: 0 }, expiryDate: { not: null, lte: expiryLimit } }, orderBy: { expiryDate: "asc" }, take: 8,
      include: { variant: { include: { product: true, brand: true, variety: true, unit: true, packageUnit: true } } },
    }),
    db.productVariant.count({ where: { organizationId: orgId, active: true, price: null } }),
    db.product.count({ where: { organizationId: orgId, active: true, variants: { none: { active: true } } } }),
    db.productVariant.count({ where: { organizationId: orgId, active: true, priceIsDefault: true } }),
  ]);
  const low = lowVariants.filter((v) => D(v.stockQty).lte(D(v.minStock))).slice(0, 8);

  // 14 day trend with empty days filled
  const days: { label: string; value: number; sub: string }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(to.getTime() - (i + 1) * 86400000);
    const key = isoDate(d);
    const row = trend.daily.find((x) => x.day === key);
    days.push({ label: d.toLocaleDateString(locale === "ar" ? "ar-LB" : "en-GB", { day: "numeric", month: "short" }), value: row ? row.revenue.toNumber() : 0, sub: `${row?.orders ?? 0} ${t("dash.orders")}` });
  }

  return (
    <>
      <PageHeader eyebrow={s.storeName} title={t("dash.welcome", { name: user.name })}
        actions={<RangeFilter from={isoDate(from)} to={isoDate(new Date(to.getTime() - 86400000))} />} />

      {(unpriced > 0 || noVariant > 0) && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-warn/30 bg-warn-soft px-5 py-4">
          <div className="grid size-10 place-items-center rounded-xl bg-white/60 dark:bg-white/5 text-warn"><Settings2 className="size-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-warn">{t("dash.needsSetup")}</div>
            <div className="text-sm text-fg-2">{t("dash.needsSetupDesc", { count: unpriced, products: noVariant })}</div>
          </div>
          {can(user.role, "catalog.manage") && <Button asChild variant="outline"><Link prefetch={false} href="/catalog/products?setup=1">{t("dash.openCatalog")}</Link></Button>}
        </div>
      )}

      {defaultPriced > 0 && can(user.role, "catalog.manage") && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-info/25 bg-info-soft px-5 py-4">
          <div className="grid size-10 place-items-center rounded-xl bg-white/60 dark:bg-white/5 text-info"><Tag className="size-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-info">{t("dash.defaultPrices")}</div>
            <div className="text-sm text-fg-2">{t("dash.defaultPricesDesc", { count: defaultPriced })}</div>
          </div>
          <Button asChild variant="outline"><Link prefetch={false} href="/catalog/products?defaults=1">{t("dash.openCatalog")}</Link></Button>
        </div>
      )}

      <div className="stagger mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="dark" label={t("dash.todaySales")} value={formatUsd(rep.total)} sub={formatLbp(rep.totalLbp, locale)} icon={<DollarSign className="size-4" />} />
        <StatCard label={t("dash.orders")} value={rep.orders} sub={`${t("dash.avgOrder")}: ${formatUsd(rep.avgOrder)}`} icon={<ShoppingBag className="size-4" />} />
        {fin && <StatCard label={t("dash.grossProfit")} value={formatUsd(rep.profit)} sub={t("dash.margin", { pct: rep.margin.toString() })} icon={<TrendingUp className="size-4" />} />}
        <StatCard label={t("dash.refunds")} value={formatUsd(rep.refunds.total)} sub={`${rep.refunds.count}`} icon={<Undo2 className="size-4" />} />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title={t("dash.salesTrend")} />
          <CardBody>{trend.orders === 0 ? <p className="py-16 text-center text-sm text-muted">{t("dash.noData")}</p> : <TrendBars data={days} valueLabel={t("rep.revenue")} />}</CardBody>
        </Card>
        <Card>
          <CardHeader title={t("dash.byCategory")} />
          <CardBody>
            {rep.byCategory.length === 0 ? <p className="py-16 text-center text-sm text-muted">{t("dash.noData")}</p>
              : <ShareBars rows={rep.byCategory.map((c) => ({ label: ln(locale, c), value: c.revenue.toNumber(), display: formatUsd(c.revenue) }))} />}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader title={t("dash.topProducts")} action={can(user.role, "reports.view") && <Link prefetch={false} href="/reports" className="text-xs font-medium text-gold-700">{t("dash.viewAll")}</Link>} />
          <CardBody className="space-y-3">
            {rep.byProduct.length === 0 ? <p className="text-sm text-muted">{t("dash.noData")}</p> : rep.byProduct.slice(0, 7).map((p, i) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="num grid size-7 shrink-0 place-items-center rounded-full bg-gold-50 text-xs font-semibold text-gold-700">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{locale === "ar" ? p.nameAr : p.nameEn}</div>
                  <div className="truncate text-xs text-muted">{[lpair(locale, p.brandName), lpair(locale, p.variantLabel)].filter(Boolean).join(" · ")} <span className="num">· {p.qty.toString()} {p.unitCode}</span></div>
                </div>
                <span className="num text-sm font-semibold">{formatUsd(p.revenue)}</span>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><AlertTriangle className="size-4 text-warn" />{t("dash.lowStock")}</span>} action={<Link prefetch={false} href="/inventory?status=low" className="text-xs font-medium text-gold-700">{t("dash.viewAll")}</Link>} />
          <CardBody className="space-y-2.5">
            {low.length === 0 ? <EmptyState title={t("dash.allGood")} /> : low.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0"><div className="truncate font-medium">{ln(locale, v.product)}</div><div className="truncate text-xs text-muted">{variantLabel(locale, v)}</div></div>
                <Badge tone={D(v.stockQty).lte(0) ? "danger" : "warn"} className="num">{D(v.stockQty).toString()} / {D(v.minStock).toString()} {v.unit.code}</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><CalendarClock className="size-4 text-danger" />{t("dash.expiring")}</span>} action={<Link prefetch={false} href="/inventory/lots" className="text-xs font-medium text-gold-700">{t("dash.viewAll")}</Link>} />
          <CardBody className="space-y-2.5">
            {expiring.length === 0 ? <EmptyState title={t("dash.allGood")} /> : expiring.map((l) => {
              const days = Math.round((l.expiryDate!.getTime() - Date.now()) / 86400000);
              return (
                <div key={l.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0"><div className="truncate font-medium">{ln(locale, l.variant.product)}</div><div className="num truncate text-xs text-muted">{D(l.quantityLeft).toString()} {l.variant.unit.code} · {l.expiryDate!.toLocaleDateString(locale === "ar" ? "ar-LB" : "en-GB")}</div></div>
                  <Badge tone={days < 0 ? "danger" : "warn"}>{days < 0 ? t("inv.expired") : t("inv.expiresIn", { days })}</Badge>
                </div>
              );
            })}
          </CardBody>
        </Card>
        {rep.byCashier.length > 0 && (
          <Card className="lg:col-span-2 xl:col-span-3">
            <CardHeader title={t("dash.cashiers")} />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {rep.byCashier.map((c) => (
                <div key={c.id} className="rounded-xl border border-ivory-200 p-4">
                  <div className="font-medium">{c.name}</div>
                  <div className="num mt-1 text-xl font-semibold">{formatUsd(c.revenue)}</div>
                  <div className="num text-xs text-muted">{c.orders} {t("dash.orders")} · {t("rep.discounts")} {formatUsd(c.discounts)}</div>
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
