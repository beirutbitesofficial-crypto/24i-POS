"use client";
import { useActionState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { loginAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import type { DictKey } from "@/lib/i18n";

export function LoginForm() {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(loginAction, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <Field label={t("auth.username")}>
        <Input name="username" autoComplete="username" autoCapitalize="none" required dir="ltr" className="h-12 text-base" />
      </Field>
      <Field label={t("auth.password")}>
        <Input name="password" type="password" autoComplete="current-password" required dir="ltr" className="h-12 text-base" />
      </Field>
      {state?.error && (
        <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{t(`auth.${state.error}` as DictKey)}</div>
      )}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
        {pending ? t("auth.signingIn") : t("auth.signIn")}
      </Button>
    </form>
  );
}
