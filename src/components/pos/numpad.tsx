"use client";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

/** Touch numeric keypad. Always LTR. */
export function NumPad({ value, onChange, decimals = true, className }: { value: string; onChange: (v: string) => void; decimals?: boolean; className?: string }) {
  const press = (k: string) => {
    if (k === "back") return onChange(value.slice(0, -1));
    if (k === "C") return onChange("");
    if (k === ".") { if (!decimals || value.includes(".")) return; return onChange((value || "0") + "."); }
    if (k === "00") return onChange(value ? value + "00" : "");
    onChange(value === "0" ? k : value + k);
  };
  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", decimals ? "." : "00", "0", "back"];
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)} dir="ltr">
      {keys.map((k) => (
        <button key={k} type="button" onClick={() => press(k)}
          className="num flex h-14 items-center justify-center rounded-xl border border-ivory-300 bg-ivory-50 text-xl font-medium text-fg shadow-sm transition-[transform,background-color] duration-100 touch-manipulation active:scale-[0.94] active:bg-ivory-200">
          {k === "back" ? <Delete className="size-5" /> : k}
        </button>
      ))}
    </div>
  );
}
