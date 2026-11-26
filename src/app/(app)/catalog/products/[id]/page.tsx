import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getI18n } from "@/lib/i18n/server";
import { ln } from "@/lib/i18n";
import { formatUsd } from "@/lib/money";
import { mediaUrl } from "@/server/context";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ProductGeneralForm, ProductImage, VarietiesManager } from "@/components/catalog/product-form";
import { VariantsManager } from "@/components/catalog/variants-manager";

const s = (v: { toString(): string } | null) => (v === null ? null : v.toString());

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageOrgUser("catalog.manage");
  const { t, locale } = await getI18n();
  const { id } = await params;
  const orgId = user.organizationId;
  const product = await db.product.findFirst({
    where: { id, organizationId: orgId },
    include: {
      brands: { include: { brand: true } },
      varieties: { orderBy: { sortOrder: "asc" }, include: { _count: { select: { variants: true } } } },
      variants: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { barcodes: true, unit: true, brand: true, variety: true } },
    },
  });
  if (!product) notFound();
  const [categories, brands, units, suppliers, history] = await Promise.all([
    db.category.findMany({ where: { organizationId: orgId }, orderBy: { sortOrder: "asc" } }),
    db.brand.findMany({ where: { organizationId: orgId, active: true }, orderBy: { nameEn: "asc" } }),
    db.unit.findMany({ where: { organizationId: orgId, active: true }, orderBy: { code: "asc" } }),
    db.supplier.findMany({ where: { organizationId: orgId, active: true }, orderBy: { name: "asc" } }),
    db.priceHistory.findMany({
      where: { organizationId: orgId, variant: { productId: id }, ...(can(user.role, "catalog.costs") ? {} : { field: { not: "cost" } }) },
      orderBy: { createdAt: "desc" }, take: 15, include: { variant: { select: { sku: true } } },
    }),
  ]);
  const canCost = can(user.role, "catalog.costs");
  const productBrandIds = product.brands.map((b) => b.brandId);

  return (
    <>
      <Link prefetch={false} href="/catalog/products" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink-900">
        <ArrowLeft className="size-4 rtl:rotate-180" />{t("cat.products")}
      </Link>
      <PageHeader eyebrow={ln(locale, categories.find((c) => c.id === product.categoryId))} title={ln(locale, product)} description={locale === "ar" ? product.nameEn : product.nameAr} />
      {product.setupNote && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{product.setupNote}</span>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <ProductGeneralForm
            product={{
              id: product.id, categoryId: product.categoryId, nameAr: product.nameAr, nameEn: product.nameEn, description: product.description,
              taxable: product.taxable, active: product.active, setupNote: product.setupNote, brandIds: productBrandIds, imageUrl: mediaUrl(product.imageId),
            }}
            categories={categories.map((c) => ({ id: c.id, name: ln(locale, c) }))}
            brands={brands.map((b) => ({ id: b.id, name: ln(locale, b) }))}
          />
          <VariantsManager
            productId={product.id} canCost={canCost}
            brands={product.brands.map((b) => ({ id: b.brandId, name: ln(locale, b.brand) }))}
            varieties={product.varieties.map((v) => ({ id: v.id, name: ln(locale, v) }))}
            units={units.map((u) => ({ id: u.id, name: ln(locale, u), kind: u.kind, code: u.code }))}
            suppliers={suppliers.map((x) => ({ id: x.id, name: x.name }))}
            variants={product.variants.map((v) => ({
              id: v.id, brandId: v.brandId, varietyId: v.varietyId, labelAr: v.labelAr, labelEn: v.labelEn, sku: v.sku, sellMode: v.sellMode,
              packaging: v.packaging, unitId: v.unitId, packageSize: s(v.packageSize), packageUnitId: v.packageUnitId, price: s(v.price),
              wholesalePrice: s(v.wholesalePrice), cost: canCost ? s(v.cost) : null, supplierId: v.supplierId, minStock: s(v.minStock),
              reorderQty: s(v.reorderQty), trackExpiry: v.trackExpiry, trackStock: v.trackStock, active: v.active, barcodes: v.barcodes.map((b) => b.code),
              stockQty: v.stockQty.toString(), unitCode: v.unit.code, priceIsDefault: v.priceIsDefault, brandName: v.brand ? ln(locale, v.brand) : null, varietyName: v.variety ? ln(locale, v.variety) : null,
            }))}
          />
          {history.length > 0 && (
            <Card>
              <CardHeader title={t("cat.priceHistory")} />
              <Table>
                <THead><tr><TH>{t("common.date")}</TH><TH>{t("cat.sku")}</TH><TH>{t("common.type")}</TH><TH>{t("common.from")}</TH><TH>{t("common.to")}</TH></tr></THead>
                <tbody>
                  {history.map((h) => (
                    <TR key={h.id}>
                      <TD className="num text-xs text-muted">{h.createdAt.toLocaleString(locale === "ar" ? "ar-LB" : "en-GB")}</TD>
                      <TD className="num text-xs">{h.variant.sku}</TD>
                      <TD>{h.field}</TD>
                      <TD className="num">{h.oldValue ? formatUsd(h.oldValue) : "—"}</TD>
                      <TD className="num font-medium">{h.newValue ? formatUsd(h.newValue) : "—"}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <ProductImage productId={product.id} imageUrl={mediaUrl(product.imageId)} />
          <VarietiesManager productId={product.id} varieties={product.varieties.map((v) => ({ id: v.id, nameAr: v.nameAr, nameEn: v.nameEn, active: v.active, used: v._count.variants }))} />
        </div>
      </div>
    </>
  );
}
