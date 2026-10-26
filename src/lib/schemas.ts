import { z } from "zod";

export const ApplianceID = z.object({
  brand: z.string().nullable(),
  model: z.string().nullable(),
  serial: z.string().nullable(),
  appliance_family: z.string(),
  confidence: z.number().min(0).max(1),
});
export type ApplianceID = z.infer<typeof ApplianceID>;

/** Hand-written JSON Schema mirror for strict structured output. */
export const ApplianceIDJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    brand: { type: ["string", "null"], description: "Manufacturer as printed on the plate, or null if unreadable." },
    model: { type: ["string", "null"], description: "Model number exactly as printed (keep dashes/letters), or null." },
    serial: { type: ["string", "null"], description: "Serial number exactly as printed, or null." },
    appliance_family: {
      type: "string",
      description:
        "Short lowercase family, e.g. toilet, dishwasher, washer, dryer, refrigerator, water heater, furnace, garbage disposal, faucet, unknown.",
    },
    confidence: { type: "number", description: "0..1 confidence that brand+model are read correctly." },
  },
  required: ["brand", "model", "serial", "appliance_family", "confidence"],
} as const;

export const Severity = z.enum(["none", "low", "medium", "high", "critical"]);

export const SafetyVerdict = z.object({
  hazard: z.boolean(),
  severity: Severity,
  reason: z.string(),
});
export type SafetyVerdict = z.infer<typeof SafetyVerdict>;

export const SafetyJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    hazard: { type: "boolean" },
    severity: { type: "string", enum: ["none", "low", "medium", "high", "critical"] },
    reason: { type: "string" },
  },
  required: ["hazard", "severity", "reason"],
} as const;
