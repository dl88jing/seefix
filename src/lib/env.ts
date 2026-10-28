import { NextResponse } from "next/server";

/**
 * Environment access. Every route checks its own env vars and returns a
 * 503 JSON naming the missing var instead of failing or faking a result.
 *
 * Muse Spark (identify) prefers Baseten when BASETEN_API_KEY is set
 * (Meta Muse Spark Open via OpenAI-compatible inference). SAM 3.1 and
 * Muse Image still require the Meta Model API key.
 */

export function metaApiKey(): string | undefined {
  // META_API_KEY is the canonical name for SeeFix. The Meta docs call it
  // MODEL_API_KEY, so accept that as a fallback.
  return process.env.META_API_KEY || process.env.MODEL_API_KEY || undefined;
}

export function basetenApiKey(): string | undefined {
  return process.env.BASETEN_API_KEY || undefined;
}

/** Which backend will serve Muse Spark chat completions. */
export function sparkProvider(): "baseten" | "meta" | null {
  if (basetenApiKey()) return "baseten";
  if (metaApiKey()) return "meta";
  return null;
}

export function sparkApiKey(): string | undefined {
  return basetenApiKey() || metaApiKey();
}

export const META_BASE_URL = process.env.META_BASE_URL || "https://api.meta.ai/v1";

export const BASETEN_BASE_URL = process.env.BASETEN_BASE_URL || "https://inference.baseten.co/v1";

/** OpenAI-compatible base URL for Muse Spark (Baseten preferred). */
export function sparkBaseURL(): string {
  return basetenApiKey() ? BASETEN_BASE_URL : META_BASE_URL;
}

/**
 * Model ids. Spark id flips to the Baseten Muse Spark Open id when that
 * provider is configured (Baseten only accepts that exact model).
 */
export const MODELS = {
  spark: basetenApiKey()
    ? process.env.BASETEN_MODEL || "meta-models/muse-spark-open-1026"
    : process.env.META_SPARK_MODEL || "muse-spark-1.3",
  sam: process.env.META_SAM_MODEL || "sam-3.1",
  image: process.env.META_IMAGE_MODEL || "muse-image-1.0",
  glimmer: process.env.GLIMMER_MODEL || "muse-glimmer",
} as const;

/** Env var name to report when Spark is not configured. */
export function sparkMissingEnvName(): string {
  return "BASETEN_API_KEY";
}

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
    BASETEN_API_KEY: Boolean(basetenApiKey()),
    META_API_KEY: Boolean(metaApiKey()),
    spark_provider: sparkProvider(),
    GLIMMER_URL: Boolean(process.env.GLIMMER_URL),
    GLIMMER_API_KEY: Boolean(process.env.GLIMMER_API_KEY),
    GLIMMER_QUOTA_URL: Boolean(process.env.GLIMMER_QUOTA_URL),
  };
}
