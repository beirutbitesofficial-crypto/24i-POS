import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

/** Store settings for the current organization (cached per request). */
export const getSettings = cache(async (organizationId: string) => {
  return db.storeSettings.findUniqueOrThrow({ where: { organizationId } });
});

export function mediaUrl(id: string | null | undefined) {
  return id ? `/api/media/${id}` : null;
}
