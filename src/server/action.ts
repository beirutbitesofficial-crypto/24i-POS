import "server-only";
import { z, ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AuthError, requireOrgUser, type OrgUser } from "@/lib/auth";
import type { Permission } from "@/lib/permissions";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string; fields?: Record<string, string> };

export class BusinessError extends Error {
  constructor(public code: string, public params?: Record<string, string | number>) {
    super(code);
  }
}

export function toActionError(e: unknown): { ok: false; error: string; fields?: Record<string, string> } {
  if (e instanceof BusinessError) {
    const p = e.params ? "|" + JSON.stringify(e.params) : "";
    return { ok: false, error: e.code + p };
  }
  if (e instanceof AuthError) return { ok: false, error: e.message };
  if (e instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of e.issues) fields[issue.path.join(".")] = issue.message;
    return { ok: false, error: "VALIDATION", fields };
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") return { ok: false, error: "DUPLICATE" };
    if (e.code === "P2025") return { ok: false, error: "NOT_FOUND" };
  }
  console.error(e);
  return { ok: false, error: "SERVER_ERROR" };
}

/**
 * Wraps a server action: authenticates, enforces the permission on the server,
 * validates input with Zod, and converts errors into a serialisable result.
 */
export function orgAction<S extends z.ZodTypeAny, T>(
  perm: Permission | null,
  schema: S,
  fn: (input: z.infer<S>, user: OrgUser) => Promise<T>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<T>> => {
    try {
      const user = await requireOrgUser(perm ?? undefined);
      const input = schema.parse(raw);
      const data = await fn(input, user);
      return { ok: true, data };
    } catch (e) {
      return toActionError(e);
    }
  };
}
