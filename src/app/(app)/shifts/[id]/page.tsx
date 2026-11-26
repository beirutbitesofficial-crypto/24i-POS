import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getI18n } from "@/lib/i18n/server";
import { D, formatLbp, formatUsd } from "@/lib/money";
import { shiftReport } from "@/server/services/shift-report";
import { getSettings } from "@/server/context";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/card";
import { PrintButton } from "@/components/ui/print-button";
import { cn } from "@/lib/utils";

export default async function ShiftPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageOrgUser("pos.sell");
  const { t, locale } = await getI18n();
  const { id } = await params;
  const shift = await db.cashShift.findFirst({
    where: { id, organizationId: user.organizationId, ...(can(user.role, "shifts.manage") ? {} : { userId: user.id }) },
    include: { user: { select: { name: true } } },
  });
  if (!shift) notFound();
  const s = await getSettings(user.organizationId);
  const r = await shiftReport(shift.id);
  const b = r.expected.breakdown;
  const dt = (d: Date) => d.toLocaleString(locale === "ar" ? "ar-LB" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  const L = (v: { toString(): string }) => formatLbp(v, locale);
  const rows: [string, string, string][] = [
    [t("shift.opening"), formatUsd(b.openingUsd), L(b.openingLbp)],
    [t("shift.cashSales"), formatUsd(b.salesUsd), L(b.salesLbp)],
    [t("shift.changeGiven"), `−${formatUsd(b.changeUsd)}`, `−${L(b.changeLbp)}`],
    [t("shift.cashIn"), formatUsd(b.inUsd), L(b.inLbp)],
    [t("shift.cashOut"), `−${formatUsd(b.outUsd)}`, `−${L(b.outLbp)}`],
    [t("shift.refundsPaid"), `−${formatUsd(b.refundsUsd)}`, `−${L(b.refundsLbp)}`],
  ];
  const expUsd = shift.expectedUsd ?? r.expected.usd;
  const expLbp = shift.expectedLbp ?? r.expected.lbp;
  const vu = shift.countedUsd !== null ? D(shift.countedUsd).minus(D(expUsd)) : null;
  const vl = shift.countedLbp !== null ? D(shift.countedLbp).minus(D(expLbp)) : null;
  return (
    <>
      <Link prefetch={false} href="/shifts" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4 rtl:rotate-180" />{t("shift.title")}</Link>
      <PageHeader eyebrow={s.storeName} title={<>{t("shift.zReport")} <span className="num">#{shift.number}</span></>}
        description={`${shift.user.name} · ${dt(shift.openedAt)} → ${shift.closedAt ? dt(shift.closedAt) : t("common.open")}`} actions={<PrintButton />} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("shift.expected")} />
          <CardBody>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted"><th className="pb-2 text-start" /><th className="pb-2 text-end">USD</th><th className="pb-2 text-end">LBP</th></tr></thead>
              <tbody>
                {rows.map(([k, u, l]) => <tr key={k} className="border-t border-ivory-200"><td className="py-2">{k}</td><td className="num py-2 text-end">{u}</td><td className="num py-2 text-end">{l}</td></tr>)}
                <tr className="border-t-2 border-ink-900 font-semibold"><td className="py-2">{t("shift.expected")}</td><td className="num py-2 text-end">{formatUsd(expUsd)}</td><td className="num py-2 text-end">{L(expLbp)}</td></tr>
                {shift.closedAt && <>
                  <tr><td className="py-2">{t("shift.counted")}</td><td className="num py-2 text-end">{formatUsd(shift.countedUsd ?? 0)}</td><td className="num py-2 text-end">{L(shift.countedLbp ?? 0)}</td></tr>
                  <tr className="font-semibold"><td className="py-2">{t("shift.variance")}</td>
                    <td className={cn("num py-2 text-end", vu?.lt(0) ? "text-danger" : "text-success")}>{vu ? formatUsd(vu) : "—"}</td>
                    <td className={cn("num py-2 text-end", vl?.lt(0) ? "text-danger" : "text-success")}>{vl ? L(vl) : "—"}</td></tr>
                </>}
              </tbody>
            </table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("rep.summary")} />
          <CardBody className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted">{t("shift.salesCount")}</span><span className="num font-semibold">{r.salesCount}</span></div>
            <div className="flex justify-between"><span className="text-muted">{t("rep.netSales")}</span><span className="num font-semibold">{formatUsd(r.salesTotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted">{t("rep.discounts")}</span><span className="num">{formatUsd(r.discounts)}</span></div>
            {r.nonCash.map((n) => <div key={n.method + n.currency} className="flex justify-between"><span className="text-muted">{n.method === "CARD" ? t("pos.card") : t("pos.transfer")} {n.currency}</span><span className="num">{n.currency === "USD" ? formatUsd(n.amount) : L(n.amount)}</span></div>)}
            <div className="flex justify-between"><span className="text-muted">{t("rep.refunds")} ({r.refundsCount})</span><span className="num">{formatUsd(r.refundsTotal)}</span></div>
            {r.moves.length > 0 && <div className="border-t border-ivory-200 pt-2">
              {r.moves.map((m) => <div key={m.id} className="flex justify-between text-xs"><span>{m.direction === "IN" ? t("shift.cashIn") : t("shift.cashOut")} · {m.reason}</span><span className="num">{m.currency === "USD" ? formatUsd(m.amount) : L(m.amount)}</span></div>)}
            </div>}
            {shift.closingNote && <p className="border-t border-ivory-200 pt-2 text-xs text-muted">{shift.closingNote}</p>}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
