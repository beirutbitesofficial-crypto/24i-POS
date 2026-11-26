import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { D } from "@/lib/money";
import { isoDate } from "@/lib/dates";
import type { OrgUser } from "@/lib/auth";
import { salesReport } from "./reports";
import { reorderSuggestions } from "./reorder";

/**
 * "Ask 24i" — a read-only analyst over the tenant's own data.
 * Every tool is scoped to user.organizationId and only reads. Cost/profit figures are
 * only exposed to users holding reports.financial.
 */

export const MODEL = "claude-opus-5-5";
export type ChatTurn = { role: "user" | "assistant"; content: string };

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD (store local date)");

function range(from: string, to: string) {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to + "T00:00:00");
  t.setDate(t.getDate() + 1); // `to` is inclusive
  if (isNaN(f.getTime()) || isNaN(t.getTime()) || t <= f) throw new Error("Invalid date range");
  if (t.getTime() - f.getTime() > 400 * 86400000) throw new Error("Range too long (max ~13 months)");
  return { f, t };
}

const n2 = (v: { toNumber(): number }) => Math.round(v.toNumber() * 100) / 100;

export function buildTools(user: OrgUser) {
  const org = user.organizationId;
  const fin = can(user.role, "reports.financial");

  const salesSummary = betaZodTool({
    name: "sales_summary",
    description:
      "Sales totals for a date range: orders, gross, discounts, refunds, net sales (USD), LBP total, average order, " +
      (fin ? "cost of goods, gross profit and margin, " : "") +
      "plus breakdowns by category, brand, cashier, payment method and per-day. Use for questions like 'how much did we sell/profit this month', 'which day was best', 'cash vs card'.",
    inputSchema: z.object({ from: dateStr, to: dateStr.describe("Inclusive end date, YYYY-MM-DD") }),
    run: async ({ from, to }) => {
      const { f, t } = range(from, to);
      const r = await salesReport(org, f, t);
      const money = (x: { revenue: { toNumber(): number }; cost: { toNumber(): number }; profit: { toNumber(): number } }) =>
        fin ? { revenue: n2(x.revenue), cost: n2(x.cost), profit: n2(x.profit) } : { revenue: n2(x.revenue) };
      return JSON.stringify({
        currency: "USD",
        orders: r.orders,
        gross: n2(r.gross),
        discounts: n2(r.discounts),
        refunds: { count: r.refunds.count, total: n2(r.refunds.total) },
        netSales: n2(r.netSales),
        totalLbp: r.totalLbp.toNumber(),
        avgOrder: n2(r.avgOrder),
        tax: n2(r.tax),
        ...(fin ? { costOfGoods: n2(r.cost.minus(r.refunds.cost)), grossProfit: n2(r.profit), marginPct: r.margin.toNumber() } : {}),
        byCategory: r.byCategory.slice(0, 20).map((c) => ({ name: c.nameEn, nameAr: c.nameAr, ...money(c) })),
        byBrand: r.byBrand.slice(0, 20).map((b) => ({ name: b.name ?? "(no brand)", ...money(b) })),
        byCashier: r.byCashier.map((c) => ({ name: c.name, orders: c.orders, revenue: n2(c.revenue), discounts: n2(c.discounts) })),
        byPayment: r.byPayment.map((p) => ({ method: p.method, currency: p.currency, amount: n2(p.amount), usdValue: n2(p.base) })),
        daily: r.daily.map((d) => ({ day: d.day, orders: d.orders, revenue: n2(d.revenue), ...(fin ? { profit: n2(d.revenue.minus(d.cost)) } : {}) })),
        ...(fin ? {} : { note: "This user is not allowed to see costs or profit." }),
      });
    },
  });

  const productSales = betaZodTool({
    name: "product_sales",
    description:
      "Per-product (variant) sales ranking for a date range: quantity sold, revenue" + (fin ? ", cost and profit" : "") +
      ". Use for best sellers, worst sellers, or how a specific product did. Optional text filter matches product/brand names (Arabic or English).",
    inputSchema: z.object({
      from: dateStr,
      to: dateStr.describe("Inclusive end date, YYYY-MM-DD"),
      sortBy: z.enum(fin ? ["revenue", "qty", "profit"] : ["revenue", "qty"]).optional().describe("Default revenue"),
      order: z.enum(["desc", "asc"]).optional().describe("desc = best first (default), asc = worst first"),
      search: z.string().max(60).optional(),
      limit: z.number().int().min(1).max(50).optional().describe("Default 10"),
    }),
    run: async ({ from, to, sortBy = "revenue", order = "desc", search, limit = 10 }) => {
      const { f, t } = range(from, to);
      const r = await salesReport(org, f, t);
      const q = search?.trim().toLowerCase();
      let rows = r.byProduct.filter((p) => !q || [p.nameEn, p.nameAr, p.brandName, p.variantLabel].some((s) => s?.toLowerCase().includes(q)));
      const key = (p: (typeof rows)[number]) => (sortBy === "qty" ? p.qty : sortBy === "profit" ? p.profit : p.revenue).toNumber();
      rows = rows.sort((a, b) => (order === "asc" ? key(a) - key(b) : key(b) - key(a))).slice(0, limit);
      return JSON.stringify({
        currency: "USD",
        note: "Only products with at least one sale in the range are listed.",
        products: rows.map((p) => ({
          name: p.nameEn, nameAr: p.nameAr, brand: p.brandName, variant: p.variantLabel, unit: p.unitCode,
          qty: p.qty.toNumber(), revenue: n2(p.revenue), ...(fin ? { cost: n2(p.cost), profit: n2(p.profit) } : {}),
        })),
      });
    },
  });

  const stockLookup = betaZodTool({
    name: "stock_lookup",
    description: "Current on-hand stock and selling price for products matching a name/brand/SKU search (Arabic or English).",
    inputSchema: z.object({ search: z.string().min(1).max(60) }),
    run: async ({ search }) => {
      const s = search.trim();
      const vs = await db.productVariant.findMany({
        where: {
          organizationId: org, active: true,
          OR: [
            { sku: { contains: s, mode: "insensitive" } },
            { labelEn: { contains: s, mode: "insensitive" } },
            { labelAr: { contains: s } },
            { product: { nameEn: { contains: s, mode: "insensitive" } } },
            { product: { nameAr: { contains: s } } },
            { brand: { nameEn: { contains: s, mode: "insensitive" } } },
            { brand: { nameAr: { contains: s } } },
          ],
        },
        include: { product: true, brand: true, unit: true },
        take: 30,
      });
      return JSON.stringify(vs.map((v) => ({
        name: v.product.nameEn, nameAr: v.product.nameAr, brand: v.brand?.nameEn ?? null, variant: v.labelEn ?? v.labelAr, sku: v.sku,
        unit: v.unit.code, stock: v.trackStock ? D(v.stockQty).toNumber() : "made to order", minStock: v.minStock ? D(v.minStock).toNumber() : null,
        priceUsd: v.price ? n2(D(v.price)) : null, ...(fin && v.cost ? { costUsd: n2(D(v.cost)) } : {}),
      })));
    },
  });

  const lowStock = betaZodTool({
    name: "low_stock",
    description: "Products at or below their minimum stock, with 30-day average daily sales, days of stock left and a suggested reorder quantity.",
    inputSchema: z.object({}),
    run: async () => {
      const rows = await reorderSuggestions(org);
      return JSON.stringify(rows.slice(0, 60).map(({ v, avg, daysLeft, suggested }) => ({
        name: v.product.nameEn, nameAr: v.product.nameAr, brand: v.brand?.nameEn ?? null, unit: v.unit.code,
        stock: D(v.stockQty).toNumber(), minStock: D(v.minStock).toNumber(), avgDailySales: avg.toNumber(),
        daysLeft: daysLeft?.toNumber() ?? null, suggestedOrder: suggested.toNumber(), supplier: v.supplier?.name ?? null,
      })));
    },
  });

  return [salesSummary, productSales, stockLookup, lowStock];
}

