# Scaffold — synthlab-mcp-server

## Directory Tree

```
synthlab-mcp-server/
│
├── src/                                 # All source code (~70k lines incl. registries)
│   ├── index.ts                         # MCP server entry — 10 tools + 1 prompt registered here
│   ├── types.ts                         # Core AST types: PdPatch, PdCanvas, PdNode, PdConnection
│   ├── constants.ts                     # Format constants, default layout spacing
│   ├── env.d.ts                         # PACKAGE_VERSION global type declaration
│   │
│   ├── core/                            # Pd parsing, serialization, validation
│   │   ├── parser.ts                    # .pd text → PdPatch AST
│   │   ├── serializer.ts               # PatchSpec → .pd text (buildPatch convenience fn)
│   │   ├── object-registry.ts           # ~95 Pd-vanilla objects: name → {inlets, outlets, isAudio}
│   │   └── validator.ts                 # 8 structural checks → ValidationIssue[]
│   │
│   ├── schemas/                         # Zod input validation (7 schemas)
│   │   ├── patch.ts                     # parse_patch, generate_patch
│   │   ├── analyze.ts                   # validate_patch, analyze_patch
│   │   ├── template.ts                  # create_from_template
│   │   ├── rack.ts                      # create_rack
│   │   ├── control.ts                   # send_message
│   │   ├── compose.ts                   # compose_patch
│   │   └── vcv.ts                       # list_vcv_modules, generate_vcv
│   │
│   ├── tools/                           # MCP tool handlers (10)
│   │   ├── parse.ts                     # parse_patch → executeParsePatch
│   │   ├── generate.ts                  # generate_patch → executeGeneratePatch
│   │   ├── validate.ts                  # validate_patch → executeValidatePatch
│   │   ├── analyze.ts                   # analyze_patch → executeAnalyzePatch
│   │   ├── template.ts                  # create_from_template → executeCreateFromTemplate
│   │   ├── rack.ts                      # create_rack → executeCreateRack
│   │   ├── control.ts                   # send_message → executeSendMessage
│   │   ├── list-vcv.ts                  # list_vcv_modules → executeListVcvModules
│   │   ├── vcv.ts                       # generate_vcv → executeGenerateVcv
│   │   └── compose.ts                   # compose_patch → executeComposePatch
│   │
│   ├── templates/                       # 11 parameterized Pd templates
│   │   ├── index.ts                     # TEMPLATE_NAMES array + dispatcher
│   │   ├── port-info.ts                 # PortInfo, ParameterDescriptor, RackableSpec types
│   │   ├── validate-params.ts           # Runtime parameter validation + coercion
│   │   ├── synth.ts                     # Osc → Filter → VCA → DAC
│   │   ├── sequencer.ts                 # MIDI step sequencer
│   │   ├── drum-machine.ts              # 3-layer analog drums (4 voices: bd/sn/hh/cp)
│   │   ├── reverb-template.ts           # Spring/plate reverb (schroeder/simple)
│   │   ├── mixer.ts                     # N-channel mixer (1-16 channels)
│   │   ├── clock.ts                     # Master clock with divided outputs
│   │   ├── chaos.ts                     # Logistic map chaos generator
│   │   ├── maths.ts                     # Function generator (rise/fall envelopes)
│   │   ├── turing-machine.ts            # Shift register sequencer
│   │   ├── granular.ts                  # Granular synthesis sampler
│   │   ├── bridge.ts                    # OSC/FUDI network receiver
│   │   └── modules/                     # Reusable sub-components
│   │       ├── types.ts                 # ModuleSpec types
│   │       ├── compose.ts              # Module composition with index offsetting
│   │       ├── oscillator.ts            # 4 variants: sine, saw, square, noise
│   │       ├── filter.ts               # 5 variants: lowpass, highpass, bandpass, moog, korg
│   │       ├── vca.ts                   # Voltage-controlled amplifier (*~)
│   │       ├── envelope.ts              # 3 variants: adsr, ar, decay
│   │       ├── delay.ts                # 2 variants: simple, pingpong
│   │       └── reverb.ts               # 2 variants: schroeder, simple
│   │
│   ├── composer/                        # Song composition engine
│   │   ├── types.ts                     # SongSpec, Genre, Mood, InstrumentRole
│   │   ├── presets.ts                   # 9 genre presets (tempo, instruments, key, mood)
│   │   ├── moods.ts                     # 7 mood adjustments (cutoff, reverb, drum tone)
│   │   ├── scales.ts                    # 10 scales × 12 keys → MIDI note arrays
│   │   ├── wiring-rules.ts             # Auto-wiring: clock→seq→synth→mixer→fx
│   │   └── song-mapper.ts              # SongSpec → CreateRackInput
│   │
│   ├── controllers/                     # MIDI controller integration
│   │   ├── types.ts                     # ControllerSpec, mapping types
│   │   ├── auto-mapper.ts              # 4-phase algorithm: custom→amp→freq→round-robin
│   │   ├── pd-controller.ts            # Input controller Pd patch (ctlin → buses)
│   │   ├── pd-output-controller.ts     # Output controller Pd patch (buses → ctlout)
│   │   ├── param-injector.ts           # Inject receive buses into template patches
│   │   └── k2-deck-config.ts           # K2 LED/button config export (JSON)
│   │
│   ├── devices/                         # Hardware device profiles
│   │   ├── types.ts                     # DeviceProfile, DeviceControl, NoteTrigger
│   │   ├── index.ts                     # Device registry map + alias lookup
│   │   ├── k2.ts                        # Korg nanoKONTROL2: 34 controls
│   │   ├── microfreak.ts               # Arturia MicroFreak: 21 outputs
│   │   └── tr8s.ts                      # Roland TR-8S: 51 bidirectional
│   │
│   ├── vcv/                             # VCV Rack generator
│   │   ├── types.ts                     # Registry, spec, and JSON output types
│   │   ├── generator.ts                # Module resolution, cable wiring, JSON output
│   │   ├── positioner.ts               # Left-to-right HP layout algorithm
│   │   ├── registry.ts                 # Plugin lookup with aliases + fuzzy matching
│   │   ├── validate-vcv-params.ts      # Coerce LLM param quirks
│   │   └── registry/                    # 19 auto-generated plugin registries (~1.5MB)
│   │       ├── index.ts                 # AUTO-GENERATED: vcvPlugins Map
│   │       ├── core.ts                  # 9 modules (manual)
│   │       ├── fundamental.ts           # 35 modules
│   │       ├── bogaudio.ts              # 111 modules
│   │       ├── audibleinstruments.ts    # 20 modules (Mutable Instruments)
│   │       ├── befaco.ts                # 32 modules
│   │       ├── countmodula.ts           # 104+ modules
│   │       ├── impromptumodular.ts      # 29 modules
│   │       ├── frozenwasteland.ts       # 49 modules
│   │       ├── submarinefree.ts         # 65 modules
│   │       ├── jw-modules.ts            # 36 modules
│   │       ├── valley.ts                # 8 modules
│   │       ├── stoermelder-packone.ts   # 42 modules
│   │       ├── ml-modules.ts            # 30+ modules
│   │       ├── prism.ts                 # 12+ modules
│   │       ├── gluethegiant.ts          # 9+ modules
│   │       ├── orangeline.ts            # 20+ modules
│   │       ├── studiosixplusone.ts      # 40+ modules
│   │       ├── zzc.ts                   # 10 modules
│   │       └── vcv-recorder.ts          # 2 modules
│   │
│   ├── wiring/                          # Inter-module connections
│   │   └── bus-injector.ts             # throw~/catch~ (audio) + send/receive (control)
│   │
│   ├── network/                         # OSC/FUDI communication (zero external deps)
│   │   ├── osc-encoder.ts              # OSC 1.0 binary encoder (4-byte aligned)
│   │   ├── fudi-formatter.ts           # FUDI text formatter (Pd native protocol)
│   │   ├── udp-sender.ts               # UDP fire-and-forget (dgram)
│   │   └── tcp-sender.ts               # TCP send/receive (net)
│   │
│   └── utils/
│       └── resolve-source.ts           # File path vs raw .pd text detection
│
├── scripts/                             # Build and maintenance scripts
│   ├── build-vcv-registry.ts           # Clone C++ repos → parse → generate .ts registries
│   ├── parse-cpp-enums.ts              # Parse ParamIds/InputIds/OutputIds from C++ source
│   ├── parse-svg-width.ts              # SVG panel width → HP conversion
│   └── update-readme-stats.ts          # Auto-update README tool/test counts
│
├── tests/                               # 29 test files, 642 tests
│   ├── fixtures/                        # Sample .pd files
│   │   ├── hello-world.pd              # Minimal: osc~ → *~ → dac~
│   │   ├── midi-sequencer.pd           # 4-step sequencer with noteout
│   │   └── subpatch.pd                 # Nested canvas with inlet~/outlet~
│   └── (mirrors src/ structure)
│
├── docs/                                # Project documentation
│   ├── PRD.md                           # Product requirements
│   ├── Architecture.md                  # System design + data flows
│   ├── Rules.md                         # Code conventions + quality gates
│   ├── Plan.md                          # Roadmap + release criteria
│   └── Scaffold.md                      # This file
│
├── .claude/
│   └── skills/                          # Claude Code reference material
│       ├── mcp-server-patterns.md
│       ├── pd-file-format.md
│       ├── osc-communication.md
│       ├── pd-common-patterns.md
│       └── midi-reference.md
│
├── .github/workflows/ci.yml            # CI: test matrix + npm publish
├── package.json                         # v0.9.0, 2 runtime deps
├── tsconfig.json                        # strict, ES2022, ESM
├── tsup.config.ts                       # Single ESM entry, PACKAGE_VERSION inject
├── CLAUDE.md                            # Project instructions for Claude
├── README.md                            # Public documentation
└── LICENSE                              # MIT
```

