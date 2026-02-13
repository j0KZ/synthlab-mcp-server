#!/usr/bin/env tsx
/**
 * VCV Rack module registry builder.
 *
 * Clones plugin repos from GitHub, parses C++ source enums + SVG panels,
 * and generates TypeScript registry files in src/vcv/registry/.
 *
 * Usage: npm run vcv:build-registry
 *        npm run vcv:build-registry -- --plugins fundamental,core
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import { parseCppSource, enumNameToLabel, type ParsedModule } from "./parse-cpp-enums.js";
import { parseSvgWidth } from "./parse-svg-width.js";

// ---------------------------------------------------------------------------
// Plugin source configuration
// ---------------------------------------------------------------------------

interface PluginConfig {
  plugin: string;
  repo: string;
  branch: string;
  srcPath?: string;         // override src path (for Core: "src/core")
  moduleList?: string[];    // hardcoded modules (for Core: no plugin.json)
}

// NOTE: Core is manually maintained (src/vcv/registry/core.ts) because it uses
// C++ template-parameterized ENUMS macros that the auto-parser can't evaluate.
const PLUGIN_CONFIGS: PluginConfig[] = [
  { plugin: "Fundamental", repo: "VCVRack/Fundamental", branch: "v2" },
  { plugin: "AudibleInstruments", repo: "VCVRack/AudibleInstruments", branch: "v2" },
  { plugin: "Befaco", repo: "VCVRack/Befaco", branch: "v2" },
  { plugin: "Bogaudio", repo: "bogaudio/BogaudioModules", branch: "master" },
  { plugin: "CountModula", repo: "countmodula/VCVRackPlugins", branch: "v2.6.0" },
  { plugin: "ImpromptuModular", repo: "MarcBoule/ImpromptuModular", branch: "master" },
  { plugin: "Valley", repo: "ValleyAudio/ValleyRackFree", branch: "main" },
  { plugin: "stoermelder-packone", repo: "stoermelder/vcvrack-packone", branch: "v2" },

  { plugin: "ML_modules", repo: "martin-lueders/ML_modules", branch: "v2" },
  { plugin: "VCV-Recorder", repo: "VCVRack/VCV-Recorder", branch: "v2" },
  { plugin: "Prism", repo: "SteveRussell33/Prism", branch: "Rack2" },
  { plugin: "GlueTheGiant", repo: "gluethegiant/gtg-rack", branch: "master" },
  { plugin: "OrangeLine", repo: "Stubs42/OrangeLine", branch: "2.0" },
  { plugin: "StudioSixPlusOne", repo: "StudioSixPlusOne/rack-modules", branch: "master" },
  { plugin: "FrozenWasteland", repo: "almostEric/FrozenWasteland", branch: "master" },
  { plugin: "ZZC", repo: "zezic/ZZC", branch: "master" },
  { plugin: "JW-Modules", repo: "jeremywen/JW-Modules", branch: "master" },
  { plugin: "SubmarineFree", repo: "david-c14/SubmarineFree", branch: "main" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = resolve(import.meta.dirname ?? ".", "..");
const REGISTRY_DIR = join(ROOT, "src", "vcv", "registry");
const TMP_DIR = join(ROOT, ".vcv-build-tmp");

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function camelCase(slug: string): string {
  return slug.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Shallow clone a repo (or skip if already present).
 */
function cloneRepo(repo: string, branch: string): string {
  const repoDir = join(TMP_DIR, repo.replace("/", "__"));
  if (existsSync(repoDir)) {
    console.log(`  [skip] ${repo} already cloned`);
    return repoDir;
  }
  console.log(`  [clone] ${repo}@${branch}`);
  mkdirSync(repoDir, { recursive: true });
  execSync(
    `git clone --depth 1 --branch ${branch} https://github.com/${repo}.git "${repoDir}"`,
    { stdio: "pipe" },
  );
  return repoDir;
}

/**
 * Read plugin.json from a cloned repo and extract module slugs + tags.
 */
