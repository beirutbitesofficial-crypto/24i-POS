import { Tags } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui/card";
import { SimpleCrud } from "@/components/catalog/simple-crud";
import { saveCategory, deleteCategory } from "@/server/actions/catalog";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const user = await requirePageOrgUser("catalog.manage");
  const { t } = await getI18n();
  const cats = await db.category.findMany({
    where: { organizationId: user.organizationId }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return (
    <>
      <PageHeader eyebrow={t("nav.catalog")} title={t("cat.categories")} />
      <SimpleCrud
        rows={cats.map((c) => ({ id: c.id, nameAr: c.nameAr, nameEn: c.nameEn, code: c.code, sortOrder: c.sortOrder, color: c.color, active: c.active, products: c._count.products }))}
        columns={[
          { key: "color", label: "cat.color", render: "color" }, { key: "code", label: "common.code" },
          { key: "nameEn", label: "common.nameEn" }, { key: "nameAr", label: "common.nameAr" },
          { key: "products", label: "cat.products" }, { key: "sortOrder", label: "common.sortOrder" }, { key: "active", label: "common.status", render: "badge-active" },
        ]}
        fields={[
          { name: "nameAr", label: "common.nameAr", type: "text", required: true, dir: "rtl" },
          { name: "nameEn", label: "common.nameEn", type: "text", required: true, dir: "ltr" },
          { name: "code", label: "common.code", type: "text" },
          { name: "sortOrder", label: "common.sortOrder", type: "number" },
          { name: "color", label: "cat.color", type: "color" },
          { name: "active", label: "common.active", type: "switch" },
        ]}
        defaults={{ active: true, sortOrder: cats.length }}
        save={saveCategory} remove={deleteCategory} newLabel="cat.newCategory" emptyIcon={<Tags className="size-6" />}
      />
    </>
  );
}
