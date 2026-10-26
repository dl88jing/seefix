import OpenAI from "openai";
import { META_BASE_URL, metaApiKey } from "./env";

/** OpenAI SDK pointed at the Meta Model API (OpenAI-compatible). */
export function metaClient(): OpenAI {
  const apiKey = metaApiKey();
  if (!apiKey) throw new Error("META_API_KEY missing");
  return new OpenAI({ apiKey, baseURL: META_BASE_URL, maxRetries: 2, timeout: 120_000 });
}

/** Raw JSON POST for endpoints whose Meta request shape differs from the SDK (images/edits). */
export async function metaPost<T>(path: string, body: unknown, timeoutMs = 120_000): Promise<T> {
  const apiKey = metaApiKey();
  if (!apiKey) throw new Error("META_API_KEY missing");
  const res = await fetch(`${META_BASE_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const msg =
      (json as { error?: { message?: string } } | null)?.error?.message ?? text.slice(0, 500) ?? res.statusText;
    throw Object.assign(new Error(msg), { status: res.status });
  }
  return json as T;
}
