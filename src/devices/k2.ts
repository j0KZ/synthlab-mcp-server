/**
 * Allen & Heath Xone:K2 device profile.
 *
 * Physical layout per column (4 columns):
 *   Encoder (top) → 3 pots → 4 buttons (A-D) → Fader (bottom)
 *
 * Phase 7 scope: 16 absolute controls (4 faders + 12 pots).
 * Encoders (relative) and buttons (trigger) deferred to Phase 7.5.
 *
 * Reference: K2_controller_design/k2_discovered_controls.json
 */

import type { DeviceProfile, DeviceControl } from "./types.js";

const faders: DeviceControl[] = [
  { name: "fader1", type: "fader", cc: 16, inputType: "absolute", range: [0, 127], category: "amplitude" },
  { name: "fader2", type: "fader", cc: 17, inputType: "absolute", range: [0, 127], category: "amplitude" },
  { name: "fader3", type: "fader", cc: 18, inputType: "absolute", range: [0, 127], category: "amplitude" },
  { name: "fader4", type: "fader", cc: 19, inputType: "absolute", range: [0, 127], category: "amplitude" },
];

const pots: DeviceControl[] = [
  // Row 1 — frequency/filter controls
  { name: "pot1",  type: "pot", cc: 4,  inputType: "absolute", range: [0, 127], category: "frequency" },
  { name: "pot2",  type: "pot", cc: 5,  inputType: "absolute", range: [0, 127], category: "frequency" },
  { name: "pot3",  type: "pot", cc: 6,  inputType: "absolute", range: [0, 127], category: "frequency" },
  { name: "pot4",  type: "pot", cc: 7,  inputType: "absolute", range: [0, 127], category: "frequency" },
  // Row 2 — general
  { name: "pot5",  type: "pot", cc: 8,  inputType: "absolute", range: [0, 127], category: "general" },
  { name: "pot6",  type: "pot", cc: 9,  inputType: "absolute", range: [0, 127], category: "general" },
  { name: "pot7",  type: "pot", cc: 10, inputType: "absolute", range: [0, 127], category: "general" },
  { name: "pot8",  type: "pot", cc: 11, inputType: "absolute", range: [0, 127], category: "general" },
  // Row 3 — general
  { name: "pot9",  type: "pot", cc: 12, inputType: "absolute", range: [0, 127], category: "general" },
  { name: "pot10", type: "pot", cc: 13, inputType: "absolute", range: [0, 127], category: "general" },
  { name: "pot11", type: "pot", cc: 14, inputType: "absolute", range: [0, 127], category: "general" },
  { name: "pot12", type: "pot", cc: 15, inputType: "absolute", range: [0, 127], category: "general" },
];

export const k2Profile: DeviceProfile = {
  name: "xone-k2",
  label: "Allen & Heath Xone:K2",
  midiChannel: 16,
  controls: [...faders, ...pots],
};
