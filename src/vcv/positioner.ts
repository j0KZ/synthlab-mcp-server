/**
 * VCV Rack module positioner.
 *
 * Arranges modules left-to-right by HP width, sets adjacency chain.
 */

import type { VcvModuleDef, VcvModuleJson } from "./types.js";

/**
 * Assign positions and adjacency to modules.
 *
 * @param modules - Array of (moduleDef, moduleJson) pairs
 * @returns Updated moduleJson entries with pos and adjacency set
 */
export function positionModules(
  modules: Array<{ def: VcvModuleDef; json: VcvModuleJson }>,
): void {
  let x = 0;

  for (let i = 0; i < modules.length; i++) {
    const { def, json } = modules[i];

    json.pos = [x, 0];
    json.leftModuleId = i > 0 ? modules[i - 1].json.id : null;
    json.rightModuleId = i < modules.length - 1 ? modules[i + 1].json.id : null;

    x += def.hp;
  }
}
