/**
 * Seed: platform admin + the "Village Dairy" tenant with its catalog.
 *
 * Business rule: nothing is invented. No prices, stock, barcodes, suppliers,
 * extra varieties or unconfirmed brand/product links are created. Anything that
 * still needs the owner's input is flagged with `setupNote`, and variants without
 * a price cannot be sold until one is configured.
 *
 * Idempotent: re-running skips what already exists.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import { provisionOrganization, nextSku } from "../src/server/services/org";

const db = new PrismaClient();

type Sell = { mode: "WEIGHT" | "UNIT"; unit: string; packaging?: "LOOSE" | "PACKED"; labelEn?: string; labelAr?: string };

interface SeedProduct {
  en: string;
  ar: string;
  brands?: string[]; // confirmed brand availability only
  varieties?: { en: string; ar: string }[];
  /** How variants are created: per brand, per variety, single, or none (needs setup) */
  variants?: "brands" | "varieties" | "brands+varieties" | "single" | "none";
  sell?: Sell;
  note?: string;
}

const BRANDS: { en: string; ar: string }[] = [
  { en: "Jaber Jaber", ar: "جابر جابر" },
  { en: "Lakkis", ar: "لقيس" },
  { en: "Batloun", ar: "بطلون" },
  { en: "Khoury", ar: "خوري" },
  { en: "El Ra3i", ar: "الراعي" },
  { en: "Baladi", ar: "بلدي" },
  { en: "El Barki", ar: "البرقي" },
  { en: "Candia", ar: "كانديا" },
  { en: "Ben Najjar", ar: "بن نجار" },
  { en: "Al Ghazal", ar: "الغزال" },
  { en: "Forno", ar: "فورنو" },
  { en: "Pandor", ar: "بندور" },
  { en: "Tanour El Aasr", ar: "تنور العصر" },
];

const KG: Sell = { mode: "WEIGHT", unit: "kg", packaging: "LOOSE" };
const NOTE_BRANDS = "Select which brands are available for this product, then add package sizes and prices.";
const NOTE_PRICE = "Set package size and selling price before selling.";

