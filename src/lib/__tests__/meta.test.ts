import { describe, expect, it } from "vitest";
import { sparkMessageText } from "@/lib/meta";

describe("sparkMessageText", () => {
  it("prefers final content over reasoning", () => {
    const { text, reasoningChars } = sparkMessageText({
      content: ' {"brand":"x"} ',
      reasoning_content: "thinking " + "x".repeat(100),
    });
    expect(text).toBe('{"brand":"x"}');
    expect(reasoningChars).toBeGreaterThan(0);
  });

  it("reports empty content when only reasoning ran", () => {
    const { text, reasoningChars } = sparkMessageText({
      content: null,
      reasoning_content: "a".repeat(50),
    });
    expect(text).toBe("");
    expect(reasoningChars).toBe(50);
  });

  it("handles missing message", () => {
    expect(sparkMessageText(undefined)).toEqual({ text: "", reasoningChars: 0 });
  });
});
