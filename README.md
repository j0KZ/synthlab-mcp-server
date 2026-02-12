# puredata-mcp

**MCP Server for Pure Data** — Parse, generate, analyze, and control Pd patches through AI.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-blueviolet)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-396%2F396-brightgreen)]()

---

## What is this?

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that gives AI assistants deep understanding of [Pure Data](https://puredata.info/) patches. Instead of treating `.pd` files as opaque text, this server parses them into a structured AST, enabling Claude to:

- **Read** any `.pd` file and explain its signal flow in plain language
- **Generate** valid patches from natural language descriptions
- **Analyze** patches for broken connections, orphan objects, and complexity metrics
- **Template** 11 parameterized instruments (synth, sequencer, drums, reverb, bridge, etc.)
- **Rack** assemble multiple modules with inter-module wiring (Eurorack-style)
- **Control** send OSC/FUDI messages to running Pd instances in real time
- **Map** MIDI hardware (K2, MicroFreak, TR-8S) to rack parameters automatically

> *"Create a rack with clock, sequencer, synth with saw wave, reverb, and mixer — wire them together, add K2 controller"* → complete `.pd` rack that opens in Pure Data with hardware MIDI control

---

## Architecture

```
+------------------------------------------------------------------+
|                      Claude / AI Client                          |
+---------------------------+--------------------------------------+
                            | MCP (stdio)
+---------------------------v--------------------------------------+
|                   puredata-mcp-server                             |
|                                                                   |
|  +------------------+  +------------------+  +----------------+  |
|  |   parse_patch    |  |  generate_patch  |  | analyze_patch  |  |
|  |  validate_patch  |  |  send_message    |  | create_rack    |  |
|  +--------+---------+  +--------+---------+  +-------+--------+  |
|           |                     |                     |           |
|  +--------v---------------------v---------------------v--------+ |
|  |                      Core Engine                            | |
|  |  +----------+  +------------+  +-----------+  +----------+ | |
|  |  |  Parser  |  | Serializer |  | Validator |  | Registry | | |
|  |  | .pd->AST |  |  AST->.pd  |  |  Checks   |  | ~100 obj | | |
|  |  +----------+  +------------+  +-----------+  +----------+ | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  +-------------------------------------------------------------+ |
|  |           Template Engine (11 templates)                     | |
|  |  synth | seq | drums | reverb | mixer | clock | bridge       | |
|  |  chaos | maths | turing-machine | granular                   | |
|  +-----------------------------+-------------------------------+ |
|                                |                                  |
|  +-----------------------------v-------------------------------+ |
|  |              Rack Builder + Wiring                          | |
|  |  throw~/catch~ (audio) | send/receive (control)             | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  +-------------------------------------------------------------+ |
|  |           MIDI Controller System                             | |
|  |  auto-mapper | input/output controllers | device profiles    | |
|  |  K2 (abs+rel+trigger) | MicroFreak (output) | TR-8S (bidir) | |
|  +-------------------------------------------------------------+ |
|                                                                   |
|  +-------------------------------------------------------------+ |
|  |           Network Layer (zero external deps)                 | |
|  |  OSC encoder (binary) | FUDI formatter (text)                | |
|  |  UDP sender (dgram) | TCP sender (net)                       | |
|  +-------------------------------------------------------------+ |
+-------------------------------------------------------------------+
                            |
              OSC (UDP) / FUDI (TCP)
                            |
                    +-------v-------+
                    |  Pure Data    |
                    |  (running)    |
                    +---------------+
```

---

## Features

### Parser — Full AST from `.pd` files
Parses Pure Data's text-based format into a typed Abstract Syntax Tree with support for:
- Objects, messages, number boxes, symbol atoms, comments
- Nested subpatches (recursive canvas stack)
- All connection types (signal and control)
- Escaped semicolons, multi-line statements
- Round-trip fidelity (parse -> serialize -> parse = identical structure)

### Patch Generator — From JSON spec to valid `.pd`
```json
{
  "title": "Simple Sine",
  "nodes": [
    { "name": "osc~", "args": [440] },
    { "name": "*~", "args": [0.1] },
    { "name": "dac~" }
  ],
  "connections": [
    { "from": 0, "to": 1 },
    { "from": 1, "to": 2 },
    { "from": 1, "to": 2, "inlet": 1 }
  ]
}
```
Produces a `.pd` file that opens cleanly in Pure Data 0.54+.

### Object Registry
Categorized database of ~95 Pd-vanilla objects across math, MIDI, time, audio, control, data, GUI, and subpatch categories. Each entry includes inlet/outlet counts (with variable-count support for objects like `select`, `pack`, `trigger`), aliases, and signal type classification.

### Patch Validator — Structural integrity checks
Detects 9 categories of issues: broken connections, duplicate connections, unknown objects, orphan objects, empty subpatches, missing DSP sinks.

### Template Engine — 11 parameterized instruments

Modular two-tier system: **modules** (oscillator, filter, VCA, envelope, delay, reverb) compose into **templates** via `compose()` with automatic index offsetting.

| Template | Eurorack Analog | Key Parameters |
|----------|----------------|----------------|
| `synth` | Oscillator + Filter + VCA | `waveform`, `filter`, `envelope`, `frequency`, `cutoff`, `amplitude` |
| `sequencer` | Step sequencer | `steps`, `bpm`, `notes`, `midiChannel`, `velocity` |
| `drum-machine` | Analog drums | `voices` (bd/sn/hh/cp), `tune`, `decay`, `tone` |
| `reverb` | Spring/plate reverb | `variant` (schroeder/simple), `roomSize`, `damping`, `wetDry` |
| `mixer` | Mixer module | `channels` (1-16), per-channel mute gates |
| `clock` | Master clock | `bpm`, `divisions` (e.g. [1,2,4,8]) |
| `chaos` | Chaos/random CV | `outputs` (1-3), `speed`, `r` (logistic map parameter) |
| `maths` | Function generator | `channels` (1-2), `rise`, `fall`, `cycle`, `outputRange` |
| `turing-machine` | Turing Machine | `length`, `probability`, `range`, `offset` |
| `granular` | Granular sampler | `grains`, `grainSize`, `pitch`, `position`, `freeze`, `wetDry` |
| `bridge` | Network receiver | `protocol` (osc/fudi), `port`, `routes` |

### Rack Builder — Eurorack-style module assembly

Generates individual `.pd` files per module + a combined `_rack.pd` with all modules side-by-side.

**Inter-module wiring** connects modules via Pd bus objects:
- **Audio** (signal rate): `throw~` / `catch~`
- **Control** (message rate): `send` / `receive`

```json
{
  "modules": [
    { "template": "clock", "params": { "bpm": 140 }, "id": "clock" },
    { "template": "sequencer", "params": { "steps": 8 }, "id": "seq" },
    { "template": "synth", "params": { "waveform": "saw" }, "id": "synth" },
    { "template": "reverb", "id": "reverb" },
    { "template": "mixer", "params": { "channels": 2 }, "id": "mixer" }
  ],
  "wiring": [
    { "from": "clock", "output": "beat_div1", "to": "seq", "input": "clock_in" },
    { "from": "seq", "output": "note", "to": "synth", "input": "note" },
    { "from": "synth", "output": "audio", "to": "reverb", "input": "audio_in" },
    { "from": "reverb", "output": "audio", "to": "mixer", "input": "ch1" }
  ]
}
```

The wiring system handles connection redirection (no node removal), clock sync for self-clocking modules, audio fan-out, and table name deduplication.

### MIDI Controller System — Hardware integration

Auto-maps hardware controls to rack parameters. Generates `_controller.pd` (MIDI routing) and `_k2_config.json` (LED feedback).

**Three device profiles:**

| Device | Controls | Direction | Features |
|--------|----------|-----------|----------|
| **Korg nanoKONTROL2** | 34 (faders, pots, buttons) | Input | Absolute, relative (encoders), trigger/toggle |
| **Arturia MicroFreak** | 21 parameters | Output only | CC output for display sync |
| **Roland TR-8S** | 51 parameters | Bidirectional | Send + receive, LED feedback |

**Auto-mapper phases:**
1. Custom mappings (user-specified)
2. Amplitude controls → faders
3. Frequency/filter controls → pots
4. Remaining controls → relative encoders
5. Transport/toggle controls → buttons

```json
{
  "modules": [
    { "template": "synth", "params": { "waveform": "saw" }, "id": "synth" },
    { "template": "mixer", "id": "mixer" }
  ],
  "controller": {
    "device": "k2",
    "mappings": [
      { "control": "fader_0", "module": "synth", "parameter": "amplitude" }
    ]
  }
}
```

### Live Control — OSC/FUDI messaging

Send real-time control messages to a running Pd instance. Zero external dependencies — uses Node.js built-in `dgram` (UDP) and `net` (TCP).

| Protocol | Transport | Default Port | Format |
|----------|-----------|--------------|--------|
| **OSC** | UDP | 9000 | Binary (OSC 1.0 spec) |
| **FUDI** | TCP | 3000 | Text (`selector args;\n`) |

Use the `bridge` template to generate the Pd-side receiver patch:
- OSC: `[netreceive -u -b 9000]` → `[oscparse]` → `[route /pd]` → per-route `[send]`
- FUDI: `[netreceive 3000]` → `[route]` → per-route `[send]`

### Patch Analyzer — Deep structural analysis
- **Object counts** by category (audio, control, MIDI, math, etc.)
- **Signal flow graph** — adjacency list with topological sort (Kahn's algorithm), cycle detection
- **DSP chain detection** — DFS from audio sources (`osc~`, `noise~`, `adc~`) to sinks (`dac~`, `writesf~`)
- **Complexity scoring** — 0-100 weighted score based on object count, connection density, subpatch depth, audio chains, and object variety

---

## Quick Start

### 1. Clone and build

```bash
git clone https://github.com/j0KZ/mcp_pure_data.git
cd mcp_pure_data
npm install
npm run build
```

### 2. Configure Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "puredata-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/mcp_pure_data/dist/index.js"]
    }
  }
}
```

### 3. Use it

Open Claude Desktop and ask:

> *"Parse the file /path/to/my-patch.pd and explain what it does"*

> *"Create a rack with clock, sequencer, saw synth, reverb, and mixer — wire clock to sequencer, sequencer to synth, synth through reverb to mixer"*

> *"Send /pd/tempo 140 to my running Pd instance"*

---

## MCP Tools

### `parse_patch`
Parse a `.pd` file and return a structured description.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `string` | File path or raw `.pd` text |

### `generate_patch`
Generate a valid `.pd` file from a JSON specification of nodes and connections.

| Parameter | Type | Description |
|-----------|------|-------------|
| `title` | `string?` | Comment at the top |
| `nodes` | `array` | Objects, messages, atoms |
| `connections` | `array` | Wiring between nodes |
| `outputPath` | `string?` | Write to file (optional) |

### `validate_patch`
Validate structural integrity (broken connections, orphans, missing sinks).

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `string` | File path or raw `.pd` text |

### `analyze_patch`
Object counts, signal flow graph, DSP chains, complexity score.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `string` | File path or raw `.pd` text |

### `create_from_template`
Generate a patch from a parameterized template (11 available).

| Parameter | Type | Description |
|-----------|------|-------------|
| `template` | `string` | Template name (see table above) |
| `params` | `object?` | Template-specific parameters |
| `outputPath` | `string?` | Write to file (optional) |

### `create_rack`
Assemble multiple modules into a rack with inter-module wiring and MIDI controller integration.

| Parameter | Type | Description |
|-----------|------|-------------|
| `modules` | `array` | Module specs: `{ template, params?, id?, filename? }` |
| `wiring` | `array?` | Connections: `{ from, output, to, input }` |
| `controller` | `object?` | MIDI controller: `{ device, midiChannel?, mappings? }` |
| `outputDir` | `string?` | Directory to write all files |

### `send_message`
Send a control message to a running Pd instance via OSC or FUDI.

| Parameter | Type | Description |
|-----------|------|-------------|
| `protocol` | `"osc" \| "fudi"` | Transport protocol (default: `"osc"`) |
| `host` | `string?` | Target host (default: `"127.0.0.1"`) |
| `port` | `number?` | Target port (default: 9000 OSC / 3000 FUDI) |
| `address` | `string` | Message address (e.g. `/pd/tempo`) |
| `args` | `array?` | Message arguments (numbers or strings) |

---

## Project Structure

```
src/                            # ~8,500 lines
  index.ts                      # MCP server — 7 tools, stdio transport
  types.ts                      # PdPatch, PdCanvas, PdNode, PdConnection
  constants.ts                  # Format constants, layout defaults
  core/
    parser.ts                   # .pd text -> AST
    serializer.ts               # AST -> .pd text + buildPatch()
    object-registry.ts          # ~100 Pd-vanilla objects with port counts
    validator.ts                # 9 structural checks
  schemas/
    patch.ts                    # Zod schemas for parse/generate
    analyze.ts                  # Zod schemas for validate/analyze
    template.ts                 # Zod schema for create_from_template
    rack.ts                     # Zod schema for create_rack
    control.ts                  # Zod schema for send_message
  templates/
    index.ts                    # Template registry + dispatcher (11 templates)
    port-info.ts                # PortInfo, RackableSpec types for wiring
    validate-params.ts          # Runtime param validation
    synth.ts                    # Oscillator -> filter -> VCA -> dac~
    sequencer.ts                # MIDI step sequencer
    drum-machine.ts             # 4 analog drum voices (BD/SN/HH/CP)
    reverb-template.ts          # adc~ -> reverb -> wet/dry -> dac~
    mixer.ts                    # N-channel mixer with mute gates
    clock.ts                    # Master clock with divided outputs
    chaos.ts                    # Logistic map chaos generator
    maths.ts                    # Function generator (rise/fall envelopes)
    turing-machine.ts           # Shift register random sequencer
    granular.ts                 # Granular synthesis sampler
    bridge.ts                   # OSC/FUDI network receiver
    modules/
      types.ts                  # ModuleResult, ModuleWire interfaces
      compose.ts                # Module composition with index offsetting
      oscillator.ts             # 4 variants: sine, saw, square, noise
      filter.ts                 # 5 variants: lowpass, highpass, bandpass, moog, korg
      vca.ts                    # VCA module (*~)
      envelope.ts               # 3 variants: adsr, ar, decay
      delay.ts                  # 2 variants: simple, pingpong
      reverb.ts                 # 2 variants: schroeder, simple
  controllers/
    types.ts                    # ControllerMapping, DeviceProfile interfaces
    auto-mapper.ts              # 4-phase auto-mapping (custom → amp → freq → rest)
    pd-controller.ts            # Input controller patch builder
    pd-output-controller.ts     # Output controller (ctlout feedback)
    param-injector.ts           # Parameter bus injection
    k2-deck-config.ts           # K2 LED configuration generator
  devices/
    types.ts                    # DeviceProfile interface
    index.ts                    # Device registry
    k2.ts                       # Korg nanoKONTROL2 (34 controls)
    microfreak.ts               # Arturia MicroFreak (21 outputs)
    tr8s.ts                     # Roland TR-8S (51 bidirectional)
  network/
    osc-encoder.ts              # OSC 1.0 binary encoder (4-byte aligned)
    fudi-formatter.ts           # FUDI text formatter
    udp-sender.ts               # UDP fire-and-forget (dgram)
    tcp-sender.ts               # TCP send/receive (net)
  tools/
    parse.ts                    # parse_patch tool
    generate.ts                 # generate_patch tool
    validate.ts                 # validate_patch tool
    analyze.ts                  # analyze_patch tool
    template.ts                 # create_from_template tool
    rack.ts                     # create_rack + combined patch builder
    control.ts                  # send_message tool
  wiring/
    bus-injector.ts             # Inter-module wiring (throw~/catch~, send/receive)
  utils/
    resolve-source.ts           # File-path vs raw-text resolver

