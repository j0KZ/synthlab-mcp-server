import { describe, it, expect } from "vitest";
import { positionModules } from "../../src/vcv/positioner.js";
import type { VcvModuleDef, VcvModuleJson } from "../../src/vcv/types.js";

function makePair(hp: number, id: number): { def: VcvModuleDef; json: VcvModuleJson } {
  return {
    def: { name: `Mod${id}`, hp, tags: [], params: [], inputs: [], outputs: [] },
    json: {
      id,
      plugin: "Test",
      model: `Mod${id}`,
      version: "1.0.0",
      params: [],
      pos: [0, 0],
      leftModuleId: null,
      rightModuleId: null,
    },
  };
}

describe("positionModules", () => {
  it("positions single module at [0, 0]", () => {
    const modules = [makePair(10, 1)];
    positionModules(modules);
    expect(modules[0].json.pos).toEqual([0, 0]);
    expect(modules[0].json.leftModuleId).toBeNull();
    expect(modules[0].json.rightModuleId).toBeNull();
  });

  it("positions two modules side-by-side", () => {
    const modules = [makePair(10, 1), makePair(6, 2)];
    positionModules(modules);
    expect(modules[0].json.pos).toEqual([0, 0]);
    expect(modules[1].json.pos).toEqual([10, 0]);
  });

  it("sets left/right adjacency chain", () => {
    const modules = [makePair(10, 100), makePair(6, 200), makePair(14, 300)];
    positionModules(modules);

    expect(modules[0].json.leftModuleId).toBeNull();
    expect(modules[0].json.rightModuleId).toBe(200);

    expect(modules[1].json.leftModuleId).toBe(100);
    expect(modules[1].json.rightModuleId).toBe(300);

    expect(modules[2].json.leftModuleId).toBe(200);
    expect(modules[2].json.rightModuleId).toBeNull();
  });

  it("accumulates different HP widths correctly", () => {
    const modules = [makePair(10, 1), makePair(6, 2), makePair(14, 3)];
    positionModules(modules);
    expect(modules[0].json.pos[0]).toBe(0);
    expect(modules[1].json.pos[0]).toBe(10);
    expect(modules[2].json.pos[0]).toBe(16); // 10 + 6
  });

  it("handles empty array without error", () => {
    const modules: Array<{ def: VcvModuleDef; json: VcvModuleJson }> = [];
    positionModules(modules);
    expect(modules).toHaveLength(0);
  });
});
