# puredata-mcp

**MCP Server for Pure Data** — Parse, generate, analyze, and control Pd patches through AI.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Protocol-blueviolet)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/Tests-17%2F17-brightgreen)]()

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
Categorized database of ~100 Pd-vanilla objects across math, MIDI, time, audio, control, data, GUI, and subpatch categories. Used for validation and object discovery.

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

### Planned tools (Phase 2-4)
| Tool | Purpose |
|------|---------|
| `analyze_patch` | Signal flow graph, DSP chain detection, complexity metrics |
| `validate_patch` | Find broken connections, orphan objects, missing externals |
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
├── index.ts              # MCP server entry — tool registration, stdio transport
├── types.ts              # PdPatch, PdCanvas, PdNode, PdConnection interfaces
├── constants.ts          # Object registry, format constants, layout defaults
├── core/
│   ├── parser.ts         # .pd text → AST (statement splitter, canvas stack)
│   └── serializer.ts     # AST → .pd text + buildPatch() from spec
├── schemas/
│   └── patch.ts          # Zod input validation for MCP tools
└── tools/
    ├── parse.ts          # parse_patch tool implementation
    └── generate.ts       # generate_patch tool implementation

tests/
├── parser.test.ts        # 12 tests — parsing objects, connections, subpatches
├── serializer.test.ts    # 5 tests — round-trip fidelity, spec builder
└── fixtures/
    ├── hello-world.pd    # Minimal: osc~ → *~ → dac~
    ├── midi-sequencer.pd # 4-step sequencer with noteout
    └── subpatch.pd       # Nested canvas with inlet~/outlet~
```

---

## Development

```bash
npm run build        # Compile with tsup (ESM + declarations)
npm run dev          # Watch mode
npm run test         # Run vitest (17 tests)
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
- [ ] **Phase 2**: Patch analysis + validation (signal flow graph, broken connection detection)
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
