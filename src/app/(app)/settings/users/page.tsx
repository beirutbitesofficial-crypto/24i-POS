import { db } from "@/lib/db";
import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui/card";
import { UsersManager } from "@/components/settings/users-manager";
import { saveUser } from "@/server/actions/settings";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const user = await requirePageOrgUser("users.manage");
  const { t } = await getI18n();
  const users = await db.user.findMany({ where: { organizationId: user.organizationId }, orderBy: [{ active: "desc" }, { role: "asc" }, { name: "asc" }] });
  return (
    <>
      <PageHeader eyebrow={t("nav.settings")} title={t("users.title")} />
      <UsersManager save={saveUser}
        users={users.map((u) => ({ id: u.id, name: u.name, username: u.username, role: u.role, active: u.active, hasPin: !!u.pinHash, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))} />
    </>
  );
}
