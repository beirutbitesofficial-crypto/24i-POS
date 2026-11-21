"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, CheckCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ConfirmButton } from "@/components/ui/confirm";
import { useI18n } from "@/lib/i18n/client";
import { useAction } from "@/hooks/use-action";
import { startCount, saveCount, postCount, cancelCount } from "@/server/actions/inventory";
import { D } from "@/lib/money";
import { cn } from "@/lib/utils";

export function NewCountButton({ categories }: { categories: { id: string; name: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [cat, setCat] = useState("");
  const a = useAction(startCount, { refresh: false });
  return (
    <div className="flex gap-2">
      <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-48">
        <option value="">{t("common.all")}</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </Select>
      <Button loading={a.pending} onClick={async () => { const r = await a.run({ categoryId: cat || null }); if (r) router.push(`/inventory/counts/${r.id}`); }}>
        <Plus className="size-4" />{t("inv.newCount")}
      </Button>
    </div>
  );
}

type Item = { variantId: string; name: string; sub: string; unitCode: string; expected: string; current: string; counted: string | null };

export function CountSheet({ countId, items, open }: { countId: string; items: Item[]; open: boolean }) {
  const { t } = useI18n();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.variantId, i.counted ?? ""])));
  const [q, setQ] = useState("");
  const save = useAction(saveCount, { success: t("common.saved") });
  const post = useAction(postCount, { success: t("inv.countPosted") });
  const cancel = useAction(cancelCount);
  const payload = () => ({ countId, items: items.map((i) => ({ variantId: i.variantId, countedQty: values[i.variantId] || null })) });
  const shown = useMemo(() => items.filter((i) => `${i.name} ${i.sub}`.toLowerCase().includes(q.toLowerCase())), [items, q]);
  return (
    <>
      {open && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Input className="max-w-xs" placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="me-auto text-xs text-muted">{t("inv.countHint")}</span>
          <Button variant="outline" loading={save.pending} onClick={() => save.run(payload())}><Save className="size-4" />{t("common.save")}</Button>
          <ConfirmButton variant="gold" size="md" title={t("inv.postCount")} description={t("inv.countHint")} confirmLabel={t("inv.postCount")}
            onConfirm={async () => { if (await save.run(payload())) await post.run({ countId }); }}>
            <CheckCheck className="size-4" />{t("inv.postCount")}
          </ConfirmButton>
          <ConfirmButton size="md" title={t("inv.cancelCount")} onConfirm={() => cancel.run({ countId })}><XCircle className="size-4" />{t("inv.cancelCount")}</ConfirmButton>
        </div>
      )}
      <Card>
        <Table>
          <THead><tr><TH>{t("cat.product")}</TH><TH className="text-end">{t("inv.expected")}</TH><TH className="text-end">{t("inv.onHand")}</TH><TH className="w-40">{t("inv.counted")}</TH><TH className="text-end">{t("inv.difference")}</TH></tr></THead>
          <tbody>
            {shown.map((i) => {
              const v = values[i.variantId];
              const diff = v !== "" && v !== undefined ? D(v).minus(D(i.current)) : null;
              return (
                <TR key={i.variantId}>
                  <TD><div className="font-medium">{i.name}</div><div className="text-xs text-muted">{i.sub}</div></TD>
                  <TD className="num text-end text-muted">{D(i.expected).toString()} {i.unitCode}</TD>
                  <TD className="num text-end">{D(i.current).toString()}</TD>
                  <TD>{open ? <Input dir="ltr" inputMode="decimal" className="h-9" value={v ?? ""} onChange={(e) => setValues((s) => ({ ...s, [i.variantId]: e.target.value.replace(/[^\d.]/g, "") }))} /> : <span className="num">{i.counted ?? "—"}</span>}</TD>
                  <TD className={cn("num text-end font-semibold", diff?.gt(0) && "text-success", diff?.lt(0) && "text-danger")}>{diff ? (diff.gt(0) ? "+" : "") + diff.toString() : "—"}</TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
