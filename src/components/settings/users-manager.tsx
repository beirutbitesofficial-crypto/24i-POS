"use client";
import { useState } from "react";
import { Plus, Pencil, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Field, Select, Switch } from "@/components/ui/input";
import { Badge, Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { useI18n } from "@/lib/i18n/client";
import { useAction } from "@/hooks/use-action";
import type { ActionResult } from "@/server/action";

type Role = "ADMIN" | "MANAGER" | "CASHIER";
export type UserRow = { id: string; name: string; username: string; role: Role; active: boolean; hasPin: boolean; lastLoginAt: string | null };
type Form = { id?: string; name: string; username: string; role: Role; password: string; pin: string; clearPin: boolean; active: boolean };

export function UsersManager({ users, save, extra }: { users: UserRow[]; save: (i: Form) => Promise<ActionResult<{ id: string }>>; extra?: Record<string, string> }) {
  const { t, locale } = useI18n();
  const [form, setForm] = useState<Form | null>(null);
  const a = useAction(save, { success: t("common.saved") });
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setForm({ name: "", username: "", role: "CASHIER", password: "", pin: "", clearPin: false, active: true })}><Plus className="size-4" />{t("users.new")}</Button>
      </div>
      <Card>
        <Table>
          <THead><tr><TH>{t("common.name")}</TH><TH>{t("users.username")}</TH><TH>{t("users.role")}</TH><TH>PIN</TH><TH>{t("users.lastLogin")}</TH><TH>{t("common.status")}</TH><TH /></tr></THead>
          <tbody>
            {users.map((u) => (
              <TR key={u.id}>
                <TD className="font-medium">{u.name}</TD>
                <TD className="num text-muted">{u.username}</TD>
                <TD><Badge tone={u.role === "ADMIN" ? "dark" : u.role === "MANAGER" ? "gold" : "neutral"}>{t(`role.${u.role}`)}</Badge></TD>
                <TD>{u.hasPin ? <KeyRound className="size-4 text-gold-600" /> : "—"}</TD>
                <TD className="num text-xs text-muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString(locale === "ar" ? "ar-LB" : "en-GB") : "—"}</TD>
                <TD><Badge tone={u.active ? "success" : "neutral"}>{u.active ? t("common.active") : t("common.inactive")}</Badge></TD>
                <TD className="text-end"><Button size="icon-sm" variant="ghost" onClick={() => setForm({ ...u, password: "", pin: "", clearPin: false })}><Pencil className="size-4" /></Button></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      </Card>
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)} title={form?.id ? t("common.edit") : t("users.new")}
        footer={<><Button variant="ghost" onClick={() => setForm(null)}>{t("common.cancel")}</Button><Button form="user-form" type="submit" loading={a.pending}>{t("common.save")}</Button></>}>
        {form && (
          <form id="user-form" className="grid gap-4 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); if (await a.run({ ...form, ...extra })) setForm(null); }}>
            <Field label={t("common.name")} error={a.fields.name}><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label={t("users.username")} error={a.fields.username}><Input required dir="ltr" autoCapitalize="none" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} /></Field>
            <Field label={t("users.role")} className="sm:col-span-2">
              <div className="grid gap-2 sm:grid-cols-3">
                {(["CASHIER", "MANAGER", "ADMIN"] as Role[]).map((r) => (
                  <button key={r} type="button" onClick={() => setForm({ ...form, role: r })}
                    className={`rounded-xl border p-3 text-start text-sm ${form.role === r ? "border-gold-400 bg-gold-50" : "border-ivory-300 hover:bg-ivory-200"}`}>
                    <div className="font-semibold">{t(`role.${r}`)}</div>
                    <div className="mt-0.5 text-xs text-muted">{t(`users.roleHelp.${r}`)}</div>
                  </button>
                ))}
              </div>
            </Field>
            <Field label={form.id ? t("users.newPassword") : t("users.password")} hint={form.id ? t("users.passwordHint") : undefined} error={a.fields.password}>
              <Input type="password" dir="ltr" autoComplete="new-password" required={!form.id} minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label={t("users.pin")} hint={t("common.optional")} error={a.fields.pin}>
              <Input type="password" dir="ltr" inputMode="numeric" autoComplete="off" maxLength={6} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })} />
            </Field>
            <p className="text-xs text-muted sm:col-span-2">{t("users.pinHint")}</p>
            <div className="flex gap-6 sm:col-span-2">
              <Switch checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label={t("common.active")} />
              {form.id && <Switch checked={form.clearPin} onChange={(v) => setForm({ ...form, clearPin: v })} label={`${t("common.remove")} PIN`} />}
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
