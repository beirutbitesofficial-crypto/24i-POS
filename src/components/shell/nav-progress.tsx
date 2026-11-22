"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin gold progress bar that appears the instant a link is tapped,
 * so navigation feels responsive even while the server renders the next page.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("/api/")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      setState("loading");
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Route committed → finish the bar
  useEffect(() => {
    setState((s) => (s === "loading" ? "done" : s));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 350);
  }, [pathname, search]);

  if (state === "idle") return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px]" aria-hidden>
      <div
        className={state === "loading" ? "nav-progress h-full bg-gradient-to-r from-gold-300 via-gold-500 to-gold-300 shadow-[0_0_8px_var(--color-gold-400)]" : "h-full bg-gold-400 transition-[transform,opacity] duration-300"}
        style={state === "done" ? { transform: "scaleX(1)", opacity: 0, transformOrigin: "0 50%" } : undefined}
      />
    </div>
  );
}
