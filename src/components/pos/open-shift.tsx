"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/client";
import { useAction } from "@/hooks/use-action";
import { openShift } from "@/server/actions/shifts";
import { BrandMark } from "@/components/shell/brand-mark";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { ThemeSwitch } from "@/components/shell/theme-switch";
import { UserMenu } from "@/components/shell/user-menu";

export function OpenShiftScreen({ storeName, userName, role, canBackOffice }: { storeName: string; userName: string; role: string; canBackOffice: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [usd, setUsd] = useState("");
  const [lbp, setLbp] = useState("");
  const a = useAction(openShift, { refresh: false });
  return (
    <div className="lux-dark flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <BrandMark light />
        <div className="flex items-center gap-2">
          {canBackOffice && <Button asChild variant="ghost" className="text-ink-300 hover:bg-ink-800 hover:text-white"><Link prefetch={false} href="/dashboard"><LayoutDashboard className="size-4" />{t("pos.backOffice")}</Link></Button>}
          <ThemeSwitch dark /><LanguageSwitch dark />
          <UserMenu name={userName} role={role} dark />
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center p-6">
        <form className="w-full max-w-md rounded-3xl bg-ivory-50 p-8 shadow-2xl"
          onSubmit={async (e) => { e.preventDefault(); if (await a.run({ openingUsd: usd || "0", openingLbp: lbp || "0" })) router.refresh(); }}>
          <div className="mb-6 grid size-14 place-items-center rounded-2xl bg-gold-50 text-gold-600 ring-1 ring-gold-100"><Wallet className="size-7" /></div>
          <div className="text-xs font-semibold tracking-[0.18em] text-gold-600 uppercase">{storeName}</div>
          <h1 className="mt-1 mb-6 font-display text-2xl font-semibold text-fg">{t("pos.shiftRequired")}</h1>
          <div className="grid gap-4">
            <Field label={t("pos.openingUsd")}><Input inputMode="decimal" dir="ltr" className="h-12 text-lg" value={usd} onChange={(e) => setUsd(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" /></Field>
            <Field label={t("pos.openingLbp")}><Input inputMode="numeric" dir="ltr" className="h-12 text-lg" value={lbp} onChange={(e) => setLbp(e.target.value.replace(/\D/g, ""))} placeholder="0" /></Field>
          </div>
          <Button type="submit" variant="gold" size="xl" className="mt-6 w-full" loading={a.pending}>{t("pos.openShift")}</Button>
        </form>
      </div>
    </div>
  );
}
