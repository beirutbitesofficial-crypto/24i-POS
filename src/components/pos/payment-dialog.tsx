"use client";
import { useEffect, useMemo, useState } from "react";
import { Banknote, CreditCard, Smartphone, X, CheckCircle2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { D, formatLbp, formatUsd, usdToLbp } from "@/lib/money";
import { settle, type ChangeCurrency } from "@/lib/pricing";
import { NumPad } from "./numpad";
import type { PosSettings } from "./types";
import { cn } from "@/lib/utils";

export type Tender = { method: "CASH" | "CARD" | "TRANSFER"; currency: "USD" | "LBP"; amount: string };

const USD_NOTES = ["1", "5", "10", "20", "50", "100"];
const LBP_NOTES = ["50000", "100000", "500000", "1000000"];

export function PaymentDialog({
  open, onOpenChange, total, settings, onComplete, busy,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; total: string; settings: PosSettings;
  onComplete: (tenders: Tender[], changeCurrency: ChangeCurrency) => void; busy: boolean;
}) {
  const { t, locale } = useI18n();
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [method, setMethod] = useState<Tender["method"]>("CASH");
  const [currency, setCurrency] = useState<Tender["currency"]>("USD");
  const [entry, setEntry] = useState("");
  const [changeCurrency, setChangeCurrency] = useState<ChangeCurrency>("USD");

  useEffect(() => {
    if (open) { setTenders([]); setEntry(""); setMethod("CASH"); setCurrency("USD"); setChangeCurrency("USD"); }
  }, [open]);

  const cfg = { rate: settings.rate, lbpIncrement: settings.lbpRounding, lbpMode: settings.lbpMode };
  const st = useMemo(() => settle(total, tenders.map((x) => ({ currency: x.currency, amount: x.amount || "0" })), cfg, changeCurrency),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [total, tenders, changeCurrency, settings.rate, settings.lbpRounding, settings.lbpMode]);
  const totalLbp = usdToLbp(total, settings.rate, settings.lbpRounding, settings.lbpMode);

  const add = (amount: string, cur = currency, m = method) => {
    if (!amount || D(amount).lte(0)) return;
    setTenders((ts) => {
      // Merge same method+currency
      const i = ts.findIndex((x) => x.method === m && x.currency === cur);
      if (i >= 0) { const c = [...ts]; c[i] = { ...c[i], amount: D(c[i].amount).plus(amount).toString() }; return c; }
      return [...ts, { method: m, currency: cur, amount }];
    });
    setEntry("");
  };
  const exact = (cur: "USD" | "LBP") => {
    const amt = cur === "USD" ? st.remainingUsd.toString() : st.remainingLbp.toString();
    add(amt, cur);
  };
  const methods = [
    { k: "CASH" as const, icon: Banknote, label: t("pos.cash") },
    { k: "CARD" as const, icon: CreditCard, label: t("pos.card") },
    { k: "TRANSFER" as const, icon: Smartphone, label: t("pos.transfer") },
  ];
  const hasCashOver = st.changeBase.gt(0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="xl" title={t("pos.payment")}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <div className="mb-4 grid grid-cols-3 gap-2">
            {methods.map((m) => (
              <button key={m.k} type="button" onClick={() => { setMethod(m.k); if (m.k !== "CASH") setCurrency("USD"); }}
                className={cn("flex flex-col items-center gap-1 rounded-xl border py-3 text-sm font-medium transition",
                  method === m.k ? "border-ink-900 bg-ink-900 text-white" : "border-ivory-300 bg-ivory-50 text-fg hover:bg-ivory-200")}>
                <m.icon className="size-5" />{m.label}
              </button>
            ))}
          </div>
          <div className="mb-3 flex items-center gap-2">
            <div className="flex overflow-hidden rounded-xl border border-ivory-300" dir="ltr">
              {(["USD", "LBP"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setCurrency(c)}
                  className={cn("h-12 w-20 text-sm font-semibold", currency === c ? "bg-gold-500 text-white" : "bg-ivory-50 text-fg-2")}>{c === "USD" ? "$ USD" : "LBP"}</button>
              ))}
            </div>
            <input value={entry} onChange={(e) => setEntry(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" dir="ltr"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (entry) add(entry); else if (st.covered) onComplete(tenders, changeCurrency); } }}
              className="num h-12 min-w-0 flex-1 rounded-xl border border-ivory-300 bg-ivory-50 px-4 text-2xl font-semibold focus:border-gold-400 focus:outline-none" placeholder="0" autoFocus />
            <Button type="button" size="lg" onClick={() => add(entry)} disabled={!entry}>{t("pos.addPayment")}</Button>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" size="lg" disabled={st.covered} onClick={() => exact("USD")}>{t("pos.exact")} <span className="num">{formatUsd(st.remainingUsd)}</span></Button>
            <Button type="button" variant="outline" size="lg" disabled={st.covered || method !== "CASH"} onClick={() => exact("LBP")}>{t("pos.exact")} <span className="num">{formatLbp(st.remainingLbp, locale)}</span></Button>
          </div>
          {method === "CASH" && (
            <div className="mb-4 grid grid-cols-4 gap-2 sm:grid-cols-5" dir="ltr">
              {(currency === "USD" ? USD_NOTES : LBP_NOTES).map((n) => (
                <button key={n} type="button" onClick={() => add(n)}
                  className="num rounded-xl border border-gold-200 bg-gold-50 py-3 text-sm font-semibold text-gold-700 hover:bg-gold-100 active:scale-[0.98]">
                  {currency === "USD" ? `$${n}` : Number(n) >= 1_000_000 ? `${Number(n) / 1_000_000}M` : `${Number(n) / 1000}K`}
                </button>
              ))}
            </div>
          )}
          <NumPad value={entry} onChange={setEntry} decimals={currency === "USD"} className="hidden sm:grid" />
        </div>

        <div className="lux-dark lux-edge flex flex-col rounded-2xl p-5 text-white">
          <div className="text-xs tracking-wide text-ink-300 uppercase">{t("pos.total")}</div>
          <div className="num text-4xl font-semibold text-gold-300">{formatUsd(total)}</div>
          <div className="num text-sm text-ink-300">{formatLbp(totalLbp, locale)}</div>

          <div className="mt-5 flex-1 space-y-2">
            <div className="text-xs tracking-wide text-ink-300 uppercase">{t("pos.payments")}</div>
            {tenders.length === 0 && <div className="text-sm text-ink-400">—</div>}
            {tenders.map((x, i) => (
              <div key={i} className="flex animate-slide-in-end items-center justify-between rounded-lg bg-ink-800 px-3 py-2 text-sm">
                <span>{methods.find((m) => m.k === x.method)?.label}</span>
                <span className="flex items-center gap-2">
                  <span className="num font-medium">{x.currency === "USD" ? formatUsd(x.amount) : formatLbp(x.amount, locale)}</span>
                  <button type="button" onClick={() => setTenders((ts) => ts.filter((_, j) => j !== i))} className="text-ink-400 hover:text-danger"><X className="size-4" /></button>
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2 border-t border-ink-700 pt-4">
            {!st.covered ? (
              <>
                <div className="flex justify-between text-sm"><span className="text-ink-300">{t("pos.remaining")}</span><span className="num font-semibold text-danger-soft">{formatUsd(st.remainingUsd)}</span></div>
                <div className="flex justify-between text-sm"><span /><span className="num text-ink-300">{formatLbp(st.remainingLbp, locale)}</span></div>
              </>
            ) : (
              <>
                {hasCashOver && (
                  <div className="mb-2">
                    <div className="mb-1.5 text-xs text-ink-300">{t("pos.changeIn")}</div>
                    <div className="grid grid-cols-3 gap-1 rounded-lg bg-ink-800 p-1">
                      {(["USD", "LBP", "MIXED"] as const).map((c) => (
                        <button key={c} type="button" onClick={() => setChangeCurrency(c)}
                          className={cn("rounded-md py-1.5 text-xs font-medium", changeCurrency === c ? "bg-gold-500 text-white" : "text-ink-300")}>
                          {c === "USD" ? "$" : c === "LBP" ? "LBP" : t("pos.mixed")}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="text-ink-300">{t("pos.change")}</span>
                  <span className="num text-right text-2xl font-semibold text-gold-300">
                    {st.changeUsd.gt(0) && <div>{formatUsd(st.changeUsd)}</div>}
                    {st.changeLbp.gt(0) && <div>{formatLbp(st.changeLbp, locale)}</div>}
                    {st.changeUsd.isZero() && st.changeLbp.isZero() && formatUsd(0)}
                  </span>
                </div>
              </>
            )}
          </div>
          <Button type="button" variant="gold" size="xl" className="mt-5 w-full" disabled={!st.covered || (tenders.length === 0 && D(total).gt(0))} loading={busy}
            onClick={() => onComplete(tenders, changeCurrency)}>
            <CheckCircle2 className="size-5" />{busy ? t("pos.completing") : t("pos.complete")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
