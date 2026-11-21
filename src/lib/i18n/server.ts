import "server-only";
import { cookies } from "next/headers";
import { LOCALE_COOKIE, makeT, type Locale } from "./index";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const v = jar.get(LOCALE_COOKIE)?.value;
  return v === "en" ? "en" : "ar"; // Arabic is the default
}

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: makeT(locale), dir: locale === "ar" ? ("rtl" as const) : ("ltr" as const) };
}
