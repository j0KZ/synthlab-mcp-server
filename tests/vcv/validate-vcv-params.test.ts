import { describe, it, expect } from "vitest";
import { validateVcvParams } from "../../src/vcv/validate-vcv-params.js";

describe("validateVcvParams", () => {
  it("throws on empty modules array", () => {
    expect(() => validateVcvParams({ modules: [] })).toThrow(
      /must contain at least one module/,
    );
  });

  it("coerces empty cables array to undefined", () => {
    const input: Record<string, unknown> = {
      modules: [{ plugin: "Fundamental", model: "VCO" }],
      cables: [],
    };
    validateVcvParams(input);
    expect(input.cables).toBeUndefined();
  });

  it("coerces boolean plugin to 'Fundamental'", () => {
    const input: Record<string, unknown> = {
      modules: [{ plugin: true, model: "VCO" }],
    };
    validateVcvParams(input);
    expect((input.modules as any[])[0].plugin).toBe("Fundamental");
  });

  it("coerces boolean model to 'VCO'", () => {
    const input: Record<string, unknown> = {
      modules: [{ plugin: "Fundamental", model: false }],
    };
    validateVcvParams(input);
    expect((input.modules as any[])[0].model).toBe("VCO");
  });

  it("coerces empty params object to undefined", () => {
    const input: Record<string, unknown> = {
      modules: [{ plugin: "Fundamental", model: "VCO", params: {} }],
    };
    validateVcvParams(input);
    expect((input.modules as any[])[0].params).toBeUndefined();
  });

  it("passes valid input unchanged", () => {
    const input: Record<string, unknown> = {
      modules: [{ plugin: "Fundamental", model: "VCO", params: { Frequency: 12 } }],
      cables: [{ from: { module: 0, port: "Saw" }, to: { module: 0, port: "In" } }],
    };
    validateVcvParams(input);
    expect(input.cables).toBeDefined();
    expect((input.modules as any[])[0].params).toEqual({ Frequency: 12 });
  });

  it("preserves modules with content", () => {
    const mods = [
      { plugin: "Fundamental", model: "VCO" },
      { plugin: "Core", model: "AudioInterface2" },
    ];
    const input: Record<string, unknown> = { modules: mods };
    validateVcvParams(input);
    expect((input.modules as any[]).length).toBe(2);
  });

  it("preserves cables with content", () => {
    const input: Record<string, unknown> = {
      modules: [{ plugin: "Fundamental", model: "VCO" }],
      cables: [{ from: { module: 0, port: "Saw" }, to: { module: 0, port: "In" } }],
    };
    validateVcvParams(input);
    expect((input.cables as any[]).length).toBe(1);
  });
});
