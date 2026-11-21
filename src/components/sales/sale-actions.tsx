"use client";
import { useMemo, useState } from "react";
import { Printer, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Field, Select, Switch, Textarea } from "@/components/ui/input";
import { PinDialog } from "@/components/ui/pin-dialog";
import { useI18n } from "@/lib/i18n/client";
import { useRouter } from "next/navigation";
import { completeRefund, registerPrint } from "@/server/actions/pos";
import { printReceipt } from "@/components/pos/print";
import { D, Decimal, formatUsd, money } from "@/lib/money";
import { uuid } from "@/lib/utils";

type Item = { id: string; name: string; sub: string; quantity: string; refundedQty: string; lineTotal: string; unitCode: string; allowsDecimal: boolean };

export function SaleActions({ saleId, number, items, printMode, bridgeUrl, canRefund }: {
  saleId: string; number: number; items: Item[]; printMode: "BROWSER" | "BRIDGE"; bridgeUrl: string | null; canRefund: boolean;
}) {
  const { t, te } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<"CASH" | "CARD" | "TRANSFER">("CASH");
  const [currency, setCurrency] = useState<"USD" | "LBP">("USD");
  const [pin, setPin] = useState<null | "refund" | "print">(null);
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState(uuid());

  const remaining = (i: Item) => D(i.quantity).minus(D(i.refundedQty));
  const total = useMemo(() => items.reduce((s, i) => {
    const q = qty[i.id];
    if (!q || D(q).lte(0)) return s;
    return s.plus(money(D(i.lineTotal).mul(D(q)).div(D(i.quantity))));
  }, new Decimal(0)), [qty, items]);

  const doPrint = async (p?: string) => {
    const r = await registerPrint({ saleId, pin: p ?? null });
    if (!r.ok) {
      const code = r.error.split("|")[0];
      if (code === "APPROVAL_REQUIRED" || code === "INVALID_PIN") { if (code === "INVALID_PIN") toast.error(te(r.error)); setPin("print"); return; }
      return toast.error(te(r.error));
    }
    setPin(null);
    await printReceipt(saleId, printMode, bridgeUrl);
    router.refresh();
  };

  const doRefund = async (p?: string) => {
    setBusy(true);
    const r = await completeRefund({
      clientRef: ref, saleId, reason, method, currency, approverPin: p ?? null,
      items: items.filter((i) => qty[i.id] && D(qty[i.id]).gt(0)).map((i) => ({ saleItemId: i.id, quantity: qty[i.id], restock: restock[i.id] ?? true })),
    });
    setBusy(false);
    if (!r.ok) {
      const code = r.error.split("|")[0];
      if (code === "APPROVAL_REQUIRED" || code === "INVALID_PIN") { if (code === "INVALID_PIN") toast.error(te(r.error)); setPin("refund"); return; }
      return toast.error(te(r.error));
    }
    setPin(null);
    setOpen(false);
    setQty({});
    setReason("");
    setRef(uuid());
    toast.success(t("sales.refundDone", { number: r.data.number }));
    router.refresh();
  };

  const anyLeft = items.some((i) => remaining(i).gt(0));
  return (
    <div className="no-print flex gap-2">
      <Button variant="outline" onClick={() => doPrint()}><Printer className="size-4" />{t("sales.reprint")}</Button>
      {anyLeft && <Button variant="danger-soft" onClick={() => setOpen(true)}><Undo2 className="size-4" />{t("sales.refund")}</Button>}
      <Dialog open={open} onOpenChange={setOpen} size="lg" title={t("sales.refundTitle", { number })}
        footer={<>
          <span className="me-auto text-sm">{t("sales.refundTotal")}: <span className="num text-lg font-semibold">{formatUsd(total)}</span></span>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button variant="danger" loading={busy} disabled={total.lte(0) || reason.trim().length < 2} onClick={() => doRefund()}>{t("sales.refund")}</Button>
        </>}>
        <div className="space-y-2">
          {items.map((i) => {
            const left = remaining(i);
            return (
              <div key={i.id} className="grid items-center gap-3 rounded-xl border border-ivory-200 p-3 sm:grid-cols-[1fr_120px_auto]">
                <div>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-muted">{i.sub} · <span className="num">{left.toString()} / {D(i.quantity).toString()} {i.unitCode}</span></div>
                </div>
                <Input dir="ltr" inputMode="decimal" placeholder="0" disabled={left.lte(0)} value={qty[i.id] ?? ""}
                  onChange={(e) => { let v = e.target.value.replace(/[^\d.]/g, ""); if (!i.allowsDecimal) v = v.replace(/\..*/, ""); if (v && D(v).gt(left)) v = left.toString(); setQty((s) => ({ ...s, [i.id]: v })); }} />
                <Switch checked={restock[i.id] ?? true} onChange={(v) => setRestock((s) => ({ ...s, [i.id]: v }))} label={t("sales.restock")} />
              </div>
            );
          })}
          <div className="grid gap-3 pt-2 sm:grid-cols-2">
            <Field label={t("sales.refundMethod")}>
              <Select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                <option value="CASH">{t("pos.cash")}</option><option value="CARD">{t("pos.card")}</option><option value="TRANSFER">{t("pos.transfer")}</option>
              </Select>
            </Field>
            <Field label="USD / LBP">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value as typeof currency)}>
                <option value="USD">USD</option><option value="LBP">LBP</option>
              </Select>
            </Field>
            <Field label={t("common.reason")} className="sm:col-span-2"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-14" /></Field>
          </div>
        </div>
      </Dialog>
      <PinDialog open={!!pin} onOpenChange={(o) => !o && setPin(null)} busy={busy} onSubmit={(p) => (pin === "refund" ? doRefund(p) : doPrint(p))} />
      {!canRefund && null}
    </div>
  );
}
