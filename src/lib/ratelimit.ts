import { createHmac } from "crypto";
import { NextResponse } from "next/server";

/**
 * Rate limiting for the public Glimmer safety gate (a scale-to-zero H100 on Modal).
 *
 * Two layers:
 *  1. Authoritative, shared: the `quota` function in modal/glimmer_gate.py keeps
 *     counters in a Modal Dict (one container, serialized), so limits hold across
 *     every Vercel instance: SAFETY_PER_IP_PER_HOUR per IP (sliding 1 h window)
 *     and SAFETY_GLOBAL_PER_DAY for the whole site (UTC day).
 *  2. Local pre-check: the same per-IP window in this instance's memory, so an
 *     obvious flood is rejected without a network hop.
 *
 * Fails closed: if the quota service is not configured or unreachable, the
 * GPU is not called. IPs are HMAC-hashed before leaving this function; raw IPs
 * are never stored.
 */

const PER_IP_PER_HOUR = Number(process.env.SAFETY_PER_IP_PER_HOUR || 10);
const HOUR_MS = 3600_000;
const local = new Map<string, number[]>();

export function clientIp(req: Request): string {
  // On Vercel, x-real-ip / x-forwarded-for are set by the edge (client values are overwritten).
  const h = req.headers;
  const xff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return h.get("x-real-ip")?.trim() || xff || "unknown";
}

function ipKey(ip: string): string {
  const salt = process.env.RATE_LIMIT_SALT || process.env.GLIMMER_API_KEY || "seefix";
  return createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32);
}

function localCheck(key: string, now: number): { ok: boolean; retryAfter: number } {
  const hits = (local.get(key) ?? []).filter((t) => now - t < HOUR_MS);
  if (hits.length >= PER_IP_PER_HOUR) {
    local.set(key, hits);
    return { ok: false, retryAfter: Math.ceil((hits[0] + HOUR_MS - now) / 1000) };
  }
  hits.push(now);
  local.set(key, hits);
  if (local.size > 5000) for (const k of local.keys()) { local.delete(k); if (local.size <= 4000) break; }
  return { ok: true, retryAfter: 0 };
}

type QuotaReply = { allowed: boolean; scope?: "ip" | "global"; retry_after?: number; remaining_ip?: number; remaining_global?: number };

function limited(scope: "ip" | "global", retryAfter: number) {
  const message =
    scope === "ip"
      ? `The live safety gate allows ${PER_IP_PER_HOUR} checks per hour per visitor. Please try again later.`
      : "The live safety gate has reached today's demo limit. It resets at midnight UTC.";
  return NextResponse.json(
    { error: "rate_limited", scope, title: "Safety gate limit reached", message, retry_after: retryAfter },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } },
  );
}

/** Returns a response to send if the request must be refused, or null plus headers to attach if allowed. */
export async function safetyRateLimit(req: Request): Promise<{ deny: NextResponse | null; headers: Record<string, string> }> {
  const key = ipKey(clientIp(req));
  const now = Date.now();
  const pre = localCheck(key, now);
  if (!pre.ok) return { deny: limited("ip", pre.retryAfter), headers: {} };

  const url = process.env.GLIMMER_QUOTA_URL;
  if (!url) {
    return {
      deny: NextResponse.json(
        { error: "not_configured", missing_env: "GLIMMER_QUOTA_URL", message: "The safety gate's rate limiter is not configured, so the gate stays closed." },
        { status: 503 },
      ),
      headers: {},
    };
  }
  try {
    const res = await fetch(`${url.replace(/\/+$/, "")}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.GLIMMER_API_KEY ?? ""}` },
      body: JSON.stringify({ key }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`quota service HTTP ${res.status}`);
    const q = (await res.json()) as QuotaReply;
    if (!q.allowed) return { deny: limited(q.scope ?? "global", q.retry_after ?? 3600), headers: {} };
    return {
      deny: null,
      headers: {
        "X-RateLimit-Remaining-IP": String(q.remaining_ip ?? ""),
        "X-RateLimit-Remaining-Global": String(q.remaining_global ?? ""),
      },
    };
  } catch (e) {
    return {
      deny: NextResponse.json(
        { error: "rate_limiter_unavailable", message: `The safety gate's rate limiter could not be reached (${(e as Error).message}); the gate stays closed rather than run unmetered.` },
        { status: 503 },
      ),
      headers: {},
    };
  }
}
