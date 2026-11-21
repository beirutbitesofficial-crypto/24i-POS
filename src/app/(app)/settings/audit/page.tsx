import { ScrollText } from "lucide-react";
import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Pagination } from "@/components/ui/pagination";
import { SearchBox } from "@/components/ui/search-box";

export const metadata = { title: "Audit log" };
const PER = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const user = await requirePageOrgUser("audit.view");
  const { t, locale } = await getI18n();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = { organizationId: user.organizationId, ...(sp.q ? { action: { contains: sp.q } } : {}) };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER, include: { user: { select: { name: true } } } }),
    db.auditLog.count({ where }),
  ]);
  return (
    <>
      <PageHeader eyebrow={t("nav.settings")} title={t("audit.title")} />
      <SearchBox placeholder={t("audit.action")} className="mb-4 w-72" />
      <Card>
        {rows.length === 0 ? <EmptyState icon={<ScrollText className="size-6" />} title={t("common.none")} /> : (
          <>
            <Table>
              <THead><tr><TH>{t("common.date")}</TH><TH>{t("common.user")}</TH><TH>{t("audit.action")}</TH><TH>{t("audit.entity")}</TH><TH>{t("common.details")}</TH></tr></THead>
              <tbody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TD className="num text-xs whitespace-nowrap text-muted">{r.createdAt.toLocaleString(locale === "ar" ? "ar-LB" : "en-GB")}</TD>
                    <TD>{r.user?.name ?? "—"}</TD>
                    <TD className="num text-xs font-medium">{r.action}</TD>
                    <TD className="text-xs text-muted">{r.entity ?? ""}</TD>
                    <TD className="max-w-md"><code className="num block truncate text-[11px] text-muted">{r.details ? JSON.stringify(r.details) : ""}</code></TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <Pagination t={t} page={page} pages={Math.ceil(total / PER)} total={total} makeHref={(p) => `/settings/audit?page=${p}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} />
          </>
        )}
      </Card>
    </>
  );
}
