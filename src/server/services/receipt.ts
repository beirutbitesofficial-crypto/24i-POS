import "server-only";
import { db } from "@/lib/db";
import { lpair, ln, type Locale } from "@/lib/i18n";
import { D, formatLbp, formatUsd, formatWeight, usdToLbp, type RoundingMode } from "@/lib/money";
import type { OrgUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { mediaUrl } from "../context";

export interface ReceiptData {
  storeName: string;
  header: string | null;
  address: string | null;
  phone: string | null;
  logoUrl: string | null;
  number: number;
  date: string;
  cashier: string;
  copy: boolean;
  lines: { name: string; detail: string | null; qty: string; unitPrice: string; total: string; discount: string | null }[];
  subtotal: string;
  discount: string | null;
  tax: { label: string; amount: string } | null;
  total: string;
  totalLbp: string | null;
  payments: { label: string; amount: string }[];
  change: string[];
  rate: string;
  footer: string | null;
  refunded: boolean;
  paperWidthMm: number;
}

export async function buildReceipt(user: OrgUser, saleId: string, locale: Locale): Promise<ReceiptData | null> {
  const sale = await db.sale.findFirst({
    where: { id: saleId, organizationId: user.organizationId },
    include: { items: true, payments: true, cashier: { select: { name: true } } },
  });
  if (!sale) return null;
  if (sale.cashierId !== user.id && !can(user.role, "sales.view_all")) return null;
  const s = await db.storeSettings.findUniqueOrThrow({ where: { organizationId: user.organizationId } });
  const units = await db.unit.findMany({ where: { organizationId: user.organizationId } });
  const unitName = new Map(units.map((u) => [u.code, ln(locale, u)]));
  const ar = locale === "ar";
  const methodLabel = (m: string, c: string) =>
    `${m === "CASH" ? (ar ? "نقداً" : "Cash") : m === "CARD" ? (ar ? "بطاقة" : "Card") : ar ? "تحويل" : "Transfer"} ${c}`;

  return {
    storeName: (ar ? s.storeNameAr || s.storeName : s.storeName) ?? "",
    header: s.receiptHeader,
    address: s.address,
    phone: s.phone,
    logoUrl: s.receiptShowLogo ? mediaUrl(s.logoId) : null,
    number: sale.number,
    date: sale.createdAt.toLocaleString(ar ? "ar-LB" : "en-GB", { dateStyle: "short", timeStyle: "short" }),
    cashier: sale.cashier.name,
    copy: sale.printCount > 1,
    lines: sale.items.map((i) => ({
      name: ar ? i.nameAr : i.nameEn,
      detail: [lpair(locale, i.brandName), lpair(locale, i.variantLabel)].filter(Boolean).join(" · ") || null,
      qty: i.sellMode === "WEIGHT" ? formatWeight(i.quantity, locale) : `${D(i.quantity).toString()} ${unitName.get(i.unitCode) ?? ""}`.trim(),
      unitPrice: formatUsd(i.unitPrice) + (i.sellMode === "WEIGHT" ? (ar ? "/كغ" : "/kg") : ""),
      total: formatUsd(D(i.lineTotal)),
      discount: D(i.discountAmount).gt(0) ? `-${formatUsd(i.discountAmount)}` : null,
    })),
    subtotal: formatUsd(sale.subtotal),
    discount: D(sale.discountTotal).gt(0) ? `-${formatUsd(sale.discountTotal)}` : null,
    tax: D(sale.taxTotal).gt(0) ? { label: s.taxLabel, amount: formatUsd(sale.taxTotal) } : null,
    total: formatUsd(sale.total),
    totalLbp: s.receiptShowLbp ? formatLbp(usdToLbp(sale.total, sale.exchangeRate, s.lbpRounding, s.lbpRoundingMode as RoundingMode), locale) : null,
    payments: sale.payments.map((p) => ({ label: methodLabel(p.method, p.currency), amount: p.currency === "USD" ? formatUsd(p.amount) : formatLbp(p.amount, locale) })),
    change: [
      D(sale.changeUsd).gt(0) ? formatUsd(sale.changeUsd) : null,
      D(sale.changeLbp).gt(0) ? formatLbp(sale.changeLbp, locale) : null,
    ].filter((x): x is string => !!x),
    rate: `1 USD = ${formatLbp(sale.exchangeRate, locale)}`,
    footer: s.receiptFooter,
    refunded: sale.status !== "COMPLETED",
    paperWidthMm: s.paperWidthMm,
  };
}
