/**
 * Patch validator — detects broken connections, orphan objects,
 * unknown objects, and other structural issues.
 */

import type { PdPatch, PdCanvas, PdNode, PdConnection } from "../types.js";
import {
  resolvePortCounts,
  resolveSubpatchPorts,
  lookupObject,
  isAudioObject,
} from "./object-registry.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  /** Canvas id where the issue was found. */
  canvasId: number;
  /** Node id if the issue relates to a specific node. */
  nodeId?: number;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  summary: { errors: number; warnings: number; infos: number };
}

// ---------------------------------------------------------------------------
// Orphan exception list — objects that legitimately have zero connections
// ---------------------------------------------------------------------------

const ORPHAN_EXCEPTIONS = new Set([
  // wireless
  "send", "s", "receive", "r", "send~", "receive~", "throw~", "catch~",
  // data objects accessed by name
  "table", "array", "value", "v",
  // fire-and-forget
  "loadbang", "print",
  // GUI objects (use internal send/receive symbols)
  "bng", "tgl", "nbx", "vsl", "hsl", "vradio", "hradio", "vu", "cnv",
]);

// ---------------------------------------------------------------------------
// Main validation function
// ---------------------------------------------------------------------------

/**
 * Validate a parsed patch, returning all detected issues.
 */
export function validatePatch(patch: PdPatch): ValidationResult {
  const issues: ValidationIssue[] = [];
  validateCanvas(patch.root, issues, patch);

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const infos = issues.filter((i) => i.severity === "info").length;

  return {
    valid: errors === 0,
    issues,
    summary: { errors, warnings, infos },
  };
}

// ---------------------------------------------------------------------------
// Canvas-level validation (recursive)
// ---------------------------------------------------------------------------

function validateCanvas(
  canvas: PdCanvas,
  issues: ValidationIssue[],
  patch: PdPatch,
): void {
  checkConnections(canvas, issues, patch);
  checkDuplicateConnections(canvas, issues);
  checkUnknownObjects(canvas, issues);
  checkOrphanObjects(canvas, issues);
  checkDspSink(canvas, issues);

  // Recurse into subpatches
  for (const sub of canvas.subpatches) {
    if (sub.nodes.length === 0) {
      issues.push({
        severity: "warning",
        code: "EMPTY_SUBPATCH",
        message: `Subpatch "${sub.name ?? "(unnamed)"}" is empty`,
        canvasId: sub.id,
      });
    }
    validateCanvas(sub, issues, patch);
  }
}

// ---------------------------------------------------------------------------
// Check 1-4: Connection validity (source, target, outlet/inlet bounds)
// ---------------------------------------------------------------------------

function checkConnections(
  canvas: PdCanvas,
  issues: ValidationIssue[],
  patch: PdPatch,
): void {
  for (const conn of canvas.connections) {
    // Check 1: Source node exists
    if (conn.fromNode >= canvas.nodes.length) {
      issues.push({
        severity: "error",
        code: "BROKEN_CONNECTION_SOURCE",
        message: `Connection from node ${conn.fromNode} — node does not exist (canvas has ${canvas.nodes.length} nodes)`,
        canvasId: canvas.id,
      });
      continue;
    }

    // Check 2: Target node exists
    if (conn.toNode >= canvas.nodes.length) {
      issues.push({
        severity: "error",
        code: "BROKEN_CONNECTION_TARGET",
        message: `Connection to node ${conn.toNode} — node does not exist (canvas has ${canvas.nodes.length} nodes)`,
        canvasId: canvas.id,
      });
      continue;
    }

    const fromNode = canvas.nodes[conn.fromNode];
    const toNode = canvas.nodes[conn.toNode];

    // Resolve port counts — handle subpatch (pd) nodes specially
    const fromPorts = resolveNodePorts(fromNode, canvas, patch);
    const toPorts = resolveNodePorts(toNode, canvas, patch);

    // Check 3: Outlet in bounds
    if (fromPorts && conn.fromOutlet >= fromPorts.outlets) {
      issues.push({
        severity: "error",
        code: "OUTLET_OUT_OF_BOUNDS",
        message: `${nodeDesc(fromNode)} outlet ${conn.fromOutlet} out of bounds (has ${fromPorts.outlets} outlets)`,
        canvasId: canvas.id,
        nodeId: fromNode.id,
      });
    }

    // Check 4: Inlet in bounds
    if (toPorts && conn.toInlet >= toPorts.inlets) {
      issues.push({
        severity: "error",
        code: "INLET_OUT_OF_BOUNDS",
        message: `${nodeDesc(toNode)} inlet ${conn.toInlet} out of bounds (has ${toPorts.inlets} inlets)`,
        canvasId: canvas.id,
        nodeId: toNode.id,
      });
    }
  }
}

