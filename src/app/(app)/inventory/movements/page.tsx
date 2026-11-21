import Link from "next/link";
import { History } from "lucide-react";
import type { MovementType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getI18n } from "@/lib/i18n/server";
import { ln } from "@/lib/i18n";
import { D, formatUsd } from "@/lib/money";
import { variantLabel } from "@/server/queries";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

export const metadata = { title: "Stock movements" };
const PER = 50;
const TYPES: MovementType[] = ["PURCHASE", "SALE", "REFUND", "ADJUSTMENT", "WASTE", "CONVERSION_OUT", "CONVERSION_IN", "COUNT"];

export default async function MovementsPage({ searchParams }: { searchParams: Promise<{ page?: string; type?: string; variant?: string }> }) {
  const user = await requirePageOrgUser("inventory.view");
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const canCost = can(user.role, "catalog.costs");
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.StockMovementWhereInput = { organizationId: user.organizationId };
  if (sp.type && TYPES.includes(sp.type as MovementType)) where.type = sp.type as MovementType;
  if (sp.variant) where.variantId = sp.variant;
  const [rows, total] = await Promise.all([
    db.stockMovement.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER,
      include: { user: { select: { name: true } }, lot: { select: { lotNumber: true } }, variant: { include: { product: true, brand: true, variety: true, unit: true, packageUnit: true } } },
    }),
    db.stockMovement.count({ where }),
  ]);
  const href = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ type: sp.type, variant: sp.variant, ...patch })) if (v) u.set(k, v);
    return `/inventory/movements?${u}`;
  };
  const chip = "rounded-full border px-3 py-1.5 text-sm whitespace-nowrap";
  return (
    <>
      <PageHeader eyebrow={t("nav.inventory")} title={t("inv.movements")} />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <Link href={href({ type: undefined, page: undefined })} className={cn(chip, !sp.type ? "border-ink-900 bg-ink-900 text-ivory-50" : "border-ivory-300 bg-ivory-50")}>{t("common.all")}</Link>
        {TYPES.map((ty) => <Link key={ty} href={href({ type: ty, page: undefined })} className={cn(chip, sp.type === ty ? "border-ink-900 bg-ink-900 text-ivory-50" : "border-ivory-300 bg-ivory-50")}>{t(`inv.move.${ty}`)}</Link>)}
        {sp.variant && <Link href={href({ variant: undefined })} className={cn(chip, "border-gold-400 bg-gold-50 text-gold-700")}>✕ {rows[0] ? ln(locale, rows[0].variant.product) : ""}</Link>}
      </div>
      <Card>
        {rows.length === 0 ? <EmptyState icon={<History className="size-6" />} title={t("common.none")} /> : (
          <>
            <Table>
              <THead><tr><TH>{t("common.date")}</TH><TH>{t("cat.product")}</TH><TH>{t("common.type")}</TH><TH className="text-end">{t("common.quantity")}</TH><TH className="text-end">{t("inv.balance")}</TH>{canCost && <TH className="text-end">{t("inv.unitCost")}</TH>}<TH>{t("inv.lot")}</TH><TH>{t("common.reason")}</TH><TH>{t("common.user")}</TH></tr></THead>
              <tbody>
                {rows.map((m) => {
                  const q = D(m.quantity);
                  return (
                    <TR key={m.id}>
                      <TD className="num text-xs whitespace-nowrap text-muted">{m.createdAt.toLocaleString(locale === "ar" ? "ar-LB" : "en-GB")}</TD>
                      <TD><Link href={href({ variant: m.variantId, page: undefined })} className="hover:text-gold-700"><div className="font-medium">{ln(locale, m.variant.product)}</div><div className="text-xs text-muted">{variantLabel(locale, m.variant)}</div></Link></TD>
                      <TD><Badge tone={q.gt(0) ? "success" : m.type === "WASTE" ? "danger" : "neutral"}>{t(`inv.move.${m.type}`)}</Badge></TD>
                      <TD className={cn("num text-end font-semibold", q.gt(0) ? "text-success" : "text-ink-900")}>{q.gt(0) ? "+" : ""}{q.toString()} <span className="text-xs font-normal text-muted">{m.variant.unit.code}</span></TD>
                      <TD className="num text-end">{D(m.balanceAfter).toString()}</TD>
                      {canCost && <TD className="num text-end text-muted">{m.unitCost ? formatUsd(m.unitCost) : "—"}</TD>}
                      <TD className="num text-xs">{m.lot?.lotNumber ?? "—"}</TD>
                      <TD className="max-w-48 truncate text-xs text-muted">{m.reason ?? (m.refType ? m.refType : "")}</TD>
                      <TD className="text-xs text-muted">{m.user?.name ?? "—"}</TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
            <Pagination t={t} page={page} pages={Math.ceil(total / PER)} total={total} makeHref={(p) => href({ page: String(p) })} />
          </>
        )}
      </Card>
    </>
  );
}
