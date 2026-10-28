import { NextResponse } from "next/server";
import { MODELS, sparkMissingEnvName, sparkProvider, missingEnv } from "@/lib/env";
import { badRequest, upstreamError } from "@/lib/http";
import { InputError, readImageInput } from "@/lib/image";
import { sparkClient, sparkMessageText } from "@/lib/meta";
import { sparkRateLimit } from "@/lib/ratelimit";
import { ApplianceID, ApplianceIDJsonSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You read appliance and fixture model plates (rating labels, data plates, stickers inside tanks or doors).
Transcribe brand, model and serial exactly as printed. Never guess: use null for any field you cannot read.
appliance_family is a short lowercase noun (toilet, dishwasher, washer, dryer, refrigerator, water heater, furnace, garbage disposal, faucet, unknown).
confidence is your 0..1 confidence that brand and model are read correctly.`;

export async function POST(req: Request) {
  const provider = sparkProvider();
  if (!provider) return missingEnv(sparkMissingEnvName(), "appliance identification (Muse Spark)");

  let input;
  try {
    input = await readImageInput(req);
  } catch (e) {
    if (e instanceof InputError) return badRequest(e.message);
    throw e;
  }

  // Meter before spending Baseten / Meta credits.
  const rl = await sparkRateLimit(req);
  if (rl.deny) return rl.deny;

  try {
    const client = sparkClient();
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
      // Muse Spark Open is a reasoning model; content can be null if this is too small.
      max_tokens: 4096,
      response_format: {
        type: "json_schema",
        json_schema: { name: "appliance_id", strict: true, schema: ApplianceIDJsonSchema as unknown as Record<string, unknown> },
      },
    });

    const message = completion.choices[0]?.message as {
      content?: string | null;
      reasoning_content?: string | null;
    } | undefined;
    const { text: content, reasoningChars } = sparkMessageText(message);
    if (!content) {
      return NextResponse.json(
        {
          error: "invalid_model_output",
          message:
            "model returned empty content (reasoning models need generous max_tokens; raise max_tokens if reasoning_chars is large)",
          reasoning_chars: reasoningChars,
          finish_reason: completion.choices[0]?.finish_reason ?? null,
        },
        { status: 502 },
      );
    }
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
    return NextResponse.json(
      {
        model: MODELS.spark,
        provider,
        appliance: parsed.data,
        usage: completion.usage ?? null,
        reasoning_chars: reasoningChars || undefined,
      },
      { headers: rl.headers },
    );
  } catch (e) {
    return upstreamError(`spark:${provider}:` + MODELS.spark, e);
  }
}