tests/                          # 396 tests, ~5,300 lines
  parser.test.ts                # 12 — parsing, subpatches, edge cases
  serializer.test.ts            # 8 — round-trip, spec builder, escaping
  object-registry.test.ts       # 37 — port counts, aliases, variable objects
  validator.test.ts             # 20 — each check type + fixtures
  analyze.test.ts               # 17 — counts, flow, DSP chains, complexity
  controllers/
    controller.test.ts          # 71 — auto-mapper, controller patches, device profiles
  templates/
    compose.test.ts             # 5 — module composition, wiring
    modules.test.ts             # 17 — all module variants
    templates.test.ts           # 38 — complete template round-trips
    edge-cases.test.ts          # 99 — param validation, coercion, boundaries
    bridge.test.ts              # 3 — OSC/FUDI bridge variants
  network/
    osc-encoder.test.ts         # 8 — binary encoding, padding, type inference
    fudi-formatter.test.ts      # 3 — text formatting
    control.test.ts             # 6 — mock UDP/TCP servers, end-to-end
  tools/
    rack.test.ts                # 13 — rack assembly, layout, file writing
    rack-wiring.test.ts         # 13 — wiring integration, bus injection
  wiring/
    bus-injector.test.ts        # 17 — connection helpers, validation
  fixtures/
    hello-world.pd              # Minimal: osc~ -> *~ -> dac~
    midi-sequencer.pd           # 4-step sequencer with noteout
    subpatch.pd                 # Nested canvas with inlet~/outlet~
    broken-connections.pd       # Invalid connections for validator
    orphan-objects.pd           # Disconnected objects
    complex-patch.pd            # Multi-chain audio + control + subpatch
