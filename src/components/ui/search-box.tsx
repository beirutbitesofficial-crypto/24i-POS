"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputClass } from "./input";

/** Debounced URL-backed search (?q=) */
export function SearchBox({ placeholder, className, param = "q" }: { placeholder: string; className?: string; param?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [value, setValue] = useState(sp.get(param) ?? "");
  useEffect(() => {
    const h = setTimeout(() => {
      if ((sp.get(param) ?? "") === value) return;
      const u = new URLSearchParams(sp.toString());
      if (value) u.set(param, value); else u.delete(param);
      u.delete("page");
      router.replace(`${pathname}?${u}`);
    }, 300);
    return () => clearTimeout(h);
  }, [value, sp, param, pathname, router]);
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted start-3" />
      <input className={cn(inputClass, "ps-9")} placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} />
    </div>
  );
}
