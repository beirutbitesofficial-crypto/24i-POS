"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { login, logout, getCurrentUser } from "@/lib/auth";
import { LOCALE_COOKIE } from "@/lib/i18n";
import { db } from "@/lib/db";

export async function loginAction(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const parsed = z.object({ username: z.string().min(1).max(80), password: z.string().min(1).max(200) }).safeParse({
    username: form.get("username"), password: form.get("password"),
  });
  if (!parsed.success) return { error: "invalid_credentials" };
  const res = await login(parsed.data.username, parsed.data.password);
  if (!res.ok) return { error: res.error };
  // First login on this device: use the store's default language
  const jar = await cookies();
  if (!jar.get(LOCALE_COOKIE) && res.user.organizationId) {
    const s = await db.storeSettings.findUnique({ where: { organizationId: res.user.organizationId }, select: { defaultLanguage: true } });
    if (s) jar.set(LOCALE_COOKIE, s.defaultLanguage === "en" ? "en" : "ar", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  }
  redirect(homeFor(res.user));
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function setLanguageAction(locale: "ar" | "en") {
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale === "en" ? "en" : "ar", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

function homeFor(u: { isPlatformAdmin: boolean; organizationId: string | null; role: string }) {
  if (u.isPlatformAdmin && !u.organizationId) return "/platform";
  return u.role === "CASHIER" ? "/pos" : "/dashboard";
}

export async function homePath() {
  const u = await getCurrentUser();
  return u ? homeFor(u) : "/login";
}
