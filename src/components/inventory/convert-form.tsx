"use client";
import { useState } from "react";
import { ArrowDown, Repeat } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Field, Textarea } from "@/components/ui/input";
import { Card, CardBody } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/client";
import { useAction } from "@/hooks/use-action";
import { convertStock } from "@/server/actions/inventory";
import { formatUsd } from "@/lib/money";
import { VariantPicker } from "./variant-picker";
import type { VariantOption } from "@/server/queries";

export function ConvertForm({ variants }: { variants: VariantOption[] }) {
  const { t } = useI18n();
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [fromQty, setFromQty] = useState("");
  const [toQty, setToQty] = useState("");
  const [notes, setNotes] = useState("");
  const a = useAction(convertStock, { success: t("inv.convertSaved") });
  const from = variants.find((v) => v.id === fromId);
  const to = variants.find((v) => v.id === toId);
  return (
    <Card className="max-w-3xl">
      <CardBody>
        <form className="grid gap-5" onSubmit={async (e) => {
          e.preventDefault();
          if (!fromId || !toId) return;
          const r = await a.run({ fromVariantId: fromId, fromQty, toVariantId: toId, toQty, notes });
          if (r) { toast.message(t("inv.convertCost", { cost: formatUsd(r.unitCost) })); setFromQty(""); setToQty(""); setNotes(""); }
        }}>
          <div className="grid gap-4 rounded-xl bg-ivory-100 p-4 sm:grid-cols-[2fr_1fr]">
            <Field label={t("inv.fromVariant")}><VariantPicker options={variants} value={fromId} onChange={(o) => setFromId(o.id)} filter={(o) => o.id !== toId} /></Field>
            <Field label={`${t("inv.consume")}${from ? ` (${from.unitCode})` : ""}`}><Input dir="ltr" inputMode="decimal" required value={fromQty} onChange={(e) => setFromQty(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
            {from && <div className="num -mt-2 text-xs text-muted sm:col-span-2">{t("inv.onHand")}: {Number(from.stock)} {from.unitCode}</div>}
          </div>
          <div className="flex justify-center"><div className="grid size-10 place-items-center rounded-full bg-gold-100 text-gold-700"><ArrowDown className="size-5" /></div></div>
          <div className="grid gap-4 rounded-xl bg-gold-50/60 p-4 ring-1 ring-gold-100 sm:grid-cols-[2fr_1fr]">
            <Field label={t("inv.toVariant")}><VariantPicker options={variants} value={toId} onChange={(o) => setToId(o.id)} filter={(o) => o.id !== fromId} /></Field>
            <Field label={`${t("inv.produce")}${to ? ` (${to.unitCode})` : ""}`}><Input dir="ltr" inputMode="decimal" required value={toQty} onChange={(e) => setToQty(e.target.value.replace(/[^\d.]/g, ""))} /></Field>
          </div>
          <Field label={t("common.notes")}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-14" /></Field>
          <div><Button type="submit" size="lg" variant="gold" loading={a.pending} disabled={!fromId || !toId || !fromQty || !toQty}><Repeat className="size-4" />{t("inv.convert")}</Button></div>
        </form>
      </CardBody>
    </Card>
  );
}
