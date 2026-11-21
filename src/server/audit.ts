import type { Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";

export async function audit(
  args: { organizationId: string | null; userId: string | null; action: string; entity?: string; entityId?: string; details?: Prisma.InputJsonValue },
  tx: Tx | typeof db = db,
) {
  await tx.auditLog.create({ data: { ...args } });
}
