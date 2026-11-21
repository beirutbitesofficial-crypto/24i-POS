import Link from "next/link";
import { Wallet } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getI18n } from "@/lib/i18n/server";
import { D, formatLbp, formatUsd } from "@/lib/money";
import { shiftReport } from "@/server/services/shift-report";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ShiftControls } from "@/components/shifts/shift-controls";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cash shifts" };

export default async function ShiftsPage() {
  const user = await requirePageOrgUser("pos.sell");
  const { t, locale } = await getI18n();
  const all = can(user.role, "shifts.manage");
  const mine = await db.cashShift.findFirst({ where: { organizationId: user.organizationId, userId: user.id, closedAt: null } });
  const report = mine ? await shiftReport(mine.id) : null;
  const shifts = await db.cashShift.findMany({
    where: { organizationId: user.organizationId, ...(all ? {} : { userId: user.id }) },
    orderBy: { openedAt: "desc" }, take: 60, include: { user: { select: { name: true } }, _count: { select: { sales: true } } },
  });
  const dt = (d: Date) => d.toLocaleString(locale === "ar" ? "ar-LB" : "en-GB", { dateStyle: "short", timeStyle: "short" });
  return (
    <>
      <PageHeader eyebrow={t("nav.sales")} title={t("shift.title")} />
      {mine && report ? (
        <Card className="mb-6">
          <CardHeader title={<span>{t("shift.my")} <span className="num">#{mine.number}</span></span>} description={`${t("shift.opened")} ${dt(mine.openedAt)}`}
            action={<ShiftControls shiftId={mine.id} expectedUsd={report.expected.usd.toString()} expectedLbp={report.expected.lbp.toString()} />} />
          <CardBody className="grid gap-4 sm:grid-cols-4">
            <StatCard tone="dark" label={`${t("shift.expected")} USD`} value={formatUsd(report.expected.usd)} />
            <StatCard tone="dark" label={`${t("shift.expected")} LBP`} value={formatLbp(report.expected.lbp, locale)} />
            <StatCard label={t("shift.salesCount")} value={report.salesCount} sub={formatUsd(report.salesTotal)} />
            <StatCard label={t("shift.cardSales")} value={formatUsd(report.nonCash.filter((n) => n.currency === "USD").reduce((s, n) => s.plus(n.amount), D(0)))} />
          </CardBody>
        </Card>
      ) : (
        <Card className="mb-6"><EmptyState icon={<Wallet className="size-6" />} title={t("shift.noOpen")} action={<Button asChild variant="gold"><Link href="/pos">{t("pos.openShift")}</Link></Button>} /></Card>
      )}
      <Card>
        <Table>
          <THead><tr><TH>{t("shift.number")}</TH><TH>{t("common.user")}</TH><TH>{t("shift.opened")}</TH><TH>{t("shift.closedAt")}</TH><TH>{t("shift.salesCount")}</TH><TH className="text-end">{t("shift.variance")} USD</TH><TH className="text-end">{t("shift.variance")} LBP</TH></tr></THead>
          <tbody>
            {shifts.map((s) => {
              const vu = s.countedUsd !== null && s.expectedUsd !== null ? D(s.countedUsd).minus(D(s.expectedUsd)) : null;
              const vl = s.countedLbp !== null && s.expectedLbp !== null ? D(s.countedLbp).minus(D(s.expectedLbp)) : null;
              return (
                <TR key={s.id}>
                  <TD><Link href={`/shifts/${s.id}`} className="num font-semibold text-gold-700 hover:underline">#{s.number}</Link></TD>
                  <TD>{s.user.name}</TD>
                  <TD className="num text-xs text-muted">{dt(s.openedAt)}</TD>
                  <TD>{s.closedAt ? <span className="num text-xs text-muted">{dt(s.closedAt)}</span> : <Badge tone="gold">{t("common.open")}</Badge>}</TD>
                  <TD className="num">{s._count.sales}</TD>
                  <TD className={cn("num text-end", vu?.lt(0) && "text-danger", vu?.gt(0) && "text-success")}>{vu ? formatUsd(vu) : "—"}</TD>
                  <TD className={cn("num text-end", vl?.lt(0) && "text-danger", vl?.gt(0) && "text-success")}>{vl ? formatLbp(vl, locale) : "—"}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
