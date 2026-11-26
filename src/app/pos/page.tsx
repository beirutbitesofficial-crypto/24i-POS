import { requirePageOrgUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { ln } from "@/lib/i18n";
import { getSettings, mediaUrl } from "@/server/context";
import { PosClient } from "@/components/pos/pos-client";
import { OpenShiftScreen } from "@/components/pos/open-shift";
import type { PosProduct, PosSettings } from "@/components/pos/types";

export const metadata = { title: "POS" };
export const dynamic = "force-dynamic";

export default async function PosPage() {
  const user = await requirePageOrgUser("pos.sell");
  const { locale } = await getI18n();
  const orgId = user.organizationId;
  const [s, shift] = await Promise.all([
    getSettings(orgId),
    db.cashShift.findFirst({ where: { organizationId: orgId, userId: user.id, closedAt: null } }),
  ]);
  const storeName = (locale === "ar" ? s.storeNameAr || s.storeName : s.storeName) ?? "";
  if (!shift) return <OpenShiftScreen storeName={storeName} userName={user.name} role={user.role} canBackOffice={can(user.role, "dashboard.view")} />;

  const [categories, products, held] = await Promise.all([
    db.category.findMany({ where: { organizationId: orgId, active: true }, orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }] }),
    db.product.findMany({
      where: { organizationId: orgId, active: true, category: { active: true } },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { nameEn: "asc" }],
      include: {
        variants: {
          where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          include: { brand: true, variety: true, unit: true, packageUnit: true, barcodes: { select: { code: true } } },
        },
      },
    }),
    db.heldSale.count({ where: { organizationId: orgId } }),
  ]);

  const posProducts: PosProduct[] = products.map((p) => {
    const variants = p.variants.map((v) => {
      const size = v.packageSize ? `${Number(v.packageSize)} ${v.packageUnit?.code ?? ""}`.trim() : "";
      const label = [v.brand && ln(locale, v.brand), v.variety && ln(locale, v.variety), locale === "ar" ? v.labelAr || v.labelEn : v.labelEn || v.labelAr, size]
        .filter(Boolean).join(" · ");
      return {
        id: v.id, sku: v.sku, label, sellMode: v.sellMode, unitCode: v.unit.code, allowsDecimal: v.unit.allowsDecimal,
        price: v.price?.toString() ?? null, stock: v.stockQty.toString(), trackStock: v.trackStock, barcodes: v.barcodes.map((b) => b.code),
        search: [v.sku, v.brand?.nameEn, v.brand?.nameAr, v.variety?.nameEn, v.variety?.nameAr, v.labelEn, v.labelAr].filter(Boolean).join(" ").toLowerCase(),
      };
    });
    return {
      id: p.id, name: ln(locale, p), altName: locale === "ar" ? p.nameEn : p.nameAr, categoryId: p.categoryId,
      imageUrl: mediaUrl(p.imageId), taxable: p.taxable, variants,
      search: `${p.nameEn} ${p.nameAr} ${variants.map((v) => v.search).join(" ")}`.toLowerCase(),
    };
  });

  const settings: PosSettings = {
    rate: s.exchangeRate.toString(), lbpRounding: s.lbpRounding, lbpMode: s.lbpRoundingMode as PosSettings["lbpMode"],
    taxEnabled: s.taxEnabled, taxRate: s.taxRate.toString(), taxInclusive: s.taxInclusive, taxLabel: s.taxLabel,
    cashierMaxDiscount: s.cashierMaxDiscount.toString(), requirePinForVoid: s.requirePinForVoid, allowNegativeStock: s.allowNegativeStock,
    autoPrint: s.autoPrint, printMode: s.printMode as PosSettings["printMode"], printBridgeUrl: s.printBridgeUrl, storeName, logoUrl: mediaUrl(s.logoId),
  };

  return (
    <PosClient
      user={{ name: user.name, role: user.role, canVoid: can(user.role, "pos.void"), canBackOffice: can(user.role, "dashboard.view"), canOverride: can(user.role, "pos.price_override") }}
      shift={{ id: shift.id, number: shift.number }}
      categories={categories.map((c) => ({ id: c.id, name: ln(locale, c), color: c.color }))}
      products={posProducts}
      settings={settings}
      heldCount={held}
    />
  );
}
