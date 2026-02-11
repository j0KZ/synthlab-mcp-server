/**
 * Zod schemas for validate_patch and analyze_patch tool inputs.
 */

import { z } from "zod";

/** Schema for validate_patch tool. */
export const ValidatePatchInput = z.object({
  source: z
    .string()
    .min(1)
    .describe(
      "Absolute file path to a .pd file, or raw .pd text content. " +
        "If it starts with '#N canvas' it is treated as raw text."
    ),
});
export type ValidatePatchInput = z.infer<typeof ValidatePatchInput>;

/** Schema for analyze_patch tool. */
export const AnalyzePatchInput = z.object({
  source: z
    .string()
    .min(1)
    .describe(
      "Absolute file path to a .pd file, or raw .pd text content. " +
        "If it starts with '#N canvas' it is treated as raw text."
    ),
});
export type AnalyzePatchInput = z.infer<typeof AnalyzePatchInput>;
