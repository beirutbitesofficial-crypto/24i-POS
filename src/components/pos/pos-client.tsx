"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search, PauseCircle, PlayCircle, Trash2, Percent, LayoutDashboard, Scale, Package as PackageIcon, ShoppingBasket,
  CheckCircle2, Printer, ImageIcon, X, Wallet, Clock,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/card";
import { PinDialog } from "@/components/ui/pin-dialog";
import { LanguageSwitch } from "@/components/shell/language-switch";
import { UserMenu } from "@/components/shell/user-menu";
import { D, formatLbp, formatUsd, formatWeight, usdToLbp } from "@/lib/money";
import { priceCart, type ChangeCurrency } from "@/lib/pricing";
import { cn, uuid } from "@/lib/utils";
import { completeSale, holdSale, listHeld, resumeHeld, approveVoid, registerPrint } from "@/server/actions/pos";
import { WeightDialog } from "./weight-dialog";
import { PaymentDialog, type Tender } from "./payment-dialog";
import { LineDialog } from "./line-dialog";
import { printReceipt } from "./print";
import { emptyCart, type Cart, type CartLine, type PosCategory, type PosProduct, type PosSettings, type PosVariant } from "./types";

type PinPurpose = { kind: "sale"; tenders: Tender[]; changeCurrency: ChangeCurrency } | { kind: "void"; line: CartLine } | { kind: "reprint"; saleId: string };

