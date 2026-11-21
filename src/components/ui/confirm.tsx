"use client";
import { useState } from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";
import { useI18n } from "@/lib/i18n/client";

export function ConfirmButton({
  children, title, description, onConfirm, variant = "danger-soft", size = "sm", confirmLabel, disabled,
}: {
  children: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; onConfirm: () => Promise<unknown> | unknown;
  variant?: React.ComponentProps<typeof Button>["variant"]; size?: React.ComponentProps<typeof Button>["size"]; confirmLabel?: string; disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} disabled={disabled} type="button">{children}</Button>
      <Dialog
        open={open} onOpenChange={setOpen} title={title} description={description ?? t("common.confirmDelete")} size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button
              variant="danger" loading={busy}
              onClick={async () => { setBusy(true); try { await onConfirm(); setOpen(false); } finally { setBusy(false); } }}
            >
              {confirmLabel ?? t("common.confirm")}
            </Button>
          </>
        }
      />
    </>
  );
}
