import type { Tx } from "@/lib/db";
import { nextNumber } from "../counter";

export const DEFAULT_UNITS = [
  { code: "kg", nameAr: "كيلوغرام", nameEn: "Kilogram", kind: "WEIGHT", allowsDecimal: true },
  { code: "g", nameAr: "غرام", nameEn: "Gram", kind: "WEIGHT", allowsDecimal: true },
  { code: "piece", nameAr: "قطعة", nameEn: "Piece", kind: "COUNT", allowsDecimal: false },
  { code: "bag", nameAr: "كيس", nameEn: "Bag", kind: "COUNT", allowsDecimal: false },
  { code: "jar", nameAr: "مرطبان", nameEn: "Jar", kind: "COUNT", allowsDecimal: false },
  { code: "bottle", nameAr: "قنينة", nameEn: "Bottle", kind: "COUNT", allowsDecimal: false },
  { code: "box", nameAr: "علبة", nameEn: "Box", kind: "COUNT", allowsDecimal: false },
  { code: "package", nameAr: "باكيت", nameEn: "Package", kind: "COUNT", allowsDecimal: false },
] as const;

/** Create the base records every new tenant needs: settings + measurement units. */
export async function provisionOrganization(
  tx: Tx,
  org: { id: string; name: string; nameAr?: string | null; address?: string | null; phone?: string | null },
) {
  await tx.storeSettings.create({
    data: { organizationId: org.id, storeName: org.name, storeNameAr: org.nameAr ?? null, address: org.address ?? null, phone: org.phone ?? null },
  });
  await tx.unit.createMany({ data: DEFAULT_UNITS.map((u) => ({ ...u, organizationId: org.id })) });
}

export async function nextSku(tx: Tx, organizationId: string) {
  const n = await nextNumber(tx, organizationId, "sku");
  return `SKU-${String(n).padStart(5, "0")}`;
}
