/**
 * Runs once when the Node server starts.
 * Opening a database connection costs several network round-trips (TCP + TLS + auth),
 * which is expensive when the database is in another region. So we open a small pool
 * of connections up front and keep them alive, instead of paying that cost on a user's click.
 * The periodic ping also keeps the (free-tier) database from idling.
 */
const WARM_CONNECTIONS = 2; // stays well under the per-process pool size (see lib/db.ts)

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { db } = await import("./lib/db");
  const warm = () =>
    Promise.all(Array.from({ length: WARM_CONNECTIONS }, () => db.$queryRaw`SELECT pg_sleep(0.05)`.catch(() => undefined)));
  await db.$connect().catch(() => undefined);
  await warm(); // concurrent queries force the pool to open several connections
  const timer = setInterval(warm, 4 * 60_000);
  timer.unref?.();
}
