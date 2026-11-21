import { CalendarClock } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getI18n } from "@/lib/i18n/server";
import { ln } from "@/lib/i18n";
import { D, formatUsd } from "@/lib/money";
import { getSettings } from "@/server/context";
import { variantLabel } from "@/server/queries";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const metadata = { title: "Lots & expiry" };

export default async function LotsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requirePageOrgUser("inventory.view");
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const s = await getSettings(user.organizationId);
  const canCost = can(user.role, "catalog.costs");
  const lots = await db.inventoryLot.findMany({
    where: { organizationId: user.organizationId, quantityLeft: { gt: 0 }, ...(sp.all ? {} : { expiryDate: { not: null } }) },
    orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }],
    include: { variant: { include: { product: true, brand: true, variety: true, unit: true, packageUnit: true } } },
    take: 500,
  });
  const today = new Date(new Date().toISOString().slice(0, 10));
  return (
    <>
      <PageHeader eyebrow={t("nav.inventory")} title={t("inv.lots")}
        actions={<a href={sp.all ? "/inventory/lots" : "/inventory/lots?all=1"} className="text-sm font-medium text-gold-700 hover:underline">{sp.all ? t("inv.expiry") : t("common.all")}</a>} />
      <Card>
        {lots.length === 0 ? <EmptyState icon={<CalendarClock className="size-6" />} title={t("dash.allGood")} /> : (
          <Table>
            <THead><tr><TH>{t("cat.product")}</TH><TH>{t("inv.lot")}</TH><TH>{t("inv.receivedAt")}</TH><TH>{t("inv.expiry")}</TH><TH className="text-end">{t("inv.qtyLeft")}</TH>{canCost && <TH className="text-end">{t("inv.unitCost")}</TH>}<TH>{t("common.status")}</TH></tr></THead>
            <tbody>
              {lots.map((l) => {
                const days = l.expiryDate ? Math.round((l.expiryDate.getTime() - today.getTime()) / 86400000) : null;
                const tone = days === null ? "neutral" : days < 0 ? "danger" : days <= s.expiryAlertDays ? "warn" : "success";
                return (
                  <TR key={l.id}>
                    <TD><div className="font-medium">{ln(locale, l.variant.product)}</div><div className="text-xs text-muted">{variantLabel(locale, l.variant)}</div></TD>
                    <TD className="num">{l.lotNumber ?? "—"}</TD>
                    <TD className="num text-muted">{l.receivedAt.toLocaleDateString(locale === "ar" ? "ar-LB" : "en-GB")}</TD>
                    <TD className="num">{l.expiryDate ? l.expiryDate.toLocaleDateString(locale === "ar" ? "ar-LB" : "en-GB") : "—"}</TD>
                    <TD className="num text-end">{D(l.quantityLeft).toString()} {l.variant.unit.code}</TD>
                    {canCost && <TD className="num text-end text-muted">{formatUsd(l.unitCost)}</TD>}
                    <TD>{days !== null && <Badge tone={tone}>{days < 0 ? t("inv.expired") : t("inv.expiresIn", { days })}</Badge>}</TD>
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
