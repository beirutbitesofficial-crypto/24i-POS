import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { variantOptions } from "@/server/queries";
import { PageHeader } from "@/components/ui/card";
import { ReceiveForm } from "@/components/inventory/receive-form";

export const metadata = { title: "Receive stock" };

export default async function ReceivePage() {
  const user = await requirePageOrgUser("inventory.manage");
  const { t, locale } = await getI18n();
  const [variants, suppliers] = await Promise.all([
    variantOptions(user.organizationId, locale, true),
    db.supplier.findMany({ where: { organizationId: user.organizationId, active: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader eyebrow={t("nav.inventory")} title={t("inv.receive")} description={t("inv.receiveDesc")} />
      <ReceiveForm variants={variants} suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))} />
    </>
  );
}
