/**
 * Drum machine template — 4 analog-style drum voices with per-voice filtering and mixing.
 *
 * Architecture: 3 layers
 *   1. VOICES — BD (2x osc~ body+sub), SN (noise+tone separate envelopes),
 *               HH (noise→hip~→bp~ metallic), CP (noise→bp~ multi-tap burst)
 *   2. FILTER — Per-voice: bob~ (BD warmth, SN noise), bp~ (HH metallic, CP body), hip~ (HH)
 *   3. MIX   — Per-voice *~ levels (exposed params) → +~ summing → *~ master → dac~
 *
 * Layout: N columns (one per voice), triggers via msg "bang"
 */

import type {
  PatchNodeSpec,
  PatchConnectionSpec,
} from "../core/serializer.js";
import type { RackableSpec, ParameterDescriptor } from "./port-info.js";
import { validateDrumMachineParams } from "./validate-params.js";

export type DrumVoice = "bd" | "sn" | "hh" | "cp";

export interface DrumMachineParams {
  voices?: DrumVoice[]; // default ["bd", "sn", "hh", "cp"]
  tune?: number; // 0-1 (default 0.5) — pitch
  decay?: number; // 0-1 (default 0.5) — envelope decay
  tone?: number; // 0-1 (default 0.5) — filter brightness
  amplitude?: number; // 0-1 (default 0.7) — master volume
}

const COL_SPACING = 200;
const SPACING = 30;

type AddFn = (node: PatchNodeSpec) => number;
type WireFn = (from: number, to: number, outlet?: number, inlet?: number) => void;

interface VoiceResult {
  triggerNode: number;
  outputNode: number;
  levelNode: number;
  maxY: number;
}

// ─── BD (Bass Drum) ────────────────────────────────────────────
// 2x osc~ (body + sub-bass), pseudo-exponential pitch sweep,
// 3ms attack ramp (no click), bob~ warmth filter, per-voice level.

function buildBD(
  add: AddFn, wire: WireFn, x: number, startY: number,
  tune: number, decay: number, tone: number, amplitude: number,
): VoiceResult {
  let y = startY;

  const basePitch = 30 + tune * 120; // 30-150 Hz
  const startPitch = basePitch * (2 + tune * 2); // 2-4x overtone
  const midPitch = basePitch * 1.5;
  const pitchDecayMs = Math.round(60 + tune * 40); // 60-100ms total
  const ampDecayMs = Math.round(80 + decay * 400); // 80-480ms

  // Sub-bass pitch values
  const subStart = Math.round(startPitch * 0.5);
  const subMid = Math.round(midPitch * 0.5);
  const subBase = Math.round(basePitch * 0.5);

  // bob~ filter cutoff
  const filterCutoff = Math.round(basePitch * 3 + tone * basePitch * 8);

  // Trigger
  const trigger = add({ type: "msg", args: ["bang"], x, y });
  y += SPACING;

  // ── Pitch envelope (3-segment pseudo-exponential) ──
  const pitchMsg = add({
    type: "msg",
    args: [startPitch, "\\,", midPitch, 20, "\\,", basePitch, pitchDecayMs - 20],
    x: x - 40, y,
  });
  wire(trigger, pitchMsg);

  // ── Sub-bass pitch envelope (same curve at half freq) ──
  const subPitchMsg = add({
    type: "msg",
    args: [subStart, "\\,", subMid, 20, "\\,", subBase, pitchDecayMs - 20],
    x: x + 80, y,
  });
  wire(trigger, subPitchMsg);

  // ── Amp envelope (3ms attack ramp + decay) ──
  const ampMsg = add({
    type: "msg",
    args: [0, "\\,", 1, 3, "\\,", 0, ampDecayMs, 3],
    x: x + 40, y: y + SPACING * 3,
  });
  wire(trigger, ampMsg);
  y += SPACING;

  // Pitch vline~
  const pitchVline = add({ name: "vline~", x: x - 40, y });
  wire(pitchMsg, pitchVline);

  const subPitchVline = add({ name: "vline~", x: x + 80, y });
  wire(subPitchMsg, subPitchVline);
  y += SPACING;

  // Oscillators
  const bodyOsc = add({ name: "osc~", args: [Math.round(basePitch)], x: x - 40, y });
  wire(pitchVline, bodyOsc);

  const subOsc = add({ name: "osc~", args: [subBase], x: x + 80, y });
  wire(subPitchVline, subOsc);
  y += SPACING;

  // Mix body + sub
  const oscMix = add({ name: "+~", x, y });
  wire(bodyOsc, oscMix);
  wire(subOsc, oscMix, 0, 1);
  y += SPACING;

  // bob~ warmth filter
  const filter = add({ name: "bob~", args: [filterCutoff, 1.5], x, y });
  wire(oscMix, filter);
  y += SPACING;

  // Amp vline~ + VCA
  const ampVline = add({ name: "vline~", x: x + 40, y });
  wire(ampMsg, ampVline);

  const vca = add({ name: "*~", x, y });
  wire(filter, vca);
  wire(ampVline, vca, 0, 1);
  y += SPACING;

  // Per-voice level
  const level = add({ name: "*~", args: [amplitude], x, y });
  wire(vca, level);

  return { triggerNode: trigger, outputNode: level, levelNode: level, maxY: y };
}

