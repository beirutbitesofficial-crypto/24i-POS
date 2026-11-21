"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { D, money } from "@/lib/money";
import { can } from "@/lib/permissions";
import { orgAction, BusinessError } from "../action";
import { audit } from "../audit";
import { nextNumber } from "../counter";
import { shiftExpectedCash } from "../services/sales";

const amt = z.union([z.string(), z.number()]).transform((v) => String(v || "0")).refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "invalid_number");

export const openShift = orgAction("pos.sell", z.object({ openingUsd: amt, openingLbp: amt }), async (input, user) => {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${"shift:" + user.id}))`;
    const existing = await tx.cashShift.findFirst({ where: { organizationId: user.organizationId, userId: user.id, closedAt: null } });
    if (existing) throw new BusinessError("SHIFT_ALREADY_OPEN");
    const number = await nextNumber(tx, user.organizationId, "shift");
    const s = await tx.cashShift.create({
      data: { organizationId: user.organizationId, userId: user.id, number, openingUsd: money(input.openingUsd).toString(), openingLbp: D(input.openingLbp).toDecimalPlaces(0).toString() },
    });
    await audit({ organizationId: user.organizationId, userId: user.id, action: "shift.open", entity: "CashShift", entityId: s.id }, tx);
    return { id: s.id };
  });
});

async function loadShift(id: string, user: { id: string; organizationId: string; role: "ADMIN" | "MANAGER" | "CASHIER" }) {
  const s = await db.cashShift.findFirst({ where: { id, organizationId: user.organizationId } });
  if (!s) throw new BusinessError("NOT_FOUND");
  if (s.userId !== user.id && !can(user.role, "shifts.manage")) throw new BusinessError("FORBIDDEN");
  if (s.closedAt) throw new BusinessError("SHIFT_CLOSED");
  return s;
}

export const addCashMovement = orgAction(
  "pos.sell",
  z.object({ shiftId: z.string(), direction: z.enum(["IN", "OUT"]), currency: z.enum(["USD", "LBP"]), amount: amt, reason: z.string().trim().min(2).max(200) }),
  async (input, user) => {
    await loadShift(input.shiftId, user);
    if (D(input.amount).lte(0)) throw new BusinessError("QTY_MUST_BE_POSITIVE");
    const m = await db.cashMovement.create({
      data: { organizationId: user.organizationId, shiftId: input.shiftId, direction: input.direction, currency: input.currency, amount: input.amount, reason: input.reason, userId: user.id },
    });
    await audit({ organizationId: user.organizationId, userId: user.id, action: "shift.cash_" + input.direction.toLowerCase(), entity: "CashShift", entityId: input.shiftId, details: { currency: input.currency, amount: input.amount, reason: input.reason } });
    return { id: m.id };
  },
);

export const closeShift = orgAction(
  "pos.sell",
  z.object({ shiftId: z.string(), countedUsd: amt, countedLbp: amt, note: z.string().max(500).nullish() }),
  async (input, user) => {
    await loadShift(input.shiftId, user);
    const exp = await shiftExpectedCash(input.shiftId);
    const s = await db.cashShift.update({
      where: { id: input.shiftId },
      data: {
        closedAt: new Date(), expectedUsd: exp.usd.toString(), expectedLbp: exp.lbp.toString(),
        countedUsd: money(input.countedUsd).toString(), countedLbp: D(input.countedLbp).toDecimalPlaces(0).toString(), closingNote: input.note ?? null,
      },
    });
    await audit({ organizationId: user.organizationId, userId: user.id, action: "shift.close", entity: "CashShift", entityId: s.id,
      details: { varianceUsd: D(input.countedUsd).minus(exp.usd).toString(), varianceLbp: D(input.countedLbp).minus(exp.lbp).toString() } });
    return { id: s.id };
  },
);
