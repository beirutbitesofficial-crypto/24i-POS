"use client";
import { useEffect, useState } from "react";
import { Minus, Plus, Trash2, Scale } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { D, formatUsd, formatWeight } from "@/lib/money";
import { parseWeightToKg } from "@/lib/pricing";
import type { CartLine, PosProduct, PosVariant } from "./types";
import { cn } from "@/lib/utils";

const QUICK = [250, 500, 750, 1000];

export function LineDialog({
  line, product, variant, onClose, onSave, onRemove,
}: {
  line: CartLine | null; product?: PosProduct; variant?: PosVariant; onClose: () => void;
  onSave: (l: CartLine) => void; onRemove: (l: CartLine) => void;
}) {
  const { t, locale } = useI18n();
  const [l, setL] = useState<CartLine | null>(line);
  const [weightRaw, setWeightRaw] = useState("");
  useEffect(() => {
    setL(line);
    setWeightRaw(line ? D(line.quantity).mul(1000).toDecimalPlaces(0).toString() : "");
  }, [line]);
  if (!l || !variant || !product) return <Dialog open={false} onOpenChange={onClose} title="" />;

  const isWeight = variant.sellMode === "WEIGHT";
  const setQty = (q: string) => setL({ ...l, quantity: q });
  const step = (d: number) => {
    const n = D(l.quantity).plus(d);
    if (n.gte(1)) setQty(n.toString());
  };
  const onWeight = (raw: string) => {
    setWeightRaw(raw);
    const kg = raw ? parseWeightToKg(raw + "g") : null;
    if (kg && kg.gt(0)) setQty(kg.toString());
  };
  const unitPrice = l.priceOverride ?? variant.price ?? "0";
  const gross = D(l.quantity).mul(D(unitPrice));

  return (
    <Dialog open={!!line} onOpenChange={(o) => !o && onClose()} title={product.name} description={variant.label || undefined} size="md"
      footer={<>
        <Button variant="danger-soft" className="me-auto" onClick={() => onRemove(l)}><Trash2 className="size-4" />{t("pos.voidLine")}</Button>
        <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant="gold" onClick={() => onSave(l)} disabled={D(l.quantity).lte(0)}>{t("common.save")}</Button>
      </>}>
      <div className="space-y-5">
        {isWeight ? (
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-fg-2"><Scale className="size-4 text-gold-600" />{t("pos.weight")} (g)</div>
            <div className="mb-2 grid grid-cols-4 gap-2" dir="ltr">
              {QUICK.map((g) => (
                <button key={g} type="button" onClick={() => onWeight(String(g))}
                  className={cn("num rounded-lg border py-2.5 text-sm font-semibold", D(l.quantity).eq(D(g).div(1000)) ? "border-gold-500 bg-gold-100 text-gold-700" : "border-ivory-300 bg-ivory-50")}>
                  {g === 1000 ? "1 kg" : `${g} g`}
                </button>
              ))}
            </div>
            <Input dir="ltr" inputMode="numeric" className="num h-12 text-xl" value={weightRaw} onChange={(e) => onWeight(e.target.value.replace(/[^\d]/g, ""))} />
            <div className="mt-1 text-xs text-muted">{formatWeight(l.quantity, locale)}</div>
          </div>
        ) : (
          <div>
            <div className="mb-2 text-sm font-semibold text-fg-2">{t("pos.qty")}</div>
            <div className="flex items-center gap-3" dir="ltr">
              <Button type="button" variant="outline" size="lg" className="w-16" onClick={() => step(-1)}><Minus className="size-5" /></Button>
              <Input inputMode="numeric" className="num h-12 text-center text-2xl font-semibold" value={l.quantity}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); setQty(v || "0"); }} />
              <Button type="button" variant="outline" size="lg" className="w-16" onClick={() => step(1)}><Plus className="size-5" /></Button>
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 text-sm font-semibold text-fg-2">{t("pos.lineDiscount")}</div>
          <div className="flex gap-2">
            <div className="flex overflow-hidden rounded-lg border border-ivory-300">
              {(["PERCENT", "AMOUNT"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setL({ ...l, discountType: k })}
                  className={cn("px-3 text-sm", (l.discountType ?? "PERCENT") === k ? "bg-ink-900 text-white" : "bg-ivory-50")}>{k === "PERCENT" ? "%" : "$"}</button>
              ))}
            </div>
            <Input dir="ltr" inputMode="decimal" placeholder="0" value={l.discountValue ?? ""}
              onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setL({ ...l, discountType: l.discountType ?? "PERCENT", discountValue: v || null }); }} />
          </div>
        </div>

        <Field label={t("pos.priceOverride")} hint={variant.price ? formatUsd(variant.price) : t("pos.priceRequired")}>
          <Input dir="ltr" inputMode="decimal" placeholder={variant.price ?? ""} value={l.priceOverride ?? ""}
            onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setL({ ...l, priceOverride: v || null }); }} />
        </Field>

        <div className="flex items-center justify-between rounded-xl bg-ivory-200 px-4 py-3">
          <span className="text-sm text-muted">{t("common.total")}</span>
          <span className="num text-xl font-semibold">{formatUsd(gross)}</span>
        </div>
      </div>
    </Dialog>
  );
}