// ─── SN (Snare) ────────────────────────────────────────────────
// Tone (osc~ with pitch sweep) + noise (bob~ filtered), separate envelopes,
// 2ms attack ramps, per-voice level.

function buildSN(
  add: AddFn, wire: WireFn, x: number, startY: number,
  tune: number, decay: number, tone: number, amplitude: number,
): VoiceResult {
  let y = startY;

  const baseTone = Math.round(150 + tune * 100); // 150-250 Hz
  const startTone = baseTone * 2;
  const toneDecayMs = Math.round(30 + decay * 50); // 30-80ms (short, punchy)
  const noiseDecayMs = Math.round(60 + decay * 150); // 60-210ms (longer body)
  const noiseCutoff = Math.round(1500 + tone * 4000); // 1500-5500 Hz

  // Trigger
  const trigger = add({ type: "msg", args: ["bang"], x, y });
  y += SPACING;

  // ── Tone pitch envelope ──
  const tonePitchMsg = add({
    type: "msg",
    args: [startTone, "\\,", baseTone, 30],
    x: x - 40, y,
  });
  wire(trigger, tonePitchMsg);

  // ── Tone amp envelope (2ms attack + short decay) ──
  const toneAmpMsg = add({
    type: "msg",
    args: [0, "\\,", 1, 2, "\\,", 0, toneDecayMs, 2],
    x: x - 40, y: y + SPACING * 2,
  });
  wire(trigger, toneAmpMsg);

  // ── Noise amp envelope (2ms attack + longer decay) ──
  const noiseAmpMsg = add({
    type: "msg",
    args: [0, "\\,", 0.8, 2, "\\,", 0, noiseDecayMs, 2],
    x: x + 80, y,
  });
  wire(trigger, noiseAmpMsg);
  y += SPACING;

  // Tone pitch vline~
  const tonePitchVline = add({ name: "vline~", x: x - 40, y });
  wire(tonePitchMsg, tonePitchVline);

  // Noise amp vline~
  const noiseAmpVline = add({ name: "vline~", x: x + 80, y });
  wire(noiseAmpMsg, noiseAmpVline);
  y += SPACING;

  // Tone osc
  const toneOsc = add({ name: "osc~", args: [baseTone], x: x - 40, y });
  wire(tonePitchVline, toneOsc);

  // Noise source + bob~ filter
  const noise = add({ name: "noise~", x: x + 80, y });
  y += SPACING;

  const noiseFilter = add({ name: "bob~", args: [noiseCutoff, 1.5], x: x + 80, y });
  wire(noise, noiseFilter);

  // Tone amp vline~ + VCA
  const toneAmpVline = add({ name: "vline~", x: x - 40, y });
  wire(toneAmpMsg, toneAmpVline);

  const toneVca = add({ name: "*~", x: x - 40, y: y + SPACING });
  wire(toneOsc, toneVca);
  wire(toneAmpVline, toneVca, 0, 1);

  // Noise VCA
  const noiseVca = add({ name: "*~", x: x + 80, y: y + SPACING });
  wire(noiseFilter, noiseVca);
  wire(noiseAmpVline, noiseVca, 0, 1);
  y += SPACING * 2;

  // Mix tone + noise
  const mix = add({ name: "+~", x, y });
  wire(toneVca, mix);
  wire(noiseVca, mix, 0, 1);
  y += SPACING;

  // Per-voice level
  const level = add({ name: "*~", args: [amplitude], x, y });
  wire(mix, level);

  return { triggerNode: trigger, outputNode: level, levelNode: level, maxY: y };
}

