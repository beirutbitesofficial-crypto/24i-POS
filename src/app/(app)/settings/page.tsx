import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { getSettings, mediaUrl } from "@/server/context";
import { PageHeader } from "@/components/ui/card";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requirePageOrgUser("settings.manage");
  const { t, locale } = await getI18n();
  const s = await getSettings(user.organizationId);
  return (
    <>
      <PageHeader eyebrow={t("nav.settings")} title={t("set.title")} />
      <SettingsForm
        logoUrl={mediaUrl(s.logoId)}
        receiptLogoUrl={mediaUrl(s.receiptLogoId)}
        rateUpdated={s.exchangeRateUpdated.toLocaleString(locale === "ar" ? "ar-LB" : "en-GB", { dateStyle: "medium", timeStyle: "short" })}
        initial={{
          storeName: s.storeName, storeNameAr: s.storeNameAr, address: s.address, phone: s.phone,
          exchangeRate: s.exchangeRate.toString(), lbpRounding: s.lbpRounding, lbpRoundingMode: s.lbpRoundingMode as "NEAREST",
          taxEnabled: s.taxEnabled, taxRate: s.taxRate.toString(), taxInclusive: s.taxInclusive, taxLabel: s.taxLabel,
          receiptHeader: s.receiptHeader, receiptFooter: s.receiptFooter, receiptShowLogo: s.receiptShowLogo, receiptShowLbp: s.receiptShowLbp,
          printMode: s.printMode as "BROWSER", printBridgeUrl: s.printBridgeUrl, paperWidthMm: s.paperWidthMm, autoPrint: s.autoPrint,
          allowNegativeStock: s.allowNegativeStock, cashierMaxDiscount: s.cashierMaxDiscount.toString(), requirePinForVoid: s.requirePinForVoid,
          expiryAlertDays: s.expiryAlertDays, defaultLanguage: s.defaultLanguage === "en" ? "en" : "ar",
        }}
      />
    </>
  );
}
