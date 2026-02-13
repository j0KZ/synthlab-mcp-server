/**
 * Tests for the composer system: scales, presets, moods, wiring rules, song mapper.
 */

import { describe, it, expect } from "vitest";
import { generateScale } from "../../src/composer/scales.js";
import { GENRE_PRESETS } from "../../src/composer/presets.js";
import { MOOD_ADJUSTMENTS } from "../../src/composer/moods.js";
import { generateWiringPlan } from "../../src/composer/wiring-rules.js";
import { mapSongToRack } from "../../src/composer/song-mapper.js";
import {
  GENRES,
  MOODS,
  SCALE_TYPES,
  INSTRUMENT_ROLES,
  type Genre,
  type Mood,
  type ResolvedModule,
  type SongSpec,
} from "../../src/composer/types.js";

// ─── Scales ──────────────────────────────────────────────

describe("generateScale", () => {
  it("generates C major scale at octave 4", () => {
    const notes = generateScale("C", "major", 4);
    expect(notes).toEqual([60, 62, 64, 65, 67, 69, 71]);
  });

  it("generates A minor scale at octave 3", () => {
    const notes = generateScale("A", "minor", 3);
    // A3 = 57
    expect(notes).toEqual([57, 59, 60, 62, 64, 65, 67]);
  });

  it("generates pentatonic-minor with 5 notes", () => {
    const notes = generateScale("C", "pentatonic-minor", 4);
    expect(notes).toHaveLength(5);
    expect(notes).toEqual([60, 63, 65, 67, 70]);
  });

  it("generates chromatic with 12 notes", () => {
    const notes = generateScale("C", "chromatic", 4);
    expect(notes).toHaveLength(12);
    expect(notes[0]).toBe(60);
    expect(notes[11]).toBe(71);
  });

  it("wraps to next octave when length > intervals", () => {
    const notes = generateScale("C", "major", 4, 14);
    expect(notes).toHaveLength(14);
    // Octave wrap: note 8 should be C5 = 72
    expect(notes[7]).toBe(72);
  });

  it("clamps to 0-127 MIDI range", () => {
    const high = generateScale("C", "major", 9, 14);
    expect(high.every((n) => n <= 127)).toBe(true);
    const low = generateScale("C", "major", 0);
    expect(low.every((n) => n >= 0)).toBe(true);
  });

  it("supports custom length = 16", () => {
    const notes = generateScale("D", "minor", 4, 16);
    expect(notes).toHaveLength(16);
  });

  it("all scale types produce non-empty arrays", () => {
    for (const scale of SCALE_TYPES) {
      const notes = generateScale("C", scale, 4);
      expect(notes.length).toBeGreaterThan(0);
    }
  });
});

// ─── Presets ─────────────────────────────────────────────

describe("GENRE_PRESETS", () => {
  it("has an entry for every genre", () => {
    for (const genre of GENRES) {
      expect(GENRE_PRESETS[genre]).toBeDefined();
    }
  });

  it("every genre has required fields", () => {
    for (const genre of GENRES) {
      const preset = GENRE_PRESETS[genre];
      expect(preset.tempo).toBeGreaterThan(0);
      expect(preset.tempoRange).toHaveLength(2);
      expect(preset.tempoRange[0]).toBeLessThanOrEqual(preset.tempoRange[1]);
      expect(preset.defaultInstruments.length).toBeGreaterThan(0);
      expect(preset.defaultKey.root).toBeDefined();
      expect(preset.defaultKey.scale).toBeDefined();
      expect(MOODS).toContain(preset.defaultMood);
    }
  });

  it("default tempo is within range", () => {
    for (const genre of GENRES) {
      const preset = GENRE_PRESETS[genre];
      expect(preset.tempo).toBeGreaterThanOrEqual(preset.tempoRange[0]);
      expect(preset.tempo).toBeLessThanOrEqual(preset.tempoRange[1]);
    }
  });

  it("every genre has clock divisions", () => {
    for (const genre of GENRES) {
      expect(GENRE_PRESETS[genre].clockDivisions.length).toBeGreaterThan(0);
    }
  });

  it("GENRES array matches preset keys", () => {
    const presetKeys = Object.keys(GENRE_PRESETS).sort();
    const genresSorted = [...GENRES].sort();
    expect(genresSorted).toEqual(presetKeys);
  });
});

