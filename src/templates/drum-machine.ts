/**
 * TR-808 Drum Machine — all-in-one clock + 16-step sequencer + 5 voices.
 *
 * Inspired by:
 *   - Prok modular drums (X/Y morph matrix)
 *   - Robaux LL8 (16-step trigger sequencer)
 *   - Endorphins Running Order (tap tempo)
 *
 * Architecture:
 *   1. CLOCK  — metro + tap tempo + 16-step counter
 *   2. PATTERN — per-voice sel (matches step indices → trigger)
 *   3. VOICES — BD (sine sweep), SN (dual osc + noise), CH (6 metallic osc),
 *              OH (6 metallic osc, long decay), CP (noise burst)
 *   4. CHOKE  — CH trigger kills OH envelope (post-processing)
 *   5. MIX    — per-voice *~ levels → +~ summing → *~ master → dac~
 *
 * Morph X/Y (generation-time):
 *   X = pitch/tonal axis, Y = decay + brightness axis
 */

import type {
  PatchNodeSpec,
  PatchConnectionSpec,
} from "../core/serializer.js";
import type { RackableSpec, ParameterDescriptor } from "./port-info.js";
import { validateDrumMachineParams } from "./validate-params.js";

export type DrumVoice = "bd" | "sn" | "ch" | "oh" | "cp";

const ALL_VOICES: DrumVoice[] = ["bd", "sn", "ch", "oh", "cp"];

export interface DrumMachineParams {
  voices?: DrumVoice[];   // default ["bd", "sn", "ch", "oh", "cp"]
  bpm?: number;           // default 120 (0 = external clock mode)
  morphX?: number;        // 0-1 (default 0.5) — pitch axis
  morphY?: number;        // 0-1 (default 0.5) — decay+brightness axis
  amplitude?: number;     // 0-1 (default 0.7) — master volume
  // Legacy backward compat (from moods.ts / old callers)
  tune?: number;          // maps to morphX
  decay?: number;         // maps to morphY
  tone?: number;          // ignored (derived from X/Y per voice)
}

const DEFAULT_PATTERNS: Record<DrumVoice, number[]> = {
  bd: [0, 4, 8, 12],                    // four-on-the-floor
  sn: [4, 12],                           // beats 2 & 4
  ch: [0, 2, 4, 6, 8, 10, 12],          // 8ths (except where OH plays)
  oh: [14],                              // last off-beat
  cp: [8],                               // beat 3
};

const COL_SPACING = 180;
const SPACING = 30;

type AddFn = (node: PatchNodeSpec) => number;
type WireFn = (from: number, to: number, outlet?: number, inlet?: number) => void;

interface VoiceRefs {
  triggerNode: number;   // sel's last outlet (bang on match)
  ampVline: number;      // amplitude vline~ (for choke)
  levelNode: number;     // per-voice *~ level (for parameters)
  outputNode: number;    // audio output of this voice
  maxY: number;
}

// ─── Voice morph derivation ──────────────────────────────────────

interface VoiceMorph {
  tune: number;
  decay: number;
  tone: number;
}

function deriveMorph(voice: DrumVoice, x: number, y: number): VoiceMorph {
  switch (voice) {
    case "bd": return { tune: x, decay: y, tone: y * 0.7 + x * 0.3 };
    case "sn": return { tune: x, decay: y * 0.8, tone: y };
    case "ch": return { tune: 0, decay: 0.2 + y * 0.3, tone: x * 0.5 + 0.5 };
    case "oh": return { tune: 0, decay: 0.5 + y * 0.5, tone: x * 0.5 + 0.5 };
    case "cp": return { tune: 0, decay: y, tone: x * 0.5 + y * 0.5 };
  }
}

// ─── BD (Bass Drum) — 808 pure sine sweep ────────────────────────

