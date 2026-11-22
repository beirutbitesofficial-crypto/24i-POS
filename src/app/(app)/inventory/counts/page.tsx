import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { ln } from "@/lib/i18n";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { NewCountButton } from "@/components/inventory/count-sheet";

export const metadata = { title: "Stock counts" };

export default async function CountsPage() {
  const user = await requirePageOrgUser("inventory.manage");
  const { t, locale } = await getI18n();
  const [counts, categories, users] = await Promise.all([
    db.stockCount.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, take: 50, include: { _count: { select: { items: true } } } }),
    db.category.findMany({ where: { organizationId: user.organizationId }, orderBy: { sortOrder: "asc" } }),
    db.user.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader eyebrow={t("nav.inventory")} title={t("inv.counts")} actions={<NewCountButton categories={categories.map((c) => ({ id: c.id, name: ln(locale, c) }))} />} />
      <Card>
        {counts.length === 0 ? <EmptyState icon={<ClipboardList className="size-6" />} title={t("inv.counts")} description={t("inv.countHint")} /> : (
          <Table>
            <THead><tr><TH>{t("common.date")}</TH><TH>{t("common.status")}</TH><TH>{t("sales.items")}</TH><TH>{t("common.user")}</TH><TH /></tr></THead>
            <tbody>
              {counts.map((c) => (
                <TR key={c.id}>
                  <TD className="num">{c.createdAt.toLocaleString(locale === "ar" ? "ar-LB" : "en-GB")}</TD>
                  <TD><Badge tone={c.status === "OPEN" ? "gold" : c.status === "POSTED" ? "success" : "neutral"}>{t(`inv.countStatus.${c.status}` as "inv.countStatus.OPEN")}</Badge></TD>
                  <TD className="num">{c._count.items}</TD>
                  <TD className="text-muted">{users.find((u) => u.id === c.createdById)?.name}</TD>
                  <TD className="text-end"><Link prefetch={false} href={`/inventory/counts/${c.id}`} className="text-sm font-medium text-gold-700 hover:underline">{t("common.open")}</Link></TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
