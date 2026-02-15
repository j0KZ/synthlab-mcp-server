# Rules — synthlab-mcp-server

## TypeScript

- **Strict mode**: `"strict": true` in tsconfig.json. No `any`.
- **Module system**: ESM (`"type": "module"` in package.json, `"module": "ESNext"` in tsconfig)
- **Target**: ES2022
- **Module resolution**: `"bundler"` (tsup handles)
- **Imports**: Use `.js` extensions in import paths (ESM requirement, tsup resolves to .ts)

## Error Handling

Every MCP tool handler follows this pattern — no exceptions:

```typescript
async (params) => {
  try {
    const result = await executeToolName(params);
    return { content: [{ type: "text", text: result }] };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error doing X: ${msg}` }],
      isError: true,
    };
  }
}
```

- Tools **never** throw uncaught errors
- Tools **always** return `{ content, isError? }` — even on failure
- Error messages include the tool context ("Error parsing patch:", "Error generating VCV:")

## Input Validation

- **All tool inputs** validated with Zod schemas in `src/schemas/`
- **Coercion at boundaries**: LLMs send inconsistent types. Schemas handle:
  - String → number coercion (`"440"` → `440`)
  - Case normalization (`"BD"` → `"bd"`, `"C3"` → validated)
  - Default values for optional params
  - Enum validation with helpful error messages
- **Never trust LLM input** past the schema boundary — core logic receives clean typed data

## Testing

### Requirements

- **Parser**: Round-trip tests required (`parse → serialize → parse` = identical AST)
- **Templates**: Every template must produce valid .pd output that passes validation
- **Edge cases**: Test boundary params (0, max, negative, missing, wrong type) — see `tests/templates/edge-cases.test.ts` (106 tests)
- **VCV registry**: Every plugin registry must have at least one module test + fuzzy resolution tests
- **New features**: Tests required before merge. No exceptions.

### Current threshold

- **642 tests** across 29 test files
- Test runner: Vitest (`npm test`)
- Fixture patches: `tests/fixtures/` (hello-world.pd, midi-sequencer.pd, subpatch.pd)

### Test structure

Tests are organized by feature area, generally following `src/` structure. Core tests live at `tests/` root:
```
tests/
├── parser.test.ts           → src/core/parser.ts
├── serializer.test.ts       → src/core/serializer.ts
├── validator.test.ts        → src/core/validator.ts
├── object-registry.test.ts  → src/core/object-registry.ts
├── analyze.test.ts          → src/tools/analyze.ts
├── templates/               → src/templates/
├── tools/                   → src/tools/
├── vcv/                     → src/vcv/
├── network/                 → src/network/
├── controllers/             → src/controllers/
├── wiring/                  → src/wiring/
├── composer/                → src/composer/
├── utils/                   → src/utils/
├── scripts/                 → scripts/
└── fixtures/                → sample .pd files
```

> **Note**: Core parser/serializer/validator tests live at `tests/` root (not `tests/core/`). Schema validation is tested indirectly through tool tests. Device profiles are tested via controller tests.

## Naming Conventions

| Entity | Convention | Examples |
|--------|-----------|----------|
| Files | kebab-case | `drum-machine.ts`, `bus-injector.ts`, `auto-mapper.ts` |
| Types / Interfaces | PascalCase | `PdPatch`, `RackModuleSpec`, `PortInfo`, `DeviceProfile` |
| Functions | camelCase | `parsePd`, `buildPatch`, `resolveSource` |
| Tool handlers | camelCase with `execute` prefix | `executeParsePatch`, `executeCreateRack` |
| MCP tool names | snake_case | `parse_patch`, `create_rack`, `list_vcv_modules` |
| Template names | kebab-case strings | `"drum-machine"`, `"turing-machine"`, `"granular"` |
| VCV plugin keys | lowercase with hyphens | `"stoermelder-packone"`, `"jw-modules"` |
| Bus names | module-name + port-name | `"synth_0_audio"`, `"clock_0_beat_div1"` |

## Pure Data Format Rules

- **Pd-vanilla only**: No externals unless the user explicitly requests them. The object registry (`src/core/object-registry.ts`) contains ~95 vanilla objects.
- **Compatibility**: Pd 0.54+ (required for `oscformat`/`oscparse`)
- **Coordinate system**: Pixels, origin top-left. Default layout uses grid (50px column spacing, 30px row spacing).
- **Object indexing**: 0-based, order of appearance in the canvas.
- **Line format**: `#X obj x y name args...;` (semicolon-terminated, one statement per line)
- **Connections**: `#X connect fromNode fromOutlet toNode toInlet;` — always after all objects
- **Message boxes**: Use `\,` for multi-segment messages (escaped comma)

## Git & CI/CD

### Commits

- **Conventional commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Keep subject line under 72 characters
- Body explains "why", not "what"

### CI Pipeline (GitHub Actions)

- **Test matrix**: Node.js 18, 20, 22 on ubuntu-latest
- **Steps**: checkout → setup → `npm ci` → `npm run build` → `npm run lint` → `npm test`
- **Publish**: On `v*` tags only, Node 22, `npm publish --provenance --access public`
- **CI must pass** before merge. No exceptions.

### Pre-push checklist

```bash
npm run build    # tsup bundle
npm run lint     # tsc --noEmit
npm test         # vitest (642+ tests must pass)
```

## Dependencies

- **Runtime**: Exactly 2 — `@modelcontextprotocol/sdk`, `zod`
- **Network**: Native Node.js only (`dgram` for UDP, `net` for TCP). No `osc-js` or other network libs.
- **Dev**: `typescript`, `vitest`, `tsup`, `tsx`, `@types/node`, `@vitest/coverage-v8`
- **Adding deps**: Justify why native Node or existing code can't do it. Prefer zero-dep solutions.

## File Organization Rules

### When to create a new file vs extend existing

- **New MCP tool**: Always new handler in `src/tools/` + new schema in `src/schemas/` + register in `src/index.ts`
- **New template**: Always new file in `src/templates/` + register in `src/templates/index.ts`
- **New reusable module**: Add to `src/templates/modules/` only if used by 2+ templates
- **New VCV plugin**: New file in `src/vcv/registry/` + add to map in `src/vcv/registry/index.ts`
- **New MIDI device**: New file in `src/devices/` + add to map in `src/devices/index.ts`
- **Utility function**: Add to existing utils file if related. New file in `src/utils/` only if truly independent.

### What NOT to do

- Don't put business logic in `src/index.ts` — it's only for tool registration
- Don't put Zod schemas in tool handlers — they go in `src/schemas/`
- Don't import from `src/tools/` in core modules — tools depend on core, not vice versa
- Don't add external network dependencies — use native dgram/net