function buildBD(
  add: AddFn, wire: WireFn, trigBang: number, x: number, startY: number,
  morph: VoiceMorph, amplitude: number,
): VoiceRefs {
  let y = startY;

  const startFreq = Math.round(300 + morph.tune * 100);  // 300-400 Hz
  const endFreq = Math.round(45 + morph.tune * 15);      // 45-60 Hz
  const pitchDecayMs = Math.round(50 + morph.tune * 30);  // 50-80ms
  const ampDecayMs = Math.round(200 + morph.decay * 300); // 200-500ms

  // Pitch envelope: start freq → end freq over pitchDecayMs
  const pitchMsg = add({
    type: "msg",
    args: [startFreq, "\\,", endFreq, pitchDecayMs],
    x, y,
  });
  wire(trigBang, pitchMsg);
  y += SPACING;

  // Amp envelope: 0 → 1 in 2ms → 0 over ampDecayMs (starting at 2ms)
  const ampMsg = add({
    type: "msg",
    args: [0, "\\,", 1, 2, "\\,", 0, ampDecayMs, 2],
    x: x + 80, y: startY,
  });
  wire(trigBang, ampMsg);

  // Pitch vline~ → osc~
  const pitchVline = add({ name: "vline~", x, y });
  wire(pitchMsg, pitchVline);
  y += SPACING;

  const osc = add({ name: "osc~", args: [endFreq], x, y });
  wire(pitchVline, osc);
  y += SPACING;

  // Amp vline~ + VCA
  const ampVline = add({ name: "vline~", x: x + 80, y: startY + SPACING });
  wire(ampMsg, ampVline);

  const vca = add({ name: "*~", x, y });
  wire(osc, vca);
  wire(ampVline, vca, 0, 1);
  y += SPACING;

  // Per-voice level
  const level = add({ name: "*~", args: [amplitude * 0.8], x, y });
  wire(vca, level);

  return { triggerNode: trigBang, ampVline, levelNode: level, outputNode: level, maxY: y };
}

// ─── SN (Snare) — dual osc + noise ──────────────────────────────

function buildSN(
  add: AddFn, wire: WireFn, trigBang: number, x: number, startY: number,
  morph: VoiceMorph, amplitude: number,
): VoiceRefs {
  let y = startY;

  const freq1 = Math.round(180 + morph.tune * 50);  // 180-230 Hz
  const freq2 = Math.round(330 + morph.tune * 50);  // 330-380 Hz
  const toneDecayMs = Math.round(50 + morph.decay * 50);   // 50-100ms
  const noiseDecayMs = Math.round(150 + morph.decay * 150); // 150-300ms
  const noiseBpFreq = Math.round(5000 + morph.tone * 3000); // 5000-8000 Hz

  // Tone amp envelope
  const toneAmpMsg = add({
    type: "msg",
    args: [0, "\\,", 0.4, 2, "\\,", 0, toneDecayMs, 2],
    x, y,
  });
  wire(trigBang, toneAmpMsg);

  // Noise amp envelope
  const noiseAmpMsg = add({
    type: "msg",
    args: [0, "\\,", 0.6, 2, "\\,", 0, noiseDecayMs, 2],
    x: x + 100, y,
  });
  wire(trigBang, noiseAmpMsg);
  y += SPACING;

  // Tone vline~
  const toneAmpVline = add({ name: "vline~", x, y });
  wire(toneAmpMsg, toneAmpVline);

  // Noise vline~
  const noiseAmpVline = add({ name: "vline~", x: x + 100, y });
  wire(noiseAmpMsg, noiseAmpVline);
  y += SPACING;

  // Oscillators
  const osc1 = add({ name: "osc~", args: [freq1], x, y });
  const osc2 = add({ name: "osc~", args: [freq2], x: x + 60, y });
  y += SPACING;

  // Mix tone oscs
  const toneMix = add({ name: "+~", x, y });
  wire(osc1, toneMix);
  wire(osc2, toneMix, 0, 1);
  y += SPACING;

  // Tone VCA
  const toneVca = add({ name: "*~", x, y });
  wire(toneMix, toneVca);
  wire(toneAmpVline, toneVca, 0, 1);

  // Noise chain
  const noise = add({ name: "noise~", x: x + 100, y: y - SPACING });
  const noiseBp = add({ name: "bp~", args: [noiseBpFreq, 2], x: x + 100, y });
  wire(noise, noiseBp);
  y += SPACING;

  // Noise VCA
  const noiseVca = add({ name: "*~", x: x + 100, y: y - SPACING });
  wire(noiseBp, noiseVca);
  wire(noiseAmpVline, noiseVca, 0, 1);

  // Mix tone + noise
  const mix = add({ name: "+~", x, y });
  wire(toneVca, mix);
  wire(noiseVca, mix, 0, 1);
  y += SPACING;

  // Per-voice level
  const level = add({ name: "*~", args: [amplitude], x, y });
  wire(mix, level);

  // Use toneAmpVline as the "main" amp for choke purposes (not applicable for SN, but consistent)
  return { triggerNode: trigBang, ampVline: toneAmpVline, levelNode: level, outputNode: level, maxY: y };
}

