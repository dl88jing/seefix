import { createHmac } from "crypto";
import { NextResponse } from "next/server";

/**
 * Rate limiting for public GPU / paid-inference routes.
 *
 * Two layers:
 *  1. Authoritative, shared: the `quota` function in modal/glimmer_gate.py keeps
 *     counters in a Modal Dict (one container, serialized), so limits hold across
 *     every Vercel instance. Buckets:
 *       - safety: SAFETY_PER_IP_PER_HOUR / SAFETY_GLOBAL_PER_DAY (defaults 10 / 100)
 *       - spark:  SPARK_PER_IP_PER_HOUR  / SPARK_GLOBAL_PER_DAY  (defaults 20 / 200)
 *  2. Local pre-check: the same per-IP window in this instance's memory, so an
 *     obvious flood is rejected without a network hop.
 *
 * On Vercel, missing/unreachable quota fails closed (no unmetered spend).
 * Locally (not VERCEL), memory-only limits apply so lab work can proceed without
 * the Modal key. IPs are HMAC-hashed before leaving this function; raw IPs are
 * never stored.
 */

const SAFETY_PER_IP = Number(process.env.SAFETY_PER_IP_PER_HOUR || 10);
const SPARK_PER_IP = Number(process.env.SPARK_PER_IP_PER_HOUR || 20);
const SPARK_GLOBAL_LOCAL = Number(process.env.SPARK_GLOBAL_PER_DAY || 200);
const HOUR_MS = 3600_000;
const DAY_MS = 86_400_000;

type Bucket = "safety" | "spark";

const local = new Map<string, number[]>();
let localSparkDay = { day: "", count: 0 };

export function clientIp(req: Request): string {
  // On Vercel, x-real-ip / x-forwarded-for are set by the edge (client values are overwritten).
  const h = req.headers;
  const xff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return h.get("x-real-ip")?.trim() || xff || "unknown";
}

function ipKey(ip: string): string {
  const salt = process.env.RATE_LIMIT_SALT || process.env.GLIMMER_API_KEY || process.env.BASETEN_API_KEY || "seefix";
  return createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

function localCheck(mapKey: string, limit: number, now: number): { ok: boolean; retryAfter: number } {
  const hits = (local.get(mapKey) ?? []).filter((t) => now - t < HOUR_MS);
  if (hits.length >= limit) {
    local.set(mapKey, hits);
    return { ok: false, retryAfter: Math.ceil((hits[0] + HOUR_MS - now) / 1000) };
  }
  hits.push(now);
  local.set(mapKey, hits);
  if (local.size > 5000) for (const k of local.keys()) { local.delete(k); if (local.size <= 4000) break; }
  return { ok: true, retryAfter: 0 };
}

function localSparkGlobal(now: number): { ok: boolean; retryAfter: number } {
  const day = new Date(now).toISOString().slice(0, 10);
  if (localSparkDay.day !== day) localSparkDay = { day, count: 0 };
  if (localSparkDay.count >= SPARK_GLOBAL_LOCAL) {
    const retryAfter = Math.ceil((Date.parse(`${day}T00:00:00.000Z`) + DAY_MS - now) / 1000);
    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }
  localSparkDay.count += 1;
  return { ok: true, retryAfter: 0 };
}

type QuotaReply = {
  allowed: boolean;
  scope?: "ip" | "global";
  retry_after?: number;
  remaining_ip?: number;
  remaining_global?: number;
};

function limited(bucket: Bucket, scope: "ip" | "global", retryAfter: number) {
  const perIp = bucket === "spark" ? SPARK_PER_IP : SAFETY_PER_IP;
  const label = bucket === "spark" ? "Muse Spark identify" : "safety gate";
  const message =
    scope === "ip"
      ? `The live ${label} allows ${perIp} checks per hour per visitor. Please try again later.`
      : `The live ${label} has reached today's demo limit. It resets at midnight UTC.`;
  return NextResponse.json(
    {
      error: "rate_limited",
      scope,
      bucket,
      title: bucket === "spark" ? "Identify limit reached" : "Safety gate limit reached",
      message,
      retry_after: retryAfter,
    },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } },
  );
}

