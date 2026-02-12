/**
 * Device profile types for MIDI controller integration.
 */

export interface DeviceControl {
  /** Control name: "fader1", "pot1", "encoder1", "buttonA1" */
  name: string;
  /** Physical control type */
  type: "fader" | "pot" | "encoder" | "button";
  /** MIDI CC number (faders, pots, encoders) */
  cc?: number;
  /** MIDI note number (buttons) */
  note?: number;
  /** Input behavior */
  inputType: "absolute" | "relative" | "trigger";
  /** Value range [min, max] */
  range: [number, number];
  /** Auto-mapping category hint */
  category: "amplitude" | "frequency" | "general" | "transport";
}

export interface DeviceProfile {
  /** Device identifier: "xone-k2" */
  name: string;
  /** Human-readable name: "Allen & Heath Xone:K2" */
  label: string;
  /** Default MIDI channel (1-indexed) */
  midiChannel: number;
  /** Available controls */
  controls: DeviceControl[];
}