function readPluginManifest(repoDir: string): Array<{ slug: string; name: string; tags: string[] }> {
  const manifestPath = join(repoDir, "plugin.json");
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  return (manifest.modules ?? []).map((m: Record<string, unknown>) => ({
    slug: String(m.slug ?? ""),
    name: String(m.name ?? m.slug ?? ""),
    tags: Array.isArray(m.tags) ? m.tags.map(String) : [],
  }));
}

/**
 * Find all C++ source files for a module (may be split across .hpp/.cpp pairs).
 * Returns array of paths so the builder can concatenate source before parsing.
 */
function findModuleSources(srcDir: string, slug: string): string[] {
  if (!existsSync(srcDir)) return [];

  const files = readdirSync(srcDir, { recursive: true })
    .map(String)
    .filter((f) => /\.(cpp|hpp|h)$/.test(f));

  /** Given a matched file, find all companion files with the same base name */
  function withCompanions(f: string): string[] {
    const ext = f.match(/\.(cpp|hpp|h)$/)?.[1] ?? "cpp";
    const base = basename(f, ext === "hpp" ? ".hpp" : ext === "h" ? ".h" : ".cpp");
    const all = files.filter((f2) => {
      const base2 = basename(f2, /\.hpp$/.test(f2) ? ".hpp" : /\.h$/.test(f2) ? ".h" : ".cpp");
      return base2 === base;
    });
    return all.map((c) => join(srcDir, c));
  }

  // Strategy 1: filename match — collect ALL extensions (e.g. VCO.cpp + VCO.hpp)
  const directMatches = files.filter((f) => {
    const base = basename(f, /\.hpp$/.test(f) ? ".hpp" : /\.h$/.test(f) ? ".h" : ".cpp");
    return base === slug;
  });
  if (directMatches.length > 0) return directMatches.map((f) => join(srcDir, f));

  // Strategy 2: search for Model *modelSlug or Model* modelSlug
  for (const f of files) {
    try {
      const content = readFileSync(join(srcDir, f), "utf-8");
      if (new RegExp(`Model\\s*\\*\\s*model${slug}\\b`).test(content)) {
        return withCompanions(f);
      }
    } catch { /* skip unreadable */ }
  }

  // Strategy 3: search for slug in configModule/setModule/createModel
  for (const f of files) {
    try {
      const content = readFileSync(join(srcDir, f), "utf-8");
      if (content.includes(`"${slug}"`) && /config\(|configModule|setModule|createModel/.test(content)) {
        return withCompanions(f);
      }
    } catch { /* skip */ }
  }

  return [];
}

/**
 * Find SVG panel file for a module.
 */
function findSvgPanel(repoDir: string, slug: string): string | null {
  const candidates = [
    join(repoDir, "res", `${slug}.svg`),
    join(repoDir, "res", "panels", `${slug}.svg`),
    join(repoDir, "res", `${slug}-panel.svg`),
    // Lowercase variants + dark-panel pattern (for Orbits, etc.)
    join(repoDir, "res", `${slug.toLowerCase()}.svg`),
    join(repoDir, "res", `${slug.toLowerCase()}-dark-panel.svg`),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/**
 * Get plugin version from plugin.json or manifest.
 */
function getPluginVersion(repoDir: string): string {
  const manifestPath = join(repoDir, "plugin.json");
  if (!existsSync(manifestPath)) return "2.0.0";
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    return String(manifest.version ?? "2.0.0");
  } catch {
    return "2.0.0";
  }
}

// ---------------------------------------------------------------------------
// Module processing
// ---------------------------------------------------------------------------

interface RegistryModule {
  name: string;
  hp: number;
  tags: string[];
  params: Array<{ id: number; name: string; label: string; min?: number; max?: number; default?: number; removed?: boolean }>;
  inputs: Array<{ id: number; name: string; label: string }>;
  outputs: Array<{ id: number; name: string; label: string }>;
}

function buildModuleEntry(
  slug: string,
  tags: string[],
  parsed: ParsedModule,
  hp: number,
): RegistryModule {
  const resolveLabel = (name: string): string => {
    const label = parsed.labels.get(name);
    return label?.label ?? enumNameToLabel(name);
  };

  return {
    name: slug,
    hp,
    tags,
    params: parsed.params.map((p) => {
      const label = parsed.labels.get(p.name);
      return {
        id: p.id,
        name: p.name,
        label: resolveLabel(p.name),
        ...(label?.min !== undefined ? { min: label.min } : {}),
        ...(label?.max !== undefined ? { max: label.max } : {}),
        ...(label?.default !== undefined ? { default: label.default } : {}),
        ...(p.removed ? { removed: true } : {}),
      };
    }),
    inputs: parsed.inputs.map((p) => ({
      id: p.id,
      name: p.name,
      label: resolveLabel(p.name),
    })),
    outputs: parsed.outputs.map((p) => ({
      id: p.id,
      name: p.name,
      label: resolveLabel(p.name),
    })),
  };
}

// ---------------------------------------------------------------------------
// TypeScript code generation
// ---------------------------------------------------------------------------

function generateRegistryFile(plugin: string, version: string, modules: Record<string, RegistryModule>): string {
  const slug = slugify(plugin);
  const varName = camelCase(slug) + "Registry";

  const moduleEntries = Object.entries(modules)
    .map(([key, mod]) => {
      const paramsStr = JSON.stringify(mod.params, null, 6).replace(/\n/g, "\n    ");
      const inputsStr = JSON.stringify(mod.inputs, null, 6).replace(/\n/g, "\n    ");
      const outputsStr = JSON.stringify(mod.outputs, null, 6).replace(/\n/g, "\n    ");
      return `    ${JSON.stringify(key)}: {
      name: ${JSON.stringify(mod.name)},
      hp: ${mod.hp},
      tags: ${JSON.stringify(mod.tags)},
      params: ${paramsStr},
      inputs: ${inputsStr},
      outputs: ${outputsStr},
    }`;
    })
    .join(",\n");

  return `// AUTO-GENERATED by scripts/build-vcv-registry.ts — DO NOT EDIT
import type { VcvPluginRegistry } from "../types.js";

export const ${varName}: VcvPluginRegistry = {
  plugin: ${JSON.stringify(plugin)},
  version: ${JSON.stringify(version)},
  modules: {
${moduleEntries},
  },
};
`;
}

function generateIndexFile(registries: Array<{ plugin: string; slug: string; varName: string }>): string {
  const imports = registries
    .map((r) => `import { ${r.varName} } from "./${r.slug}.js";`)
    .join("\n");

  const entries = registries
    .map((r) => `  [${JSON.stringify(r.plugin.toLowerCase())}, ${r.varName}]`)
    .join(",\n");

  return `// AUTO-GENERATED by scripts/build-vcv-registry.ts — DO NOT EDIT
import type { VcvPluginRegistry } from "../types.js";

${imports}

export const vcvPlugins = new Map<string, VcvPluginRegistry>([
${entries},
]);
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Parse --plugins filter
  const pluginFilter = process.argv.find((a) => a.startsWith("--plugins="));
  const filterSet = pluginFilter
    ? new Set(pluginFilter.replace("--plugins=", "").split(",").map((s) => s.trim().toLowerCase()))
    : null;

  const configs = filterSet
    ? PLUGIN_CONFIGS.filter((c) => filterSet.has(c.plugin.toLowerCase()))
    : PLUGIN_CONFIGS;

  if (configs.length === 0) {
    console.error("No matching plugins found.");
    process.exit(1);
  }

  mkdirSync(TMP_DIR, { recursive: true });
  mkdirSync(REGISTRY_DIR, { recursive: true });

  const registries: Array<{ plugin: string; slug: string; varName: string }> = [];

  for (const config of configs) {
    console.log(`\n=== ${config.plugin} ===`);

    let repoDir: string;
    try {
      repoDir = cloneRepo(config.repo, config.branch);
    } catch (err) {
      console.error(`  [error] Failed to clone ${config.repo}: ${err}`);
      continue;
    }

    const srcDir = config.srcPath ? join(repoDir, config.srcPath) : join(repoDir, "src");
    const version = getPluginVersion(repoDir);

    // Get module list
    const moduleList = config.moduleList
      ? config.moduleList.map((slug) => ({ slug, name: slug, tags: [] as string[] }))
      : readPluginManifest(repoDir);

    if (moduleList.length === 0) {
      console.log(`  [warn] No modules found for ${config.plugin}`);
      continue;
    }

    console.log(`  Found ${moduleList.length} modules, version ${version}`);

    const modules: Record<string, RegistryModule> = {};
    let parsed = 0;
    let skipped = 0;

    for (const mod of moduleList) {
      // Try exact slug first, then strip plugin prefix (Bogaudio-VCO → VCO)
      let sourceFiles = findModuleSources(srcDir, mod.slug);
      if (sourceFiles.length === 0 && mod.slug.includes("-")) {
        const stripped = mod.slug.replace(/^[^-]+-/, "");
        sourceFiles = findModuleSources(srcDir, stripped);
      }
      // Strategy: strip multi-level underscore prefix (RareBreeds_Orbits_Eugene → Eugene)
      if (sourceFiles.length === 0 && mod.slug.includes("_")) {
        const lastPart = mod.slug.split("_").pop()!;
        sourceFiles = findModuleSources(srcDir, lastPart);
        if (sourceFiles.length === 0) {
          sourceFiles = findModuleSources(srcDir, lastPart + "Module");
        }
      }
      if (sourceFiles.length === 0) {
        skipped++;
        continue;
      }

      try {
        const source = sourceFiles.map((f) => readFileSync(f, "utf-8")).join("\n");
        const parsedModule = parseCppSource(source);

        // Skip modules with no enums (headers, helpers, etc.)
        if (parsedModule.params.length === 0 && parsedModule.inputs.length === 0 && parsedModule.outputs.length === 0) {
          skipped++;
          continue;
        }

        // Get HP from SVG
        const svgPath = findSvgPanel(repoDir, mod.slug);
        const hp = svgPath ? parseSvgWidth(readFileSync(svgPath, "utf-8").slice(0, 1024)) : 10;

        modules[mod.slug] = buildModuleEntry(mod.slug, mod.tags, parsedModule, hp);
        parsed++;
      } catch (err) {
        console.error(`  [error] ${mod.slug}: ${err}`);
        skipped++;
      }
    }

    console.log(`  Parsed: ${parsed}, Skipped: ${skipped}`);

    if (Object.keys(modules).length === 0) {
      console.log(`  [warn] No parseable modules for ${config.plugin}`);
      continue;
    }

    // Generate TypeScript file
    const slug = slugify(config.plugin);
    const varName = camelCase(slug) + "Registry";
    const tsContent = generateRegistryFile(config.plugin, version, modules);
    const outPath = join(REGISTRY_DIR, `${slug}.ts`);
    writeFileSync(outPath, tsContent, "utf-8");
    console.log(`  Written: ${outPath}`);

    registries.push({ plugin: config.plugin, slug, varName });
  }

  // Generate index.ts — always merge with existing registries (e.g. manually maintained Core).
  // Scans existing .ts files so --plugins incremental builds include all registries.
  if (existsSync(REGISTRY_DIR)) {
    const existingFiles = readdirSync(REGISTRY_DIR)
      .filter((f) => f.endsWith(".ts") && f !== "index.ts");
    for (const f of existingFiles) {
      const slug = f.replace(".ts", "");
      if (registries.some((r) => r.slug === slug)) continue;
      const varName = camelCase(slug) + "Registry";
      // Read plugin name from file
      const content = readFileSync(join(REGISTRY_DIR, f), "utf-8");
      const pluginMatch = content.match(/plugin:\s*"([^"]+)"/);
      const plugin = pluginMatch?.[1] ?? slug;
      registries.push({ plugin, slug, varName });
    }
  }

  const indexContent = generateIndexFile(registries);
  writeFileSync(join(REGISTRY_DIR, "index.ts"), indexContent, "utf-8");
  console.log(`\nWritten: ${join(REGISTRY_DIR, "index.ts")}`);

  // Cleanup
  console.log(`\nDone! ${registries.length} plugin registries generated.`);
  console.log(`Temp clones at: ${TMP_DIR} (delete manually when done)`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
