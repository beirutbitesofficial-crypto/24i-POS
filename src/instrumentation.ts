/**
 * Runs once when the Node server starts.
 * - Opens a couple of database connections up front and keeps them alive (no cold first click,
 *   and the free-tier database doesn't idle).
 * - onRequestError: records every server-side error in the audit log (action "system.error"),
 *   so production errors can be diagnosed without access to the host's console.
 */
const WARM_CONNECTIONS = 2; // stays well under the per-process pool size (see lib/db.ts)

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production") return;
  const { db } = await import("./lib/db");
  const warm = () =>
    Promise.all(Array.from({ length: WARM_CONNECTIONS }, () => db.$queryRaw`SELECT 1`.catch(() => undefined)));
  await db.$connect().catch(() => undefined);
  await warm();
  const timer = setInterval(warm, 4 * 60_000);
  timer.unref?.();
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routePath?: string; routeType?: string },
) {
  const e = err as { message?: string; digest?: string; stack?: string; name?: string };
  console.error("[request-error]", request.method, request.path, e?.message);
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { db } = await import("./lib/db");
    const { BUILD } = await import("./lib/build-info");
    await db.auditLog.create({
      data: {
        action: "system.error",
        entity: context.routeType ?? null,
        entityId: e?.digest ?? null,
        details: {
          build: BUILD,
          method: request.method,
          path: request.path.slice(0, 200),
          route: context.routePath ?? null,
          name: e?.name ?? null,
          message: (e?.message ?? String(err)).slice(0, 1500),
          stack: e?.stack?.split("\n").slice(0, 8).join("\n").slice(0, 2000) ?? null,
        },
      },
    });
  } catch {
    /* the database itself may be the problem; console.error above still records it */
  }
}
