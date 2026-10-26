import { NextResponse } from "next/server";
import { MODELS, metaApiKey, missingEnv } from "@/lib/env";
import { badRequest, upstreamError } from "@/lib/http";
import { InputError, readImageInput } from "@/lib/image";
import { metaPost } from "@/lib/meta";

export const runtime = "nodejs";
export const maxDuration = 120;

type EditResponse = { data?: { b64_json?: string; url?: string; revised_prompt?: string }[]; output_format?: string };

const STYLE =
  "Keep the real photo as the base. Add a clean, minimal instruction-card overlay: bold arrows and short labels, high contrast, no extra objects, no brand logos.";

export async function POST(req: Request) {
  if (!metaApiKey()) return missingEnv("META_API_KEY", "instruction card editing (Muse Image)");

  let input;
  try {
    input = await readImageInput(req);
  } catch (e) {
    if (e instanceof InputError) return badRequest(e.message);
    throw e;
  }
  const instruction = (input.fields.instruction || "").trim();
  if (!instruction) return badRequest('"instruction" is required, e.g. "Label the flapper chain and show it clipped with 1/2 inch slack"');
  if (instruction.length > 1000) return badRequest('"instruction" is too long (max 1000 chars)');

  try {
    const res = await metaPost<EditResponse>(
      "/images/edits",
      {
        model: MODELS.image,
        prompt: `${instruction}\n\n${STYLE}`,
        images: [{ image_url: input.dataUrl }],
        n: 1,
        response_format: "b64_json",
        output_format: "png",
      },
      115_000,
    );
    const item = res.data?.[0];
    if (!item?.b64_json) {
      return NextResponse.json({ error: "empty_result", message: "Muse Image returned no image" }, { status: 502 });
    }
    const fmt = res.output_format || "png";
    return NextResponse.json({
      model: MODELS.image,
      image: `data:image/${fmt};base64,${item.b64_json}`,
      revised_prompt: item.revised_prompt ?? null,
    });
  } catch (e) {
    return upstreamError("meta:" + MODELS.image, e);
  }
}
