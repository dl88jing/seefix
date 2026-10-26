import { NextResponse } from "next/server";
import { MODELS, missingEnv } from "@/lib/env";
import { badRequest, upstreamError } from "@/lib/http";
import { InputError, readImageInput } from "@/lib/image";
import { SafetyJsonSchema, SafetyVerdict } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300; // Glimmer on Modal may cold-start

const SYSTEM = `You are the safety gate for a home-repair copilot. Look at the photo and the planned step.
Flag a hazard if the step or scene risks injury or damage: live electrical work, gas lines or smell of gas, scalding water, refrigerant, carbon monoxide, structural load, water near outlets, sewage exposure, sharp/crush risk, or work that legally requires a licensed pro.
severity: none | low | medium | high | critical. Use critical for anything that should stop the user immediately (gas, live mains, CO).
reason: one or two plain sentences a homeowner understands.
Respond only with JSON matching the schema.`;

export async function POST(req: Request) {
  const base = process.env.GLIMMER_URL;
  if (!base) return missingEnv("GLIMMER_URL", "the open-weights safety gate (Muse Glimmer on Modal)");

  let input;
  try {
    input = await readImageInput(req);
  } catch (e) {
    if (e instanceof InputError) return badRequest(e.message);
    throw e;
  }
  const step = (input.fields.step || input.fields.context || "").trim() || "General inspection before starting a repair.";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.GLIMMER_API_KEY) headers.Authorization = `Bearer ${process.env.GLIMMER_API_KEY}`;

  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(280_000),
      body: JSON.stringify({
        model: MODELS.glimmer,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: `Planned step: ${step}` },
              { type: "image_url", image_url: { url: input.dataUrl } },
            ],
          },
        ],
        // Glimmer: keep default sampling (temp 1.0); reasoning needs token headroom.
        max_tokens: 4096,
        response_format: { type: "json_schema", json_schema: { name: "safety_verdict", schema: SafetyJsonSchema } },
      }),
    });
    const text = await res.text();
    if (!res.ok) throw Object.assign(new Error(text.slice(0, 500) || res.statusText), { status: res.status });
    const data = JSON.parse(text) as { choices?: { message?: { content?: string | null } }[] };
    const content = data.choices?.[0]?.message?.content ?? "";
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return NextResponse.json({ error: "invalid_model_output", content }, { status: 502 });
    }
    const parsed = SafetyVerdict.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: "schema_mismatch", issues: parsed.error.issues, content: raw }, { status: 502 });
    return NextResponse.json({ model: MODELS.glimmer, ...parsed.data });
  } catch (e) {
    return upstreamError("glimmer", e);
  }
}
