import "server-only";
import { db } from "@/lib/db";
import { ln, type Locale } from "@/lib/i18n";

export interface VariantOption {
  id: string;
  label: string;
  sub: string;
  sku: string;
  unitCode: string;
  allowsDecimal: boolean;
  sellMode: "WEIGHT" | "UNIT";
  packaging: "LOOSE" | "PACKED";
  stock: string;
  cost: string | null;
  barcodes: string[];
}

export function variantLabel(
  locale: Locale,
  v: { labelAr: string | null; labelEn: string | null; packageSize: { toString(): string } | null; brand: { nameAr: string; nameEn: string } | null; variety: { nameAr: string; nameEn: string } | null; packageUnit?: { code: string } | null },
) {
  return [
    v.brand && ln(locale, v.brand),
    v.variety && ln(locale, v.variety),
    locale === "ar" ? v.labelAr || v.labelEn : v.labelEn || v.labelAr,
    v.packageSize ? `${Number(v.packageSize.toString())} ${v.packageUnit?.code ?? ""}`.trim() : null,
  ].filter(Boolean).join(" · ");
}

export async function variantOptions(organizationId: string, locale: Locale, withCost: boolean): Promise<VariantOption[]> {
  const vs = await db.productVariant.findMany({
    where: { organizationId, active: true },
    include: { product: true, brand: true, variety: true, unit: true, packageUnit: true, barcodes: { select: { code: true } } },
    orderBy: [{ product: { category: { sortOrder: "asc" } } }, { product: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });
  return vs.map((v) => ({
    id: v.id,
    label: ln(locale, v.product),
    sub: variantLabel(locale, v),
    sku: v.sku,
    unitCode: v.unit.code,
    allowsDecimal: v.unit.allowsDecimal,
    sellMode: v.sellMode,
    packaging: v.packaging,
    stock: v.stockQty.toString(),
    cost: withCost && v.cost ? v.cost.toString() : null,
    barcodes: v.barcodes.map((b) => b.code),
  }));
}
