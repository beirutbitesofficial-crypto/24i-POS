import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { BrandMark } from "@/components/shell/brand-mark";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const { t } = await getI18n();
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-ink-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_10%,rgb(184_150_78/0.25),transparent_55%),radial-gradient(ellipse_at_90%_90%,rgb(184_150_78/0.12),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <BrandMark light />
          <div className="max-w-md">
            <div className="mb-6 h-px w-16 bg-gold-400" />
            <h2 className="font-display text-4xl leading-tight text-ivory-50">{t("app.tagline")}</h2>
            <p className="mt-4 text-ink-300">{t("auth.contact")}</p>
          </div>
          <div className="text-xs text-ink-400" dir="ltr">© {new Date().getFullYear()} 24i</div>
        </div>
      </section>
      <section className="flex flex-col">
        <div className="flex justify-between p-5">
          <div className="lg:hidden"><BrandMark /></div>
          <LanguageSwitch className="ms-auto" />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm">
            <h1 className="font-display text-3xl font-semibold text-ink-900">{t("auth.title")}</h1>
            <p className="mt-1 mb-8 text-sm text-muted">{t("auth.subtitle")}</p>
            <LoginForm />
            <p className="mt-8 text-xs leading-relaxed text-muted lg:hidden">{t("auth.contact")}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
