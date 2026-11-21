import { ListChecks } from "lucide-react";
import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { ln } from "@/lib/i18n";
import { D } from "@/lib/money";
import { variantLabel } from "@/server/queries";
import { reorderSuggestions } from "@/server/services/reorder";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { PrintButton } from "@/components/ui/print-button";

export const metadata = { title: "Reorder" };

export default async function ReorderPage() {
  const user = await requirePageOrgUser("inventory.view");
  const { t, locale } = await getI18n();
  const rows = await reorderSuggestions(user.organizationId);
  return (
    <>
      <PageHeader eyebrow={t("nav.inventory")} title={t("inv.reorder")} description={t("inv.reorderDesc")} actions={<PrintButton />} />
      <Card>
        {rows.length === 0 ? <EmptyState icon={<ListChecks className="size-6" />} title={t("inv.noLowStock")} /> : (
          <Table>
            <THead><tr><TH>{t("cat.product")}</TH><TH>{t("cat.supplier")}</TH><TH className="text-end">{t("inv.onHand")}</TH><TH className="text-end">{t("cat.minStock")}</TH><TH className="text-end">{t("inv.avgDaily")}</TH><TH className="text-end">{t("inv.daysLeft")}</TH><TH className="text-end">{t("inv.suggested")}</TH></tr></THead>
            <tbody>
              {rows.map(({ v, avg, daysLeft, suggested }) => (
                <TR key={v.id}>
                  <TD><div className="font-medium">{ln(locale, v.product)}</div><div className="text-xs text-muted">{variantLabel(locale, v)}</div></TD>
                  <TD className="text-muted">{v.supplier?.name ?? "—"}</TD>
                  <TD className="num text-end font-semibold text-danger">{D(v.stockQty).toString()} {v.unit.code}</TD>
                  <TD className="num text-end text-muted">{D(v.minStock).toString()}</TD>
                  <TD className="num text-end">{avg.toString()}</TD>
                  <TD className="num text-end">{daysLeft?.toString() ?? "—"}</TD>
                  <TD className="num text-end text-lg font-semibold text-gold-700">{suggested.toString()} {v.unit.code}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
