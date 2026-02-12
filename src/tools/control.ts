/**
 * send_message MCP tool — send control messages to a running Pd instance.
 *
 * Supports OSC (UDP binary) and FUDI (TCP text) protocols.
 * Uses Node.js built-in dgram and net — zero external dependencies.
 */

import { encodeOscMessage, inferOscArg } from "../network/osc-encoder.js";
import { formatFudiMessage } from "../network/fudi-formatter.js";
import { sendUdp } from "../network/udp-sender.js";
import { sendTcp } from "../network/tcp-sender.js";

export interface SendMessageInput {
  protocol: "osc" | "fudi";
  host?: string;
  port?: number;
  address: string;
  args?: (string | number)[];
}

const DEFAULT_OSC_PORT = 9000;
const DEFAULT_FUDI_PORT = 3000;

/**
 * Execute the send_message tool.
 *
 * @returns Human-readable confirmation string.
 */
export async function executeSendMessage(
  input: SendMessageInput,
): Promise<string> {
  // Claude Desktop boolean coercion
  let protocol = input.protocol;
  if (typeof protocol === "boolean") protocol = "osc";

  const host = input.host ?? "127.0.0.1";
  const args = input.args ?? [];
  const port =
    input.port ?? (protocol === "osc" ? DEFAULT_OSC_PORT : DEFAULT_FUDI_PORT);

  const argsDisplay =
    args.length > 0 ? ` [${args.join(", ")}]` : "";

  if (protocol === "osc") {
    const oscArgs = args.map(inferOscArg);
    const buf = encodeOscMessage(input.address, oscArgs);
    await sendUdp(buf, { host, port });
    return (
      `Sent via OSC (UDP) to ${host}:${port}\n` +
      `  Address: ${input.address}${argsDisplay}\n` +
      `  Bytes: ${buf.length}`
    );
  } else {
    // FUDI: strip "/pd/" prefix if present (common when user provides OSC-style address)
    let selector = input.address;
    if (selector.startsWith("/pd/")) {
      selector = selector.slice(4);
    } else if (selector.startsWith("/")) {
      // Strip leading slash for FUDI ("/tempo" → "tempo")
      selector = selector.slice(1);
    }

    const buf = formatFudiMessage(selector, args);
    const response = await sendTcp(buf, { host, port });
    const lines = [
      `Sent via FUDI (TCP) to ${host}:${port}`,
      `  Message: ${selector}${argsDisplay}`,
      `  Bytes: ${buf.length}`,
    ];
    if (response.trim()) {
      lines.push(`  Response: ${response.trim()}`);
    }
    return lines.join("\n");
  }
}
