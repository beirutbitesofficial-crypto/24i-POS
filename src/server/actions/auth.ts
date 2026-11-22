"use server";
import { cookies } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { login, logout, getCurrentUser } from "@/lib/auth";
import { LOCALE_COOKIE } from "@/lib/i18n";

export async function loginAction(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const parsed = z.object({ username: z.string().min(1).max(80), password: z.string().min(1).max(200) }).safeParse({
    username: form.get("username"), password: form.get("password"),
  });
  if (!parsed.success) return { error: "invalid_credentials" };
  let res: Awaited<ReturnType<typeof login>>;
  try {
    res = await login(parsed.data.username, parsed.data.password);
  } catch (e) {
    unstable_rethrow(e);
    // Record the real cause for diagnosis, show the user a clean message
    const { onRequestError } = await import("@/instrumentation");
    await onRequestError(e, { path: "/login (action)", method: "POST" }, { routeType: "action" });
    return { error: "server_error" };
  }
  if (!res.ok) return { error: res.error };
  // First login on this device: use the store's default language
  const jar = await cookies();
  if (!jar.get(LOCALE_COOKIE) && res.defaultLanguage) {
    jar.set(LOCALE_COOKIE, res.defaultLanguage === "en" ? "en" : "ar", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
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
