import { describe, it, expect } from "vitest";
import {
  resolvePortCounts,
  resolveSubpatchPorts,
  lookupObject,
  isAudioObject,
} from "../src/core/object-registry.js";
import type { PdNode, PdCanvas } from "../src/types.js";

/** Helper to create a minimal PdNode for testing. */
function objNode(name: string, args: (string | number)[] = []): PdNode {
  return { id: 0, type: "obj", x: 0, y: 0, name, args, raw: "" };
}

function nonObjNode(type: "msg" | "floatatom" | "symbolatom" | "text" | "array"): PdNode {
  return { id: 0, type, x: 0, y: 0, args: [], raw: "" };
}

describe("object registry", () => {
  describe("resolvePortCounts — fixed objects", () => {
    it("osc~ has 2 inlets, 1 outlet", () => {
      const ports = resolvePortCounts(objNode("osc~", [440]));
      expect(ports).toEqual({ inlets: 2, outlets: 1 });
    });

    it("bang has 1 inlet, 1 outlet", () => {
      const ports = resolvePortCounts(objNode("bang"));
      expect(ports).toEqual({ inlets: 1, outlets: 1 });
    });

    it("dac~ with no args has 2 inlets, 0 outlets", () => {
      const ports = resolvePortCounts(objNode("dac~"));
      expect(ports).toEqual({ inlets: 2, outlets: 0 });
    });

    it("dac~ with 4 channel args has 4 inlets", () => {
      const ports = resolvePortCounts(objNode("dac~", [1, 2, 3, 4]));
      expect(ports).toEqual({ inlets: 4, outlets: 0 });
    });

    it("loadbang has 0 inlets, 1 outlet", () => {
      const ports = resolvePortCounts(objNode("loadbang"));
      expect(ports).toEqual({ inlets: 0, outlets: 1 });
    });

    it("print has 1 inlet, 0 outlets", () => {
      const ports = resolvePortCounts(objNode("print"));
      expect(ports).toEqual({ inlets: 1, outlets: 0 });
    });

    it("notein has 0 inlets, 3 outlets", () => {
      const ports = resolvePortCounts(objNode("notein"));
      expect(ports).toEqual({ inlets: 0, outlets: 3 });
    });
  });

  describe("resolvePortCounts — variable-count objects", () => {
    it("select with 4 args has 2 inlets, 5 outlets", () => {
      const ports = resolvePortCounts(objNode("select", [0, 1, 2, 3]));
      expect(ports).toEqual({ inlets: 2, outlets: 5 });
    });

    it("select with 0 args has minimum 2 outlets", () => {
      const ports = resolvePortCounts(objNode("select"));
      expect(ports).toEqual({ inlets: 2, outlets: 2 });
    });

    it("trigger with 3 args has 1 inlet, 3 outlets", () => {
      const ports = resolvePortCounts(objNode("trigger", ["b", "f", "b"]));
      expect(ports).toEqual({ inlets: 1, outlets: 3 });
    });

    it("trigger with 0 args has minimum 2 outlets", () => {
      const ports = resolvePortCounts(objNode("trigger"));
      expect(ports).toEqual({ inlets: 1, outlets: 2 });
    });

    it("pack with 3 args has 3 inlets, 1 outlet", () => {
      const ports = resolvePortCounts(objNode("pack", [0, 0, 0]));
      expect(ports).toEqual({ inlets: 3, outlets: 1 });
    });

    it("pack with 0 args has minimum 2 inlets", () => {
      const ports = resolvePortCounts(objNode("pack"));
      expect(ports).toEqual({ inlets: 2, outlets: 1 });
    });

    it("unpack with 4 args has 1 inlet, 4 outlets", () => {
      const ports = resolvePortCounts(objNode("unpack", ["f", "f", "f", "f"]));
      expect(ports).toEqual({ inlets: 1, outlets: 4 });
    });

    it("route with 3 args has 1 inlet, 4 outlets", () => {
      const ports = resolvePortCounts(objNode("route", ["a", "b", "c"]));
      expect(ports).toEqual({ inlets: 1, outlets: 4 });
    });
  });

  describe("resolvePortCounts — aliases", () => {
    it("sel resolves to select", () => {
      const ports = resolvePortCounts(objNode("sel", [1, 2]));
      expect(ports).toEqual({ inlets: 2, outlets: 3 });
    });

    it("t resolves to trigger", () => {
      const ports = resolvePortCounts(objNode("t", ["b", "f"]));
      expect(ports).toEqual({ inlets: 1, outlets: 2 });
    });

    it("b resolves to bang", () => {
      const ports = resolvePortCounts(objNode("b"));
      expect(ports).toEqual({ inlets: 1, outlets: 1 });
    });

    it("f resolves to float", () => {
      const ports = resolvePortCounts(objNode("f"));
      expect(ports).toEqual({ inlets: 2, outlets: 1 });
    });

    it("i resolves to int", () => {
      const ports = resolvePortCounts(objNode("i"));
      expect(ports).toEqual({ inlets: 2, outlets: 1 });
    });

    it("s resolves to send", () => {
      const ports = resolvePortCounts(objNode("s", ["mybus"]));
      expect(ports).toEqual({ inlets: 1, outlets: 0 });
    });

    it("r resolves to receive", () => {
      const ports = resolvePortCounts(objNode("r", ["mybus"]));
      expect(ports).toEqual({ inlets: 0, outlets: 1 });
    });

    it("v resolves to value", () => {
      const ports = resolvePortCounts(objNode("v", ["myval"]));
      expect(ports).toEqual({ inlets: 1, outlets: 1 });
    });
  });

  describe("resolvePortCounts — non-obj node types", () => {
    it("msg has 1 inlet, 1 outlet", () => {
      expect(resolvePortCounts(nonObjNode("msg"))).toEqual({ inlets: 1, outlets: 1 });
    });

    it("floatatom has 1 inlet, 1 outlet", () => {
      expect(resolvePortCounts(nonObjNode("floatatom"))).toEqual({ inlets: 1, outlets: 1 });
    });

    it("symbolatom has 1 inlet, 1 outlet", () => {
      expect(resolvePortCounts(nonObjNode("symbolatom"))).toEqual({ inlets: 1, outlets: 1 });
    });

    it("text (comment) has 0 inlets, 0 outlets", () => {
      expect(resolvePortCounts(nonObjNode("text"))).toEqual({ inlets: 0, outlets: 0 });
    });

    it("array has 0 inlets, 0 outlets", () => {
      expect(resolvePortCounts(nonObjNode("array"))).toEqual({ inlets: 0, outlets: 0 });
    });
  });

  describe("resolvePortCounts — unknown objects", () => {
    it("returns null for unknown object", () => {
      expect(resolvePortCounts(objNode("my_external~"))).toBeNull();
    });

    it("returns null for obj with no name", () => {
      const node: PdNode = { id: 0, type: "obj", x: 0, y: 0, args: [], raw: "" };
      expect(resolvePortCounts(node)).toBeNull();
    });
  });

  describe("resolveSubpatchPorts", () => {
    it("counts inlet and outlet objects", () => {
      const canvas: PdCanvas = {
        id: 1, x: 0, y: 0, width: 400, height: 300, fontSize: 12,
        name: "test", isSubpatch: true, nodes: [
          { id: 0, type: "obj", x: 0, y: 0, name: "inlet", args: [], raw: "" },
          { id: 1, type: "obj", x: 0, y: 0, name: "inlet~", args: [], raw: "" },
          { id: 2, type: "obj", x: 0, y: 0, name: "*~", args: [0.5], raw: "" },
          { id: 3, type: "obj", x: 0, y: 0, name: "outlet~", args: [], raw: "" },
        ],
        connections: [], subpatches: [],
      };
      expect(resolveSubpatchPorts(canvas)).toEqual({ inlets: 2, outlets: 1 });
    });

    it("returns 0/0 for empty subpatch", () => {
      const canvas: PdCanvas = {
        id: 1, x: 0, y: 0, width: 400, height: 300, fontSize: 12,
        name: "empty", isSubpatch: true, nodes: [], connections: [], subpatches: [],
      };
      expect(resolveSubpatchPorts(canvas)).toEqual({ inlets: 0, outlets: 0 });
    });
  });

  describe("lookupObject", () => {
    it("finds canonical objects", () => {
      expect(lookupObject("osc~")).toBeDefined();
      expect(lookupObject("osc~")!.category).toBe("audio");
    });

    it("resolves aliases", () => {
      expect(lookupObject("sel")).toBeDefined();
      expect(lookupObject("sel")!.name).toBe("select");
    });

    it("returns undefined for unknown", () => {
      expect(lookupObject("unknown_thing")).toBeUndefined();
    });
  });

  describe("isAudioObject", () => {
    it("returns true for ~ objects", () => {
      expect(isAudioObject("osc~")).toBe(true);
      expect(isAudioObject("dac~")).toBe(true);
    });

    it("returns false for control objects", () => {
      expect(isAudioObject("metro")).toBe(false);
      expect(isAudioObject("bang")).toBe(false);
    });
  });
});
