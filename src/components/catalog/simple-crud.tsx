"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Field, Select, Switch } from "@/components/ui/input";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ConfirmButton } from "@/components/ui/confirm";
import { useI18n } from "@/lib/i18n/client";
import { useAction } from "@/hooks/use-action";
import type { DictKey } from "@/lib/i18n";
import type { ActionResult } from "@/server/action";

export type FieldDef =
  | { name: string; label: DictKey; type: "text"; required?: boolean; dir?: "ltr" | "rtl" }
  | { name: string; label: DictKey; type: "number" }
  | { name: string; label: DictKey; type: "switch" }
  | { name: string; label: DictKey; type: "color" }
  | { name: string; label: DictKey; type: "select"; options: { value: string; label: DictKey }[] };

type Row = Record<string, string | number | boolean | null> & { id: string };

/** Generic list + dialog editor used by categories, brands and units. */
export function SimpleCrud({
  rows, fields, columns, save, remove, newLabel, emptyIcon, defaults, extra,
}: {
  rows: Row[];
  fields: FieldDef[];
  columns: { key: string; label: DictKey; render?: "badge-active" | "kind" | "bool" | "color" }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  save: (input: any) => Promise<ActionResult<unknown>>;
  remove: (input: { id: string }) => Promise<ActionResult<unknown>>;
  newLabel: DictKey;
  emptyIcon: React.ReactNode;
  defaults: Record<string, unknown>;
  extra?: (row: Row) => React.ReactNode;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const saveA = useAction(save, { success: t("common.saved") });
  const removeA = useAction(remove, { success: t("common.done") });

  const set = (k: string, v: unknown) => setEditing((e) => ({ ...(e ?? {}), [k]: v }));
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing({ ...defaults })}><Plus className="size-4" />{t(newLabel)}</Button>
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={emptyIcon} title={t(newLabel)} action={<Button variant="gold" onClick={() => setEditing({ ...defaults })}><Plus className="size-4" />{t("common.add")}</Button>} />
        ) : (
          <Table>
            <THead>
              <tr>
                {columns.map((c) => <TH key={c.key}>{t(c.label)}</TH>)}
                <TH className="text-end">{t("common.actions")}</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  {columns.map((c) => (
                    <TD key={c.key}>
                      {c.render === "badge-active" ? (
                        <Badge tone={r[c.key] ? "success" : "neutral"}>{r[c.key] ? t("common.active") : t("common.inactive")}</Badge>
                      ) : c.render === "kind" ? (
                        t(`cat.unitKind.${r[c.key]}` as DictKey)
                      ) : c.render === "bool" ? (
                        r[c.key] ? t("common.yes") : t("common.no")
                      ) : c.render === "color" ? (
                        r[c.key] ? <span className="inline-block size-5 rounded-md ring-1 ring-black/10" style={{ background: String(r[c.key]) }} /> : "—"
                      ) : (
                        <span className={c.key === "nameEn" || c.key === "code" ? "font-medium" : ""}>{String(r[c.key] ?? "—")}</span>
                      )}
                    </TD>
                  ))}
                  <TD className="text-end">
                    <div className="flex justify-end gap-1.5">
                      {extra?.(r)}
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditing({ ...r })} aria-label={t("common.edit")}><Pencil className="size-4" /></Button>
                      <ConfirmButton size="icon-sm" title={t("common.delete")} onConfirm={() => removeA.run({ id: r.id })}><Trash2 className="size-4" /></ConfirmButton>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Dialog
        open={!!editing} onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? t("common.edit") : t(newLabel)}
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
          <Button form="crud-form" type="submit" loading={saveA.pending}>{t("common.save")}</Button>
        </>}
      >
        {editing && (
          <form
            id="crud-form" className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => { e.preventDefault(); if (await saveA.run(editing)) setEditing(null); }}
          >
            {fields.map((f) => (
              <Field key={f.name} label={t(f.label)} error={saveA.fields[f.name]} className={f.type === "switch" ? "sm:col-span-2" : ""}>
                {f.type === "text" && <Input value={String(editing[f.name] ?? "")} required={f.required} dir={f.dir} onChange={(e) => set(f.name, e.target.value)} />}
                {f.type === "number" && <Input type="number" value={String(editing[f.name] ?? "0")} onChange={(e) => set(f.name, e.target.value)} />}
                {f.type === "color" && <Input type="color" className="h-10 w-20 p-1" value={String(editing[f.name] || "#b8964e")} onChange={(e) => set(f.name, e.target.value)} />}
                {f.type === "switch" && <Switch checked={Boolean(editing[f.name])} onChange={(v) => set(f.name, v)} label={t(f.label)} />}
                {f.type === "select" && (
                  <Select value={String(editing[f.name] ?? "")} onChange={(e) => set(f.name, e.target.value)}>
                    {f.options.map((o) => <option key={o.value} value={o.value}>{t(o.label)}</option>)}
                  </Select>
                )}
              </Field>
            ))}
          </form>
        )}
      </Dialog>
    </>
  );
}
