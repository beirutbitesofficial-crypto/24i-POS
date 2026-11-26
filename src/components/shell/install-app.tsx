"use client";
import { useEffect, useState } from "react";
import { MonitorDown } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/** "Install app" — shown only when the browser offers installation (Chrome / Edge on desktop & Android). */
export function InstallAppButton({ className, dark }: { className?: string; dark?: boolean }) {
  const { t } = useI18n();
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    const onInstalled = () => setEvt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  if (!evt) return null;
  return (
    <button
      type="button"
      onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); }}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition",
        dark ? "text-gold-300 hover:bg-white/5" : "text-gold-600 hover:bg-gold-50",
        className,
      )}
    >
      <MonitorDown className="size-4" />
      {t("app.install")}
    </button>
  );
}
