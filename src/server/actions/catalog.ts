"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { D } from "@/lib/money";
import { requireOrgUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { orgAction, BusinessError, toActionError, type ActionResult } from "../action";
import { audit } from "../audit";
import { nextSku } from "../services/org";
import { storeUpload } from "../services/media";

const name = z.string().trim().min(1).max(120);
const optStr = (max = 200) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const money = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v === null || v === undefined || v === "" ? null : String(v)))
  .refine((v) => v === null || (/^\d+(\.\d{1,4})?$/.test(v) && Number(v) >= 0), "invalid_number");
const qty = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v === null || v === undefined || v === "" ? null : String(v)))
  .refine((v) => v === null || (/^\d+(\.\d{1,3})?$/.test(v) && Number(v) >= 0), "invalid_number");

// ───────────── Categories ─────────────
export const saveCategory = orgAction(
  "catalog.manage",
  z.object({ id: z.string().optional(), nameAr: name, nameEn: name, code: optStr(20), sortOrder: z.coerce.number().int().default(0), color: optStr(20), active: z.boolean().default(true) }),
  async (input, user) => {
    const { id, ...data } = input;
    if (id) {
      await db.category.update({ where: { id, organizationId: user.organizationId }, data });
      return { id };
    }
    const c = await db.category.create({ data: { ...data, organizationId: user.organizationId } });
    return { id: c.id };
  },
);

export const deleteCategory = orgAction("catalog.manage", z.object({ id: z.string() }), async ({ id }, user) => {
  const used = await db.product.count({ where: { categoryId: id, organizationId: user.organizationId } });
  if (used) throw new BusinessError("IN_USE");
  await db.category.delete({ where: { id, organizationId: user.organizationId } });
  return { id };
});

// ───────────── Brands ─────────────
export const saveBrand = orgAction(
  "catalog.manage",
  z.object({ id: z.string().optional(), nameAr: name, nameEn: name, active: z.boolean().default(true) }),
  async (input, user) => {
    const { id, ...data } = input;
    if (id) {
      await db.brand.update({ where: { id, organizationId: user.organizationId }, data });
      return { id };
    }
    const b = await db.brand.create({ data: { ...data, organizationId: user.organizationId } });
    return { id: b.id };
  },
);

export const deleteBrand = orgAction("catalog.manage", z.object({ id: z.string() }), async ({ id }, user) => {
  const [v, p] = await Promise.all([
    db.productVariant.count({ where: { brandId: id, organizationId: user.organizationId } }),
    db.productBrand.count({ where: { brandId: id, organizationId: user.organizationId } }),
  ]);
  if (v || p) throw new BusinessError("IN_USE");
  await db.brand.delete({ where: { id, organizationId: user.organizationId } });
  return { id };
});

// ───────────── Units ─────────────
export const saveUnit = orgAction(
  "catalog.manage",
  z.object({
    id: z.string().optional(), code: z.string().trim().min(1).max(20).toLowerCase(), nameAr: name, nameEn: name,
    kind: z.enum(["WEIGHT", "COUNT", "VOLUME"]), allowsDecimal: z.boolean(), active: z.boolean().default(true),
  }),
  async (input, user) => {
    const { id, ...data } = input;
    if (id) {
      // Changing decimals on a unit that already has fractional stock would break invariants
      await db.unit.update({ where: { id, organizationId: user.organizationId }, data });
      return { id };
    }
    const u = await db.unit.create({ data: { ...data, organizationId: user.organizationId } });
    return { id: u.id };
  },
);

export const deleteUnit = orgAction("catalog.manage", z.object({ id: z.string() }), async ({ id }, user) => {
  const used = await db.productVariant.count({ where: { organizationId: user.organizationId, OR: [{ unitId: id }, { packageUnitId: id }] } });
  if (used) throw new BusinessError("IN_USE");
  await db.unit.delete({ where: { id, organizationId: user.organizationId } });
  return { id };
});

