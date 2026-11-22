import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { can, type Permission } from "./permissions";

export const SESSION_COOKIE = "pos24i_session";
const SESSION_HOURS = 14;
const MAX_FAILED = 6;
const LOCK_MINUTES = 10;

export interface CurrentUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  isPlatformAdmin: boolean;
  organizationId: string | null;
  organizationName: string | null;
  modules: string[];
}

/** A user inside a tenant (organization) */
export interface OrgUser extends CurrentUser {
  organizationId: string;
}

export class AuthError extends Error {
  constructor(message = "UNAUTHORIZED", public status = 401) {
    super(message);
  }
}

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 11);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

async function clientInfo() {
  const h = await headers();
  return {
    ip: (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent")?.slice(0, 250) ?? null,
  };
}

export async function login(username: string, password: string): Promise<{ ok: true; user: CurrentUser } | { ok: false; error: string }> {
  const user = await db.user.findUnique({
    where: { username: username.trim().toLowerCase() },
    include: { organization: true },
  });
  // Constant-ish time: always run bcrypt
  const fakeHash = "$2b$11$C6UzMDM.H6dfI/f/IKcEeO5H4bqkF8qH3l7b6cWb1x7bQe3zv8V9K";
  if (!user) {
    await bcrypt.compare(password, fakeHash);
    return { ok: false, error: "invalid_credentials" };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false, error: "locked" };
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: failed >= MAX_FAILED ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) } : { failedLogins: failed },
    });
    return { ok: false, error: "invalid_credentials" };
  }
  if (!user.active) return { ok: false, error: "inactive" };
  if (!user.isPlatformAdmin && (!user.organization || !user.organization.active)) return { ok: false, error: "org_inactive" };

  const token = crypto.randomBytes(32).toString("base64url");
  const info = await clientInfo();
  await db.$transaction([
    db.session.create({
      data: { tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000), ...info },
    }),
    db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } }),
    db.auditLog.create({ data: { organizationId: user.organizationId, userId: user.id, action: "auth.login", ip: info.ip } }),
  ]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return { ok: true, user: toCurrentUser(user) };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

function toCurrentUser(u: {
  id: string; name: string; username: string; role: Role; isPlatformAdmin: boolean; organizationId: string | null;
  organization: { name: string; nameAr: string | null; modules: string[] } | null;
}): CurrentUser {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    isPlatformAdmin: u.isPlatformAdmin,
    organizationId: u.organizationId,
    organizationName: u.organization?.name ?? null,
    modules: u.organization?.modules ?? [],
  };
}

/**
 * Resolve the current user from the session cookie (null if signed out / expired).
 * Memoised per request: layout + page + actions share one DB lookup.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { organization: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  const u = session.user;
  if (!u.active) return null;
  if (!u.isPlatformAdmin && (!u.organization || !u.organization.active)) return null;
  // Sliding expiry, written at most every 10 minutes
  if (Date.now() - session.lastSeenAt.getTime() > 10 * 60_000) {
    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000) },
    }).catch(() => undefined);
  }
  return toCurrentUser(u);
});

/** For pages: redirect to /login when signed out. */
export async function requirePageUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** For tenant pages: must belong to an organization and hold the permission. */
export async function requirePageOrgUser(perm?: Permission): Promise<OrgUser> {
  const u = await requirePageUser();
  if (!u.organizationId) redirect("/platform");
  if (perm && !can(u.role, perm)) redirect("/forbidden");
  return u as OrgUser;
}

/** For server actions / API routes: throws AuthError instead of redirecting. */
export async function requireOrgUser(perm?: Permission): Promise<OrgUser> {
  const u = await getCurrentUser();
  if (!u) throw new AuthError("UNAUTHORIZED", 401);
  if (!u.organizationId) throw new AuthError("NO_ORGANIZATION", 403);
  if (perm && !can(u.role, perm)) throw new AuthError("FORBIDDEN", 403);
  return u as OrgUser;
}

export async function requirePlatformAdmin(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u || !u.isPlatformAdmin) throw new AuthError("FORBIDDEN", 403);
  return u;
}

/**
 * Manager approval at the till: the current user either holds the permission,
 * or a manager/admin of the same organization enters their PIN.
 * Returns the approving user's id (or null when the current user is allowed).
 */
export async function authorize(user: OrgUser, perm: Permission, pin?: string | null): Promise<{ approvedBy: string | null }> {
  if (can(user.role, perm)) return { approvedBy: null };
  if (!pin) throw new AuthError("APPROVAL_REQUIRED", 403);
  const approver = await findApproverByPin(user.organizationId, pin, perm);
  if (!approver) throw new AuthError("INVALID_PIN", 403);
  return { approvedBy: approver };
}

export async function findApproverByPin(organizationId: string, pin: string, perm: Permission): Promise<string | null> {
  if (!/^\d{4,6}$/.test(pin)) return null;
  const candidates = await db.user.findMany({
    where: { organizationId, active: true, pinHash: { not: null }, role: { in: ["ADMIN", "MANAGER"] } },
    select: { id: true, pinHash: true, role: true },
  });
  for (const c of candidates) {
    if (can(c.role, perm) && c.pinHash && (await bcrypt.compare(pin, c.pinHash))) return c.id;
  }
  return null;
}

/** For platform pages: must be 24i staff. */
export async function requirePlatformPage(): Promise<CurrentUser> {
  const u = await requirePageUser();
  if (!u.isPlatformAdmin) redirect("/forbidden");
  return u;
}
