/**
 * analyze_patch MCP tool.
 *
 * Provides deep analysis: object counts, signal flow graph,
 * DSP chain detection, complexity scoring, and validation.
 */

import path from "node:path";
import { parsePatch } from "../core/parser.js";
import { validatePatch } from "../core/validator.js";
import { resolveSource } from "../utils/resolve-source.js";
import {
  lookupObject,
  isAudioObject,
  getObjectCategory,
} from "../core/object-registry.js";
import type { PdPatch, PdCanvas, PdNode, PdConnection } from "../types.js";
import type { ValidationResult } from "../core/validator.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  filePath?: string;
  objectCounts: Record<string, number>;
  totalObjects: number;
  totalConnections: number;
  signalFlow: SignalFlowGraph;
  dspChains: DspChain[];
  complexity: ComplexityScore;
  validation: ValidationResult;
  subpatchDepth: number;
}

export interface SignalFlowGraph {
  /** Adjacency list: nodeIndex → array of { target, edgeType } */
  edges: Map<number, { target: number; type: "audio" | "control" }[]>;
  /** Topological order (empty if cycles exist). */
  topologicalOrder: number[];
  /** Whether cycles were detected. */
  hasCycles: boolean;
}

export interface DspChain {
  /** Node indices forming the chain from source to sink. */
  path: number[];
  /** Node names along the path. */
  names: string[];
}

export interface ComplexityScore {
  score: number;
  label: string;
  factors: {
    objectFactor: number;
    densityFactor: number;
    depthFactor: number;
    audioFactor: number;
    uniqueFactor: number;
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Execute the analyze_patch tool.
 */
export async function executeAnalyzePatch(source: string): Promise<string> {
  const { pdText, filePath } = await resolveSource(source);
  const patch = parsePatch(pdText);
  const result = analyzePatch(patch, filePath);
  return formatAnalysis(result);
}

/**
 * Analyze a parsed patch.
 */
export function analyzePatch(patch: PdPatch, filePath?: string): AnalysisResult {
  const objectCounts = countObjectsByCategory(patch.root);
  const totalObjects = countNodes(patch.root);
  const totalConnections = countConnections(patch.root);
  const signalFlow = buildSignalFlowGraph(patch.root);
  const dspChains = detectDspChains(patch.root);
  const subpatchDepth = getMaxDepth(patch.root, 0);
  const uniqueTypes = countUniqueTypes(patch.root);
  const complexity = computeComplexity(
    totalObjects,
    totalConnections,
    subpatchDepth,
    dspChains,
    uniqueTypes,
  );
  const validation = validatePatch(patch);

  return {
    filePath,
    objectCounts,
    totalObjects,
    totalConnections,
    signalFlow,
    dspChains,
    complexity,
    validation,
    subpatchDepth,
  };
}

// ---------------------------------------------------------------------------
// Object counting
// ---------------------------------------------------------------------------

function countObjectsByCategory(canvas: PdCanvas): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const node of canvas.nodes) {
    if (node.type === "obj" && node.name) {
      const cat = getObjectCategory(node.name) ?? "unknown";
      counts[cat] = (counts[cat] ?? 0) + 1;
    } else if (node.type === "msg") {
      counts["message"] = (counts["message"] ?? 0) + 1;
    } else if (node.type === "text") {
      counts["comment"] = (counts["comment"] ?? 0) + 1;
    } else if (node.type === "floatatom" || node.type === "symbolatom") {
      counts["atom"] = (counts["atom"] ?? 0) + 1;
    }
  }

  // Recurse into subpatches
  for (const sub of canvas.subpatches) {
    const subCounts = countObjectsByCategory(sub);
    for (const [cat, count] of Object.entries(subCounts)) {
      counts[cat] = (counts[cat] ?? 0) + count;
    }
  }

  return counts;
}

function countNodes(canvas: PdCanvas): number {
  let count = canvas.nodes.length;
  for (const sub of canvas.subpatches) {
    count += countNodes(sub);
  }
  return count;
}

function countConnections(canvas: PdCanvas): number {
  let count = canvas.connections.length;
  for (const sub of canvas.subpatches) {
    count += countConnections(sub);
  }
  return count;
}

function countUniqueTypes(canvas: PdCanvas): number {
  const types = new Set<string>();
  collectTypes(canvas, types);
  return types.size;
}

function collectTypes(canvas: PdCanvas, types: Set<string>): void {
  for (const node of canvas.nodes) {
    if (node.type === "obj" && node.name) {
      types.add(node.name);
    } else {
      types.add(node.type);
    }
  }
  for (const sub of canvas.subpatches) {
    collectTypes(sub, types);
  }
}

