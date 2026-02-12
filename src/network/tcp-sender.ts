/**
 * TCP sender for FUDI messages.
 *
 * Connects, sends, collects optional response, closes.
 * Uses Node.js built-in `net` — no external dependencies.
 */

import net from "node:net";

export interface TcpSendOptions {
  host: string;
  port: number;
  /** Connection + response timeout in ms. Default: 2000. */
  timeout?: number;
}

/**
 * Send a buffer via TCP.
 * Returns any data received before the connection closes.
 * Rejects on connection error or timeout.
 */
export function sendTcp(buf: Buffer, options: TcpSendOptions): Promise<string> {
  const timeout = options.timeout ?? 2000;

  return new Promise((resolve, reject) => {
    let response = "";
    const socket = net.createConnection(
      { host: options.host, port: options.port },
      () => {
        socket.write(buf, () => {
          // Give Pd a moment to respond, then close
          setTimeout(() => socket.end(), 50);
        });
      },
    );

    socket.setTimeout(timeout);
    socket.on("data", (data) => { response += data.toString(); });
    socket.on("end", () => resolve(response));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(response); // Resolve with whatever we got — timeout is normal for fire-and-forget
    });
    socket.on("error", (err) => {
      socket.destroy();
      reject(err);
    });
  });
}