// ─── Moods ───────────────────────────────────────────────

describe("MOOD_ADJUSTMENTS", () => {
  it("has an entry for every mood", () => {
    for (const mood of MOODS) {
      expect(MOOD_ADJUSTMENTS[mood]).toBeDefined();
    }
  });

  it("every mood has synth, reverb, drums sections", () => {
    for (const mood of MOODS) {
      const adj = MOOD_ADJUSTMENTS[mood];
      expect(adj.synth).toBeDefined();
      expect(adj.reverb).toBeDefined();
      expect(adj.drums).toBeDefined();
    }
  });

  it("dark mood cutoff is lower than bright mood cutoff", () => {
    const dark = MOOD_ADJUSTMENTS.dark.synth.cutoff as number;
    const bright = MOOD_ADJUSTMENTS.bright.synth.cutoff as number;
    expect(dark).toBeLessThan(bright);
  });

  it("reverb values are 0-1", () => {
    for (const mood of MOODS) {
      const { reverb } = MOOD_ADJUSTMENTS[mood];
      for (const [, val] of Object.entries(reverb)) {
        expect(val as number).toBeGreaterThanOrEqual(0);
        expect(val as number).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ─── Wiring Rules ────────────────────────────────────────

describe("generateWiringPlan", () => {
  it("single synth → mixer with 1 channel", () => {
    const modules: ResolvedModule[] = [
      { id: "pad", template: "synth", role: "pad", params: {} },
    ];
    const { modules: flat, wires } = generateWiringPlan(
      modules, [], [], [1, 4], 120,
    );
    const mixer = flat.find((m) => m.template === "mixer");
    expect(mixer).toBeDefined();
    expect(mixer!.params!.channels).toBe(1);
    expect(wires.some((w) => w.from === "pad" && w.to === "mixer")).toBe(true);
  });

  it("drums + synth → mixer with 2 channels", () => {
    const modules: ResolvedModule[] = [
      { id: "drums", template: "drum-machine", role: "drums", params: { voices: ["bd", "hh"] } },
      { id: "lead_synth", template: "synth", role: "lead", params: {} },
    ];
    const { modules: flat, wires } = generateWiringPlan(
      modules, [], [], [1, 4], 130,
    );
    const mixer = flat.find((m) => m.template === "mixer");
    expect(mixer!.params!.channels).toBe(2);
    // Both audio producers wired to mixer
    expect(wires.filter((w) => w.to === "mixer").length).toBe(2);
  });

  it("creates clock when sequencer present", () => {
    const modules: ResolvedModule[] = [
      { id: "seq", template: "sequencer", params: {} },
      { id: "synth", template: "synth", params: {} },
    ];
    const { modules: flat, wires } = generateWiringPlan(
      modules, [{ from: "seq", output: "note", to: "synth", input: "note" }],
      [], [1, 4], 120,
    );
    expect(flat.some((m) => m.template === "clock")).toBe(true);
    expect(wires.some((w) => w.from === "clock" && w.to === "seq")).toBe(true);
  });

  it("creates clock when drum-machine present", () => {
    const modules: ResolvedModule[] = [
      { id: "drums", template: "drum-machine", params: { voices: ["bd", "sn"] } },
    ];
    const { modules: flat, wires } = generateWiringPlan(
      modules, [], [], [1, 4], 130,
    );
    expect(flat.some((m) => m.template === "clock")).toBe(true);
    expect(wires.some((w) => w.input === "trig_bd")).toBe(true);
    expect(wires.some((w) => w.input === "trig_sn")).toBe(true);
  });

  it("no clock when only pads (synths without sequencers)", () => {
    const modules: ResolvedModule[] = [
      { id: "pad", template: "synth", params: {} },
    ];
    const { modules: flat } = generateWiringPlan(
      modules, [], [], [1, 4], 120,
    );
    expect(flat.some((m) => m.template === "clock")).toBe(false);
  });

  it("effects chain wired serially after mixer", () => {
    const modules: ResolvedModule[] = [
      { id: "pad", template: "synth", params: {} },
    ];
    const effects: ResolvedModule[] = [
      { id: "fx_reverb", template: "reverb", params: {} },
      { id: "fx_granular", template: "granular", params: {} },
    ];
    const { wires } = generateWiringPlan(
      modules, [], effects, [1], 120,
    );
    // mixer → reverb → granular
    expect(wires.some((w) => w.from === "mixer" && w.to === "fx_reverb")).toBe(true);
    expect(wires.some((w) => w.from === "fx_reverb" && w.to === "fx_granular")).toBe(true);
  });

  it("preserves internal wires in output", () => {
    const internal = [{ from: "seq", output: "note", to: "synth", input: "note" }];
    const modules: ResolvedModule[] = [
      { id: "seq", template: "sequencer", params: {} },
      { id: "synth", template: "synth", params: {} },
    ];
    const { wires } = generateWiringPlan(modules, internal, [], [1], 120);
    expect(wires).toContainEqual(internal[0]);
  });

  it("each clock target gets a unique division", () => {
    const modules: ResolvedModule[] = [
      { id: "seq1", template: "sequencer", params: {} },
      { id: "seq2", template: "sequencer", params: {} },
      { id: "drums", template: "drum-machine", params: { voices: ["bd", "sn", "hh"] } },
    ];
    const { wires } = generateWiringPlan(modules, [], [], [1, 4], 120);
    const clockWires = wires.filter((w) => w.from === "clock");
    // 2 sequencers + 3 drum voices = 5 unique targets
    expect(clockWires).toHaveLength(5);
    // Each output port should be unique
    const outputs = clockWires.map((w) => w.output);
    expect(new Set(outputs).size).toBe(5);
  });

  it("flat modules contain ALL modules (clock + instruments + mixer + effects)", () => {
    const modules: ResolvedModule[] = [
      { id: "seq", template: "sequencer", params: {} },
      { id: "synth", template: "synth", params: {} },
    ];
    const effects: ResolvedModule[] = [
      { id: "fx_reverb", template: "reverb", params: {} },
    ];
    const { modules: flat } = generateWiringPlan(
      modules,
      [{ from: "seq", output: "note", to: "synth", input: "note" }],
      effects,
      [1, 4],
      120,
    );
    const templates = flat.map((m) => m.template);
    expect(templates).toContain("clock");
    expect(templates).toContain("sequencer");
    expect(templates).toContain("synth");
    expect(templates).toContain("mixer");
    expect(templates).toContain("reverb");
  });
});

// ─── Song Mapper ─────────────────────────────────────────

describe("mapSongToRack", () => {
  it("genre-only spec produces valid CreateRackInput", () => {
    const result = mapSongToRack({ genre: "techno" });
    expect(result.modules).toBeDefined();
    expect(result.modules.length).toBeGreaterThan(0);
    expect(result.wiring).toBeDefined();
  });

  it("every genre builds successfully", () => {
    for (const genre of GENRES) {
      const result = mapSongToRack({ genre });
      expect(result.modules.length).toBeGreaterThan(0);
    }
  });

  it("tempo override is clamped to genre range", () => {
    // techno range: [120, 150]
    const result = mapSongToRack({ genre: "techno", tempo: 200 });
    const clock = result.modules.find((m) => m.template === "clock");
    expect(clock).toBeDefined();
    expect((clock!.params as Record<string, unknown>).tempo).toBe(150); // clamped
  });

  it("key override affects sequencer notes", () => {
    const result = mapSongToRack({
      genre: "techno",
      key: { root: "A", scale: "minor" },
    });
    // Find a sequencer module
    const seq = result.modules.find((m) => m.template === "sequencer");
    expect(seq).toBeDefined();
    const notes = (seq!.params as Record<string, unknown>).notes as number[];
    // A minor starts at A4 = 69 (or A2 for bass)
    expect(notes[0]).toBeOneOf([45, 57, 69, 81]); // A at various octaves
  });

  it("mood override adjusts synth cutoff", () => {
    const dark = mapSongToRack({ genre: "techno", mood: "dark" });
    const bright = mapSongToRack({ genre: "techno", mood: "bright" });

    const darkSynth = dark.modules.find((m) => m.template === "synth");
    const brightSynth = bright.modules.find((m) => m.template === "synth");

    const darkCutoff = (darkSynth!.params as Record<string, unknown>).cutoff as number;
    const brightCutoff = (brightSynth!.params as Record<string, unknown>).cutoff as number;
    expect(darkCutoff).toBeLessThan(brightCutoff);
  });

  it("custom instruments override defaults", () => {
    const result = mapSongToRack({
      genre: "techno",
      instruments: [{ role: "pad" }],
    });
    // Should only have pad synth (+ mixer + effects), no drums
    const drum = result.modules.find((m) => m.template === "drum-machine");
    expect(drum).toBeUndefined();
    const synth = result.modules.find((m) => m.template === "synth");
    expect(synth).toBeDefined();
  });

  it("effects override", () => {
    const result = mapSongToRack({
      genre: "techno",
      effects: ["granular"],
    });
    const reverb = result.modules.find((m) => m.id === "fx_reverb");
    expect(reverb).toBeUndefined();
    const granular = result.modules.find((m) => m.id === "fx_granular");
    expect(granular).toBeDefined();
  });

  it("controller config is passed through", () => {
    const result = mapSongToRack({
      genre: "ambient",
      controller: { device: "k2", midiChannel: 16 },
    });
    expect(result.controller).toBeDefined();
    expect(result.controller!.device).toBe("k2");
    expect(result.controller!.midiChannel).toBe(16);
  });

  it("outputDir is passed through", () => {
    const result = mapSongToRack({
      genre: "ambient",
      outputDir: "/tmp/my-patch",
    });
    expect(result.outputDir).toBe("/tmp/my-patch");
  });

  it("arpeggio role expands to sequencer + synth", () => {
    const result = mapSongToRack({
      genre: "idm",
      instruments: [{ role: "arpeggio" }],
    });
    const seq = result.modules.find((m) => m.template === "sequencer");
    const synth = result.modules.find((m) => m.template === "synth");
    expect(seq).toBeDefined();
    expect(synth).toBeDefined();
    // Should have internal wire: seq → synth
    expect(result.wiring!.some(
      (w) => w.output === "note" && w.input === "note",
    )).toBe(true);
  });

  it("modulator role expands to turing-machine + synth", () => {
    const result = mapSongToRack({
      genre: "experimental",
      instruments: [{ role: "modulator" }],
    });
    const tm = result.modules.find((m) => m.template === "turing-machine");
    const synth = result.modules.find((m) => m.template === "synth");
    expect(tm).toBeDefined();
    expect(synth).toBeDefined();
  });

  it("texture role expands to noise synth + granular", () => {
    const result = mapSongToRack({
      genre: "ambient",
      instruments: [{ role: "texture" }],
    });
    const noiseSynth = result.modules.find(
      (m) => m.template === "synth" && (m.params as Record<string, unknown>).waveform === "noise",
    );
    const gran = result.modules.find((m) => m.template === "granular");
    expect(noiseSynth).toBeDefined();
    expect(gran).toBeDefined();
  });

  it("duplicate roles get unique IDs", () => {
    const result = mapSongToRack({
      genre: "drone",
      instruments: [{ role: "pad" }, { role: "pad" }],
    });
    const synths = result.modules.filter((m) => m.template === "synth");
    expect(synths.length).toBeGreaterThanOrEqual(2);
    const ids = synths.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length); // all unique
  });

  it("template override uses specified template", () => {
    const result = mapSongToRack({
      genre: "techno",
      instruments: [{ role: "lead", template: "chaos" }],
    });
    const chaos = result.modules.find((m) => m.template === "chaos");
    expect(chaos).toBeDefined();
  });
});

// ─── Validation ──────────────────────────────────────────

describe("mapSongToRack validation", () => {
  it("throws on invalid genre", () => {
    expect(() => mapSongToRack({ genre: "reggae" as Genre })).toThrow(/Unknown genre/);
  });

  it("throws on unknown instrument role", () => {
    expect(() =>
      mapSongToRack({
        genre: "techno",
        instruments: [{ role: "violin" as any }],
      }),
    ).toThrow(/Unknown instrument role/);
  });
});
