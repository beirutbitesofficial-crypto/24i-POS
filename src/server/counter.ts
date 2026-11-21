import type { Tx } from "@/lib/db";

/** Atomically allocate the next sequence number for an organization (row-locked upsert). */
export async function nextNumber(tx: Tx, organizationId: string, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("organizationId", "key", "value") VALUES (${organizationId}, ${key}, 1)
    ON CONFLICT ("organizationId", "key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return Number(rows[0].value);
}
