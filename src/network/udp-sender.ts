/**
 * UDP sender for OSC messages.
 *
 * Fire-and-forget: creates a socket, sends, closes.
 * Uses Node.js built-in `dgram` — no external dependencies.
 */

import dgram from "node:dgram";

export interface UdpSendOptions {
  host: string;
  port: number;
}

/**
 * Send a binary buffer via UDP.
 * Resolves when the send callback fires. Rejects on socket error.
 */
export function sendUdp(buf: Buffer, options: UdpSendOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    socket.on("error", (err) => {
      socket.close();
      reject(err);
    });
    socket.send(buf, 0, buf.length, options.port, options.host, (err) => {
      socket.close();
      if (err) reject(err);
      else resolve();
    });
  });
}
