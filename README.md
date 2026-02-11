# puredata-mcp

**MCP Server for Pure Data** — Parse, generate, analyze, and control Pd patches through AI.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-blueviolet)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-91%2F91-brightgreen)]()

---

## What is this?

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that gives AI assistants deep understanding of [Pure Data](https://puredata.info/) patches. Instead of treating `.pd` files as opaque text, this server parses them into a structured AST, enabling Claude to:

- **Read** any `.pd` file and explain its signal flow in plain language
- **Generate** valid patches from natural language descriptions
- **Analyze** patches for broken connections, orphan objects, and complexity metrics
- **Control** running Pd instances via OSC/FUDI in real-time

> *"Create a 16-step MIDI sequencer at 120 BPM"* → valid `.pd` file that opens in Pure Data

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Claude / AI Client                │
└──────────────────────┬──────────────────────────────┘
                       │ MCP (stdio)
┌──────────────────────▼──────────────────────────────┐
│              puredata-mcp-server                     │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ parse_patch  │  │generate_patch│  │  analyze /  │  │
│  │             │  │              │  │  validate   │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘  │
│         │                │                │          │
│  ┌──────▼────────────────▼────────────────▼──────┐  │
│  │                  Core Engine                   │  │
│  │  ┌──────────┐  ┌────────────┐  ┌───────────┐  │  │
│  │  │  Parser  │  │ Serializer │  │ Validator  │  │  │
│  │  │ .pd→AST  │  │  AST→.pd   │  │  Checks   │  │  │
│  │  └──────────┘  └────────────┘  └───────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │           Pd Object Registry                  │   │
│  │   ~100 vanilla objects · inlet/outlet metadata│   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
                       │ OSC / FUDI (planned)
┌──────────────────────▼──────────────────────────────┐
│               Pure Data Instance                     │
│          (running patch with netreceive)             │
└─────────────────────────────────────────────────────┘
```

---

## Features

### Parser — Full AST from `.pd` files
Parses Pure Data's text-based format into a typed Abstract Syntax Tree with support for:
- Objects, messages, number boxes, symbol atoms, comments
- Nested subpatches (recursive canvas stack)
- All connection types (signal and control)
- Escaped semicolons, multi-line statements
- Round-trip fidelity (parse → serialize → parse = identical structure)

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
Categorized database of ~95 Pd-vanilla objects across math, MIDI, time, audio, control, data, GUI, and subpatch categories. Each entry includes inlet/outlet counts (with variable-count support for objects like `select`, `pack`, `trigger`), aliases, and signal type classification. Used for validation, analysis, and object discovery.

### Patch Validator — Structural integrity checks
Detects 9 categories of issues across your patch:
- **Broken connections** — source/target node doesn't exist, outlet/inlet index out of bounds
- **Duplicate connections** — same wire appearing twice (usually a mistake)
- **Unknown objects** — not in the Pd-vanilla registry (possible external or typo)
- **Orphan objects** — no connections at all (with smart exceptions for wireless, GUI, data objects)
- **Empty subpatches** — subpatch with zero nodes
- **Missing DSP sink** — audio objects exist but no `dac~`, `writesf~`, etc.

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

> *"Generate a Pure Data patch with a 440Hz oscillator going through a low-pass filter to dac~"*

---

## MCP Tools

### `parse_patch`

Parse a `.pd` file and return a structured description of its contents.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `string` | File path to a `.pd` file, or raw `.pd` text |

**Output**: Structured markdown with objects, connections, signal flow, and comments.

**Example prompt**: *"What does this patch do?"*

### `generate_patch`

Generate a valid `.pd` file from a JSON specification.

| Parameter | Type | Description |
|-----------|------|-------------|
| `title` | `string?` | Comment at the top of the patch |
| `nodes` | `array` | Objects, messages, and other elements |
| `connections` | `array` | Wiring between nodes |
| `outputPath` | `string?` | Write to file (optional) |

**Example prompt**: *"Create a 4-voice polysynth with ADSR envelopes"*

### `validate_patch`

Validate a `.pd` file for structural issues.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `string` | File path to a `.pd` file, or raw `.pd` text |

**Output**: Validation report with errors, warnings, and info grouped by severity.

**Checks**: Broken connections, out-of-bounds inlets/outlets, duplicate wires, unknown objects, orphan nodes, empty subpatches, missing DSP sinks.

**Example prompt**: *"Validate my patch and tell me what's broken"*

### `analyze_patch`

Analyze a `.pd` file for object counts, signal flow, DSP chains, and complexity.

| Parameter | Type | Description |
|-----------|------|-------------|
| `source` | `string` | File path to a `.pd` file, or raw `.pd` text |

**Output**: Full analysis report — object counts by category, topological signal flow, detected audio chains, complexity score (0-100), and validation results.

**Example prompt**: *"Analyze this patch — how complex is it and what's the signal flow?"*

### Planned tools (Phase 3-5)
| Tool | Purpose |
|------|---------|
| `create_from_template` | Generate from parameterized templates (synth, sequencer, etc.) |
| `send_message` | OSC/FUDI messages to a running Pd instance |

---

## `.pd` File Format

Pure Data uses a plain-text, line-based format:

```
#N canvas 0 50 800 600 12;           ← Canvas (window)
#X obj 50 50 osc~ 440;              ← Object with arguments
#X obj 50 100 *~ 0.1;               ← Audio multiply
#X obj 50 150 dac~;                  ← Output to speakers
#X connect 0 0 1 0;                  ← osc~ outlet 0 → *~ inlet 0
#X connect 1 0 2 0;                  ← *~ → dac~ left channel
#X connect 1 0 2 1;                  ← *~ → dac~ right channel
```

The parser handles the full syntax: subpatches (`#N canvas` ... `#X restore`), arrays (`#A`), GUI objects, escaped semicolons, and more.

---

## Project Structure

```
src/
├── index.ts              # MCP server entry — 4 tools registered, stdio transport
├── types.ts              # PdPatch, PdCanvas, PdNode, PdConnection interfaces
├── constants.ts          # Format constants, layout defaults
├── core/
│   ├── parser.ts         # .pd text → AST (statement splitter, canvas stack)
│   ├── serializer.ts     # AST → .pd text + buildPatch() from spec
│   ├── object-registry.ts # ~95 Pd-vanilla objects with port counts + aliases
│   └── validator.ts      # 9 structural checks (broken connections, orphans, etc.)
├── schemas/
│   ├── patch.ts          # Zod schemas for parse/generate tools
│   └── analyze.ts        # Zod schemas for validate/analyze tools
├── tools/
│   ├── parse.ts          # parse_patch tool
│   ├── generate.ts       # generate_patch tool
│   ├── validate.ts       # validate_patch tool
│   └── analyze.ts        # analyze_patch tool (signal flow, DSP chains, complexity)
└── utils/
    └── resolve-source.ts # Shared file-path vs raw-text resolver

tests/
├── parser.test.ts           # 12 tests — parsing objects, connections, subpatches
├── serializer.test.ts       # 5 tests — round-trip fidelity, spec builder
├── object-registry.test.ts  # 37 tests — port counts, aliases, variable objects
├── validator.test.ts        # 20 tests — each check type + fixture validation
├── analyze.test.ts          # 17 tests — counts, flow, DSP chains, complexity
└── fixtures/
    ├── hello-world.pd       # Minimal: osc~ → *~ → dac~
    ├── midi-sequencer.pd    # 4-step sequencer with noteout
    ├── subpatch.pd          # Nested canvas with inlet~/outlet~
    ├── broken-connections.pd # Invalid connections for validator testing
    ├── orphan-objects.pd    # Disconnected objects for orphan detection
    └── complex-patch.pd     # Multi-chain audio + control + subpatch
```

---

## Development

```bash
npm run build        # Compile with tsup (ESM + declarations)
npm run dev          # Watch mode
npm run test         # Run vitest (91 tests)
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
| **Vitest** | Test runner |
| **tsup** | Bundler (ESM output) |
| **Node.js `dgram`/`net`** | OSC/FUDI communication (planned, zero external deps) |

---

## Roadmap

- [x] **Phase 1**: Core parser + serializer + MCP scaffold
- [x] **Phase 2**: Patch analysis + validation (object registry, signal flow, DSP chains, complexity scoring)
- [ ] **Phase 3**: Patch templates (synth, sequencer, delay, reverb, mixer)
- [ ] **Phase 4**: Live control via OSC/FUDI (send messages to running Pd)
- [ ] **Phase 5**: npm publish (`npx puredata-mcp-server`) + CI/CD

---

## Why this project?

Pure Data is a powerful visual programming language for audio, but its file format is opaque and undocumented for tooling. By building a proper parser and MCP integration, AI assistants can:

1. **Lower the barrier** — Generate patches from natural language instead of manual wiring
2. **Debug faster** — Analyze signal flow and find broken connections automatically
3. **Bridge worlds** — Connect Pd's audio engine to AI through OSC for real-time control

This fills a gap: no existing MCP server provides full `.pd` file understanding with AST-level parsing and generation.

---

## License

MIT
