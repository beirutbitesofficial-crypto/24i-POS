"use client";
import { useState } from "react";
import { Plus, Pencil, AlertTriangle, Scale, Package as PackageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Field, Select, Switch, Textarea } from "@/components/ui/input";
import { Card, CardHeader, Badge, EmptyState } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/client";
import { useAction } from "@/hooks/use-action";
import { saveVariant } from "@/server/actions/catalog";
import { formatUsd } from "@/lib/money";

type Opt = { id: string; name: string };
type UnitOpt = Opt & { kind: string; code: string };

export interface VariantRow {
  id: string; brandId: string | null; varietyId: string | null; labelAr: string | null; labelEn: string | null; sku: string;
  sellMode: "WEIGHT" | "UNIT"; packaging: "LOOSE" | "PACKED"; unitId: string; packageSize: string | null; packageUnitId: string | null;
  price: string | null; wholesalePrice: string | null; cost: string | null; supplierId: string | null; minStock: string | null; reorderQty: string | null;
  trackExpiry: boolean; active: boolean; barcodes: string[]; stockQty: string; unitCode: string;
  brandName: string | null; varietyName: string | null;
}

type Form = Omit<VariantRow, "id" | "stockQty" | "unitCode" | "brandName" | "varietyName"> & { id?: string; barcodesText: string };

