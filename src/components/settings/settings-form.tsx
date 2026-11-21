"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, X, Printer, Store, Coins, Receipt, ShieldCheck, Percent } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field, Select, Switch, Textarea } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/client";
import { useAction } from "@/hooks/use-action";
import { saveSettings, uploadLogo } from "@/server/actions/settings";
import { formatLbp, usdToLbp } from "@/lib/money";

export interface SettingsData {
  storeName: string; storeNameAr: string | null; address: string | null; phone: string | null;
  exchangeRate: string; lbpRounding: number; lbpRoundingMode: "NEAREST" | "UP" | "DOWN";
  taxEnabled: boolean; taxRate: string; taxInclusive: boolean; taxLabel: string;
  receiptHeader: string | null; receiptFooter: string | null; receiptShowLogo: boolean; receiptShowLbp: boolean;
  printMode: "BROWSER" | "BRIDGE"; printBridgeUrl: string | null; paperWidthMm: number; autoPrint: boolean;
  allowNegativeStock: boolean; cashierMaxDiscount: string; requirePinForVoid: boolean; expiryAlertDays: number; defaultLanguage: "ar" | "en";
}

export function SettingsForm({ initial, logoUrl, rateUpdated }: { initial: SettingsData; logoUrl: string | null; rateUpdated: string }) {
  const { t, te, locale } = useI18n();
  const router = useRouter();
  const [f, setF] = useState(initial);
  const a = useAction(saveSettings, { success: t("common.saved") });
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof SettingsData>(k: K, v: SettingsData[K]) => setF((s) => ({ ...s, [k]: v }));
  const logo = async (fd: FormData) => {
    const r = await uploadLogo(fd);
    if (!r.ok) toast.error(te(r.error)); else router.refresh();
  };
  const sample = f.exchangeRate && Number(f.exchangeRate) > 0 ? formatLbp(usdToLbp("9.30", f.exchangeRate, f.lbpRounding || 1, f.lbpRoundingMode), locale) : "—";

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); void a.run({ ...f, lbpRounding: Number(f.lbpRounding), paperWidthMm: Number(f.paperWidthMm), expiryAlertDays: Number(f.expiryAlertDays) }); }}>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Store className="size-4 text-gold-600" />{t("set.store")}</span>} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center gap-4 sm:col-span-2">
              <div className="grid size-20 place-items-center overflow-hidden rounded-2xl bg-ivory-200 ring-1 ring-ivory-300">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {logoUrl ? <img src={logoUrl} alt="" className="size-full object-cover" /> : <Store className="size-7 text-ink-300" />}
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) { const fd = new FormData(); fd.set("file", file); void logo(fd); } e.target.value = ""; }} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="size-4" />{t("set.logo")}</Button>
              {logoUrl && <Button type="button" variant="ghost" size="sm" onClick={() => { const fd = new FormData(); fd.set("remove", "1"); void logo(fd); }}><X className="size-4" /></Button>}
            </div>
            <Field label={t("set.storeName")} error={a.fields.storeName}><Input value={f.storeName} onChange={(e) => set("storeName", e.target.value)} /></Field>
            <Field label={t("set.storeNameAr")}><Input dir="rtl" value={f.storeNameAr ?? ""} onChange={(e) => set("storeNameAr", e.target.value)} /></Field>
            <Field label={t("common.address")} className="sm:col-span-2"><Input value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
            <Field label={t("common.phone")}><Input dir="ltr" value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label={t("set.defaultLanguage")}>
              <Select value={f.defaultLanguage} onChange={(e) => set("defaultLanguage", e.target.value as "ar" | "en")}><option value="ar">العربية</option><option value="en">English</option></Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Coins className="size-4 text-gold-600" />{t("set.currency")}</span>} description={t("set.baseCurrency")} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label={t("set.rate")} hint={t("set.rateUpdated", { date: rateUpdated })} className="sm:col-span-2" error={a.fields.exchangeRate}>
              <Input dir="ltr" inputMode="decimal" className="h-12 text-lg font-semibold" value={f.exchangeRate} onChange={(e) => set("exchangeRate", e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
            <Field label={t("set.lbpRounding")}>
              <Select value={String(f.lbpRounding)} onChange={(e) => set("lbpRounding", Number(e.target.value))}>
                {[1, 500, 1000, 5000, 10000].map((v) => <option key={v} value={v}>{v.toLocaleString("en")} LBP</option>)}
              </Select>
            </Field>
            <Field label={t("set.lbpRoundingMode")}>
              <Select value={f.lbpRoundingMode} onChange={(e) => set("lbpRoundingMode", e.target.value as SettingsData["lbpRoundingMode"])}>
                {(["NEAREST", "UP", "DOWN"] as const).map((m) => <option key={m} value={m}>{t(`set.mode.${m}`)}</option>)}
              </Select>
            </Field>
            <p className="num text-xs text-muted sm:col-span-2">$9.30 → {sample}</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Percent className="size-4 text-gold-600" />{t("set.tax")}</span>} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Switch checked={f.taxEnabled} onChange={(v) => set("taxEnabled", v)} label={t("set.taxEnabled")} /></div>
            <Field label={t("set.taxRate")}><Input dir="ltr" inputMode="decimal" disabled={!f.taxEnabled} value={f.taxRate} onChange={(e) => set("taxRate", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
            <Field label={t("set.taxLabel")}><Input disabled={!f.taxEnabled} value={f.taxLabel} onChange={(e) => set("taxLabel", e.target.value)} /></Field>
            <div className="sm:col-span-2"><Switch disabled={!f.taxEnabled} checked={f.taxInclusive} onChange={(v) => set("taxInclusive", v)} label={t("set.taxInclusive")} /></div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><ShieldCheck className="size-4 text-gold-600" />{t("set.pos")}</span>} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label={t("set.cashierMaxDiscount")}><Input dir="ltr" inputMode="decimal" value={f.cashierMaxDiscount} onChange={(e) => set("cashierMaxDiscount", e.target.value.replace(/[^\d.]/g, ""))} /></Field>
            <Field label={t("set.expiryDays")}><Input dir="ltr" inputMode="numeric" value={String(f.expiryAlertDays)} onChange={(e) => set("expiryAlertDays", Number(e.target.value.replace(/\D/g, "") || 0))} /></Field>
            <div className="space-y-3 sm:col-span-2">
              <Switch checked={f.requirePinForVoid} onChange={(v) => set("requirePinForVoid", v)} label={t("set.requirePinVoid")} />
              <Switch checked={f.allowNegativeStock} onChange={(v) => set("allowNegativeStock", v)} label={t("set.allowNegative")} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Receipt className="size-4 text-gold-600" />{t("set.receipt")}</span>} />
          <CardBody className="grid gap-4">
            <Field label={t("set.receiptHeader")}><Input value={f.receiptHeader ?? ""} onChange={(e) => set("receiptHeader", e.target.value)} /></Field>
            <Field label={t("set.receiptFooter")}><Textarea value={f.receiptFooter ?? ""} onChange={(e) => set("receiptFooter", e.target.value)} className="min-h-14" /></Field>
            <div className="flex flex-wrap gap-6">
              <Switch checked={f.receiptShowLogo} onChange={(v) => set("receiptShowLogo", v)} label={t("set.receiptShowLogo")} />
              <Switch checked={f.receiptShowLbp} onChange={(v) => set("receiptShowLbp", v)} label={t("set.receiptShowLbp")} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><Printer className="size-4 text-gold-600" />{t("set.printer")}</span>} />
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Field label={t("set.printMode")} className="sm:col-span-2">
              <Select value={f.printMode} onChange={(e) => set("printMode", e.target.value as SettingsData["printMode"])}>
                <option value="BROWSER">{t("set.printMode.BROWSER")}</option>
                <option value="BRIDGE">{t("set.printMode.BRIDGE")}</option>
              </Select>
            </Field>
            {f.printMode === "BRIDGE" && <Field label={t("set.bridgeUrl")} className="sm:col-span-2"><Input dir="ltr" value={f.printBridgeUrl ?? ""} onChange={(e) => set("printBridgeUrl", e.target.value)} /></Field>}
            <Field label={t("set.paperWidth")}>
              <Select value={String(f.paperWidthMm)} onChange={(e) => set("paperWidthMm", Number(e.target.value))}><option value="80">80 mm</option><option value="58">58 mm</option></Select>
            </Field>
            <div className="flex items-end pb-2"><Switch checked={f.autoPrint} onChange={(v) => set("autoPrint", v)} label={t("set.autoPrint")} /></div>
          </CardBody>
        </Card>
      </div>
      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" variant="gold" size="lg" loading={a.pending} className="shadow-lg">{t("common.save")}</Button>
      </div>
    </form>
  );
}
