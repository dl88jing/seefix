import { afterEach, describe, expect, it, vi } from "vitest";
import { InputError, parseImageDataUrl } from "@/lib/image";
import { VerifyJsonSchema, VerifyVerdict } from "@/lib/schemas";

const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("VerifyVerdict", () => {
  it("accepts a done verdict", () => {
    const v = VerifyVerdict.parse({ verdict: "done", confidence: 0.8, evidence: "Chain clipped with slack.", next_action: "Turn the water back on." });
    expect(v.verdict).toBe("done");
  });
  it("rejects unknown verdicts and out-of-range confidence", () => {
    expect(() => VerifyVerdict.parse({ verdict: "fixed", confidence: 0.5, evidence: "", next_action: "" })).toThrow();
    expect(() => VerifyVerdict.parse({ verdict: "unclear", confidence: 2, evidence: "", next_action: "" })).toThrow();
  });
  it("JSON schema mirrors the zod enum and required keys", () => {
    expect(VerifyJsonSchema.properties.verdict.enum).toEqual(["done", "not_done", "unclear"]);
    expect([...VerifyJsonSchema.required].sort()).toEqual(["confidence", "evidence", "next_action", "verdict"]);
  });
});

describe("parseImageDataUrl", () => {
  it("accepts a png data URL", () => {
    expect(parseImageDataUrl(PNG_1PX, "before").mime).toBe("image/png");
  });
  it("names the field in errors", () => {
    expect(() => parseImageDataUrl("https://example.com/x.jpg", "before")).toThrow(/"before"/);
    expect(() => parseImageDataUrl(42, "before")).toThrow(InputError);
  });
});

describe("POST /api/verify input checks (no keys, no network)", () => {
  afterEach(() => vi.unstubAllEnvs());

  async function call(body: unknown) {
    vi.stubEnv("BASETEN_API_KEY", "test-not-a-real-key");
    const { POST } = await import("@/app/api/verify/route");
    return POST(new Request("http://localhost/api/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  }

  it("requires step", async () => {
    const res = await call({ image: PNG_1PX });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/step/);
  });
  it("rejects a malformed before image", async () => {
    const res = await call({ image: PNG_1PX, step: "chain clipped", before: "not-a-data-url" });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/before/);
  });
});