// ───────────── Products ─────────────
export const saveProduct = orgAction(
  "catalog.manage",
  z.object({
    id: z.string().optional(), categoryId: z.string().min(1), nameAr: name, nameEn: name, description: optStr(500),
    taxable: z.boolean().default(true), active: z.boolean().default(true), setupNote: optStr(500),
    brandIds: z.array(z.string()).default([]),
  }),
  async (input, user) => {
    const orgId = user.organizationId;
    const { id, brandIds, ...data } = input;
    await db.category.findFirstOrThrow({ where: { id: data.categoryId, organizationId: orgId } });
    const brands = await db.brand.findMany({ where: { id: { in: brandIds }, organizationId: orgId }, select: { id: true } });
    const wanted = new Set(brands.map((b) => b.id));

    return db.$transaction(async (tx) => {
      let productId = id;
      if (id) {
        await tx.product.update({ where: { id, organizationId: orgId }, data });
      } else {
        productId = (await tx.product.create({ data: { ...data, organizationId: orgId } })).id;
      }
      const current = await tx.productBrand.findMany({ where: { productId } });
      const removed = current.filter((c) => !wanted.has(c.brandId)).map((c) => c.brandId);
      if (removed.length) {
        const used = await tx.productVariant.count({ where: { productId, brandId: { in: removed } } });
        if (used) throw new BusinessError("IN_USE");
        await tx.productBrand.deleteMany({ where: { productId, brandId: { in: removed } } });
      }
      const have = new Set(current.map((c) => c.brandId));
      const added = [...wanted].filter((b) => !have.has(b));
      if (added.length) await tx.productBrand.createMany({ data: added.map((brandId) => ({ organizationId: orgId, productId: productId!, brandId })) });
      await audit({ organizationId: orgId, userId: user.id, action: id ? "product.update" : "product.create", entity: "Product", entityId: productId }, tx);
      return { id: productId! };
    });
  },
);

export const saveVariety = orgAction(
  "catalog.manage",
  z.object({ id: z.string().optional(), productId: z.string(), nameAr: name, nameEn: name, active: z.boolean().default(true), sortOrder: z.coerce.number().int().default(0) }),
  async (input, user) => {
    const { id, ...data } = input;
    await db.product.findFirstOrThrow({ where: { id: data.productId, organizationId: user.organizationId } });
    if (id) {
      await db.variety.update({ where: { id, organizationId: user.organizationId }, data });
      return { id };
    }
    const v = await db.variety.create({ data: { ...data, organizationId: user.organizationId } });
    return { id: v.id };
  },
);

export const deleteVariety = orgAction("catalog.manage", z.object({ id: z.string() }), async ({ id }, user) => {
  const used = await db.productVariant.count({ where: { varietyId: id, organizationId: user.organizationId } });
  if (used) throw new BusinessError("IN_USE");
  await db.variety.delete({ where: { id, organizationId: user.organizationId } });
  return { id };
});

// ───────────── Variants ─────────────
const variantSchema = z.object({
  id: z.string().optional(),
  productId: z.string(),
  brandId: optStr(40),
  varietyId: optStr(40),
  labelAr: optStr(80),
  labelEn: optStr(80),
  sku: optStr(40),
  sellMode: z.enum(["WEIGHT", "UNIT"]),
  packaging: z.enum(["LOOSE", "PACKED"]),
  unitId: z.string().min(1),
  packageSize: qty,
  packageUnitId: optStr(40),
  price: money,
  wholesalePrice: money,
  cost: money,
  supplierId: optStr(40),
  minStock: qty,
  reorderQty: qty,
  trackExpiry: z.boolean().default(false),
  active: z.boolean().default(true),
  barcodes: z.array(z.string().trim().min(3).max(64)).max(20).default([]),
});

export const saveVariant = orgAction("catalog.manage", variantSchema, async (input, user) => {
  const orgId = user.organizationId;
  const { id, barcodes, sku, ...data } = input;
  const product = await db.product.findFirstOrThrow({ where: { id: data.productId, organizationId: orgId }, include: { brands: true, varieties: true } });
  if (data.brandId && !product.brands.some((b) => b.brandId === data.brandId)) throw new BusinessError("VALIDATION");
  if (data.varietyId && !product.varieties.some((v) => v.id === data.varietyId)) throw new BusinessError("VALIDATION");
  const unit = await db.unit.findFirstOrThrow({ where: { id: data.unitId, organizationId: orgId } });
  if (data.sellMode === "WEIGHT" && unit.kind !== "WEIGHT") throw new BusinessError("VALIDATION");
  if (data.supplierId) await db.supplier.findFirstOrThrow({ where: { id: data.supplierId, organizationId: orgId } });
  // Cost fields are only writable by users allowed to see costs
  if (!can(user.role, "catalog.costs")) delete (data as { cost?: unknown }).cost;
  const codes = [...new Set(barcodes)];

  return db.$transaction(async (tx) => {
    let variantId = id;
    if (id) {
      const before = await tx.productVariant.findFirstOrThrow({ where: { id, organizationId: orgId } });
      // Saving the variant form = the owner confirmed this price → no longer a 24i default
      await tx.productVariant.update({ where: { id }, data: { ...data, ...(sku ? { sku } : {}), priceIsDefault: false } });
      for (const field of ["price", "cost", "wholesalePrice"] as const) {
        const oldV = before[field] === null ? null : D(before[field]!);
        const newV = data[field as keyof typeof data] as string | null | undefined;
        if (newV === undefined) continue;
        const changed = (oldV === null) !== (newV === null) || (oldV !== null && newV !== null && !oldV.eq(D(newV)));
        if (changed) {
          await tx.priceHistory.create({
            data: { organizationId: orgId, variantId: id, field, oldValue: oldV?.toString() ?? null, newValue: newV, userId: user.id },
          });
        }
      }
    } else {
      const created = await tx.productVariant.create({
        data: { ...data, organizationId: orgId, sku: sku || (await nextSku(tx, orgId)) },
      });
      variantId = created.id;
      if (data.price) await tx.priceHistory.create({ data: { organizationId: orgId, variantId, field: "price", oldValue: null, newValue: data.price, userId: user.id } });
    }
    await tx.barcode.deleteMany({ where: { variantId, code: { notIn: codes } } });
    for (const code of codes) {
      const existing = await tx.barcode.findUnique({ where: { organizationId_code: { organizationId: orgId, code } } });
      if (existing && existing.variantId !== variantId) throw new BusinessError("DUPLICATE");
      if (!existing) await tx.barcode.create({ data: { organizationId: orgId, variantId: variantId!, code } });
    }
    await audit({ organizationId: orgId, userId: user.id, action: id ? "variant.update" : "variant.create", entity: "ProductVariant", entityId: variantId,
      details: { price: data.price ?? null } }, tx);
    return { id: variantId! };
  });
});

