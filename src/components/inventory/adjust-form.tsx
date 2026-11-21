"use client";
import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field, Select, Textarea } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/client";
import { useAction } from "@/hooks/use-action";
import { adjustStock } from "@/server/actions/inventory";
import { VariantPicker } from "./variant-picker";
import type { VariantOption } from "@/server/queries";
import { cn } from "@/lib/utils";

type Kind = "ADD" | "REMOVE" | "WASTE";

export function AdjustForm({ variants, lotsByVariant, canCost }: { variants: VariantOption[]; lotsByVariant: Record<string, { id: string; label: string }[]>; canCost: boolean }) {
  const { t } = useI18n();
  const [variantId, setVariantId] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("WASTE");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [lotId, setLotId] = useState("");
  const [reason, setReason] = useState("");
  const a = useAction(adjustStock, { success: t("inv.adjustSaved") });
  const v = variants.find((x) => x.id === variantId);
  useEffect(() => { setLotId(""); }, [variantId]);
  const lots = variantId ? lotsByVariant[variantId] ?? [] : [];
  return (
    <Card className="max-w-3xl">
      <CardBody>
        <form className="grid gap-5" onSubmit={async (e) => {
          e.preventDefault();
          if (!variantId) return;
          const r = await a.run({ variantId, kind, quantity, unitCost: kind === "ADD" && unitCost ? unitCost : null, expiryDate: kind === "ADD" ? expiryDate || null : null, lotId: kind !== "ADD" ? lotId || null : null, reason });
          if (r) { setQuantity(""); setReason(""); setUnitCost(""); setExpiryDate(""); }
        }}>
          <Field label={t("inv.adjustType")}>
            <div className="grid gap-2 sm:grid-cols-3">
              {(["WASTE", "REMOVE", "ADD"] as Kind[]).map((k) => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  className={cn("rounded-xl border px-3 py-3 text-sm font-medium transition", kind === k ? (k === "ADD" ? "border-success bg-success-soft text-success" : "border-danger bg-danger-soft text-danger") : "border-ivory-300 hover:bg-ivory-200")}>
                  {t(`inv.adjust.${k}`)}
                </button>
              ))}
            </div>
          </Field>
          <Field label={t("cat.product")}><VariantPicker options={variants} value={variantId} onChange={(o) => setVariantId(o.id)} /></Field>
          {v && <div className="num -mt-3 text-xs text-muted">{t("inv.onHand")}: {Number(v.stock)} {v.unitCode}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`${t("common.quantity")}${v ? ` (${v.unitCode})` : ""}`}><Input dir="ltr" inputMode="decimal" required value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
            {kind === "ADD" ? (
              <>
                {canCost && <Field label={t("inv.unitCost")} hint={v?.cost ? `$${v.cost}` : t("common.optional")}><Input dir="ltr" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value.replace(/[^\d.]/g, ""))} /></Field>}
                <Field label={t("inv.expiry")} hint={t("common.optional")}><Input type="date" dir="ltr" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></Field>
              </>
            ) : (
              <Field label={t("inv.lotOptional")}>
                <Select value={lotId} onChange={(e) => setLotId(e.target.value)}>
                  <option value="">{t("inv.fefo")}</option>
                  {lots.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </Select>
              </Field>
            )}
          </div>
          <Field label={t("common.reason")}><Textarea required minLength={2} value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-16" /></Field>
          <div><Button type="submit" size="lg" loading={a.pending} disabled={!variantId || !quantity}><SlidersHorizontal className="size-4" />{t("common.save")}</Button></div>
        </form>
      </CardBody>
    </Card>
  );
}
