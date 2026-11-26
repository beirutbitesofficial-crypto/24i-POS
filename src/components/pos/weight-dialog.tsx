"use client";
import { useEffect, useRef, useState } from "react";
import { Scale } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { parseWeightToKg } from "@/lib/pricing";
import { D, formatUsd, formatWeight } from "@/lib/money";
import { NumPad } from "./numpad";
import { cn } from "@/lib/utils";

const QUICK = [
  { g: 250, label: "250 g" },
  { g: 500, label: "500 g" },
  { g: 750, label: "750 g" },
  { g: 1000, label: "1 kg" },
];

export function WeightDialog({
  open, onOpenChange, title, subtitle, pricePerKg, initialKg, onConfirm,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; subtitle?: string; pricePerKg: string | null; initialKg?: string; onConfirm: (kg: string) => void;
}) {
  const { t, locale } = useI18n();
  const [raw, setRaw] = useState("");
  const [unit, setUnit] = useState<"g" | "kg">("g");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      if (initialKg) { setUnit("g"); setRaw(D(initialKg).mul(1000).toDecimalPlaces(0).toString()); } else { setRaw(""); setUnit("g"); }
      setTimeout(() => ref.current?.select(), 60);
    }
  }, [open, initialKg]);
  const kg = raw ? parseWeightToKg(raw + unit) : null;
  const valid = kg !== null && kg.gt(0) && kg.lte(500);
  const total = valid && pricePerKg ? D(pricePerKg).mul(kg!) : null;
  const confirm = (v?: string) => {
    const k = v ?? (valid ? kg!.toString() : null);
    if (k) { onConfirm(k); onOpenChange(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="md" title={<span className="flex items-center gap-2"><Scale className="size-5 text-gold-600" />{title}</span>} description={subtitle}>
      <div className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">{t("pos.quickWeights")}</div>
      <div className="mb-5 grid grid-cols-4 gap-2" dir="ltr">
        {QUICK.map((q) => (
          <button key={q.g} type="button" onClick={() => confirm(D(q.g).div(1000).toString())}
            className="num rounded-xl border border-gold-200 bg-gold-50 py-4 text-base font-semibold text-gold-700 transition hover:bg-gold-100 active:scale-[0.98]">
            {q.label}
          </button>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); confirm(); }}>
        <div className="mb-3 flex gap-2" dir="ltr">
          <input ref={ref} value={raw} inputMode="decimal" autoComplete="off"
            onChange={(e) => setRaw(e.target.value.replace(/[^\d.]/g, ""))}
            className="num h-14 min-w-0 flex-1 rounded-xl border border-ivory-300 bg-ivory-50 px-4 text-3xl font-semibold focus:border-gold-400 focus:outline-none" placeholder="0" />
          <div className="flex overflow-hidden rounded-xl border border-ivory-300">
            {(["g", "kg"] as const).map((u) => (
              <button key={u} type="button" onClick={() => setUnit(u)} className={cn("w-14 text-base font-medium", unit === u ? "bg-ink-900 text-white" : "bg-ivory-50 text-fg-2")}>{u}</button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-muted">{t("pos.weightHint")}</p>
        <NumPad value={raw} onChange={setRaw} decimals={unit === "kg"} />
        <div className="lux-dark mt-4 flex items-center justify-between rounded-xl px-4 py-3 text-white">
          <span className="num text-lg">{valid ? formatWeight(kg!, locale) : "—"}</span>
          <span className="num text-xl font-semibold text-gold-300">{total ? formatUsd(total) : pricePerKg ? "" : t("pos.priceRequired")}</span>
        </div>
        <Button type="submit" variant="gold" size="xl" className="mt-4 w-full" disabled={!valid}>{t("common.confirm")}</Button>
      </form>
    </Dialog>
  );
}
