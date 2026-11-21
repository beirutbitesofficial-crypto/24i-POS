"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { authorize } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { orgAction, BusinessError } from "../action";
import { audit } from "../audit";
import { createSale, saleInputSchema, createRefund, refundInputSchema } from "../services/sales";

export const completeSale = orgAction("pos.sell", saleInputSchema, async (input, user) => createSale(user, input));

export const completeRefund = orgAction(null, refundInputSchema, async (input, user) => createRefund(user, input));

export const holdSale = orgAction(
  "pos.sell",
  z.object({ label: z.string().max(60).nullish(), cart: z.record(z.unknown()) }),
  async ({ label, cart }, user) => {
    const h = await db.heldSale.create({ data: { organizationId: user.organizationId, userId: user.id, label: label ?? null, cart: cart as object } });
    return { id: h.id };
  },
);

export const resumeHeld = orgAction("pos.sell", z.object({ id: z.string() }), async ({ id }, user) => {
  const h = await db.heldSale.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!h) throw new BusinessError("NOT_FOUND");
  await db.heldSale.delete({ where: { id } });
  return { cart: h.cart as Record<string, unknown> };
});

/** Manager approval for removing an item from the cart (audited). */
export const approveVoid = orgAction(
  "pos.sell",
  z.object({ pin: z.string().max(6).nullish(), item: z.string().max(200), quantity: z.string().max(20) }),
  async ({ pin, item, quantity }, user) => {
    const { approvedBy } = await authorize(user, "pos.void", pin);
    await audit({ organizationId: user.organizationId, userId: user.id, action: "pos.void_line", details: { item, quantity, approvedBy } });
    return { ok: true };
  },
);

/** First print is free; reprints need pos.reprint (or a manager PIN) and are audited. */
export const registerPrint = orgAction(
  "pos.sell",
  z.object({ saleId: z.string(), pin: z.string().max(6).nullish() }),
  async ({ saleId, pin }, user) => {
    const sale = await db.sale.findFirst({ where: { id: saleId, organizationId: user.organizationId } });
    if (!sale) throw new BusinessError("NOT_FOUND");
    if (sale.cashierId !== user.id && !can(user.role, "sales.view_all")) throw new BusinessError("FORBIDDEN");
    let approvedBy: string | null = null;
    if (sale.printCount > 0) {
      approvedBy = (await authorize(user, "pos.reprint", pin)).approvedBy;
      await audit({ organizationId: user.organizationId, userId: user.id, action: "sale.reprint", entity: "Sale", entityId: sale.id, details: { approvedBy, number: sale.number } });
    }
    const updated = await db.sale.update({ where: { id: sale.id }, data: { printCount: { increment: 1 } } });
    return { printCount: updated.printCount };
  },
);

export const listHeld = orgAction("pos.sell", z.object({}), async (_i, user) => {
  const rows = await db.heldSale.findMany({
    where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" }, take: 50, include: { user: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, label: r.label, createdAt: r.createdAt.toISOString(), userName: r.user.name, lines: Array.isArray((r.cart as { lines?: unknown[] }).lines) ? (r.cart as { lines: unknown[] }).lines.length : 0 }));
});
