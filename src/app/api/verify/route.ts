import { NextResponse } from "next/server";
import { MODELS, sparkMissingEnvName, sparkProvider, missingEnv } from "@/lib/env";
import { badRequest, upstreamError } from "@/lib/http";
import { InputError, parseImageDataUrl, readImageInput } from "@/lib/image";
import { sparkClient, sparkMessageText } from "@/lib/meta";
import { sparkRateLimit } from "@/lib/ratelimit";
import { VerifyJsonSchema, VerifyVerdict } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are the "check my work" step of a home-repair copilot.
You get the step the user just finished (and the expected result), an AFTER photo, and sometimes a BEFORE photo.
Decide only from what is visible. Never assume a hidden part is correct.
verdict: "done" only if the after photo clearly shows the expected result; "not_done" if it visibly does not; "unclear" if the relevant part is not visible, out of focus, or the photo does not match the step.
confidence: 0..1. evidence: one or two plain sentences pointing at what you see. next_action: one concrete instruction (e.g. "Shorten the chain by one link and retake the photo" or "Done: turn the water back on").`;

export async function POST(req: Request) {
  const provider = sparkProvider();
  if (!provider) return missingEnv(sparkMissingEnvName(), "fix verification (Muse Spark)");

  let input;
  let before: string | null = null;
  try {
    input = await readImageInput(req);
    if (input.fields.before) before = parseImageDataUrl(input.fields.before, "before").dataUrl;
  } catch (e) {
    if (e instanceof InputError) return badRequest(e.message);
    throw e;
  }
  const step = (input.fields.step || "").trim();
  if (!step) return badRequest('"step" is required, e.g. "Flapper chain clipped with about 1/2 inch of slack"');
  if (step.length > 500) return badRequest('"step" must be 500 characters or fewer');

  // Meter before spending Baseten / Meta credits (shares the identify bucket).
  const rl = await sparkRateLimit(req);
  if (rl.deny) return rl.deny;

  const content: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [
    { type: "text", text: `Step the user says is finished / expected result: ${step}` },
  ];
  if (before) {
    content.push({ type: "text", text: "BEFORE photo:" }, { type: "image_url", image_url: { url: before } });
  }
  content.push({ type: "text", text: "AFTER photo:" }, { type: "image_url", image_url: { url: input.dataUrl } });

  try {
    const completion = await sparkClient().chat.completions.create({
      model: MODELS.spark,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
      // Reasoning model: leave headroom so content is not null.
      max_tokens: 4096,
      response_format: {
        type: "json_schema",
        json_schema: { name: "verify_verdict", strict: true, schema: VerifyJsonSchema as unknown as Record<string, unknown> },
      },
    });
    const message = completion.choices[0]?.message as { content?: string | null; reasoning_content?: string | null } | undefined;
    const { text, reasoningChars } = sparkMessageText(message);
    if (!text) {
      return NextResponse.json(
        {
          error: "invalid_model_output",
          message: "model returned empty content (raise max_tokens if reasoning_chars is large)",
          reasoning_chars: reasoningChars,
          finish_reason: completion.choices[0]?.finish_reason ?? null,
        },
        { status: 502 },
      );
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "invalid_model_output", message: "model did not return JSON", content: text }, { status: 502 });
    }
    const parsed = VerifyVerdict.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "schema_mismatch", issues: parsed.error.issues, content: raw }, { status: 502 });
    }
    return NextResponse.json(
      {
        model: MODELS.spark,
        provider,
        step,
        compared_with_before: !!before,
        ...parsed.data,
        usage: completion.usage ?? null,
      },
      { headers: rl.headers },
    );
  } catch (e) {
    return upstreamError(`spark:${provider}:` + MODELS.spark, e);
  }
}