export class AssistantNotConfigured extends Error {}

export async function askAssistant(user: OrgUser, history: ChatTurn[]) {
  if (!process.env.ANTHROPIC_API_KEY) throw new AssistantNotConfigured();
  const settings = await db.storeSettings.findUniqueOrThrow({ where: { organizationId: user.organizationId } });
  const fin = can(user.role, "reports.financial");
  const now = new Date();

  const system = [
    `You are "Ask 24i", the business assistant inside 24i POS for the store "${settings.storeName}"${settings.storeNameAr ? ` (${settings.storeNameAr})` : ""}, a Lebanese dairy & grocery shop.`,
    "Answer the owner's questions about their sales, profit, best sellers and stock using ONLY the tools. Never guess or invent numbers; if the data is not available, say so.",
    "Reply in the same language the user writes in (Arabic, English, or Lebanese Arabizi — reply to Arabizi in Arabic script unless they ask otherwise).",
    "Money is in USD; mention the LBP equivalent only when useful, using the store rate below. Keep answers short and scannable: a one-line answer first, then a few bullet lines (start lines with •). No markdown tables or headings.",
    fin ? "This user may see cost, profit and margins." : "This user may NOT see cost, profit or margins — politely decline those questions.",
    "Gross profit = net sales minus tax minus cost of goods (purchase cost recorded at sale time). Mention that operating expenses (rent, salaries) are not included when you report profit.",
  ].join("\n");

  const context =
    `Today is ${isoDate(now)} (${now.toLocaleDateString("en-US", { weekday: "long" })}). ` +
    `"This month" = ${isoDate(new Date(now.getFullYear(), now.getMonth(), 1))} to today. Store rate: 1 USD = ${D(settings.exchangeRate).toNumber()} LBP.`;

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m, i) =>
    i === history.length - 1 && m.role === "user"
      ? { role: "user", content: `${m.content}\n\n<context>${context}</context>` }
      : { role: m.role, content: m.content },
  );

  const client = new Anthropic();
  const final = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    max_iterations: 8,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    tools: buildTools(user),
    messages,
  });

  if (final.stop_reason === "refusal") return { text: "", refused: true, usage: final.usage };
  const text = final.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
  return { text, refused: false, usage: final.usage };
}
