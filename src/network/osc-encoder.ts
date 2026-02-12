/**
 * OSC (Open Sound Control) binary message encoder.
 *
 * Encodes OSC messages per the 1.0 spec:
 *   - Address: null-terminated, padded to 4-byte boundary
 *   - Type tag string: "," + one char per arg (i/f/s), padded to 4-byte
 *   - Arguments: int32 big-endian, float32 big-endian, string null-padded
 *
 * Reference: opensoundcontrol.org/spec-1_0
 */

export interface OscArgInt { type: "i"; value: number }
export interface OscArgFloat { type: "f"; value: number }
export interface OscArgString { type: "s"; value: string }

export type OscArg = OscArgInt | OscArgFloat | OscArgString;

/**
 * Infer OSC arg type from a raw JS value.
 *   - Integer number → "i"
 *   - Non-integer number → "f"
 *   - String → "s"
 */
export function inferOscArg(value: string | number): OscArg {
  if (typeof value === "string") return { type: "s", value };
  if (Number.isInteger(value)) return { type: "i", value };
  return { type: "f", value };
}

/** Pad a buffer with null bytes to the next 4-byte boundary. */
function padToFour(buf: Buffer): Buffer {
  const remainder = buf.length % 4;
  if (remainder === 0) return buf;
  const padding = Buffer.alloc(4 - remainder, 0);
  return Buffer.concat([buf, padding]);
}

/** Encode a string as null-terminated, padded to 4-byte boundary. */
function encodeString(s: string): Buffer {
  // String + at least one null byte, then pad to 4-byte boundary
  const raw = Buffer.from(s + "\0", "utf-8");
  return padToFour(raw);
}

/** Encode a 32-bit signed integer (big-endian). */
function encodeInt32(n: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeInt32BE(n, 0);
  return buf;
}

/** Encode a 32-bit float (big-endian IEEE 754). */
function encodeFloat32(n: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeFloatBE(n, 0);
  return buf;
}

/**
 * Encode an OSC message into a binary Buffer.
 *
 * @param address - OSC address pattern (must start with `/`)
 * @param args - Typed arguments
 * @returns Binary OSC message
 * @throws If address doesn't start with `/`
 */
export function encodeOscMessage(address: string, args: OscArg[]): Buffer {
  if (!address.startsWith("/")) {
    throw new Error(`OSC address must start with "/", got: "${address}"`);
  }

  const parts: Buffer[] = [];

  // 1. Address string
  parts.push(encodeString(address));

  // 2. Type tag string: "," + type chars
  const typeTags = "," + args.map((a) => a.type).join("");
  parts.push(encodeString(typeTags));

  // 3. Arguments
  for (const arg of args) {
    switch (arg.type) {
      case "i":
        parts.push(encodeInt32(arg.value));
        break;
      case "f":
        parts.push(encodeFloat32(arg.value));
        break;
      case "s":
        parts.push(encodeString(arg.value));
        break;
    }
  }

  return Buffer.concat(parts);
}
