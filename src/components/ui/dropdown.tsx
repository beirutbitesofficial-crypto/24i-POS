"use client";
import * as DM from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

export const DropdownMenu = DM.Root;
export const DropdownTrigger = DM.Trigger;
export function DropdownContent({ className, ...props }: DM.DropdownMenuContentProps) {
  return (
    <DM.Portal>
      <DM.Content sideOffset={6} className={cn("menu-content z-50 min-w-48 rounded-xl border border-ivory-300 bg-ivory-50 p-1 shadow-[var(--shadow-lift)]", className)} {...props} />
    </DM.Portal>
  );
}
export function DropdownItem({ className, ...props }: DM.DropdownMenuItemProps) {
  return <DM.Item className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-fg outline-none transition-colors data-[highlighted]:bg-ivory-200", className)} {...props} />;
}
export const DropdownSeparator = () => <DM.Separator className="my-1 h-px bg-ivory-200" />;