```

---

## Development

```bash
npm run build        # Compile with tsup (ESM + declarations)
npm run dev          # Watch mode
npm run test         # Run vitest (396 tests)
npm run lint         # Type-check with tsc --noEmit
npm run inspect      # Test server with MCP Inspector
```

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **TypeScript** (strict mode) | Type-safe parser and serializer |
| **MCP SDK** (`@modelcontextprotocol/sdk`) | Protocol implementation |
| **Zod** | Runtime input validation |
| **Vitest** | Test runner (396 tests) |
| **tsup** | Bundler (ESM output) |
| **Zero runtime deps** beyond MCP SDK + Zod | OSC via `dgram`, FUDI via `net` |

---

## Roadmap

- [x] **Phase 1**: Core parser + serializer + MCP scaffold
- [x] **Phase 2**: Patch analysis + validation (object registry, signal flow, DSP chains, complexity)
- [x] **Phase 3**: Template engine — 11 parameterized instruments with modular topology
- [x] **Phase 4**: `create_from_template` tool + `create_rack` (multi-module assembly)
- [x] **Phase 5**: Inter-module wiring (throw~/catch~, send/receive, clock sync)
- [x] **Phase 7**: MIDI hardware integration (K2, MicroFreak, TR-8S controller profiles)
- [x] **Phase 8**: Live control via OSC/FUDI (`send_message` tool + `bridge` template)
- [ ] **Phase 9**: Socratic song analysis (analyze reference → generate matching patches)

---

## License

MIT
