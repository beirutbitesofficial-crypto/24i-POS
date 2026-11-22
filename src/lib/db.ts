import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Keep each app process's connection pool small. Hosts like Hostinger may run several
 * Node processes (and briefly two generations during a redeploy); with Supabase's pooler
 * the total must stay under the plan's client limit. Override with DB_POOL_SIZE if needed.
 */
function datasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", process.env.DB_POOL_SIZE ?? "3");
    if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "30");
    // Supabase transaction pooler (port 6543) needs pgbouncer mode (no prepared statements)
    if (u.port === "6543" && !u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
    return u.toString();
  } catch {
    return raw;
  }
}

function create() {
  const client = new PrismaClient({
    datasourceUrl: datasourceUrl(),
    log: process.env.DEBUG_QUERIES === "1"
      ? [{ emit: "event", level: "query" }, "warn", "error"]
      : process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  if (process.env.DEBUG_QUERIES === "1") {
    // Diagnostic: one line per SQL round-trip (used to count queries per page)
    (client as unknown as { $on: (e: "query", cb: (ev: { duration: number; query: string }) => void) => void })
      .$on("query", (e) => console.log(`[q] t=${Date.now() % 100000} ${e.duration}ms ${e.query.slice(0, 2000).replace(/\s+/g, " ")}`));
  }
  return client;
}

export const db = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
