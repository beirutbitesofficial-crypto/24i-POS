/**
 * Pure cart pricing and payment settlement.
 * The browser uses it for instant feedback; the server re-runs it with
 * database prices before anything is saved, so client totals are never trusted.
 */
import { D, Decimal, money, roundLbp, type RoundingMode } from "./money";

export type DiscountType = "PERCENT" | "AMOUNT";

export interface PriceLineInput {
  quantity: Decimal.Value;
  unitPrice: Decimal.Value;
  discountType?: DiscountType | null;
  discountValue?: Decimal.Value | null;
  taxable?: boolean;
}

export interface TaxConfig {
  enabled: boolean;
  /** percent, e.g. 11 */
  rate: Decimal.Value;
  inclusive: boolean;
}

export interface PricedLine {
  gross: Decimal;
  lineDiscount: Decimal;
  cartDiscountShare: Decimal;
  discountAmount: Decimal;
  /** net amount after all discounts (tax-inclusive when tax is inclusive) */
  lineTotal: Decimal;
  tax: Decimal;
}

export interface PricedCart {
  lines: PricedLine[];
  subtotal: Decimal;
  lineDiscountTotal: Decimal;
  cartDiscount: Decimal;
  discountTotal: Decimal;
  taxTotal: Decimal;
  total: Decimal;
}

function discountOf(base: Decimal, type?: DiscountType | null, value?: Decimal.Value | null): Decimal {
  if (!type || value === null || value === undefined) return new Decimal(0);
  const v = D(value);
  if (v.lte(0)) return new Decimal(0);
  if (type === "PERCENT") return money(base.mul(Decimal.min(v, 100)).div(100));
  return money(Decimal.min(v, base));
}

export function priceCart(
  lines: PriceLineInput[],
  cartDiscount: { type?: DiscountType | null; value?: Decimal.Value | null } = {},
  tax: TaxConfig = { enabled: false, rate: 0, inclusive: true },
): PricedCart {
  const step1 = lines.map((l) => {
    const gross = money(D(l.quantity).mul(D(l.unitPrice)));
    const lineDiscount = discountOf(gross, l.discountType, l.discountValue);
    return { gross, lineDiscount, net: gross.minus(lineDiscount), taxable: l.taxable !== false };
  });
  const afterLine = step1.reduce((s, l) => s.plus(l.net), new Decimal(0));
  const cartDisc = discountOf(afterLine, cartDiscount.type, cartDiscount.value);

  // Allocate the cart discount proportionally; the remainder goes to the largest line.
  const shares = step1.map((l) => (afterLine.isZero() ? new Decimal(0) : money(cartDisc.mul(l.net).div(afterLine))));
  const allocated = shares.reduce((s, x) => s.plus(x), new Decimal(0));
  const diff = cartDisc.minus(allocated);
  if (!diff.isZero() && step1.length) {
    let idx = 0;
    step1.forEach((l, i) => { if (l.net.gt(step1[idx].net)) idx = i; });
    shares[idx] = shares[idx].plus(diff);
  }

  const rate = D(tax.rate);
  const out: PricedLine[] = step1.map((l, i) => {
    const lineTotal = l.net.minus(shares[i]);
    let t = new Decimal(0);
    if (tax.enabled && l.taxable && rate.gt(0)) {
      t = tax.inclusive ? money(lineTotal.mul(rate).div(rate.plus(100))) : money(lineTotal.mul(rate).div(100));
    }
    return {
      gross: l.gross,
      lineDiscount: l.lineDiscount,
      cartDiscountShare: shares[i],
      discountAmount: l.lineDiscount.plus(shares[i]),
      lineTotal,
      tax: t,
    };
  });

  const subtotal = out.reduce((s, l) => s.plus(l.gross), new Decimal(0));
  const lineDiscountTotal = out.reduce((s, l) => s.plus(l.lineDiscount), new Decimal(0));
  const net = out.reduce((s, l) => s.plus(l.lineTotal), new Decimal(0));
  const taxTotal = out.reduce((s, l) => s.plus(l.tax), new Decimal(0));
  const total = tax.enabled && !tax.inclusive ? net.plus(taxTotal) : net;
  return {
    lines: out,
    subtotal,
    lineDiscountTotal,
    cartDiscount: cartDisc,
    discountTotal: lineDiscountTotal.plus(cartDisc),
    taxTotal,
    total,
  };
}