const CATALOG: { en: string; ar: string; code: string; products: SeedProduct[] }[] = [
  {
    en: "Dairy & Cheese", ar: "ألبان وأجبان", code: "A",
    products: [
      { en: "Halloumi", ar: "حلوم", variants: "none", note: NOTE_BRANDS },
      { en: "Double Cream", ar: "دبل كريم", variants: "none", note: NOTE_BRANDS },
      { en: "Nabulsi Cheese", ar: "جبنة نابلسية", variants: "none", note: NOTE_BRANDS },
      { en: "Labneh", ar: "لبنة", variants: "none", note: NOTE_BRANDS },
      { en: "Laban", ar: "لبن", variants: "none", note: NOTE_BRANDS },
      { en: "Arishe w Aasal", ar: "عريشة وعسل", variants: "single", sell: KG, note: NOTE_PRICE },
      { en: "Ashta", ar: "قشطة", variants: "single", sell: KG, note: NOTE_PRICE },
      { en: "Shanklish", ar: "شنكليش", variants: "single", sell: KG, note: NOTE_PRICE },
      { en: "Goat Labneh (Labneh Ma3iz)", ar: "لبنة ماعز", variants: "single", sell: KG, note: NOTE_PRICE },
      { en: "Kambris", ar: "كمبريس", variants: "single", sell: KG, note: NOTE_PRICE },
      {
        en: "Mixed Cow & Goat Labneh (Labneh Mk3zale)", ar: "لبنة مكعزلة (بقر وماعز)",
        brands: ["Jaber Jaber", "Lakkis", "Baladi"], variants: "brands", sell: KG, note: NOTE_PRICE,
      },
    ],
  },
  {
    en: "Beverages & Coffee", ar: "مشروبات وقهوة", code: "B",
    products: [
      { en: "Bottled Water (May)", ar: "مياه معبأة (مي)", variants: "single", sell: { mode: "UNIT", unit: "bottle" }, note: "Add bottle sizes and prices." },
      { en: "Coffee (Ben Najjar)", ar: "قهوة (بن نجار)", brands: ["Ben Najjar"], variants: "brands", sell: { mode: "UNIT", unit: "package" }, note: "Add coffee package sizes and prices." },
    ],
  },
  {
    en: "Honey & Molasses", ar: "عسل ودبس", code: "C",
    products: [
      {
        en: "Honey (Aasal)", ar: "عسل",
        varieties: [{ en: "Original (Asle)", ar: "أصلي" }, { en: "Regular (Aade)", ar: "عادي" }],
        variants: "varieties", sell: { mode: "UNIT", unit: "jar" }, note: "Add container sizes/weights and prices.",
      },
      {
        en: "Pomegranate Molasses (Debes El Remen)", ar: "دبس الرمان",
        varieties: [{ en: "Baladi", ar: "بلدي" }, { en: "Regular", ar: "عادي" }],
        variants: "varieties", sell: { mode: "UNIT", unit: "bottle" }, note: "Add container sizes and prices.",
      },
      { en: "Carob Molasses (Debes El Kharoub)", ar: "دبس الخروب", variants: "single", sell: { mode: "UNIT", unit: "bottle" }, note: "Add container sizes and prices." },
    ],
  },
  {
    en: "Traditional Lebanese Grocery", ar: "مونة لبنانية", code: "D",
    products: [
      {
        en: "Molokhia Bags (Kyes Mloukhiye)", ar: "أكياس ملوخية",
        varieties: [{ en: "Baladi", ar: "بلدية" }, { en: "Regular", ar: "عادية" }],
        variants: "varieties", sell: { mode: "UNIT", unit: "bag" }, note: "Add bag sizes and prices.",
      },
      { en: "Tahini (Theniye)", ar: "طحينة", brands: ["Baladi", "Al Ghazal"], variants: "brands", sell: { mode: "UNIT", unit: "jar" }, note: NOTE_PRICE },
      {
        en: "Halawa (Halewe)", ar: "حلاوة", brands: ["Baladi", "Al Ghazal"],
        varieties: [{ en: "Chocolate Halawa", ar: "حلاوة بالشوكولا" }],
        variants: "brands+varieties", sell: { mode: "UNIT", unit: "package" },
        note: "Confirm which brand makes Chocolate Halawa; add sizes and prices.",
      },
      { en: "Bread (Khobez)", ar: "خبز", brands: ["Forno", "Pandor", "Tanour El Aasr"], variants: "brands", sell: { mode: "UNIT", unit: "bag" }, note: NOTE_PRICE },
      { en: "Keshek", ar: "كشك", variants: "single", sell: KG, note: NOTE_PRICE },
      { en: "Zaatar", ar: "زعتر", variants: "none", note: "Zaatar varieties will be provided — add them under Varieties, then add sizes and prices." },
    ],
  },
  {
    en: "Pickles & Olives", ar: "كبيس وزيتون", code: "E",
    products: [
      ["Mixed Pickles (Kabis)", "كبيس مشكّل"],
      ["Olives", "زيتون"],
      ["Spicy Stuffed Olives", "زيتون محشي حار"],
      ["Zaatar-Stuffed Olives", "زيتون محشي زعتر"],
      ["Carrot-Stuffed Olives", "زيتون محشي جزر"],
      ["Green Olives", "زيتون أخضر"],
      ["Black Olives", "زيتون أسود"],
      ["Sliced Green Olives", "زيتون أخضر مقطّع"],
      ["Sliced Black Olives", "زيتون أسود مقطّع"],
    ].map(([en, ar]) => ({
      en, ar, variants: "single" as const,
      sell: { mode: "WEIGHT" as const, unit: "kg", packaging: "LOOSE" as const, labelEn: "Loose (Falet)", labelAr: "فلت" },
      note: "Set the loose price per kg. Add jarred (Mortban) sizes as PACKED variants; fill jars from loose stock with Inventory → Convert.",
    })),
  },
  {
    en: "Dates", ar: "تمر", code: "F",
    products: [{ en: "Dates (Tamer)", ar: "تمر", variants: "none", note: "Date varieties will be provided — add varieties, brands, and weight/package variants." }],
  },
];

