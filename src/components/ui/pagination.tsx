import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TFn } from "@/lib/i18n";

export function Pagination({ page, pages, total, makeHref, t }: { page: number; pages: number; total: number; makeHref: (p: number) => string; t: TFn }) {
  if (pages <= 1) return <div className="px-4 py-3 text-xs text-muted">{t("common.results", { count: total })}</div>;
  const btn = "inline-flex h-8 items-center gap-1 rounded-md border border-ivory-300 bg-ivory-50 px-2.5 text-xs hover:bg-ivory-200";
  return (
    <div className="flex items-center justify-between gap-2 border-t border-ivory-200 px-4 py-3 text-xs text-muted">
      <span>{t("common.results", { count: total })} · {t("common.page", { page, pages })}</span>
      <div className="flex gap-2">
        {page > 1 && <Link className={btn} href={makeHref(page - 1)}><ChevronLeft className="size-3.5 rtl:rotate-180" />{t("common.previous")}</Link>}
        {page < pages && <Link className={btn} href={makeHref(page + 1)}>{t("common.next")}<ChevronRight className="size-3.5 rtl:rotate-180" /></Link>}
      </div>
    </div>
  );
}
