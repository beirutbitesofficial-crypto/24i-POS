import { cn } from "@/lib/utils";

/** 24i wordmark */
export function BrandMark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)} dir="ltr">
      <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-gold-300 to-gold-600 font-display text-[15px] font-bold text-ink-950 shadow-inner">
        24i
      </div>
      <div className="leading-tight">
        <div className={cn("font-display text-[17px] font-semibold tracking-wide", light ? "text-ivory-50" : "text-ink-900")}>24i POS</div>
      </div>
    </div>
  );
}
