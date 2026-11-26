"use client";
import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Delete } from "lucide-react";
import { Dialog } from "./dialog";
import { Button } from "./button";
import { useI18n } from "@/lib/i18n/client";

/** Touch-friendly manager PIN pad */
export function PinDialog({ open, onOpenChange, onSubmit, busy }: { open: boolean; onOpenChange: (v: boolean) => void; onSubmit: (pin: string) => void; busy?: boolean }) {
  const { t } = useI18n();
  const [pin, setPin] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setPin(""); setTimeout(() => ref.current?.focus(), 50); } }, [open]);
  const press = (d: string) => setPin((p) => (p.length < 6 ? p + d : p));
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="sm" title={<span className="flex items-center gap-2"><ShieldCheck className="size-5 text-gold-600" />{t("pos.managerPin")}</span>} description={t("pos.managerPinHint")}>
      <form onSubmit={(e) => { e.preventDefault(); if (pin.length >= 4) onSubmit(pin); }}>
        <input
          ref={ref} value={pin} inputMode="numeric" autoComplete="off" type="password"
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="num mb-4 h-14 w-full rounded-xl border border-ivory-300 bg-ivory-50 text-center text-3xl tracking-[0.5em] focus:border-gold-400 focus:outline-none"
        />
        <div className="grid grid-cols-3 gap-2" dir="ltr">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <Button key={d} type="button" variant="outline" size="lg" className="text-xl" onClick={() => press(d)}>{d}</Button>
          ))}
          <Button type="button" variant="ghost" size="lg" onClick={() => setPin((p) => p.slice(0, -1))}><Delete className="size-5" /></Button>
          <Button type="button" variant="outline" size="lg" className="text-xl" onClick={() => press("0")}>0</Button>
          <Button type="submit" variant="gold" size="lg" loading={busy} disabled={pin.length < 4}>{t("pos.approve")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
