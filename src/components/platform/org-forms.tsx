"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Field, Switch, Textarea } from "@/components/ui/input";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/client";
import { useAction } from "@/hooks/use-action";
import { createOrganization, updateOrganization } from "@/server/actions/platform";

const MODULES = ["pos", "inventory", "reports"] as const;
type Mod = (typeof MODULES)[number];

function ModulePicker({ value, onChange }: { value: Mod[]; onChange: (v: Mod[]) => void }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-4">
      {MODULES.map((m) => (
        <Switch key={m} checked={value.includes(m)} onChange={(on) => onChange(on ? [...value, m] : value.filter((x) => x !== m))} label={t(`plat.module.${m}`)} />
      ))}
    </div>
  );
}

export function NewOrgButton() {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", nameAr: "", slug: "", modules: [...MODULES] as Mod[], ownerName: "", ownerUsername: "", ownerPassword: "", notes: "" });
  const a = useAction(createOrganization, { success: t("plat.orgCreated"), refresh: false });
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="size-4" />{t("plat.newOrg")}</Button>
      <Dialog open={open} onOpenChange={setOpen} size="lg" title={t("plat.newOrg")}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button form="org-form" type="submit" loading={a.pending}>{t("common.create")}</Button></>}>
        <form id="org-form" className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); const r = await a.run(f); if (r) router.push(`/platform/${r.id}`); }}>
          <Field label={t("plat.orgName")} error={a.fields.name}><Input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: f.slug || slugify(e.target.value) })} onBlur={() => !f.slug && setF({ ...f, slug: slugify(f.name) })} /></Field>
          <Field label={t("plat.orgNameAr")}><Input dir="rtl" value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} /></Field>
          <Field label={t("plat.slug")} error={a.fields.slug}><Input required dir="ltr" value={f.slug} onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} /></Field>
          <Field label={t("plat.modules")}><div className="pt-2"><ModulePicker value={f.modules} onChange={(m) => setF({ ...f, modules: m })} /></div></Field>
          <div className="sm:col-span-2 mt-2 text-xs font-semibold tracking-wide text-gold-600 uppercase">{t("plat.adminUser")}</div>
          <Field label={t("plat.adminName")} error={a.fields.ownerName}><Input required value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} /></Field>
          <Field label={t("users.username")} error={a.fields.ownerUsername}><Input required dir="ltr" value={f.ownerUsername} onChange={(e) => setF({ ...f, ownerUsername: e.target.value.toLowerCase() })} /></Field>
          <Field label={t("users.password")} error={a.fields.ownerPassword}><Input required type="password" dir="ltr" minLength={8} autoComplete="new-password" value={f.ownerPassword} onChange={(e) => setF({ ...f, ownerPassword: e.target.value })} /></Field>
          <Field label={t("common.notes")} className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="min-h-14" /></Field>
        </form>
      </Dialog>
    </>
  );
}

export function OrgSettingsCard({ org }: { org: { id: string; name: string; nameAr: string | null; active: boolean; modules: string[]; notes: string | null } }) {
  const { t } = useI18n();
  const [f, setF] = useState({ ...org, modules: org.modules as Mod[] });
  const a = useAction(updateOrganization, { success: t("common.saved") });
  return (
    <Card>
      <CardHeader title={t("common.details")} action={<Button size="sm" loading={a.pending} onClick={() => a.run(f)}>{t("common.save")}</Button>} />
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <Field label={t("plat.orgName")}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label={t("plat.orgNameAr")}><Input dir="rtl" value={f.nameAr ?? ""} onChange={(e) => setF({ ...f, nameAr: e.target.value })} /></Field>
        <Field label={t("plat.modules")} className="sm:col-span-2"><ModulePicker value={f.modules} onChange={(m) => setF({ ...f, modules: m })} /></Field>
        <Field label={t("common.notes")} className="sm:col-span-2"><Textarea value={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value })} className="min-h-14" /></Field>
        <Switch checked={f.active} onChange={(v) => setF({ ...f, active: v })} label={t("common.active")} />
      </CardBody>
    </Card>
  );
}
