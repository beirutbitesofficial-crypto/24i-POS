"use client";
import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/client";
import type { ActionResult } from "@/server/action";

/**
 * Runs a server action with loading state, translated error toasts and a router refresh.
 */
export function useAction<I, O>(action: (input: I) => Promise<ActionResult<O>>, opts: { success?: string; refresh?: boolean } = {}) {
  const { te } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async (input: I): Promise<O | undefined> => {
      setBusy(true);
      setFields({});
      try {
        const res = await action(input);
        if (!res.ok) {
          if (res.fields) setFields(res.fields);
          toast.error(te(res.error));
          return undefined;
        }
        if (opts.success) toast.success(opts.success);
        if (opts.refresh !== false) startTransition(() => router.refresh());
        return res.data;
      } catch {
        toast.error(te("SERVER_ERROR"));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [action, opts.success, opts.refresh, router, te],
  );
  return { run, pending: busy || pending, fields };
}
