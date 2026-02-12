/**
 * Auto-mapping algorithm: assigns device controls to rack parameters.
 *
 * Strategy:
 *   1. Faders (category "amplitude") → amplitude parameters
 *   2. Pots row 1 (category "frequency") → filter parameters
 *   3. Remaining pots → remaining parameters (round-robin)
 *   4. Custom mappings override auto-assignments
 */

import type { DeviceProfile, DeviceControl } from "../devices/types.js";
import type { ParameterDescriptor } from "../templates/port-info.js";
import type { ControllerMapping, CustomMapping } from "./types.js";

/** Module with its parameters for mapping. */
export interface MappableModule {
  id: string;
  parameters: ParameterDescriptor[];
}

/** Generate the bus name for a parameter mapping. */
function busName(moduleId: string, paramName: string): string {
  return `${moduleId}__p__${paramName}`;
}

/**
 * Validate custom mappings against available controls and parameters.
 * Throws descriptive errors on invalid references.
 */
function validateCustomMappings(
  customMappings: CustomMapping[],
  device: DeviceProfile,
  modules: MappableModule[],
): void {
  const controlNames = new Set(device.controls.map((c) => c.name));
  const moduleMap = new Map(modules.map((m) => [m.id, m]));
  const usedControls = new Set<string>();

  for (const cm of customMappings) {
    // Validate control name
    if (!controlNames.has(cm.control)) {
      throw new Error(
        `Controller mapping error: control "${cm.control}" not found on device "${device.name}". ` +
          `Available controls: ${[...controlNames].join(", ")}`,
      );
    }

    // Validate module ID
    const mod = moduleMap.get(cm.module);
    if (!mod) {
      throw new Error(
        `Controller mapping error: module "${cm.module}" not found. ` +
          `Available modules: ${modules.map((m) => m.id).join(", ")}`,
      );
    }

    // Validate parameter name
    const param = mod.parameters.find((p) => p.name === cm.parameter);
    if (!param) {
      const available = mod.parameters.map((p) => p.name);
      throw new Error(
        `Controller mapping error: parameter "${cm.parameter}" not found on module "${cm.module}". ` +
          `Available parameters: ${available.join(", ") || "(none)"}`,
      );
    }

    // Check duplicate control assignment
    if (usedControls.has(cm.control)) {
      throw new Error(
        `Controller mapping error: control "${cm.control}" is already mapped.`,
      );
    }
    usedControls.add(cm.control);
  }
}

/**
 * Auto-map device controls to rack parameters.
 *
 * Returns mappings sorted by control order on the device.
 * Unmapped controls/parameters are silently skipped.
 */
export function autoMap(
  modules: MappableModule[],
  device: DeviceProfile,
  customMappings?: CustomMapping[],
): ControllerMapping[] {
  // Validate custom mappings first
  if (customMappings && customMappings.length > 0) {
    validateCustomMappings(customMappings, device, modules);
  }

  // Build flat list of all parameters with module context
  const allParams: { moduleId: string; param: ParameterDescriptor }[] = [];
  for (const mod of modules) {
    for (const param of mod.parameters) {
      allParams.push({ moduleId: mod.id, param });
    }
  }

  if (allParams.length === 0) return [];

  const results: ControllerMapping[] = [];
  const usedControls = new Set<string>();
  const usedParams = new Set<string>(); // "moduleId::paramName"

  // Phase 1: Apply custom mappings
  if (customMappings) {
    for (const cm of customMappings) {
      const control = device.controls.find((c) => c.name === cm.control)!;
      const mod = modules.find((m) => m.id === cm.module)!;
      const param = mod.parameters.find((p) => p.name === cm.parameter)!;
      const paramKey = `${cm.module}::${cm.parameter}`;

      results.push({
        control,
        moduleId: cm.module,
        parameter: param,
        busName: busName(cm.module, cm.parameter),
      });
      usedControls.add(cm.control);
      usedParams.add(paramKey);
    }
  }

  // Phase 2: Auto-map remaining controls by category
  // Sort parameters: amplitude first (for faders), then filter, then others
  const categoryPriority: Record<string, number> = {
    amplitude: 0,
    filter: 1,
    oscillator: 2,
    effect: 3,
    transport: 4,
  };
  const remainingParams = allParams
    .filter((p) => !usedParams.has(`${p.moduleId}::${p.param.name}`))
    .sort((a, b) => (categoryPriority[a.param.category] ?? 9) - (categoryPriority[b.param.category] ?? 9));

  // Get unused controls, maintaining device order
  const remainingControls = device.controls.filter(
    (c) => !usedControls.has(c.name) && c.inputType === "absolute",
  );

  // Group controls by category for targeted matching
  const amplitudeControls = remainingControls.filter((c) => c.category === "amplitude");
  const frequencyControls = remainingControls.filter((c) => c.category === "frequency");
  const generalControls = remainingControls.filter((c) => c.category === "general");

  // Match amplitude controls → amplitude params
  const amplitudeParams = remainingParams.filter((p) => p.param.category === "amplitude");
  for (let i = 0; i < Math.min(amplitudeControls.length, amplitudeParams.length); i++) {
    const { moduleId, param } = amplitudeParams[i];
    results.push({
      control: amplitudeControls[i],
      moduleId,
      parameter: param,
      busName: busName(moduleId, param.name),
    });
    usedControls.add(amplitudeControls[i].name);
    usedParams.add(`${moduleId}::${param.name}`);
  }

  // Match frequency controls → filter params
  const filterParams = remainingParams.filter(
    (p) => p.param.category === "filter" && !usedParams.has(`${p.moduleId}::${p.param.name}`),
  );
  for (let i = 0; i < Math.min(frequencyControls.length, filterParams.length); i++) {
    const { moduleId, param } = filterParams[i];
    results.push({
      control: frequencyControls[i],
      moduleId,
      parameter: param,
      busName: busName(moduleId, param.name),
    });
    usedControls.add(frequencyControls[i].name);
    usedParams.add(`${moduleId}::${param.name}`);
  }

  // Remaining general controls → remaining params (round-robin)
  const stillUnmapped = remainingParams.filter(
    (p) => !usedParams.has(`${p.moduleId}::${p.param.name}`),
  );
  const unusedGenerals = [
    ...amplitudeControls.filter((c) => !usedControls.has(c.name)),
    ...frequencyControls.filter((c) => !usedControls.has(c.name)),
    ...generalControls.filter((c) => !usedControls.has(c.name)),
  ];

  for (let i = 0; i < Math.min(unusedGenerals.length, stillUnmapped.length); i++) {
    const { moduleId, param } = stillUnmapped[i];
    results.push({
      control: unusedGenerals[i],
      moduleId,
      parameter: param,
      busName: busName(moduleId, param.name),
    });
  }

  return results;
}
