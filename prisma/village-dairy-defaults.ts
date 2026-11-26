/**
 * Village Dairy — catalog completion + DEFAULT (placeholder) prices, as requested by the owner
 * ("add default prices so I can come back and correct them").
 *
 * Every price set here is flagged `priceIsDefault = true` and shows a "Default price" badge
 * until the owner saves the variant with a real price. Idempotent and safe to re-run:
 *  - brands/varieties/variants are only added if missing,
 *  - a price is only written where the variant has NO price yet (owner prices are never overwritten).
 *
 * Prices are rough USD placeholders, not market data. Costs are left empty on purpose —
 * real costs come from Inventory → Receive stock.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

type Tx = Prisma.TransactionClient | PrismaClient;

const CORE_BRANDS = ["Jaber Jaber", "Lakkis", "Batloun", "Khoury", "El Ra3i", "Baladi", "El Barki", "Candia"];

/** Per-kg placeholders for loose items, per-unit for packed items (USD). */
const KG: Record<string, string> = {
  Halloumi: "10",
  "Double Cream": "8",
  "Nabulsi Cheese": "10",
  Labneh: "6",
  Laban: "3",
  "Arishe w Aasal": "8",
  Ashta: "12",
  Shanklish: "12",
  "Goat Labneh (Labneh Ma3iz)": "10",
  Kambris: "9",
  "Mixed Cow & Goat Labneh (Labneh Mk3zale)": "8",
  Keshek: "10",
  Zaatar: "8",
  "Mixed Pickles (Kabis)": "3",
  Olives: "5",
  "Spicy Stuffed Olives": "7",
  "Zaatar-Stuffed Olives": "7",
  "Carrot-Stuffed Olives": "7",
  "Green Olives": "5",
  "Black Olives": "5",
  "Sliced Green Olives": "6",
  "Sliced Black Olives": "6",
  "Dates (Tamer)": "8",
};

/** Jarred (Mortban) price per 1 kg jar */
const JAR: Record<string, string> = {
  "Mixed Pickles (Kabis)": "4",
  Olives: "6",
  "Spicy Stuffed Olives": "8",
  "Zaatar-Stuffed Olives": "8",
  "Carrot-Stuffed Olives": "8",
  "Green Olives": "6",
  "Black Olives": "6",
  "Sliced Green Olives": "7",
  "Sliced Black Olives": "7",
};

/** Packed items: product → { brand or variety English name | "*" for the only variant → price } */
const UNIT: Record<string, Record<string, string>> = {
  "Bottled Water (May)": { "*": "0.50" },
  "Coffee (Ben Najjar)": { "Ben Najjar": "4" },
  "Honey (Aasal)": { "Original (Asle)": "20", "Regular (Aade)": "10" },
  "Pomegranate Molasses (Debes El Remen)": { Baladi: "6", Regular: "3" },
  "Carob Molasses (Debes El Kharoub)": { "*": "4" },
  "Molokhia Bags (Kyes Mloukhiye)": { Baladi: "5", Regular: "3" },
  "Tahini (Theniye)": { Baladi: "7", "Al Ghazal": "5" },
  "Halawa (Halewe)": { Baladi: "5", "Al Ghazal": "4", "Chocolate Halawa": "5" },
  "Bread (Khobez)": { Forno: "1", Pandor: "1.5", "Tanour El Aasr": "1" },
};

/** Sandwiches (owner's list, prices in LBP). Made to order → no stock tracking. */
const SANDWICHES: { ar: string; en: string; lbp: number; isDefault?: boolean }[] = [
  { ar: "لبنة مع خضرة", en: "Labneh with Vegetables Sandwich", lbp: 200000 },
  { ar: "لبنة ماعز", en: "Goat Labneh Sandwich", lbp: 280000 },
  { ar: "لبنة مع مكدوس", en: "Labneh with Makdous Sandwich", lbp: 250000 },
  { ar: "فيتا أعشاب", en: "Feta with Herbs Sandwich", lbp: 250000 },
  { ar: "حبش وجبنة قشقوان", en: "Turkey & Kashkaval Sandwich", lbp: 400000 },
  { ar: "نوتيلا وموز", en: "Nutella & Banana Sandwich", lbp: 250000 },
  { ar: "قريشة وعسل", en: "Areesheh & Honey Sandwich", lbp: 300000 },
  { ar: "تونا", en: "Tuna Sandwich", lbp: 400000 },
  { ar: "حلوم", en: "Halloumi Sandwich", lbp: 270000 },
  { ar: "بلغاري هنغارية", en: "Bulgarian (Hungarian) Cheese Sandwich", lbp: 280000 },
  { ar: "حلوم وقشقوان", en: "Halloumi & Kashkaval Sandwich", lbp: 350000 },
  { ar: "فيتا عادي", en: "Plain Feta Sandwich", lbp: 250000 },
  { ar: "مرتديلا", en: "Mortadella Sandwich", lbp: 250000 },
  { ar: "مربى وزبدة", en: "Jam & Butter Sandwich", lbp: 250000 },
  { ar: "حلاوة وموز", en: "Halawa & Banana Sandwich", lbp: 250000 },
  { ar: "عكاوي وقشقوان", en: "Akkawi & Kashkaval Sandwich", lbp: 350000 },
  { ar: "عكاوي", en: "Akkawi Sandwich", lbp: 270000 },
  { ar: "حلوم مشوي وبيستو", en: "Grilled Halloumi & Pesto Sandwich", lbp: 300000, isDefault: true },
];