// ─── Metallic hat builder (shared by CH and OH) ──────────────────

const HAT_FREQS = [205, 330, 400, 450, 540, 800]; // 808 inharmonic frequencies

function buildHat(
  add: AddFn, wire: WireFn, trigBang: number, x: number, startY: number,
  morph: VoiceMorph, amplitude: number,
): VoiceRefs {
  let y = startY;

  const decayMs = Math.round(morph.decay * 1000); // derive from morph.decay directly
  const bpFreq = Math.round(5000 + morph.tone * 4000); // 5000-9000 Hz

  // Amp envelope
  const ampMsg = add({
    type: "msg",
    args: [0, "\\,", 0.7, 1, "\\,", 0, decayMs, 1],
    x: x + 100, y,
  });
  wire(trigBang, ampMsg);
  y += SPACING;

  const ampVline = add({ name: "vline~", x: x + 100, y });
  wire(ampMsg, ampVline);

  // 6 oscillators in two groups of 3
  const osc: number[] = [];
  for (let i = 0; i < 6; i++) {
    osc.push(add({ name: "osc~", args: [HAT_FREQS[i]], x: x + (i % 3) * 50, y }));
  }
  y += SPACING;

  // Sum group 1: osc[0] + osc[1] + osc[2]
  const sum1 = add({ name: "+~", x, y });
  wire(osc[0], sum1);
  wire(osc[1], sum1, 0, 1);
  const sum1b = add({ name: "+~", x, y: y + SPACING });
  wire(sum1, sum1b);
  wire(osc[2], sum1b, 0, 1);

  // Sum group 2: osc[3] + osc[4] + osc[5]
  const sum2 = add({ name: "+~", x: x + 80, y });
  wire(osc[3], sum2);
  wire(osc[4], sum2, 0, 1);
  const sum2b = add({ name: "+~", x: x + 80, y: y + SPACING });
  wire(sum2, sum2b);
  wire(osc[5], sum2b, 0, 1);
  y += SPACING * 2;

  // Combine both groups
  const allSum = add({ name: "+~", x, y });
  wire(sum1b, allSum);
  wire(sum2b, allSum, 0, 1);
  y += SPACING;

  // bp~ + hip~
  const bp = add({ name: "bp~", args: [bpFreq, 2], x, y });
  wire(allSum, bp);
  y += SPACING;

  const hip = add({ name: "hip~", args: [6000], x, y });
  wire(bp, hip);
  y += SPACING;

  // VCA
  const vca = add({ name: "*~", x, y });
  wire(hip, vca);
  wire(ampVline, vca, 0, 1);
  y += SPACING;

  // Per-voice level
  const level = add({ name: "*~", args: [amplitude], x, y });
  wire(vca, level);

  return { triggerNode: trigBang, ampVline, levelNode: level, outputNode: level, maxY: y };
}

