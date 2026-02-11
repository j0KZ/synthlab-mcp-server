import { describe, it, expect } from "vitest";
import { analyzePatch } from "../src/tools/analyze.js";
import { parsePatch } from "../src/core/parser.js";
import fs from "node:fs/promises";
import path from "node:path";

const FIXTURES = path.join(import.meta.dirname, "fixtures");

async function loadAndAnalyze(fixture: string) {
  const text = await fs.readFile(path.join(FIXTURES, fixture), "utf-8");
  const patch = parsePatch(text);
  return analyzePatch(patch);
}

function analyzeRaw(pdText: string) {
  const patch = parsePatch(pdText);
  return analyzePatch(patch);
}

describe("analyzer", () => {
  describe("object counts", () => {
    it("counts objects in hello-world.pd", async () => {
      const result = await loadAndAnalyze("hello-world.pd");
      expect(result.totalObjects).toBe(3);
      expect(result.totalConnections).toBe(3);
      expect(result.objectCounts["audio"]).toBeGreaterThan(0);
    });

    it("counts objects in complex-patch.pd including subpatch", async () => {
      const result = await loadAndAnalyze("complex-patch.pd");
      // Root: 13 nodes, subpatch: 6 nodes = 19 total
      expect(result.totalObjects).toBeGreaterThan(15);
      expect(result.objectCounts["audio"]).toBeGreaterThan(0);
      expect(result.objectCounts["control"]).toBeGreaterThan(0);
    });

    it("counts across categories", async () => {
      const result = await loadAndAnalyze("midi-sequencer.pd");
      expect(result.objectCounts).toBeDefined();
      expect(Object.keys(result.objectCounts).length).toBeGreaterThan(0);
    });
  });

  describe("signal flow graph", () => {
    it("builds adjacency list for simple patch", () => {
      const result = analyzeRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X obj 50 100 *~ 0.1;
#X obj 50 150 dac~;
#X connect 0 0 1 0;
#X connect 1 0 2 0;
#X connect 1 0 2 1;
`);
      expect(result.signalFlow.edges.size).toBe(3);
      expect(result.signalFlow.hasCycles).toBe(false);
      expect(result.signalFlow.topologicalOrder).toEqual([0, 1, 2]);
    });

    it("detects cycles (feedback)", () => {
      const result = analyzeRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X obj 50 100 +~;
#X obj 50 150 dac~;
#X connect 0 0 1 0;
#X connect 1 0 0 0;
#X connect 1 0 2 0;
`);
      expect(result.signalFlow.hasCycles).toBe(true);
    });
  });

  describe("DSP chain detection", () => {
    it("finds audio chain osc~ → *~ → dac~", () => {
      const result = analyzeRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 osc~ 440;
#X obj 50 100 *~ 0.1;
#X obj 50 150 dac~;
#X connect 0 0 1 0;
#X connect 1 0 2 0;
#X connect 1 0 2 1;
`);
      expect(result.dspChains.length).toBeGreaterThan(0);
      // Chain should include osc~ → *~ → dac~
      const chain = result.dspChains[0];
      expect(chain.names).toContain("osc~");
      expect(chain.names).toContain("dac~");
    });

    it("finds no DSP chains in pure control patch", () => {
      const result = analyzeRaw(`#N canvas 0 50 800 600 12;
#X obj 50 50 metro 500;
#X obj 50 100 random 100;
#X obj 50 150 print;
#X connect 0 0 1 0;
#X connect 1 0 2 0;
`);
      expect(result.dspChains.length).toBe(0);
    });

    it("finds no root-level chains in complex-patch.pd (crosses subpatch boundary)", async () => {
      const result = await loadAndAnalyze("complex-patch.pd");
      // DSP chain detection is single-canvas only (Phase 2 limitation).
      // The audio path goes osc~ → *~ → +~ → [pd reverb] → dac~
      // but [pd reverb] is a subpatch node, not recognized as audio in root canvas.
      // Cross-subpatch chain traversal is deferred to Phase 3.
      expect(result.dspChains.length).toBe(0);
    });
  });

  describe("complexity score", () => {
    it("hello-world is trivial/simple", async () => {
      const result = await loadAndAnalyze("hello-world.pd");
      expect(result.complexity.score).toBeLessThanOrEqual(35);
      expect(["trivial", "simple"]).toContain(result.complexity.label);
    });

    it("complex-patch has higher complexity", async () => {
      const result = await loadAndAnalyze("complex-patch.pd");
      expect(result.complexity.score).toBeGreaterThan(20);
    });

    it("score is between 0 and 100", async () => {
      const result = await loadAndAnalyze("complex-patch.pd");
      expect(result.complexity.score).toBeGreaterThanOrEqual(0);
      expect(result.complexity.score).toBeLessThanOrEqual(100);
    });

    it("factors are within their caps", async () => {
      const result = await loadAndAnalyze("complex-patch.pd");
      const f = result.complexity.factors;
      expect(f.objectFactor).toBeLessThanOrEqual(30);
      expect(f.densityFactor).toBeLessThanOrEqual(20);
      expect(f.depthFactor).toBeLessThanOrEqual(15);
      expect(f.audioFactor).toBeLessThanOrEqual(20);
      expect(f.uniqueFactor).toBeLessThanOrEqual(15);
    });
  });

  describe("subpatch depth", () => {
    it("hello-world has depth 0", async () => {
      const result = await loadAndAnalyze("hello-world.pd");
      expect(result.subpatchDepth).toBe(0);
    });

    it("subpatch.pd has depth 1", async () => {
      const result = await loadAndAnalyze("subpatch.pd");
      expect(result.subpatchDepth).toBe(1);
    });

    it("complex-patch.pd has depth 1", async () => {
      const result = await loadAndAnalyze("complex-patch.pd");
      expect(result.subpatchDepth).toBe(1);
    });
  });

  describe("validation integration", () => {
    it("includes validation results", async () => {
      const result = await loadAndAnalyze("hello-world.pd");
      expect(result.validation).toBeDefined();
      expect(result.validation.valid).toBe(true);
    });

    it("reports validation issues", async () => {
      const result = await loadAndAnalyze("broken-connections.pd");
      expect(result.validation.valid).toBe(false);
      expect(result.validation.summary.errors).toBeGreaterThan(0);
    });
  });
});
