import { afterEach, describe, expect, it } from "vitest";
import { basetenApiKey, envStatus, metaApiKey, sparkProvider } from "@/lib/env";

const KEYS = [
  "BASETEN_API_KEY",
  "BASETEN_MODEL",
  "META_API_KEY",
  "MODEL_API_KEY",
  "META_SPARK_MODEL",
  "GLIMMER_URL",
  "GLIMMER_API_KEY",
  "GLIMMER_QUOTA_URL",
] as const;

const saved: Record<string, string | undefined> = {};

function clearKeys() {
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("sparkProvider preference", () => {
  it("prefers Baseten when both keys are set", () => {
    clearKeys();
    process.env.BASETEN_API_KEY = "bt-test";
    process.env.META_API_KEY = "meta-test";
    expect(sparkProvider()).toBe("baseten");
    expect(basetenApiKey()).toBe("bt-test");
    expect(metaApiKey()).toBe("meta-test");
  });

  it("falls back to Meta when Baseten is unset", () => {
    clearKeys();
    process.env.META_API_KEY = "meta-test";
    expect(sparkProvider()).toBe("meta");
  });

  it("accepts MODEL_API_KEY as Meta alias", () => {
    clearKeys();
    process.env.MODEL_API_KEY = "model-test";
    expect(metaApiKey()).toBe("model-test");
    expect(sparkProvider()).toBe("meta");
  });

  it("envStatus exposes booleans only", () => {
    clearKeys();
    process.env.BASETEN_API_KEY = "bt-test";
    process.env.GLIMMER_URL = "https://example.modal.run";
    const status = envStatus();
    expect(status.BASETEN_API_KEY).toBe(true);
    expect(status.META_API_KEY).toBe(false);
    expect(status.spark_provider).toBe("baseten");
    expect(status.GLIMMER_URL).toBe(true);
    expect(JSON.stringify(status)).not.toContain("bt-test");
  });
});
