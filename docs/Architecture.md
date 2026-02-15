# Architecture — synthlab-mcp-server

## System Overview

```
+---------------------------------------------------------------------+
|                       Claude / AI Client                            |
+-----------------------------+---------------------------------------+
                              | MCP (stdio)
+-----------------------------v---------------------------------------+
|                     synthlab-mcp-server                              |
|                                                                     |
|  ┌─────────────────────────────────────────────────────────────┐    |
|  │  MCP Transport Layer           src/index.ts                 │    |
|  │  McpServer + StdioServerTransport, 10 tools + 1 prompt      │    |
|  └──────────────────────────┬──────────────────────────────────┘    |
|                             │                                       |
|  ┌──────────────────────────v──────────────────────────────────┐    |
|  │  Schema Layer              src/schemas/*.ts                 │    |
|  │  7 Zod schemas — validates + coerces LLM input              │    |
|  └──────────────────────────┬──────────────────────────────────┘    |
|                             │                                       |
|  ┌──────────────────────────v──────────────────────────────────┐    |
|  │  Tool Handler Layer        src/tools/*.ts                   │    |
|  │  10 handlers, each: try/catch → {content, isError}          │    |
|  └───┬──────┬──────┬──────┬──────┬──────┬──────┬──────────────┘    |
|      │      │      │      │      │      │      │                    |
|  ┌───v──┐┌──v───┐┌─v────┐┌v─────┐┌─v──┐┌v────┐┌v─────────────┐    |
|  │ Core ││Templ.││Compo-││Contr-││Wire││ VCV ││  Network     │    |
|  │Engine││Engine││ ser  ││oller ││    ││     ││  Layer       │    |
|  └──────┘└──────┘└──────┘└──────┘└────┘└─────┘└─────────────┘    |
+---------------------------------------------------------------------+
                              │                    │
                    ┌─────────v──────┐   ┌────────v────────┐
                    │  .pd files     │   │  .vcv files     │
                    │  (Pure Data)   │   │  (VCV Rack 2.x) │
                    └────────────────┘   └─────────────────┘
```

## Layer Descriptions

### 1. MCP Transport Layer
**File**: `src/index.ts`
**Purpose**: Registers 10 tools + 1 prompt with `McpServer`, starts stdio transport.
**Key API**: `server.tool(name, description, zodSchema, handler)`, `server.prompt(name, description, fn)`
**Dependencies**: `@modelcontextprotocol/sdk`

Each tool registration follows the same pattern:
```
server.tool("tool_name", "description", zodSchema, async (params) => {
  try { return { content: [{ type: "text", text: result }] }; }
  catch { return { content: [{ type: "text", text: errorMsg }], isError: true }; }
});
```

### 2. Schema Layer
**Files**: `src/schemas/patch.ts`, `analyze.ts`, `template.ts`, `rack.ts`, `control.ts`, `compose.ts`, `vcv.ts`
**Purpose**: Zod schemas for all tool inputs. Performs runtime validation and coercion at the MCP boundary.
**Key behavior**: Coerces common LLM mistakes — string "440" → number 440, "BD" → "bd", "C3" → validated octave range.
**Dependencies**: `zod`

### 3. Tool Handler Layer
**Files**: `src/tools/parse.ts`, `generate.ts`, `validate.ts`, `analyze.ts`, `template.ts`, `rack.ts`, `control.ts`, `list-vcv.ts`, `vcv.ts`, `compose.ts`
**Purpose**: Orchestrate calls to core engines. Each handler is a thin wrapper: validate input → call engine → format output.
**Pattern**: Every handler exports an `execute*` function (e.g. `executeParsePatch`, `executeCreateRack`).

### 4. Core Engine
**Files**: `src/core/parser.ts`, `serializer.ts`, `validator.ts`, `object-registry.ts`
**Purpose**: Parse .pd text ↔ AST ↔ .pd text. Validate structural integrity.

| Component | Input → Output |
|-----------|---------------|
| `parser.ts` | .pd text → `PdPatch` AST |
| `serializer.ts` | `PatchSpec` → .pd text (also `buildPatch()` convenience) |
| `validator.ts` | `PdPatch` → `ValidationIssue[]` (8 checks) |
| `object-registry.ts` | object name → `{inlets, outlets, isAudio}` (~95 Pd-vanilla objects) |

**Types** (from `src/types.ts`):
- `PdPatch` → `{ root: PdCanvas }`
- `PdCanvas` → `{ nodes: PdNode[], connections: PdConnection[], subpatches: PdCanvas[] }`
- `PdNode` → `{ id, type, x, y, name?, args[], raw }`
- `PdConnection` → `{ fromNode, fromOutlet, toNode, toInlet }`

