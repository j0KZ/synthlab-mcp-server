/**
 * Zod schemas for create_from_template tool parameters.
 */

import { z } from "zod";

export const createFromTemplateSchema = {
  template: z
    .string()
    .describe(
      'Template name: "synth", "sequencer", "reverb", "mixer", "drum-machine", "clock", "chaos", "maths", "turing-machine", "granular", or "bridge".',
    ),
  params: z
    .record(z.unknown())
    .optional()
    .describe(
      "Template-specific parameters as a JSON object. " +
        "Synth: { waveform: sine|saw|square|noise, filter: lowpass|highpass|bandpass|moog|korg, " +
        "frequency: Hz, cutoff: Hz, amplitude: 0-1, envelope: adsr|ar|decay|none }. " +
        "Sequencer: { steps: 1-64, bpm, notes: [MIDI 0-127], midiChannel: 1-16, velocity: 0-127 }. " +
        "Reverb: { variant: schroeder|simple, roomSize: 0-1, damping: 0-1, wetDry: 0-1 }. " +
        "Mixer: { channels: 1-16, stereo: bool }. " +
        "Drum-machine: { voices: [bd,sn,hh,cp], tune: 0-1, decay: 0-1, tone: 0-1, amplitude: 0-1 }. " +
        "Clock: { bpm, divisions: [1,2,4,8] }. " +
        "Chaos: { outputs: 1-3, speed: 0-1, r: 3.5-4.0 }. " +
        "Maths: { channels: 1-2, rise: ms, fall: ms, cycle: bool, outputRange: unipolar|bipolar }. " +
        "Turing-machine: { length: 2-16, probability: 0-1, bpm, range: 1-127, offset: 0-127 }. " +
        "Granular: { grains: 1-4, grainSize: 10-500, pitch: 0.25-4.0, position: 0-1, freeze: bool, wetDry: 0-1 }. " +
        "Bridge: { protocol: osc|fudi, port: 1-65535, routes: [string] }.",
    ),
  outputPath: z
    .string()
    .optional()
    .describe(
      "Optional ABSOLUTE file path to write the .pd file. " +
        "Only use if the user explicitly requests saving to a specific path. " +
        "The .pd content is always returned in the response regardless.",
    ),
};
