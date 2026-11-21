import { describe, it, expect } from "vitest";
import { can, ROLE_PERMISSIONS, PERMISSIONS } from "@/lib/permissions";

describe("role permissions", () => {
  it("cashier can only sell", () => {
    expect([...ROLE_PERMISSIONS.CASHIER]).toEqual(["pos.sell"]);
    for (const p of ["catalog.costs", "reports.financial", "reports.view", "users.manage", "settings.manage", "pos.price_override", "pos.refund", "pos.discount", "pos.void", "pos.reprint"] as const) {
      expect(can("CASHIER", p)).toBe(false);
    }
  });
  it("manager manages operations but not settings or users", () => {
    for (const p of ["catalog.manage", "inventory.manage", "suppliers.manage", "reports.financial", "pos.refund", "pos.discount"] as const) expect(can("MANAGER", p)).toBe(true);
    for (const p of ["settings.manage", "users.manage", "audit.view"] as const) expect(can("MANAGER", p)).toBe(false);
  });
  it("admin has everything", () => {
    for (const p of PERMISSIONS) expect(can("ADMIN", p)).toBe(true);
  });
});