// ───────────────────────── Settlement ─────────────────────────

export interface TenderInput {
  currency: "USD" | "LBP";
  amount: Decimal.Value;
}

export type ChangeCurrency = "USD" | "LBP" | "MIXED";

export interface SettlementConfig {
  rate: Decimal.Value; // LBP per USD
  lbpIncrement: number;
  lbpMode: RoundingMode;
}

export interface Settlement {
  paidBase: Decimal;
  covered: boolean;
  /** Still owed, in USD (rounded up to the cent) and LBP (rounded to the cash increment) */
  remainingUsd: Decimal;
  remainingLbp: Decimal;
  changeBase: Decimal;
  changeUsd: Decimal;
  changeLbp: Decimal;
  /** paid − change given − total (base). Positive = store keeps a rounding gain */
  roundingAdj: Decimal;
}

export function tenderToBase(t: TenderInput, rate: Decimal.Value): Decimal {
  const a = D(t.amount);
  return t.currency === "USD" ? a : a.div(D(rate)).toDecimalPlaces(6);
}

export function settle(
  total: Decimal.Value,
  tenders: TenderInput[],
  cfg: SettlementConfig,
  changeCurrency: ChangeCurrency = "USD",
): Settlement {
  const rate = D(cfg.rate);
  const T = D(total);
  const paidBase = tenders.reduce((s, t) => s.plus(tenderToBase(t, rate)), new Decimal(0));
  const diff = paidBase.minus(T);
  const zero = new Decimal(0);

  if (diff.isNegative()) {
    const shortfall = diff.neg();
    const shortLbp = roundLbp(shortfall.mul(rate), cfg.lbpIncrement, cfg.lbpMode);
    const shortUsd = shortfall.toDecimalPlaces(2, Decimal.ROUND_CEIL);
    // Shortfall smaller than the smallest LBP cash step is absorbed as rounding.
    if (shortLbp.isZero() && tenders.some((t) => t.currency === "LBP")) {
      return { paidBase, covered: true, remainingUsd: zero, remainingLbp: zero, changeBase: zero, changeUsd: zero, changeLbp: zero, roundingAdj: diff };
    }
    if (shortUsd.isZero()) {
      return { paidBase, covered: true, remainingUsd: zero, remainingLbp: zero, changeBase: zero, changeUsd: zero, changeLbp: zero, roundingAdj: diff };
    }
    return { paidBase, covered: false, remainingUsd: shortUsd, remainingLbp: shortLbp, changeBase: zero, changeUsd: zero, changeLbp: zero, roundingAdj: zero };
  }

  const changeBase = diff;
  let changeUsd = zero;
  let changeLbp = zero;
  if (changeCurrency === "USD") {
    changeUsd = changeBase.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  } else if (changeCurrency === "LBP") {
    changeLbp = roundLbp(changeBase.mul(rate), cfg.lbpIncrement, cfg.lbpMode);
  } else {
    changeUsd = changeBase.toDecimalPlaces(0, Decimal.ROUND_FLOOR);
    changeLbp = roundLbp(changeBase.minus(changeUsd).mul(rate), cfg.lbpIncrement, cfg.lbpMode);
  }
  const given = changeUsd.plus(changeLbp.div(rate));
  const roundingAdj = paidBase.minus(given).minus(T).toDecimalPlaces(4);
  return { paidBase, covered: true, remainingUsd: zero, remainingLbp: zero, changeBase, changeUsd, changeLbp, roundingAdj };
}

/** Parse a cashier-entered weight. Accepts "0.75", "750g", "750 g", "1.2kg". Returns kg. */
export function parseWeightToKg(input: string): Decimal | null {
  const s = input.trim().toLowerCase().replace(",", ".").replace(/\s+/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)(kg|g|غ|كغ)?$/);
  if (!m) return null;
  const n = new Decimal(m[1]);
  const unit = m[2];
  if (unit === "g" || unit === "غ") return n.div(1000).toDecimalPlaces(3);
  if (unit === "kg" || unit === "كغ") return n.toDecimalPlaces(3);
  // Bare number: ≥ 20 is grams (nobody sells 20+ kg of cheese at the till), else kg
  return n.gte(20) ? n.div(1000).toDecimalPlaces(3) : n.toDecimalPlaces(3);
}
