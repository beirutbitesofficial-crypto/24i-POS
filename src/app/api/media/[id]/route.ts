import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const m = await db.media.findUnique({ where: { id } });
  // Tenants may only read their own media
  if (!m || (!user.isPlatformAdmin && m.organizationId !== user.organizationId)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(m.data), {
    headers: { "Content-Type": m.mimeType, "Cache-Control": "private, max-age=86400, immutable", "Content-Length": String(m.size), "Content-Security-Policy": "default-src 'none'", "X-Content-Type-Options": "nosniff" },
  });
}
