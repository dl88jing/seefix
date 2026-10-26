import { NextResponse } from "next/server";
import { MODELS, metaApiKey, missingEnv } from "@/lib/env";
import { badRequest, upstreamError } from "@/lib/http";
import { InputError, readImageInput } from "@/lib/image";
import { metaClient } from "@/lib/meta";
import { ApplianceID, ApplianceIDJsonSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You read appliance and fixture model plates (rating labels, data plates, stickers inside tanks or doors).
Transcribe brand, model and serial exactly as printed. Never guess: use null for any field you cannot read.
appliance_family is a short lowercase noun (toilet, dishwasher, washer, dryer, refrigerator, water heater, furnace, garbage disposal, faucet, unknown).
confidence is your 0..1 confidence that brand and model are read correctly.`;

export async function POST(req: Request) {
  if (!metaApiKey()) return missingEnv("META_API_KEY", "appliance identification (Muse Spark)");

  let input;
  try {
    input = await readImageInput(req);
  } catch (e) {
    if (e instanceof InputError) return badRequest(e.message);
    throw e;
  }

  try {
    const client = metaClient();
    const completion = await client.chat.completions.create({
      model: MODELS.spark,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: "Identify the appliance from this model plate photo." },
            { type: "image_url", image_url: { url: input.dataUrl } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "appliance_id", strict: true, schema: ApplianceIDJsonSchema as unknown as Record<string, unknown> },
      },
    });

    const content = completion.choices[0]?.message?.content ?? "";
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "invalid_model_output", message: "model did not return JSON", content }, { status: 502 });
    }
    const parsed = ApplianceID.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "schema_mismatch", issues: parsed.error.issues, content: raw },
        { status: 502 },
      );
    }
    return NextResponse.json({ model: MODELS.spark, appliance: parsed.data, usage: completion.usage ?? null });
  } catch (e) {
    return upstreamError("meta:" + MODELS.spark, e);
  }
}