export function VariantsManager({
  productId, variants, brands, varieties, units, suppliers, canCost,
}: {
  productId: string; variants: VariantRow[]; brands: Opt[]; varieties: Opt[]; units: UnitOpt[]; suppliers: Opt[]; canCost: boolean;
}) {
  const { t, locale } = useI18n();
  const [form, setForm] = useState<Form | null>(null);
  const save = useAction(saveVariant, { success: t("common.saved") });
  const kg = units.find((u) => u.code === "kg");
  const blank = (): Form => ({
    brandId: null, varietyId: null, labelAr: null, labelEn: null, sku: "", sellMode: "UNIT", packaging: "PACKED",
    unitId: units.find((u) => u.kind === "COUNT")?.id ?? units[0]?.id ?? "", packageSize: null, packageUnitId: null,
    price: null, wholesalePrice: null, cost: null, supplierId: null, minStock: null, reorderQty: null,
    trackExpiry: false, active: true, barcodes: [], barcodesText: "",
  });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const weightUnits = units.filter((u) => u.kind === "WEIGHT");

  return (
    <Card>
      <CardHeader title={t("cat.variants")} description={t("cat.variantsCount", { count: variants.length })}
        action={<Button size="sm" onClick={() => setForm(blank())}><Plus className="size-4" />{t("cat.addVariant")}</Button>} />
      {variants.length === 0 ? (
        <EmptyState icon={<PackageIcon className="size-6" />} title={t("cat.noVariants")} description={t("cat.noVariantsHint")}
          action={<Button variant="gold" onClick={() => setForm(blank())}><Plus className="size-4" />{t("cat.addVariant")}</Button>} />
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>{t("cat.variant")}</TH><TH>{t("cat.sku")}</TH><TH>{t("cat.sellMode")}</TH><TH>{t("common.price")}</TH>
              {canCost && <TH>{t("common.cost")}</TH>}<TH>{t("cat.stock")}</TH><TH>{t("common.status")}</TH><TH />
            </tr>
          </THead>
          <tbody>
            {variants.map((v) => {
              const label = [v.brandName, v.varietyName, locale === "ar" ? v.labelAr || v.labelEn : v.labelEn || v.labelAr].filter(Boolean).join(" · ") || "—";
              const size = v.packageSize ? `${Number(v.packageSize)} ${units.find((u) => u.id === v.packageUnitId)?.code ?? ""}` : null;
              return (
                <TR key={v.id}>
                  <TD>
                    <div className="font-medium">{label}</div>
                    <div className="text-xs text-muted">{t(`cat.packaging.${v.packaging}`)}{size && ` · ${size}`}{v.barcodes.length > 0 && <span className="num"> · {v.barcodes.join(", ")}</span>}</div>
                  </TD>
                  <TD className="num text-xs">{v.sku}</TD>
                  <TD>
                    <span className="inline-flex items-center gap-1 text-sm">
                      {v.sellMode === "WEIGHT" ? <Scale className="size-3.5 text-gold-600" /> : <PackageIcon className="size-3.5 text-gold-600" />}
                      {v.unitCode}
                    </span>
                  </TD>
                  <TD className="num">{v.price ? <>{formatUsd(v.price)}{v.sellMode === "WEIGHT" && <span className="text-xs text-muted">{t("pos.perKg")}</span>}</> : <Badge tone="warn"><AlertTriangle className="size-3" />{t("cat.noPrice")}</Badge>}</TD>
                  {canCost && <TD className="num text-muted">{v.cost ? formatUsd(v.cost) : "—"}</TD>}
                  <TD className="num">
                    <span className={v.minStock && Number(v.stockQty) <= Number(v.minStock) ? "font-semibold text-danger" : ""}>{Number(v.stockQty).toString()}</span>
                    <span className="text-xs text-muted"> {v.unitCode}</span>
                  </TD>
                  <TD><Badge tone={v.active ? "success" : "neutral"}>{v.active ? t("common.active") : t("common.inactive")}</Badge></TD>
                  <TD className="text-end">
                    <Button size="icon-sm" variant="ghost" onClick={() => setForm({ ...v, barcodesText: v.barcodes.join("\n") })}><Pencil className="size-4" /></Button>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)} size="lg" title={form?.id ? t("cat.editVariant") : t("cat.addVariant")}
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>{t("common.cancel")}</Button><Button form="variant-form" type="submit" loading={save.pending}>{t("common.save")}</Button></>}>
        {form && (
          <form id="variant-form" className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
            e.preventDefault();
            const barcodes = form.barcodesText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
            const { barcodesText, ...rest } = form;
            void barcodesText;
            if (await save.run({ ...rest, productId, barcodes, ...(canCost ? {} : { cost: undefined }) })) setForm(null);
          }}>
            <Field label={t("cat.sellMode")}>
              <div className="grid grid-cols-2 gap-2">
                {(["WEIGHT", "UNIT"] as const).map((m) => (
                  <button key={m} type="button"
                    onClick={() => setForm((f) => f && ({ ...f, sellMode: m, packaging: m === "WEIGHT" ? "LOOSE" : "PACKED", unitId: m === "WEIGHT" ? kg?.id ?? f.unitId : units.find((u) => u.kind === "COUNT")?.id ?? f.unitId }))}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${form.sellMode === m ? "border-gold-400 bg-gold-50 font-medium text-gold-700" : "border-ivory-300 hover:bg-ivory-200"}`}>
                    {m === "WEIGHT" ? <Scale className="size-4" /> : <PackageIcon className="size-4" />}{t(`cat.sellMode.${m}`)}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t("cat.packaging")}>
              <Select value={form.packaging} onChange={(e) => set("packaging", e.target.value as Form["packaging"])}>
                <option value="LOOSE">{t("cat.packaging.LOOSE")}</option>
                <option value="PACKED">{t("cat.packaging.PACKED")}</option>
              </Select>
            </Field>
            <Field label={t("cat.brand")}>
              <Select value={form.brandId ?? ""} onChange={(e) => set("brandId", e.target.value || null)}>
                <option value="">{t("common.none")}</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label={t("cat.variety")}>
              <Select value={form.varietyId ?? ""} onChange={(e) => set("varietyId", e.target.value || null)}>
                <option value="">{t("common.none")}</option>
                {varieties.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
            <Field label={t("cat.unit")}>
              <Select value={form.unitId} onChange={(e) => set("unitId", e.target.value)}>
                {(form.sellMode === "WEIGHT" ? weightUnits : units).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("cat.packageSize")} hint={t("common.optional")}>
                <Input type="text" inputMode="decimal" value={form.packageSize ?? ""} onChange={(e) => set("packageSize", e.target.value || null)} />
              </Field>
              <Field label={t("cat.packageUnit")}>
                <Select value={form.packageUnitId ?? ""} onChange={(e) => set("packageUnitId", e.target.value || null)}>
                  <option value="">—</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
                </Select>
              </Field>
            </div>
            <Field label={t("cat.labelAr")} hint={t("cat.labelHint")}><Input dir="rtl" value={form.labelAr ?? ""} onChange={(e) => set("labelAr", e.target.value || null)} /></Field>
            <Field label={t("cat.labelEn")}><Input dir="ltr" value={form.labelEn ?? ""} onChange={(e) => set("labelEn", e.target.value || null)} /></Field>

            <div className="grid gap-4 rounded-xl bg-gold-50/60 p-4 ring-1 ring-gold-100 sm:col-span-2 sm:grid-cols-3">
              <Field label={form.sellMode === "WEIGHT" ? t("cat.pricePerKg") : t("cat.sellPrice")} error={save.fields.price}>
                <Input inputMode="decimal" dir="ltr" placeholder="$" value={form.price ?? ""} onChange={(e) => set("price", e.target.value || null)} className="text-base font-semibold" />
              </Field>
              <Field label={t("cat.wholesale")} hint={t("common.optional")} error={save.fields.wholesalePrice}>
                <Input inputMode="decimal" dir="ltr" placeholder="$" value={form.wholesalePrice ?? ""} onChange={(e) => set("wholesalePrice", e.target.value || null)} />
              </Field>
              {canCost && (
                <Field label={t("cat.costPrice")} error={save.fields.cost}>
                  <Input inputMode="decimal" dir="ltr" placeholder="$" value={form.cost ?? ""} onChange={(e) => set("cost", e.target.value || null)} />
                </Field>
              )}
            </div>

            <Field label={t("cat.sku")} hint={form.id ? undefined : t("common.optional")}><Input dir="ltr" value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="auto" /></Field>
            <Field label={t("cat.supplier")}>
              <Select value={form.supplierId ?? ""} onChange={(e) => set("supplierId", e.target.value || null)}>
                <option value="">{t("common.none")}</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label={t("cat.minStock")}><Input inputMode="decimal" dir="ltr" value={form.minStock ?? ""} onChange={(e) => set("minStock", e.target.value || null)} /></Field>
            <Field label={t("cat.reorderQty")}><Input inputMode="decimal" dir="ltr" value={form.reorderQty ?? ""} onChange={(e) => set("reorderQty", e.target.value || null)} /></Field>
            <Field label={t("cat.barcodes")} hint={t("cat.barcodesHint")} className="sm:col-span-2" error={save.fields.barcodes}>
              <Textarea dir="ltr" className="num min-h-16" value={form.barcodesText} onChange={(e) => set("barcodesText", e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-6 sm:col-span-2">
              <Switch checked={form.trackExpiry} onChange={(v) => set("trackExpiry", v)} label={t("cat.trackExpiry")} />
              <Switch checked={form.active} onChange={(v) => set("active", v)} label={t("common.active")} />
            </div>
          </form>
        )}
      </Dialog>
    </Card>
  );
}
