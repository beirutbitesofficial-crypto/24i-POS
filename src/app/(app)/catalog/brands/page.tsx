import { Award } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui/card";
import { SimpleCrud } from "@/components/catalog/simple-crud";
import { saveBrand, deleteBrand } from "@/server/actions/catalog";

export const metadata = { title: "Brands" };

export default async function BrandsPage() {
  const user = await requirePageOrgUser("catalog.manage");
  const { t } = await getI18n();
  const brands = await db.brand.findMany({
    where: { organizationId: user.organizationId }, orderBy: { nameEn: "asc" },
    include: { _count: { select: { products: true, variants: true } } },
  });
  return (
    <>
      <PageHeader eyebrow={t("nav.catalog")} title={t("cat.brands")} description={t("cat.availableBrandsHint")} />
      <SimpleCrud
        rows={brands.map((b) => ({ id: b.id, nameAr: b.nameAr, nameEn: b.nameEn, active: b.active, products: b._count.products, variants: b._count.variants }))}
        columns={[
          { key: "nameEn", label: "common.nameEn" }, { key: "nameAr", label: "common.nameAr" },
          { key: "products", label: "cat.products" }, { key: "variants", label: "cat.variants" }, { key: "active", label: "common.status", render: "badge-active" },
        ]}
        fields={[
          { name: "nameAr", label: "common.nameAr", type: "text", required: true, dir: "rtl" },
          { name: "nameEn", label: "common.nameEn", type: "text", required: true, dir: "ltr" },
          { name: "active", label: "common.active", type: "switch" },
        ]}
        defaults={{ active: true }}
        save={saveBrand} remove={deleteBrand} newLabel="cat.newBrand" emptyIcon={<Award className="size-6" />}
      />
    </>
  );
}