function quotaUnavailable(bucket: Bucket, detail: string) {
  const label = bucket === "spark" ? "identify" : "safety gate";
  return NextResponse.json(
    {
      error: "rate_limiter_unavailable",
      bucket,
      message: `The ${label} rate limiter could not be reached (${detail}); it stays closed rather than run unmetered.`,
    },
    { status: 503 },
  );
}

async function sharedQuotaCheck(
  bucket: Bucket,
  key: string,
): Promise<{ deny: NextResponse | null; headers: Record<string, string> }> {
  const url = process.env.GLIMMER_QUOTA_URL;
  if (!url) {
    return {
      deny: NextResponse.json(
        {
          error: "not_configured",
          missing_env: "GLIMMER_QUOTA_URL",
          message: `The ${bucket} rate limiter is not configured, so the route stays closed.`,
        },
        { status: 503 },
      ),
      headers: {},
    };
  }
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GLIMMER_API_KEY ?? ""}` },
      body: JSON.stringify({ key, bucket }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`quota service HTTP ${res.status}`);
    const q = (await res.json()) as QuotaReply;
    if (!q.allowed) return { deny: limited(bucket, q.scope ?? "global", q.retry_after ?? 3600), headers: {} };
    return {
      deny: null,
      headers: {
        "X-RateLimit-Bucket": bucket,
        "X-RateLimit-Remaining-IP": String(q.remaining_ip ?? ""),
        "X-RateLimit-Remaining-Global": String(q.remaining_global ?? ""),
      },
    };
  } catch (e) {
    return { deny: quotaUnavailable(bucket, (e as Error).message), headers: {} };
  }
}

async function enforce(
  bucket: Bucket,
  req: Request,
  perIp: number,
): Promise<{ deny: NextResponse | null; headers: Record<string, string> }> {
  const key = ipKey(clientIp(req));
  const now = Date.now();
  const pre = localCheck(`${bucket}:${key}`, perIp, now);
  if (!pre.ok) return { deny: limited(bucket, "ip", pre.retryAfter), headers: {} };

  const onVercel = Boolean(process.env.VERCEL);
  if (!onVercel && !process.env.GLIMMER_QUOTA_URL) {
    // Local lab without quota URL: memory-only (still meters this process).
    if (bucket === "spark") {
      const g = localSparkGlobal(now);
      if (!g.ok) return { deny: limited(bucket, "global", g.retryAfter), headers: {} };
    }
    return {
      deny: null,
      headers: { "X-RateLimit-Bucket": bucket, "X-RateLimit-Mode": "local-memory" },
    };
  }

  const shared = await sharedQuotaCheck(bucket, key);
  // Local lab: if the shared quota rejects auth/config, fall back to memory so
  // Baseten e2e still works; production (VERCEL) stays fail-closed. Per-IP was
  // already counted in the pre-check above; only enforce the daily cap here.
  if (shared.deny && !onVercel) {
    const body = (await shared.deny.clone().json().catch(() => null)) as { error?: string } | null;
    if (body?.error === "rate_limiter_unavailable" || body?.error === "not_configured") {
      if (bucket === "spark") {
        const g = localSparkGlobal(now);
        if (!g.ok) return { deny: limited(bucket, "global", g.retryAfter), headers: {} };
      }
      return {
        deny: null,
        headers: { "X-RateLimit-Bucket": bucket, "X-RateLimit-Mode": "local-memory" },
      };
    }
  }
  return shared;
}

/** Returns a response to send if the request must be refused, or null plus headers to attach if allowed. */
export async function safetyRateLimit(req: Request): Promise<{ deny: NextResponse | null; headers: Record<string, string> }> {
  return enforce("safety", req, SAFETY_PER_IP);
}

/** Rate limit for Muse Spark routes (identify) before Baseten / Meta is called. */
export async function sparkRateLimit(req: Request): Promise<{ deny: NextResponse | null; headers: Record<string, string> }> {
  return enforce("spark", req, SPARK_PER_IP);
}
