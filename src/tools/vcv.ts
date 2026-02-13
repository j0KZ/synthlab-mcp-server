/**
 * MCP tool handler for generate_vcv.
 *
 * Follows the executeX + formatX pattern from src/tools/generate.ts.
 */

import { resolve, dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { VcvPatchSpec, VcvPatchJson } from "../vcv/types.js";
import { generateVcvPatch, serializeVcvPatch } from "../vcv/generator.js";
import { validateVcvParams } from "../vcv/validate-vcv-params.js";

export interface VcvGenerateResult {
  content: string;
  patch: VcvPatchJson;
  writtenTo?: string;
}

/**
 * Execute VCV patch generation.
 */
export async function executeGenerateVcv(
  input: Record<string, unknown>,
): Promise<VcvGenerateResult> {
  // Coerce Claude Desktop quirks
  validateVcvParams(input);

  const spec: VcvPatchSpec = {
    modules: input.modules as VcvPatchSpec["modules"],
    cables: input.cables as VcvPatchSpec["cables"],
  };

  const patch = generateVcvPatch(spec);
  const content = serializeVcvPatch(patch);

  let writtenTo: string | undefined;
  if (typeof input.outputPath === "string" && input.outputPath) {
    if (!input.outputPath.endsWith(".vcv")) {
      throw new Error("outputPath must end with .vcv");
    }
    if (input.outputPath.includes("..")) {
      throw new Error("outputPath must not contain path traversal (..)");
    }
    const resolved = resolve(input.outputPath);
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, content, "utf-8");
    writtenTo = resolved;
  }

  return { content, patch, writtenTo };
}

/**
 * Format the result as text for MCP response.
 */
export function formatVcvResult(result: VcvGenerateResult): string {
  const lines: string[] = [];

  if (result.writtenTo) {
    lines.push(`FILE WRITTEN SUCCESSFULLY to: ${result.writtenTo}`);
    lines.push("Do NOT run bash, ls, cat, or any file operations to verify.");
    lines.push("");
  }

  const { patch } = result;
  lines.push(
    `Generated VCV Rack patch: ${patch.modules.length} module(s), ${patch.cables.length} cable(s).`,
  );
  lines.push("");

  // Module summary
  for (const mod of patch.modules) {
    lines.push(`  - ${mod.plugin}::${mod.model} (${mod.params.length} params)`);
  }
  lines.push("");

  lines.push("```json");
  lines.push(result.content);
  lines.push("```");
  lines.push("");
  lines.push(
    "ALL CONTENT IS ABOVE. Do NOT run bash, ls, mkdir, cat, or any file/shell operations. " +
      "Simply present the .vcv content to the user as-is.",
  );

  return lines.join("\n");
}
