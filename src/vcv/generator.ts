/**
 * VCV Rack .vcv patch generator.
 *
 * Takes a VcvPatchSpec and produces a VcvPatchJson (plain JSON v1 format).
 */

import type {
  VcvPatchSpec,
  VcvPatchJson,
  VcvModuleJson,
  VcvCableJson,
  VcvModuleDef,
} from "./types.js";
import { getVcvModule, resolvePort, resolveParam } from "./registry.js";
import { positionModules } from "./positioner.js";

// VCV Rack default cable colors
const CABLE_COLORS = ["#c91847", "#0c8e15", "#0986ad", "#c9b70e", "#7b3fbd"];

/**
 * Generate a unique 53-bit integer ID (safe for JSON).
 */
function generateId(): number {
  // Use two 32-bit randoms combined into a 53-bit value
  const high = Math.floor(Math.random() * 0x200000); // 21 bits
  const low = Math.floor(Math.random() * 0x100000000); // 32 bits
  return high * 0x100000000 + low;
}

/**
 * Generate a VCV Rack .vcv patch from a spec.
 */
export function generateVcvPatch(spec: VcvPatchSpec): VcvPatchJson {
  const { modules: moduleSpecs, cables: cableSpecs } = spec;

  // Resolve modules from registry
  const resolved: Array<{
    def: VcvModuleDef & { pluginName: string; pluginVersion: string };
    json: VcvModuleJson;
  }> = [];

  for (const ms of moduleSpecs) {
    const mod = getVcvModule(ms.plugin, ms.model);
    const id = generateId();

    // Build params array — use defaults, then apply overrides
    const params: Array<{ id: number; value: number }> = [];
    for (const p of mod.params) {
      if (p.removed) continue;
      let value = p.default ?? 0;

      // Check for param overrides from spec
      if (ms.params) {
        for (const [overrideName, overrideValue] of Object.entries(ms.params)) {
          try {
            const resolved = resolveParam(mod, overrideName);
            if (resolved.id === p.id) {
              value = overrideValue;
              break;
            }
          } catch { /* skip unresolved overrides */ }
        }
      }

      params.push({ id: p.id, value });
    }

    const json: VcvModuleJson = {
      id,
      plugin: mod.pluginName,
      model: mod.name,
      version: mod.pluginVersion,
      params,
      pos: [0, 0], // will be set by positioner
      leftModuleId: null,
      rightModuleId: null,
    };

    resolved.push({ def: mod, json });
  }

  // Position modules
  positionModules(resolved);

  // Resolve cables
  const cables: VcvCableJson[] = [];
  if (cableSpecs) {
    for (let i = 0; i < cableSpecs.length; i++) {
      const cs = cableSpecs[i];

      // Validate module indices
      if (cs.from.module < 0 || cs.from.module >= resolved.length) {
        throw new Error(
          `Cable ${i}: from.module ${cs.from.module} out of range (0-${resolved.length - 1})`,
        );
      }
      if (cs.to.module < 0 || cs.to.module >= resolved.length) {
        throw new Error(
          `Cable ${i}: to.module ${cs.to.module} out of range (0-${resolved.length - 1})`,
        );
      }

      const fromModule = resolved[cs.from.module];
      const toModule = resolved[cs.to.module];

      const outputPort = resolvePort(fromModule.def, cs.from.port, "output");
      const inputPort = resolvePort(toModule.def, cs.to.port, "input");

      cables.push({
        id: generateId(),
        outputModuleId: fromModule.json.id,
        outputId: outputPort.id,
        inputModuleId: toModule.json.id,
        inputId: inputPort.id,
        color: cs.color ?? CABLE_COLORS[i % CABLE_COLORS.length],
      });
    }

    // Validate no duplicate input connections (each input accepts only one cable)
    const inputKeys = new Set<string>();
    for (const cable of cables) {
      const key = `${cable.inputModuleId}:${cable.inputId}`;
      if (inputKeys.has(key)) {
        throw new Error(
          `Duplicate connection to input port ${cable.inputId} on module ${cable.inputModuleId}. Each input accepts only one cable.`,
        );
      }
      inputKeys.add(key);
    }
  }

  return {
    version: "2.6.6",
    modules: resolved.map((r) => r.json),
    cables,
  };
}

/**
 * Serialize a VcvPatchJson to a JSON string (.vcv file content).
 */
export function serializeVcvPatch(patch: VcvPatchJson): string {
  return JSON.stringify(patch, null, 2);
}
