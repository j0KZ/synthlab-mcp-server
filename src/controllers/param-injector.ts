/**
 * Parameter receiver injection for rack patches.
 *
 * Adds [receive busName] → target node connections to the combined
 * _rack.pd patch, enabling external control of module parameters
 * via send/receive buses.
 */

import type { PatchNodeSpec, PatchConnectionSpec } from "../core/serializer.js";
import type { ParameterDescriptor } from "../templates/port-info.js";
import type { ControllerMapping } from "./types.js";

/** Module info with parameter metadata and position in combined patch. */
export interface InjectableModule {
  id: string;
  parameters: ParameterDescriptor[];
  nodeOffset: number;
}

/**
 * Inject [receive] nodes for each controller mapping into the combined patch.
 *
 * Mutates allNodes and allConnections in place.
 * Called AFTER applyWiring() in buildCombinedPatch().
 */
export function injectParameterReceivers(
  allNodes: PatchNodeSpec[],
  allConnections: PatchConnectionSpec[],
  modules: InjectableModule[],
  mappings: ControllerMapping[],
): void {
  if (!mappings || mappings.length === 0) return;

  const moduleMap = new Map(modules.map((m) => [m.id, m]));

  for (const mapping of mappings) {
    const mod = moduleMap.get(mapping.moduleId);
    if (!mod) continue;

    const absoluteTarget = mapping.parameter.nodeIndex + mod.nodeOffset;

    // Add receive node
    const receiveIdx = allNodes.length;
    allNodes.push({
      name: "receive",
      args: [mapping.busName],
      x: 50,
      y: 10,
    });

    // Connect receive → target node at the parameter's inlet
    allConnections.push({
      from: receiveIdx,
      outlet: 0,
      to: absoluteTarget,
      inlet: mapping.parameter.inlet,
    });
  }
}
