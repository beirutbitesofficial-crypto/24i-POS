"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/client";
import { importVariantsCsv } from "@/server/actions/catalog";

export function ImportCsvButton() {
  const { t, te } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Upload className="size-4" />{t("common.import")}</Button>
      <Dialog open={open} onOpenChange={setOpen} title={t("cat.importExport")} description={t("cat.importHint")}
        footer={<>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button loading={busy} disabled={!file} onClick={async () => {
            if (!file) return;
            setBusy(true);
            const fd = new FormData();
            fd.set("file", file);
            const r = await importVariantsCsv(fd);
            setBusy(false);
            if (!r.ok) return toast.error(te(r.error));
            toast.success(t("cat.importDone", r.data));
            setOpen(false);
            router.refresh();
          }}>{t("common.import")}</Button>
        </>}
      >
        <input type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full rounded-lg border border-dashed border-ivory-400 bg-ivory-100 p-6 text-sm file:me-3 file:rounded-md file:border-0 file:bg-ink-900 file:px-3 file:py-1.5 file:text-ivory-50" />
        <p className="mt-3 text-xs text-muted" dir="ltr">sku, price, wholesale_price, cost, min_stock, reorder_qty, active</p>
      </Dialog>
    </>
  );
}
