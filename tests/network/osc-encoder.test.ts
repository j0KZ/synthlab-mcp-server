import { describe, it, expect } from "vitest";
import {
  encodeOscMessage,
  inferOscArg,
  type OscArg,
} from "../../src/network/osc-encoder.js";

describe("OSC encoder", () => {
  it("encodes message with no args (/pd/bang)", () => {
    const buf = encodeOscMessage("/pd/bang", []);

    // Address: "/pd/bang" (8 chars + null = 9, padded to 12)
    // Type tag: "," (1 char + null = 2, padded to 4)
    expect(buf.length).toBe(12 + 4);

    // Address starts with /pd/bang followed by nulls
    const addr = buf.subarray(0, 12).toString("utf-8").replace(/\0+$/, "");
    expect(addr).toBe("/pd/bang");

    // Type tag is just "," (no args)
    const tag = buf.subarray(12, 16).toString("utf-8").replace(/\0+$/, "");
    expect(tag).toBe(",");
  });

  it("encodes int32 argument (/pd/tempo 140)", () => {
    const args: OscArg[] = [{ type: "i", value: 140 }];
    const buf = encodeOscMessage("/pd/tempo", args);

    // Address: "/pd/tempo" (9 + null = 10, padded to 12)
    // Type tag: ",i" (2 + null = 3, padded to 4)
    // Int32: 4 bytes
    expect(buf.length).toBe(12 + 4 + 4);

    // Read back the int
    const intVal = buf.readInt32BE(16);
    expect(intVal).toBe(140);
  });

  it("encodes float32 argument (/pd/param/cutoff 1000.5)", () => {
    const args: OscArg[] = [{ type: "f", value: 1000.5 }];
    const buf = encodeOscMessage("/pd/param/cutoff", args);

    // Address: "/pd/param/cutoff" (16 + null = 17, padded to 20)
    // Type tag: ",f" (2 + null = 3, padded to 4)
    // Float32: 4 bytes
    expect(buf.length).toBe(20 + 4 + 4);

    const floatVal = buf.readFloatBE(24);
    expect(floatVal).toBeCloseTo(1000.5, 1);
  });

  it("encodes string argument", () => {
    const args: OscArg[] = [{ type: "s", value: "myfile.pd" }];
    const buf = encodeOscMessage("/pd/patch/load", args);

    // Address: "/pd/patch/load" (14 + null = 15, padded to 16)
    // Type tag: ",s" (2 + null = 3, padded to 4)
    // String: "myfile.pd" (9 + null = 10, padded to 12)
    expect(buf.length).toBe(16 + 4 + 12);

    const str = buf.subarray(20, 32).toString("utf-8").replace(/\0+$/, "");
    expect(str).toBe("myfile.pd");
  });

  it("encodes mixed int args (/pd/note 60 100 1)", () => {
    const args: OscArg[] = [
      { type: "i", value: 60 },
      { type: "i", value: 100 },
      { type: "i", value: 1 },
    ];
    const buf = encodeOscMessage("/pd/note", args);

    // Address: "/pd/note" (8 + null = 9, padded to 12)
    // Type tag: ",iii" (4 + null = 5, padded to 8)
    // 3 × Int32: 12 bytes
    expect(buf.length).toBe(12 + 8 + 12);

    // Check type tag
    const tag = buf.subarray(12, 20).toString("utf-8").replace(/\0+$/, "");
    expect(tag).toBe(",iii");

    // Check values
    expect(buf.readInt32BE(20)).toBe(60);
    expect(buf.readInt32BE(24)).toBe(100);
    expect(buf.readInt32BE(28)).toBe(1);
  });

  it("pads address to 4-byte boundary", () => {
    // "/pd" = 3 chars + null = 4 → already aligned (no extra padding)
    const buf1 = encodeOscMessage("/pd", []);
    const addr1Len = 4; // "/pd\0" = exactly 4
    const tagLen = 4;
    expect(buf1.length).toBe(addr1Len + tagLen);

    // "/p" = 2 chars + null = 3, padded to 4
    const buf2 = encodeOscMessage("/p", []);
    expect(buf2.length).toBe(4 + tagLen);

    // "/pd/tempo" = 9 + null = 10, padded to 12
    const buf3 = encodeOscMessage("/pd/tempo", []);
    expect(buf3.length).toBe(12 + tagLen);
  });

  it("rejects invalid address (no leading /)", () => {
    expect(() => encodeOscMessage("tempo", [])).toThrow(
      'OSC address must start with "/"',
    );
  });

  it("inferOscArg distinguishes int, float, and string", () => {
    const intArg = inferOscArg(140);
    expect(intArg.type).toBe("i");
    expect(intArg.value).toBe(140);

    const floatArg = inferOscArg(140.5);
    expect(floatArg.type).toBe("f");
    expect(floatArg.value).toBe(140.5);

    const strArg = inferOscArg("hello");
    expect(strArg.type).toBe("s");
    expect(strArg.value).toBe("hello");
  });
});
