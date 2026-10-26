import { NextResponse } from "next/server";
import { MODELS, envStatus } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reports which integrations are configured (booleans only, never values). */
export function GET() {
  return NextResponse.json({ ok: true, configured: envStatus(), models: MODELS });
}
