/**
 * Decimal-safe money & quantity math. Shared by the browser (cart preview)
 * and the server (authoritative totals). Never use JS floats for money.
 */
import Decimal from "decimal.js";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };
export type DecimalInput = Decimal.Value | { toString(): string } | null | undefined;

export function D(v: DecimalInput): Decimal {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  if (v instanceof Decimal) return v;
  return new Decimal(typeof v === "object" ? v.toString() : v);
}

/** Round to cents */
export const money = (v: DecimalInput) => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
/** Round to 3 decimals (kg → gram precision) */
export const qty3 = (v: DecimalInput) => D(v).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

export type RoundingMode = "NEAREST" | "UP" | "DOWN";

/** Round an LBP amount to the configured cash increment */
export function roundLbp(v: DecimalInput, increment: number, mode: RoundingMode = "NEAREST"): Decimal {
  const inc = new Decimal(Math.max(1, increment || 1));
  const units = D(v).div(inc);
  const r =
    mode === "UP" ? units.toDecimalPlaces(0, Decimal.ROUND_CEIL)
    : mode === "DOWN" ? units.toDecimalPlaces(0, Decimal.ROUND_FLOOR)
    : units.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return r.mul(inc);
}

export function usdToLbp(usd: DecimalInput, rate: DecimalInput, increment: number, mode: RoundingMode = "NEAREST") {
  return roundLbp(D(usd).mul(D(rate)), increment, mode);
}

export function formatUsd(v: DecimalInput, locale: string = "en"): string {
  const n = money(v);
  const s = n.abs().toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  void locale;
  return `${n.isNegative() ? "-" : ""}$${s}`;
}

export function formatLbp(v: DecimalInput, locale: string = "en"): string {
  const n = D(v).toDecimalPlaces(0);
  const s = n.abs().toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n.isNegative() ? "-" : ""}${s} ${locale === "ar" ? "ل.ل" : "LBP"}`;
}

export function formatQty(v: DecimalInput, unitCode: string, decimals: boolean): string {
  const n = D(v);
  if (!decimals) return `${n.toDecimalPlaces(0).toString()}`;
  return n.toDecimalPlaces(3).toFixed(3);
}

/** Human weight: 0.750 kg → "750 g", 1.25 → "1.250 kg" */
export function formatWeight(kg: DecimalInput, locale = "en"): string {
  const n = D(kg);
  if (n.abs().lt(1) && !n.isZero()) return `${n.mul(1000).toDecimalPlaces(0).toString()} ${locale === "ar" ? "غ" : "g"}`;
  return `${n.toFixed(3)} ${locale === "ar" ? "كغ" : "kg"}`;
}
