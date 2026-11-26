import { cn } from "@/lib/utils";

/** 24i wordmark — teal badge as on 24iproduction.com */
export function BrandMark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)} dir="ltr">
      <div className="grid size-9 place-items-center rounded-[10px] bg-gradient-to-br from-[#14b3b3] to-gold-600 text-[14px] font-bold tracking-tight text-white shadow-[0_6px_16px_-6px_rgb(0_140_140/0.7),inset_0_1px_0_rgb(255_255_255/0.25)]">
        24i
      </div>
      <div className="leading-tight">
        <div className={cn("text-[15px] font-bold tracking-tight", light ? "text-white" : "text-fg")}>24i POS</div>
        <div className={cn("text-[11px]", light ? "text-ink-400" : "text-muted")}>Retail OS</div>
      </div>
    </div>
  );
}
