"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { THEME_COOKIE } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Light/dark toggle. Applies instantly on <html> and remembers the choice in a cookie (read by the root layout, so no flash). */
export function ThemeSwitch({ className, dark: onDarkSurface }: { className?: string; dark?: boolean }) {
  const { t } = useI18n();
  const [isDark, setIsDark] = useState(false);
  useEffect(() => setIsDark(document.documentElement.classList.contains("dark")), []);
  const toggle = () => {
    const next = !isDark;
    document.documentElement.classList.toggle("dark", next);
    document.cookie = `${THEME_COOKIE}=${next ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
    setIsDark(next);
  };
  const label = isDark ? t("app.lightMode") : t("app.darkMode");
  return (
    <button type="button" onClick={toggle} aria-label={label} title={label}
      className={cn("inline-flex size-9 items-center justify-center rounded-lg transition",
        onDarkSurface ? "text-ink-300 hover:bg-ink-800 hover:text-white" : "text-fg-2 hover:bg-ivory-200", className)}>
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
