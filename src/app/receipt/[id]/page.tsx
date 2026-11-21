import { notFound } from "next/navigation";
import { requirePageOrgUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { buildReceipt } from "@/server/services/receipt";
import { AutoPrint } from "./auto-print";

export const metadata = { title: "Receipt" };

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ autoprint?: string }> }) {
  const user = await requirePageOrgUser("pos.sell");
  const { locale, t } = await getI18n();
  const { id } = await params;
  const sp = await searchParams;
  const r = await buildReceipt(user, id, locale);
  if (!r) notFound();
  const width = r.paperWidthMm === 58 ? "48mm" : "72mm";
  return (
    <>
      {/* 80 mm thermal paper: 72 mm printable width */}
      <style>{`
        @page { size: ${r.paperWidthMm}mm auto; margin: 0; }
        html, body { background: #fff !important; }
        .receipt { width: ${width}; margin: 0 auto; padding: 4mm 0 6mm; font-size: 12px; line-height: 1.35; color: #000; }
        .receipt * { color: #000 !important; }
        @media screen { body { background: #eee !important; } .receipt { background: #fff; padding: 6mm 4mm; margin: 16px auto; box-shadow: 0 2px 12px rgba(0,0,0,.15); } }
      `}</style>
      <div className="receipt font-sans">
        {r.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.logoUrl} alt="" style={{ width: "26mm", height: "26mm", objectFit: "contain", margin: "0 auto 2mm", display: "block", filter: "grayscale(1)" }} />
        )}
        <div className="text-center text-[15px] font-bold">{r.storeName}</div>
        {r.header && <div className="text-center">{r.header}</div>}
        {r.address && <div className="text-center text-[11px]">{r.address}</div>}
        {r.phone && <div className="num text-center text-[11px]">{r.phone}</div>}
        {r.copy && <div className="my-1 text-center font-bold">*** {t("common.copy")} ***</div>}
        {r.refunded && <div className="my-1 text-center font-bold">*** {t("sales.refunded")} ***</div>}
        <div className="my-2 border-t border-dashed border-black" />
        <div className="flex justify-between"><span>{t("sales.receipt")} #</span><span className="num font-bold">{r.number}</span></div>
        <div className="flex justify-between"><span>{t("common.date")}</span><span className="num">{r.date}</span></div>
        <div className="flex justify-between"><span>{t("sales.cashier")}</span><span>{r.cashier}</span></div>
        <div className="my-2 border-t border-dashed border-black" />
        {r.lines.map((l, i) => (
          <div key={i} className="mb-1.5">
            <div className="font-semibold">{l.name}</div>
            {l.detail && <div className="text-[11px]">{l.detail}</div>}
            <div className="flex justify-between">
              <span className="num">{l.qty} × {l.unitPrice}</span>
              <span className="num font-semibold">{l.total}</span>
            </div>
            {l.discount && <div className="num text-end text-[11px]">{t("pos.discount")} {l.discount}</div>}
          </div>
        ))}
        <div className="my-2 border-t border-dashed border-black" />
        <div className="flex justify-between"><span>{t("pos.subtotal")}</span><span className="num">{r.subtotal}</span></div>
        {r.discount && <div className="flex justify-between"><span>{t("pos.discount")}</span><span className="num">{r.discount}</span></div>}
        {r.tax && <div className="flex justify-between"><span>{r.tax.label}</span><span className="num">{r.tax.amount}</span></div>}
        <div className="mt-1 flex justify-between text-[16px] font-bold"><span>{t("pos.total")}</span><span className="num">{r.total}</span></div>
        {r.totalLbp && <div className="flex justify-between font-semibold"><span /><span className="num">{r.totalLbp}</span></div>}
        <div className="my-2 border-t border-dashed border-black" />
        {r.payments.map((p, i) => (
          <div key={i} className="flex justify-between"><span>{p.label}</span><span className="num">{p.amount}</span></div>
        ))}
        {r.change.length > 0 && (
          <div className="flex justify-between font-semibold"><span>{t("pos.change")}</span><span className="num text-end">{r.change.map((c) => <div key={c}>{c}</div>)}</span></div>
        )}
        <div className="num mt-2 text-center text-[10px]">{r.rate}</div>
        {r.footer && <div className="mt-3 text-center">{r.footer}</div>}
        <div className="mt-3 text-center text-[9px]" dir="ltr">24i POS</div>
      </div>
      <AutoPrint enabled={sp.autoprint === "1"} />
    </>
  );
}
