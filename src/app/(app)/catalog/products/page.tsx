import Link from "next/link";
import { Package, AlertTriangle, Download, ImageIcon } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { ln } from "@/lib/i18n";
import { D, formatUsd } from "@/lib/money";
import { mediaUrl } from "@/server/context";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { NewProductButton } from "@/components/catalog/product-form";
import { ImportCsvButton } from "@/components/catalog/import-csv";
import { SearchBox } from "@/components/ui/search-box";
import { cn } from "@/lib/utils";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; setup?: string; defaults?: string }> }) {
  const user = await requirePageOrgUser("catalog.manage");
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const where: Prisma.ProductWhereInput = { organizationId: user.organizationId };
  if (sp.category) where.categoryId = sp.category;
  if (q) {
    where.OR = [
      { nameEn: { contains: q, mode: "insensitive" } },
      { nameAr: { contains: q } },
      { variants: { some: { sku: { contains: q, mode: "insensitive" } } } },
      { variants: { some: { barcodes: { some: { code: q } } } } },
    ];
  }
  const [categories, products, brands] = await Promise.all([
    db.category.findMany({ where: { organizationId: user.organizationId }, orderBy: { sortOrder: "asc" } }),
    db.product.findMany({
      where, orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { nameEn: "asc" }],
      include: { category: true, brands: { include: { brand: true } }, variants: { where: { active: true }, select: { price: true, stockQty: true, priceIsDefault: true } }, _count: { select: { varieties: true } } },
    }),
    db.brand.count({ where: { organizationId: user.organizationId } }),
  ]);
  void brands;
  const rows = products
    .map((p) => {
      const prices = p.variants.filter((v) => v.price !== null).map((v) => D(v.price));
      const unpriced = p.variants.filter((v) => v.price === null).length;
      const needsSetup = p.variants.length === 0 || unpriced > 0;
      const defaults = p.variants.filter((v) => v.priceIsDefault).length;
      return { p, prices, unpriced, needsSetup, defaults };
    })
    .filter((r) => (sp.setup === "1" ? r.needsSetup : true))
    .filter((r) => (sp.defaults === "1" ? r.defaults > 0 : true));

  const href = (patch: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const merged = { q: sp.q, category: sp.category, setup: sp.setup, defaults: sp.defaults, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    return `/catalog/products?${u}`;
  };
  const chip = "rounded-full border px-3 py-1.5 text-sm transition whitespace-nowrap";

  return (
    <>
      <PageHeader
        eyebrow={t("nav.catalog")} title={t("cat.products")}
        description={t("cat.productsCount", { count: products.length })}
        actions={
          <>
            <Button asChild variant="outline"><a href="/api/export/variants"><Download className="size-4" />{t("common.exportCsv")}</a></Button>
            <ImportCsvButton />
            <NewProductButton categories={categories.map((c) => ({ id: c.id, name: ln(locale, c) }))} />
          </>
        }
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchBox placeholder={t("cat.searchProducts")} className="lg:w-80" />
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <Link prefetch={false} href={href({ category: undefined })} className={cn(chip, !sp.category ? "border-ink-900 bg-ink-900 text-ivory-50" : "border-ivory-300 bg-ivory-50 hover:bg-ivory-200")}>{t("common.all")}</Link>
          {categories.map((c) => (
            <Link prefetch={false} key={c.id} href={href({ category: c.id })} className={cn(chip, sp.category === c.id ? "border-ink-900 bg-ink-900 text-ivory-50" : "border-ivory-300 bg-ivory-50 hover:bg-ivory-200")}>{ln(locale, c)}</Link>
          ))}
          <Link prefetch={false} href={href({ setup: sp.setup === "1" ? undefined : "1" })} className={cn(chip, "inline-flex items-center gap-1", sp.setup === "1" ? "border-warn bg-warn text-white" : "border-warn/40 bg-warn-soft text-warn")}>
            <AlertTriangle className="size-3.5" />{t("cat.filterSetup")}
          </Link>
          <Link prefetch={false} href={href({ defaults: sp.defaults === "1" ? undefined : "1" })} className={cn(chip, sp.defaults === "1" ? "border-info bg-info text-white" : "border-info/30 bg-info-soft text-info")}>
            {t("cat.filterDefault")}
          </Link>
        </div>
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Package className="size-6" />} title={t("cat.products")} description={q ? t("pos.notFound", { q }) : undefined} />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>{t("cat.product")}</TH><TH>{t("cat.category")}</TH><TH>{t("cat.brands")}</TH>
                <TH>{t("cat.variants")}</TH><TH>{t("common.price")}</TH><TH>{t("common.status")}</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map(({ p, prices, unpriced, needsSetup, defaults }) => {
                const min = prices.length ? prices.reduce((a, b) => (a.lt(b) ? a : b)) : null;
                const max = prices.length ? prices.reduce((a, b) => (a.gt(b) ? a : b)) : null;
                return (
                  <TR key={p.id}>
                    <TD>
                      <Link prefetch={false} href={`/catalog/products/${p.id}`} className="flex items-center gap-3">
                        {p.imageId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={mediaUrl(p.imageId)!} alt="" className="size-10 rounded-lg object-cover ring-1 ring-ivory-300" />
                        ) : (
                          <div className="grid size-10 place-items-center rounded-lg bg-ivory-200 text-ink-400"><ImageIcon className="size-4" /></div>
                        )}
                        <div>
                          <div className="font-medium text-ink-900 hover:text-gold-700">{ln(locale, p)}</div>
                          <div className="text-xs text-muted">{locale === "ar" ? p.nameEn : p.nameAr}</div>
                        </div>
                      </Link>
                    </TD>
                    <TD className="text-muted">{ln(locale, p.category)}</TD>
                    <TD>
                      <div className="flex max-w-56 flex-wrap gap-1">
                        {p.brands.length ? p.brands.map((b) => <Badge key={b.brandId}>{ln(locale, b.brand)}</Badge>) : <span className="text-muted">—</span>}
                      </div>
                    </TD>
                    <TD className="num">{p.variants.length}</TD>
                    <TD className="num whitespace-nowrap">{min ? (min.eq(max!) ? formatUsd(min) : `${formatUsd(min)} – ${formatUsd(max)}`) : "—"}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {!p.active && <Badge>{t("common.inactive")}</Badge>}
                        {defaults > 0 && <Badge tone="info">{t("cat.defaultPrice")} · <span className="num">{defaults}</span></Badge>}
                        {needsSetup ? (
                          <Badge tone="warn"><AlertTriangle className="size-3" />{p.variants.length === 0 ? t("common.needsSetup") : `${unpriced} ${t("cat.noPrice")}`}</Badge>
                        ) : p.active && <Badge tone="success">{t("common.active")}</Badge>}
                      </div>
                    </TD>
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
