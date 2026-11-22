import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getI18n } from "@/lib/i18n/server";
import { Button } from "@/components/ui/button";

export default async function Forbidden() {
  const { t } = await getI18n();
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="text-center">
        <ShieldAlert className="mx-auto mb-4 size-12 text-gold-500" />
        <p className="mb-6 text-lg text-ink-800">{t("auth.forbidden")}</p>
        <Button asChild variant="primary"><Link prefetch={false} href="/">{t("auth.goHome")}</Link></Button>
      </div>
    </main>
  );
}
