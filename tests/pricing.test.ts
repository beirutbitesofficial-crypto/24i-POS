import { describe, it, expect } from "vitest";
import { priceCart, settle, parseWeightToKg } from "@/lib/pricing";
import { roundLbp } from "@/lib/money";

describe("priceCart", () => {
  it("computes weight lines exactly (0.750 kg × $12.40)", () => {
    const r = priceCart([{ quantity: "0.750", unitPrice: "12.40" }]);
    expect(r.total.toString()).toBe("9.3");
  });
  it("avoids float errors (0.1 + 0.2 style)", () => {
    const r = priceCart([{ quantity: "1", unitPrice: "0.1" }, { quantity: "1", unitPrice: "0.2" }]);
    expect(r.total.toFixed(2)).toBe("0.30");
  });
  it("applies line and cart discounts and allocates cart discount exactly", () => {
    const r = priceCart(
      [
        { quantity: "1", unitPrice: "10", discountType: "PERCENT", discountValue: "10" },
        { quantity: "3", unitPrice: "3.33" },
      ],
      { type: "AMOUNT", value: "1" },
    );
    expect(r.lines[0].lineDiscount.toFixed(2)).toBe("1.00");
    expect(r.cartDiscount.toFixed(2)).toBe("1.00");
    const sumShares = r.lines.reduce((s, l) => s.plus(l.cartDiscountShare), r.lines[0].gross.mul(0));
    expect(sumShares.toFixed(2)).toBe("1.00");
    expect(r.total.toFixed(2)).toBe("17.99"); // 9 + 9.99 - 1
  });
  it("caps amount discounts at the line value", () => {
    const r = priceCart([{ quantity: "1", unitPrice: "5", discountType: "AMOUNT", discountValue: "50" }]);
    expect(r.total.toFixed(2)).toBe("0.00");
  });
  it("computes inclusive and exclusive tax", () => {
    const inc = priceCart([{ quantity: "1", unitPrice: "111" }], {}, { enabled: true, rate: "11", inclusive: true });
    expect(inc.taxTotal.toFixed(2)).toBe("11.00");
    expect(inc.total.toFixed(2)).toBe("111.00");
    const exc = priceCart([{ quantity: "1", unitPrice: "100" }], {}, { enabled: true, rate: "11", inclusive: false });
    expect(exc.total.toFixed(2)).toBe("111.00");
  });
});

describe("settlement (USD/LBP)", () => {
  const cfg = { rate: "89500", lbpIncrement: 5000, lbpMode: "NEAREST" as const };
  it("rounds LBP to the cash increment", () => {
    expect(roundLbp("447500", 5000).toString()).toBe("450000");
    expect(roundLbp("447400", 5000, "DOWN").toString()).toBe("445000");
  });
  it("USD cash with USD change", () => {
    const s = settle("9.30", [{ currency: "USD", amount: "20" }], cfg, "USD");
    expect(s.covered).toBe(true);
    expect(s.changeUsd.toFixed(2)).toBe("10.70");
  });
  it("mixed change: whole dollars + LBP remainder", () => {
    const s = settle("9.30", [{ currency: "USD", amount: "20" }], cfg, "MIXED");
    expect(s.changeUsd.toString()).toBe("10");
    expect(s.changeLbp.toString()).toBe("65000"); // 0.70 × 89,500 = 62,650 → 65,000 (nearest 5,000)
  });
  it("full LBP payment of the rounded amount covers the sale", () => {
    const s = settle("9.30", [{ currency: "LBP", amount: "830000" }], cfg, "LBP"); // 832,350 → 830,000
    expect(s.covered).toBe(true);
    expect(s.changeLbp.toString()).toBe("0");
  });
  it("split USD + LBP and reports remaining", () => {
    const s = settle("25", [{ currency: "USD", amount: "20" }], cfg);
    expect(s.covered).toBe(false);
    expect(s.remainingUsd.toFixed(2)).toBe("5.00");
    expect(s.remainingLbp.toString()).toBe("450000"); // 447,500 → 450,000
    const s2 = settle("25", [{ currency: "USD", amount: "20" }, { currency: "LBP", amount: "450000" }], cfg, "LBP");
    expect(s2.covered).toBe(true);
  });
});

describe("weight entry", () => {
  it("parses grams and kilograms", () => {
    expect(parseWeightToKg("750g")!.toString()).toBe("0.75");
    expect(parseWeightToKg("750")!.toString()).toBe("0.75");
    expect(parseWeightToKg("1.25")!.toString()).toBe("1.25");
    expect(parseWeightToKg("1,5 kg")!.toString()).toBe("1.5");
    expect(parseWeightToKg("abc")).toBeNull();
  });
});
