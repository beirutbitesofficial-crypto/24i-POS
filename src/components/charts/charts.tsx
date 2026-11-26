"use client";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useI18n } from "@/lib/i18n/client";

/** Validated single-series hue — 24i teal (passes lightness/chroma/contrast on the white surface). */
const SERIES = "#008f8f";

export function TrendBars({ data, valueLabel }: { data: { label: string; value: number; sub?: string }[]; valueLabel: string }) {
  const { dir } = useI18n();
  const fmt = (v: number) => `$${v.toLocaleString("en", { maximumFractionDigits: v >= 100 ? 0 : 2 })}`;
  return (
    <div className="h-64 w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={6}>
          <CartesianGrid vertical={false} stroke="var(--color-ivory-300)" strokeDasharray="0" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--color-ivory-400)" }} tick={{ fontSize: 11, fill: "var(--color-muted)" }} reversed={dir === "rtl"} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--color-muted)" }} tickFormatter={fmt} width={56} orientation={dir === "rtl" ? "right" : "left"} />
          <Tooltip
            cursor={{ fill: "rgba(0,140,140,0.08)" }}
            contentStyle={{ borderRadius: 12, border: "1px solid var(--color-ivory-300)", background: "var(--color-ivory-50)", color: "var(--color-text)", boxShadow: "0 12px 32px -12px rgb(16 24 40 / 0.25)", fontSize: 12 }}
            formatter={(v: number) => [fmt(v), valueLabel]}
            labelFormatter={(l, p) => (p?.[0]?.payload?.sub ? `${l} · ${p[0].payload.sub}` : String(l))}
          />
          <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Horizontal share bars with direct value labels (no legend needed: single series). */
export function ShareBars({ rows }: { rows: { label: string; value: number; display: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} title={`${r.label}: ${r.display}`}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate text-fg">{r.label}</span>
            <span className="num shrink-0 font-medium text-fg">{r.display}</span>
          </div>
          <div className="h-2.5 rounded-full bg-ivory-200">
            <div className="h-2.5 rounded-full" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: SERIES }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
