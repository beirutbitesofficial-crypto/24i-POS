import { requirePageOrgUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getI18n } from "@/lib/i18n/server";
import { PageHeader } from "@/components/ui/card";
import { AssistantChat } from "@/components/assistant/assistant-chat";

export const metadata = { title: "Ask 24i" };

export default async function AssistantPage() {
  const user = await requirePageOrgUser("reports.view");
  const { t } = await getI18n();
  const fin = can(user.role, "reports.financial");
  const suggestions = [
    fin ? t("ai.q.profitMonth") : t("ai.q.salesMonth"),
    t("ai.q.bestSellers"),
    t("ai.q.today"),
    t("ai.q.lowStock"),
    t("ai.q.bestDay"),
  ];
  return (
    <>
      <PageHeader eyebrow={t("nav.assistant")} title={t("ai.title")} description={t("ai.description")} />
      <AssistantChat suggestions={suggestions} />
    </>
  );
}
