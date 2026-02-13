/**
 * Runtime parameter validation for generate_vcv tool.
 * Handles Claude Desktop quirks (empty arrays, booleans for non-boolean params).
 */

/**
 * Coerce and validate the raw input from Claude Desktop.
 * Mutates in place.
 */
export function validateVcvParams(input: Record<string, unknown>): void {
  // Coerce empty modules array (Claude Desktop bug: passes [] for required arrays)
  if (Array.isArray(input.modules) && input.modules.length === 0) {
    throw new Error("modules array must contain at least one module spec.");
  }

  // Coerce empty cables array to undefined
  if (Array.isArray(input.cables) && input.cables.length === 0) {
    input.cables = undefined;
  }

  // Coerce modules param overrides
  if (Array.isArray(input.modules)) {
    for (const mod of input.modules as Array<Record<string, unknown>>) {
      // Coerce boolean plugin/model (shouldn't happen but defensive)
      if (typeof mod.plugin === "boolean") mod.plugin = "Fundamental";
      if (typeof mod.model === "boolean") mod.model = "VCO";

      // Coerce empty params to undefined
      if (mod.params && typeof mod.params === "object" && Object.keys(mod.params as object).length === 0) {
        mod.params = undefined;
      }
    }
  }
}
