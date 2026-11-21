"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, requireOrgUser } from "@/lib/auth";
import { orgAction, BusinessError, toActionError, type ActionResult } from "../action";
import { audit } from "../audit";
import { storeUpload } from "../services/media";

const optStr = (max = 200) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

export const saveSettings = orgAction(
  "settings.manage",
  z.object({
    storeName: z.string().trim().min(1).max(120),
    storeNameAr: optStr(120),
    address: optStr(300),
    phone: optStr(60),
    exchangeRate: z.string().refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0, "invalid_number"),
    lbpRounding: z.coerce.number().int().min(1).max(100000),
    lbpRoundingMode: z.enum(["NEAREST", "UP", "DOWN"]),
    taxEnabled: z.boolean(),
    taxRate: z.string().refine((v) => /^\d+(\.\d{1,3})?$/.test(v) && Number(v) < 100, "invalid_number"),
    taxInclusive: z.boolean(),
    taxLabel: z.string().trim().min(1).max(20),
    receiptHeader: optStr(200),
    receiptFooter: optStr(300),
    receiptShowLogo: z.boolean(),
    receiptShowLbp: z.boolean(),
    printMode: z.enum(["BROWSER", "BRIDGE"]),
    printBridgeUrl: optStr(200).refine((v) => v === null || /^https?:\/\/[^\s]+$/.test(v), "invalid_url"),
    paperWidthMm: z.coerce.number().int().refine((v) => v === 58 || v === 80),
    autoPrint: z.boolean(),
    allowNegativeStock: z.boolean(),
    cashierMaxDiscount: z.string().refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) <= 100, "invalid_number"),
    requirePinForVoid: z.boolean(),
    expiryAlertDays: z.coerce.number().int().min(0).max(365),
    defaultLanguage: z.enum(["ar", "en"]),
  }),
  async (input, user) => {
    const before = await db.storeSettings.findUniqueOrThrow({ where: { organizationId: user.organizationId } });
    const rateChanged = before.exchangeRate.toString() !== input.exchangeRate && Number(before.exchangeRate) !== Number(input.exchangeRate);
    await db.storeSettings.update({
      where: { organizationId: user.organizationId },
      data: { ...input, ...(rateChanged ? { exchangeRateUpdated: new Date() } : {}) },
    });
    await audit({ organizationId: user.organizationId, userId: user.id, action: "settings.update",
      details: rateChanged ? { exchangeRate: { from: before.exchangeRate.toString(), to: input.exchangeRate } } : undefined });
    return { ok: true };
  },
);

export async function uploadLogo(form: FormData): Promise<ActionResult<{ id: string | null }>> {
  try {
    const user = await requireOrgUser("settings.manage");
    if (form.get("remove") === "1") {
      await db.storeSettings.update({ where: { organizationId: user.organizationId }, data: { logoId: null } });
      return { ok: true, data: { id: null } };
    }
    const media = await storeUpload(user.organizationId, form.get("file") as File);
    await db.storeSettings.update({ where: { organizationId: user.organizationId }, data: { logoId: media.id } });
    return { ok: true, data: { id: media.id } };
  } catch (e) {
    return toActionError(e);
  }
}

// ───────────── Users ─────────────
export const saveUser = orgAction(
  "users.manage",
  z.object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(120),
    username: z.string().trim().toLowerCase().min(3).max(60).regex(/^[a-z0-9._-]+$/),
    role: z.enum(["ADMIN", "MANAGER", "CASHIER"]),
    password: z.string().max(200).nullish(),
    pin: z.string().regex(/^(\d{4,6})?$/).nullish(),
    clearPin: z.boolean().default(false),
    active: z.boolean().default(true),
  }),
  async (input, user) => {
    const orgId = user.organizationId;
    if (input.password && input.password.length < 8) throw new BusinessError("WEAK_PASSWORD");
    const data = {
      name: input.name, username: input.username, role: input.role, active: input.active,
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
      ...(input.pin ? { pinHash: await hashPassword(input.pin) } : input.clearPin ? { pinHash: null } : {}),
    };
    if (input.id) {
      const existing = await db.user.findFirst({ where: { id: input.id, organizationId: orgId } });
      if (!existing) throw new BusinessError("NOT_FOUND");
      // Never lock the store out: keep at least one active admin
      if (existing.role === "ADMIN" && (input.role !== "ADMIN" || !input.active)) {
        const admins = await db.user.count({ where: { organizationId: orgId, role: "ADMIN", active: true, id: { not: existing.id } } });
        if (admins === 0) throw new BusinessError("LAST_ADMIN");
      }
      await db.user.update({ where: { id: existing.id }, data });
      if (input.password || !input.active) await db.session.deleteMany({ where: { userId: existing.id, ...(existing.id === user.id ? { NOT: { userId: user.id } } : {}) } });
      await audit({ organizationId: orgId, userId: user.id, action: "user.update", entity: "User", entityId: existing.id, details: { role: input.role, active: input.active, passwordChanged: !!input.password } });
      return { id: existing.id };
    }
    if (!input.password) throw new BusinessError("WEAK_PASSWORD");
    const u = await db.user.create({ data: { ...data, organizationId: orgId, passwordHash: await hashPassword(input.password) } });
    await audit({ organizationId: orgId, userId: user.id, action: "user.create", entity: "User", entityId: u.id, details: { role: input.role } });
    return { id: u.id };
  },
);
