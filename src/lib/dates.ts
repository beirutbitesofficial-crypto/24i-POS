/** Date-range helpers for filters (server local time). */
export type RangeKey = "today" | "week" | "month" | "custom";

export function resolveRange(sp: { range?: string; from?: string; to?: string }): { from: Date; to: Date; key: RangeKey } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const key = (["today", "week", "month", "custom"].includes(sp.range ?? "") ? sp.range : "today") as RangeKey;
  if (key === "custom" && sp.from) {
    const from = new Date(sp.from + "T00:00:00");
    const to = sp.to ? new Date(sp.to + "T00:00:00") : startOfDay(now);
    to.setDate(to.getDate() + 1);
    if (!isNaN(from.getTime()) && !isNaN(to.getTime())) return { from, to, key };
  }
  const to = startOfDay(now);
  to.setDate(to.getDate() + 1);
  if (key === "week") {
    const from = startOfDay(now);
    from.setDate(from.getDate() - 6);
    return { from, to, key };
  }
  if (key === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1), to, key };
  return { from: startOfDay(now), to, key: "today" };
}

export const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