function getMaxDepth(canvas: PdCanvas, current: number): number {
  let max = current;
  for (const sub of canvas.subpatches) {
    max = Math.max(max, getMaxDepth(sub, current + 1));
  }
  return max;
}

// ---------------------------------------------------------------------------
// Signal flow graph (single canvas)
// ---------------------------------------------------------------------------

function buildSignalFlowGraph(canvas: PdCanvas): SignalFlowGraph {
  const edges = new Map<number, { target: number; type: "audio" | "control" }[]>();

  // Initialize adjacency list
  for (const node of canvas.nodes) {
    edges.set(node.id, []);
  }

  // Build edges from connections
  for (const conn of canvas.connections) {
    if (conn.fromNode >= canvas.nodes.length || conn.toNode >= canvas.nodes.length) {
      continue; // skip broken connections
    }
    const fromNode = canvas.nodes[conn.fromNode];
    const toNode = canvas.nodes[conn.toNode];
    const edgeType = isAudioEdge(fromNode, toNode) ? "audio" : "control";

    const nodeEdges = edges.get(conn.fromNode);
    if (nodeEdges) {
      nodeEdges.push({ target: conn.toNode, type: edgeType });
    }
  }

  // Topological sort with Kahn's algorithm
  const { order, hasCycles } = kahnSort(canvas.nodes.length, edges);

  return {
    edges,
    topologicalOrder: order,
    hasCycles,
  };
}

function isAudioEdge(from: PdNode, to: PdNode): boolean {
  const fromAudio =
    from.type === "obj" && from.name ? isAudioObject(from.name) : false;
  const toAudio =
    to.type === "obj" && to.name ? isAudioObject(to.name) : false;
  return fromAudio && toAudio;
}

function kahnSort(
  nodeCount: number,
  edges: Map<number, { target: number; type: "audio" | "control" }[]>,
): { order: number[]; hasCycles: boolean } {
  const inDegree = new Array(nodeCount).fill(0);

  for (const [, targets] of edges) {
    for (const { target } of targets) {
      if (target < nodeCount) {
        inDegree[target]++;
      }
    }
  }

  const queue: number[] = [];
  for (let i = 0; i < nodeCount; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  const order: number[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);

    const targets = edges.get(node) ?? [];
    for (const { target } of targets) {
      if (target < nodeCount) {
        inDegree[target]--;
        if (inDegree[target] === 0) queue.push(target);
      }
    }
  }

  return {
    order,
    hasCycles: order.length < nodeCount,
  };
}

// ---------------------------------------------------------------------------
// DSP chain detection (single canvas, DFS from audio sources to sinks)
// ---------------------------------------------------------------------------

const AUDIO_SOURCES = new Set([
  "osc~", "phasor~", "noise~", "adc~", "readsf~",
  "receive~", "catch~", "inlet~", "tabosc4~",
]);

const AUDIO_SINKS = new Set([
  "dac~", "writesf~", "send~", "throw~", "outlet~",
]);

function detectDspChains(canvas: PdCanvas): DspChain[] {
  // Build audio-only adjacency list
  const audioAdj = new Map<number, number[]>();
  for (const node of canvas.nodes) {
    audioAdj.set(node.id, []);
  }

  for (const conn of canvas.connections) {
    if (conn.fromNode >= canvas.nodes.length || conn.toNode >= canvas.nodes.length) {
      continue;
    }
    const fromNode = canvas.nodes[conn.fromNode];
    const toNode = canvas.nodes[conn.toNode];
    if (isAudioEdge(fromNode, toNode)) {
      audioAdj.get(conn.fromNode)?.push(conn.toNode);
    }
  }

  // Find sources
  const sources = canvas.nodes.filter(
    (n) => n.type === "obj" && n.name && AUDIO_SOURCES.has(n.name),
  );

  const chains: DspChain[] = [];

  // DFS from each source
  for (const source of sources) {
    const visited = new Set<number>();
    const stack: { nodeId: number; path: number[] }[] = [
      { nodeId: source.id, path: [source.id] },
    ];

    while (stack.length > 0) {
      const { nodeId, path: currentPath } = stack.pop()!;

      const node = canvas.nodes[nodeId];
      if (node && node.type === "obj" && node.name && AUDIO_SINKS.has(node.name)) {
        chains.push({
          path: [...currentPath],
          names: currentPath.map((id) => canvas.nodes[id]?.name ?? "?"),
        });
        continue; // don't extend past sinks
      }

      const neighbors = audioAdj.get(nodeId) ?? [];
      for (const next of neighbors) {
        if (!currentPath.includes(next)) {
          // Avoid cycles in individual path
          stack.push({ nodeId: next, path: [...currentPath, next] });
        }
      }
    }
  }

  return chains;
}

