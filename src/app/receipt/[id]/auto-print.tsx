"use client";
import { useEffect } from "react";

export function AutoPrint({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    // Wait for the logo image before printing
    const imgs = Array.from(document.images);
    Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => { i.onload = r; i.onerror = r; })))).then(() => {
      setTimeout(() => window.print(), 50);
    });
  }, [enabled]);
  return null;
}
