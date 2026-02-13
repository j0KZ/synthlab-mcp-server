/**
 * VCV Rack module registry — static imports + lookup.
 *
 * Same pattern as src/devices/index.ts: Map-based with aliases and fuzzy resolution.
 */

import type { VcvPluginRegistry, VcvModuleDef, VcvPortDef, VcvParamDef } from "./types.js";
import { vcvPlugins } from "./registry/index.js";

// ---------------------------------------------------------------------------
// Plugin aliases
// ---------------------------------------------------------------------------

const PLUGIN_ALIASES: Record<string, string> = {
  vcv: "fundamental",
  mutable: "audibleinstruments",
  mi: "audibleinstruments",
  bg: "bogaudio",
  stoermelder: "stoermelder-packone",
  packone: "stoermelder-packone",
  p1: "stoermelder-packone",
  impromptu: "impromptumodular",
  ml: "ml_modules",
  recorder: "vcv-recorder",
  gtg: "gluethegiant",
  glue: "gluethegiant",
  s6: "studiosixplusone",
};

/**
 * Get a plugin registry by name (case-insensitive, with aliases).
 */
export function getVcvPlugin(name: string): VcvPluginRegistry {
  const key = name.toLowerCase();
  const resolved = PLUGIN_ALIASES[key] ?? key;
  const plugin = vcvPlugins.get(resolved);
  if (!plugin) {
    const available = [...new Set([...vcvPlugins.values()].map((p) => p.plugin))];
    throw new Error(
      `Unknown VCV plugin "${name}". Available: ${available.join(", ")}`,
    );
  }
  return plugin;
}

/**
 * Get a module definition from a plugin (case-insensitive model lookup).
 */
export function getVcvModule(plugin: string, model: string): VcvModuleDef & { pluginName: string; pluginVersion: string } {
  const reg = getVcvPlugin(plugin);

  // Exact match
  if (reg.modules[model]) {
    return { ...reg.modules[model], pluginName: reg.plugin, pluginVersion: reg.version };
  }

  // Case-insensitive match
  const lower = model.toLowerCase();
  for (const [key, mod] of Object.entries(reg.modules)) {
    if (key.toLowerCase() === lower) {
      return { ...mod, pluginName: reg.plugin, pluginVersion: reg.version };
    }
  }

  const available = Object.keys(reg.modules);
  throw new Error(
    `Unknown module "${model}" in plugin "${reg.plugin}". Available: ${available.join(", ")}`,
  );
}

/**
 * Resolve a port by label or name (case-insensitive, fuzzy).
 *
 * Resolution order: exact label → exact name → partial label → stripped suffix.
 */
export function resolvePort(
  mod: VcvModuleDef,
  name: string,
  type: "input" | "output",
): VcvPortDef {
  const ports = type === "input" ? mod.inputs : mod.outputs;
  const lower = name.toLowerCase();

  // 1. Exact label match
  const byLabel = ports.find((p) => p.label.toLowerCase() === lower);
  if (byLabel) return byLabel;

  // 2. Exact name match
  const byName = ports.find((p) => p.name.toLowerCase() === lower);
  if (byName) return byName;

  // 3. Partial label match (starts with or contains)
  const partial = ports.find((p) => p.label.toLowerCase().includes(lower));
  if (partial) return partial;

  // 4. Partial name match with suffix stripping
  const stripped = lower.replace(/_(?:input|output)$/, "");
  const byStripped = ports.find((p) =>
    p.name.toLowerCase().replace(/_(?:input|output)$/, "") === stripped,
  );
  if (byStripped) return byStripped;

  // 5. Numeric ID (e.g. "0", "1")
  const numId = parseInt(name, 10);
  if (!isNaN(numId)) {
    const byId = ports.find((p) => p.id === numId);
    if (byId) return byId;
  }

  const available = ports.map((p) => `${p.label} (${p.name})`);
  throw new Error(
    `Unknown ${type} port "${name}" on ${mod.name}. Available: ${available.join(", ")}`,
  );
}

/**
 * Resolve a param by label or name (case-insensitive, fuzzy).
 * Skips removed params in resolution but they still occupy ID slots.
 */
export function resolveParam(mod: VcvModuleDef, name: string): VcvParamDef {
  const lower = name.toLowerCase();

  // 1. Exact label (skip removed)
  const byLabel = mod.params.find((p) => !p.removed && p.label.toLowerCase() === lower);
  if (byLabel) return byLabel;

  // 2. Exact name
  const byName = mod.params.find((p) => !p.removed && p.name.toLowerCase() === lower);
  if (byName) return byName;

  // 3. Partial label
  const partial = mod.params.find((p) => !p.removed && p.label.toLowerCase().includes(lower));
  if (partial) return partial;

  // 4. Suffix-stripped name
  const stripped = lower.replace(/_param$/, "");
  const byStripped = mod.params.find((p) =>
    !p.removed && p.name.toLowerCase().replace(/_param$/, "") === stripped,
  );
  if (byStripped) return byStripped;

  const available = mod.params.filter((p) => !p.removed).map((p) => `${p.label} (${p.name})`);
  throw new Error(
    `Unknown param "${name}" on ${mod.name}. Available: ${available.join(", ")}`,
  );
}

/**
 * List all available plugins.
 */
export function listVcvPlugins(): string[] {
  return [...new Set([...vcvPlugins.values()].map((p) => p.plugin))];
}

/**
 * List all modules in a plugin.
 */
export function listVcvModules(plugin: string): string[] {
  const reg = getVcvPlugin(plugin);
  return Object.keys(reg.modules);
}
