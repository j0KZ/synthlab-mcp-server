/**
 * Auto-wiring engine — generates infrastructure modules and signal chains.
 *
 * Given expanded instrument modules + pre-computed internal wires,
 * adds infrastructure modules (clock, mixer) and effects chain,
 * returning a flat module list + all wires for executeCreateRack().
 *
 * CRITICAL: Returns a FLAT modules[] with ALL modules (clock + instruments +
 * mixer + effects). executeCreateRack() only builds modules from input.modules[].
 */

import type { ResolvedModule } from "./types.js";
import type { WireSpec } from "../wiring/bus-injector.js";
import type { RackModuleSpec } from "../tools/rack.js";

/** Templates that accept a clock_in port. */
const CLOCKED_TEMPLATES = new Set(["sequencer", "turing-machine"]);

/** Templates that produce audio output. */
const AUDIO_PRODUCERS = new Set(["synth", "drum-machine", "granular"]);

/**
 * Expand clock divisions to ensure at least `needed` unique values.
 * Each clock target needs a unique division to avoid the control bus
 * duplicate-send issue in bus-injector (multiple send nodes with same
 * bus name cause double-firing).
 */
function expandDivisions(base: number[], needed: number): number[] {
  const set = new Set(base);
  const candidates = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];
  for (const c of candidates) {
    if (set.size >= needed) break;
    set.add(c);
  }
  // Fallback: sequential integers
  let n = 1;
  while (set.size < needed) {
    set.add(n);
    n++;
  }
  return [...set];
}

/**
 * Generate the complete wiring plan: infrastructure modules + all wires.
 *
 * @param instrumentModules - Expanded instrument modules (from song-mapper)
 * @param internalWires - Pre-computed wires for multi-module pairs (seq→synth, src→granular)
 * @param effectModules - Effect modules with mood-adjusted params
 * @param clockDivisions - Genre-default clock divisions
 * @param tempo - BPM for the clock module
 * @returns Flat modules array + all wires for CreateRackInput
 */
export function generateWiringPlan(
  instrumentModules: ResolvedModule[],
  internalWires: WireSpec[],
  effectModules: ResolvedModule[],
  clockDivisions: number[],
  tempo: number,
): { modules: RackModuleSpec[]; wires: WireSpec[] } {
  const allModules: RackModuleSpec[] = [];
  const allWires: WireSpec[] = [...internalWires];

  // --- 1. Determine clock targets ---
  const clockedModules = instrumentModules.filter(
    (m) => CLOCKED_TEMPLATES.has(m.template),
  );
  const drumModules = instrumentModules.filter(
    (m) => m.template === "drum-machine",
  );

  // Count total clock targets (each needs a unique division)
  let clockTargetCount = clockedModules.length;
  for (const drum of drumModules) {
    const voices = (drum.params.voices as string[]) ?? ["bd", "sn", "hh", "cp"];
    clockTargetCount += voices.length;
  }

  const needsClock = clockTargetCount > 0;
  const clockId = "clock";

  if (needsClock && clockDivisions.length > 0) {
    const divisions = expandDivisions(clockDivisions, clockTargetCount);

    allModules.push({
      template: "clock",
      id: clockId,
      params: { tempo, divisions },
    });

    let divIdx = 0;

    // Wire clock → sequencers/turing-machines
    for (const mod of clockedModules) {
      const div = divisions[divIdx];
      allWires.push({
        from: clockId,
        output: `beat_div${div}`,
        to: mod.id,
        input: "clock_in",
      });
      divIdx++;
    }

    // Wire clock → drum triggers (one division per voice)
    for (const drum of drumModules) {
      const voices = (drum.params.voices as string[]) ?? ["bd", "sn", "hh", "cp"];
      for (const voice of voices) {
        const div = divisions[divIdx];
        allWires.push({
          from: clockId,
          output: `beat_div${div}`,
          to: drum.id,
          input: `trig_${voice}`,
        });
        divIdx++;
      }
    }
  }

  // --- 2. Add instrument modules ---
  for (const mod of instrumentModules) {
    allModules.push({
      template: mod.template,
      id: mod.id,
      params: mod.params,
    });
  }

  // --- 3. Count audio producers → create mixer ---
  const audioProducers = instrumentModules.filter(
    (m) => AUDIO_PRODUCERS.has(m.template),
  );

  // NOTE: If audioProducers.length === 0, mixer and effects are skipped entirely.
  // Effects require an audio source to process — they're meaningfully dropped
  // (e.g., user specified only "sequence" instruments + reverb).
  if (audioProducers.length > 0) {
    const mixerId = "mixer";

    allModules.push({
      template: "mixer",
      id: mixerId,
      params: { channels: audioProducers.length },
    });

    // Wire each audio producer → mixer channel
    for (let i = 0; i < audioProducers.length; i++) {
      allWires.push({
        from: audioProducers[i].id,
        output: "audio",
        to: mixerId,
        input: `ch${i + 1}`,
      });
    }

    // --- 4. Effects chain (serial: mixer → effect₁ → effect₂) ---
    if (effectModules.length > 0) {
      let prevId = mixerId;
      let prevOutput = "audio";

      for (const effect of effectModules) {
        allModules.push({
          template: effect.template,
          id: effect.id,
          params: effect.params,
        });

        allWires.push({
          from: prevId,
          output: prevOutput,
          to: effect.id,
          input: "audio_in",
        });

        prevId = effect.id;
        prevOutput = "audio";
      }
    }
  }

  return { modules: allModules, wires: allWires };
}