const DEFAULT_NOTE = "Default prices added by 24i — review and save each variant with your real price.";

export async function applyVillageDairyDefaults(tx: Tx, organizationId: string, nextSku: () => Promise<string>) {
  const log: string[] = [];
  const units = new Map((await tx.unit.findMany({ where: { organizationId } })).map((u) => [u.code, u.id]));
  const brands = new Map((await tx.brand.findMany({ where: { organizationId } })).map((b) => [b.nameEn, b.id]));
  const products = await tx.product.findMany({
    where: { organizationId },
    include: { brands: true, varieties: true, variants: { include: { brand: true, variety: true } } },
  });
  const byName = new Map(products.map((p) => [p.nameEn, p]));
  const touched = new Set<string>();

  async function setPrice(variantId: string, price: string) {
    const v = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    if (v.price !== null) return false;
    await tx.productVariant.update({ where: { id: variantId }, data: { price, priceIsDefault: true } });
    await tx.priceHistory.create({ data: { organizationId, variantId, field: "price", oldValue: null, newValue: price, userId: null } });
    return true;
  }

  async function ensureVariant(
    productId: string,
    match: { brandId?: string | null; varietyId?: string | null; packaging: "LOOSE" | "PACKED" },
    create: { sellMode: "WEIGHT" | "UNIT"; unit: string; labelEn?: string; labelAr?: string; packageSize?: string; packageUnit?: string },
  ) {
    const existing = await tx.productVariant.findFirst({
      where: { organizationId, productId, brandId: match.brandId ?? null, varietyId: match.varietyId ?? null, packaging: match.packaging },
    });
    if (existing) return existing.id;
    const v = await tx.productVariant.create({
      data: {
        organizationId, productId, brandId: match.brandId ?? null, varietyId: match.varietyId ?? null, packaging: match.packaging,
        sku: await nextSku(), sellMode: create.sellMode, unitId: units.get(create.unit)!,
        labelEn: create.labelEn ?? null, labelAr: create.labelAr ?? null,
        packageSize: create.packageSize ?? null, packageUnitId: create.packageUnit ? units.get(create.packageUnit)! : null,
      },
    });
    log.push(`+ variant ${byId(productId)} ${create.labelEn ?? ""}`.trim());
    return v.id;
  }
  const byId = (id: string) => products.find((p) => p.id === id)?.nameEn ?? id;

  // 1) The 5 core dairy products are sold under all 8 brands, by the kilo
  for (const name of ["Halloumi", "Double Cream", "Nabulsi Cheese", "Labneh", "Laban"]) {
    const p = byName.get(name);
    if (!p) continue;
    for (const b of CORE_BRANDS) {
      const brandId = brands.get(b);
      if (!brandId) continue;
      if (!p.brands.some((x) => x.brandId === brandId)) {
        await tx.productBrand.create({ data: { organizationId, productId: p.id, brandId } });
        log.push(`+ brand ${b} → ${name}`);
      }
      const id = await ensureVariant(p.id, { brandId, packaging: "LOOSE" }, { sellMode: "WEIGHT", unit: "kg" });
      if (await setPrice(id, KG[name])) touched.add(p.id);
    }
  }

  // 2) Dates: "Biscuits stuffed with date paste" variety, sold by the kilo
  const dates = byName.get("Dates (Tamer)");
  if (dates) {
    let variety = dates.varieties.find((v) => v.nameEn === "Date-Paste Stuffed Biscuits");
    if (!variety) {
      variety = await tx.variety.create({ data: { organizationId, productId: dates.id, nameEn: "Date-Paste Stuffed Biscuits", nameAr: "بسكوت محشي دبس التمر" } });
      log.push("+ variety Date-Paste Stuffed Biscuits");
    }
    const id = await ensureVariant(dates.id, { varietyId: variety.id, packaging: "LOOSE" }, { sellMode: "WEIGHT", unit: "kg" });
    if (await setPrice(id, KG["Dates (Tamer)"])) touched.add(dates.id);
  }

  // 3) Zaatar: a general loose variant until the varieties arrive
  const zaatar = byName.get("Zaatar");
  if (zaatar) {
    const id = await ensureVariant(zaatar.id, { packaging: "LOOSE" }, { sellMode: "WEIGHT", unit: "kg" });
    if (await setPrice(id, KG.Zaatar)) touched.add(zaatar.id);
  }

  // 4) Pickles & olives: loose (falet) per kg + jarred (mortban) 1 kg jar
  for (const [name, jarPrice] of Object.entries(JAR)) {
    const p = byName.get(name);
    if (!p) continue;
    const loose = await ensureVariant(p.id, { packaging: "LOOSE" }, { sellMode: "WEIGHT", unit: "kg", labelEn: "Loose (Falet)", labelAr: "فلت" });
    if (await setPrice(loose, KG[name])) touched.add(p.id);
    const jar = await ensureVariant(p.id, { packaging: "PACKED" }, { sellMode: "UNIT", unit: "jar", labelEn: "Jar (Mortban)", labelAr: "مرطبان", packageSize: "1", packageUnit: "kg" });
    if (await setPrice(jar, jarPrice)) touched.add(p.id);
  }

  // 5) Remaining single-variant dairy/grocery items sold by the kilo
  for (const name of ["Arishe w Aasal", "Ashta", "Shanklish", "Goat Labneh (Labneh Ma3iz)", "Kambris", "Keshek", "Mixed Cow & Goat Labneh (Labneh Mk3zale)"]) {
    const p = byName.get(name);
    if (!p) continue;
    for (const v of p.variants) if (await setPrice(v.id, KG[name])) touched.add(p.id);
  }

  // 6) Packed items priced per brand/variety
  for (const [name, prices] of Object.entries(UNIT)) {
    const p = byName.get(name);
    if (!p) continue;
    for (const v of p.variants) {
      const key = prices["*"] ? "*" : (v.variety?.nameEn ?? v.brand?.nameEn ?? "");
      const price = prices[key];
      if (price && (await setPrice(v.id, price))) touched.add(p.id);
    }
  }

  // 7) Sandwiches category — LBP prices converted at the store's exchange rate
  const settings = await tx.storeSettings.findUnique({ where: { organizationId } });
  const rate = Number(settings?.exchangeRate ?? 89500);
  let sandwichCat = await tx.category.findFirst({ where: { organizationId, nameEn: "Sandwiches" } });
  if (!sandwichCat) {
    const maxOrder = await tx.category.aggregate({ where: { organizationId }, _max: { sortOrder: true } });
    sandwichCat = await tx.category.create({
      data: { organizationId, nameEn: "Sandwiches", nameAr: "سندويشات", code: "G", sortOrder: (maxOrder._max.sortOrder ?? 0) + 1 },
    });
    log.push("+ category Sandwiches");
  }
  for (const [i, sw] of SANDWICHES.entries()) {
    let prod = await tx.product.findFirst({ where: { organizationId, categoryId: sandwichCat.id, nameEn: sw.en } });
    if (!prod) {
      prod = await tx.product.create({
        data: {
          organizationId, categoryId: sandwichCat.id, nameEn: sw.en, nameAr: sw.ar, sortOrder: i,
          setupNote: sw.isDefault ? "Default price added by 24i (300,000 LBP) — review and save with your real price." : null,
        },
      });
      log.push(`+ product ${sw.en}`);
    }
    const existing = await tx.productVariant.findFirst({ where: { organizationId, productId: prod.id } });
    if (!existing) {
      const price = (Math.round((sw.lbp / rate) * 10000) / 10000).toFixed(4);
      const v = await tx.productVariant.create({
        data: {
          organizationId, productId: prod.id, sku: await nextSku(), sellMode: "UNIT", packaging: "PACKED",
          unitId: units.get("piece")!, price, priceIsDefault: !!sw.isDefault, trackStock: false,
        },
      });
      await tx.priceHistory.create({ data: { organizationId, variantId: v.id, field: "price", oldValue: null, newValue: price, userId: null } });
    }
  }

  if (touched.size) {
    await tx.product.updateMany({ where: { id: { in: [...touched] } }, data: { setupNote: DEFAULT_NOTE } });
  }
  const priced = await tx.productVariant.count({ where: { organizationId, priceIsDefault: true } });
  return { log, productsUpdated: touched.size, defaultPriced: priced };
}
