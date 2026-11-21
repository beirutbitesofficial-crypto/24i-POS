import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { ln } from "@/lib/i18n";
import { D, formatUsd } from "@/lib/money";
import { variantLabel } from "@/server/queries";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { PrintButton } from "@/components/ui/print-button";

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageOrgUser("inventory.manage");
  const { t, locale } = await getI18n();
  const { id } = await params;
  const p = await db.purchase.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { supplier: true, user: true, items: { include: { variant: { include: { product: true, brand: true, variety: true, unit: true, packageUnit: true } } } } },
  });
  if (!p) notFound();
  const dl = (d: Date | null) => (d ? d.toLocaleDateString(locale === "ar" ? "ar-LB" : "en-GB") : "—");
  return (
    <>
      <Link href="/inventory/purchases" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink-900"><ArrowLeft className="size-4 rtl:rotate-180" />{t("inv.purchases")}</Link>
      <PageHeader eyebrow={t("inv.purchase")} title={`#${p.number}`} actions={<PrintButton />} />
      <Card className="mb-6">
        <CardBody className="grid gap-4 text-sm sm:grid-cols-4">
          <div><div className="text-xs text-muted">{t("nav.suppliers")}</div><div className="font-medium">{p.supplier?.name ?? "—"}</div></div>
          <div><div className="text-xs text-muted">{t("inv.invoiceRef")}</div><div className="num font-medium">{p.invoiceRef ?? "—"}</div></div>
          <div><div className="text-xs text-muted">{t("inv.receivedAt")}</div><div className="num font-medium">{dl(p.receivedAt)}</div></div>
          <div><div className="text-xs text-muted">{t("common.user")}</div><div className="font-medium">{p.user.name}</div></div>
          {p.notes && <div className="sm:col-span-4"><div className="text-xs text-muted">{t("common.notes")}</div>{p.notes}</div>}
        </CardBody>
      </Card>
      <Card>
        <Table>
          <THead><tr><TH>{t("cat.product")}</TH><TH className="text-end">{t("common.quantity")}</TH><TH className="text-end">{t("inv.unitCost")}</TH><TH>{t("inv.lot")}</TH><TH>{t("inv.expiry")}</TH><TH className="text-end">{t("inv.lineTotal")}</TH></tr></THead>
          <tbody>
            {p.items.map((i) => (
              <TR key={i.id}>
                <TD><div className="font-medium">{ln(locale, i.variant.product)}</div><div className="text-xs text-muted">{variantLabel(locale, i.variant)}</div></TD>
                <TD className="num text-end">{D(i.quantity).toString()} {i.variant.unit.code}</TD>
                <TD className="num text-end">{formatUsd(i.unitCost)}</TD>
                <TD className="num">{i.lotNumber ?? "—"}</TD>
                <TD className="num">{dl(i.expiryDate)}</TD>
                <TD className="num text-end font-medium">{formatUsd(i.lineTotal)}</TD>
              </TR>
            ))}
            <TR><TD colSpan={5} className="text-end font-semibold">{t("common.total")}</TD><TD className="num text-end text-lg font-semibold">{formatUsd(p.total)}</TD></TR>
          </tbody>
        </Table>
      </Card>
    </>
  );
}
