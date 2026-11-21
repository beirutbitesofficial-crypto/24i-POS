import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { ln } from "@/lib/i18n";
import { variantLabel } from "@/server/queries";
import { Badge, PageHeader } from "@/components/ui/card";
import { CountSheet } from "@/components/inventory/count-sheet";

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageOrgUser("inventory.manage");
  const { t, locale } = await getI18n();
  const { id } = await params;
  const count = await db.stockCount.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { items: { include: { variant: { include: { product: true, brand: true, variety: true, unit: true, packageUnit: true } } }, orderBy: { variant: { product: { nameEn: "asc" } } } } },
  });
  if (!count) notFound();
  return (
    <>
      <Link href="/inventory/counts" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink-900"><ArrowLeft className="size-4 rtl:rotate-180" />{t("inv.counts")}</Link>
      <PageHeader eyebrow={t("inv.counts")} title={count.createdAt.toLocaleString(locale === "ar" ? "ar-LB" : "en-GB")}
        actions={<Badge tone={count.status === "OPEN" ? "gold" : count.status === "POSTED" ? "success" : "neutral"}>{t(`inv.countStatus.${count.status}` as "inv.countStatus.OPEN")}</Badge>} />
      <CountSheet countId={count.id} open={count.status === "OPEN"}
        items={count.items.map((i) => ({
          variantId: i.variantId, name: ln(locale, i.variant.product), sub: variantLabel(locale, i.variant), unitCode: i.variant.unit.code,
          expected: i.expectedQty.toString(), current: i.variant.stockQty.toString(), counted: i.countedQty?.toString() ?? null,
        }))} />
    </>
  );
}
