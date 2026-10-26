import { NextResponse } from "next/server";

export function badRequest(message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: "bad_request", message, ...extra }, { status: 400 });
}

/** Map an upstream (Meta API / Glimmer) failure to a JSON error response. */
export function upstreamError(source: string, err: unknown) {
  const e = err as { status?: number; message?: string; error?: unknown };
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
