/**
 * Types for the Socratic song composition system.
 *
 * SongSpec is the high-level input: genre, mood, tempo, instruments.
 * The mapper converts it to CreateRackInput for existing infrastructure.
 */

export type Genre =
  | "ambient"
  | "techno"
  | "house"
  | "dnb"
  | "experimental"
  | "idm"
  | "minimal"
  | "drone"
  | "noise";

export const GENRES: Genre[] = [
  "ambient", "techno", "house", "dnb", "experimental",
  "idm", "minimal", "drone", "noise",
];

export type Mood =
  | "dark"
  | "bright"
  | "aggressive"
  | "chill"
  | "ethereal"
  | "melancholic"
  | "energetic";

export const MOODS: Mood[] = [
  "dark", "bright", "aggressive", "chill",
  "ethereal", "melancholic", "energetic",
];

export type ScaleType =
  | "major"
  | "minor"
  | "dorian"
  | "phrygian"
  | "mixolydian"
  | "pentatonic-major"
  | "pentatonic-minor"
  | "chromatic"
  | "whole-tone"
  | "blues";

export const SCALE_TYPES: ScaleType[] = [
  "major", "minor", "dorian", "phrygian", "mixolydian",
  "pentatonic-major", "pentatonic-minor", "chromatic",
  "whole-tone", "blues",
];

export type NoteName =
  | "C" | "C#" | "D" | "D#" | "E" | "F"
  | "F#" | "G" | "G#" | "A" | "A#" | "B";

export const NOTE_NAMES: NoteName[] = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B",
];

export type InstrumentRole =
  | "lead"
  | "bass"
  | "pad"
  | "drums"
  | "arpeggio"
  | "sequence"
  | "texture"
  | "modulator";

export const INSTRUMENT_ROLES: InstrumentRole[] = [
  "lead", "bass", "pad", "drums", "arpeggio",
  "sequence", "texture", "modulator",
];

export interface InstrumentSpec {
  role: InstrumentRole;
  id?: string;
  /** Override role-based template selection. */
  template?: string;
  /** Template parameter overrides — merged on top of genre/mood defaults. */
  params?: Record<string, unknown>;
}

export interface SongSpec {
  genre: Genre;
  tempo?: number;
  mood?: Mood;
  key?: { root: NoteName; scale: ScaleType };
  instruments?: InstrumentSpec[];
  effects?: ("reverb" | "granular")[];
  controller?: {
    device: string;
    midiChannel?: number;
    mappings?: { control: string; module: string; parameter: string }[];
  };
  outputDir?: string;
}

export interface GenrePreset {
  tempo: number;
  tempoRange: [number, number];
  defaultInstruments: InstrumentSpec[];
  defaultEffects: ("reverb" | "granular")[];
  defaultKey: { root: NoteName; scale: ScaleType };
  defaultMood: Mood;
  synthDefaults: Record<string, unknown>;
  drumDefaults: Record<string, unknown>;
  clockDivisions: number[];
}

export interface MoodAdjustment {
  synth: Record<string, unknown>;
  reverb: Record<string, unknown>;
  drums: Record<string, unknown>;
}

/** Resolved module — output of instrument resolution, input to wiring. */
export interface ResolvedModule {
  id: string;
  template: string;
  role?: InstrumentRole;
  params: Record<string, unknown>;
}
