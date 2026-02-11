/**
 * Shared source resolution utility.
 *
 * Detects whether a source string is raw .pd text or a file path,
 * and returns the resolved text content.
 */

import fs from "node:fs/promises";
import path from "node:path";

export interface ResolvedSource {
  pdText: string;
  filePath?: string;
}

/**
 * Resolve a source string to .pd text content.
 *
 * If the source starts with "#N canvas" or "#N", it's treated as raw text.
 * Otherwise, it's treated as a file path and read from disk.
 */
export async function resolveSource(source: string): Promise<ResolvedSource> {
  const trimmed = source.trimStart();
  if (trimmed.startsWith("#N canvas") || trimmed.startsWith("#N")) {
    return { pdText: source };
  }

  const filePath = path.resolve(source);
  const pdText = await fs.readFile(filePath, "utf-8");
  return { pdText, filePath };
}
