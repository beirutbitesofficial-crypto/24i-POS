import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { BrandMark } from "@/components/shell/brand-mark";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { ThemeSwitch } from "@/components/shell/theme-switch";
import { InstallAppButton } from "@/components/shell/install-app";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const { t } = await getI18n();
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="lux-dark relative hidden overflow-hidden lg:block">
        <div className="relative flex h-full flex-col justify-between p-12">
          <BrandMark light />
          <div className="max-w-md">
            <div className="mb-6 h-1 w-12 rounded-full bg-gradient-to-r from-gold-300 to-gold-500" />
            <h2 className="font-display text-5xl leading-[1.05] font-bold tracking-tight text-white">{t("app.tagline")}</h2>
            <p className="mt-4 text-ink-300">{t("auth.contact")}</p>
          </div>
          <div className="text-xs text-ink-400" dir="ltr">© {new Date().getFullYear()} 24i</div>
        </div>
      </section>
      <section className="flex flex-col">
        <div className="flex justify-between p-5">
          <div className="lg:hidden"><BrandMark /></div>
          <div className="ms-auto flex items-center gap-1"><InstallAppButton /><ThemeSwitch /><LanguageSwitch /></div>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-sm">
            <h1 className="font-display text-3xl font-semibold text-fg">{t("auth.title")}</h1>
            <p className="mt-1 mb-8 text-sm text-muted">{t("auth.subtitle")}</p>
            <LoginForm />
            <p className="mt-8 text-xs leading-relaxed text-muted lg:hidden">{t("auth.contact")}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
