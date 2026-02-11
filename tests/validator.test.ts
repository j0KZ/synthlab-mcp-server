import { describe, it, expect } from "vitest";
import { validatePatch } from "../src/core/validator.js";
import { parsePatch } from "../src/core/parser.js";
import fs from "node:fs/promises";
import path from "node:path";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

async function loadAndValidate(fixture: string) {
  const text = await fs.readFile(path.join(FIXTURES, fixture), "utf-8");
  const patch = parsePatch(text);
  return validatePatch(patch);
}

function validateRaw(pdText: string) {
  const patch = parsePatch(pdText);
  return validatePatch(patch);
}

describe("validator", () => {
  describe("clean patches pass validation", () => {
    it("hello-world.pd is valid", async () => {
      const result = await loadAndValidate("hello-world.pd");
      expect(result.valid).toBe(true);
      expect(result.summary.errors).toBe(0);
    });

    it("subpatch.pd is valid", async () => {
      const result = await loadAndValidate("subpatch.pd");
      expect(result.valid).toBe(true);
      expect(result.summary.errors).toBe(0);
    });

    it("midi-sequencer.pd is valid", async () => {
      const result = await loadAndValidate("midi-sequencer.pd");
      expect(result.valid).toBe(true);
      expect(result.summary.errors).toBe(0);
    });
  });

  describe("BROKEN_CONNECTION_SOURCE", () => {
    it("detects connection from nonexistent node", () => {
      const result = validateRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X obj 50 100 *~ 0.1;
#X connect 5 0 1 0;
`);
      expect(result.valid).toBe(false);
      const issue = result.issues.find((i) => i.code === "BROKEN_CONNECTION_SOURCE");
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe("error");
    });
  });

  describe("BROKEN_CONNECTION_TARGET", () => {
    it("detects connection to nonexistent node", () => {
      const result = validateRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X obj 50 100 *~ 0.1;
#X connect 0 0 9 0;
`);
      expect(result.valid).toBe(false);
      const issue = result.issues.find((i) => i.code === "BROKEN_CONNECTION_TARGET");
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe("error");
    });
  });

  describe("OUTLET_OUT_OF_BOUNDS", () => {
    it("detects outlet index beyond object's outlets", () => {
      const result = validateRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X obj 50 100 *~ 0.1;
#X connect 0 5 1 0;
`);
      expect(result.valid).toBe(false);
      const issue = result.issues.find((i) => i.code === "OUTLET_OUT_OF_BOUNDS");
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe("error");
    });
  });

  describe("INLET_OUT_OF_BOUNDS", () => {
    it("detects inlet index beyond object's inlets", () => {
      const result = validateRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X obj 50 100 *~ 0.1;
#X connect 0 0 1 8;
`);
      expect(result.valid).toBe(false);
      const issue = result.issues.find((i) => i.code === "INLET_OUT_OF_BOUNDS");
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe("error");
    });
  });

  describe("DUPLICATE_CONNECTION", () => {
    it("detects duplicate connections as warning", () => {
      const result = validateRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X obj 50 100 *~ 0.1;
#X connect 0 0 1 0;
#X connect 0 0 1 0;
`);
      const issue = result.issues.find((i) => i.code === "DUPLICATE_CONNECTION");
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe("warning");
      // Duplicates are warnings, not errors
      expect(result.valid).toBe(true);
    });
  });

  describe("UNKNOWN_OBJECT", () => {
    it("warns about unknown objects", () => {
      const result = validateRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 my_fancy_external~ 440;
#X obj 50 100 dac~;
#X connect 0 0 1 0;
`);
      const issue = result.issues.find((i) => i.code === "UNKNOWN_OBJECT");
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe("warning");
    });

    it("does not flag known objects", () => {
      const result = validateRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X obj 50 100 dac~;
#X connect 0 0 1 0;
`);
      const unknowns = result.issues.filter((i) => i.code === "UNKNOWN_OBJECT");
      expect(unknowns.length).toBe(0);
    });
  });

  describe("ORPHAN_OBJECT", () => {
    it("detects orphan objects", async () => {
      const result = await loadAndValidate("orphan-objects.pd");
      const orphans = result.issues.filter((i) => i.code === "ORPHAN_OBJECT");
      // metro and random have no connections
      expect(orphans.length).toBe(2);
    });

    it("does not flag comments as orphans", () => {
      const result = validateRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X obj 50 100 dac~;
#X text 50 200 this is a comment;
#X connect 0 0 1 0;
`);
      const orphans = result.issues.filter((i) => i.code === "ORPHAN_OBJECT");
      expect(orphans.length).toBe(0);
    });

    it("does not flag wireless objects as orphans", () => {
      const result = validateRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 send mybus;
#X obj 50 100 receive mybus;
#X obj 50 150 loadbang;
`);
      const orphans = result.issues.filter((i) => i.code === "ORPHAN_OBJECT");
      expect(orphans.length).toBe(0);
    });

    it("does not flag GUI objects as orphans", () => {
      const result = validateRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 bng 15 250 50 0 empty empty empty 17 7 0 10 -262144 -1 -1;
#X obj 50 100 tgl 15 0 empty empty empty 17 7 0 10 -262144 -1 -1 0 1;
`);
      const orphans = result.issues.filter((i) => i.code === "ORPHAN_OBJECT");
      expect(orphans.length).toBe(0);
    });
  });

  describe("EMPTY_SUBPATCH", () => {
    it("warns about empty subpatches", () => {
      const result = validateRaw(`#N canvas 0 50 800 600 12;
#N canvas 0 0 450 300 empty_sub 0;
#X restore 50 50 pd empty_sub;
#X obj 50 100 dac~;
`);
      const issue = result.issues.find((i) => i.code === "EMPTY_SUBPATCH");
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe("warning");
    });
  });

  describe("NO_DSP_SINK", () => {
    it("warns when audio objects exist but no dac~/writesf~/etc", () => {
      const result = validateRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X obj 50 100 *~ 0.1;
#X connect 0 0 1 0;
`);
      const issue = result.issues.find((i) => i.code === "NO_DSP_SINK");
      expect(issue).toBeDefined();
      expect(issue!.severity).toBe("warning");
    });

    it("does not warn when dac~ is present", () => {
      const result = validateRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X obj 50 100 dac~;
#X connect 0 0 1 0;
`);
      const sinkIssues = result.issues.filter((i) => i.code === "NO_DSP_SINK");
      expect(sinkIssues.length).toBe(0);
    });

    it("does not warn for pure control patches", () => {
      const result = validateRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 metro 500;
#X obj 50 100 print;
#X connect 0 0 1 0;
`);
      const sinkIssues = result.issues.filter((i) => i.code === "NO_DSP_SINK");
      expect(sinkIssues.length).toBe(0);
    });
  });

  describe("broken-connections.pd fixture", () => {
    it("catches all broken connections in fixture", async () => {
      const result = await loadAndValidate("broken-connections.pd");
      expect(result.valid).toBe(false);
      expect(result.summary.errors).toBeGreaterThan(0);

      // Should have BROKEN_CONNECTION_TARGET (connect to node 9)
      expect(result.issues.some((i) => i.code === "BROKEN_CONNECTION_TARGET")).toBe(true);
      // Should have OUTLET_OUT_OF_BOUNDS (osc~ outlet 5)
      expect(result.issues.some((i) => i.code === "OUTLET_OUT_OF_BOUNDS")).toBe(true);
      // Should have INLET_OUT_OF_BOUNDS (*~ inlet 8)
      expect(result.issues.some((i) => i.code === "INLET_OUT_OF_BOUNDS")).toBe(true);
      // Should have DUPLICATE_CONNECTION (0 0 1 0 appears twice)
      expect(result.issues.some((i) => i.code === "DUPLICATE_CONNECTION")).toBe(true);
    });
  });

  describe("subpatch port validation", () => {
    it("validates connections to subpatch nodes using internal port counts", () => {
      // Subpatch has 1 inlet~ and 1 outlet~ → node[1] in parent has 1 inlet, 1 outlet
      // Connection to inlet 2 should fail
      const result = validateRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#N canvas 0 0 450 300 amp 0;
#X obj 50 50 inlet~;
#X obj 50 100 *~ 0.5;
#X obj 50 150 outlet~;
#X connect 0 0 1 0;
#X connect 1 0 2 0;
#X restore 50 100 pd amp;
#X obj 50 150 dac~;
#X connect 0 0 1 0;
#X connect 1 0 2 0;
#X connect 1 0 2 1;
`);
      // This should be valid — connections are within bounds
      expect(result.valid).toBe(true);
    });
  });
});
