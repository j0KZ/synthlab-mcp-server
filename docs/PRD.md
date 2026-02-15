# PRD — synthlab-mcp-server

## Vision

**Turn Claude into a full synthesis workstation** via Model Context Protocol.

Musicians and sound designers work with Pure Data and VCV Rack — powerful but notoriously hard to learn. This MCP server gives Claude direct tools to parse, generate, analyze, and control patches in both environments, plus map MIDI hardware and compose entire songs from genre descriptions.

**One-line pitch**: Ask Claude to build you a synthesizer, compose a techno track, or create a VCV Rack patch — and get working files you can open immediately.

## Target Users

| User | Need | How synthlab helps |
|------|------|--------------------|
| **Music producers** | Rapid prototyping of synth patches | Generate patches from natural language specs |
| **Sound designers** | Understand complex patches | Parse and analyze .pd files with signal flow graphs |
| **Creative coders** | Algorithmic/generative music | Templates for chaos, Turing machines, granular synthesis |
| **Live performers** | MIDI controller integration | Auto-map K2/MicroFreak/TR-8S to rack parameters |
| **Pd/VCV learners** | Learning by example | Generate well-structured patches from templates |

## Core Capabilities

### MCP Tools (10)

| Tool | Input | Output | Use case |
|------|-------|--------|----------|
| `parse_patch` | File path or raw .pd text | Structured AST (canvases, objects, connections) | "What does this patch do?" |
| `generate_patch` | JSON spec (nodes, connections) | Valid .pd file content | "Create a 16-step MIDI sequencer" |
| `validate_patch` | File path or raw .pd text | Warnings: broken connections, orphans, unknown objects | "Check if my patch has issues" |
| `analyze_patch` | File path or raw .pd text | Object counts, signal flow graph, DSP chains, complexity | "Why is there no output?" |
| `create_from_template` | Template name + params | Parameterized .pd patch | "Make me a drum machine at 130 BPM" |
| `create_rack` | Module specs + wiring + controller | Individual .pd files + combined rack + MIDI mapping | "Build a rack with clock, sequencer, synth, reverb" |
| `send_message` | Protocol, address, args | Confirmation | "Set tempo to 140 BPM" |
| `list_vcv_modules` | Plugin name, optional module | Module list with ports/params | "What modules does Bogaudio have?" |
| `generate_vcv` | Module specs + cable specs | Valid .vcv file content | "Create a VCV patch with VCO → VCF → VCA" |
| `compose_patch` | Genre, mood, tempo, key, instruments | Complete multi-module rack with wiring | "Compose a dark techno track" |

### Prompt (1)

| Prompt | Purpose |
|--------|---------|
| `song_analysis` | Guided Socratic conversation to gather genre/mood/tempo/key/instruments → calls `compose_patch` |

### Templates (11)

| Template | Purpose | Key Parameters |
|----------|---------|----------------|
| `synth` | Osc → Filter → VCA → DAC | waveform, filter, envelope, frequency, cutoff |
| `sequencer` | MIDI step sequencer | steps, bpm, notes, midiChannel, velocity |
| `drum-machine` | 3-layer analog drums (4 voices) | voices (bd/sn/hh/cp), tune, decay, tone |
| `reverb` | Spring/plate reverb | variant (schroeder/simple), roomSize, damping, wetDry |
| `mixer` | N-channel mixer (1-16) | channels, per-channel mute gates |
| `clock` | Master clock with divisions | bpm, divisions (e.g. [1,2,4,8]) |
| `chaos` | Logistic map chaos generator | outputs (1-3), speed, r |
| `maths` | Function generator (envelopes) | channels (1-2), rise, fall, cycle |
| `turing-machine` | Shift register sequencer | length, probability, range, offset |
| `granular` | Granular synthesis sampler | grains, grainSize, pitch, position, freeze |
| `bridge` | OSC/FUDI network receiver | protocol (osc/fudi), port, routes |

### VCV Rack Support (19 plugins, ~600 modules)

Core, Fundamental, AudibleInstruments (Mutable Instruments), Befaco, Bogaudio, CountModula, ImpromptuModular, Valley, Stoermelder PackOne, ML Modules, VCV Recorder, Prism, GlueTheGiant, OrangeLine, StudioSixPlusOne, FrozenWasteland, JW-Modules, SubmarineFree, ZZC.

Registries auto-generated from C++ source via `scripts/build-vcv-registry.ts`.

### MIDI Hardware (3 device profiles)

| Device | Controls | Behavior |
|--------|----------|----------|
| **Korg nanoKONTROL2 (K2)** | 34 (8 faders + 8 pots + 18 buttons) | Absolute, relative, trigger |
| **Arturia MicroFreak** | 21 outputs | Output (synth → Pd) |
| **Roland TR-8S** | 51 controls | Bidirectional (full duplex) |

## Platform Support

| Platform | Version |
|----------|---------|
| **Pure Data** | Pd-vanilla 0.54+ |
| **VCV Rack** | 2.x (.vcv JSON v1 format) |
| **MCP Transport** | stdio (Claude Desktop, Claude Code, Cursor) |
| **Node.js** | 18, 20, 22 |

## Non-Functional Requirements

| Requirement | Target | Status |
|-------------|--------|--------|
| Runtime dependencies | 2 (MCP SDK + Zod) | Met |
| External network dependencies | 0 (native dgram + net) | Met |
| Build time | <2s | Met (tsup ~40ms build + ~1.7s DTS) |
| Test count | 642+ | Met (642 tests, 29 files) |
| CI matrix | Node 18/20/22 on ubuntu-latest | Met |
| npm publishable | `npx synthlab-mcp-server` | Met |

## Constraints

- **Pd-vanilla only**: No externals unless user explicitly requests. All ~95 objects in registry are vanilla.
- **Localhost OSC**: Default port 9000 (send), 9001 (receive). Configurable via `send_message` params.
- **MIDI range**: Note numbers 0-127, middle C = 60, velocity 0-127, CC 0-127.
- **VCV modules**: Only modules with C++ source available for scraping. Closed-source plugins not supported.
- **File I/O**: Tools return content in response. File writing is optional (`outputPath`/`outputDir` params).
