/**
 * Controller mapping types for MIDI hardware integration.
 */

import type { DeviceControl } from "../devices/types.js";
import type { ParameterDescriptor } from "../templates/port-info.js";

/** A resolved mapping from a physical control to a rack parameter. */
export interface ControllerMapping {
  /** Physical control on the device */
  control: DeviceControl;
  /** Module ID in the rack */
  moduleId: string;
  /** Target parameter on the module */
  parameter: ParameterDescriptor;
  /** Bus name for send/receive: "{moduleId}__p__{paramName}" */
  busName: string;
}

/** User-specified custom mapping override. */
export interface CustomMapping {
  /** Control name on device: "fader1", "pot3" */
  control: string;
  /** Module ID in the rack: "synth", "mixer" */
  module: string;
  /** Parameter name on the module: "cutoff", "volume_ch1" */
  parameter: string;
}

/** Controller configuration from create_rack input. */
export interface ControllerConfig {
  /** Device name: "k2", "xone-k2" */
  device: string;
  /** MIDI channel override (1-16). Uses device default if omitted. */
  midiChannel?: number;
  /** Custom control-to-parameter mappings. Auto-mapped if omitted. */
  mappings?: CustomMapping[];
}