async function main() {
  const platformUser = (process.env.SEED_PLATFORM_ADMIN_USERNAME || "24i.admin").toLowerCase();
  const platformPass = process.env.SEED_PLATFORM_ADMIN_PASSWORD || "ChangeMe-24i!";
  const ownerUser = (process.env.SEED_STORE_ADMIN_USERNAME || "villagedairy.owner").toLowerCase();
  const ownerPass = process.env.SEED_STORE_ADMIN_PASSWORD || "ChangeMe-Owner!";

  await db.user.upsert({
    where: { username: platformUser },
    update: {},
    create: { username: platformUser, name: "24i Platform Admin", passwordHash: await bcrypt.hash(platformPass, 11), isPlatformAdmin: true, role: "ADMIN" },
  });
  console.log(`✓ platform admin: ${platformUser}`);

  const slug = "village-dairy";
  let org = await db.organization.findUnique({ where: { slug } });
  if (org) {
    console.log("✓ Village Dairy already exists — catalog seed skipped");
    return;
  }

  await db.$transaction(
    async (tx) => {
      org = await tx.organization.create({
        data: { name: "Village Dairy", nameAr: "Village Dairy", slug, modules: ["pos", "inventory", "reports"], notes: "First 24i POS tenant." },
      });
      await provisionOrganization(tx, {
        id: org.id, name: "Village Dairy", nameAr: "Village Dairy",
        address: "مزبود - الطريق العام، مقابل محطة الخطيب وشحادة",
      });
      const logoPath = path.join(__dirname, "seed-assets", "village-dairy-logo.jpg");
      if (fs.existsSync(logoPath)) {
        const data = fs.readFileSync(logoPath);
        const media = await tx.media.create({ data: { organizationId: org.id, mimeType: "image/jpeg", data, size: data.length } });
        await tx.storeSettings.update({
          where: { organizationId: org.id },
          data: { logoId: media.id, receiptHeader: "جبنة · لبنة · مونة", receiptFooter: "شكراً لزيارتكم — Thank you!" },
        });
      }

      await tx.user.create({
        data: { organizationId: org.id, username: ownerUser, name: "Village Dairy Owner", role: "ADMIN", passwordHash: await bcrypt.hash(ownerPass, 11) },
      });

      const units = new Map((await tx.unit.findMany({ where: { organizationId: org.id } })).map((u) => [u.code, u.id]));
      const brandIds = new Map<string, string>();
      for (const b of BRANDS) {
        const created = await tx.brand.create({ data: { organizationId: org.id, nameEn: b.en, nameAr: b.ar } });
        brandIds.set(b.en, created.id);
      }

      let catOrder = 0;
      for (const cat of CATALOG) {
        const category = await tx.category.create({
          data: { organizationId: org.id, nameEn: cat.en, nameAr: cat.ar, code: cat.code, sortOrder: catOrder++ },
        });
        let pOrder = 0;
        for (const p of cat.products) {
          const product = await tx.product.create({
            data: { organizationId: org.id, categoryId: category.id, nameEn: p.en, nameAr: p.ar, sortOrder: pOrder++, setupNote: p.note ?? null },
          });
          for (const b of p.brands ?? []) {
            await tx.productBrand.create({ data: { organizationId: org.id, productId: product.id, brandId: brandIds.get(b)! } });
          }
          const varietyIds: string[] = [];
          let vOrder = 0;
          for (const v of p.varieties ?? []) {
            const created = await tx.variety.create({ data: { organizationId: org.id, productId: product.id, nameEn: v.en, nameAr: v.ar, sortOrder: vOrder++ } });
            varietyIds.push(created.id);
          }

          if (!p.sell || !p.variants || p.variants === "none") continue;
          const combos: { brandId?: string; varietyId?: string }[] = [];
          if (p.variants === "single") combos.push({});
          if (p.variants === "brands" || p.variants === "brands+varieties") for (const b of p.brands ?? []) combos.push({ brandId: brandIds.get(b) });
          if (p.variants === "varieties" || p.variants === "brands+varieties") for (const v of varietyIds) combos.push({ varietyId: v });

          let order = 0;
          for (const c of combos) {
            await tx.productVariant.create({
              data: {
                organizationId: org.id, productId: product.id, brandId: c.brandId ?? null, varietyId: c.varietyId ?? null,
                sku: await nextSku(tx, org.id), sellMode: p.sell.mode, packaging: p.sell.packaging ?? (p.sell.mode === "WEIGHT" ? "LOOSE" : "PACKED"),
                unitId: units.get(p.sell.unit)!, labelEn: p.sell.labelEn ?? null, labelAr: p.sell.labelAr ?? null,
                price: null, cost: null, sortOrder: order++,
              },
            });
          }
        }
      }
    },
    { timeout: 60000 },
  );
  const counts = await Promise.all([
    db.product.count({ where: { organizationId: org!.id } }),
    db.productVariant.count({ where: { organizationId: org!.id } }),
  ]);
  console.log(`✓ Village Dairy tenant: owner ${ownerUser}; ${counts[0]} products, ${counts[1]} variants (all awaiting prices)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
