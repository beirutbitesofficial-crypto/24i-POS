"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowUp, Sparkles, RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; content: string; error?: boolean };

/** Render **bold** and line breaks only — answers are plain text with • bullets. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : <Fragment key={j}>{p.replace(/^#+\s*/, "")}</Fragment>))}
        </Fragment>
      ))}
    </>
  );
}

export function AssistantChat({ suggestions }: { suggestions: string[] }) {
  const { t } = useI18n();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, busy]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const history = [...turns.filter((x) => !x.error), { role: "user" as const, content: question }];
    setTurns((ts) => [...ts, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-12).map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.text) {
        const code = data.error as string | undefined;
        const msg = code === "NOT_CONFIGURED" ? t("ai.notConfigured") : code === "RATE_LIMITED" ? t("ai.rateLimited") : code === "REFUSED" ? t("ai.refused") : t("ai.error");
        setTurns((ts) => [...ts, { role: "assistant", content: msg, error: true }]);
      } else {
        setTurns((ts) => [...ts, { role: "assistant", content: data.text }]);
      }
    } catch {
      setTurns((ts) => [...ts, { role: "assistant", content: t("ai.error"), error: true }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[480px] flex-col overflow-hidden rounded-2xl border border-ivory-300 bg-ivory-50">
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {turns.length === 0 && (
          <div className="mx-auto flex max-w-xl flex-col items-center py-8 text-center animate-fade-in">
            <div className="lux-brand mb-4 flex size-14 items-center justify-center rounded-2xl text-white shadow-brand"><Sparkles className="size-7" /></div>
            <h2 className="text-xl font-bold text-fg">{t("ai.welcome")}</h2>
            <p className="mt-1 text-sm text-muted">{t("ai.welcomeSub")}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => ask(s)}
                  className="rounded-full border border-gold-200 bg-gold-50 px-4 py-2 text-sm font-medium text-gold-700 transition hover:bg-gold-100 active:scale-[0.98]">{s}</button>
              ))}
            </div>
          </div>
        )}
        {turns.map((m, i) => (
          <div key={i} className={cn("flex animate-slide-in-end", m.role === "user" ? "justify-start" : "justify-end")}>
            <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
              m.role === "user" ? "bg-ink-900 text-white" : m.error ? "border border-danger/30 bg-danger/5 text-danger" : "border border-ivory-300 bg-ivory-100 text-fg")}>
              <Rich text={m.content} />
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-end">
            <div className="flex items-center gap-2 rounded-2xl border border-ivory-300 bg-ivory-100 px-4 py-3 text-sm text-muted">
              <Sparkles className="size-4 animate-pulse text-gold-500" />{t("ai.thinking")}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="flex items-end gap-2 border-t border-ivory-300 bg-ivory-50 p-3">
        {turns.length > 0 && (
          <Button type="button" variant="ghost" size="icon" onClick={() => setTurns([])} disabled={busy} aria-label={t("ai.newChat")} title={t("ai.newChat")}>
            <RotateCcw className="size-4" />
          </Button>
        )}
        <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={2000} autoFocus
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); } }}
          placeholder={t("ai.placeholder")}
          className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-ivory-300 bg-ivory-50 px-4 py-2.5 text-sm focus:border-gold-400 focus:outline-none" />
        <Button type="submit" variant="gold" size="icon" disabled={busy || !input.trim()} aria-label={t("ai.send")}><ArrowUp className="size-5" /></Button>
      </form>
    </div>
  );
}
