/**
 * FUDI (Fast Universal Digital Interface) message formatter.
 *
 * FUDI is Pure Data's native TCP message protocol.
 * Format: "selector arg1 arg2 ...;\n"
 *
 * Pd's [netreceive] object parses semicolon-terminated messages
 * and outputs them as Pd messages internally.
 */

/**
 * Format a FUDI message as a Buffer.
 *
 * @param selector - Message selector (e.g. "tempo", "note")
 * @param args - Message arguments (numbers and strings)
 * @returns UTF-8 Buffer of "selector arg1 arg2 ...;\n"
 */
export function formatFudiMessage(
  selector: string,
  args: (string | number)[],
): Buffer {
  const parts = [selector, ...args.map(String)];
  return Buffer.from(parts.join(" ") + ";\n", "utf-8");
}
