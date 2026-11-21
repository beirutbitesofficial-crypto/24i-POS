import { NextResponse } from "next/server";
import { requireOrgUser, AuthError } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { buildReceipt } from "@/server/services/receipt";

/** Structured receipt for the local ESC/POS print bridge */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireOrgUser("pos.sell");
    const { id } = await params;
    const r = await buildReceipt(user, id, await getLocale());
    if (!r) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ...r, logoUrl: null, direction: (await getLocale()) === "ar" ? "rtl" : "ltr" });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
