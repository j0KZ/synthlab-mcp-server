# Plan — synthlab-mcp-server

## Current Status

**Version**: 0.9.0
**Published**: npm (`npx synthlab-mcp-server`)
**Tests**: 642 across 29 files
**Tools**: 10 + 1 prompt

---

## Completed Phases

### Phase 1: Core Parser + Serializer (MVP)
- .pd text → PdPatch AST (`src/core/parser.ts`)
- AST → .pd text (`src/core/serializer.ts`)
- Round-trip fidelity: parse → serialize → parse = identical
- Type system: PdPatch, PdCanvas, PdNode, PdConnection
- Tools: `parse_patch`, `generate_patch`

### Phase 2: Analysis + Validation
- Object registry: ~95 Pd-vanilla objects with inlet/outlet/audio metadata
- Validator: 8 structural checks (connections, orphans, unknown objects, DSP sinks)
- Analyzer: object counts by category, signal flow graph, DSP chain detection, complexity scoring
- Tools: `validate_patch`, `analyze_patch`

### Phase 3: Template Engine
- 11 parameterized templates: synth, sequencer, drum-machine, reverb, mixer, clock, chaos, maths, turing-machine, granular, bridge
- Reusable modules: oscillator (4 variants), filter (5), vca, envelope (3), delay (2), reverb (2)
- PortInfo system for inter-module wiring
- ParameterDescriptor system for controller mapping
- Tool: `create_from_template`

### Phase 4: Live Control
- OSC 1.0 binary encoder (native dgram, zero external deps)
- FUDI text formatter (native net)
- UDP fire-and-forget sender, TCP send/receive
- Bridge template for Pd-side OSC/FUDI reception
- Tool: `send_message`

### Phase 5: Rack Builder + Wiring
- Multi-module rack assembly (individual .pd files + combined _rack.pd)
- Audio buses: throw~/catch~ (signal rate)
- Control buses: send/receive (message rate)
- Automatic bus naming from module + port names
- Tool: `create_rack`

### Phase 6: MIDI Controller Integration
- 3 device profiles: K2 (34 controls), MicroFreak (21 outputs), TR-8S (51 bidirectional)
- 4-phase auto-mapping algorithm (custom → amplitude → frequency → round-robin)
- Input controller patch generation (ctlin → parameter buses)
- Output controller patch generation (ctlout feedback for LED/motor)
- K2 LED configuration export (JSON for K2Deck)
- Parameter injection into template patches

### Phase 7: Song Composer
- 9 genre presets: ambient, techno, house, dnb, experimental, idm, minimal, drone, noise
- 7 mood adjustments: dark, bright, aggressive, chill, ethereal, melancholic, energetic
- 10 musical scales × 12 keys
- Auto-wiring rules: clock → sequencer → synth → mixer → effects
- Song mapper: SongSpec → CreateRackInput
- Tool: `compose_patch`, Prompt: `song_analysis`

### Phase 8: VCV Rack Generator (initial)
- .vcv JSON v1 format generation (VCV Rack 2.x compatible)
- Initial plugin registries: Core, Fundamental, AudibleInstruments, Befaco, Bogaudio
- Fuzzy port/param resolution (by label, name, partial match, ID)
- HP-based left-to-right module positioning
- Cable color cycling (5-color palette)
- Tools: `list_vcv_modules`, `generate_vcv`

### Phase 9: VCV Expansion
- C++ scraper: `scripts/build-vcv-registry.ts` (clone repos → parse enums → generate .ts)
- C++ enum parser: `scripts/parse-cpp-enums.ts` (ParamIds, InputIds, OutputIds)
- SVG panel parser: `scripts/parse-svg-width.ts` (width → HP)
- 19 total plugins, ~600 modules:
  Core, Fundamental, AudibleInstruments, Befaco, Bogaudio, CountModula, ImpromptuModular, Valley, Stoermelder PackOne, ML Modules, VCV Recorder, Prism, GlueTheGiant, OrangeLine, StudioSixPlusOne, FrozenWasteland, JW-Modules, SubmarineFree, ZZC

### Phase 10: CI/CD + Polish
- GitHub Actions: Node 18/20/22 matrix tests
- npm publish on `v*` tags with provenance
- README with badges, architecture diagram, tool reference
- `npx synthlab-mcp-server` works out of the box
- `npm run update-stats` auto-updates README counts

---

## v1.0 Release Criteria

| Criterion | Status |
|-----------|--------|
| Stable API (no breaking tool schema changes) | In progress |
| All 10 tools documented with examples | Partial (README covers all, but no per-tool example files) |
| 700+ tests | 642 currently — need ~60 more |
| Performance benchmarks documented | Not started |
| `npx synthlab-mcp-server` works OOTB | Met |
| Documentation suite complete (PRD, Architecture, Rules, Plan, Scaffold) | In progress |

---

## Future Roadmap (post v1.0)

### Near-term
- **More VCV plugins**: Community-contributed registries via the C++ scraper pipeline
- **More MIDI controllers**: Add profiles for common hardware (Launchpad, Push, etc.)
- **Per-tool example files**: `examples/` directory with usage walkthroughs

### Mid-term
- **Pd external support**: `[declare -path]` and `[declare -lib]` for loading externals
- **Audio file integration**: `soundfiler`, `tabwrite~`, `tabread4~` for sample-based workflows
- **Patch preview/visualization**: ASCII or SVG rendering of signal flow graphs

### Long-term
- **Multi-patch project management**: Manage sets of related patches (e.g. a full live performance)
- **Web UI**: Browser-based patch preview and editing
- **Bidirectional sync**: Modify patches in Pd, reflect changes back through MCP

---

## Technical Debt

| Item | Severity | Notes |
|------|----------|-------|
| Validator check 8 gap | Low | Checks numbered 1-7 + 9, check 8 was skipped. Cosmetic only — no functional impact. |
| VCV registry staleness | Low | Upstream C++ changes may add/remove ports. Re-run `npm run vcv:build-registry` periodically. |
| Some templates lack granular edge-case tests | Low | drum-machine and granular have fewer edge cases tested than synth/sequencer. |
