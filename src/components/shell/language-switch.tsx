"use client";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { setLanguageAction } from "@/server/actions/auth";
import { cn } from "@/lib/utils";

export function LanguageSwitch({ className, dark }: { className?: string; dark?: boolean }) {
  const { locale } = useI18n();
  const router = useRouter();
  const next = locale === "ar" ? "en" : "ar";
  return (
    <button
      type="button"
      onClick={async () => { await setLanguageAction(next); router.refresh(); }}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition",
        dark ? "text-ink-300 hover:bg-ink-800 hover:text-white" : "text-fg-2 hover:bg-ivory-200",
        className,
      )}
    >
      <Languages className="size-4" />
      {next === "en" ? "English" : "العربية"}
    </button>
  );
}
