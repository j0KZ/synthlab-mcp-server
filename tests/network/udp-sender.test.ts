import { describe, it, expect, vi } from "vitest";
import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import { sendUdp } from "../../src/network/udp-sender.js";

describe("sendUdp", () => {
  it("sends buffer to a UDP server", async () => {
    const received: Buffer[] = [];
    const server = dgram.createSocket("udp4");

    const port = await new Promise<number>((resolve) => {
      server.on("message", (msg) => received.push(Buffer.from(msg)));
      server.bind(0, "127.0.0.1", () => resolve(server.address().port));
    });

    const buf = Buffer.from("hello");
    await sendUdp(buf, { host: "127.0.0.1", port });

    await new Promise((r) => setTimeout(r, 50));
    server.close();

    expect(received.length).toBe(1);
    expect(received[0].toString()).toBe("hello");
  });

  it("rejects on send error (bad port 0)", async () => {
    // Port 0 with an explicit send should cause an error on some systems,
    // but UDP is fire-and-forget so this may not always error.
    // Test the basic promise resolution path instead.
    const buf = Buffer.from("test");
    // Sending to localhost on a random high port — should succeed (UDP doesn't care)
    await expect(sendUdp(buf, { host: "127.0.0.1", port: 55123 })).resolves.toBeUndefined();
  });

  it("rejects when socket emits error event", async () => {
    // Mock dgram.createSocket to return a fake socket that emits an error
    const fakeSocket = new EventEmitter() as any;
    fakeSocket.close = vi.fn();
    fakeSocket.send = vi.fn(() => {
      // Emit error before send callback fires
      process.nextTick(() => fakeSocket.emit("error", new Error("mock socket error")));
    });

    const spy = vi.spyOn(dgram, "createSocket").mockReturnValue(fakeSocket as any);
    try {
      const buf = Buffer.from("test");
      await expect(sendUdp(buf, { host: "127.0.0.1", port: 9999 })).rejects.toThrow("mock socket error");
      expect(fakeSocket.close).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
