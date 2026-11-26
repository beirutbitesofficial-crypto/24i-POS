import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrgUser, AuthError } from "@/lib/auth";
import { askAssistant, AssistantNotConfigured, MODEL } from "@/server/services/assistant";

export const maxDuration = 120;

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) })).min(1).max(20),
});

// Simple per-user guard against runaway usage (per server instance)
const WINDOW_MS = 60 * 60_000;
const MAX_PER_WINDOW = 40;
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  try {
    const user = await requireOrgUser("reports.view");
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

    const now = Date.now();
    const recent = (hits.get(user.id) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_PER_WINDOW) return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 });
    hits.set(user.id, [...recent, now]);

    const r = await askAssistant(user, parsed.data.messages);
    void db.auditLog.create({
      data: {
        organizationId: user.organizationId, userId: user.id, action: "assistant.ask",
        details: { question: parsed.data.messages.at(-1)!.content.slice(0, 300), model: MODEL, inputTokens: r.usage.input_tokens, outputTokens: r.usage.output_tokens },
      },
    }).catch(() => undefined);
    if (r.refused) return NextResponse.json({ error: "REFUSED" }, { status: 422 });
    return NextResponse.json({ text: r.text });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof AssistantNotConfigured) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
    if (e instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "NOT_CONFIGURED" }, { status: 503 });
    if (e instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "BUSY" }, { status: 503 });
    if (e instanceof Anthropic.APIError) { console.error("assistant api error", e.status, e.message); return NextResponse.json({ error: "AI_ERROR" }, { status: 502 }); }
    console.error("assistant error", e);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
