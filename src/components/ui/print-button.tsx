"use client";
import { Printer } from "lucide-react";
import { Button } from "./button";
import { useI18n } from "@/lib/i18n/client";

export function PrintButton({ label }: { label?: string }) {
  const { t } = useI18n();
  return <Button variant="outline" className="no-print" onClick={() => window.print()}><Printer className="size-4" />{label ?? t("common.print")}</Button>;
}