---

## Where Does X Go?

### Adding a new MCP tool

1. **Schema**: Create `src/schemas/new-tool.ts` with Zod schema
2. **Handler**: Create `src/tools/new-tool.ts` exporting `executeNewTool(params)`
3. **Register**: In `src/index.ts`, add `server.tool("new_tool", description, schema, handler)`
4. **Tests**: Create `tests/tools/new-tool.test.ts`
5. **Docs**: Update CLAUDE.md tools section, README tool reference, and docs/PRD.md tool table

### Adding a new Pd template

1. **Template file**: Create `src/templates/new-template.ts`
   - Export a function that returns `RackableSpec` (PatchSpec + PortInfo[] + ParameterDescriptor[])
   - Accept params validated by the dispatcher
2. **Register**: In `src/templates/index.ts`:
   - Add name to `TEMPLATE_NAMES` array
   - Add case to dispatcher function
   - Add default params to validation
3. **Tests**: Add tests in `tests/templates/templates.test.ts` and `tests/templates/edge-cases.test.ts`
4. **Schema**: Update `src/schemas/template.ts` if new params needed

**Template return type**:
```typescript
interface RackableSpec {
  spec: PatchSpec;          // { nodes: NodeSpec[], connections: ConnSpec[] }
  ports: PortInfo[];        // Named I/O for inter-module wiring
  parameters?: ParameterDescriptor[];  // Controllable params for MIDI mapping
}
```