export function PosClient({
  user, shift, categories, products, settings, heldCount,
}: {
  user: { name: string; role: string; canVoid: boolean; canBackOffice: boolean; canOverride: boolean };
  shift: { id: string; number: number };
  categories: PosCategory[];
  products: PosProduct[];
  settings: PosSettings;
  heldCount: number;
}) {
  const { t, te, locale } = useI18n();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const storageKey = `pos24i.cart.${shift.id}`;

  const [cart, setCart] = useState<Cart>(emptyCart);
  const [cat, setCat] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [picker, setPicker] = useState<PosProduct | null>(null);
  const [weighing, setWeighing] = useState<{ product: PosProduct; variant: PosVariant } | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clientRef, setClientRef] = useState<string>(() => uuid());
  const [pin, setPin] = useState<PinPurpose | null>(null);
  const [done, setDone] = useState<{ id: string; number: number; changeUsd: string; changeLbp: string } | null>(null);
  const [heldOpen, setHeldOpen] = useState(false);
  const [heldList, setHeldList] = useState<{ id: string; label: string | null; createdAt: string; userName: string; lines: number }[]>([]);
  const [discOpen, setDiscOpen] = useState(false);
  const [offline, setOffline] = useState<{ tenders: Tender[]; changeCurrency: ChangeCurrency; approverPin?: string } | null>(null);

  // Crash recovery: keep the in-progress cart in this browser
  useEffect(() => {
    try { const raw = localStorage.getItem(storageKey); if (raw) setCart(JSON.parse(raw)); } catch { /* ignore */ }
  }, [storageKey]);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch { /* ignore */ }
  }, [cart, storageKey]);

  const variantIndex = useMemo(() => {
    const m = new Map<string, { product: PosProduct; variant: PosVariant }>();
    for (const p of products) for (const v of p.variants) m.set(v.id, { product: p, variant: v });
    return m;
  }, [products]);
  const barcodeIndex = useMemo(() => {
    const m = new Map<string, { product: PosProduct; variant: PosVariant }>();
    for (const p of products) for (const v of p.variants) for (const b of v.barcodes) m.set(b, { product: p, variant: v });
    return m;
  }, [products]);

  const visible = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((p) => (!cat || p.categoryId === cat) && tokens.every((tk) => p.search.includes(tk)));
  }, [products, cat, query]);

  const priced = useMemo(() => {
    const lines = cart.lines.map((l) => {
      const e = variantIndex.get(l.variantId);
      return { quantity: l.quantity || "0", unitPrice: l.priceOverride ?? e?.variant.price ?? "0", discountType: l.discountType, discountValue: l.discountValue, taxable: e?.product.taxable };
    });
    return priceCart(lines, cart.cartDiscount ?? {}, { enabled: settings.taxEnabled, rate: settings.taxRate, inclusive: settings.taxInclusive });
  }, [cart, variantIndex, settings]);
  const totalLbp = usdToLbp(priced.total, settings.rate, settings.lbpRounding, settings.lbpMode);

  const sellable = (v: PosVariant) => v.price !== null && (settings.allowNegativeStock || D(v.stock).gt(0));

  const addLine = useCallback((variant: PosVariant, product: PosProduct, qty: string) => {
    setDone(null);
    setCart((c) => {
      // Unit items: merge into the same line. Weighed items: each weighing is its own line.
      if (variant.sellMode === "UNIT") {
        const i = c.lines.findIndex((l) => l.variantId === variant.id && !l.priceOverride && !l.discountValue);
        if (i >= 0) {
          const lines = [...c.lines];
          lines[i] = { ...lines[i], quantity: D(lines[i].quantity).plus(qty).toString() };
          return { ...c, lines };
        }
      }
      return { ...c, lines: [...c.lines, { key: uuid(), variantId: variant.id, productId: product.id, quantity: qty, discountType: null, discountValue: null, priceOverride: null }] };
    });
  }, []);

  const chooseVariant = useCallback((product: PosProduct, variant: PosVariant) => {
    if (variant.price === null) return toast.warning(t("err.PRICE_NOT_CONFIGURED", { name: product.name }));
    if (!sellable(variant)) return toast.warning(`${product.name}: ${t("pos.outOfStock")}`);
    setPicker(null);
    if (variant.sellMode === "WEIGHT") setWeighing({ product, variant });
    else addLine(variant, product, "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addLine, t, settings.allowNegativeStock]);

  const tapProduct = (p: PosProduct) => {
    if (p.variants.length === 0) return toast.warning(`${p.name}: ${t("common.needsSetup")}`);
    if (p.variants.length === 1) return chooseVariant(p, p.variants[0]);
    setPicker(p);
  };

  const onSearchEnter = () => {
    const code = query.trim();
    if (!code) return;
    const hit = barcodeIndex.get(code);
    if (hit) { chooseVariant(hit.product, hit.variant); setQuery(""); return; }
    const skuHit = products.flatMap((p) => p.variants.map((v) => ({ p, v }))).find(({ v }) => v.sku.toLowerCase() === code.toLowerCase());
    if (skuHit) { chooseVariant(skuHit.p, skuHit.v); setQuery(""); return; }
    if (visible.length === 1) { tapProduct(visible[0]); setQuery(""); return; }
    if (/^\d{6,}$/.test(code)) { toast.error(t("pos.barcodeNotFound", { code })); setQuery(""); }
  };

  // ── Line removal (manager PIN when required) ──
  const removeLine = async (line: CartLine, pinCode?: string) => {
    const needsPin = settings.requirePinForVoid && !user.canVoid;
    if (needsPin && !pinCode) { setPin({ kind: "void", line }); return; }
    const e = variantIndex.get(line.variantId);
    if (needsPin || user.canVoid) {
      const r = await approveVoid({ pin: pinCode ?? null, item: `${e?.product.name ?? ""} ${e?.variant.label ?? ""}`.trim(), quantity: line.quantity });
      if (!r.ok) { toast.error(te(r.error)); return; }
    }
    setPin(null);
    setEditKey(null);
    setCart((c) => ({ ...c, lines: c.lines.filter((l) => l.key !== line.key) }));
  };

  // ── Checkout ──
  const submitSale = async (tenders: Tender[], changeCurrency: ChangeCurrency, approverPin?: string) => {
    setBusy(true);
    setOffline(null);
    try {
      const res = await completeSale({
        clientRef,
        lines: cart.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, discountType: l.discountValue ? l.discountType : null, discountValue: l.discountValue, priceOverride: l.priceOverride })),
        cartDiscount: cart.cartDiscount && D(cart.cartDiscount.value || "0").gt(0) ? cart.cartDiscount : null,
        payments: tenders.length ? tenders : [{ method: "CASH", currency: "USD", amount: "0" }],
        changeCurrency, approverPin: approverPin ?? null, note: cart.note || null,
      });
      if (!res.ok) {
        const code = res.error.split("|")[0];
        if (code === "APPROVAL_REQUIRED" || code === "INVALID_PIN") {
          if (code === "INVALID_PIN") toast.error(te(res.error));
          setPin({ kind: "sale", tenders, changeCurrency });
          return;
        }
        toast.error(te(res.error));
        return;
      }
      setPin(null);
      setPayOpen(false);
      setCart(emptyCart());
      setClientRef(uuid());
      setDone({ id: res.data.saleId, number: res.data.number, changeUsd: res.data.changeUsd, changeLbp: res.data.changeLbp });
      toast.success(t("pos.completed", { number: res.data.number }));
      if (settings.autoPrint) void doPrint(res.data.saleId);
      router.refresh();
    } catch {
      // Network failure: the same clientRef is reused on retry, so the sale can never be recorded twice.
      setOffline({ tenders, changeCurrency, approverPin });
    } finally {
      setBusy(false);
    }
  };

  const doPrint = async (saleId: string, pinCode?: string) => {
    const r = await registerPrint({ saleId, pin: pinCode ?? null });
    if (!r.ok) {
      const code = r.error.split("|")[0];
      if (code === "APPROVAL_REQUIRED" || code === "INVALID_PIN") { if (code === "INVALID_PIN") toast.error(te(r.error)); setPin({ kind: "reprint", saleId }); return; }
      toast.error(te(r.error));
      return;
    }
    setPin(null);
    await printReceipt(saleId, settings.printMode, settings.printBridgeUrl);
  };

  const onPin = (code: string) => {
    if (!pin) return;
    if (pin.kind === "sale") void submitSale(pin.tenders, pin.changeCurrency, code);
    else if (pin.kind === "void") void removeLine(pin.line, code);
    else void doPrint(pin.saleId, code);
  };

  // ── Hold / resume ──
  const hold = async () => {
    if (!cart.lines.length) return;
    const r = await holdSale({ label: null, cart: cart as unknown as Record<string, unknown> });
    if (!r.ok) return toast.error(te(r.error));
    setCart(emptyCart());
    setClientRef(uuid());
    toast.success(t("pos.hold"));
    router.refresh();
  };
  const openHeld = async () => {
    const r = await listHeld({});
    if (r.ok) setHeldList(r.data);
    setHeldOpen(true);
  };
  const resume = async (id: string) => {
    if (cart.lines.length) await hold();
    const r = await resumeHeld({ id });
    if (!r.ok) return toast.error(te(r.error));
    const c = r.data.cart as unknown as Cart;
    setCart({ ...emptyCart(), ...c, lines: (c.lines ?? []).filter((l) => variantIndex.has(l.variantId)) });
    setHeldOpen(false);
    router.refresh();
  };

  // ── Keyboard: scanner wedge + shortcuts ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const dialogOpen = !!document.querySelector("[role=dialog]");
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); return; }
      if (e.key === "F4") { e.preventDefault(); if (cart.lines.length && !dialogOpen) setPayOpen(true); return; }
      if (e.key === "F8") { e.preventDefault(); if (!dialogOpen) void hold(); return; }
      // Barcode scanners type fast then press Enter: route stray keystrokes into the search box
      if (!typing && !dialogOpen && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const editing = editKey ? cart.lines.find((l) => l.key === editKey) ?? null : null;
  const editEntry = editing ? variantIndex.get(editing.variantId) : undefined;
  const itemsCount = cart.lines.reduce((n, l) => n + (variantIndex.get(l.variantId)?.variant.sellMode === "WEIGHT" ? 1 : Number(l.quantity)), 0);

  const priceLabel = (p: PosProduct) => {
    const prices = p.variants.filter((v) => v.price !== null).map((v) => D(v.price!));
    if (!prices.length) return null;
    const min = prices.reduce((a, b) => (a.lt(b) ? a : b));
    const weight = p.variants.every((v) => v.sellMode === "WEIGHT");
    return `${p.variants.length > 1 && prices.some((x) => !x.eq(min)) ? "≥ " : ""}${formatUsd(min)}${weight ? t("pos.perKg") : ""}`;
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ivory-100">
      {/* Top bar */}
      <header className="flex h-16 shrink-0 items-center gap-3 bg-ink-900 px-3 sm:px-4">
        <div className="hidden items-center gap-2.5 md:flex">
          {settings.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={settings.logoUrl} alt="" className="size-10 rounded-full bg-ivory-100 object-cover" />
            : <div className="grid size-10 place-items-center rounded-full bg-gold-500 font-display font-bold text-ink-950">24i</div>}
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ivory-50">{settings.storeName}</div>
            <div className="flex items-center gap-1 text-[11px] text-gold-300"><Clock className="size-3" />{t("shift.number")} #{shift.number}</div>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-xl">
          <Search className="pointer-events-none absolute top-1/2 size-5 -translate-y-1/2 text-ink-400 start-3.5" />
          <input
            ref={searchRef} value={query} autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onSearchEnter(); } if (e.key === "Escape") setQuery(""); }}
            placeholder={t("pos.search")}
            className="h-11 w-full rounded-xl border border-ink-700 bg-ink-800 ps-11 pe-10 text-[15px] text-ivory-50 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none"
          />
          {query && <button onClick={() => setQuery("")} className="absolute top-1/2 -translate-y-1/2 text-ink-400 end-3"><X className="size-4" /></button>}
        </div>
        <Button variant="ghost" className="relative text-ink-300 hover:bg-ink-800 hover:text-ivory-50" onClick={openHeld}>
          <PlayCircle className="size-5" /><span className="hidden lg:inline">{t("pos.held")}</span>
          {heldCount > 0 && <span className="num absolute -top-0.5 grid size-5 place-items-center rounded-full bg-gold-500 text-[10px] font-bold text-ink-950 end-0">{heldCount}</span>}
        </Button>
        <Button asChild variant="ghost" className="text-ink-300 hover:bg-ink-800 hover:text-ivory-50">
          <Link href={user.canBackOffice ? "/dashboard" : "/shifts"}>{user.canBackOffice ? <LayoutDashboard className="size-5" /> : <Wallet className="size-5" />}<span className="hidden xl:inline">{user.canBackOffice ? t("pos.backOffice") : t("shift.my")}</span></Link>
        </Button>
        <LanguageSwitch dark className="hidden sm:inline-flex" />
        <UserMenu name={user.name} role={user.role} dark />
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Catalog */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-ivory-300 bg-ivory-50 px-3 py-2.5 scrollbar-thin sm:px-4">
            {[{ id: null as string | null, name: t("pos.allCategories"), color: null as string | null }, ...categories].map((c) => (
              <button key={c.id ?? "all"} onClick={() => setCat(c.id)}
                className={cn("flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition",
                  cat === c.id ? "border-ink-900 bg-ink-900 text-ivory-50 shadow" : "border-ivory-300 bg-white text-ink-800 hover:bg-ivory-200")}>
                {c.color && <span className="size-2.5 rounded-full" style={{ background: c.color }} />}{c.name}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin sm:p-4">
            {visible.length === 0 ? (
              <div className="grid h-full place-items-center text-center text-muted">
                <div><Search className="mx-auto mb-3 size-10 text-ivory-400" />{query ? t("pos.notFound", { q: query }) : t("common.none")}</div>
              </div>
            ) : (
              <div key={cat ?? "all"} className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {visible.map((p) => {
                  const price = priceLabel(p);
                  const anySellable = p.variants.some(sellable);
                  const catColor = categories.find((c) => c.id === p.categoryId)?.color;
                  const weight = p.variants.length > 0 && p.variants.every((v) => v.sellMode === "WEIGHT");
                  return (
                    <button key={p.id} onClick={() => tapProduct(p)}
                      className={cn("group relative flex min-h-[132px] flex-col overflow-hidden rounded-2xl border bg-white p-3 text-start shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-200 ease-out touch-manipulation active:scale-[0.97] active:duration-75",
                        anySellable ? "border-ivory-300 hover:-translate-y-0.5 hover:border-gold-300 hover:shadow-[var(--shadow-lift)]" : "border-dashed border-ivory-400 opacity-70")}>
                      <span className="absolute inset-x-0 top-0 h-1" style={{ background: catColor ?? "var(--color-gold-300)" }} />
                      <div className="mb-2 flex items-start justify-between gap-2">
                        {p.imageUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={p.imageUrl} alt="" className="size-11 rounded-lg object-cover" />
                          : <div className="grid size-11 place-items-center rounded-lg bg-ivory-100 text-gold-600">{weight ? <Scale className="size-5" /> : p.variants.length ? <PackageIcon className="size-5" /> : <ImageIcon className="size-5 text-ink-300" />}</div>}
                        {p.variants.length > 1 && <Badge className="num">{p.variants.length}</Badge>}
                      </div>
                      <div className="line-clamp-2 text-[14.5px] leading-snug font-semibold text-ink-900">{p.name}</div>
                      <div className="truncate text-[11.5px] text-muted">{p.altName}</div>
                      <div className="mt-auto pt-2">
                        {price ? <span className="num text-[15px] font-semibold text-gold-700">{price}</span>
                          : <span className="text-xs font-medium text-warn">{p.variants.length ? t("pos.priceRequired") : t("common.needsSetup")}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Cart */}
        <aside className="flex max-h-[55dvh] w-full shrink-0 flex-col border-t border-ivory-300 bg-ivory-50 lg:max-h-none lg:w-[400px] lg:border-t-0 lg:border-s xl:w-[440px]">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-ink-900">{t("pos.cart")}</div>
              <div className="text-xs text-muted">{t("pos.items", { count: itemsCount })}</div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setDiscOpen(true)} disabled={!cart.lines.length}><Percent className="size-4" /></Button>
              <Button size="sm" variant="ghost" onClick={hold} disabled={!cart.lines.length}><PauseCircle className="size-4" />{t("pos.hold")}</Button>
              <Button size="sm" variant="ghost" className="text-danger" disabled={!cart.lines.length}
                onClick={() => {
                  if (!confirm(t("pos.clearConfirm"))) return;
                  if (user.canVoid) void approveVoid({ item: `CLEAR: ${cart.lines.map((l) => variantIndex.get(l.variantId)?.product.name ?? "").join(", ")}`.slice(0, 200), quantity: String(cart.lines.length) });
                  setCart(emptyCart()); setClientRef(uuid());
                }}
                hidden={settings.requirePinForVoid && !user.canVoid}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 scrollbar-thin">
            {done && cart.lines.length === 0 ? (
              <div className="m-1 animate-pop rounded-2xl bg-success-soft p-5 text-center">
                <CheckCircle2 className="mx-auto mb-2 size-10 animate-scale-in text-success" />
                <div className="font-semibold text-success">{t("pos.completed", { number: done.number })}</div>
                {(D(done.changeUsd).gt(0) || D(done.changeLbp).gt(0)) && (
                  <div className="mt-3">
                    <div className="text-xs text-muted">{t("pos.change")}</div>
                    <div className="num text-3xl font-bold text-ink-900">
                      {D(done.changeUsd).gt(0) && <div>{formatUsd(done.changeUsd)}</div>}
                      {D(done.changeLbp).gt(0) && <div>{formatLbp(done.changeLbp, locale)}</div>}
                    </div>
                  </div>
                )}
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => doPrint(done.id)}><Printer className="size-4" />{t("pos.printReceipt")}</Button>
                  <Button size="sm" onClick={() => { setDone(null); searchRef.current?.focus(); }}>{t("pos.newSale")}</Button>
                </div>
              </div>
            ) : cart.lines.length === 0 ? (
              <div className="grid h-full min-h-40 place-items-center px-6 text-center text-sm text-muted">
                <div><ShoppingBasket className="mx-auto mb-3 size-10 text-ivory-400" />{t("pos.emptyCart")}</div>
              </div>
            ) : (
              <ul className="space-y-1.5 pb-2">
                {cart.lines.map((l, i) => {
                  const e = variantIndex.get(l.variantId);
                  if (!e) return null;
                  const pl = priced.lines[i];
                  const unit = l.priceOverride ?? e.variant.price ?? "0";
                  return (
                    <li key={l.key} className="animate-slide-in-end">
                      <button onClick={() => setEditKey(l.key)} className="flex w-full items-start gap-3 rounded-xl border border-ivory-200 bg-white px-3 py-2.5 text-start transition-[border-color,transform] duration-150 touch-manipulation hover:border-gold-300 active:scale-[0.99]">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold text-ink-900">{e.product.name}</div>
                          {e.variant.label && <div className="truncate text-xs text-muted">{e.variant.label}</div>}
                          <div className="num mt-0.5 text-xs text-ink-600">
                            {e.variant.sellMode === "WEIGHT" ? formatWeight(l.quantity, locale) : `${l.quantity} ×`} {formatUsd(unit)}{e.variant.sellMode === "WEIGHT" && t("pos.perKg")}
                            {l.priceOverride && <Badge tone="warn" className="ms-1">✎</Badge>}
                          </div>
                        </div>
                        <div className="text-end">
                          <div className="num text-sm font-semibold">{formatUsd(pl?.lineTotal ?? 0)}</div>
                          {pl && pl.lineDiscount.gt(0) && <div className="num text-[11px] text-success">−{formatUsd(pl.lineDiscount)}</div>}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-ivory-300 bg-white px-4 pt-3 pb-4">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between text-muted"><span>{t("pos.subtotal")}</span><span className="num">{formatUsd(priced.subtotal)}</span></div>
              {priced.discountTotal.gt(0) && <div className="flex justify-between text-success"><span>{t("pos.discount")}</span><span className="num">−{formatUsd(priced.discountTotal)}</span></div>}
              {settings.taxEnabled && <div className="flex justify-between text-muted"><span>{settings.taxLabel}{settings.taxInclusive ? " (incl.)" : ""}</span><span className="num">{formatUsd(priced.taxTotal)}</span></div>}
            </div>
            <div className="mt-2 flex items-end justify-between">
              <span className="text-sm font-semibold text-ink-700">{t("pos.total")}</span>
              <div className="text-end">
                <div key={priced.total.toString()} className="num animate-fade-in text-3xl font-bold tracking-tight text-ink-900">{formatUsd(priced.total)}</div>
                <div className="num text-xs text-muted">{formatLbp(totalLbp, locale)}</div>
              </div>
            </div>
            <Button variant="gold" size="xl" className="mt-3 w-full text-lg" disabled={!cart.lines.length} onClick={() => setPayOpen(true)}>
              {t("pos.charge", { amount: formatUsd(priced.total) })}<span className="ms-2 rounded bg-ink-950/10 px-1.5 py-0.5 text-xs">F4</span>
            </Button>
            <div className="mt-2 text-center text-[11px] text-muted">{t("pos.shortcuts")} · <span className="num">{t("pos.rate", { rate: Number(settings.rate).toLocaleString("en") })}</span></div>
          </div>
        </aside>
      </div>

      {/* Variant picker */}
      <Dialog open={!!picker} onOpenChange={(o) => !o && setPicker(null)} title={picker?.name ?? ""} description={t("pos.chooseVariant")} size="lg">
        <div className="stagger grid gap-2 sm:grid-cols-2">
          {picker?.variants.map((v) => {
            const ok = sellable(v);
            return (
              <button key={v.id} onClick={() => chooseVariant(picker, v)}
                className={cn("flex items-center justify-between gap-3 rounded-xl border p-4 text-start transition-[border-color,transform,box-shadow] duration-150 touch-manipulation hover:shadow-[var(--shadow-card)] active:scale-[0.98]",
                  ok ? "border-ivory-300 bg-white hover:border-gold-400" : "border-dashed border-ivory-400 bg-ivory-100 opacity-70")}>
                <div className="min-w-0">
                  <div className="font-semibold text-ink-900">{v.label || picker.name}</div>
                  <div className="text-xs text-muted">
                    {v.sellMode === "WEIGHT" ? <Scale className="me-1 inline size-3" /> : <PackageIcon className="me-1 inline size-3" />}
                    <span className="num">{t("pos.inStock", { qty: `${Number(v.stock)} ${v.unitCode}` })}</span>
                  </div>
                </div>
                <div className="text-end">
                  {v.price ? <div className="num text-lg font-semibold text-gold-700">{formatUsd(v.price)}{v.sellMode === "WEIGHT" && <span className="text-xs">{t("pos.perKg")}</span>}</div>
                    : <Badge tone="warn">{t("pos.priceRequired")}</Badge>}
                  {v.price && !ok && <Badge tone="danger">{t("pos.outOfStock")}</Badge>}
                </div>
              </button>
            );
          })}
        </div>
      </Dialog>

      <WeightDialog
        open={!!weighing} onOpenChange={(o) => !o && setWeighing(null)}
        title={weighing?.product.name ?? ""} subtitle={weighing?.variant.label} pricePerKg={weighing?.variant.price ?? null}
        onConfirm={(kg) => { if (weighing) addLine(weighing.variant, weighing.product, kg); setWeighing(null); searchRef.current?.focus(); }}
      />

      <LineDialog
        line={editing} product={editEntry?.product} variant={editEntry?.variant} onClose={() => setEditKey(null)}
        onSave={(l) => { setCart((c) => ({ ...c, lines: c.lines.map((x) => (x.key === l.key ? l : x)) })); setEditKey(null); }}
        onRemove={(l) => void removeLine(l)}
      />

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} total={priced.total.toString()} settings={settings} busy={busy}
        onComplete={(tenders, cc) => submitSale(tenders, cc)} />

      <PinDialog open={!!pin} onOpenChange={(o) => !o && setPin(null)} onSubmit={onPin} busy={busy} />

      {/* Cart discount */}
      <Dialog open={discOpen} onOpenChange={setDiscOpen} title={t("pos.cartDiscount")} size="sm"
        footer={<>
          <Button variant="ghost" onClick={() => { setCart((c) => ({ ...c, cartDiscount: null })); setDiscOpen(false); }}>{t("common.remove")}</Button>
          <Button onClick={() => setDiscOpen(false)}>{t("common.apply")}</Button>
        </>}>
        <div className="flex gap-2">
          <div className="flex overflow-hidden rounded-lg border border-ivory-300">
            {(["PERCENT", "AMOUNT"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setCart((c) => ({ ...c, cartDiscount: { type: k, value: c.cartDiscount?.value ?? "" } }))}
                className={cn("px-4 text-sm", (cart.cartDiscount?.type ?? "PERCENT") === k ? "bg-ink-900 text-ivory-50" : "bg-white")}>{k === "PERCENT" ? "%" : "$"}</button>
            ))}
          </div>
          <Input dir="ltr" inputMode="decimal" autoFocus className="h-12 text-xl" value={cart.cartDiscount?.value ?? ""}
            onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setCart((c) => ({ ...c, cartDiscount: { type: c.cartDiscount?.type ?? "PERCENT", value: v } })); }} />
        </div>
        {D(settings.cashierMaxDiscount).gte(0) && <p className="mt-3 text-xs text-muted">{t("set.cashierMaxDiscount")}: <span className="num">{Number(settings.cashierMaxDiscount)}%</span></p>}
      </Dialog>

      {/* Held sales */}
      <Dialog open={heldOpen} onOpenChange={setHeldOpen} title={t("pos.held")}>
        {heldList.length === 0 ? <p className="py-6 text-center text-sm text-muted">{t("pos.noHeld")}</p> : (
          <ul className="space-y-2">
            {heldList.map((h) => (
              <li key={h.id} className="flex items-center justify-between rounded-xl border border-ivory-300 bg-white px-4 py-3">
                <div>
                  <div className="text-sm font-semibold">{h.label || t("pos.items", { count: h.lines })}</div>
                  <div className="num text-xs text-muted">{new Date(h.createdAt).toLocaleTimeString(locale === "ar" ? "ar-LB" : "en-GB", { hour: "2-digit", minute: "2-digit" })} · {h.userName}</div>
                </div>
                <Button size="sm" variant="gold" onClick={() => resume(h.id)}><PlayCircle className="size-4" />{t("pos.resume")}</Button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      {/* Network failure */}
      <Dialog open={!!offline} onOpenChange={(o) => !o && setOffline(null)} title={t("err.SERVER_ERROR")} size="sm"
        footer={<Button variant="gold" loading={busy} onClick={() => offline && submitSale(offline.tenders, offline.changeCurrency, offline.approverPin)}>{t("pos.retry")}</Button>}>
        <p className="text-sm text-ink-700">{t("pos.offline")}</p>
      </Dialog>
    </div>
  );
}
