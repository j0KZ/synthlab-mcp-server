/**
 * Zod schemas for generate_vcv tool parameters.
 */

import { z } from "zod";

export const generateVcvSchema = {
  modules: z
    .array(
      z.object({
        plugin: z
          .string()
          .describe(
            "Plugin name (e.g. 'Fundamental', 'Core'). Aliases: 'vcv'→Fundamental, 'mi'/'mutable'→AudibleInstruments.",
          ),
        model: z
          .string()
          .describe(
            "Module model/slug (e.g. 'VCO', 'VCF', 'AudioInterface2', 'MIDIToCVInterface').",
          ),
        params: z
          .record(z.number())
          .optional()
          .describe(
            "Param name → value overrides. Use label names (e.g. 'Frequency': 2.0) or enum names (e.g. 'FREQ_PARAM': 2.0).",
          ),
      }),
    )
    .min(1)
    .describe("Modules to include in the VCV Rack patch."),
  cables: z
    .array(
      z.object({
        from: z.object({
          module: z
            .number()
            .int()
            .min(0)
            .describe("Source module index (0-based, matching modules array)."),
          port: z
            .string()
            .describe(
              "Output port name (label like 'Saw' or enum like 'SAW_OUTPUT').",
            ),
        }),
        to: z.object({
          module: z
            .number()
            .int()
            .min(0)
            .describe("Destination module index (0-based)."),
          port: z
            .string()
            .describe(
              "Input port name (label like 'Audio 1' or enum like 'AUDIO_INPUT_1').",
            ),
        }),
        color: z
          .string()
          .optional()
          .describe("Cable color as hex (e.g. '#c91847'). Auto-cycled if omitted."),
      }),
    )
    .optional()
    .describe("Cable connections between modules."),
  outputPath: z
    .string()
    .optional()
    .describe(
      "Optional ABSOLUTE file path to write the .vcv file. " +
        "Only use if the user explicitly requests saving to a specific path. " +
        "The .vcv content is always returned in the response regardless.",
    ),
};
