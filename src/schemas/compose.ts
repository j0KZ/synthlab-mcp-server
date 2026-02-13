/**
 * Zod schema for compose_patch tool parameters.
 */

import { z } from "zod";

export const composePatchSchema = {
  genre: z
    .string()
    .describe(
      'Musical genre: "ambient", "techno", "house", "dnb", "experimental", "idm", "minimal", "drone", "noise".',
    ),
  tempo: z
    .number()
    .int()
    .min(20)
    .max(300)
    .optional()
    .describe("BPM (20-300). Defaults to genre preset. Clamped to genre range."),
  mood: z
    .string()
    .optional()
    .describe(
      'Mood modifier: "dark", "bright", "aggressive", "chill", "ethereal", "melancholic", "energetic". Defaults to genre preset.',
    ),
  key: z
    .object({
      root: z
        .string()
        .describe('Root note: "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B".'),
      scale: z
        .string()
        .describe(
          'Scale type: "major", "minor", "dorian", "phrygian", "mixolydian", "pentatonic-major", "pentatonic-minor", "chromatic", "whole-tone", "blues".',
        ),
    })
    .optional()
    .describe("Musical key. Defaults to genre preset."),
  instruments: z
    .array(
      z.object({
        role: z
          .string()
          .describe(
            'Instrument role: "lead", "bass", "pad", "drums", "arpeggio", "sequence", "texture", "modulator".',
          ),
        id: z
          .string()
          .optional()
          .describe("Custom module ID. Auto-generated from role if omitted."),
        template: z
          .string()
          .optional()
          .describe("Override role-based template selection with a specific template name."),
        params: z
          .record(z.unknown())
          .optional()
          .describe("Template parameter overrides (merged on top of genre/mood defaults)."),
      }),
    )
    .optional()
    .describe("Instrument specifications. Defaults to genre preset instruments."),
  effects: z
    .array(z.string())
    .optional()
    .describe('Effect chain: ["reverb"], ["granular"], or ["reverb", "granular"]. Defaults to genre preset.'),
  controller: z
    .object({
      device: z
        .string()
        .describe('Controller device: "k2" (Xone:K2), "microfreak"/"mf", "tr-8s"/"tr8s".'),
      midiChannel: z
        .number()
        .int()
        .min(1)
        .max(16)
        .optional()
        .describe("MIDI channel (1-16). Default: device default."),
      mappings: z
        .array(
          z.object({
            control: z.string().describe("Control name on device."),
            module: z.string().describe("Module ID in the rack."),
            parameter: z.string().describe("Parameter name on the module."),
          }),
        )
        .optional()
        .describe("Custom control-to-parameter mappings. Auto-mapped if omitted."),
    })
    .optional()
    .describe("MIDI controller integration. Generates controller patches."),
  outputDir: z
    .string()
    .optional()
    .describe(
      "Optional ABSOLUTE directory path to write all .pd files. " +
        "Only use if the user explicitly requests saving to a specific path. " +
        "If omitted, content is returned but not written to disk.",
    ),
};
