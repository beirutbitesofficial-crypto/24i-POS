import { Truck } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui/card";
import { SimpleCrud } from "@/components/catalog/simple-crud";
import { saveSupplier, deleteSupplier } from "@/server/actions/inventory";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const user = await requirePageOrgUser("suppliers.manage");
  const { t } = await getI18n();
  const rows = await db.supplier.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, include: { _count: { select: { purchases: true, variants: true } } } });
  return (
    <>
      <PageHeader eyebrow={t("nav.inventory")} title={t("sup.title")} />
      <SimpleCrud
        rows={rows.map((s) => ({ id: s.id, name: s.name, contactName: s.contactName, phone: s.phone, address: s.address, notes: s.notes, active: s.active, purchases: s._count.purchases }))}
        columns={[
          { key: "name", label: "common.name" }, { key: "contactName", label: "sup.contact" }, { key: "phone", label: "common.phone" },
          { key: "purchases", label: "sup.purchases" }, { key: "active", label: "common.status", render: "badge-active" },
        ]}
        fields={[
          { name: "name", label: "common.name", type: "text", required: true },
          { name: "contactName", label: "sup.contact", type: "text" },
          { name: "phone", label: "common.phone", type: "text", dir: "ltr" },
          { name: "address", label: "common.address", type: "text" },
          { name: "notes", label: "common.notes", type: "text" },
          { name: "active", label: "common.active", type: "switch" },
        ]}
        defaults={{ active: true }}
        save={saveSupplier} remove={deleteSupplier} newLabel="sup.new" emptyIcon={<Truck className="size-6" />}
      />
    </>
  );
}
