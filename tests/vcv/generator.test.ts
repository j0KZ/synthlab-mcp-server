import { describe, it, expect } from "vitest";
import { generateVcvPatch, serializeVcvPatch } from "../../src/vcv/generator.js";
import type { VcvPatchSpec, VcvPatchJson } from "../../src/vcv/types.js";

describe("generateVcvPatch", () => {
  it("generates a single module patch", () => {
    const spec: VcvPatchSpec = {
      modules: [{ plugin: "Fundamental", model: "VCO" }],
    };
    const patch = generateVcvPatch(spec);

    expect(patch.version).toBe("2.6.6");
    expect(patch.modules).toHaveLength(1);
    expect(patch.cables).toHaveLength(0);

    const mod = patch.modules[0];
    expect(mod.plugin).toBe("Fundamental");
    expect(mod.model).toBe("VCO");
    expect(mod.version).toBe("2.6.4");
    expect(typeof mod.id).toBe("number");
    expect(mod.id).toBeGreaterThan(0);
    expect(mod.pos).toEqual([0, 0]);
    expect(mod.leftModuleId).toBeNull();
    expect(mod.rightModuleId).toBeNull();
  });

  it("populates default param values from registry", () => {
    const spec: VcvPatchSpec = {
      modules: [{ plugin: "Fundamental", model: "VCO" }],
    };
    const patch = generateVcvPatch(spec);
    const mod = patch.modules[0];

    // Should have params (excluding removed ones)
    expect(mod.params.length).toBeGreaterThan(0);

    // Removed params (MODE_PARAM, FINE_PARAM) should NOT be in output
    const removedIds = new Set([0, 3]); // MODE=0, FINE=3
    for (const p of mod.params) {
      expect(removedIds.has(p.id)).toBe(false);
    }
  });

  it("applies param overrides by label", () => {
    const spec: VcvPatchSpec = {
      modules: [{ plugin: "Fundamental", model: "VCO", params: { Frequency: 12 } }],
    };
    const patch = generateVcvPatch(spec);
    const freqParam = patch.modules[0].params.find((p) => p.id === 2); // FREQ_PARAM
    expect(freqParam?.value).toBe(12);
  });

  it("positions multiple modules left-to-right", () => {
    const spec: VcvPatchSpec = {
      modules: [
        { plugin: "Fundamental", model: "VCO" },
        { plugin: "Fundamental", model: "VCF" },
        { plugin: "Fundamental", model: "VCA" },
      ],
    };
    const patch = generateVcvPatch(spec);

    expect(patch.modules).toHaveLength(3);
    expect(patch.modules[0].pos[0]).toBe(0);
    // Second module starts after VCO's HP width
    expect(patch.modules[1].pos[0]).toBeGreaterThan(0);
    // Third module starts after VCF
    expect(patch.modules[2].pos[0]).toBeGreaterThan(patch.modules[1].pos[0]);
  });

  it("sets adjacency chain for multiple modules", () => {
    const spec: VcvPatchSpec = {
      modules: [
        { plugin: "Fundamental", model: "VCO" },
        { plugin: "Fundamental", model: "VCF" },
      ],
    };
    const patch = generateVcvPatch(spec);

    expect(patch.modules[0].leftModuleId).toBeNull();
    expect(patch.modules[0].rightModuleId).toBe(patch.modules[1].id);
    expect(patch.modules[1].leftModuleId).toBe(patch.modules[0].id);
    expect(patch.modules[1].rightModuleId).toBeNull();
  });

  it("generates unique IDs for all modules and cables", () => {
    const spec: VcvPatchSpec = {
      modules: [
        { plugin: "Fundamental", model: "VCO" },
        { plugin: "Fundamental", model: "VCF" },
      ],
      cables: [
        { from: { module: 0, port: "Saw" }, to: { module: 1, port: "Audio" } },
      ],
    };
    const patch = generateVcvPatch(spec);

    const ids = [
      ...patch.modules.map((m) => m.id),
      ...patch.cables.map((c) => c.id),
    ];
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("resolves cable connections by port label", () => {
    const spec: VcvPatchSpec = {
      modules: [
        { plugin: "Fundamental", model: "VCO" },
        { plugin: "Core", model: "AudioInterface2" },
      ],
      cables: [
        { from: { module: 0, port: "Saw" }, to: { module: 1, port: "Audio 1" } },
      ],
    };
    const patch = generateVcvPatch(spec);

    expect(patch.cables).toHaveLength(1);
    const cable = patch.cables[0];
    expect(cable.outputModuleId).toBe(patch.modules[0].id);
    expect(cable.inputModuleId).toBe(patch.modules[1].id);
    expect(cable.outputId).toBeGreaterThanOrEqual(0);
    expect(cable.inputId).toBe(0);
    expect(cable.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("cycles cable colors", () => {
    const spec: VcvPatchSpec = {
      modules: [
        { plugin: "Fundamental", model: "VCO" },
        { plugin: "Fundamental", model: "VCF" },
        { plugin: "Fundamental", model: "VCA" },
        { plugin: "Core", model: "AudioInterface2" },
      ],
      cables: [
        { from: { module: 0, port: "Saw" }, to: { module: 1, port: "Audio" } },
        { from: { module: 1, port: "Lowpass" }, to: { module: 2, port: "Channel 1" } },
        { from: { module: 2, port: "Channel 1" }, to: { module: 3, port: "Audio 1" } },
      ],
    };
    const patch = generateVcvPatch(spec);

    // 3 cables should have 3 different colors from the cycle
    const colors = patch.cables.map((c) => c.color);
    expect(colors[0]).not.toBe(colors[1]);
    expect(colors[1]).not.toBe(colors[2]);
  });

  it("allows custom cable colors", () => {
    const spec: VcvPatchSpec = {
      modules: [
        { plugin: "Fundamental", model: "VCO" },
        { plugin: "Core", model: "AudioInterface2" },
      ],
      cables: [
        { from: { module: 0, port: "Saw" }, to: { module: 1, port: "Audio 1" }, color: "#ff0000" },
      ],
    };
    const patch = generateVcvPatch(spec);
    expect(patch.cables[0].color).toBe("#ff0000");
  });

  it("throws for out-of-range module index in cable", () => {
    const spec: VcvPatchSpec = {
      modules: [{ plugin: "Fundamental", model: "VCO" }],
      cables: [
        { from: { module: 0, port: "Saw" }, to: { module: 5, port: "In" } },
      ],
    };
    expect(() => generateVcvPatch(spec)).toThrow(/out of range/);
  });

  it("throws for unknown port in cable", () => {
    const spec: VcvPatchSpec = {
      modules: [
        { plugin: "Fundamental", model: "VCO" },
        { plugin: "Core", model: "AudioInterface2" },
      ],
      cables: [
        { from: { module: 0, port: "Nonexistent" }, to: { module: 1, port: "Audio 1" } },
      ],
    };
    expect(() => generateVcvPatch(spec)).toThrow(/Unknown output port/);
  });

  it("uses plugin alias (vcv → Fundamental)", () => {
    const spec: VcvPatchSpec = {
      modules: [{ plugin: "vcv", model: "VCO" }],
    };
    const patch = generateVcvPatch(spec);
    expect(patch.modules[0].plugin).toBe("Fundamental");
  });

  it("throws for duplicate input port connections", () => {
    const spec: VcvPatchSpec = {
      modules: [
        { plugin: "Fundamental", model: "VCO" },
        { plugin: "Fundamental", model: "VCF" },
      ],
      cables: [
        { from: { module: 0, port: "Saw" }, to: { module: 1, port: "Audio" } },
        { from: { module: 0, port: "Sine" }, to: { module: 1, port: "Audio" } },
      ],
    };
    expect(() => generateVcvPatch(spec)).toThrow(/Duplicate connection/);
  });
});

describe("serializeVcvPatch", () => {
  it("produces valid JSON", () => {
    const spec: VcvPatchSpec = {
      modules: [{ plugin: "Fundamental", model: "VCO" }],
    };
    const patch = generateVcvPatch(spec);
    const json = serializeVcvPatch(patch);

    // Should be valid JSON
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe("2.6.6");
    expect(parsed.modules).toHaveLength(1);
  });
});

describe("integration — full signal chain", () => {
  it("generates VCO → VCF → VCA → AudioInterface2 patch", () => {
    const spec: VcvPatchSpec = {
      modules: [
        { plugin: "Fundamental", model: "VCO" },
        { plugin: "Fundamental", model: "VCF" },
        { plugin: "Fundamental", model: "VCA" },
        { plugin: "Core", model: "AudioInterface2" },
      ],
      cables: [
        { from: { module: 0, port: "Saw" }, to: { module: 1, port: "Audio" } },
        { from: { module: 1, port: "Lowpass" }, to: { module: 2, port: "Channel 1" } },
        { from: { module: 2, port: "Channel 1" }, to: { module: 3, port: "Audio 1" } },
      ],
    };

    const patch = generateVcvPatch(spec);
    const json = serializeVcvPatch(patch);

    // Valid JSON
    const parsed = JSON.parse(json) as VcvPatchJson;
    expect(parsed.version).toBe("2.6.6");
    expect(parsed.modules).toHaveLength(4);
    expect(parsed.cables).toHaveLength(3);

    // All modules have IDs
    for (const mod of parsed.modules) {
      expect(typeof mod.id).toBe("number");
      expect(mod.id).toBeGreaterThan(0);
    }

    // All cables reference valid module IDs
    const moduleIds = new Set(parsed.modules.map((m) => m.id));
    for (const cable of parsed.cables) {
      expect(moduleIds.has(cable.outputModuleId)).toBe(true);
      expect(moduleIds.has(cable.inputModuleId)).toBe(true);
    }

    // Modules are positioned left-to-right
    for (let i = 1; i < parsed.modules.length; i++) {
      expect(parsed.modules[i].pos[0]).toBeGreaterThan(parsed.modules[i - 1].pos[0]);
    }
  });
});
