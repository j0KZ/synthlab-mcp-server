/**
 * Song mapper — converts SongSpec to CreateRackInput.
 *
 * Core algorithm:
 * 1. Resolve genre preset + mood adjustment
 * 2. Expand instruments to resolved modules + internal wires
 * 3. Resolve effects with mood-adjusted params
 * 4. Call generateWiringPlan()
 * 5. Return CreateRackInput for executeCreateRack()
 */

import type {
  SongSpec,
  Mood,
  InstrumentSpec,
  InstrumentRole,
  ResolvedModule,
  GenrePreset,
  MoodAdjustment,
} from "./types.js";
import type { CreateRackInput } from "../tools/rack.js";
import type { WireSpec } from "../wiring/bus-injector.js";
import type { ControllerConfig } from "../controllers/types.js";
import { GENRE_PRESETS } from "./presets.js";
import { MOOD_ADJUSTMENTS } from "./moods.js";
import { generateScale } from "./scales.js";
import { generateWiringPlan } from "./wiring-rules.js";

/**
 * Map a SongSpec to a complete CreateRackInput for executeCreateRack().
 */
export function mapSongToRack(spec: SongSpec): CreateRackInput {
  const preset = GENRE_PRESETS[spec.genre];
  if (!preset) {
    throw new Error(
      `Unknown genre "${spec.genre}". Valid: ${Object.keys(GENRE_PRESETS).join(", ")}`,
    );
  }

  // Resolve defaults from preset
  const tempo = clampTempo(spec.tempo ?? preset.tempo, preset.tempoRange);
  const mood: Mood = spec.mood ?? preset.defaultMood;
  const moodAdj = MOOD_ADJUSTMENTS[mood];
  const key = spec.key ?? preset.defaultKey;
  const instruments = spec.instruments ?? preset.defaultInstruments;
  const effects = spec.effects ?? preset.defaultEffects;

  // Generate scale notes (16 notes for sequencers, wraps across octaves)
  const scaleNotes = generateScale(key.root, key.scale, 4, 16);
  const bassNotes = generateScale(key.root, key.scale, 2, 16);

  // Expand instruments to resolved modules + internal wires
  const usedIds = new Set<string>();
  const allModules: ResolvedModule[] = [];
  const internalWires: WireSpec[] = [];

  for (const inst of instruments) {
    const { modules, wires } = resolveInstrument(
      inst,
      preset,
      moodAdj,
      scaleNotes,
      bassNotes,
      usedIds,
    );
    allModules.push(...modules);
    internalWires.push(...wires);
  }

  // Resolve effects with mood-adjusted params
  const effectModules = resolveEffects(effects, moodAdj);

  // Generate complete wiring plan (adds clock, mixer, effects chain)
  const { modules: flatModules, wires: allWires } = generateWiringPlan(
    allModules,
    internalWires,
    effectModules,
    preset.clockDivisions,
    tempo,
  );

  // Map controller config (SongSpec shape matches ControllerConfig)
  const controller: ControllerConfig | undefined = spec.controller
    ? {
        device: spec.controller.device,
        midiChannel: spec.controller.midiChannel,
        mappings: spec.controller.mappings?.map((m) => ({
          control: m.control,
          module: m.module,
          parameter: m.parameter,
        })),
      }
    : undefined;

  return {
    modules: flatModules,
    wiring: allWires.length > 0 ? allWires : undefined,
    controller,
    outputDir: spec.outputDir,
  };
}

// ---------------------------------------------------------------------------
// Instrument resolution
// ---------------------------------------------------------------------------

function resolveInstrument(
  inst: InstrumentSpec,
  preset: GenrePreset,
  moodAdj: MoodAdjustment,
  scaleNotes: number[],
  bassNotes: number[],
  usedIds: Set<string>,
): { modules: ResolvedModule[]; wires: WireSpec[] } {
  // User-specified template override → single module, no auto-wiring
  if (inst.template) {
    const id = deduplicateId(inst.id ?? inst.role, usedIds);
    return {
      modules: [
        { id, template: inst.template, role: inst.role, params: inst.params ?? {} },
      ],
      wires: [],
    };
  }

  const baseId = inst.id ?? inst.role;

  switch (inst.role) {
    case "lead":
      return resolveSeqSynthPair(
        baseId, "lead", preset, moodAdj, scaleNotes, inst.params, usedIds,
      );

    case "bass":
      return resolveSeqSynthPair(
        baseId, "bass", preset, moodAdj, bassNotes, inst.params, usedIds,
      );

    case "arpeggio":
      return resolveSeqSynthPair(
        baseId, "arpeggio", preset, moodAdj, scaleNotes, inst.params, usedIds,
      );

    case "pad":
      return resolvePad(baseId, preset, moodAdj, inst.params, usedIds);

    case "drums":
      return resolveDrums(baseId, preset, moodAdj, inst.params, usedIds);

    case "sequence":
      return resolveSequence(baseId, scaleNotes, inst.params, usedIds);

    case "texture":
      return resolveTexture(baseId, inst.params, usedIds);

    case "modulator":
      return resolveModulator(baseId, preset, moodAdj, inst.params, usedIds);

    default:
      throw new Error(
        `Unknown instrument role "${inst.role}". Valid: lead, bass, pad, drums, arpeggio, sequence, texture, modulator`,
      );
  }
}

// ---------------------------------------------------------------------------
// Role resolvers
// ---------------------------------------------------------------------------

/**
 * Sequencer + Synth pair — used by lead, bass, arpeggio roles.
 * The sequencer drives note changes; synth has envelope: "adsr" for gate input.
 */
