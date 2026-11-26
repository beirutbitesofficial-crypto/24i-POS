"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, ImageIcon, Check, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Field, Select, Switch, Textarea } from "@/components/ui/input";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm";
import { useI18n } from "@/lib/i18n/client";
import { useAction } from "@/hooks/use-action";
import { saveProduct, saveVariety, deleteVariety, uploadProductImage } from "@/server/actions/catalog";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string };

export function NewProductButton({ categories }: { categories: Opt[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ categoryId: categories[0]?.id ?? "", nameAr: "", nameEn: "" });
  const a = useAction(saveProduct, { refresh: false });
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="size-4" />{t("cat.newProduct")}</Button>
      <Dialog open={open} onOpenChange={setOpen} title={t("cat.newProduct")}
        footer={<>
          <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button form="new-product" type="submit" loading={a.pending}>{t("common.create")}</Button>
        </>}>
        <form id="new-product" className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const r = await a.run({ ...f, brandIds: [] });
          if (r) router.push(`/catalog/products/${r.id}`);
        }}>
          <Field label={t("cat.category")}>
            <Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} required>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label={t("common.nameAr")}><Input dir="rtl" required value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} /></Field>
          <Field label={t("common.nameEn")}><Input dir="ltr" required value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} /></Field>
        </form>
      </Dialog>
    </>
  );
}

export interface ProductData {
  id: string; categoryId: string; nameAr: string; nameEn: string; description: string | null;
  taxable: boolean; active: boolean; setupNote: string | null; brandIds: string[]; imageUrl: string | null;
}

export function ProductGeneralForm({ product, categories, brands }: { product: ProductData; categories: Opt[]; brands: Opt[] }) {
  const { t } = useI18n();
  const [f, setF] = useState(product);
  const a = useAction(saveProduct, { success: t("common.saved") });
  const toggleBrand = (id: string) => setF((p) => ({ ...p, brandIds: p.brandIds.includes(id) ? p.brandIds.filter((b) => b !== id) : [...p.brandIds, id] }));
  return (
    <Card>
      <CardHeader title={t("common.details")} action={<Button size="sm" loading={a.pending} onClick={() => a.run(f)}>{t("common.save")}</Button>} />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <Field label={t("common.nameAr")} error={a.fields.nameAr}><Input dir="rtl" value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} /></Field>
        <Field label={t("common.nameEn")} error={a.fields.nameEn}><Input dir="ltr" value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} /></Field>
        <Field label={t("cat.category")}>
          <Select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <div className="flex items-end gap-6 pb-2">
          <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label={t("common.active")} />
          <Switch checked={f.taxable} onChange={(v) => setF({ ...f, taxable: v })} label={t("cat.taxable")} />
        </div>
        <Field label={t("common.description")} className="sm:col-span-2">
          <Textarea value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <div className="mb-1.5 text-xs font-semibold text-fg-2">{t("cat.availableBrands")}</div>
          <p className="mb-3 text-xs text-muted">{t("cat.availableBrandsHint")}</p>
          <div className="flex flex-wrap gap-2">
            {brands.map((b) => {
              const on = f.brandIds.includes(b.id);
              return (
                <button key={b.id} type="button" onClick={() => toggleBrand(b.id)}
                  className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition",
                    on ? "border-gold-400 bg-gold-50 text-gold-700" : "border-ivory-300 bg-ivory-50 text-fg-2 hover:bg-ivory-200")}>
                  {on && <Check className="size-3.5" />}{b.name}
                </button>
              );
            })}
          </div>
        </div>
        <Field label={t("cat.setupNote")} className="sm:col-span-2">
          <Textarea value={f.setupNote ?? ""} onChange={(e) => setF({ ...f, setupNote: e.target.value })} className="min-h-14" />
        </Field>
      </CardBody>
    </Card>
  );
}