// ─── HH (Hi-Hat) ──────────────────────────────────────────────
// noise~ → hip~ → bp~ (metallic resonance), attack ramp, per-voice level.

function buildHH(
  add: AddFn, wire: WireFn, x: number, startY: number,
  _tune: number, decay: number, tone: number, amplitude: number,
): VoiceResult {
  let y = startY;

  const hipFreq = Math.round(4000 + tone * 6000); // 4000-10000 Hz
  const metalFreq = Math.round(6000 + tone * 4000); // 6000-10000 Hz
  const metalQ = Math.round(3 + tone * 5); // 3-8
  const ampDecayMs = Math.round(15 + decay * 300); // 15-315ms

  // Trigger
  const trigger = add({ type: "msg", args: ["bang"], x, y });
  y += SPACING;

  // ── Amp envelope (1ms attack + decay) ──
  const ampMsg = add({
    type: "msg",
    args: [0, "\\,", 0.7, 1, "\\,", 0, ampDecayMs, 1],
    x: x + 60, y,
  });
  wire(trigger, ampMsg);
  y += SPACING;

  const ampVline = add({ name: "vline~", x: x + 60, y });
  wire(ampMsg, ampVline);

  // Noise source
  const noise = add({ name: "noise~", x, y });
  y += SPACING;

  // hip~ (remove low end)
  const hip = add({ name: "hip~", args: [hipFreq], x, y });
  wire(noise, hip);
  y += SPACING;

  // bp~ (metallic resonance)
  const bp = add({ name: "bp~", args: [metalFreq, metalQ], x, y });
  wire(hip, bp);
  y += SPACING;

  // VCA
  const vca = add({ name: "*~", x, y });
  wire(bp, vca);
  wire(ampVline, vca, 0, 1);
  y += SPACING;

  // Per-voice level
  const level = add({ name: "*~", args: [amplitude], x, y });
  wire(vca, level);

  return { triggerNode: trigger, outputNode: level, levelNode: level, maxY: y };
}

// ─── CP (Clap) ─────────────────────────────────────────────────
// noise~ → bp~, multi-tap burst envelope (808-style: 3 bursts + tail), per-voice level.

