/**
 * Apply Village Dairy catalog completion + default prices to an EXISTING database.
 *   npm run db:defaults
 * Safe to re-run: never overwrites a price that is already set.
 */
import { PrismaClient } from "@prisma/client";
import { applyVillageDairyDefaults } from "./village-dairy-defaults";
import { nextSku } from "../src/server/services/org";

const db = new PrismaClient();

async function main() {
  const org = await db.organization.findUnique({ where: { slug: "village-dairy" } });
  if (!org) throw new Error("Village Dairy organization not found — run npm run db:seed first");
  const r = await db.$transaction(async (tx) => {
    const res = await applyVillageDairyDefaults(tx, org.id, () => nextSku(tx, org.id));
    await tx.auditLog.create({ data: { organizationId: org.id, action: "catalog.default_prices", details: { added: res.log.length, productsUpdated: res.productsUpdated } } });
    return res;
  }, { timeout: 60000 });
  for (const l of r.log) console.log("  " + l);
  console.log(`✓ ${r.productsUpdated} products got default prices · ${r.defaultPriced} variants currently on a default price`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
