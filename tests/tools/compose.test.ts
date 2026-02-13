/**
 * Integration tests for compose_patch tool handler.
 */

import { describe, it, expect } from "vitest";
import { executeComposePatch } from "../../src/tools/compose.js";

describe("executeComposePatch", () => {
  it("techno genre produces valid Pd content", async () => {
    const result = await executeComposePatch({ genre: "techno" });
    expect(result).toContain("Composition Summary");
    expect(result).toContain("Genre: techno");
    expect(result).toContain("#N canvas");
  });

  it("ambient + ethereal mood succeeds", async () => {
    const result = await executeComposePatch({
      genre: "ambient",
      mood: "ethereal",
    });
    expect(result).toContain("Composition Summary");
    expect(result).toContain("#N canvas");
  });

  it("all options specified succeeds", async () => {
    const result = await executeComposePatch({
      genre: "dnb",
      tempo: 175,
      mood: "aggressive",
      key: { root: "E", scale: "minor" },
      instruments: [
        { role: "drums" },
        { role: "bass" },
        { role: "arpeggio" },
      ],
      effects: ["reverb"],
    });
    expect(result).toContain("Composition Summary");
    expect(result).toContain("Genre: dnb");
    expect(result).toContain("#N canvas");
  });

  it("unknown genre returns error message", async () => {
    await expect(
      executeComposePatch({ genre: "reggae" }),
    ).rejects.toThrow(/Invalid genre/);
  });

  it("empty instruments array coerced to defaults", async () => {
    const result = await executeComposePatch({
      genre: "minimal",
      instruments: [],
    });
    // Empty array coerced → uses genre default instruments
    expect(result).toContain("Composition Summary");
    expect(result).toContain("#N canvas");
  });

  it("boolean mood coerced to undefined (uses genre default)", async () => {
    const result = await executeComposePatch({
      genre: "house",
      mood: true as any,
    });
    expect(result).toContain("Composition Summary");
    expect(result).toContain("#N canvas");
  });

  it("controller config passed through", async () => {
    const result = await executeComposePatch({
      genre: "techno",
      controller: { device: "k2" },
    });
    expect(result).toContain("_controller.pd");
    expect(result).toContain("#N canvas");
  });

  it("invalid instrument role throws", async () => {
    await expect(
      executeComposePatch({
        genre: "techno",
        instruments: [{ role: "theremin" }],
      }),
    ).rejects.toThrow(/Invalid instrument role/);
  });

  it("invalid mood throws", async () => {
    await expect(
      executeComposePatch({ genre: "techno", mood: "happy" }),
    ).rejects.toThrow(/Invalid mood/);
  });

  it("invalid tempo throws", async () => {
    await expect(
      executeComposePatch({ genre: "techno", tempo: "fast" as any }),
    ).rejects.toThrow(/Invalid tempo/);
  });

  it("empty effects array coerced to defaults", async () => {
    const result = await executeComposePatch({
      genre: "techno",
      effects: [],
    });
    expect(result).toContain("#N canvas");
  });

  it("controller with custom mappings succeeds", async () => {
    const result = await executeComposePatch({
      genre: "techno",
      controller: {
        device: "k2",
        midiChannel: 2,
        mappings: [
          { control: "fader1", module: "drums", parameter: "volume" },
        ],
      },
    });
    expect(result).toContain("_controller.pd");
    expect(result).toContain("#N canvas");
  });

  it("summary includes all specified fields", async () => {
    const result = await executeComposePatch({
      genre: "ambient",
      tempo: 80,
      mood: "ethereal",
      key: { root: "D", scale: "minor" },
      instruments: [{ role: "pad" }],
      effects: ["reverb"],
      controller: { device: "k2" },
    });
    expect(result).toContain("Tempo: 80 BPM");
    expect(result).toContain("Mood: ethereal");
    expect(result).toContain("Key: D minor");
    expect(result).toContain("Instruments: pad");
    expect(result).toContain("Effects: reverb");
    expect(result).toContain("Controller: k2");
  });

  it("every genre builds end-to-end", async () => {
    const genres = [
      "ambient", "techno", "house", "dnb", "experimental",
      "idm", "minimal", "drone", "noise",
    ];
    for (const genre of genres) {
      const result = await executeComposePatch({ genre });
      expect(result).toContain("#N canvas");
    }
  });
});
