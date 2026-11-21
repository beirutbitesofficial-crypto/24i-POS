import * as React from "react";
import { cn } from "@/lib/utils";

export const inputClass =
  "h-10 w-full rounded-lg border border-ivory-300 bg-ivory-50 px-3 text-sm text-ink-900 placeholder:text-muted/70 shadow-[inset_0_1px_0_rgb(0_0_0/0.02)] transition focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-200 disabled:opacity-60 aria-[invalid=true]:border-danger";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(inputClass, className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(inputClass, "h-auto min-h-20 py-2", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(inputClass, "appearance-auto pe-8", className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export function Label({ className, children, hint, ...props }: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: React.ReactNode }) {
  return (
    <label className={cn("mb-1.5 block text-xs font-semibold tracking-wide text-ink-700", className)} {...props}>
      {children}
      {hint && <span className="ms-1 font-normal text-muted">({hint})</span>}
    </label>
  );
}

export function Field({ label, hint, error, children, className }: { label: React.ReactNode; hint?: React.ReactNode; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label hint={hint}>{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

export function Switch({ checked, onChange, label, name, disabled }: { checked: boolean; onChange?: (v: boolean) => void; label?: React.ReactNode; name?: string; disabled?: boolean }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-3 select-none", disabled && "opacity-50")}>
      <span className="relative inline-flex">
        <input type="checkbox" name={name} className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-ivory-300 transition peer-checked:bg-gold-500" />
        <span className="absolute top-0.5 start-0.5 size-5 rounded-full bg-white shadow transition peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" />
      </span>
      {label && <span className="text-sm text-ink-800">{label}</span>}
    </label>
  );
}
