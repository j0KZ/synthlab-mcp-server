/**
 * Mood parameter adjustments — applied on top of genre defaults.
 */

import type { Mood, MoodAdjustment } from "./types.js";

export const MOOD_ADJUSTMENTS: Record<Mood, MoodAdjustment> = {
  dark: {
    synth: { cutoff: 600, amplitude: 0.25 },
    reverb: { roomSize: 0.8, damping: 0.3, wetDry: 0.5 },
    drums: { tone: 0.2, decay: 0.6 },
  },
  bright: {
    synth: { cutoff: 5000, amplitude: 0.35 },
    reverb: { roomSize: 0.4, damping: 0.7, wetDry: 0.3 },
    drums: { tone: 0.8, decay: 0.4 },
  },
  aggressive: {
    synth: { cutoff: 4000, amplitude: 0.5, filter: "moog" },
    reverb: { roomSize: 0.3, damping: 0.5, wetDry: 0.2 },
    drums: { tone: 0.7, decay: 0.2, amplitude: 0.7 },
  },
  chill: {
    synth: { cutoff: 1200, amplitude: 0.2 },
    reverb: { roomSize: 0.7, damping: 0.6, wetDry: 0.5 },
    drums: { tone: 0.4, decay: 0.5, amplitude: 0.3 },
  },
  ethereal: {
    synth: { cutoff: 2000, amplitude: 0.2 },
    reverb: { roomSize: 0.9, damping: 0.2, wetDry: 0.7 },
    drums: { tone: 0.3, decay: 0.7, amplitude: 0.2 },
  },
  melancholic: {
    synth: { cutoff: 800, amplitude: 0.2 },
    reverb: { roomSize: 0.8, damping: 0.4, wetDry: 0.6 },
    drums: { tone: 0.3, decay: 0.6, amplitude: 0.25 },
  },
  energetic: {
    synth: { cutoff: 3500, amplitude: 0.4 },
    reverb: { roomSize: 0.3, damping: 0.5, wetDry: 0.2 },
    drums: { tone: 0.6, decay: 0.3, amplitude: 0.6 },
  },
};
