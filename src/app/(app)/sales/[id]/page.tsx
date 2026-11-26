import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getI18n } from "@/lib/i18n/server";
import { lpair } from "@/lib/i18n";
import { D, formatLbp, formatUsd, formatWeight } from "@/lib/money";
import { getSettings } from "@/server/context";
import { Badge, Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { SaleActions } from "@/components/sales/sale-actions";

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageOrgUser("pos.sell");
  const { t, locale } = await getI18n();
  const { id } = await params;
  const sale = await db.sale.findFirst({
    where: { id, organizationId: user.organizationId, ...(can(user.role, "sales.view_all") ? {} : { cashierId: user.id }) },
    include: {
      cashier: { select: { name: true } }, payments: true,
      items: { include: { variant: { include: { unit: true } } } },
      refunds: { include: { user: { select: { name: true } }, items: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!sale) notFound();
  const s = await getSettings(user.organizationId);
  const fin = can(user.role, "reports.financial");
  const approver = sale.approvedById ? await db.user.findUnique({ where: { id: sale.approvedById }, select: { name: true } }) : null;
  const dt = (d: Date) => d.toLocaleString(locale === "ar" ? "ar-LB" : "en-GB");
  const name = (i: (typeof sale.items)[number]) => (locale === "ar" ? i.nameAr : i.nameEn);
  const sub = (i: (typeof sale.items)[number]) => [lpair(locale, i.brandName), lpair(locale, i.variantLabel)].filter(Boolean).join(" · ");
  return (
    <>
      <Link prefetch={false} href="/sales" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4 rtl:rotate-180" />{t("sales.title")}</Link>
      <PageHeader eyebrow={t("sales.receipt")} title={<span className="num">#{sale.number}</span>}
        description={`${dt(sale.createdAt)} · ${sale.cashier.name}`}
        actions={<>
          <Badge tone={sale.status === "COMPLETED" ? "success" : sale.status === "REFUNDED" ? "danger" : "warn"}>{t(`sales.status.${sale.status}`)}</Badge>
          <SaleActions saleId={sale.id} number={sale.number} printMode={s.printMode as "BROWSER" | "BRIDGE"} bridgeUrl={s.printBridgeUrl} canRefund={can(user.role, "pos.refund")}
            items={sale.items.map((i) => ({ id: i.id, name: name(i), sub: sub(i), quantity: i.quantity.toString(), refundedQty: i.refundedQty.toString(), lineTotal: i.lineTotal.toString(), unitCode: i.unitCode, allowsDecimal: i.variant.unit.allowsDecimal }))} />
        </>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <Card>
          <Table>
            <THead><tr><TH>{t("cat.product")}</TH><TH className="text-end">{t("pos.qty")}</TH><TH className="text-end">{t("pos.unitPrice")}</TH><TH className="text-end">{t("pos.discount")}</TH>{fin && <TH className="text-end">{t("common.cost")}</TH>}<TH className="text-end">{t("common.total")}</TH></tr></THead>
            <tbody>
              {sale.items.map((i) => (
                <TR key={i.id}>
                  <TD>
                    <div className="font-medium">{name(i)} {i.priceOverridden && <Badge tone="warn">✎</Badge>}</div>
                    <div className="text-xs text-muted">{sub(i)}</div>
                    {D(i.refundedQty).gt(0) && <Badge tone="danger" className="mt-1">{t("sales.refunded")}: {D(i.refundedQty).toString()}</Badge>}
                  </TD>
                  <TD className="num text-end">{i.sellMode === "WEIGHT" ? formatWeight(i.quantity, locale) : D(i.quantity).toString()}</TD>
                  <TD className="num text-end">{formatUsd(i.unitPrice)}</TD>
                  <TD className="num text-end text-success">{D(i.discountAmount).gt(0) ? `−${formatUsd(i.discountAmount)}` : "—"}</TD>
                  {fin && <TD className="num text-end text-muted">{formatUsd(i.costTotal)}</TD>}
                  <TD className="num text-end font-semibold">{formatUsd(i.lineTotal)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardBody className="space-y-2 text-sm">
              <Row k={t("pos.subtotal")} v={formatUsd(sale.subtotal)} />
              {D(sale.discountTotal).gt(0) && <Row k={t("pos.discount")} v={`−${formatUsd(sale.discountTotal)}`} />}
              {D(sale.taxTotal).gt(0) && <Row k={t("pos.tax")} v={formatUsd(sale.taxTotal)} />}
              <div className="flex justify-between border-t border-ivory-200 pt-2 text-lg font-semibold"><span>{t("pos.total")}</span><span className="num">{formatUsd(sale.total)}</span></div>
              {fin && <Row k={t("sales.profit")} v={formatUsd(D(sale.total).minus(D(sale.costTotal)))} />}
              <div className="border-t border-ivory-200 pt-2" />
              {sale.payments.map((p) => <Row key={p.id} k={`${p.method === "CASH" ? t("pos.cash") : p.method === "CARD" ? t("pos.card") : t("pos.transfer")} ${p.currency}`} v={p.currency === "USD" ? formatUsd(p.amount) : formatLbp(p.amount, locale)} />)}
              {D(sale.changeUsd).gt(0) && <Row k={t("pos.change")} v={formatUsd(sale.changeUsd)} />}
              {D(sale.changeLbp).gt(0) && <Row k={t("pos.change")} v={formatLbp(sale.changeLbp, locale)} />}
              <Row k="LBP" v={`1 USD = ${formatLbp(sale.exchangeRate, locale)}`} />
              {approver && <Row k={t("sales.approvedBy")} v={approver.name} />}
            </CardBody>
          </Card>
          {sale.refunds.length > 0 && (
            <Card>
              <CardHeader title={t("sales.refunds")} />
              <CardBody className="space-y-3 text-sm">
                {sale.refunds.map((r) => (
                  <div key={r.id} className="rounded-lg bg-danger-soft/50 p-3">
                    <div className="flex justify-between font-medium"><span className="num">#{r.number}</span><span className="num">−{formatUsd(r.total)}</span></div>
                    <div className="text-xs text-muted">{dt(r.createdAt)} · {r.user.name} · {r.currency === "USD" ? formatUsd(r.amountPaid) : formatLbp(r.amountPaid, locale)}</div>
                    <div className="mt-1 text-xs">{r.reason}</div>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-4"><span className="text-muted">{k}</span><span className="num text-end">{v}</span></div>;
}