### Adding a reusable module

1. **Module file**: Create `src/templates/modules/new-module.ts`
   - Export a function returning `{ nodes, connections }` with relative indices
2. **Compose**: Use `composeModules()` from `src/templates/modules/compose.ts` to merge into a parent template with index offsetting

Only create a module if it's reused by 2+ templates. Otherwise keep it inline.

### Adding a new VCV plugin

**Automated** (preferred):
1. Add the plugin's GitHub repo URL to `scripts/build-vcv-registry.ts`
2. Run `npm run vcv:build-registry`
3. The script clones the repo, parses C++ enums, generates `src/vcv/registry/<plugin>.ts`
4. Update `src/vcv/registry/index.ts` to import and register

**Manual** (for plugins with non-standard C++ structure):
1. Create `src/vcv/registry/<plugin>.ts` exporting a `VcvPluginRegistry`
2. Add to the map in `src/vcv/registry/index.ts`

**Registry structure**:
```typescript
interface VcvPluginRegistry {
  plugin: string;           // "Fundamental"
  version: string;          // "2.6.0"
  modules: Record<string, VcvModuleDef>;  // slug → module definition
}

interface VcvModuleDef {
  name: string;             // "VCO-1"
  hp: number;               // 10
  tags: string[];            // ["Oscillator"]
  params: VcvParamDef[];    // Knobs, switches
  inputs: VcvPortDef[];     // Input jacks
  outputs: VcvPortDef[];    // Output jacks
}
```

