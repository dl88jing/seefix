import { describe, expect, it } from "vitest";
import { ApplianceID, SafetyVerdict } from "@/lib/schemas";

describe("ApplianceID", () => {
  it("accepts a full plate read", () => {
    const parsed = ApplianceID.parse({
      brand: "American Standard",
      model: "Cadet 3",
      serial: "AS-C3-998877",
      appliance_family: "toilet",
      confidence: 0.92,
    });
    expect(parsed.appliance_family).toBe("toilet");
    expect(parsed.confidence).toBeCloseTo(0.92);
  });

  it("allows null brand/model/serial when unreadable", () => {
    const parsed = ApplianceID.parse({
      brand: null,
      model: null,
      serial: null,
      appliance_family: "unknown",
      confidence: 0,
    });
    expect(parsed.brand).toBeNull();
  });

  it("rejects confidence outside 0..1", () => {
    expect(() =>
      ApplianceID.parse({
        brand: "x",
        model: "y",
        serial: null,
        appliance_family: "toilet",
        confidence: 1.5,
      }),
    ).toThrow();
  });
});

describe("SafetyVerdict", () => {
  it("accepts a no-hazard verdict", () => {
    const v = SafetyVerdict.parse({
      hazard: false,
      severity: "none",
      reason: "Normal toilet prep step.",
    });
    expect(v.hazard).toBe(false);
  });

  it("rejects unknown severity", () => {
    expect(() =>
      SafetyVerdict.parse({ hazard: true, severity: "extreme", reason: "nope" }),
    ).toThrow();
  });
});
