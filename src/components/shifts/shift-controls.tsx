"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Field, Select, Textarea } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { useAction } from "@/hooks/use-action";
import { addCashMovement, closeShift } from "@/server/actions/shifts";
import { D, formatLbp, formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";

export function ShiftControls({ shiftId, expectedUsd, expectedLbp }: { shiftId: string; expectedUsd: string; expectedLbp: string }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [move, setMove] = useState<null | "IN" | "OUT">(null);
  const [m, setM] = useState({ currency: "USD" as "USD" | "LBP", amount: "", reason: "" });
  const [closing, setClosing] = useState(false);
  const [c, setC] = useState({ countedUsd: "", countedLbp: "", note: "" });
  const mv = useAction(addCashMovement, { success: t("common.saved") });
  const cl = useAction(closeShift, { refresh: false });
  const vu = c.countedUsd !== "" ? D(c.countedUsd).minus(D(expectedUsd)) : null;
  const vl = c.countedLbp !== "" ? D(c.countedLbp).minus(D(expectedLbp)) : null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setMove("IN")}><ArrowDownToLine className="size-4" />{t("shift.cashIn")}</Button>
      <Button variant="outline" onClick={() => setMove("OUT")}><ArrowUpFromLine className="size-4" />{t("shift.cashOut")}</Button>
      <Button variant="primary" onClick={() => setClosing(true)}><Lock className="size-4" />{t("shift.close")}</Button>

      <Dialog open={!!move} onOpenChange={(o) => !o && setMove(null)} size="sm" title={move === "IN" ? t("shift.cashIn") : t("shift.cashOut")}
        footer={<><Button variant="ghost" onClick={() => setMove(null)}>{t("common.cancel")}</Button><Button form="mv" type="submit" loading={mv.pending}>{t("common.save")}</Button></>}>
        <form id="mv" className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); if (await mv.run({ shiftId, direction: move!, ...m })) { setMove(null); setM({ currency: "USD", amount: "", reason: "" }); } }}>
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <Select value={m.currency} onChange={(e) => setM({ ...m, currency: e.target.value as "USD" | "LBP" })}><option>USD</option><option>LBP</option></Select>
            <Input dir="ltr" inputMode="decimal" required value={m.amount} onChange={(e) => setM({ ...m, amount: e.target.value.replace(/[^\d.]/g, "") })} />
          </div>
          <Field label={t("common.reason")}><Input required minLength={2} value={m.reason} onChange={(e) => setM({ ...m, reason: e.target.value })} /></Field>
        </form>
      </Dialog>

      <Dialog open={closing} onOpenChange={setClosing} title={t("shift.closeTitle")}
        footer={<><Button variant="ghost" onClick={() => setClosing(false)}>{t("common.cancel")}</Button><Button form="cl" type="submit" variant="gold" loading={cl.pending}>{t("shift.close")}</Button></>}>
        <form id="cl" className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); const r = await cl.run({ shiftId, countedUsd: c.countedUsd || "0", countedLbp: c.countedLbp || "0", note: c.note }); if (r) router.push(`/shifts/${shiftId}`); }}>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-ivory-200 p-3"><div className="text-xs text-muted">{t("shift.expected")} USD</div><div className="num text-xl font-semibold">{formatUsd(expectedUsd)}</div></div>
            <div className="rounded-xl bg-ivory-200 p-3"><div className="text-xs text-muted">{t("shift.expected")} LBP</div><div className="num text-xl font-semibold">{formatLbp(expectedLbp, locale)}</div></div>
            <Field label={`${t("shift.counted")} USD`}><Input dir="ltr" inputMode="decimal" className="h-12 text-lg" value={c.countedUsd} onChange={(e) => setC({ ...c, countedUsd: e.target.value.replace(/[^\d.]/g, "") })} /></Field>
            <Field label={`${t("shift.counted")} LBP`}><Input dir="ltr" inputMode="numeric" className="h-12 text-lg" value={c.countedLbp} onChange={(e) => setC({ ...c, countedLbp: e.target.value.replace(/\D/g, "") })} /></Field>
            <div className={cn("num text-sm font-semibold", vu?.lt(0) ? "text-danger" : "text-success")}>{vu ? `${t("shift.variance")}: ${formatUsd(vu)}` : ""}</div>
            <div className={cn("num text-sm font-semibold", vl?.lt(0) ? "text-danger" : "text-success")}>{vl ? `${t("shift.variance")}: ${formatLbp(vl, locale)}` : ""}</div>
          </div>
          <Field label={t("common.notes")}><Textarea value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} className="min-h-14" /></Field>
        </form>
      </Dialog>
    </div>
  );
}
