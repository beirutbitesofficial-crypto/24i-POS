import { NextResponse } from "next/server";
import { requireOrgUser, AuthError } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { buildReceipt } from "@/server/services/receipt";

/** Structured receipt for the local ESC/POS print bridge */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireOrgUser("pos.sell");
    const { id } = await params;
    // ESC/POS printers lack Arabic shaping, so the bridge asks for ?lang=en
    const q = new URL(req.url).searchParams.get("lang");
    const locale = q === "en" || q === "ar" ? q : await getLocale();
    const r = await buildReceipt(user, id, locale);
    if (!r) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ ...r, logoUrl: null, direction: locale === "ar" ? "rtl" : "ltr" });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
