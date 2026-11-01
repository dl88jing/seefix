import { describe, expect, it } from "vitest";
import { isMetaBillingError, metaNotActive, upstreamError } from "@/lib/http";

describe("isMetaBillingError", () => {
  it("detects HTTP 402", () => {
    expect(isMetaBillingError({ status: 402, message: "Payment Required" })).toBe(true);
  });

  it("detects billing_not_configured code", () => {
    expect(isMetaBillingError({ status: 400, code: "billing_not_configured" })).toBe(true);
  });

  it("detects billing_error type", () => {
    expect(isMetaBillingError({ status: 402, type: "billing_error" })).toBe(true);
  });

  it("is false for ordinary upstream failures", () => {
    expect(isMetaBillingError({ status: 500, message: "boom" })).toBe(false);
    expect(isMetaBillingError(null)).toBe(false);
  });
});

describe("upstreamError / metaNotActive", () => {
  it("maps Meta billing errors on spark:meta to meta_api_not_active", async () => {
    const res = upstreamError("spark:meta:muse-spark-1.3", {
      status: 402,
      code: "billing_not_configured",
      type: "billing_error",
      message: "billing verification failed",
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("meta_api_not_active");
    expect(body.title).toBe("Meta API not yet active");
  });

  it("does not remap Baseten failures as Meta billing", async () => {
    const res = upstreamError("spark:baseten:meta-models/muse-spark-open-1026", {
      status: 502,
      message: "bad gateway",
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("upstream_error");
    expect(body.source).toContain("baseten");
  });

  it("metaNotActive returns Retry-After", async () => {
    const res = metaNotActive("meta:sam-3.1", { status: 402, code: "billing_not_configured" });
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("3600");
  });
});
