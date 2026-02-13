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
  // Mutable Instruments alternative name
  "mutable instruments": "audibleinstruments",
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
  fw: "frozenwasteland",
  frozen: "frozenwasteland",
  "frozen wasteland": "frozenwasteland",
  jw: "jw-modules",
  "jw modules": "jw-modules",
  submarine: "submarinefree",
  sub: "submarinefree",
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

// ---------------------------------------------------------------------------
// Module aliases — common LLM guesses → correct registry slugs.
// Key format: "pluginkey:alias" (all lowercase).
// ---------------------------------------------------------------------------

const MODULE_ALIASES: Record<string, { plugin: string; model: string }> = {
  // Mutable Instruments (hardware function names → VCV codenames)
  "audibleinstruments:macro_oscillator": { plugin: "audibleinstruments", model: "Braids" },
  "audibleinstruments:macro_oscillator_2": { plugin: "audibleinstruments", model: "Plaits" },
  "audibleinstruments:macro_oscillator2": { plugin: "audibleinstruments", model: "Plaits" },
  "audibleinstruments:modal_synthesizer": { plugin: "audibleinstruments", model: "Elements" },
  "audibleinstruments:tidal_modulator": { plugin: "audibleinstruments", model: "Tides" },
  "audibleinstruments:tidal_modulator_2": { plugin: "audibleinstruments", model: "Tides2" },
  "audibleinstruments:tidal_modulator2": { plugin: "audibleinstruments", model: "Tides2" },
  "audibleinstruments:texture_synthesizer": { plugin: "audibleinstruments", model: "Clouds" },
  "audibleinstruments:spectrum_processor": { plugin: "audibleinstruments", model: "Warps" },
  "audibleinstruments:resonator": { plugin: "audibleinstruments", model: "Rings" },
  "audibleinstruments:bernoulli_gate": { plugin: "audibleinstruments", model: "Branches" },
  "audibleinstruments:segment_generator": { plugin: "audibleinstruments", model: "Stages" },
  "audibleinstruments:random_sampler": { plugin: "audibleinstruments", model: "Marbles" },
  "audibleinstruments:liquid_filter": { plugin: "audibleinstruments", model: "Ripples" },
  "audibleinstruments:parasites": { plugin: "audibleinstruments", model: "Clouds" },
  // Fundamental (common LLM suffixed guesses)
  "fundamental:lfo-1": { plugin: "fundamental", model: "LFO" },
  "fundamental:lfo_1": { plugin: "fundamental", model: "LFO" },
  "fundamental:lfo1": { plugin: "fundamental", model: "LFO" },
  "fundamental:vco-1": { plugin: "fundamental", model: "VCO" },
  "fundamental:vco_1": { plugin: "fundamental", model: "VCO" },
  "fundamental:vco1": { plugin: "fundamental", model: "VCO" },
  "fundamental:vcf-1": { plugin: "fundamental", model: "VCF" },
  "fundamental:vcf_1": { plugin: "fundamental", model: "VCF" },
  "fundamental:vcf1": { plugin: "fundamental", model: "VCF" },
  // FrozenWasteland — QAR (Quad Algorithmic Rhythm) Euclidean sequencer
  "frozenwasteland:qar": { plugin: "frozenwasteland", model: "QuadAlgorithmicRhythm" },
  "frozenwasteland:euclidean": { plugin: "frozenwasteland", model: "QuadAlgorithmicRhythm" },
  "frozenwasteland:probably_note": { plugin: "frozenwasteland", model: "ProbablyNote" },
  "frozenwasteland:portland_weather": { plugin: "frozenwasteland", model: "PortlandWeather" },
  // ZZC — hyphenated names
  "zzc:fn3": { plugin: "zzc", model: "FN-3" },
  "zzc:fn_3": { plugin: "zzc", model: "FN-3" },
  "zzc:sh8": { plugin: "zzc", model: "SH-8" },
  "zzc:sh_8": { plugin: "zzc", model: "SH-8" },
  // JW-Modules — common LLM guesses
  "jw-modules:gridseq": { plugin: "jw-modules", model: "GridSeq" },
  "jw-modules:grid_seq": { plugin: "jw-modules", model: "GridSeq" },
  "jw-modules:noteseq": { plugin: "jw-modules", model: "NoteSeq" },
  "jw-modules:note_seq": { plugin: "jw-modules", model: "NoteSeq" },
  "jw-modules:noteseq16": { plugin: "jw-modules", model: "NoteSeq16" },
};

/**
 * Get a module definition from a plugin (case-insensitive model lookup + alias resolution).
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

  // Module alias resolution
  const pluginKey = plugin.toLowerCase();
  const resolvedPlugin = PLUGIN_ALIASES[pluginKey] ?? pluginKey;
  const aliasKey = `${resolvedPlugin}:${lower}`;
  const alias = MODULE_ALIASES[aliasKey];
  if (alias) {
    const aliasReg = getVcvPlugin(alias.plugin);
    const mod = aliasReg.modules[alias.model];
    if (mod) {
      return { ...mod, pluginName: aliasReg.plugin, pluginVersion: aliasReg.version };
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

/**
 * Format a compact module listing for a plugin (slug + tags + hp).
 */
export function formatModuleListing(plugin: string): string {
  const reg = getVcvPlugin(plugin);
  const entries = Object.entries(reg.modules);
  const lines = entries.map(
    ([slug, mod]) => `${slug} — [${mod.tags.join(", ")}] — ${mod.hp}hp`,
  );
  return `# ${reg.plugin} v${reg.version} (${entries.length} modules)\n\n${lines.join("\n")}`;
}

/**
 * Format detailed module info (ports, params) for a specific module.
 */
export function formatModuleDetail(plugin: string, model: string): string {
  const mod = getVcvModule(plugin, model);
  const lines: string[] = [];

  lines.push(`# ${mod.pluginName} v${mod.pluginVersion} / ${mod.name} (${mod.hp}hp)`);
  lines.push(`Tags: ${mod.tags.join(", ")}`);
  lines.push("");

  if (mod.inputs.length > 0) {
    const ports = mod.inputs.map((p) => `${p.label} (${p.name})`);
    lines.push(`Inputs: ${ports.join(", ")}`);
  }

  if (mod.outputs.length > 0) {
    const ports = mod.outputs.map((p) => `${p.label} (${p.name})`);
    lines.push(`Outputs: ${ports.join(", ")}`);
  }

  if (mod.params.length > 0) {
    const params = mod.params
      .filter((p) => !p.removed)
      .map((p) => {
        const range = p.min !== undefined && p.max !== undefined
          ? ` [${p.min}..${p.max}${p.default !== undefined ? `, default ${p.default}` : ""}]`
          : "";
        return `${p.label} (${p.name})${range}`;
      });
    lines.push(`Params: ${params.join(", ")}`);
  }

  return lines.join("\n");
}
