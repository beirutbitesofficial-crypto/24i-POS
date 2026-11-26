"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, ShoppingCart, Receipt, Wallet, Package, Tags, Award, Ruler, Boxes, Truck, BarChart3,
  Settings, Users, ScrollText, Menu, X, PackagePlus, SlidersHorizontal, Repeat, ClipboardList, History, CalendarClock, ListChecks, ShoppingBag, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import type { DictKey } from "@/lib/i18n";
import { BrandMark } from "./brand-mark";

type Item = { href: string; label: DictKey; icon: React.ComponentType<{ className?: string }>; perm: string; module?: string };
type Section = { label: DictKey; items: Item[] };

const NAV: Section[] = [
  {
    label: "nav.section.operate",
    items: [
      { href: "/pos", label: "nav.pos", icon: ShoppingCart, perm: "pos.sell", module: "pos" },
      { href: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
      { href: "/sales", label: "nav.salesHistory", icon: Receipt, perm: "pos.sell", module: "pos" },
      { href: "/shifts", label: "nav.shifts", icon: Wallet, perm: "pos.sell", module: "pos" },
    ],
  },
  {
    label: "nav.section.manage",
    items: [
      { href: "/catalog/products", label: "nav.products", icon: Package, perm: "catalog.manage" },
      { href: "/catalog/categories", label: "nav.categories", icon: Tags, perm: "catalog.manage" },
      { href: "/catalog/brands", label: "nav.brands", icon: Award, perm: "catalog.manage" },
      { href: "/catalog/units", label: "nav.units", icon: Ruler, perm: "catalog.manage" },
      { href: "/inventory", label: "nav.stock", icon: Boxes, perm: "inventory.view", module: "inventory" },
      { href: "/inventory/receive", label: "nav.receive", icon: PackagePlus, perm: "inventory.manage", module: "inventory" },
      { href: "/inventory/purchases", label: "nav.purchases", icon: ShoppingBag, perm: "inventory.manage", module: "inventory" },
      { href: "/inventory/adjust", label: "nav.adjust", icon: SlidersHorizontal, perm: "inventory.manage", module: "inventory" },
      { href: "/inventory/convert", label: "nav.convert", icon: Repeat, perm: "inventory.manage", module: "inventory" },
      { href: "/inventory/counts", label: "nav.counts", icon: ClipboardList, perm: "inventory.manage", module: "inventory" },
      { href: "/inventory/lots", label: "nav.expiry", icon: CalendarClock, perm: "inventory.view", module: "inventory" },
      { href: "/inventory/reorder", label: "nav.reorder", icon: ListChecks, perm: "inventory.view", module: "inventory" },
      { href: "/inventory/movements", label: "nav.movements", icon: History, perm: "inventory.view", module: "inventory" },
      { href: "/suppliers", label: "nav.suppliers", icon: Truck, perm: "suppliers.manage", module: "inventory" },
      { href: "/reports", label: "nav.reports", icon: BarChart3, perm: "reports.view", module: "reports" },
      { href: "/assistant", label: "nav.assistant", icon: Sparkles, perm: "reports.view", module: "reports" },
    ],
  },
  {
    label: "nav.section.admin",
    items: [
      { href: "/settings", label: "nav.store", icon: Settings, perm: "settings.manage" },
      { href: "/settings/users", label: "nav.users", icon: Users, perm: "users.manage" },
      { href: "/settings/audit", label: "nav.audit", icon: ScrollText, perm: "audit.view" },
    ],
  },
];

export function Sidebar({ perms, modules, storeName, logoUrl }: { perms: string[]; modules: string[]; storeName: string; logoUrl: string | null }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Highlight the tapped link immediately, before the next page arrives
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => { setPendingHref(null); }, [pathname]);
  const has = (i: Item) => perms.includes(i.perm) && (!i.module || modules.includes(i.module));
  const isActive = (href: string) => pendingHref ? pendingHref === href : pathname === href || (href !== "/inventory" && pathname.startsWith(href + "/")) || (href === "/settings" && pathname === "/settings");

  const content = (
    <div className="lux-dark flex h-full flex-col text-ink-300">
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <BrandMark light />
        <button className="text-ink-300 lg:hidden" onClick={() => setOpen(false)} aria-label="Close"><X className="size-5" /></button>
      </div>
      <div className="lux-edge mx-4 mb-4 flex items-center gap-3 rounded-xl bg-white/[0.04] p-2.5 backdrop-blur">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="size-10 rounded-lg bg-ivory-100 object-cover" />
        ) : (
          <div className="grid size-10 place-items-center rounded-lg bg-ink-700 font-semibold text-gold-300">{storeName.slice(0, 1)}</div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ivory-50">{storeName}</div>
          <div className="text-[11px] text-gold-300/80">{t("app.tagline")}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6 scrollbar-thin">
        {NAV.map((section) => {
          const items = section.items.filter(has);
          if (!items.length) return null;
          return (
            <div key={section.label}>
              <div className="mb-1.5 px-3 text-[10px] font-semibold tracking-[0.2em] text-ink-400 uppercase">{t(section.label)}</div>
              <ul className="space-y-0.5">
                {items.map((i) => {
                  const active = isActive(i.href);
                  const Icon = i.icon;
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        onClick={() => { setOpen(false); if (i.href !== pathname) setPendingHref(i.href); }}
                        onMouseEnter={() => router.prefetch(i.href)}
                        onTouchStart={() => router.prefetch(i.href)}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-[background-color,color,box-shadow] duration-150",
                          active ? "bg-gradient-to-r from-gold-500/20 to-transparent text-white shadow-[inset_2px_0_0_var(--color-gold-300)] rtl:bg-gradient-to-l rtl:shadow-[inset_-2px_0_0_var(--color-gold-300)]" : "hover:bg-white/[0.05] hover:text-white",
                        )}
                      >
                        <Icon className={cn("size-[18px] shrink-0", active ? "text-gold-300" : "text-ink-400 group-hover:text-gold-300")} />
                        <span className="truncate">{t(i.label)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </div>
  );

  return (
    <>
      <button
        className="fixed top-3 z-40 grid size-10 place-items-center rounded-lg bg-ink-900 text-ivory-50 shadow-lg start-3 lg:hidden no-print"
        onClick={() => setOpen(true)} aria-label="Menu"
      >
        <Menu className="size-5" />
      </button>
      <aside className="no-print fixed inset-y-0 start-0 z-30 hidden w-64 lg:block">{content}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-ink-950/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 animate-slide-in-end shadow-2xl">{content}</aside>
        </div>
      )}
    </>
  );
}
