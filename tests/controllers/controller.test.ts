import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";

import { autoMap, type MappableModule } from "../../src/controllers/auto-mapper.js";
import { buildControllerPatch } from "../../src/controllers/pd-controller.js";
import { injectParameterReceivers, type InjectableModule } from "../../src/controllers/param-injector.js";
import { generateK2DeckConfig } from "../../src/controllers/k2-deck-config.js";
import { getDevice } from "../../src/devices/index.js";
import { k2Profile } from "../../src/devices/k2.js";
import { buildPatch, type PatchNodeSpec, type PatchConnectionSpec } from "../../src/core/serializer.js";
import { parsePatch } from "../../src/core/parser.js";
import { buildTemplateWithPorts } from "../../src/templates/index.js";
import { executeCreateRack } from "../../src/tools/rack.js";
import type { ControllerMapping } from "../../src/controllers/types.js";
import type { ParameterDescriptor } from "../../src/templates/port-info.js";

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Create a minimal ParameterDescriptor for testing. */
function param(
  name: string,
  category: ParameterDescriptor["category"],
  overrides: Partial<ParameterDescriptor> = {},
): ParameterDescriptor {
  return {
    name,
    label: name,
    min: 0,
    max: 1,
    default: 0.5,
    unit: "",
    curve: "linear",
    nodeIndex: 0,
    inlet: 0,
    category,
    ...overrides,
  };
}

// ═════════════════════════════════════════════════════════════════════════
// AUTO-MAPPER
// ═════════════════════════════════════════════════════════════════════════

