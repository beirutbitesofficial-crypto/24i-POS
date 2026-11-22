import { Download } from "lucide-react";
import { requirePageOrgUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getI18n } from "@/lib/i18n/server";
import { ln, lpair } from "@/lib/i18n";
import { formatLbp, formatUsd } from "@/lib/money";
import { resolveRange, isoDate } from "@/lib/dates";
import { salesReport } from "@/server/services/reports";
import { Card, CardBody, CardHeader, PageHeader, StatCard } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { RangeFilter } from "@/components/ui/range-filter";
import { PrintButton } from "@/components/ui/print-button";
import { TrendBars } from "@/components/charts/charts";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const user = await requirePageOrgUser("reports.view");
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const fin = can(user.role, "reports.financial");
  const { from, to } = resolveRange(sp.range ? sp : { range: "month" });
  const toIncl = isoDate(new Date(to.getTime() - 86400000));
  const r = await salesReport(user.organizationId, from, to);
  const pct = (a: { toNumber(): number }, b: { toNumber(): number }) => (b.toNumber() ? `${((a.toNumber() / b.toNumber()) * 100).toFixed(1)}%` : "—");
  const exportHref = (kind: string) => `/api/export/${kind}?from=${isoDate(from)}&to=${toIncl}`;
  const payLabel = (m: string) => (m === "CASH" ? t("pos.cash") : m === "CARD" ? t("pos.card") : t("pos.transfer"));

  return (
    <>
      <PageHeader eyebrow={t("nav.reports")} title={t("rep.title")} description={`${isoDate(from)} → ${toIncl} · ${t("rep.lbpNote")}`}
        actions={<>
          <RangeFilter from={isoDate(from)} to={toIncl} />
          <Button asChild variant="outline" className="no-print"><a href={exportHref("report-products")}><Download className="size-4" />{t("common.exportCsv")}</a></Button>
          <PrintButton />
        </>} />
      <div className="stagger mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="dark" label={t("rep.netSales")} value={formatUsd(r.netSales)} sub={`${formatLbp(r.totalLbp, locale)} ${t("rep.inLbp")}`} />
        <StatCard label={t("rep.orders")} value={r.orders} sub={`${t("rep.avgOrder")} ${formatUsd(r.avgOrder)}`} />
        {fin && <StatCard label={t("rep.grossProfit")} value={formatUsd(r.profit)} sub={t("dash.margin", { pct: r.margin.toString() })} />}
        {fin && <StatCard label={t("rep.cogs")} value={formatUsd(r.cost.minus(r.refunds.cost))} />}
        <StatCard label={t("rep.grossSales")} value={formatUsd(r.gross)} />
        <StatCard label={t("rep.discounts")} value={formatUsd(r.discounts)} />
        <StatCard label={t("rep.refunds")} value={formatUsd(r.refunds.total)} sub={String(r.refunds.count)} />
        {r.tax.gt(0) && <StatCard label={t("rep.tax")} value={formatUsd(r.tax)} />}
      </div>

      <Card className="mb-6">
        <CardHeader title={t("rep.daily")} />
        <CardBody>{r.daily.length === 0 ? <p className="py-12 text-center text-sm text-muted">{t("dash.noData")}</p>
          : <TrendBars valueLabel={t("rep.revenue")} data={r.daily.map((d) => ({ label: d.day.slice(5), value: d.revenue.toNumber(), sub: `${d.orders} ${t("rep.orders")}` }))} />}</CardBody>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("rep.byCategory")} />
          <Table>
            <THead><tr><TH>{t("cat.category")}</TH><TH className="text-end">{t("rep.revenue")}</TH><TH className="text-end">%</TH>{fin && <TH className="text-end">{t("rep.profit")}</TH>}</tr></THead>
            <tbody>{r.byCategory.map((c) => (
              <TR key={c.id}><TD>{ln(locale, c)}</TD><TD className="num text-end font-medium">{formatUsd(c.revenue)}</TD><TD className="num text-end text-muted">{pct(c.revenue, r.total)}</TD>{fin && <TD className="num text-end">{formatUsd(c.profit)}</TD>}</TR>
            ))}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title={t("rep.byBrand")} />
          <Table>
            <THead><tr><TH>{t("cat.brand")}</TH><TH className="text-end">{t("rep.revenue")}</TH>{fin && <TH className="text-end">{t("rep.profit")}</TH>}</tr></THead>
            <tbody>{r.byBrand.map((b) => (
              <TR key={b.name ?? "none"}><TD>{b.name ? lpair(locale, b.name) : <span className="text-muted">{t("rep.noBrand")}</span>}</TD><TD className="num text-end font-medium">{formatUsd(b.revenue)}</TD>{fin && <TD className="num text-end">{formatUsd(b.profit)}</TD>}</TR>
            ))}</tbody>
          </Table>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title={t("rep.byProduct")} />
          <Table>
            <THead><tr><TH>{t("cat.product")}</TH><TH className="text-end">{t("rep.qtySold")}</TH><TH className="text-end">{t("rep.revenue")}</TH>{fin && <TH className="text-end">{t("common.cost")}</TH>}{fin && <TH className="text-end">{t("rep.profit")}</TH>}{fin && <TH className="text-end">%</TH>}</tr></THead>
            <tbody>{r.byProduct.map((p) => (
              <TR key={p.id}>
                <TD><div className="font-medium">{locale === "ar" ? p.nameAr : p.nameEn}</div><div className="text-xs text-muted">{[lpair(locale, p.brandName), lpair(locale, p.variantLabel)].filter(Boolean).join(" · ")}</div></TD>
                <TD className="num text-end">{p.qty.toString()} {p.unitCode}</TD>
                <TD className="num text-end font-medium">{formatUsd(p.revenue)}</TD>
                {fin && <TD className="num text-end text-muted">{formatUsd(p.cost)}</TD>}
                {fin && <TD className="num text-end">{formatUsd(p.profit)}</TD>}
                {fin && <TD className="num text-end text-muted">{pct(p.profit, p.revenue)}</TD>}
              </TR>
            ))}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title={t("rep.byCashier")} />
          <Table>
            <THead><tr><TH>{t("sales.cashier")}</TH><TH className="text-end">{t("rep.orders")}</TH><TH className="text-end">{t("rep.discounts")}</TH><TH className="text-end">{t("rep.revenue")}</TH></tr></THead>
            <tbody>{r.byCashier.map((c) => (
              <TR key={c.id}><TD>{c.name}</TD><TD className="num text-end">{c.orders}</TD><TD className="num text-end text-muted">{formatUsd(c.discounts)}</TD><TD className="num text-end font-medium">{formatUsd(c.revenue)}</TD></TR>
            ))}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title={t("rep.byPayment")} />
          <Table>
            <THead><tr><TH>{t("common.type")}</TH><TH className="text-end">{t("common.total")}</TH><TH className="text-end">USD</TH></tr></THead>
            <tbody>{r.byPayment.map((p) => (
              <TR key={p.method + p.currency}><TD>{payLabel(p.method)} {p.currency}</TD><TD className="num text-end">{p.currency === "USD" ? formatUsd(p.amount) : formatLbp(p.amount, locale)}</TD><TD className="num text-end font-medium">{formatUsd(p.base)}</TD></TR>
            ))}</tbody>
          </Table>
        </Card>
      </div>
    </>
  );
}
