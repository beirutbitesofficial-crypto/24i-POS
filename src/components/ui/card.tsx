import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-ivory-300 bg-ivory-50 shadow-[var(--shadow-card)]", className)} {...props} />;
}
export function CardHeader({ className, title, description, action }: { className?: string; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-ivory-200 px-5 py-4", className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function Badge({ className, tone = "neutral", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "gold" | "success" | "danger" | "warn" | "info" | "dark" }) {
  const tones = {
    neutral: "bg-ivory-200 text-ink-700",
    gold: "bg-gold-100 text-gold-700",
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
    warn: "bg-warn-soft text-warn",
    info: "bg-info-soft text-info",
    dark: "bg-ink-900 text-ivory-50",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)} {...props} />;
}

export function PageHeader({ title, description, actions, eyebrow }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[11px] font-semibold tracking-[0.16em] text-gold-600 uppercase">{eyebrow}</div>}
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900 sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid size-14 place-items-center rounded-2xl bg-gold-50 text-gold-600 ring-1 ring-gold-100">{icon}</div>}
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, icon, tone = "default" }: { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; tone?: "default" | "dark" }) {
  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl border p-5",
      tone === "dark" ? "lux-dark lux-edge border-transparent text-white" : "border-ivory-300 bg-ivory-50 shadow-[var(--shadow-card)]",
    )}>
      <div className="flex items-start justify-between">
        <div className={cn("text-xs font-semibold tracking-wide uppercase", tone === "dark" ? "text-gold-300" : "text-muted")}>{label}</div>
        {icon && <div className={cn("grid size-9 place-items-center rounded-xl", tone === "dark" ? "bg-white/5 text-gold-300 ring-1 ring-white/10" : "bg-gold-50 text-gold-600")}>{icon}</div>}
      </div>
      <div className="num mt-3 text-[26px] font-semibold tracking-tight">{value}</div>
      {sub && <div className={cn("mt-1 text-xs", tone === "dark" ? "text-ink-300" : "text-muted")}>{sub}</div>}
    </div>
  );
}