// ───────────── Images ─────────────
export async function uploadProductImage(form: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireOrgUser("catalog.manage");
    const productId = String(form.get("productId") ?? "");
    const remove = form.get("remove") === "1";
    await db.product.findFirstOrThrow({ where: { id: productId, organizationId: user.organizationId } });
    if (remove) {
      await db.product.update({ where: { id: productId }, data: { imageId: null } });
      return { ok: true, data: { id: productId } };
    }
    const media = await storeUpload(user.organizationId, form.get("file") as File);
    await db.product.update({ where: { id: productId }, data: { imageId: media.id } });
    return { ok: true, data: { id: media.id } };
  } catch (e) {
    return toActionError(e);
  }
}

// ───────────── CSV import ─────────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

export async function importVariantsCsv(form: FormData): Promise<ActionResult<{ updated: number; skipped: number }>> {
  try {
    const user = await requireOrgUser("catalog.manage");
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024) throw new BusinessError("INVALID_FILE");
    const rows = parseCsv(await file.text());
    if (rows.length < 2) throw new BusinessError("INVALID_FILE");
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (n: string) => header.indexOf(n);
    const iSku = col("sku");
    if (iSku < 0) throw new BusinessError("INVALID_FILE");
    const num = (v: string | undefined) => {
      if (v === undefined) return undefined;
      const t = v.trim();
      if (t === "") return null;
      return /^\d+(\.\d{1,4})?$/.test(t) ? t : undefined;
    };
    const canCost = can(user.role, "catalog.costs");
    let updated = 0;
    let skipped = 0;
    await db.$transaction(async (tx) => {
      for (const r of rows.slice(1)) {
        const sku = r[iSku]?.trim();
        const v = sku ? await tx.productVariant.findUnique({ where: { organizationId_sku: { organizationId: user.organizationId, sku } } }) : null;
        if (!v) { skipped++; continue; }
        const data: Record<string, string | null | boolean> = {};
        const fields: [string, string][] = [["price", "price"], ["wholesale_price", "wholesalePrice"], ["min_stock", "minStock"], ["reorder_qty", "reorderQty"]];
        if (canCost) fields.push(["cost", "cost"]);
        for (const [h, f] of fields) {
          const i = col(h);
          if (i < 0) continue;
          const val = num(r[i]);
          if (val !== undefined) data[f] = val;
        }
        const ia = col("active");
        if (ia >= 0 && r[ia] !== undefined) data.active = !["0", "false", "no", "لا"].includes(r[ia].trim().toLowerCase());
        if (!Object.keys(data).length) { skipped++; continue; }
        for (const f of ["price", "cost", "wholesalePrice"] as const) {
          if (f in data) {
            const oldV = v[f] === null ? null : D(v[f]!);
            const newV = data[f] as string | null;
            const changed = (oldV === null) !== (newV === null) || (oldV !== null && newV !== null && !oldV.eq(D(newV)));
            if (changed) await tx.priceHistory.create({ data: { organizationId: user.organizationId, variantId: v.id, field: f, oldValue: oldV?.toString() ?? null, newValue: newV, userId: user.id } });
          }
        }
        await tx.productVariant.update({ where: { id: v.id }, data: { ...data, ...("price" in data ? { priceIsDefault: false } : {}) } });
        updated++;
      }
      await audit({ organizationId: user.organizationId, userId: user.id, action: "catalog.import", details: { updated, skipped } }, tx);
    }, { timeout: 60000 });
    return { ok: true, data: { updated, skipped } };
  } catch (e) {
    return toActionError(e);
  }
}
