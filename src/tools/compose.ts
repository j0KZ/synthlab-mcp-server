/**
 * compose_patch tool handler.
 *
 * Validates a SongSpec, maps it to a CreateRackInput via the composer,
 * then delegates to executeCreateRack() for patch generation.
 */

import type { SongSpec, Genre, Mood, InstrumentRole, NoteName, ScaleType } from "../composer/types.js";
import { GENRES, MOODS, INSTRUMENT_ROLES } from "../composer/types.js";
import { mapSongToRack } from "../composer/song-mapper.js";
import { executeCreateRack } from "./rack.js";

/**
 * Execute the compose_patch tool.
 * Validates + coerces input, maps to rack, generates Pd patches.
 */
export async function executeComposePatch(
  input: Record<string, unknown>,
): Promise<string> {
  // Validate and coerce
  const spec = validateAndCoerce(input);

  // Map SongSpec → CreateRackInput
  const rackInput = mapSongToRack(spec);

  // Delegate to existing rack builder
  const result = await executeCreateRack(rackInput);

  // Prepend composition summary
  return formatSummary(spec) + "\n\n" + result;
}

// ---------------------------------------------------------------------------
// Validation + coercion (follows validate-params.ts patterns)
// ---------------------------------------------------------------------------

function validateAndCoerce(input: Record<string, unknown>): SongSpec {
  // Genre (required)
  const genre = String(input.genre ?? "");
  if (!GENRES.includes(genre as Genre)) {
    throw new Error(
      `Invalid genre "${genre}". Valid: ${GENRES.join(", ")}`,
    );
  }

  // Tempo (optional number)
  let tempo: number | undefined;
  if (input.tempo !== undefined && input.tempo !== null) {
    tempo = Number(input.tempo);
    if (isNaN(tempo)) {
      throw new Error(`Invalid tempo "${input.tempo}". Must be a number.`);
    }
  }

  // Mood (optional string, coerce booleans)
  let mood: Mood | undefined;
  if (typeof input.mood === "boolean") {
    mood = undefined; // Coerce boolean → use genre default
  } else if (input.mood !== undefined && input.mood !== null) {
    const moodStr = String(input.mood);
    if (!MOODS.includes(moodStr as Mood)) {
      throw new Error(
        `Invalid mood "${moodStr}". Valid: ${MOODS.join(", ")}`,
      );
    }
    mood = moodStr as Mood;
  }

  // Key (optional object)
  let key: SongSpec["key"];
  if (input.key && typeof input.key === "object") {
    const k = input.key as Record<string, unknown>;
    key = {
      root: String(k.root ?? "C") as NoteName,
      scale: String(k.scale ?? "minor") as ScaleType,
    };
  }

  // Instruments (optional array, coerce empty → undefined)
  let instruments: SongSpec["instruments"];
  if (Array.isArray(input.instruments)) {
    if (input.instruments.length === 0) {
      instruments = undefined; // Empty array coercion (Claude Desktop bug)
    } else {
      instruments = (input.instruments as Record<string, unknown>[]).map((inst) => {
        const role = String(inst.role ?? "");
        if (!INSTRUMENT_ROLES.includes(role as InstrumentRole)) {
          throw new Error(
            `Invalid instrument role "${role}". Valid: ${INSTRUMENT_ROLES.join(", ")}`,
          );
        }
        return {
          role: role as InstrumentRole,
          id: inst.id ? String(inst.id) : undefined,
          template: inst.template ? String(inst.template) : undefined,
          params: inst.params as Record<string, unknown> | undefined,
        };
      });
    }
  }

  // Effects (optional array, coerce empty → undefined)
  let effects: SongSpec["effects"];
  if (Array.isArray(input.effects)) {
    if (input.effects.length === 0) {
      effects = undefined; // Empty array coercion
    } else {
      effects = input.effects.map((e) => String(e)) as ("reverb" | "granular")[];
    }
  }

  // Controller (optional object)
  let controller: SongSpec["controller"];
  if (input.controller && typeof input.controller === "object") {
    const c = input.controller as Record<string, unknown>;
    controller = {
      device: String(c.device ?? ""),
      midiChannel: c.midiChannel ? Number(c.midiChannel) : undefined,
      mappings: Array.isArray(c.mappings)
        ? (c.mappings as Record<string, unknown>[]).map((m) => ({
            control: String(m.control),
            module: String(m.module),
            parameter: String(m.parameter),
          }))
        : undefined,
    };
  }

  // OutputDir (optional string)
  const outputDir = input.outputDir ? String(input.outputDir) : undefined;

  return {
    genre: genre as Genre,
    tempo,
    mood,
    key: key as SongSpec["key"],
    instruments,
    effects,
    controller,
    outputDir,
  };
}

// ---------------------------------------------------------------------------
// Summary formatter
// ---------------------------------------------------------------------------

function formatSummary(spec: SongSpec): string {
  const lines: string[] = [
    `=== Composition Summary ===`,
    `Genre: ${spec.genre}`,
  ];
  if (spec.tempo) lines.push(`Tempo: ${spec.tempo} BPM`);
  if (spec.mood) lines.push(`Mood: ${spec.mood}`);
  if (spec.key) lines.push(`Key: ${spec.key.root} ${spec.key.scale}`);
  if (spec.instruments) {
    const roles = spec.instruments.map((i) => i.role).join(", ");
    lines.push(`Instruments: ${roles}`);
  }
  if (spec.effects) lines.push(`Effects: ${spec.effects.join(", ")}`);
  if (spec.controller) lines.push(`Controller: ${spec.controller.device}`);
  return lines.join("\n");
}
