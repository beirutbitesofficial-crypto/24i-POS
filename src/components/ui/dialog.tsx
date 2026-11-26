"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dialog({
  open, onOpenChange, title, description, children, footer, size = "md", className,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; title: React.ReactNode; description?: React.ReactNode;
  children?: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg" | "xl"; className?: string;
}) {
  const w = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="dialog-overlay fixed inset-0 z-50 bg-ink-950/45 backdrop-blur-[2px]" />
        <D.Content
          className={cn(
            "dialog-content fixed top-1/2 left-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-ivory-300 bg-ivory-50 shadow-[var(--shadow-lift)] focus:outline-none",
            w, className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-ivory-200 px-5 py-4">
            <div>
              <D.Title className="text-base font-semibold text-fg">{title}</D.Title>
              {description ? <D.Description className="mt-0.5 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{String(title)}</D.Description>}
            </div>
            <D.Close className="grid size-8 place-items-center rounded-md text-muted hover:bg-ivory-200 hover:text-fg" aria-label="Close">
              <X className="size-4" />
            </D.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">{children}</div>
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ivory-200 px-5 py-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
