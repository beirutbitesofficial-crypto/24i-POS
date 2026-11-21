"use client";
import { LogOut, ChevronDown, UserRound } from "lucide-react";
import { DropdownMenu, DropdownTrigger, DropdownContent, DropdownItem, DropdownSeparator } from "@/components/ui/dropdown";
import { useI18n } from "@/lib/i18n/client";
import { logoutAction } from "@/server/actions/auth";
import type { DictKey } from "@/lib/i18n";

export function UserMenu({ name, role, dark }: { name: string; role: string; dark?: boolean }) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownTrigger asChild>
        <button className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-start transition ${dark ? "hover:bg-ink-800" : "hover:bg-ivory-200"}`}>
          <div className="grid size-8 place-items-center rounded-full bg-gold-100 text-gold-700"><UserRound className="size-4" /></div>
          <div className="hidden leading-tight sm:block">
            <div className={`text-sm font-medium ${dark ? "text-ivory-50" : "text-ink-900"}`}>{name}</div>
            <div className={`text-[11px] ${dark ? "text-ink-300" : "text-muted"}`}>{t(`role.${role}` as DictKey)}</div>
          </div>
          <ChevronDown className={`size-4 ${dark ? "text-ink-300" : "text-muted"}`} />
        </button>
      </DropdownTrigger>
      <DropdownContent align="end">
        <div className="px-3 py-2 text-xs text-muted">{name}</div>
        <DropdownSeparator />
        <DropdownItem onSelect={() => void logoutAction()} className="text-danger">
          <LogOut className="size-4" /> {t("nav.logout")}
        </DropdownItem>
      </DropdownContent>
    </DropdownMenu>
  );
}
