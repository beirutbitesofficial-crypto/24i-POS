import Link from "next/link";
import { ShoppingBag, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { formatUsd } from "@/lib/money";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";

export const metadata = { title: "Purchases" };
const PER = 30;

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ page?: string; supplier?: string }> }) {
  const user = await requirePageOrgUser("inventory.manage");
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = { organizationId: user.organizationId, ...(sp.supplier ? { supplierId: sp.supplier } : {}) };
  const [rows, total] = await Promise.all([
    db.purchase.findMany({ where, orderBy: { receivedAt: "desc" }, skip: (page - 1) * PER, take: PER, include: { supplier: true, user: true, _count: { select: { items: true } } } }),
    db.purchase.count({ where }),
  ]);
  return (
    <>
      <PageHeader eyebrow={t("nav.inventory")} title={t("inv.purchases")} actions={<Button asChild><Link prefetch={false} href="/inventory/receive"><Plus className="size-4" />{t("inv.receive")}</Link></Button>} />
      <Card>
        {rows.length === 0 ? <EmptyState icon={<ShoppingBag className="size-6" />} title={t("inv.purchases")} action={<Button asChild variant="gold"><Link prefetch={false} href="/inventory/receive">{t("inv.receive")}</Link></Button>} /> : (
          <>
            <Table>
              <THead><tr><TH>#</TH><TH>{t("common.date")}</TH><TH>{t("nav.suppliers")}</TH><TH>{t("inv.invoiceRef")}</TH><TH>{t("sales.items")}</TH><TH>{t("common.user")}</TH><TH className="text-end">{t("common.total")}</TH></tr></THead>
              <tbody>
                {rows.map((p) => (
                  <TR key={p.id}>
                    <TD><Link prefetch={false} className="num font-semibold text-gold-700 hover:underline" href={`/inventory/purchases/${p.id}`}>#{p.number}</Link></TD>
                    <TD className="num text-muted">{p.receivedAt.toLocaleDateString(locale === "ar" ? "ar-LB" : "en-GB")}</TD>
                    <TD>{p.supplier?.name ?? "—"}</TD>
                    <TD className="num">{p.invoiceRef ?? "—"}</TD>
                    <TD className="num">{p._count.items}</TD>
                    <TD className="text-muted">{p.user.name}</TD>
                    <TD className="num text-end font-semibold">{formatUsd(p.total)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination t={t} page={page} pages={Math.ceil(total / PER)} total={total} makeHref={(p) => `/inventory/purchases?page=${p}`} />
          </>
        )}
      </Card>
    </>
  );
}
