import { NextResponse } from "next/server";
import { metaApiKey, missingEnv } from "@/lib/env";
import { badRequest, upstreamError } from "@/lib/http";
import { InputError, readImageInput } from "@/lib/image";
import { segmentImage } from "@/lib/sam";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!metaApiKey()) return missingEnv("META_API_KEY", "segmentation (SAM 3.1)");

  let input;
  try {
    input = await readImageInput(req);
  } catch (e) {
    if (e instanceof InputError) return badRequest(e.message);
    throw e;
  }
  const phrase = (input.fields.phrase || "").trim();
  if (!phrase) return badRequest('"phrase" is required: one short noun phrase, e.g. "toilet flapper"');
  if (phrase.length > 80) return badRequest('"phrase" must be a short noun phrase (<= 80 chars)');

  try {
    const result = await segmentImage(input.dataUrl, phrase);
    return NextResponse.json(result);
  } catch (e) {
    return upstreamError("meta:sam", e);
  }
}
