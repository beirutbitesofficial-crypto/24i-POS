import Link from "next/link";
import { Building2 } from "lucide-react";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { requirePlatformPage } from "@/lib/auth";
import { formatUsd } from "@/lib/money";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { NewOrgButton } from "@/components/platform/org-forms";

export const metadata = { title: "Platform" };

export default async function PlatformPage() {
  await requirePlatformPage();
  const { t, locale } = await getI18n();
  const since = new Date(Date.now() - 30 * 86400000);
  const [orgs, sales] = await Promise.all([
    db.organization.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { users: true, products: true } } } }),
    db.sale.groupBy({ by: ["organizationId"], where: { createdAt: { gte: since } }, _sum: { total: true }, _count: true }),
  ]);
  return (
    <>
      <PageHeader eyebrow="24i" title={t("plat.title")} description={t("plat.subtitle")} actions={<NewOrgButton />} />
      <Card>
        {orgs.length === 0 ? <EmptyState icon={<Building2 className="size-6" />} title={t("plat.newOrg")} /> : (
          <Table>
            <THead><tr><TH>{t("plat.orgName")}</TH><TH>{t("plat.slug")}</TH><TH>{t("plat.modules")}</TH><TH>{t("plat.users")}</TH><TH>{t("cat.products")}</TH><TH className="text-end">{t("plat.sales30")}</TH><TH>{t("common.status")}</TH></tr></THead>
            <tbody>
              {orgs.map((o) => {
                const s = sales.find((x) => x.organizationId === o.id);
                return (
                  <TR key={o.id}>
                    <TD><Link prefetch={false} href={`/platform/${o.id}`} className="font-semibold text-fg hover:text-gold-700">{locale === "ar" ? o.nameAr || o.name : o.name}</Link></TD>
                    <TD className="num text-xs text-muted">{o.slug}</TD>
                    <TD><div className="flex flex-wrap gap-1">{o.modules.map((m) => <Badge key={m}>{t(`plat.module.${m}` as "plat.module.pos")}</Badge>)}</div></TD>
                    <TD className="num">{o._count.users}</TD>
                    <TD className="num">{o._count.products}</TD>
                    <TD className="num text-end">{formatUsd(s?._sum.total ?? 0)} <span className="text-xs text-muted">({s?._count ?? 0})</span></TD>
                    <TD><Badge tone={o.active ? "success" : "neutral"}>{o.active ? t("common.active") : t("common.inactive")}</Badge></TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
