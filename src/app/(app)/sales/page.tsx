import Link from "next/link";
import { Receipt } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getI18n } from "@/lib/i18n/server";
import { D, formatUsd } from "@/lib/money";
import { resolveRange, isoDate } from "@/lib/dates";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { RangeFilter } from "@/components/ui/range-filter";
import { SearchBox } from "@/components/ui/search-box";

export const metadata = { title: "Sales" };
const PER = 40;

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ page?: string; range?: string; from?: string; to?: string; q?: string; cashier?: string }> }) {
  const user = await requirePageOrgUser("pos.sell");
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const all = can(user.role, "sales.view_all");
  const fin = can(user.role, "reports.financial");
  const { from, to } = resolveRange(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.SaleWhereInput = { organizationId: user.organizationId };
  const num = Number(sp.q);
  if (sp.q && Number.isInteger(num)) where.number = num;
  else where.createdAt = { gte: from, lt: to };
  if (!all) where.cashierId = user.id;
  else if (sp.cashier) where.cashierId = sp.cashier;
  const [rows, total, agg] = await Promise.all([
    db.sale.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER, include: { cashier: { select: { name: true } }, _count: { select: { items: true } }, payments: true } }),
    db.sale.count({ where }),
    db.sale.aggregate({ where, _sum: { total: true, costTotal: true } }),
  ]);
  const qs = (p: number) => { const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]); u.set("page", String(p)); return `/sales?${u}`; };
  return (
    <>
      <PageHeader eyebrow={t("nav.sales")} title={t("sales.title")}
        description={<span className="num">{t("common.results", { count: total })} · {formatUsd(agg._sum.total ?? 0)}{fin && ` · ${t("sales.profit")} ${formatUsd(D(agg._sum.total).minus(D(agg._sum.costTotal)))}`}</span>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <RangeFilter from={isoDate(from)} to={isoDate(new Date(to.getTime() - 86400000))} />
        <SearchBox placeholder={t("sales.searchNumber")} className="w-40" />
        {all && <a href={`/api/export/sales?from=${isoDate(from)}&to=${isoDate(new Date(to.getTime() - 86400000))}`} className="ms-auto text-sm font-medium text-gold-700 hover:underline">{t("common.exportCsv")}</a>}
      </div>
      <Card>
        {rows.length === 0 ? <EmptyState icon={<Receipt className="size-6" />} title={t("dash.noData")} /> : (
          <>
            <Table>
              <THead><tr><TH>{t("sales.number")}</TH><TH>{t("common.date")}</TH><TH>{t("sales.cashier")}</TH><TH>{t("sales.items")}</TH><TH>{t("pos.payments")}</TH><TH>{t("common.status")}</TH>{fin && <TH className="text-end">{t("sales.profit")}</TH>}<TH className="text-end">{t("common.total")}</TH></tr></THead>
              <tbody>
                {rows.map((s) => (
                  <TR key={s.id}>
                    <TD><Link href={`/sales/${s.id}`} className="num font-semibold text-gold-700 hover:underline">#{s.number}</Link></TD>
                    <TD className="num text-xs text-muted">{s.createdAt.toLocaleString(locale === "ar" ? "ar-LB" : "en-GB")}</TD>
                    <TD>{s.cashier.name}</TD>
                    <TD className="num">{s._count.items}</TD>
                    <TD className="text-xs text-muted">{[...new Set(s.payments.map((p) => `${p.method === "CASH" ? t("pos.cash") : p.method === "CARD" ? t("pos.card") : t("pos.transfer")} ${p.currency}`))].join(" + ")}</TD>
                    <TD><Badge tone={s.status === "COMPLETED" ? "success" : s.status === "REFUNDED" ? "danger" : "warn"}>{t(`sales.status.${s.status}`)}</Badge></TD>
                    {fin && <TD className="num text-end text-muted">{formatUsd(D(s.total).minus(D(s.costTotal)))}</TD>}
                    <TD className="num text-end font-semibold">{formatUsd(s.total)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination t={t} page={page} pages={Math.ceil(total / PER)} total={total} makeHref={qs} />
          </>
        )}
      </Card>
    </>
  );
}
