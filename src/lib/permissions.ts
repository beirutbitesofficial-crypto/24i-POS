import type { Role } from "@prisma/client";

export const PERMISSIONS = [
  "pos.sell",
  "pos.discount", // any discount above the cashier limit
  "pos.price_override",
  "pos.void",
  "pos.reprint",
  "pos.refund",
  "dashboard.view",
  "catalog.manage",
  "catalog.costs", // see purchase costs & margins
  "inventory.view",
  "inventory.manage",
  "suppliers.manage",
  "reports.view",
  "reports.financial",
  "shifts.manage", // view/close everyone's shifts
  "sales.view_all",
  "settings.manage",
  "users.manage",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const MANAGER: Permission[] = [
  "pos.sell", "pos.discount", "pos.price_override", "pos.void", "pos.reprint", "pos.refund",
  "dashboard.view", "catalog.manage", "catalog.costs", "inventory.view", "inventory.manage",
  "suppliers.manage", "reports.view", "reports.financial", "shifts.manage", "sales.view_all",
];

const CASHIER: Permission[] = ["pos.sell"];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(PERMISSIONS),
  MANAGER: new Set(MANAGER),
  CASHIER: new Set(CASHIER),
};

export function can(role: Role | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].has(perm);
}
