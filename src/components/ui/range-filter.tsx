"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Input } from "./input";
import { Button } from "./button";

export function RangeFilter({ from, to }: { from: string; to: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = sp.get("range") ?? "today";
  const [f, setF] = useState(from);
  const [tt, setT] = useState(to);
  const go = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) if (v === null) u.delete(k); else u.set(k, v);
    u.delete("page");
    router.push(`${pathname}?${u}`);
  };
  const keys = [["today", "common.today"], ["week", "common.week"], ["month", "common.month"]] as const;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex rounded-xl border border-ivory-300 bg-ivory-50 p-1">
        {keys.map(([k, label]) => (
          <button key={k} onClick={() => go({ range: k, from: null, to: null })}
            className={cn("rounded-lg px-3 py-1.5 text-sm transition", current === k ? "bg-ink-900 text-ivory-50" : "text-ink-700 hover:bg-ivory-200")}>{t(label)}</button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Input type="date" dir="ltr" className="h-9 w-36" value={f} onChange={(e) => setF(e.target.value)} />
        <span className="text-muted">→</span>
        <Input type="date" dir="ltr" className="h-9 w-36" value={tt} onChange={(e) => setT(e.target.value)} />
        <Button size="sm" variant={current === "custom" ? "primary" : "outline"} onClick={() => go({ range: "custom", from: f, to: tt })}>{t("common.apply")}</Button>
      </div>
    </div>
  );
}
