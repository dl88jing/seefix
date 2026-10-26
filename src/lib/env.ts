import { NextResponse } from "next/server";

/**
 * Environment access. Every route checks its own env vars and returns a
 * 503 JSON naming the missing var instead of failing or faking a result.
 */

export function metaApiKey(): string | undefined {
  // META_API_KEY is the canonical name for SeeFix. The Meta docs call it
  // MODEL_API_KEY, so accept that as a fallback.
  return process.env.META_API_KEY || process.env.MODEL_API_KEY || undefined;
}

export const META_BASE_URL = process.env.META_BASE_URL || "https://api.meta.ai/v1";

export const MODELS = {
  spark: process.env.META_SPARK_MODEL || "muse-spark-1.3",
  sam: process.env.META_SAM_MODEL || "sam-3.1",
  image: process.env.META_IMAGE_MODEL || "muse-image-1.0",
  glimmer: process.env.GLIMMER_MODEL || "muse-glimmer",
} as const;

export function missingEnv(name: string, purpose: string) {
  return NextResponse.json(
    {
      error: "not_configured",
      missing_env: name,
      message: `${name} is not set on this deployment, so ${purpose} is unavailable. No mock data is returned.`,
    },
    { status: 503 },
  );
}

export function envStatus() {
  return {
    META_API_KEY: Boolean(metaApiKey()),
    GLIMMER_URL: Boolean(process.env.GLIMMER_URL),
    GLIMMER_API_KEY: Boolean(process.env.GLIMMER_API_KEY),
    GLIMMER_QUOTA_URL: Boolean(process.env.GLIMMER_QUOTA_URL),
  };
}