### Adding a new MIDI device

1. **Profile**: Create `src/devices/new-device.ts` implementing `DeviceProfile`
2. **Register**: Add to the map in `src/devices/index.ts`

**Profile structure**:
```typescript
interface DeviceProfile {
  name: string;               // "launchpad-mini"
  label: string;              // "Novation Launchpad Mini"
  midiChannel: number;        // 1 (1-indexed)
  controls: DeviceControl[];  // Faders, pots, encoders, buttons
  noteTriggers?: NoteTrigger[];
  setupNotes?: string[];      // Required user-side setup
}
```

### Adding a new network protocol

1. **Encoder/Formatter**: Create `src/network/new-encoder.ts` (format messages to bytes/text)
2. **Sender**: Create `src/network/new-sender.ts` (transport using native Node APIs only)
3. **Integrate**: Update `src/tools/control.ts` to support the new protocol option
4. **Schema**: Update `src/schemas/control.ts` to add the new protocol to the enum

---

## Build Pipeline

### tsup configuration (`tsup.config.ts`)

- **Entry**: `src/index.ts` (single entry point)
- **Format**: ESM only
- **Output**: `dist/index.js` (single bundled file, ~1.4MB including VCV registries)
- **DTS**: Generates `dist/index.d.ts`
- **Clean**: Clears `dist/` before each build
- **Define**: `PACKAGE_VERSION` injected from `package.json` at build time

### TypeScript configuration (`tsconfig.json`)

- Target: ES2022
- Module: ESNext
- Module resolution: bundler
- Strict: true
- Output: `dist/` (declaration + sourceMap)
- Excludes: `node_modules`, `dist`, `tests`

---

## Script Reference

| Script | Command | Purpose | When to use |
|--------|---------|---------|-------------|
| `build` | `tsup` | Bundle to single ESM file | Before publishing, after code changes |
| `dev` | `tsup --watch` | Rebuild on file changes | During active development |
| `test` | `vitest run` | Run all 642 tests | Before commit, in CI |
| `test:watch` | `vitest` | Interactive test runner | During TDD |
| `lint` | `tsc --noEmit` | TypeScript type checking | Before commit, in CI |
| `inspect` | `npx @modelcontextprotocol/inspector node dist/index.js` | Test MCP server interactively | Manual tool testing |
| `vcv:build-registry` | `tsx scripts/build-vcv-registry.ts` | Regenerate VCV plugin registries from C++ | When adding new VCV plugins |
| `update-stats` | `tsx scripts/update-readme-stats.ts` | Auto-update README tool/test counts | Before release |