// ---------------------------------------------------------------------------
// Complexity score
// ---------------------------------------------------------------------------

function computeComplexity(
  totalObjects: number,
  totalConnections: number,
  subpatchDepth: number,
  dspChains: DspChain[],
  uniqueTypes: number,
): ComplexityScore {
  const objectFactor = Math.min(30, totalObjects / 3.3);

  const ratio = totalObjects > 0 ? totalConnections / totalObjects : 0;
  const densityFactor = Math.min(20, ratio * 6.7);

  const depthFactor = Math.min(15, subpatchDepth * 5);

  const avgLength =
    dspChains.length > 0
      ? dspChains.reduce((sum, c) => sum + c.path.length, 0) / dspChains.length
      : 0;
  const audioFactor = Math.min(20, dspChains.length * avgLength * 2);

  const uniqueFactor = Math.min(15, uniqueTypes * 0.75);

  const score = Math.round(
    objectFactor + densityFactor + depthFactor + audioFactor + uniqueFactor,
  );

  let label: string;
  if (score <= 15) label = "trivial";
  else if (score <= 35) label = "simple";
  else if (score <= 60) label = "moderate";
  else if (score <= 80) label = "complex";
  else label = "very complex";

  return {
    score,
    label,
    factors: {
      objectFactor: Math.round(objectFactor * 10) / 10,
      densityFactor: Math.round(densityFactor * 10) / 10,
      depthFactor: Math.round(depthFactor * 10) / 10,
      audioFactor: Math.round(audioFactor * 10) / 10,
      uniqueFactor: Math.round(uniqueFactor * 10) / 10,
    },
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatAnalysis(result: AnalysisResult): string {
  const lines: string[] = [];

  if (result.filePath) {
    lines.push(`# Analysis: ${path.basename(result.filePath)}`);
    lines.push(`Path: ${result.filePath}`);
  } else {
    lines.push("# Patch Analysis");
  }
  lines.push("");

  // Overview
  lines.push("## Overview");
  lines.push(`- **Total objects**: ${result.totalObjects}`);
  lines.push(`- **Total connections**: ${result.totalConnections}`);
  lines.push(`- **Subpatch depth**: ${result.subpatchDepth}`);
  lines.push(
    `- **Complexity**: ${result.complexity.score}/100 (${result.complexity.label})`,
  );
  lines.push("");

  // Object counts by category
  lines.push("## Objects by Category");
  const sorted = Object.entries(result.objectCounts).sort(
    ([, a], [, b]) => b - a,
  );
  for (const [cat, count] of sorted) {
    lines.push(`- **${cat}**: ${count}`);
  }
  lines.push("");

  // Signal flow
  lines.push("## Signal Flow");
  if (result.signalFlow.hasCycles) {
    lines.push("- Cycles detected (feedback loops — normal in Pd)");
  } else {
    lines.push(
      `- Topological order: ${result.signalFlow.topologicalOrder.join(" → ")}`,
    );
  }
  lines.push("");

  // DSP chains
  lines.push(`## DSP Chains (${result.dspChains.length})`);
  if (result.dspChains.length === 0) {
    lines.push("No audio chains detected.");
  } else {
    for (let i = 0; i < result.dspChains.length; i++) {
      lines.push(`  ${i + 1}. ${result.dspChains[i].names.join(" → ")}`);
    }
  }
  lines.push("");

  // Complexity breakdown
  lines.push("## Complexity Breakdown");
  const f = result.complexity.factors;
  lines.push(`- Objects: ${f.objectFactor}/30`);
  lines.push(`- Density: ${f.densityFactor}/20`);
  lines.push(`- Depth: ${f.depthFactor}/15`);
  lines.push(`- Audio: ${f.audioFactor}/20`);
  lines.push(`- Variety: ${f.uniqueFactor}/15`);
  lines.push("");

  // Validation summary
  lines.push("## Validation");
  const v = result.validation;
  if (v.valid) {
    lines.push(`**VALID** — ${v.summary.warnings} warning(s)`);
  } else {
    lines.push(
      `**INVALID** — ${v.summary.errors} error(s), ${v.summary.warnings} warning(s)`,
    );
  }
  if (v.issues.length > 0) {
    for (const issue of v.issues) {
      const icon =
        issue.severity === "error"
          ? "[ERROR]"
          : issue.severity === "warning"
            ? "[WARN]"
            : "[INFO]";
      lines.push(`  ${icon} ${issue.message}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}
