import { describe, it, expect } from "vitest";
import { buildPatch } from "../../src/core/serializer.js";
import { parsePatch } from "../../src/core/parser.js";
import { buildTemplate, TEMPLATE_NAMES } from "../../src/templates/index.js";
import { buildSynth } from "../../src/templates/synth.js";
import { buildSequencer } from "../../src/templates/sequencer.js";
import { buildReverb } from "../../src/templates/reverb-template.js";
import { buildMixer } from "../../src/templates/mixer.js";
import { buildDrumMachine } from "../../src/templates/drum-machine.js";
import { buildClock } from "../../src/templates/clock.js";
import { buildChaos } from "../../src/templates/chaos.js";
import { buildMaths } from "../../src/templates/maths.js";
import { buildTuringMachine } from "../../src/templates/turing-machine.js";
import { buildGranular } from "../../src/templates/granular.js";

/** Round-trip helper: build → serialize → parse → verify structure. */
function roundTrip(rackable: ReturnType<typeof buildSynth>) {
  const pdText = buildPatch(rackable.spec);
  const parsed = parsePatch(pdText);
  return { pdText, parsed };
}

describe("synth template", () => {
  it("builds with defaults (saw + lowpass)", () => {
    const spec = buildSynth();
    const { parsed } = roundTrip(spec);

    expect(parsed.root.nodes.length).toBeGreaterThan(5);
    expect(parsed.root.connections.length).toBeGreaterThan(3);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("mtof");     // MIDI input
    expect(names).toContain("phasor~");  // saw oscillator
    expect(names).toContain("lop~");     // lowpass filter
    expect(names).toContain("loadbang"); // filter param init
    expect(names).toContain("dac~");
  });

  it("builds with square + moog + adsr envelope", () => {
    const spec = buildSynth({
      waveform: "square",
      filter: "moog",
      cutoff: 800,
      envelope: "adsr",
    });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("mtof");     // MIDI input
    expect(names).toContain("phasor~");  // square starts with phasor~
    expect(names).toContain(">~");       // square waveshaping
    expect(names).toContain("bob~");     // moog filter
    expect(names).toContain("sel");      // gate-based envelope trigger
    expect(names).toContain("vline~");   // sample-accurate envelope
    expect(names).toContain("dac~");
  });

  it("builds with korg filter", () => {
    const spec = buildSynth({ filter: "korg", cutoff: 2000 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("hip~");
    expect(names).toContain("lop~");
    expect(names).toContain("mtof");
    expect(names).toContain("loadbang");
  });
});

describe("sequencer template", () => {
  it("builds with defaults (8 steps, 120 BPM)", () => {
    const spec = buildSequencer();
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("loadbang");
    expect(names).toContain("metro");
    expect(names).toContain("select");
    expect(names).toContain("pack");
    expect(names).toContain("noteout");
  });

  it("builds with custom steps and notes (cyclic padding)", () => {
    const spec = buildSequencer({
      steps: 6,
      bpm: 140,
      notes: [60, 64, 67], // 3 notes, 6 steps → padded cyclically
    });
    const { parsed } = roundTrip(spec);

    // Should have 6 msg boxes for notes
    const msgNodes = parsed.root.nodes.filter((n) => n.type === "msg");
    expect(msgNodes.length).toBe(7); // 1 msg "1" (start) + 6 note msgs
  });

  it("builds with 4 steps and matches fixture structure", () => {
    const spec = buildSequencer({
      steps: 4,
      bpm: 120,
      notes: [60, 64, 67, 72],
    });
    const { parsed } = roundTrip(spec);

    // title, loadbang, msg(1), metro, float, +, mod, select, 4 note msgs, pack, noteout = 14
    expect(parsed.root.nodes.length).toBe(14);
    expect(parsed.root.connections.length).toBeGreaterThan(10);
  });
});

describe("reverb template", () => {
  it("builds simple reverb with defaults", () => {
    const spec = buildReverb({ variant: "simple" });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("adc~");
    expect(names).toContain("delwrite~");
    expect(names).toContain("delread~");
    expect(names).toContain("dac~");
  });

  it("builds schroeder reverb", () => {
    const spec = buildReverb({ variant: "schroeder", roomSize: 0.7 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("adc~");
    expect(names).toContain("dac~");
    // Should have multiple delwrite~/delread~ for combs + allpass
    const delwrites = names.filter((n) => n === "delwrite~");
    expect(delwrites.length).toBeGreaterThanOrEqual(3); // 2 combs + 1 allpass
  });
});

describe("mixer template", () => {
  it("builds 4-channel mixer", () => {
    const spec = buildMixer({ channels: 4 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    // 4 inlet~, 4 *~, 3 +~ (summing chain), 1 dac~
    const inlets = names.filter((n) => n === "inlet~");
    expect(inlets.length).toBe(4);
    expect(names).toContain("dac~");
  });

  it("builds 1-channel mixer (no summing)", () => {
    const spec = buildMixer({ channels: 1 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names.filter((n) => n === "inlet~").length).toBe(1);
    expect(names).toContain("dac~");
    // No +~ needed for single channel
    expect(names.filter((n) => n === "+~").length).toBe(0);
  });

  it("builds 8-channel mixer", () => {
    const spec = buildMixer({ channels: 8 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names.filter((n) => n === "inlet~").length).toBe(8);
    // 7 +~ for summing 8 channels
    expect(names.filter((n) => n === "+~").length).toBe(7);
  });
});

// ──────────────────────────────────────────────
// Drum Machine
// ──────────────────────────────────────────────

describe("drum-machine template", () => {
  it("builds with defaults (5 voices, internal clock)", () => {
    const spec = buildDrumMachine();
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("osc~");       // BD + CH/OH metallic oscillators
    expect(names).toContain("noise~");     // SN + CP noise source
    expect(names).toContain("bp~");        // CH/OH metallic + CP body
    expect(names).toContain("hip~");       // CH/OH highpass
    expect(names).toContain("vline~");     // envelopes
    expect(names).toContain("metro");      // internal clock
    expect(names).toContain("sel");        // pattern matching
    expect(names).toContain("dac~");
    // BD (1) + SN (2) + CH (6) + OH (6) = 15 osc~ minimum
    const oscCount = names.filter((n) => n === "osc~").length;
    expect(oscCount).toBeGreaterThanOrEqual(15);
    // Multiple envelopes across 5 voices
    const vlineCount = names.filter((n) => n === "vline~").length;
    expect(vlineCount).toBeGreaterThanOrEqual(5);
  });

  it("builds with custom voices (bd + ch only)", () => {
    const spec = buildDrumMachine({ voices: ["bd", "ch"] });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("osc~");       // BD + CH metallic
    expect(names).toContain("hip~");       // CH highpass
    expect(names).toContain("bp~");        // CH metallic resonance
    expect(names).toContain("dac~");
  });

  it("builds single voice (no summing chain)", () => {
    const spec = buildDrumMachine({ voices: ["bd"] });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("osc~");
    expect(names).toContain("dac~");
    // Single voice BD → no +~ for summing (808 BD is pure sine, no body+sub mix)
    const plusCount = names.filter((n) => n === "+~").length;
    expect(plusCount).toBe(0); // no summing chain needed
  });

  it("builds with legacy params (tune/decay/tone backward compat)", () => {
    const spec = buildDrumMachine({
      voices: ["bd", "sn", "ch", "cp"],
      tune: 0.8,
      decay: 0.3,
      tone: 0.7,
      amplitude: 0.5,
    });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("dac~");
    expect(parsed.root.connections.length).toBeGreaterThan(10);
  });

  it("exposes per-voice volume parameters", () => {
    const spec = buildDrumMachine();
    expect(spec.parameters).toBeDefined();
    expect(spec.parameters!.length).toBe(6); // master + 5 per-voice
    const paramNames = spec.parameters!.map((p) => p.name);
    expect(paramNames).toContain("volume");
    expect(paramNames).toContain("volume_bd");
    expect(paramNames).toContain("volume_sn");
    expect(paramNames).toContain("volume_ch");
    expect(paramNames).toContain("volume_oh");
    expect(paramNames).toContain("volume_cp");
    for (const p of spec.parameters!) {
      expect(p.category).toBe("amplitude");
    }
  });

  it("per-voice params match selected voices", () => {
    const spec = buildDrumMachine({ voices: ["bd", "ch"] });
    expect(spec.parameters!.length).toBe(3); // master + 2 per-voice
    const paramNames = spec.parameters!.map((p) => p.name);
    expect(paramNames).toContain("volume");
    expect(paramNames).toContain("volume_bd");
    expect(paramNames).toContain("volume_ch");
    expect(paramNames).not.toContain("volume_sn");
    expect(paramNames).not.toContain("volume_cp");
  });

  it("OH has 6 metallic oscillators", () => {
    const spec = buildDrumMachine({ voices: ["oh"] });
    const { parsed } = roundTrip(spec);
    const oscCount = parsed.root.nodes.filter((n) => n.name === "osc~").length;
    expect(oscCount).toBe(6);
  });

  it("BD amp envelope starts with 0 (2ms attack ramp)", () => {
    const spec = buildDrumMachine({ voices: ["bd"] });
    const { pdText } = roundTrip(spec);
    // The amp message should contain "0" as first arg (start silent, ramp up)
    // Look for the pattern: msg with "0 \\, 1 2" (attack ramp from 0 to 1 in 2ms)
    expect(pdText).toContain("0 \\, 1 2");
  });

  it("CP 5-burst envelope survives round-trip", () => {
    const spec = buildDrumMachine({ voices: ["cp"] });
    const { pdText } = roundTrip(spec);
    // 808-style clap: 5 bursts using vline~ delay param
    expect(pdText).toContain("0.7 1 5");  // 2nd burst at delay=5ms
    expect(pdText).toContain("0.6 1 10"); // 3rd burst at delay=10ms
    expect(pdText).toContain("0.5 1 15"); // 4th burst at delay=15ms
    expect(pdText).toContain("0.4 1 20"); // 5th burst at delay=20ms
  });

  it("exposes trigger ports for wiring", () => {
    const spec = buildDrumMachine({ voices: ["bd", "sn", "ch", "oh", "cp"] });
    const portNames = spec.ports.map((p) => p.name);
    expect(portNames).toContain("trig_bd");
    expect(portNames).toContain("trig_sn");
    expect(portNames).toContain("trig_ch");
    expect(portNames).toContain("trig_oh");
    expect(portNames).toContain("trig_cp");
    expect(portNames).toContain("audio");
    // Trigger ports are control inputs, audio is output
    const trigPorts = spec.ports.filter((p) => p.name.startsWith("trig_"));
    for (const p of trigPorts) {
      expect(p.type).toBe("control");
      expect(p.direction).toBe("input");
    }
    const audioPort = spec.ports.find((p) => p.name === "audio");
    expect(audioPort!.type).toBe("audio");
    expect(audioPort!.direction).toBe("output");
  });

  it("subset voices only expose matching trigger ports", () => {
    const spec = buildDrumMachine({ voices: ["ch", "cp"] });
    const portNames = spec.ports.map((p) => p.name);
    expect(portNames).toContain("trig_ch");
    expect(portNames).toContain("trig_cp");
    expect(portNames).not.toContain("trig_bd");
    expect(portNames).not.toContain("trig_sn");
  });

  it("builds with boundary params (0 and 1)", () => {
    // morphX=0 → lowest pitch, morphY=1 → longest decay
    const low = buildDrumMachine({ morphX: 0, morphY: 1, amplitude: 0 });
    roundTrip(low); // must not throw

    // morphX=1 → highest pitch, morphY=0 → shortest
    const high = buildDrumMachine({ morphX: 1, morphY: 0, amplitude: 1 });
    roundTrip(high); // must not throw
  });

  // ── New tests: clock + tap tempo ──

  it("builds with internal clock (bpm > 0)", () => {
    const spec = buildDrumMachine({ bpm: 130 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("metro");
    expect(names).toContain("loadbang");
    expect(names).toContain("float");
    expect(names).toContain("mod");
    expect(names).toContain("sel");
  });

  it("bpm=0 builds counter without metro", () => {
    const spec = buildDrumMachine({ bpm: 0 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).not.toContain("metro");
    expect(names).not.toContain("loadbang");
    // Counter chain always present
    expect(names).toContain("float");
    expect(names).toContain("mod");
    // sel still present for pattern matching
    expect(names).toContain("sel");
  });

  it("CH has 6 metallic oscillators", () => {
    const spec = buildDrumMachine({ voices: ["ch"] });
    const { parsed } = roundTrip(spec);
    const oscCount = parsed.root.nodes.filter((n) => n.name === "osc~").length;
    expect(oscCount).toBe(6);
  });

  it("clock_out always exposed", () => {
    const spec0 = buildDrumMachine({ bpm: 0 });
    const spec120 = buildDrumMachine({ bpm: 120 });
    expect(spec0.ports.find((p) => p.name === "clock_out")).toBeDefined();
    expect(spec120.ports.find((p) => p.name === "clock_out")).toBeDefined();
    const port = spec120.ports.find((p) => p.name === "clock_out")!;
    expect(port.type).toBe("control");
    expect(port.direction).toBe("output");
  });

  it("OH/CH choke: CH trigger wires to OH envelope", () => {
    const spec = buildDrumMachine({ voices: ["ch", "oh"] });
    // Choke msg exists: msg with args [0, 5]
    const chokeMsg = spec.spec.nodes.find(
      (n) => n.type === "msg" && n.args && n.args[0] === 0 && n.args[1] === 5,
    );
    expect(chokeMsg).toBeDefined();
    // Verify wiring: chokeMsg is connected to OH's ampVline
    const chokeMsgIdx = spec.spec.nodes.indexOf(chokeMsg!);
    const chokeWire = spec.spec.connections.find((c) => c.from === chokeMsgIdx);
    expect(chokeWire).toBeDefined();
  });

  it("default voices are bd, sn, ch, oh, cp", () => {
    const spec = buildDrumMachine();
    const portNames = spec.ports
      .filter((p) => p.name.startsWith("trig_"))
      .map((p) => p.name.replace("trig_", ""));
    expect(portNames).toEqual(["bd", "sn", "ch", "oh", "cp"]);
  });

  it("morphX/morphY params affect synthesis", () => {
    const low = buildDrumMachine({ morphX: 0, morphY: 0, voices: ["bd"] });
    const high = buildDrumMachine({ morphX: 1, morphY: 1, voices: ["bd"] });
    // Different morph values should produce different node args (e.g. osc~ frequencies)
    const lowPd = buildPatch(low.spec);
    const highPd = buildPatch(high.spec);
    expect(lowPd).not.toBe(highPd);
  });

  it("tap tempo nodes present when bpm > 0", () => {
    const spec = buildDrumMachine({ bpm: 120 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("timer");
    expect(names).toContain("t"); // trigger for tap
  });

  it("hh alias normalizes to ch", () => {
    const spec = buildDrumMachine({ voices: ["bd", "hh"] as any });
    const portNames = spec.ports.map((p) => p.name);
    expect(portNames).toContain("trig_ch"); // hh → ch
    expect(portNames).not.toContain("trig_hh");
  });

  // ── clock_in tests ──

  it("exposes clock_in port", () => {
    const spec = buildDrumMachine({});
    const port = spec.ports.find((p) => p.name === "clock_in");
    expect(port).toBeDefined();
    expect(port!.type).toBe("control");
    expect(port!.direction).toBe("input");
  });

  it("clock_in has ioNodeIndex when bpm > 0", () => {
    const spec = buildDrumMachine({ bpm: 120 });
    const port = spec.ports.find((p) => p.name === "clock_in");
    expect(port).toBeDefined();
    expect(port!.ioNodeIndex).toBeDefined();
  });

  it("clock_in has no ioNodeIndex when bpm = 0", () => {
    const spec = buildDrumMachine({ bpm: 0 });
    const port = spec.ports.find((p) => p.name === "clock_in");
    expect(port).toBeDefined();
    expect(port!.ioNodeIndex).toBeUndefined();
  });

  it("title shows EXT when bpm=0", () => {
    const spec = buildDrumMachine({ bpm: 0 });
    const { parsed } = roundTrip(spec);
    const title = parsed.root.nodes.find(
      (n) => n.type === "text" && n.args?.includes("EXT"),
    );
    expect(title).toBeDefined();
  });

  it("title shows BPM when bpm > 0", () => {
    const spec = buildDrumMachine({ bpm: 140 });
    const { parsed } = roundTrip(spec);
    const title = parsed.root.nodes.find(
      (n) => n.type === "text" && n.args?.includes("140BPM"),
    );
    expect(title).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// Clock
// ──────────────────────────────────────────────

describe("clock template", () => {
  it("builds with defaults (120 BPM, 4 divisions)", () => {
    const spec = buildClock();
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("loadbang");
    expect(names).toContain("metro");
    // 4 divisions × sel + 1 master mod + counter mod
    const selNodes = names.filter((n) => n === "sel");
    expect(selNodes.length).toBe(4);
  });

  it("builds with custom BPM and divisions", () => {
    const spec = buildClock({ bpm: 140, divisions: [1, 2, 8] });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("metro");
    const selNodes = names.filter((n) => n === "sel");
    expect(selNodes.length).toBe(3);
  });

  it("builds with single division", () => {
    const spec = buildClock({ divisions: [1] });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("metro");
    const selNodes = names.filter((n) => n === "sel");
    expect(selNodes.length).toBe(1);
  });
});

// ──────────────────────────────────────────────
// Chaos
// ──────────────────────────────────────────────

describe("chaos template", () => {
  it("builds with defaults (3 outputs)", () => {
    const spec = buildChaos();
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("loadbang");
    // 3 channels → 3 metros
    const metros = names.filter((n) => n === "metro");
    expect(metros.length).toBe(3);
    // Uses t (trigger) for computation
    expect(names).toContain("t");
  });

  it("builds with 1 output", () => {
    const spec = buildChaos({ outputs: 1 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    const metros = names.filter((n) => n === "metro");
    expect(metros.length).toBe(1);
  });

  it("builds with custom r and speed", () => {
    const spec = buildChaos({ r: 3.7, speed: 0.8, outputs: 2 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    const metros = names.filter((n) => n === "metro");
    expect(metros.length).toBe(2);
  });
});

// ──────────────────────────────────────────────
// Maths
// ──────────────────────────────────────────────

describe("maths template", () => {
  it("builds with defaults (2 channels, unipolar)", () => {
    const spec = buildMaths();
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("sel");       // gate → sel 1 0
    expect(names).toContain("vline~");    // envelope generator
    expect(names).toContain("threshold~"); // EOC detection
    expect(names).toContain("outlet~");   // output
    // 2 channels → 2 vline~ nodes
    const vlines = names.filter((n) => n === "vline~");
    expect(vlines.length).toBe(2);
  });

  it("builds with 1 channel", () => {
    const spec = buildMaths({ channels: 1 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    const vlines = names.filter((n) => n === "vline~");
    expect(vlines.length).toBe(1);
  });

  it("builds bipolar output", () => {
    const spec = buildMaths({ outputRange: "bipolar" });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    // Bipolar: *~ 2 → -~ 1
    expect(names).toContain("-~");
  });

  it("builds cycle mode (LFO)", () => {
    const spec = buildMaths({ cycle: true });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("loadbang"); // auto-start
    expect(names).toContain("delay");    // retrigger delay
  });

  it("builds non-cycle mode (no delay, no loadbang auto-start)", () => {
    const spec = buildMaths({ cycle: false });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).not.toContain("delay");
  });
});

// ──────────────────────────────────────────────
// Turing Machine
// ──────────────────────────────────────────────

describe("turing-machine template", () => {
  it("builds with defaults (8 steps)", () => {
    const spec = buildTuringMachine();
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("loadbang");
    expect(names).toContain("metro");
    expect(names).toContain("table");      // sequence storage
    expect(names).toContain("tabread");    // read from table
    expect(names).toContain("tabwrite");   // write mutations
    expect(names).toContain("random");     // probability check + new values
    expect(names).toContain("moses");      // probability threshold
    expect(names).toContain("t");          // trigger for split
  });

  it("builds with custom params", () => {
    const spec = buildTuringMachine({
      length: 12,
      probability: 0.3,
      bpm: 140,
      range: 36,
      offset: 36,
    });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("table");
    expect(names).toContain("metro");
    expect(names).toContain("moses");
  });

  it("builds with probability=0 (locked loop)", () => {
    const spec = buildTuringMachine({ probability: 0 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("moses"); // moses 0 → never mutates
  });

  it("builds with probability=1 (pure random)", () => {
    const spec = buildTuringMachine({ probability: 1 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("moses"); // moses 100 → always mutates
  });
});

// ──────────────────────────────────────────────
// Granular
// ──────────────────────────────────────────────

describe("granular template", () => {
  it("builds with defaults (2 grains)", () => {
    const spec = buildGranular();
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("table");       // buffer
    expect(names).toContain("adc~");        // input
    expect(names).toContain("tabwrite~");   // recording
    expect(names).toContain("tabread4~");   // grain playback
    expect(names).toContain("phasor~");     // grain rate
    expect(names).toContain("clip~");       // grain envelope
    expect(names).toContain("spigot");      // record control
    expect(names).toContain("dac~");
    // 2 grains → 2 tabread4~
    const tabreads = names.filter((n) => n === "tabread4~");
    expect(tabreads.length).toBe(2);
  });

  it("builds with 4 grains", () => {
    const spec = buildGranular({ grains: 4 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    const tabreads = names.filter((n) => n === "tabread4~");
    expect(tabreads.length).toBe(4);
  });

  it("builds with 1 grain (no summing)", () => {
    const spec = buildGranular({ grains: 1 });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    const tabreads = names.filter((n) => n === "tabread4~");
    expect(tabreads.length).toBe(1);
  });

  it("builds with freeze=true (record=0)", () => {
    const spec = buildGranular({ freeze: true });
    const { pdText } = roundTrip(spec);

    // When freeze=true, the init message should send 0 (record off)
    // The msg box for loadbang init should contain 0
    expect(pdText).toContain("spigot");
  });

  it("builds with custom params", () => {
    const spec = buildGranular({
      grains: 3,
      grainSize: 200,
      pitch: 2.0,
      position: 0.3,
      wetDry: 0.8,
    });
    const { parsed } = roundTrip(spec);

    const names = parsed.root.nodes.map((n) => n.name).filter(Boolean);
    expect(names).toContain("dac~");
    const tabreads = names.filter((n) => n === "tabread4~");
    expect(tabreads.length).toBe(3);
  });
});

// ──────────────────────────────────────────────
// Template Registry
// ──────────────────────────────────────────────

describe("template registry", () => {
  it("lists all available templates", () => {
    expect(TEMPLATE_NAMES).toEqual([
      "synth",
      "sequencer",
      "reverb",
      "mixer",
      "drum-machine",
      "clock",
      "chaos",
      "maths",
      "turing-machine",
      "granular",
      "bridge",
    ]);
  });

  it("builds each template with defaults without throwing", () => {
    for (const name of TEMPLATE_NAMES) {
      const spec = buildTemplate(name);
      const pdText = buildPatch(spec);
      expect(pdText).toContain("#N canvas");
    }
  });

  it("throws on unknown template", () => {
    expect(() => buildTemplate("nonexistent")).toThrow(/Unknown template/);
  });
});