// ─── CP (Clap) — noise burst envelope ────────────────────────────

function buildCP(
  add: AddFn, wire: WireFn, trigBang: number, x: number, startY: number,
  morph: VoiceMorph, amplitude: number,
): VoiceRefs {
  let y = startY;

  const bpFreq = Math.round(2000 + morph.tone * 1500); // 2000-3500 Hz
  const tailDecay = Math.round(100 + morph.decay * 200); // 100-300ms

  // 5-burst envelope: rapid re-triggers then tail decay
  const ampMsg = add({
    type: "msg",
    args: [
      0, "\\,",
      0.8, 1, "\\,",
      0, 4, 1, "\\,",
      0.7, 1, 5, "\\,",
      0, 4, 6, "\\,",
      0.6, 1, 10, "\\,",
      0, 4, 11, "\\,",
      0.5, 1, 15, "\\,",
      0, 4, 16, "\\,",
      0.4, 1, 20, "\\,",
      0, tailDecay, 21,
    ],
    x: x + 60, y,
  });
  wire(trigBang, ampMsg);
  y += SPACING;

  const ampVline = add({ name: "vline~", x: x + 60, y });
  wire(ampMsg, ampVline);

  // Noise source
  const noise = add({ name: "noise~", x, y });
  y += SPACING;

  // bp~ (body)
  const bp = add({ name: "bp~", args: [bpFreq, 2], x, y });
  wire(noise, bp);
  y += SPACING;

  // VCA
  const vca = add({ name: "*~", x, y });
  wire(bp, vca);
  wire(ampVline, vca, 0, 1);
  y += SPACING;

  // Per-voice level
  const level = add({ name: "*~", args: [amplitude], x, y });
  wire(vca, level);

  return { triggerNode: trigBang, ampVline, levelNode: level, outputNode: level, maxY: y };
}

// ─── Main builder ────────────────────────────────────────────────

