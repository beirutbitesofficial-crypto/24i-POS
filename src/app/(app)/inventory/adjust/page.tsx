import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getI18n } from "@/lib/i18n/server";
import { D } from "@/lib/money";
import { variantOptions } from "@/server/queries";
import { PageHeader } from "@/components/ui/card";
import { AdjustForm } from "@/components/inventory/adjust-form";

export const metadata = { title: "Adjust stock" };

export default async function AdjustPage() {
  const user = await requirePageOrgUser("inventory.manage");
  const { t, locale } = await getI18n();
  const canCost = can(user.role, "catalog.costs");
  const [variants, lots] = await Promise.all([
    variantOptions(user.organizationId, locale, canCost),
    db.inventoryLot.findMany({ where: { organizationId: user.organizationId, quantityLeft: { gt: 0 } }, orderBy: [{ expiryDate: { sort: "asc", nulls: "last" } }, { receivedAt: "asc" }] }),
  ]);
  const lotsByVariant: Record<string, { id: string; label: string }[]> = {};
  for (const l of lots) {
    (lotsByVariant[l.variantId] ??= []).push({
      id: l.id,
      label: `${l.lotNumber ?? l.receivedAt.toISOString().slice(0, 10)} · ${D(l.quantityLeft).toString()}${l.expiryDate ? ` · ⌛ ${l.expiryDate.toISOString().slice(0, 10)}` : ""}`,
    });
  }
  return (
    <>
      <PageHeader eyebrow={t("nav.inventory")} title={t("inv.adjust")} description={t("inv.adjustDesc")} />
      <AdjustForm variants={variants} lotsByVariant={lotsByVariant} canCost={canCost} />
    </>
  );
}
