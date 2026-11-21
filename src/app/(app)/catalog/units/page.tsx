import { Ruler } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui/card";
import { SimpleCrud } from "@/components/catalog/simple-crud";
import { saveUnit, deleteUnit } from "@/server/actions/catalog";

export const metadata = { title: "Units" };

export default async function UnitsPage() {
  const user = await requirePageOrgUser("catalog.manage");
  const { t } = await getI18n();
  const units = await db.unit.findMany({ where: { organizationId: user.organizationId }, orderBy: [{ kind: "desc" }, { code: "asc" }] });
  return (
    <>
      <PageHeader eyebrow={t("nav.catalog")} title={t("cat.units")} />
      <SimpleCrud
        rows={units.map((u) => ({ id: u.id, code: u.code, nameAr: u.nameAr, nameEn: u.nameEn, kind: u.kind, allowsDecimal: u.allowsDecimal, active: u.active }))}
        columns={[
          { key: "code", label: "common.code" }, { key: "nameEn", label: "common.nameEn" }, { key: "nameAr", label: "common.nameAr" },
          { key: "kind", label: "cat.unitKind", render: "kind" }, { key: "allowsDecimal", label: "cat.allowsDecimal", render: "bool" },
          { key: "active", label: "common.status", render: "badge-active" },
        ]}
        fields={[
          { name: "code", label: "common.code", type: "text", required: true, dir: "ltr" },
          { name: "kind", label: "cat.unitKind", type: "select", options: [{ value: "WEIGHT", label: "cat.unitKind.WEIGHT" }, { value: "COUNT", label: "cat.unitKind.COUNT" }, { value: "VOLUME", label: "cat.unitKind.VOLUME" }] },
          { name: "nameAr", label: "common.nameAr", type: "text", required: true, dir: "rtl" },
          { name: "nameEn", label: "common.nameEn", type: "text", required: true, dir: "ltr" },
          { name: "allowsDecimal", label: "cat.allowsDecimal", type: "switch" },
          { name: "active", label: "common.active", type: "switch" },
        ]}
        defaults={{ kind: "COUNT", allowsDecimal: false, active: true }}
        save={saveUnit} remove={deleteUnit} newLabel="cat.newUnit" emptyIcon={<Ruler className="size-6" />}
      />
    </>
  );
}
