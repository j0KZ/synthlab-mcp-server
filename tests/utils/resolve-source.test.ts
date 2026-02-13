import { describe, it, expect } from "vitest";
import path from "node:path";
import { resolveSource } from "../../src/utils/resolve-source.js";

const FIXTURES = path.join(import.meta.dirname, "..", "fixtures");

describe("resolveSource", () => {
  it("treats #N canvas prefix as raw text", async () => {
    const raw = "#N canvas 0 0 800 600 12;\n#X obj 50 50 osc~ 440;";
    const result = await resolveSource(raw);
    expect(result.pdText).toBe(raw);
    expect(result.filePath).toBeUndefined();
  });

  it("treats #N prefix as raw text", async () => {
    const raw = "#N struct myStruct float x;";
    const result = await resolveSource(raw);
    expect(result.pdText).toBe(raw);
    expect(result.filePath).toBeUndefined();
  });

  it("handles leading whitespace before #N", async () => {
    const raw = "  \n#N canvas 0 0 400 300 10;";
    const result = await resolveSource(raw);
    expect(result.pdText).toBe(raw);
    expect(result.filePath).toBeUndefined();
  });

  it("reads file from disk when source is a path", async () => {
    const fixturePath = path.join(FIXTURES, "hello-world.pd");
    const result = await resolveSource(fixturePath);
    expect(result.pdText).toContain("#N canvas");
    expect(result.filePath).toBe(path.resolve(fixturePath));
  });

  it("rejects non-existent file path", async () => {
    await expect(resolveSource("/no/such/file.pd")).rejects.toThrow();
  });
});
