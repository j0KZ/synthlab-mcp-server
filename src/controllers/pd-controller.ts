/**
 * Controller Pd patch generator.
 *
 * Generates a _controller.pd file with ctlin → scaling → send chains
 * that route K2 MIDI CC to rack parameter buses.
 */

import type { PatchNodeSpec, PatchConnectionSpec, PatchSpec } from "../core/serializer.js";
import type { ControllerMapping } from "./types.js";

const COL_WIDTH = 150;
const SPACING = 30;

/**
 * Build a Pd patch for MIDI controller routing.
 *
 * Each mapping produces a column:
 *   [text label] → [ctlin CC CH] → [/ 127] → scaling → [send busName]
 *
 * For exponential curves, [pow 3] is inserted after normalization.
 */
export function buildControllerPatch(
  mappings: ControllerMapping[],
  midiChannel: number,
): PatchSpec {
  const nodes: PatchNodeSpec[] = [];
  const connections: PatchConnectionSpec[] = [];

  const add = (node: PatchNodeSpec): number => {
    const idx = nodes.length;
    nodes.push(node);
    return idx;
  };
  const wire = (from: number, to: number, outlet = 0, inlet = 0) => {
    connections.push({ from, outlet, to, inlet });
  };

  // Title
  add({
    type: "text",
    args: ["=== K2 CONTROLLER ==="],
    x: 50,
    y: 10,
  });

  for (let i = 0; i < mappings.length; i++) {
    const mapping = mappings[i];
    const x = 50 + i * COL_WIDTH;
    let y = 40;

    const { control, parameter, busName } = mapping;
    const cc = control.cc;
    if (cc === undefined) continue; // Skip non-CC controls

    // Label
    add({
      type: "text",
      args: [`${control.name}`, "->", parameter.label],
      x,
      y,
    });
    y += 20;

    // ctlin CC CHANNEL (outputs value 0-127 on outlet 0)
    const ctlin = add({ name: "ctlin", args: [cc, midiChannel], x, y });
    y += SPACING;

    // Normalize: / 127 → 0.0-1.0
    const normalize = add({ name: "/", args: [127], x, y });
    wire(ctlin, normalize);
    y += SPACING;

    let lastNode = normalize;

    // Exponential curve: pow 3 (before scaling)
    if (parameter.curve === "exponential") {
      const pow = add({ name: "pow", args: [3], x, y });
      wire(lastNode, pow);
      lastNode = pow;
      y += SPACING;
    }

    // Scale: * (max - min)
    const range = parameter.max - parameter.min;
    const scale = add({ name: "*", args: [range], x, y });
    wire(lastNode, scale);
    y += SPACING;

    // Offset: + min
    const offset = add({ name: "+", args: [parameter.min], x, y });
    wire(scale, offset);
    y += SPACING;

    // Send to bus
    const send = add({ name: "send", args: [busName], x, y });
    wire(offset, send);
  }

  return { nodes, connections };
}
