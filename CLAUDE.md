# synthlab-mcp-server

## Project Overview
MCP server that turns Claude into a synthesis workstation — compose songs, generate Pure Data & VCV Rack patches, map MIDI controllers, and control live synths. Targets Pd-vanilla compatible patches with focus on MIDI workflows.

## Architecture
- **Runtime**: Node.js (TypeScript), ES2022 target, ESM modules
- **MCP SDK**: `@modelcontextprotocol/sdk` with stdio transport
- **Communication with Pd**: OSC (native `dgram`) and FUDI (native `net`) — zero external network deps
- **Patch parsing**: Custom parser for .pd text format (`src/core/parser.ts`)
- **VCV Rack**: Registry of 19 plugins (~600 modules) auto-scraped from C++ source

## Directory Structure
```
synthlab-mcp-server/
├── src/
│   ├── index.ts              # MCP server entry — 10 tools + 1 prompt
│   ├── types.ts              # PdPatch, PdCanvas, PdNode, PdConnection
│   ├── constants.ts          # Format constants, layout defaults
│   ├── core/
│   │   ├── parser.ts         # .pd text → AST
│   │   ├── serializer.ts     # AST → .pd text + buildPatch()
│   │   ├── object-registry.ts # ~95 Pd-vanilla objects with port counts
│   │   └── validator.ts      # 8 structural checks
│   ├── schemas/              # 7 Zod input validation schemas
│   ├── tools/                # 10 MCP tool handlers
│   │   ├── parse.ts          # parse_patch
│   │   ├── generate.ts       # generate_patch
│   │   ├── validate.ts       # validate_patch
│   │   ├── analyze.ts        # analyze_patch
│   │   ├── template.ts       # create_from_template
│   │   ├── rack.ts           # create_rack
│   │   ├── control.ts        # send_message
│   │   ├── list-vcv.ts       # list_vcv_modules
│   │   ├── vcv.ts            # generate_vcv
│   │   └── compose.ts        # compose_patch
│   ├── templates/            # 11 parameterized instruments
│   │   ├── index.ts          # Template registry + dispatcher
│   │   ├── modules/          # Reusable: oscillator, filter, vca, envelope, delay, reverb
│   │   └── (synth|sequencer|drum-machine|reverb|mixer|clock|chaos|maths|turing-machine|granular|bridge).ts
│   ├── composer/             # Song composition engine
│   │   ├── presets.ts        # 9 genre presets
│   │   ├── moods.ts          # 7 mood adjustments
│   │   ├── scales.ts         # 10 scales × 12 keys
│   │   ├── wiring-rules.ts   # Auto-wiring (clock→seq/drums→synth→mixer→fx)
│   │   └── song-mapper.ts    # SongSpec → CreateRackInput
│   ├── controllers/          # MIDI controller integration
│   │   ├── auto-mapper.ts    # 4-phase auto-mapping
│   │   ├── pd-controller.ts  # Input controller patch
│   │   ├── pd-output-controller.ts
│   │   ├── param-injector.ts # Parameter bus injection
│   │   └── k2-deck-config.ts # K2 LED config (JSON)
│   ├── devices/              # Hardware profiles: k2, microfreak, tr8s
│   ├── vcv/                  # VCV Rack generator
│   │   ├── generator.ts      # Module resolution + cable wiring
│   │   ├── positioner.ts     # Left-to-right HP layout
│   │   ├── registry.ts       # Plugin lookup + fuzzy matching
│   │   └── registry/         # 19 auto-generated plugin registries
│   ├── wiring/
│   │   └── bus-injector.ts   # throw~/catch~ (audio), send/receive (control)
│   └── network/              # Zero external deps
│       ├── osc-encoder.ts    # OSC 1.0 binary encoder (dgram)
│       ├── fudi-formatter.ts # FUDI text formatter
│       ├── udp-sender.ts     # UDP fire-and-forget
│       └── tcp-sender.ts     # TCP send/receive
├── scripts/
│   ├── build-vcv-registry.ts # Clone repos → parse C++ → generate .ts
│   ├── parse-cpp-enums.ts    # C++ enum parser
│   ├── parse-svg-width.ts    # SVG panel → HP conversion
│   └── update-readme-stats.ts
├── tests/                    # 34 test files, 741 tests
├── docs/                     # PRD, Architecture, Rules, Plan, Scaffold
├── .github/workflows/ci.yml  # Node 18/20/22 matrix + npm publish
├── package.json
├── tsconfig.json
└── CLAUDE.md
```

## MCP Tools Exposed (10 tools + 1 prompt)

### `parse_patch`
- Input: file path or raw .pd text
- Output: structured AST (canvases, objects, connections)
- Use: "What does this patch do?"

### `generate_patch`
- Input: JSON spec (title, nodes, connections, outputPath)
- Output: valid .pd file content
- Use: "Create a 16-step MIDI sequencer"

