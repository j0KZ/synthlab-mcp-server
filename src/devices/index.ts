/**
 * Device profile registry.
 */

import type { DeviceProfile } from "./types.js";
import { k2Profile } from "./k2.js";

const devices = new Map<string, DeviceProfile>([
  [k2Profile.name, k2Profile],
  ["k2", k2Profile], // alias
]);

/**
 * Look up a device profile by name.
 * Throws if the device name is not recognized.
 */
export function getDevice(name: string): DeviceProfile {
  const profile = devices.get(name.toLowerCase());
  if (!profile) {
    const available = [...new Set([...devices.values()].map((d) => d.name))];
    throw new Error(
      `Unknown device "${name}". Available devices: ${available.join(", ")}`,
    );
  }
  return profile;
}
