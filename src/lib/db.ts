import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const client = new PrismaClient({
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