### `validate_patch`
- Input: file path or raw .pd text
- Output: warnings (broken connections, orphans, unknown objects, missing DSP sinks)
- Use: "Check if my patch has issues"

### `analyze_patch`
- Input: file path or raw .pd text
- Output: object counts, signal flow graph, DSP chains, complexity score
- Use: "What's the signal chain?" / "Why is there no output?"

### `create_from_template`
- Input: template name + params + optional outputPath
- Templates: synth, sequencer, drum-machine, reverb, mixer, clock, chaos, maths, turing-machine, granular, bridge
- Drum-machine: 808-style synthesis, 5 voices (BD/SN/CH/OH/CP), 16-step patterns, morphX/Y, tap tempo, clock_in/clock_out, OH/CH choke
- Use: "Make me a drum machine with 5 voices at 130 BPM"

### `create_rack`
- Input: array of module specs + wiring + controller config + optional outputDir
- Output: individual .pd files + combined _rack.pd + controller files
- Use: "Create a rack with clock, sequencer, synth, reverb, and mixer"

### `send_message`
- Input: protocol (osc/fudi), host, port, address, args
- Output: confirmation
- Requires: bridge patch in Pd (use `create_from_template` with 'bridge')
- Use: "Set tempo to 140 BPM" / "Send note C4"

### `list_vcv_modules`
- Input: plugin name, optional module slug
- Output: module list with HP, tags, port/param names
- Use: "What modules does Bogaudio have?"

### `generate_vcv`
- Input: module specs + cable specs + optional outputPath
- Output: valid .vcv file content
- Plugins: Core, Fundamental, AudibleInstruments, Befaco, Bogaudio, CountModula, ImpromptuModular, Valley, Stoermelder, ML Modules, VCV Recorder, Prism, GlueTheGiant, OrangeLine, StudioSixPlusOne, FrozenWasteland, JW-Modules, SubmarineFree, ZZC
- Use: "Create a VCV patch with VCO → VCF → VCA"

### `compose_patch`
- Input: genre, mood, tempo, key, instruments, effects, controller
- Output: complete multi-module rack with wiring
- Genres: ambient, techno, house, dnb, experimental, idm, minimal, drone, noise
- Use: "Compose a dark techno track with drums, bass, and arpeggio"

### Prompt: `song_analysis`
- Guided conversation to design a song — asks about genre, mood, tempo, key, instruments, effects, controller

## .pd File Format Reference
- Plain text, line-based
- Lines start with `#N` (canvas), `#X` (object/message/connection), `#A` (array data)
- Object: `#X obj <x> <y> <name> [args...];`
- Message: `#X msg <x> <y> <content>;`
- Connection: `#X connect <src_obj> <src_outlet> <dst_obj> <dst_inlet>;`
- Coordinates are in pixels, origin top-left
- Objects indexed by order of appearance (0-based)

## Code Conventions
- TypeScript strict mode, no `any`
- Error handling: every tool returns structured errors, never throws uncaught
- All .pd output must be validated against parser before returning
- Tests required for parser/writer (round-trip: parse → write → parse must be identical)
- Use Zod for input validation on tool parameters
- Naming: files kebab-case, types PascalCase, functions camelCase, tools snake_case

## Key Constraints
- Target Pd-vanilla objects only (no externals) unless user specifies
- Generated patches must open cleanly in Pd 0.54+
- OSC communication assumes localhost unless configured
- Default OSC port: 9000 (send to Pd), 9001 (receive from Pd)
- MIDI note numbers: 0-127, middle C = 60

## Development Commands
```bash
npm run build          # Bundle with tsup (single-file ESM)
npm run dev            # Watch mode
npm run test           # Run vitest (741 tests)
npm run lint           # TypeScript type-check (tsc --noEmit)
npm run inspect        # Test MCP server with inspector
npm run vcv:build-registry  # Scrape C++ repos → generate VCV registries
npm run update-stats   # Auto-update README tool/test counts
```

## Dependencies
```
@modelcontextprotocol/sdk  # MCP protocol (runtime)
zod                        # Input validation (runtime)
# Network: native Node.js dgram + net — zero external deps
```

## Common Pd Object Categories (for reference)
- **Math**: +, -, *, /, mod, abs, pow, sqrt, exp, log
- **MIDI**: notein, noteout, ctlin, ctlout, bendin, bendout, pgmin, pgmout
- **Time**: metro, delay, timer, realtime, pipe
- **Audio**: osc~, phasor~, noise~, lop~, hip~, bp~, dac~, adc~
- **Control**: bang, toggle, number, slider, select, route, pack, unpack
- **Data**: float, symbol, list, array, table, text
- **Network**: netsend, netreceive, oscformat, oscparse (Pd 0.54+)