function resolveSeqSynthPair(
  baseId: string,
  role: InstrumentRole,
  preset: GenrePreset,
  moodAdj: MoodAdjustment,
  notes: number[],
  userParams: Record<string, unknown> | undefined,
  usedIds: Set<string>,
): { modules: ResolvedModule[]; wires: WireSpec[] } {
  const seqId = deduplicateId(`${baseId}_seq`, usedIds);
  const synthId = deduplicateId(`${baseId}_synth`, usedIds);

  // Merge: preset defaults → mood adjustments → user overrides
  const synthParams: Record<string, unknown> = {
    ...preset.synthDefaults,
    ...moodAdj.synth,
    envelope: "adsr",
    ...(userParams ?? {}),
  };

  return {
    modules: [
      {
        id: seqId,
        template: "sequencer",
        role,
        params: { notes, steps: notes.length },
      },
      {
        id: synthId,
        template: "synth",
        role,
        params: synthParams,
      },
    ],
    wires: [
      { from: seqId, output: "note", to: synthId, input: "note" },
    ],
  };
}

/**
 * Pad — standalone synth with envelope: "none" (continuous tone).
 * Pads don't need a sequencer; they play a sustained note.
 */
function resolvePad(
  baseId: string,
  preset: GenrePreset,
  moodAdj: MoodAdjustment,
  userParams: Record<string, unknown> | undefined,
  usedIds: Set<string>,
): { modules: ResolvedModule[]; wires: WireSpec[] } {
  const id = deduplicateId(baseId, usedIds);

  const params: Record<string, unknown> = {
    ...preset.synthDefaults,
    ...moodAdj.synth,
    envelope: "none",
    amplitude: 0.15,
    ...(userParams ?? {}),
  };

  return {
    modules: [{ id, template: "synth", role: "pad", params }],
    wires: [],
  };
}

/**
 * Drums — drum machine with genre/mood voices and params.
 */
function resolveDrums(
  baseId: string,
  preset: GenrePreset,
  moodAdj: MoodAdjustment,
  userParams: Record<string, unknown> | undefined,
  usedIds: Set<string>,
): { modules: ResolvedModule[]; wires: WireSpec[] } {
  const id = deduplicateId(baseId, usedIds);

  const params: Record<string, unknown> = {
    ...preset.drumDefaults,
    ...moodAdj.drums,
    ...(userParams ?? {}),
  };

  return {
    modules: [{ id, template: "drum-machine", role: "drums", params }],
    wires: [],
  };
}

/**
 * Sequence — standalone sequencer (MIDI output, no paired synth).
 */
function resolveSequence(
  baseId: string,
  notes: number[],
  userParams: Record<string, unknown> | undefined,
  usedIds: Set<string>,
): { modules: ResolvedModule[]; wires: WireSpec[] } {
  const id = deduplicateId(baseId, usedIds);

  return {
    modules: [
      {
        id,
        template: "sequencer",
        role: "sequence",
        params: { notes, steps: notes.length, ...(userParams ?? {}) },
      },
    ],
    wires: [],
  };
}

/**
 * Texture — noise synth (audio source) + granular processor.
 * The noise synth feeds the granular's audio_in port.
 */
function resolveTexture(
  baseId: string,
  userParams: Record<string, unknown> | undefined,
  usedIds: Set<string>,
): { modules: ResolvedModule[]; wires: WireSpec[] } {
  const srcId = deduplicateId(`${baseId}_src`, usedIds);
  const fxId = deduplicateId(baseId, usedIds);

  return {
    modules: [
      {
        id: srcId,
        template: "synth",
        role: "texture",
        params: { waveform: "noise", envelope: "none", amplitude: 0.2 },
      },
      {
        id: fxId,
        template: "granular",
        role: "texture",
        params: { ...(userParams ?? {}) },
      },
    ],
    wires: [
      { from: srcId, output: "audio", to: fxId, input: "audio_in" },
    ],
  };
}

/**
 * Modulator — turing machine (random note generator) + synth.
 * Turing machine outputs note (control), synth needs envelope: "adsr" for gate.
 */
function resolveModulator(
  baseId: string,
  preset: GenrePreset,
  moodAdj: MoodAdjustment,
  userParams: Record<string, unknown> | undefined,
  usedIds: Set<string>,
): { modules: ResolvedModule[]; wires: WireSpec[] } {
  const tmId = deduplicateId(`${baseId}_tm`, usedIds);
  const synthId = deduplicateId(`${baseId}_synth`, usedIds);

  const synthParams: Record<string, unknown> = {
    ...preset.synthDefaults,
    ...moodAdj.synth,
    envelope: "adsr",
    ...(userParams ?? {}),
  };

  return {
    modules: [
      { id: tmId, template: "turing-machine", role: "modulator", params: {} },
      { id: synthId, template: "synth", role: "modulator", params: synthParams },
    ],
    wires: [
      { from: tmId, output: "note", to: synthId, input: "note" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Effects resolution
// ---------------------------------------------------------------------------

function resolveEffects(
  effects: ("reverb" | "granular")[],
  moodAdj: MoodAdjustment,
): ResolvedModule[] {
  return effects.map((effect) => {
    if (effect === "reverb") {
      return {
        id: "fx_reverb",
        template: "reverb",
        params: { ...moodAdj.reverb },
      };
    }
    return {
      id: "fx_granular",
      template: "granular",
      params: {},
    };
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function clampTempo(tempo: number, range: [number, number]): number {
  return Math.max(range[0], Math.min(range[1], tempo));
}

function deduplicateId(id: string, usedIds: Set<string>): string {
  if (!usedIds.has(id)) {
    usedIds.add(id);
    return id;
  }
  let counter = 2;
  while (usedIds.has(`${id}-${counter}`)) counter++;
  const unique = `${id}-${counter}`;
  usedIds.add(unique);
  return unique;
}
