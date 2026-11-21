"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, requirePlatformAdmin } from "@/lib/auth";
import { BusinessError, toActionError, type ActionResult } from "../action";
import { audit } from "../audit";
import { provisionOrganization } from "../services/org";

const MODULES = ["pos", "inventory", "reports"] as const;

async function run<T>(fn: (adminId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const admin = await requirePlatformAdmin();
    return { ok: true, data: await fn(admin.id) };
  } catch (e) {
    return toActionError(e);
  }
}

const orgSchema = z.object({
  name: z.string().trim().min(2).max(120),
  nameAr: z.string().trim().max(120).nullish(),
  slug: z.string().trim().toLowerCase().min(2).max(60).regex(/^[a-z0-9-]+$/),
  modules: z.array(z.enum(MODULES)).min(1),
  ownerName: z.string().trim().min(1).max(120),
  ownerUsername: z.string().trim().toLowerCase().min(3).max(60).regex(/^[a-z0-9._-]+$/),
  ownerPassword: z.string().min(8).max(200),
  notes: z.string().max(1000).nullish(),
});

export async function createOrganization(raw: z.input<typeof orgSchema>) {
  return run(async (adminId) => {
    const input = orgSchema.parse(raw);
    if (await db.organization.findUnique({ where: { slug: input.slug } })) throw new BusinessError("SLUG_TAKEN");
    if (await db.user.findUnique({ where: { username: input.ownerUsername } })) throw new BusinessError("DUPLICATE");
    const passwordHash = await hashPassword(input.ownerPassword);
    return db.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: input.name, nameAr: input.nameAr || null, slug: input.slug, modules: input.modules, notes: input.notes ?? null } });
      await provisionOrganization(tx, { id: org.id, name: input.name, nameAr: input.nameAr });
      await tx.user.create({ data: { organizationId: org.id, name: input.ownerName, username: input.ownerUsername, passwordHash, role: "ADMIN" } });
      await audit({ organizationId: org.id, userId: adminId, action: "platform.org_create", entity: "Organization", entityId: org.id }, tx);
      return { id: org.id };
    });
  });
}

const updateSchema = z.object({ id: z.string(), name: z.string().trim().min(2).max(120), nameAr: z.string().trim().max(120).nullish(), active: z.boolean(), modules: z.array(z.enum(MODULES)).min(1), notes: z.string().max(1000).nullish() });

export async function updateOrganization(raw: z.input<typeof updateSchema>) {
  return run(async (adminId) => {
    const input = updateSchema.parse(raw);
    await db.organization.update({ where: { id: input.id }, data: { name: input.name, nameAr: input.nameAr || null, active: input.active, modules: input.modules, notes: input.notes ?? null } });
    if (!input.active) await db.session.deleteMany({ where: { user: { organizationId: input.id } } });
    await audit({ organizationId: input.id, userId: adminId, action: "platform.org_update", entity: "Organization", entityId: input.id, details: { active: input.active, modules: input.modules } });
    return { id: input.id };
  });
}

const userSchema = z.object({
  organizationId: z.string(),
  id: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  username: z.string().trim().toLowerCase().min(3).max(60).regex(/^[a-z0-9._-]+$/),
  role: z.enum(["ADMIN", "MANAGER", "CASHIER"]),
  password: z.string().max(200).nullish(),
  pin: z.string().regex(/^(\d{4,6})?$/).nullish(),
  clearPin: z.boolean().default(false),
  active: z.boolean().default(true),
});

export async function savePlatformUser(raw: z.input<typeof userSchema>) {
  return run(async (adminId) => {
    const input = userSchema.parse(raw);
    if (input.password && input.password.length < 8) throw new BusinessError("WEAK_PASSWORD");
    await db.organization.findUniqueOrThrow({ where: { id: input.organizationId } });
    const data = {
      name: input.name, username: input.username, role: input.role, active: input.active,
      ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
      ...(input.pin ? { pinHash: await hashPassword(input.pin) } : input.clearPin ? { pinHash: null } : {}),
    };
    if (input.id) {
      const u = await db.user.findFirst({ where: { id: input.id, organizationId: input.organizationId } });
      if (!u) throw new BusinessError("NOT_FOUND");
      await db.user.update({ where: { id: u.id }, data: { ...data, ...(input.password ? { failedLogins: 0, lockedUntil: null } : {}) } });
      if (input.password || !input.active) await db.session.deleteMany({ where: { userId: u.id } });
      await audit({ organizationId: input.organizationId, userId: adminId, action: "platform.user_update", entity: "User", entityId: u.id });
      return { id: u.id };
    }
    if (!input.password) throw new BusinessError("WEAK_PASSWORD");
    const u = await db.user.create({ data: { ...data, organizationId: input.organizationId, passwordHash: await hashPassword(input.password) } });
    await audit({ organizationId: input.organizationId, userId: adminId, action: "platform.user_create", entity: "User", entityId: u.id });
    return { id: u.id };
  });
}
