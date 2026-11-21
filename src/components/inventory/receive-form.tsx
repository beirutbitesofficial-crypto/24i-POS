"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field, Select, Switch, Textarea } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/client";
import { useAction } from "@/hooks/use-action";
import { receivePurchase } from "@/server/actions/inventory";
import { D, Decimal, formatUsd, money } from "@/lib/money";
import { uuid } from "@/lib/utils";
import { VariantPicker } from "./variant-picker";
import type { VariantOption } from "@/server/queries";

type Line = { key: string; variantId: string | null; quantity: string; unitCost: string; lotNumber: string; expiryDate: string };
const newLine = (): Line => ({ key: uuid(), variantId: null, quantity: "", unitCost: "", lotNumber: "", expiryDate: "" });

export function ReceiveForm({ variants, suppliers }: { variants: VariantOption[]; suppliers: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [supplierId, setSupplierId] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [updateCost, setUpdateCost] = useState(true);
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const a = useAction(receivePurchase, { refresh: false });
  const set = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => (l.quantity && l.unitCost ? s.plus(money(D(l.quantity).mul(D(l.unitCost)))) : s), new Decimal(0));
  const valid = lines.length > 0 && lines.every((l) => l.variantId && Number(l.quantity) > 0 && l.unitCost !== "");

  return (
    <form className="space-y-6" onSubmit={async (e) => {
      e.preventDefault();
      const r = await a.run({
        supplierId: supplierId || null, invoiceRef, receivedAt, notes, updateCost,
        lines: lines.map((l) => ({ variantId: l.variantId!, quantity: l.quantity, unitCost: l.unitCost, lotNumber: l.lotNumber, expiryDate: l.expiryDate || null })),
      });
      if (r) router.push(`/inventory/purchases/${r.id}`);
    }}>
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t("nav.suppliers")}>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">{t("common.none")}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label={t("inv.invoiceRef")}><Input dir="ltr" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} /></Field>
          <Field label={t("inv.receivedAt")}><Input type="date" dir="ltr" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} /></Field>
          <div className="flex items-end pb-2"><Switch checked={updateCost} onChange={setUpdateCost} label={t("cat.costPrice")} /></div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t("common.details")} action={<Button type="button" size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, newLine()])}><Plus className="size-4" />{t("inv.addLine")}</Button>} />
        <CardBody className="space-y-3">
          {lines.map((l) => {
            const v = variants.find((x) => x.id === l.variantId);
            return (
              <div key={l.key} className="grid gap-3 rounded-xl border border-ivory-200 p-3 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] lg:items-end">
                <Field label={t("cat.product")}>
                  <VariantPicker options={variants} value={l.variantId} onChange={(o) => set(l.key, { variantId: o.id, unitCost: l.unitCost || (o.cost ?? "") })} />
                </Field>
                <Field label={`${t("common.quantity")}${v ? ` (${v.unitCode})` : ""}`}>
                  <Input dir="ltr" inputMode="decimal" value={l.quantity} onChange={(e) => set(l.key, { quantity: e.target.value.replace(/[^\d.]/g, "") })} />
                </Field>
                <Field label={t("inv.unitCost")}><Input dir="ltr" inputMode="decimal" placeholder="$" value={l.unitCost} onChange={(e) => set(l.key, { unitCost: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
                <Field label={t("inv.lot")} hint={t("common.optional")}><Input dir="ltr" value={l.lotNumber} onChange={(e) => set(l.key, { lotNumber: e.target.value })} /></Field>
                <Field label={t("inv.expiry")} hint={t("common.optional")}><Input type="date" dir="ltr" value={l.expiryDate} onChange={(e) => set(l.key, { expiryDate: e.target.value })} /></Field>
                <div className="flex items-center gap-2 pb-1">
                  <span className="num min-w-20 text-end text-sm font-semibold">{l.quantity && l.unitCost ? formatUsd(D(l.quantity).mul(D(l.unitCost))) : "—"}</span>
                  <Button type="button" size="icon-sm" variant="ghost" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 className="size-4" /></Button>
                </div>
              </div>
            );
          })}
          <Field label={t("common.notes")}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-14" /></Field>
        </CardBody>
        <div className="flex items-center justify-between border-t border-ivory-200 px-5 py-4">
          <div><span className="text-sm text-muted">{t("common.total")} </span><span className="num text-2xl font-semibold">{formatUsd(total)}</span></div>
          <Button type="submit" variant="gold" size="lg" loading={a.pending} disabled={!valid}><PackagePlus className="size-5" />{t("inv.postReceipt")}</Button>
        </div>
      </Card>
    </form>
  );
}
