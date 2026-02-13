import { describe, it, expect } from "vitest";
import { executeListVcvModules } from "../../src/tools/list-vcv.js";

describe("executeListVcvModules", () => {
  it("lists all modules in Fundamental with version", () => {
    const result = executeListVcvModules({ plugin: "Fundamental" });
    expect(result).toMatch(/^# Fundamental v[\d.]+ \(\d+ modules\)/);
    expect(result).toContain("VCO");
    expect(result).toContain("LFO");
  });

  it("lists AudibleInstruments via alias 'mi'", () => {
    const result = executeListVcvModules({ plugin: "mi" });
    expect(result).toMatch(/^# AudibleInstruments v[\d.]+/);
    expect(result).toContain("Clouds");
    expect(result).toContain("Plaits");
  });

  it("returns module detail when module specified", () => {
    const result = executeListVcvModules({ plugin: "Fundamental", module: "VCO" });
    expect(result).toMatch(/# Fundamental v[\d.]+ \/ VCO/);
    expect(result).toContain("Inputs:");
    expect(result).toContain("Outputs:");
    expect(result).toContain("Params:");
  });

  it("returns module detail for Clouds with port names", () => {
    const result = executeListVcvModules({ plugin: "mi", module: "Clouds" });
    expect(result).toMatch(/# AudibleInstruments v[\d.]+ \/ Clouds/);
    expect(result).toContain("FREEZE_INPUT");
    expect(result).toContain("IN_L_INPUT");
  });

  it("resolves module alias in detail view", () => {
    const result = executeListVcvModules({ plugin: "mi", module: "texture_synthesizer" });
    expect(result).toMatch(/# AudibleInstruments v[\d.]+ \/ Clouds/);
  });

  it("coerces empty string module to listing mode", () => {
    const result = executeListVcvModules({ plugin: "Fundamental", module: "" });
    expect(result).toMatch(/^# Fundamental v[\d.]+ \(\d+ modules\)/);
  });

  it("coerces whitespace-only module to listing mode", () => {
    const result = executeListVcvModules({ plugin: "Fundamental", module: "  " });
    expect(result).toMatch(/^# Fundamental v[\d.]+ \(\d+ modules\)/);
  });

  it("throws for unknown plugin", () => {
    expect(() => executeListVcvModules({ plugin: "NonExistent" }))
      .toThrow(/Unknown VCV plugin/);
  });

  it("throws for unknown module", () => {
    expect(() => executeListVcvModules({ plugin: "Fundamental", module: "NonExistent" }))
      .toThrow(/Unknown module/);
  });
});
