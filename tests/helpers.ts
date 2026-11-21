import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { provisionOrganization, nextSku } from "@/server/services/org";
import type { OrgUser } from "@/lib/auth";
import type { Role } from "@prisma/client";

let n = 0;
export async function makeOrg() {
  n++;
  const slug = `t-${Date.now()}-${n}`;
  const org = await db.organization.create({ data: { name: `Test ${n}`, slug } });
  await db.$transaction(async (tx) => provisionOrganization(tx, { id: org.id, name: org.name }));
  const cat = await db.category.create({ data: { organizationId: org.id, nameEn: "Dairy", nameAr: "ألبان" } });
  const product = await db.product.create({ data: { organizationId: org.id, categoryId: cat.id, nameEn: "Halloumi", nameAr: "حلوم" } });
  const units = new Map((await db.unit.findMany({ where: { organizationId: org.id } })).map((u) => [u.code, u.id]));
  return { org, cat, product, units };
}

export async function makeUser(organizationId: string, role: Role, pin?: string): Promise<OrgUser> {
  n++;
  const u = await db.user.create({
    data: {
      organizationId, role, username: `u${n}-${Date.now()}`, name: `User ${n}`, passwordHash: "x",
      pinHash: pin ? await bcrypt.hash(pin, 4) : null,
    },
  });
  return { id: u.id, name: u.name, username: u.username, role, isPlatformAdmin: false, organizationId, organizationName: "T", modules: [] };
}

export async function makeVariant(orgId: string, productId: string, unitId: string, opts: { price?: string | null; cost?: string; mode?: "WEIGHT" | "UNIT" } = {}) {
  const sku = await db.$transaction((tx) => nextSku(tx, orgId));
  return db.productVariant.create({
    data: {
      organizationId: orgId, productId, unitId, sku, sellMode: opts.mode ?? "WEIGHT",
      price: opts.price === undefined ? "10" : opts.price, cost: opts.cost ?? null,
    },
  });
}

export async function openShift(orgId: string, userId: string) {
  return db.cashShift.create({ data: { organizationId: orgId, userId, number: Math.floor(Math.random() * 1e9), openingUsd: "100", openingLbp: "0" } });
}
