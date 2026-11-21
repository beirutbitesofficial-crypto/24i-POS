import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { ln } from "@/lib/i18n";
import { D, formatUsd } from "@/lib/money";
import { variantOptions } from "@/server/queries";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ConvertForm } from "@/components/inventory/convert-form";

export const metadata = { title: "Convert stock" };

export default async function ConvertPage() {
  const user = await requirePageOrgUser("inventory.manage");
  const { t, locale } = await getI18n();
  const [variants, recent] = await Promise.all([
    variantOptions(user.organizationId, locale, false),
    db.stockConversion.findMany({
      where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, take: 10,
      include: { fromVariant: { include: { product: true, unit: true } }, toVariant: { include: { product: true, unit: true } } },
    }),
  ]);
  return (
    <>
      <PageHeader eyebrow={t("nav.inventory")} title={t("inv.convert")} description={t("inv.convertDesc")} />
      <ConvertForm variants={variants} />
      {recent.length > 0 && (
        <Card className="mt-6 max-w-3xl">
          <CardHeader title={t("inv.movements")} />
          <Table>
            <THead><tr><TH>{t("common.date")}</TH><TH>{t("inv.fromVariant")}</TH><TH>{t("inv.toVariant")}</TH><TH className="text-end">{t("common.cost")}</TH></tr></THead>
            <tbody>
              {recent.map((c) => (
                <TR key={c.id}>
                  <TD className="num text-xs text-muted">{c.createdAt.toLocaleString(locale === "ar" ? "ar-LB" : "en-GB")}</TD>
                  <TD>{ln(locale, c.fromVariant.product)} <span className="num text-muted">−{D(c.fromQty).toString()} {c.fromVariant.unit.code}</span></TD>
                  <TD>{ln(locale, c.toVariant.product)} <span className="num text-success">+{D(c.toQty).toString()} {c.toVariant.unit.code}</span></TD>
                  <TD className="num text-end">{formatUsd(c.totalCost)}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
