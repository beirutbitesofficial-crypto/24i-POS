"use client";
import { createContext, useContext, useMemo } from "react";
import { makeT, translateError, type Locale, type TFn } from "./index";

const Ctx = createContext<{ locale: Locale; t: TFn; dir: "rtl" | "ltr" }>({ locale: "ar", t: makeT("ar"), dir: "rtl" });

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(locale), dir: locale === "ar" ? ("rtl" as const) : ("ltr" as const) }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  return { ...c, te: (error: string) => translateError(c.t, error) };
}
