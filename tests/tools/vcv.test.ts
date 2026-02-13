import { describe, it, expect } from "vitest";
import { executeGenerateVcv, formatVcvResult } from "../../src/tools/vcv.js";

describe("executeGenerateVcv", () => {
  it("returns valid content + patch for a VCO→Audio chain", async () => {
    const result = await executeGenerateVcv({
      modules: [
        { plugin: "Fundamental", model: "VCO" },
        { plugin: "Core", model: "AudioInterface2" },
      ],
      cables: [
        { from: { module: 0, port: "Saw" }, to: { module: 1, port: "Audio 1" } },
      ],
    });

    expect(result.content).toBeTruthy();
    expect(result.patch.modules).toHaveLength(2);
    expect(result.patch.cables).toHaveLength(1);
    expect(result.writtenTo).toBeUndefined();

    // Content should be valid JSON
    const parsed = JSON.parse(result.content);
    expect(parsed.version).toBe("2.6.6");
  });

  it("generates single module without cables", async () => {
    const result = await executeGenerateVcv({
      modules: [{ plugin: "Fundamental", model: "VCO" }],
    });

    expect(result.patch.modules).toHaveLength(1);
    expect(result.patch.cables).toHaveLength(0);
  });

  it("throws for unknown plugin", async () => {
    await expect(
      executeGenerateVcv({
        modules: [{ plugin: "NonexistentPlugin", model: "VCO" }],
      }),
    ).rejects.toThrow(/Unknown VCV plugin/);
  });

  it("throws for unknown port in cable", async () => {
    await expect(
      executeGenerateVcv({
        modules: [
          { plugin: "Fundamental", model: "VCO" },
          { plugin: "Core", model: "AudioInterface2" },
        ],
        cables: [
          { from: { module: 0, port: "FakePort" }, to: { module: 1, port: "Audio 1" } },
        ],
      }),
    ).rejects.toThrow(/Unknown output port/);
  });

  it("throws for outputPath without .vcv extension", async () => {
    await expect(
      executeGenerateVcv({
        modules: [{ plugin: "Fundamental", model: "VCO" }],
        outputPath: "C:\\test\\patch.json",
      }),
    ).rejects.toThrow(/must end with .vcv/);
  });

  it("throws for outputPath with path traversal", async () => {
    await expect(
      executeGenerateVcv({
        modules: [{ plugin: "Fundamental", model: "VCO" }],
        outputPath: "C:\\test\\..\\..\\etc\\patch.vcv",
      }),
    ).rejects.toThrow(/path traversal/);
  });
});

describe("formatVcvResult", () => {
  it("returns text with module summary and JSON block", () => {
    const text = formatVcvResult({
      content: '{"version":"2.6.6","modules":[],"cables":[]}',
      patch: {
        version: "2.6.6",
        modules: [
          {
            id: 1, plugin: "Fundamental", model: "VCO", version: "2.6.4",
            params: [{ id: 2, value: 0 }], pos: [0, 0],
            leftModuleId: null, rightModuleId: null,
          },
        ],
        cables: [],
      },
    });

    expect(text).toContain("1 module(s)");
    expect(text).toContain("0 cable(s)");
    expect(text).toContain("Fundamental::VCO");
    expect(text).toContain("```json");
    expect(text).toContain("Do NOT run bash");
  });

  it("includes file path when writtenTo is set", () => {
    const text = formatVcvResult({
      content: "{}",
      patch: { version: "2.6.6", modules: [], cables: [] },
      writtenTo: "C:\\test\\patch.vcv",
    });

    expect(text).toContain("FILE WRITTEN SUCCESSFULLY");
    expect(text).toContain("C:\\test\\patch.vcv");
  });
});
