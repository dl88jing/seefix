import OpenAI from "openai";
import { META_BASE_URL, metaApiKey, sparkApiKey, sparkBaseURL, sparkProvider } from "./env";

/** OpenAI SDK pointed at the Meta Model API (SAM / Muse Image). */
export function metaClient(): OpenAI {
  const apiKey = metaApiKey();
  if (!apiKey) throw new Error("META_API_KEY missing");
  return new OpenAI({ apiKey, baseURL: META_BASE_URL, maxRetries: 2, timeout: 120_000 });
}

/**
 * OpenAI SDK for Muse Spark. Prefers Baseten (Muse Spark Open) when
 * BASETEN_API_KEY is set; otherwise falls back to the Meta Model API.
 */
export function sparkClient(): OpenAI {
  const apiKey = sparkApiKey();
  const provider = sparkProvider();
  if (!apiKey || !provider) throw new Error("BASETEN_API_KEY or META_API_KEY missing");
  return new OpenAI({
    apiKey,
    baseURL: sparkBaseURL(),
    maxRetries: 2,
    // Reasoning models need headroom; cold paths can be slow.
    timeout: 180_000,
  });
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
    const upstream = (json as { error?: { message?: string; code?: string; type?: string } } | null)?.error;
    const msg = upstream?.message ?? (text.slice(0, 500) || res.statusText);
    throw Object.assign(new Error(msg), { status: res.status, code: upstream?.code, type: upstream?.type });
  }
  return json as T;
}

/**
 * Muse Spark Open (and Glimmer) are reasoning models: the final answer is in
 * `content`, while `reasoning_content` holds the chain of thought. When
 * max_tokens is too small, `content` can be null even though reasoning ran.
 */
export function sparkMessageText(message: {
  content?: string | null;
  reasoning_content?: string | null;
} | null | undefined): { text: string; reasoningChars: number } {
  const text = (message?.content ?? "").trim();
  const reasoningChars = (message?.reasoning_content ?? "").length;
  return { text, reasoningChars };
}
