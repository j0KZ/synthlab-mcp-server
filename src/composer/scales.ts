/**
 * Musical scale generator — converts key + scale type to MIDI note arrays.
 */

import type { NoteName, ScaleType } from "./types.js";

/** Semitone intervals from root for each scale type. */
const SCALE_INTERVALS: Record<ScaleType, number[]> = {
  "major":            [0, 2, 4, 5, 7, 9, 11],
  "minor":            [0, 2, 3, 5, 7, 8, 10],
  "dorian":           [0, 2, 3, 5, 7, 9, 10],
  "phrygian":         [0, 1, 3, 5, 7, 8, 10],
  "mixolydian":       [0, 2, 4, 5, 7, 9, 10],
  "pentatonic-major": [0, 2, 4, 7, 9],
  "pentatonic-minor": [0, 3, 5, 7, 10],
  "chromatic":        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  "whole-tone":       [0, 2, 4, 6, 8, 10],
  "blues":            [0, 3, 5, 6, 7, 10],
};

/** Note name to semitone offset (C=0). */
const NOTE_OFFSETS: Record<NoteName, number> = {
  "C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5,
  "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11,
};

/**
 * Generate MIDI note numbers for a scale.
 *
 * @param root - Root note name
 * @param scale - Scale type
 * @param octave - Starting octave (default 4 = middle C region). C4 = MIDI 60.
 * @param length - Number of notes (default = one octave of the scale)
 * @returns MIDI note numbers clamped to 0-127
 */
export function generateScale(
  root: NoteName,
  scale: ScaleType,
  octave: number = 4,
  length?: number,
): number[] {
  const rootMidi = NOTE_OFFSETS[root] + (octave + 1) * 12;
  const intervals = SCALE_INTERVALS[scale];
  const count = length ?? intervals.length;

  const notes: number[] = [];
  for (let i = 0; i < count; i++) {
    const octaveShift = Math.floor(i / intervals.length) * 12;
    const intervalIdx = i % intervals.length;
    const midi = rootMidi + intervals[intervalIdx] + octaveShift;
    notes.push(Math.min(127, Math.max(0, midi)));
  }
  return notes;
}
