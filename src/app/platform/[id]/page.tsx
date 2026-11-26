import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { getI18n } from "@/lib/i18n/server";
import { requirePlatformPage } from "@/lib/auth";
import { PageHeader } from "@/components/ui/card";
import { OrgSettingsCard } from "@/components/platform/org-forms";
import { UsersManager } from "@/components/settings/users-manager";
import { savePlatformUser } from "@/server/actions/platform";

export default async function PlatformOrgPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformPage();
  const { t } = await getI18n();
  const { id } = await params;
  const org = await db.organization.findUnique({ where: { id }, include: { users: { orderBy: [{ role: "asc" }, { name: "asc" }] } } });
  if (!org) notFound();
  return (
    <>
      <Link prefetch={false} href="/platform" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ArrowLeft className="size-4 rtl:rotate-180" />{t("plat.title")}</Link>
      <PageHeader eyebrow={org.slug} title={org.name} />
      <div className="space-y-8">
        <OrgSettingsCard org={{ id: org.id, name: org.name, nameAr: org.nameAr, active: org.active, modules: org.modules, notes: org.notes }} />
        <div>
          <h2 className="mb-2 text-lg font-semibold">{t("plat.users")}</h2>
          <UsersManager save={savePlatformUser as never} extra={{ organizationId: org.id }}
            users={org.users.map((u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active, hasPin: !!u.pinHash, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))} />
        </div>
      </div>
    </>
  );
}
