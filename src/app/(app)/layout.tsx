import { requirePageOrgUser } from "@/lib/auth";
import { ROLE_PERMISSIONS } from "@/lib/permissions";
import { getI18n } from "@/lib/i18n/server";
import { getSettings, mediaUrl } from "@/server/context";
import { Sidebar } from "@/components/shell/sidebar";
import { UserMenu } from "@/components/shell/user-menu";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { InstallAppButton } from "@/components/shell/install-app";
import { formatLbp } from "@/lib/money";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageOrgUser();
  const { locale } = await getI18n();
  const s = await getSettings(user.organizationId);
  const storeName = (locale === "ar" ? s.storeNameAr || s.storeName : s.storeName) ?? "";
  return (
    <div className="min-h-dvh">
      <Sidebar perms={[...ROLE_PERMISSIONS[user.role]]} modules={user.modules} storeName={storeName} logoUrl={mediaUrl(s.logoId)} />
      <div className="lg:ps-64">
        <header className="no-print sticky top-0 z-20 flex h-16 items-center justify-end gap-2 border-b border-ivory-300/80 bg-ivory-100/85 px-4 backdrop-blur sm:px-8">
          <div className="me-auto hidden ps-12 text-xs text-muted sm:block lg:ps-0">
            <span className="num rounded-full border border-ivory-300 bg-ivory-50 px-3 py-1">1 USD = {formatLbp(s.exchangeRate, locale)}</span>
          </div>
          <InstallAppButton />
          <LanguageSwitch />
          <UserMenu name={user.name} role={user.role} />
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
