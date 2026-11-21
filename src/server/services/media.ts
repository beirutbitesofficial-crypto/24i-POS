import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "../action";

const MAX_BYTES = 2 * 1024 * 1024;
const MIME = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function storeUpload(organizationId: string, file: File) {
  if (!(file instanceof File) || !MIME.includes(file.type)) throw new BusinessError("INVALID_FILE");
  if (file.size > MAX_BYTES) throw new BusinessError("FILE_TOO_LARGE");
  const data = Buffer.from(await file.arrayBuffer());
  return db.media.create({ data: { organizationId, mimeType: file.type, data, size: data.length } });
}