### 5. Template Engine
**Files**: `src/templates/index.ts` (registry + dispatcher), individual template files, `src/templates/modules/` (reusable components)
**Purpose**: Generate parameterized Pd patches. Each template returns a `RackableSpec` (PatchSpec + PortInfo[] + ParameterDescriptor[]).

**Templates (11)**: synth, sequencer, drum-machine, reverb, mixer, clock, chaos, maths, turing-machine, granular, bridge.

**Reusable modules** (`src/templates/modules/`): oscillator (4 variants), filter (5 variants), vca, envelope (3 variants), delay (2 variants), reverb (2 variants).

**Key types** (from `src/templates/port-info.ts`):
- `PortInfo` → `{ name, type: "audio"|"control", direction: "input"|"output", nodeIndex, port, ioNodeIndex? }`
- `ParameterDescriptor` → `{ name, label, min, max, default, unit, curve, nodeIndex, inlet, category, controlType? }`
- `RackableSpec` → `{ spec: PatchSpec, ports: PortInfo[], parameters?: ParameterDescriptor[] }`

### 6. Composition Layer
**Files**: `src/composer/presets.ts`, `moods.ts`, `scales.ts`, `wiring-rules.ts`, `song-mapper.ts`
**Purpose**: Map high-level song descriptions (genre, mood, tempo) to concrete rack configurations.

| Component | Purpose |
|-----------|---------|
| `presets.ts` | 9 genre presets (tempo ranges, default instruments, mood, key) |
| `moods.ts` | 7 mood adjustments (filter cutoff, reverb mix, drum tone, speed offset) |
| `scales.ts` | 10 scales × 12 keys → MIDI note arrays |
| `wiring-rules.ts` | Auto-wiring: clock→sequencer→synth→mixer→effects |
| `song-mapper.ts` | SongSpec → CreateRackInput (maps roles to templates + params) |

### 7. Controller Layer
**Files**: `src/controllers/auto-mapper.ts`, `pd-controller.ts`, `pd-output-controller.ts`, `param-injector.ts`, `k2-deck-config.ts`
**Purpose**: Map MIDI hardware controls to rack parameters.

**Auto-mapping 4-phase algorithm** (`auto-mapper.ts`):
1. Apply user's explicit custom mappings first
2. Map amplitude-category controls to faders
3. Map frequency-category controls to pots/encoders
4. Distribute remaining unassigned controls round-robin

### 8. Device Profiles
**Files**: `src/devices/k2.ts`, `microfreak.ts`, `tr8s.ts`, `src/devices/index.ts` (registry)
**Purpose**: Declare available controls per hardware device.

**Key type** (from `src/devices/types.ts`):
- `DeviceProfile` → `{ name, label, midiChannel, controls: DeviceControl[], noteTriggers?, setupNotes? }`
- `DeviceControl` → `{ name, type, cc?, note?, inputType, range, category, direction?, bipolar?, group? }`

### 9. VCV Rack Layer
**Files**: `src/vcv/generator.ts`, `positioner.ts`, `registry.ts`, `validate-vcv-params.ts`, `src/vcv/registry/` (19 plugin files + index)
**Purpose**: Generate .vcv patch files from module + cable specs.

| Component | Purpose |
|-----------|---------|
| `registry.ts` | Plugin lookup with aliases ("mi" → AudibleInstruments, "bg" → Bogaudio). Fuzzy port/param resolution by label, name, partial match, or ID. |
| `generator.ts` | Resolve module specs → VcvModuleJson[], cables → VcvCableJson[], output VcvPatchJson |
| `positioner.ts` | Left-to-right HP layout with module adjacency chain |
| `validate-vcv-params.ts` | Coerce Claude Desktop quirks (string→number, out-of-range clamping) |

**Key types** (from `src/vcv/types.ts`):
- Registry: `VcvPluginRegistry` → `{ plugin, version, modules: Record<string, VcvModuleDef> }`
- User spec: `VcvModuleSpec` → `{ plugin, model, params? }`, `VcvCableSpec` → `{ from: {module, port}, to: {module, port}, color? }`
- Output JSON: `VcvPatchJson` → `{ version, modules: VcvModuleJson[], cables: VcvCableJson[] }`

### 10. Wiring Layer
**File**: `src/wiring/bus-injector.ts`
**Purpose**: Connect modules in a rack via named buses.

| Bus Type | Pd Objects | Use |
|----------|-----------|-----|
| Audio | `throw~ busname` → `catch~ busname` | Signal-rate connections (e.g. synth audio → mixer input) |
| Control | `send busname` → `receive busname` | Message-rate connections (e.g. clock beat → sequencer trigger) |

