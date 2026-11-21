import { redirect } from "next/navigation";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth";
import { BrandMark } from "@/components/shell/brand-mark";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { UserMenu } from "@/components/shell/user-menu";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  if (!user.isPlatformAdmin) redirect("/");
  return (
    <div className="min-h-dvh">
      <header className="flex h-16 items-center justify-between bg-ink-900 px-4 sm:px-8">
        <Link href="/platform"><BrandMark light /></Link>
        <div className="flex items-center gap-2">
          <LanguageSwitch dark />
          <UserMenu name={user.name} role="ADMIN" dark />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
