#!/usr/bin/env tsx
/**
 * Update README.md with actual tool count and test count.
 *
 * - Counts `server.tool(` calls in src/index.ts → tool count
 * - Runs `vitest run --reporter=json` → test count
 * - Patches all occurrences in README.md via regex
 *
 * Usage: npm run update-stats
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const README_PATH = resolve(ROOT, "README.md");
const INDEX_PATH = resolve(ROOT, "src/index.ts");

// ---------------------------------------------------------------------------
// 1. Count tools from src/index.ts
// ---------------------------------------------------------------------------

const indexSrc = readFileSync(INDEX_PATH, "utf-8");
const toolMatches = indexSrc.match(/server\.tool\(/g);
const toolCount = toolMatches?.length ?? 0;

// ---------------------------------------------------------------------------
// 2. Count tests from vitest
// ---------------------------------------------------------------------------

let testCount: number;
try {
  const json = execSync("npx vitest run --reporter=json", {
    cwd: ROOT,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const result = JSON.parse(json);
  testCount = result.numPassedTests ?? result.numTotalTests ?? 0;
} catch (err: unknown) {
  // vitest outputs JSON to stdout even on exit code 0/1 — try parsing
  const e = err as { stdout?: string };
  if (e.stdout) {
    try {
      const result = JSON.parse(e.stdout);
      testCount = result.numPassedTests ?? result.numTotalTests ?? 0;
    } catch {
      console.error("Failed to parse vitest JSON output");
      process.exit(1);
    }
  } else {
    console.error("Failed to run vitest:", err);
    process.exit(1);
  }
}

if (toolCount === 0 || testCount === 0) {
  console.error(`Unexpected counts: ${toolCount} tools, ${testCount} tests — aborting`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 3. Patch README.md
// ---------------------------------------------------------------------------

let readme = readFileSync(README_PATH, "utf-8");

// Pattern: "N tools" where N is a number (e.g. "9 tools", "10 tools")
const toolRegex = /\b\d+ tools\b/g;
const testRegex = /\b\d+ tests\b/g;

const toolReplacements = (readme.match(toolRegex) ?? []).length;
const testReplacements = (readme.match(testRegex) ?? []).length;

readme = readme.replace(toolRegex, `${toolCount} tools`);
readme = readme.replace(testRegex, `${testCount} tests`);

writeFileSync(README_PATH, readme, "utf-8");

console.log(`Updated README.md: ${toolCount} tools (${toolReplacements} replacements), ${testCount} tests (${testReplacements} replacements)`);