export function buildDrumMachine(params: DrumMachineParams = {}): RackableSpec {
  validateDrumMachineParams(params as Record<string, unknown>);

  // Normalize legacy "hh" → "ch" (runtime safety — validation also does this)
  const voices: DrumVoice[] = ((params.voices as string[] | undefined) ?? [...ALL_VOICES])
    .map(v => (v === "hh" ? "ch" : v) as DrumVoice);

  const bpm = params.bpm ?? 120;
  const morphX = params.morphX ?? params.tune ?? 0.5;
  const morphY = params.morphY ?? params.decay ?? 0.5;
  const amplitude = params.amplitude ?? 0.7;

  const nodes: PatchNodeSpec[] = [];
  const connections: PatchConnectionSpec[] = [];

  const add: AddFn = (node) => {
    const idx = nodes.length;
    nodes.push(node);
    return idx;
  };
  const wire: WireFn = (from, to, outlet = 0, inlet = 0) => {
    connections.push({ from, outlet, to, inlet });
  };

  // ─── Title ──────────────────────────────────────
  add({
    type: "text",
    args: [`TR-808:`, voices.join(" ").toUpperCase(), bpm > 0 ? `${bpm}BPM` : "EXT"],
    x: 50,
    y: 10,
  });

  // ─── Counter (always built) ────────────────────
  let counterNode: number;
  let metroNode: number | undefined;
  let floatNode: number;
  let cy = 40;

  add({ type: "text", args: ["---", "Counter", "---"], x: 50, y: cy });
  cy += 20;

  floatNode = add({ name: "float", args: [-1], x: 50, y: cy });
  const plusOne = add({ name: "+", args: [1], x: 120, y: cy });
  wire(floatNode, plusOne);
  cy += SPACING;

  const modNode = add({ name: "mod", args: [16], x: 50, y: cy });
  wire(plusOne, modNode);
  wire(modNode, floatNode, 0, 1); // feedback: mod → float right inlet
  cy += SPACING;
  counterNode = modNode;

  // ─── Internal clock + tap tempo (when bpm > 0) ─
  if (bpm > 0) {
    const intervalMs = Math.round(15000 / bpm); // 16th note interval

    add({ type: "text", args: ["---", "Clock", "---"], x: 200, y: 40 });

    // Auto-start: loadbang → [1( → metro
    const loadbang = add({ name: "loadbang", x: 200, y: 60 });
    const startMsg = add({ type: "msg", args: [1], x: 200, y: 90 });
    wire(loadbang, startMsg);

    metroNode = add({ name: "metro", args: [intervalMs], x: 200, y: 120 });
    wire(startMsg, metroNode);
    wire(metroNode, floatNode); // metro drives counter

    // ── Tap tempo section ──
    const tapBng = add({ name: "bng", args: [15, 250, 50, 0, "empty", "empty", "tap", 17, 7, 0, 8, -262144, -1, -1], x: 350, y: 90 });

    // t b b: right fires first (outlet 1 → timer right inlet to measure),
    //        then left fires (outlet 0 → timer left inlet to reset)
    const trigTap = add({ name: "t", args: ["b", "b"], x: 350, y: 120 });
    wire(tapBng, trigTap);

    const timer = add({ name: "timer", x: 350, y: 150 });
    wire(trigTap, timer, 1, 1);  // right outlet → timer right inlet (measure)
    wire(trigTap, timer, 0, 0);  // left outlet → timer left inlet (reset)

    // timer → / 4 → metro right inlet (set new interval for 16th notes)
    const divFour = add({ name: "/", args: [4], x: 350, y: 180 });
    wire(timer, divFour);
    wire(divFour, metroNode, 0, 1); // metro right inlet = set interval
  }

  // ─── Voices ─────────────────────────────────────
  const builtVoices = new Map<DrumVoice, VoiceRefs>();
  const triggerInputNodes = new Map<DrumVoice, number>(); // for ports (external trig input)
  let maxVoiceY = 0;

  const voiceStartY = bpm > 0 ? 260 : 160;

  voices.forEach((voice, col) => {
    const x = 50 + col * COL_SPACING;
    let vy = voiceStartY;

    // Voice label
    add({ type: "text", args: ["---", voice.toUpperCase(), "---"], x, y: vy });
    vy += 20;

    // Pattern: sel [step_indices...] connected to counter
    const pattern = DEFAULT_PATTERNS[voice];

    // sel node with pattern steps
    const sel = add({ name: "sel", args: pattern, x, y: vy });
    if (counterNode !== undefined) {
      wire(counterNode, sel);
    }
    vy += SPACING;

    // sel's last outlet = "no match", outlets 0..N-1 = bang on match
    // We need a trigger bang: connect all match outlets to a single bang
    // Use t b (trigger) to consolidate — or just wire first match outlet
    // Actually, each matched outlet fires independently. We need to merge them.
    // Use a single bang object that any match triggers:
    const bangNode = add({ name: "bang", x, y: vy });
    for (let i = 0; i < pattern.length; i++) {
      wire(sel, bangNode, i);
    }
    vy += SPACING;

    // Store trigger input for external wiring (port)
    triggerInputNodes.set(voice, bangNode);

    // Build voice synth
    const morph = deriveMorph(voice, morphX, morphY);
    let refs: VoiceRefs;

    switch (voice) {
      case "bd":
        refs = buildBD(add, wire, bangNode, x, vy, morph, amplitude);
        break;
      case "sn":
        refs = buildSN(add, wire, bangNode, x, vy, morph, amplitude);
        break;
      case "ch":
        refs = buildHat(add, wire, bangNode, x, vy, morph, amplitude);
        break;
      case "oh":
        refs = buildHat(add, wire, bangNode, x, vy, morph, amplitude);
        break;
      case "cp":
        refs = buildCP(add, wire, bangNode, x, vy, morph, amplitude);
        break;
    }

    builtVoices.set(voice, refs);
    if (refs.maxY > maxVoiceY) maxVoiceY = refs.maxY;
  });

  // ─── OH/CH Choke (post-processing) ─────────────
  const chVoice = builtVoices.get("ch");
  const ohVoice = builtVoices.get("oh");
  if (chVoice && ohVoice) {
    // CH trigger sends "0 5" to OH's ampVline~ (kills in 5ms)
    const chokeMsg = add({
      type: "msg",
      args: [0, 5],
      x: 50 + voices.indexOf("oh") * COL_SPACING + 100,
      y: voiceStartY + 20 + SPACING, // near OH's trigger area
    });
    wire(triggerInputNodes.get("ch")!, chokeMsg);
    wire(chokeMsg, ohVoice.ampVline);
  }

  // ─── Summing + Output ───────────────────────────
  const voiceResults = voices.map(v => builtVoices.get(v)!);
  const outY = maxVoiceY + 40;
  add({ type: "text", args: ["---", "Output", "---"], x: 50, y: outY });

  let sumOut: number;

  if (voiceResults.length === 1) {
    sumOut = voiceResults[0].outputNode;
  } else {
    sumOut = add({ name: "+~", x: 50, y: outY + SPACING });
    wire(voiceResults[0].outputNode, sumOut);
    wire(voiceResults[1].outputNode, sumOut, 0, 1);

    for (let i = 2; i < voiceResults.length; i++) {
      const nextSum = add({
        name: "+~",
        x: 50,
        y: outY + SPACING + (i - 1) * SPACING,
      });
      wire(sumOut, nextSum);
      wire(voiceResults[i].outputNode, nextSum, 0, 1);
      sumOut = nextSum;
    }
  }

  const gainY =
    outY + SPACING + Math.max(0, voiceResults.length - 2) * SPACING + SPACING;

  const masterGain = add({ name: "*~", args: [amplitude], x: 50, y: gainY });
  wire(sumOut, masterGain);

  const dac = add({ name: "dac~", x: 50, y: gainY + SPACING });
  wire(masterGain, dac);
  wire(masterGain, dac, 0, 1);

  // ─── Ports ──────────────────────────────────────
  const ports = [];
  for (const voice of voices) {
    const trigIdx = triggerInputNodes.get(voice);
    if (trigIdx !== undefined) {
      ports.push({
        name: `trig_${voice}`,
        type: "control" as const,
        direction: "input" as const,
        nodeIndex: trigIdx,
        port: 0,
      });
    }
  }
  // clock_in — always exposed (external clock drives internal 16-step sequencer)
  ports.push({
    name: "clock_in",
    type: "control" as const,
    direction: "input" as const,
    nodeIndex: floatNode,
    port: 0,
    ...(metroNode !== undefined && { ioNodeIndex: metroNode }),
  });
  ports.push({
    name: "clock_out",
    type: "control" as const,
    direction: "output" as const,
    nodeIndex: counterNode,
    port: 0,
  });
  ports.push({
    name: "audio",
    type: "audio" as const,
    direction: "output" as const,
    nodeIndex: masterGain,
    port: 0,
    ioNodeIndex: dac,
  });

  // ─── Parameters ─────────────────────────────────
  const parameters: ParameterDescriptor[] = [
    {
      name: "volume",
      label: "Master Volume",
      min: 0,
      max: 1,
      default: amplitude,
      unit: "",
      curve: "linear",
      nodeIndex: masterGain,
      inlet: 1,
      category: "amplitude",
    },
  ];

  // Per-voice volume parameters
  for (const voice of voices) {
    const refs = builtVoices.get(voice)!;
    parameters.push({
      name: `volume_${voice}`,
      label: `${voice.toUpperCase()} Volume`,
      min: 0,
      max: 1,
      default: amplitude,
      unit: "",
      curve: "linear",
      nodeIndex: refs.levelNode,
      inlet: 1,
      category: "amplitude",
    });
  }

  return { spec: { nodes, connections }, ports, parameters };
}
