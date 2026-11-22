import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { BUILD } from "@/lib/build-info";

export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    const raw = Date.now() - started;
    // Also exercise a normal model query with relations (same path as login)
    const t2 = Date.now();
    await db.organization.findFirst({ select: { id: true, settings: { select: { defaultLanguage: true } } } });
    return NextResponse.json({ ok: true, build: BUILD, dbMs: raw, modelMs: Date.now() - t2 });
  } catch (e) {
    return NextResponse.json({ ok: false, build: BUILD, error: e instanceof Error ? e.message.slice(0, 300) : "unknown" }, { status: 503 });
  }
}