### 11. Network Layer
**Files**: `src/network/osc-encoder.ts`, `fudi-formatter.ts`, `udp-sender.ts`, `tcp-sender.ts`
**Purpose**: Send messages to running Pd instances. Zero external dependencies.

| Component | Protocol | Transport | Node API |
|-----------|----------|-----------|----------|
| `osc-encoder.ts` | OSC 1.0 binary (4-byte aligned) | — | — |
| `fudi-formatter.ts` | FUDI text (Pd native) | — | — |
| `udp-sender.ts` | OSC | UDP fire-and-forget | `dgram` |
| `tcp-sender.ts` | FUDI | TCP send/receive | `net` |

## Data Flows

### Parse Flow
```
User: "What does this patch do?"
  → parse_patch tool
    → resolveSource(path or raw text)      [src/utils/resolve-source.ts]
    → parsePd(pdText)                       [src/core/parser.ts]
    → PdPatch AST
    → format as readable text
  ← Structured description
```

### Generate Flow
```
User: "Create a saw synth with filter"
  → generate_patch tool
    → Zod validates {nodes, connections}    [src/schemas/patch.ts]
    → buildPatch(spec)                      [src/core/serializer.ts]
    → .pd text (optionally write to file)
  ← .pd file content
```

### Compose Flow
```
User: "Compose a dark techno track"
  → compose_patch tool
    → Zod validates {genre, mood, ...}      [src/schemas/compose.ts]
    → mapSongToRack(songSpec)               [src/composer/song-mapper.ts]
      → lookupPreset("techno")              [src/composer/presets.ts]
      → applyMood("dark")                   [src/composer/moods.ts]
      → generateScale("minor", "A")         [src/composer/scales.ts]
      → map instrument roles → templates
    → executeCreateRack(rackInput)          [src/tools/rack.ts]
      → instantiate each template           [src/templates/]
      → applyWiring(wiringRules)            [src/wiring/bus-injector.ts]
      → generate controller patch           [src/controllers/]
    → combined _rack.pd + individual .pd files
  ← Complete song as .pd patches
```

### VCV Flow
```
User: "Create a VCV patch with Braids → Ripples → Veils"
  → list_vcv_modules (lookup ports)
    → registry.ts fuzzy match
  → generate_vcv tool
    → Zod validates {modules, cables}       [src/schemas/vcv.ts]
    → resolveModules(specs)                 [src/vcv/generator.ts]
      → registry lookup per module          [src/vcv/registry.ts]
      → fuzzy port resolution
    → positionModules(resolved)             [src/vcv/positioner.ts]
    → resolveCables(specs, modules)         [src/vcv/generator.ts]
    → VcvPatchJson output
  ← .vcv file content (JSON)
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Zero external network deps** | Native `dgram` (UDP) and `net` (TCP) eliminate supply chain risk and keep the bundle small. OSC 1.0 encoding is simple enough (~100 lines). |
| **tsup bundler** | Single-file ESM output with tree-shaking. `PACKAGE_VERSION` injected at build time from package.json. ~40ms builds. |
| **Zod for schema validation** | LLMs send inconsistent types (strings for numbers, wrong casing, out-of-range values). Zod's `.coerce()` and `.transform()` fix these at the MCP boundary before they reach core logic. |
| **VCV C++ scraper** | Manual creation of 600+ module registries is impractical. `scripts/build-vcv-registry.ts` clones plugin repos, parses C++ enum definitions (ParamIds, InputIds, OutputIds), and generates TypeScript registry files automatically. |
| **throw~/catch~ for audio buses** | Pd's throw~/catch~ creates invisible signal-rate connections between modules — no explicit patch cords needed. This enables modular rack assembly where modules are independent .pd subpatches connected via named buses. |
| **send/receive for control buses** | Same principle as audio buses but for message-rate signals (triggers, note values, CC). Keeps modules decoupled. |
| **4-phase auto-mapping** | MIDI controllers have limited controls. The algorithm prioritizes: (1) user's explicit mappings, (2) amplitude params → faders, (3) frequency params → pots, (4) everything else round-robin. This produces musically sensible defaults without user configuration. |

## VCV Registry Pipeline

```
C++ plugin source (GitHub repos)
  → scripts/build-vcv-registry.ts
    → git clone each repo
    → scripts/parse-cpp-enums.ts
      → parse ParamIds, InputIds, OutputIds enums
      → parse configParam/configInput/configOutput calls
    → scripts/parse-svg-width.ts
      → SVG panel width → HP (1 HP = 5.08mm = 15px)
    → generate src/vcv/registry/<plugin>.ts
    → update src/vcv/registry/index.ts (plugin map)
```
