"use client";
import { useMemo, useRef, useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { inputClass } from "@/components/ui/input";

export interface PickerOption {
  id: string; label: string; sub: string; sku: string; unitCode: string; stock: string; barcodes: string[];
}

/** Searchable product-variant combobox (name, SKU, barcode). Scanner-friendly: Enter picks an exact barcode. */
export function VariantPicker<T extends PickerOption>({ options, value, onChange, placeholder, className, filter }: {
  options: T[]; value: string | null; onChange: (o: T) => void; placeholder?: string; className?: string; filter?: (o: T) => boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.id === value);
  const list = useMemo(() => {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    return options
      .filter((o) => (filter ? filter(o) : true))
      .filter((o) => tokens.every((tk) => `${o.label} ${o.sub} ${o.sku} ${o.barcodes.join(" ")}`.toLowerCase().includes(tk)))
      .slice(0, 60);
  }, [options, q, filter]);
  const pick = (o: T) => { onChange(o); setOpen(false); setQ(""); };

  return (
    <div className={cn("relative", className)}>
      {!open ? (
        <button type="button" onClick={() => { setOpen(true); setTimeout(() => ref.current?.focus(), 10); }}
          className={cn(inputClass, "flex items-center justify-between text-start")}>
          <span className={cn("truncate", !selected && "text-muted/70")}>
            {selected ? <>{selected.label}{selected.sub && <span className="text-muted"> · {selected.sub}</span>}</> : placeholder ?? t("inv.selectVariant")}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted" />
        </button>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted start-3" />
          <input ref={ref} className={cn(inputClass, "ps-9")} value={q} placeholder={t("inv.selectVariant")}
            onChange={(e) => { setQ(e.target.value); setHi(0); }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter") {
                e.preventDefault();
                const exact = options.find((o) => o.barcodes.includes(q.trim()) || o.sku.toLowerCase() === q.trim().toLowerCase());
                const o = exact ?? list[hi];
                if (o) pick(o);
              }
            }} />
          <ul className="absolute z-40 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-ivory-300 bg-ivory-50 p-1 shadow-[var(--shadow-lift)] scrollbar-thin">
            {list.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t("common.none")}</li>}
            {list.map((o, i) => (
              <li key={o.id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}
                  className={cn("flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-start text-sm", i === hi ? "bg-ivory-200" : "hover:bg-ivory-100")}>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{o.label}</span>
                    <span className="block truncate text-xs text-muted">{o.sub || o.sku}</span>
                  </span>
                  <span className="num shrink-0 text-xs text-muted">{Number(o.stock)} {o.unitCode}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
