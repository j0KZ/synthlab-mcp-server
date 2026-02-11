/**
 * validate_patch MCP tool.
 *
 * Validates a .pd file for structural issues: broken connections,
 * orphan objects, unknown objects, missing DSP sinks.
 */

import path from "node:path";
import { parsePatch } from "../core/parser.js";
import { validatePatch } from "../core/validator.js";
import { resolveSource } from "../utils/resolve-source.js";
import type { ValidationResult, ValidationIssue } from "../core/validator.js";

/**
 * Execute the validate_patch tool.
 * @param source - file path or raw .pd text
 * @returns Formatted validation report
 */
export async function executeValidatePatch(source: string): Promise<string> {
  const { pdText, filePath } = await resolveSource(source);
  const patch = parsePatch(pdText);
  const result = validatePatch(patch);
  return formatValidationResult(result, filePath);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const SEVERITY_ICON: Record<string, string> = {
  error: "[ERROR]",
  warning: "[WARN]",
  info: "[INFO]",
};

function formatValidationResult(
  result: ValidationResult,
  filePath?: string,
): string {
  const lines: string[] = [];

  if (filePath) {
    lines.push(`# Validation: ${path.basename(filePath)}`);
    lines.push(`Path: ${filePath}`);
    lines.push("");
  } else {
    lines.push("# Validation Report");
    lines.push("");
  }

  if (result.valid) {
    lines.push("**Result: VALID** — No errors found.");
  } else {
    lines.push(`**Result: INVALID** — ${result.summary.errors} error(s) found.`);
  }

  lines.push(
    `Summary: ${result.summary.errors} errors, ${result.summary.warnings} warnings, ${result.summary.infos} info`,
  );
  lines.push("");

  if (result.issues.length === 0) {
    lines.push("No issues detected.");
    return lines.join("\n");
  }

  // Group by severity
  for (const severity of ["error", "warning", "info"] as const) {
    const group = result.issues.filter((i) => i.severity === severity);
    if (group.length === 0) continue;

    lines.push(`## ${severity.charAt(0).toUpperCase() + severity.slice(1)}s (${group.length})`);
    for (const issue of group) {
      const icon = SEVERITY_ICON[issue.severity];
      const nodeStr = issue.nodeId !== undefined ? ` (node ${issue.nodeId})` : "";
      lines.push(`  ${icon} [${issue.code}] ${issue.message}${nodeStr}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