function buildCP(
  add: AddFn, wire: WireFn, x: number, startY: number,
  _tune: number, decay: number, tone: number, amplitude: number,
): VoiceResult {
  let y = startY;

  const bpFreq = Math.round(1000 + tone * 1500); // 1000-2500 Hz
  const bpQ = Math.round(3 + tone * 5); // 3-8
  const tailDecay = Math.round(30 + decay * 120); // 30-150ms

  // Trigger
  const trigger = add({ type: "msg", args: ["bang"], x, y });
  y += SPACING;

  // ── Multi-tap burst envelope ──
  // 3 short bursts (at t=0, t=6ms, t=12ms) + decay tail
  // vline~ format: target time [delay] — 3rd value is delay from trigger
  const ampMsg = add({
    type: "msg",
    args: [
      0, "\\,",
      0.8, 1, "\\,",
      0, 5, 1, "\\,",
      0.7, 1, 6, "\\,",
      0, 5, 7, "\\,",
      0.6, 1, 12, "\\,",
      0, tailDecay, 13,
    ],
    x: x + 60, y,
  });
  wire(trigger, ampMsg);
  y += SPACING;

  const ampVline = add({ name: "vline~", x: x + 60, y });
  wire(ampMsg, ampVline);

  // Noise source
  const noise = add({ name: "noise~", x, y });
  y += SPACING;

  // bp~ (body)
  const bp = add({ name: "bp~", args: [bpFreq, bpQ], x, y });
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

  return { triggerNode: trigger, outputNode: level, levelNode: level, maxY: y };
}

// ─── Main builder ──────────────────────────────────────────────

const VOICE_BUILDERS: Record<DrumVoice, typeof buildBD> = {
  bd: buildBD,
  sn: buildSN,
  hh: buildHH,
  cp: buildCP,
};

export function buildDrumMachine(params: DrumMachineParams = {}): RackableSpec {
  validateDrumMachineParams(params as Record<string, unknown>);

  const voices: DrumVoice[] = (params.voices as DrumVoice[] | undefined) ?? [
    "bd",
    "sn",
    "hh",
    "cp",
  ];
  const tune = params.tune ?? 0.5;
  const decay = params.decay ?? 0.5;
  const tone = params.tone ?? 0.5;
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
    args: ["Drum", "Machine:", voices.join(" ").toUpperCase()],
    x: 50,
    y: 10,
  });

  const voiceResults: VoiceResult[] = [];
  const triggerIndices = new Map<DrumVoice, number>();
  let maxVoiceY = 0;

  voices.forEach((voice, col) => {
    const x = 50 + col * COL_SPACING;
    const labelY = 40;

    // Voice label
    add({ type: "text", args: ["---", voice.toUpperCase(), "---"], x, y: labelY });

    const builder = VOICE_BUILDERS[voice];
    const result = builder(add, wire, x, labelY + 20, tune, decay, tone, amplitude);

    voiceResults.push(result);
    triggerIndices.set(voice, result.triggerNode);
    if (result.maxY > maxVoiceY) maxVoiceY = result.maxY;
  });

  // ─── Summing + Output ───────────────────────────
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

  const gain = add({ name: "*~", args: [amplitude], x: 50, y: gainY });
  wire(sumOut, gain);

  const dac = add({ name: "dac~", x: 50, y: gainY + SPACING });
  wire(gain, dac);
  wire(gain, dac, 0, 1);

  // ─── Ports ──────────────────────────────────────
  const ports = [];
  for (const voice of voices) {
    const trigIdx = triggerIndices.get(voice);
    if (trigIdx !== undefined) {
      ports.push({ name: `trig_${voice}`, type: "control" as const, direction: "input" as const, nodeIndex: trigIdx, port: 0 });
    }
  }
  ports.push({ name: "audio", type: "audio" as const, direction: "output" as const, nodeIndex: gain, port: 0, ioNodeIndex: dac });

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
      nodeIndex: gain,
      inlet: 1,
      category: "amplitude",
    },
  ];

  // Per-voice volume parameters
  for (let i = 0; i < voices.length; i++) {
    parameters.push({
      name: `volume_${voices[i]}`,
      label: `${voices[i].toUpperCase()} Volume`,
      min: 0,
      max: 1,
      default: amplitude,
      unit: "",
      curve: "linear",
      nodeIndex: voiceResults[i].levelNode,
      inlet: 1,
      category: "amplitude",
    });
  }

  return { spec: { nodes, connections }, ports, parameters };
}
