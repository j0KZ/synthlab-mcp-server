import { describe, it, expect } from "vitest";
import { formatFudiMessage } from "../../src/network/fudi-formatter.js";

describe("FUDI formatter", () => {
  it("formats basic message (tempo 140)", () => {
    const buf = formatFudiMessage("tempo", [140]);
    expect(buf.toString("utf-8")).toBe("tempo 140;\n");
  });

  it("formats multi-arg message (note 60 100 1)", () => {
    const buf = formatFudiMessage("note", [60, 100, 1]);
    expect(buf.toString("utf-8")).toBe("note 60 100 1;\n");
  });

  it("formats message with string args", () => {
    const buf = formatFudiMessage("patch/load", ["myfile.pd"]);
    expect(buf.toString("utf-8")).toBe("patch/load myfile.pd;\n");
  });
});