export function ProductImage({ productId, imageUrl }: { productId: string; imageUrl: string | null }) {
  const { t, te } = useI18n();
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const send = async (fd: FormData) => {
    setBusy(true);
    fd.set("productId", productId);
    const r = await uploadProductImage(fd);
    setBusy(false);
    if (!r.ok) toast.error(te(r.error)); else router.refresh();
  };
  return (
    <Card>
      <CardHeader title={t("common.image")} />
      <CardBody>
        <div className="mb-3 grid aspect-square w-full place-items-center overflow-hidden rounded-xl bg-ivory-200 ring-1 ring-ivory-300">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {imageUrl ? <img src={imageUrl} alt="" className="size-full object-cover" /> : <ImageIcon className="size-10 text-ink-300" />}
        </div>
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          onChange={(e) => { const file = e.target.files?.[0]; if (file) { const fd = new FormData(); fd.set("file", file); void send(fd); } e.target.value = ""; }} />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" loading={busy} onClick={() => ref.current?.click()}><Upload className="size-4" />{t("common.upload")}</Button>
          {imageUrl && <Button variant="ghost" size="sm" onClick={() => { const fd = new FormData(); fd.set("remove", "1"); void send(fd); }}><X className="size-4" />{t("common.remove")}</Button>}
        </div>
      </CardBody>
    </Card>
  );
}

export function VarietiesManager({ productId, varieties }: { productId: string; varieties: { id: string; nameAr: string; nameEn: string; active: boolean; used: number }[] }) {
  const { t, locale } = useI18n();
  const [edit, setEdit] = useState<{ id?: string; nameAr: string; nameEn: string; active: boolean } | null>(null);
  const save = useAction(saveVariety, { success: t("common.saved") });
  const del = useAction(deleteVariety);
  return (
    <Card>
      <CardHeader title={t("cat.varieties")} action={<Button size="sm" variant="outline" onClick={() => setEdit({ nameAr: "", nameEn: "", active: true })}><Plus className="size-4" />{t("cat.addVariety")}</Button>} />
      <CardBody className="space-y-2">
        {varieties.length === 0 && <p className="text-sm text-muted">{t("common.none")}</p>}
        {varieties.map((v) => (
          <div key={v.id} className="flex items-center justify-between rounded-lg border border-ivory-200 px-3 py-2">
            <div className="text-sm">
              <span className="font-medium">{locale === "ar" ? v.nameAr : v.nameEn}</span>
              <span className="ms-2 text-xs text-muted">{locale === "ar" ? v.nameEn : v.nameAr}</span>
              {!v.active && <Badge className="ms-2">{t("common.inactive")}</Badge>}
            </div>
            <div className="flex gap-1">
              <Button size="icon-sm" variant="ghost" onClick={() => setEdit(v)}><Pencil className="size-4" /></Button>
              {v.used === 0 && <ConfirmButton size="icon-sm" title={t("common.delete")} onConfirm={() => del.run({ id: v.id })}><Trash2 className="size-4" /></ConfirmButton>}
            </div>
          </div>
        ))}
      </CardBody>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? t("common.edit") : t("cat.addVariety")} size="sm"
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>{t("common.cancel")}</Button><Button form="variety-form" type="submit" loading={save.pending}>{t("common.save")}</Button></>}>
        {edit && (
          <form id="variety-form" className="grid gap-4" onSubmit={async (e) => { e.preventDefault(); if (await save.run({ ...edit, productId })) setEdit(null); }}>
            <Field label={t("common.nameAr")}><Input dir="rtl" required value={edit.nameAr} onChange={(e) => setEdit({ ...edit, nameAr: e.target.value })} /></Field>
            <Field label={t("common.nameEn")}><Input dir="ltr" required value={edit.nameEn} onChange={(e) => setEdit({ ...edit, nameEn: e.target.value })} /></Field>
            <Switch checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label={t("common.active")} />
          </form>
        )}
      </Dialog>
    </Card>
  );
}
