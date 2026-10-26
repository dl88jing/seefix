/**
 * Accepts an image from either multipart/form-data (field "image") or a JSON
 * body ({ image: "data:image/...;base64,..." }) and normalizes it to a data URL.
 */

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export type ParsedInput = {
  dataUrl: string;
  mime: string;
  bytes: number;
  fields: Record<string, string>;
};

export class InputError extends Error {}

export async function readImageInput(req: Request): Promise<ParsedInput> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("image");
    if (!file || typeof file === "string") throw new InputError('multipart field "image" (file) is required');
    const mime = file.type || "image/jpeg";
    if (!ALLOWED.has(mime)) throw new InputError(`unsupported image type ${mime}`);
    if (file.size > MAX_BYTES) throw new InputError(`image too large (${file.size} bytes, max ${MAX_BYTES})`);
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const fields: Record<string, string> = {};
    for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v;
    return { dataUrl: `data:${mime};base64,${b64}`, mime, bytes: file.size, fields };
  }
  if (ct.includes("application/json")) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.image !== "string") throw new InputError('JSON field "image" (data URL) is required');
    const m = /^data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(body.image);
    if (!m) throw new InputError('"image" must be a base64 data URL');
    const mime = m[1].toLowerCase();
    if (!ALLOWED.has(mime)) throw new InputError(`unsupported image type ${mime}`);
    const bytes = Math.floor((m[2].length * 3) / 4);
    if (bytes > MAX_BYTES) throw new InputError(`image too large (${bytes} bytes, max ${MAX_BYTES})`);
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) if (k !== "image" && typeof v === "string") fields[k] = v;
    return { dataUrl: body.image, mime, bytes, fields };
  }
  throw new InputError("send multipart/form-data or application/json");
}
