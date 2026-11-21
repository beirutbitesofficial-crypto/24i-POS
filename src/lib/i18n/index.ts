import { en, type DictKey } from "./en";
import { ar } from "./ar";

export type Locale = "ar" | "en";
export type { DictKey };
export const dictionaries: Record<Locale, Record<DictKey, string>> = { en, ar };
export const LOCALE_COOKIE = "pos24i_lang";

export type TFn = (key: DictKey, params?: Record<string, string | number>) => string;

export function makeT(locale: Locale): TFn {
  const d = dictionaries[locale];
  return (key, params) => {
    let s = d[key] ?? en[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

/** Translate an action error code like "INSUFFICIENT_STOCK|{"name":"x"}" */
export function translateError(t: TFn, error: string): string {
  const [code, json] = error.split(/\|(.*)/s);
  const key = `err.${code}` as DictKey;
  let params: Record<string, string> | undefined;
  try { params = json ? JSON.parse(json) : undefined; } catch { params = undefined; }
  const s = t(key, params);
  return s === key ? t("err.SERVER_ERROR") : s;
}

/** Pick the localized name of a record with nameAr/nameEn */
export function ln(locale: Locale, r: { nameAr?: string | null; nameEn?: string | null } | null | undefined): string {
  if (!r) return "";
  return (locale === "ar" ? r.nameAr || r.nameEn : r.nameEn || r.nameAr) ?? "";
}

/** Snapshot strings stored as "English|Arabic" */
export function lpair(locale: Locale, s: string | null | undefined): string {
  if (!s) return "";
  return s
    .split(" · ")
    .map((part) => {
      const [e, a] = part.split("|");
      return locale === "ar" ? a || e : e;
    })
    .join(" · ");
}