/**
 * Resolve port counts for a node, handling `pd` subpatch nodes
 * by counting their internal inlet/outlet objects.
 */
function resolveNodePorts(
  node: PdNode,
  canvas: PdCanvas,
  patch: PdPatch,
): { inlets: number; outlets: number } | null {
  // For subpatch nodes (name starts with "pd"), find the matching subpatch canvas
  if (node.type === "obj" && node.name === "pd") {
    const subName = node.args[0] as string | undefined;
    const sub = canvas.subpatches.find((s) => s.name === subName);
    if (sub) return resolveSubpatchPorts(sub);
    return null;
  }

  return resolvePortCounts(node);
}

// ---------------------------------------------------------------------------
// Check 5: Duplicate connections
// ---------------------------------------------------------------------------

function checkDuplicateConnections(
  canvas: PdCanvas,
  issues: ValidationIssue[],
): void {
  const seen = new Set<string>();
  for (const conn of canvas.connections) {
    const key = `${conn.fromNode}:${conn.fromOutlet}:${conn.toNode}:${conn.toInlet}`;
    if (seen.has(key)) {
      issues.push({
        severity: "warning",
        code: "DUPLICATE_CONNECTION",
        message: `Duplicate connection: node ${conn.fromNode}[${conn.fromOutlet}] → node ${conn.toNode}[${conn.toInlet}]`,
        canvasId: canvas.id,
      });
    }
    seen.add(key);
  }
}

// ---------------------------------------------------------------------------
// Check 6: Unknown objects
// ---------------------------------------------------------------------------

function checkUnknownObjects(
  canvas: PdCanvas,
  issues: ValidationIssue[],
): void {
  for (const node of canvas.nodes) {
    if (node.type !== "obj") continue;
    if (!node.name) continue;

    // Skip subpatch nodes — they're valid by definition
    if (node.name === "pd") continue;

    // Check registry
    if (!lookupObject(node.name)) {
      issues.push({
        severity: "warning",
        code: "UNKNOWN_OBJECT",
        message: `Unknown object: "${node.name}" (not in Pd-vanilla registry)`,
        canvasId: canvas.id,
        nodeId: node.id,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Check 7: Orphan objects (no connections at all)
// ---------------------------------------------------------------------------

function checkOrphanObjects(
  canvas: PdCanvas,
  issues: ValidationIssue[],
): void {
  // Build set of node ids that participate in at least one connection
  const connected = new Set<number>();
  for (const conn of canvas.connections) {
    connected.add(conn.fromNode);
    connected.add(conn.toNode);
  }

  for (const node of canvas.nodes) {
    if (connected.has(node.id)) continue;

    // Comments are never orphans
    if (node.type === "text") continue;

    // Exception list (wireless, data-by-name, GUI, etc.)
    if (node.type === "obj" && node.name && ORPHAN_EXCEPTIONS.has(node.name)) {
      continue;
    }

    // Subpatch nodes — not an orphan concern
    if (node.type === "obj" && node.name === "pd") continue;

    issues.push({
      severity: "warning",
      code: "ORPHAN_OBJECT",
      message: `${nodeDesc(node)} has no connections`,
      canvasId: canvas.id,
      nodeId: node.id,
    });
  }
}

// ---------------------------------------------------------------------------
// Check 9: No DSP sink (audio objects exist but no output)
// ---------------------------------------------------------------------------

const DSP_SINKS = new Set([
  "dac~", "writesf~", "send~", "throw~", "outlet~",
]);

function checkDspSink(canvas: PdCanvas, issues: ValidationIssue[]): void {
  const audioNodes = canvas.nodes.filter(
    (n) => n.type === "obj" && n.name && isAudioObject(n.name),
  );

  if (audioNodes.length === 0) return;

  const hasSink = audioNodes.some(
    (n) => n.name && DSP_SINKS.has(n.name),
  );

  if (!hasSink) {
    issues.push({
      severity: "warning",
      code: "NO_DSP_SINK",
      message: `Canvas has ${audioNodes.length} audio objects but no DSP sink (dac~, writesf~, send~, throw~, outlet~)`,
      canvasId: canvas.id,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nodeDesc(node: PdNode): string {
  if (node.type === "obj") return `[${node.id}] ${node.name ?? "obj"}`;
  if (node.type === "msg") return `[${node.id}] msg`;
  return `[${node.id}] ${node.type}`;
}