describe("auto-mapper", () => {
  const k2 = k2Profile;

  // 1. Maps faders to amplitude parameters
  it("maps faders to amplitude parameters", () => {
    const modules: MappableModule[] = [
      {
        id: "mixer",
        parameters: [
          param("volume_ch1", "amplitude"),
          param("volume_ch2", "amplitude"),
        ],
      },
    ];

    const mappings = autoMap(modules, k2);

    // Amplitude params should be assigned to fader controls
    const ampMappings = mappings.filter((m) => m.control.category === "amplitude");
    expect(ampMappings.length).toBe(2);
    expect(ampMappings[0].control.name).toBe("fader1");
    expect(ampMappings[0].parameter.name).toBe("volume_ch1");
    expect(ampMappings[1].control.name).toBe("fader2");
    expect(ampMappings[1].parameter.name).toBe("volume_ch2");
  });

  // 2. Maps pots to filter parameters
  it("maps frequency pots to filter parameters", () => {
    const modules: MappableModule[] = [
      {
        id: "synth",
        parameters: [
          param("cutoff", "filter", { min: 20, max: 20000, curve: "exponential" }),
          param("resonance", "filter"),
        ],
      },
    ];

    const mappings = autoMap(modules, k2);

    // Filter params should be assigned to frequency pots (CC 4-7)
    const filterMappings = mappings.filter((m) => m.parameter.category === "filter");
    expect(filterMappings.length).toBe(2);
    expect(filterMappings[0].control.category).toBe("frequency");
    expect(filterMappings[1].control.category).toBe("frequency");
  });

  // 3. Custom mappings override auto-mapping
  it("custom mappings override auto-mapping", () => {
    const modules: MappableModule[] = [
      {
        id: "synth",
        parameters: [
          param("cutoff", "filter"),
          param("amplitude", "amplitude"),
        ],
      },
    ];

    const mappings = autoMap(modules, k2, [
      { control: "pot5", module: "synth", parameter: "cutoff" },
    ]);

    // Custom: pot5 → cutoff
    const customMapping = mappings.find((m) => m.control.name === "pot5");
    expect(customMapping).toBeDefined();
    expect(customMapping!.parameter.name).toBe("cutoff");

    // Auto: amplitude still gets a fader
    const ampMapping = mappings.find((m) => m.parameter.name === "amplitude");
    expect(ampMapping).toBeDefined();
    expect(ampMapping!.control.category).toBe("amplitude");
  });

  // 4. Unmapped params when not enough controls → skipped
  it("skips unmapped params when controls exhausted", () => {
    const modules: MappableModule[] = [
      {
        id: "big",
        parameters: Array.from({ length: 20 }, (_, i) =>
          param(`param${i}`, "amplitude"),
        ),
      },
    ];

    const mappings = autoMap(modules, k2);

    // K2 has 16 absolute controls — can't map more than 16
    expect(mappings.length).toBeLessThanOrEqual(16);
  });

  // 5. Empty parameters list → empty mappings
  it("returns empty mappings for empty parameters", () => {
    const modules: MappableModule[] = [{ id: "clock", parameters: [] }];
    const mappings = autoMap(modules, k2);
    expect(mappings).toHaveLength(0);
  });

  // Custom mapping validation
  it("throws on invalid control name", () => {
    const modules: MappableModule[] = [
      { id: "synth", parameters: [param("cutoff", "filter")] },
    ];
    expect(() =>
      autoMap(modules, k2, [{ control: "nonexistent", module: "synth", parameter: "cutoff" }]),
    ).toThrow(/control "nonexistent" not found/);
  });

  it("throws on invalid module ID", () => {
    const modules: MappableModule[] = [
      { id: "synth", parameters: [param("cutoff", "filter")] },
    ];
    expect(() =>
      autoMap(modules, k2, [{ control: "fader1", module: "ghost", parameter: "cutoff" }]),
    ).toThrow(/module "ghost" not found/);
  });

  it("throws on invalid parameter name", () => {
    const modules: MappableModule[] = [
      { id: "synth", parameters: [param("cutoff", "filter")] },
    ];
    expect(() =>
      autoMap(modules, k2, [{ control: "fader1", module: "synth", parameter: "nope" }]),
    ).toThrow(/parameter "nope" not found/);
  });

  it("generates correct bus names", () => {
    const modules: MappableModule[] = [
      { id: "synth", parameters: [param("cutoff", "filter")] },
    ];
    const mappings = autoMap(modules, k2);
    const m = mappings.find((m) => m.parameter.name === "cutoff")!;
    expect(m.busName).toBe("synth__p__cutoff");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// CONTROLLER PATCH GENERATOR
// ═════════════════════════════════════════════════════════════════════════

describe("controller patch generator", () => {
  // Helper to create a mapping
  function makeMapping(
    cc: number,
    paramName: string,
    opts: { curve?: "linear" | "exponential"; min?: number; max?: number } = {},
  ): ControllerMapping {
    return {
      control: {
        name: `fader_cc${cc}`,
        type: "fader",
        cc,
        inputType: "absolute",
        range: [0, 127],
        category: "amplitude",
      },
      moduleId: "test",
      parameter: param(paramName, "amplitude", {
        min: opts.min ?? 0,
        max: opts.max ?? 1,
        curve: opts.curve ?? "linear",
      }),
      busName: `test__p__${paramName}`,
    };
  }

  // 6. Linear scaling chain
  it("generates linear scaling: ctlin → /127 → *range → +min → send", () => {
    const mappings = [makeMapping(16, "volume", { min: 0, max: 1 })];
    const spec = buildControllerPatch(mappings, 16);

    // Find key nodes
    const nodeNames = spec.nodes.map((n) => n.name ?? n.type);
    expect(nodeNames).toContain("ctlin");
    expect(nodeNames).toContain("/");
    expect(nodeNames).toContain("*");
    expect(nodeNames).toContain("+");
    expect(nodeNames).toContain("send");

    // Should NOT contain pow for linear curve
    expect(nodeNames.filter((n) => n === "pow")).toHaveLength(0);

    // Check ctlin args: [CC, Channel]
    const ctlin = spec.nodes.find((n) => n.name === "ctlin")!;
    expect(ctlin.args).toEqual([16, 16]);

    // Check send bus name
    const send = spec.nodes.find((n) => n.name === "send")!;
    expect(send.args).toEqual(["test__p__volume"]);
  });

  // 7. Exponential scaling includes pow
  it("inserts pow node for exponential curve", () => {
    const mappings = [makeMapping(4, "cutoff", { curve: "exponential", min: 20, max: 20000 })];
    const spec = buildControllerPatch(mappings, 16);

    const nodeNames = spec.nodes.map((n) => n.name ?? n.type);
    expect(nodeNames).toContain("pow");

    const pow = spec.nodes.find((n) => n.name === "pow")!;
    expect(pow.args).toEqual([3]);
  });

  // 8. Multiple mappings produce multiple columns
  it("produces separate columns for multiple mappings", () => {
    const mappings = [
      makeMapping(16, "volume"),
      makeMapping(17, "pan"),
    ];
    const spec = buildControllerPatch(mappings, 16);

    // Should have 2 ctlin nodes, 2 send nodes
    const ctlins = spec.nodes.filter((n) => n.name === "ctlin");
    const sends = spec.nodes.filter((n) => n.name === "send");
    expect(ctlins).toHaveLength(2);
    expect(sends).toHaveLength(2);

    // Columns should have different x positions
    expect(ctlins[0].x).not.toBe(ctlins[1].x);
  });

  // 9. Output is valid PatchSpec (round-trip through buildPatch → parse)
  it("produces valid Pd patch (round-trip)", () => {
    const mappings = [
      makeMapping(16, "volume"),
      makeMapping(4, "cutoff", { curve: "exponential", min: 20, max: 20000 }),
    ];
    const spec = buildControllerPatch(mappings, 16);
    const pd = buildPatch(spec);

    // Must parse without error
    const parsed = parsePatch(pd);
    expect(parsed.root.nodes.length).toBeGreaterThan(0);
    expect(pd).toContain("#N canvas");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// PARAMETER INJECTOR
// ═════════════════════════════════════════════════════════════════════════

describe("parameter injector", () => {
  // 10. Receive node added for each mapping
  it("adds receive node for each mapping", () => {
    const nodes: PatchNodeSpec[] = [
      { name: "osc~", args: [440], x: 50, y: 50 },
      { name: "lop~", args: [1000], x: 50, y: 90 },
      { name: "dac~", args: [], x: 50, y: 130 },
    ];
    const conns: PatchConnectionSpec[] = [];
    const modules: InjectableModule[] = [
      {
        id: "synth",
        parameters: [param("cutoff", "filter", { nodeIndex: 1, inlet: 1 })],
        nodeOffset: 0,
      },
    ];
    const mappings: ControllerMapping[] = [
      {
        control: k2Profile.controls[0],
        moduleId: "synth",
        parameter: param("cutoff", "filter", { nodeIndex: 1, inlet: 1 }),
        busName: "synth__p__cutoff",
      },
    ];

    injectParameterReceivers(nodes, conns, modules, mappings);

    // Should add a receive node
    const receiveNode = nodes.find((n) => n.name === "receive");
    expect(receiveNode).toBeDefined();
    expect(receiveNode!.args).toEqual(["synth__p__cutoff"]);
  });

  // 11. Receive connected to correct target node + inlet
  it("connects receive to correct target node and inlet", () => {
    const nodes: PatchNodeSpec[] = [
      { name: "osc~", args: [440], x: 50, y: 50 },
      { name: "lop~", args: [1000], x: 50, y: 90 },
    ];
    const conns: PatchConnectionSpec[] = [];
    const modules: InjectableModule[] = [
      {
        id: "synth",
        parameters: [param("cutoff", "filter", { nodeIndex: 1, inlet: 1 })],
        nodeOffset: 0,
      },
    ];
    const mappings: ControllerMapping[] = [
      {
        control: k2Profile.controls[0],
        moduleId: "synth",
        parameter: param("cutoff", "filter", { nodeIndex: 1, inlet: 1 }),
        busName: "synth__p__cutoff",
      },
    ];

    injectParameterReceivers(nodes, conns, modules, mappings);

    // Connection: from receiveIdx → to node 1 (lop~), inlet 1
    expect(conns).toHaveLength(1);
    expect(conns[0].from).toBe(2); // receive is at index 2
    expect(conns[0].to).toBe(1); // lop~ is at index 1 (0 offset)
    expect(conns[0].inlet).toBe(1);
    expect(conns[0].outlet).toBe(0);
  });

  // 12. Multiple modules: correct node offsets applied
  it("applies correct node offsets for multiple modules", () => {
    const nodes: PatchNodeSpec[] = [
      // Module A: nodes 0-2
      { name: "osc~", args: [440], x: 50, y: 50 },
      { name: "lop~", args: [1000], x: 50, y: 90 },
      { name: "dac~", args: [], x: 50, y: 130 },
      // Module B: nodes 3-4
      { name: "*~", args: [0.5], x: 450, y: 50 },
      { name: "dac~", args: [], x: 450, y: 90 },
    ];
    const conns: PatchConnectionSpec[] = [];
    const modules: InjectableModule[] = [
      {
        id: "synth",
        parameters: [param("cutoff", "filter", { nodeIndex: 1, inlet: 1 })],
        nodeOffset: 0,
      },
      {
        id: "mixer",
        parameters: [param("volume", "amplitude", { nodeIndex: 0, inlet: 1 })],
        nodeOffset: 3, // Module B starts at index 3
      },
    ];
    const mappings: ControllerMapping[] = [
      {
        control: k2Profile.controls[0],
        moduleId: "synth",
        parameter: param("cutoff", "filter", { nodeIndex: 1, inlet: 1 }),
        busName: "synth__p__cutoff",
      },
      {
        control: k2Profile.controls[4], // pot1
        moduleId: "mixer",
        parameter: param("volume", "amplitude", { nodeIndex: 0, inlet: 1 }),
        busName: "mixer__p__volume",
      },
    ];

    injectParameterReceivers(nodes, conns, modules, mappings);

    // First receive → synth.cutoff: target = 1 + 0 = 1
    expect(conns[0].to).toBe(1);
    // Second receive → mixer.volume: target = 0 + 3 = 3
    expect(conns[1].to).toBe(3);
  });

  // 13. No-op when mappings is empty
  it("does nothing when mappings is empty", () => {
    const nodes: PatchNodeSpec[] = [{ name: "osc~", args: [440], x: 50, y: 50 }];
    const conns: PatchConnectionSpec[] = [];

    injectParameterReceivers(nodes, conns, [], []);

    expect(nodes).toHaveLength(1);
    expect(conns).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// K2 DECK CONFIG GENERATOR
// ═════════════════════════════════════════════════════════════════════════

describe("K2 Deck config generator", () => {
  function makeFaderMapping(cc: number, paramLabel: string, category: string): ControllerMapping {
    return {
      control: {
        name: `fader_cc${cc}`,
        type: "fader",
        cc,
        inputType: "absolute",
        range: [0, 127],
        category: "amplitude",
      },
      moduleId: "test",
      parameter: param("vol", category as ParameterDescriptor["category"], { label: paramLabel }),
      busName: "test__p__vol",
    };
  }

  // 14. Generates valid JSON matching K2 Deck format
  it("generates config with required K2 Deck fields", () => {
    const mappings = [makeFaderMapping(16, "Mixer Vol", "amplitude")];
    const config = generateK2DeckConfig(mappings, 16) as Record<string, unknown>;

    expect(config.profile_name).toBe("pd_rack");
    expect(config.midi_channel).toBe(16);
    expect(config.midi_device).toBe("XONE:K2");
    expect(config.led_color_offsets).toEqual({ red: 0, amber: 36, green: 72 });
    expect(config).toHaveProperty("throttle");
    expect(config).toHaveProperty("mappings");
    expect(config).toHaveProperty("led_defaults");
  });

  // 15. All mapped CCs appear in cc_absolute section
  it("includes all mapped CCs in cc_absolute with labels", () => {
    const mappings = [
      makeFaderMapping(16, "Mixer Vol", "amplitude"),
      makeFaderMapping(17, "Synth Amp", "amplitude"),
    ];
    const config = generateK2DeckConfig(mappings, 16) as Record<string, unknown>;
    const abs = (config.mappings as Record<string, unknown>).cc_absolute as Record<
      string,
      { name: string; action: string }
    >;

    expect(abs["16"]).toBeDefined();
    expect(abs["16"].name).toContain("Mixer Vol");
    expect(abs["16"].action).toBe("noop");
    expect(abs["17"]).toBeDefined();
    expect(abs["17"].name).toContain("Synth Amp");
  });

  // 16. LED colors match category
  it("assigns LED colors by category: green=amplitude, red=filter, amber=general", () => {
    const mappings: ControllerMapping[] = [
      // Fader CC16 = column 0 → amplitude → green
      makeFaderMapping(16, "Volume", "amplitude"),
      // Pot CC5 = column 1 → filter → red
      {
        control: {
          name: "pot2",
          type: "pot",
          cc: 5,
          inputType: "absolute",
          range: [0, 127],
          category: "frequency",
        },
        moduleId: "synth",
        parameter: param("cutoff", "filter"),
        busName: "synth__p__cutoff",
      },
    ];

    const config = generateK2DeckConfig(mappings, 16) as Record<string, unknown>;
    const ledDefaults = config.led_defaults as Record<string, unknown>;
    const onStart = ledDefaults.on_start as { note: number; color: string }[];

    // Column 0 (note 36) → green (amplitude)
    const col0 = onStart.find((l) => l.note === 36);
    expect(col0).toBeDefined();
    expect(col0!.color).toBe("green");

    // Column 1 (note 37) → red (filter)
    const col1 = onStart.find((l) => l.note === 37);
    expect(col1).toBeDefined();
    expect(col1!.color).toBe("red");
  });

  // 17. Unmapped controls not included in config
  it("does not include unmapped CCs in config", () => {
    const mappings = [makeFaderMapping(16, "Volume", "amplitude")];
    const config = generateK2DeckConfig(mappings, 16) as Record<string, unknown>;
    const abs = (config.mappings as Record<string, unknown>).cc_absolute as Record<string, unknown>;

    // Only CC 16 should be present
    expect(Object.keys(abs)).toEqual(["16"]);
    expect(abs["17"]).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// DEVICE REGISTRY
// ═════════════════════════════════════════════════════════════════════════

describe("device registry", () => {
  it("resolves k2 alias", () => {
    const device = getDevice("k2");
    expect(device.name).toBe("xone-k2");
    expect(device.midiChannel).toBe(16);
    expect(device.controls.length).toBe(16);
  });

  it("throws on unknown device", () => {
    expect(() => getDevice("nonexistent")).toThrow(/Unknown device/);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// TEMPLATE PARAMETERS
// ═════════════════════════════════════════════════════════════════════════

describe("template parameters", () => {
  it("synth exposes cutoff and amplitude parameters", () => {
    const r = buildTemplateWithPorts("synth", { waveform: "saw", filter: "lowpass" });
    expect(r.parameters).toBeDefined();
    expect(r.parameters!.length).toBeGreaterThanOrEqual(2);

    const cutoff = r.parameters!.find((p) => p.name === "cutoff");
    expect(cutoff).toBeDefined();
    expect(cutoff!.category).toBe("filter");
    expect(cutoff!.curve).toBe("exponential");
    expect(cutoff!.inlet).toBe(1);

    const amp = r.parameters!.find((p) => p.name === "amplitude");
    expect(amp).toBeDefined();
    expect(amp!.category).toBe("amplitude");
  });

  it("synth with bandpass exposes resonance parameter", () => {
    const r = buildTemplateWithPorts("synth", { filter: "bandpass" });
    const res = r.parameters!.find((p) => p.name === "resonance");
    expect(res).toBeDefined();
    expect(res!.inlet).toBe(2);
    expect(res!.category).toBe("filter");
  });

  it("mixer exposes volume_ch{N} parameters", () => {
    const r = buildTemplateWithPorts("mixer", { channels: 3 });
    expect(r.parameters).toBeDefined();
    expect(r.parameters!.length).toBe(3);
    expect(r.parameters![0].name).toBe("volume_ch1");
    expect(r.parameters![1].name).toBe("volume_ch2");
    expect(r.parameters![2].name).toBe("volume_ch3");
    for (const p of r.parameters!) {
      expect(p.category).toBe("amplitude");
      expect(p.curve).toBe("linear");
    }
  });

  it("drum-machine exposes volume parameter", () => {
    const r = buildTemplateWithPorts("drum-machine", {});
    expect(r.parameters).toBeDefined();
    const vol = r.parameters!.find((p) => p.name === "volume");
    expect(vol).toBeDefined();
    expect(vol!.category).toBe("amplitude");
    expect(vol!.inlet).toBe(1);
  });

  it("templates without parameters return empty array", () => {
    const r = buildTemplateWithPorts("clock", {});
    expect(r.parameters ?? []).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═════════════════════════════════════════════════════════════════════════

describe("controller integration", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "pd-controller-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  // 18. Full rack + controller generates both files
  it("generates _controller.pd and _k2_config.json", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", params: { waveform: "saw", filter: "lowpass" }, id: "synth" },
        { template: "mixer", params: { channels: 2 }, id: "mixer" },
      ],
      controller: { device: "k2" },
      outputDir: tmpDir,
    });

    // Should mention controller mappings
    expect(result).toContain("Controller:");
    expect(result).toContain("mapping(s)");

    // Check files exist
    const rackStat = await stat(join(tmpDir, "_rack.pd"));
    expect(rackStat.isFile()).toBe(true);
    const ctrlStat = await stat(join(tmpDir, "_controller.pd"));
    expect(ctrlStat.isFile()).toBe(true);
    const k2Stat = await stat(join(tmpDir, "_k2_config.json"));
    expect(k2Stat.isFile()).toBe(true);

    // Controller patch should be valid Pd
    const ctrlPd = await readFile(join(tmpDir, "_controller.pd"), "utf-8");
    expect(ctrlPd).toContain("#N canvas");
    const parsed = parsePatch(ctrlPd);
    expect(parsed.root.nodes.length).toBeGreaterThan(0);

    // K2 config should be valid JSON
    const k2Json = await readFile(join(tmpDir, "_k2_config.json"), "utf-8");
    const k2Config = JSON.parse(k2Json);
    expect(k2Config.profile_name).toBe("pd_rack");
  });

  // 19. Controller mappings appear in _rack.pd as receive nodes
  it("injects receive nodes into _rack.pd", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", params: { waveform: "saw", filter: "lowpass" }, id: "synth" },
      ],
      controller: { device: "k2" },
      outputDir: tmpDir,
    });

    const rackPd = await readFile(join(tmpDir, "_rack.pd"), "utf-8");
    // Should contain receive nodes for mapped parameters
    expect(rackPd).toContain("receive synth__p__cutoff");
    expect(rackPd).toContain("receive synth__p__amplitude");
  });

  // 20. Backward compat: rack WITHOUT controller identical to current output
  it("rack without controller produces no controller files", async () => {
    await executeCreateRack({
      modules: [{ template: "synth", id: "synth" }],
      outputDir: tmpDir,
    });

    // _rack.pd should exist
    const rackStat = await stat(join(tmpDir, "_rack.pd"));
    expect(rackStat.isFile()).toBe(true);

    // _controller.pd should NOT exist
    await expect(stat(join(tmpDir, "_controller.pd"))).rejects.toThrow();
    await expect(stat(join(tmpDir, "_k2_config.json"))).rejects.toThrow();

    // _rack.pd should NOT contain any receive parameter buses
    const rackPd = await readFile(join(tmpDir, "_rack.pd"), "utf-8");
    expect(rackPd).not.toContain("receive synth__p__");
  });

  // 21. Rack WITH wiring AND controller: both buses coexist
  it("wiring and controller buses coexist in _rack.pd", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", params: { waveform: "saw", filter: "lowpass" }, id: "synth" },
        { template: "mixer", params: { channels: 2 }, id: "mixer" },
      ],
      wiring: [{ from: "synth", output: "audio", to: "mixer", input: "ch1" }],
      controller: { device: "k2" },
      outputDir: tmpDir,
    });

    const rackPd = await readFile(join(tmpDir, "_rack.pd"), "utf-8");

    // Wiring buses (throw~/catch~ for audio)
    expect(rackPd).toContain("throw~");
    expect(rackPd).toContain("catch~");

    // Controller parameter buses (receive)
    expect(rackPd).toContain("receive synth__p__cutoff");

    // Both should parse cleanly
    const parsed = parsePatch(rackPd);
    expect(parsed.root.nodes.length).toBeGreaterThan(0);
  });

  // 22. Auto-mapped K2 with synth+mixer: faders→volumes, pots→cutoff
  it("auto-maps faders to volumes and pots to cutoff", async () => {
    const result = await executeCreateRack({
      modules: [
        { template: "synth", params: { waveform: "saw", filter: "lowpass" }, id: "synth" },
        { template: "mixer", params: { channels: 2 }, id: "mixer" },
      ],
      controller: { device: "k2" },
    });

    // Amplitude params should go to faders (CC 16-19)
    expect(result).toMatch(/fader\d.*volume/i);
    // Filter params should go to pots (CC 4-7)
    expect(result).toMatch(/pot\d.*cutoff/i);
  });

  // Warning when no controllable parameters
  it("warns when no modules have parameters", async () => {
    const result = await executeCreateRack({
      modules: [{ template: "clock", id: "clock" }],
      controller: { device: "k2" },
      outputDir: tmpDir,
    });

    expect(result).toContain("No controllable parameters");

    // Should NOT create controller files
    await expect(stat(join(tmpDir, "_controller.pd"))).rejects.toThrow();
  });
});
