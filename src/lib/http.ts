import { NextResponse } from "next/server";

export function badRequest(message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: "bad_request", message, ...extra }, { status: 400 });
}

type UpstreamErr = { status?: number; message?: string; code?: unknown; type?: unknown; error?: unknown };

/**
 * True when the Meta Model API refuses the call because the account's billing
 * is not set up yet (HTTP 402, type "billing_error", code "billing_not_configured").
 * Covers both the OpenAI SDK's APIError and our own metaPost errors.
 */
export function isMetaBillingError(err: unknown): boolean {
  const e = err as UpstreamErr | null;
  if (!e) return false;
  const code = typeof e.code === "string" ? e.code : "";
  const type = typeof e.type === "string" ? e.type : "";
  return (
    e.status === 402 ||
    type === "billing_error" ||
    code === "billing_not_configured" ||
    /billing (verification failed|issue)/i.test(e.message ?? "")
  );
}

/** Friendly fallback while the Meta account has no billing / credits yet. */
export function metaNotActive(source: string, err: unknown) {
  const e = err as UpstreamErr;
  return NextResponse.json(
    {
      error: "meta_api_not_active",
      source,
      title: "Meta API not yet active",
      message:
        "The Meta Model API key is set, but Meta has not activated billing for this account yet (hackathon credits can take up to 2 business days). This feature will start working automatically once it is active. Nothing here is mocked.",
      upstream_status: typeof e?.status === "number" ? e.status : 402,
      upstream_code: typeof e?.code === "string" ? e.code : "billing_not_configured",
    },
    { status: 503, headers: { "Retry-After": "3600" } },
  );
}

/** Map an upstream (Meta API / Glimmer) failure to a JSON error response. */
export function upstreamError(source: string, err: unknown) {
  if ((source.startsWith("meta:") || source.startsWith("spark:meta:")) && isMetaBillingError(err)) return metaNotActive(source, err);
  const e = err as UpstreamErr;
  const status = typeof e?.status === "number" ? e.status : 502;
  // Never echo request headers or keys; only the upstream message.
  return NextResponse.json(
    {
      error: "upstream_error",
      source,
      upstream_status: status,
      message: e?.message ?? String(err),
    },
    { status: [400, 413, 422, 429, 503, 504].includes(status) ? status : 502 },
  );
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}
