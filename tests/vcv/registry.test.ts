import { describe, it, expect } from "vitest";
import {
  getVcvPlugin,
  getVcvModule,
  resolvePort,
  resolveParam,
  listVcvPlugins,
  listVcvModules,
} from "../../src/vcv/registry.js";

describe("getVcvPlugin", () => {
  it("loads Core plugin", () => {
    const p = getVcvPlugin("Core");
    expect(p.plugin).toBe("Core");
    expect(p.modules).toHaveProperty("AudioInterface2");
  });

  it("loads Fundamental plugin", () => {
    const p = getVcvPlugin("Fundamental");
    expect(p.plugin).toBe("Fundamental");
    expect(p.modules).toHaveProperty("VCO");
  });

  it("is case-insensitive", () => {
    expect(getVcvPlugin("core").plugin).toBe("Core");
    expect(getVcvPlugin("FUNDAMENTAL").plugin).toBe("Fundamental");
  });

  it("resolves aliases", () => {
    expect(getVcvPlugin("vcv").plugin).toBe("Fundamental");
  });

  it("throws for unknown plugin", () => {
    expect(() => getVcvPlugin("NonExistent")).toThrow(/Unknown VCV plugin/);
  });
});

describe("getVcvModule", () => {
  it("gets VCO from Fundamental", () => {
    const mod = getVcvModule("Fundamental", "VCO");
    expect(mod.name).toBe("VCO");
    expect(mod.pluginName).toBe("Fundamental");
    expect(mod.pluginVersion).toBe("2.6.4");
    expect(mod.params.length).toBeGreaterThan(0);
    expect(mod.inputs.length).toBeGreaterThan(0);
    expect(mod.outputs.length).toBeGreaterThan(0);
  });

  it("gets AudioInterface2 from Core", () => {
    const mod = getVcvModule("Core", "AudioInterface2");
    expect(mod.name).toBe("AudioInterface2");
    expect(mod.inputs.length).toBe(2);
    expect(mod.outputs.length).toBe(2);
  });

  it("is case-insensitive on model", () => {
    const mod = getVcvModule("Fundamental", "vco");
    expect(mod.name).toBe("VCO");
  });

  it("throws for unknown module", () => {
    expect(() => getVcvModule("Fundamental", "Nonexistent")).toThrow(/Unknown module/);
  });
});

describe("resolvePort", () => {
  it("resolves output by label", () => {
    const mod = getVcvModule("Fundamental", "VCO");
    const port = resolvePort(mod, "Sine", "output");
    expect(port.name).toBe("SIN_OUTPUT");
  });

  it("resolves input by label", () => {
    const mod = getVcvModule("Fundamental", "VCO");
    const port = resolvePort(mod, "1V/octave pitch", "input");
    expect(port.name).toBe("PITCH_INPUT");
  });

  it("resolves by enum name", () => {
    const mod = getVcvModule("Fundamental", "VCO");
    const port = resolvePort(mod, "SAW_OUTPUT", "output");
    expect(port.label).toMatch(/saw/i);
  });

  it("resolves by partial label", () => {
    const mod = getVcvModule("Fundamental", "VCO");
    const port = resolvePort(mod, "sine", "output");
    expect(port.name).toBe("SIN_OUTPUT");
  });

  it("resolves by numeric ID", () => {
    const mod = getVcvModule("Core", "AudioInterface2");
    const port = resolvePort(mod, "0", "input");
    expect(port.id).toBe(0);
  });

  it("throws for unknown port", () => {
    const mod = getVcvModule("Fundamental", "VCO");
    expect(() => resolvePort(mod, "Nonexistent", "output")).toThrow(/Unknown output port/);
  });
});

describe("resolveParam", () => {
  it("resolves by label", () => {
    const mod = getVcvModule("Fundamental", "VCO");
    const param = resolveParam(mod, "Frequency");
    expect(param.name).toBe("FREQ_PARAM");
  });

  it("resolves by enum name", () => {
    const mod = getVcvModule("Fundamental", "VCO");
    const param = resolveParam(mod, "FREQ_PARAM");
    expect(param.label).toBe("Frequency");
  });

  it("skips removed params", () => {
    const mod = getVcvModule("Fundamental", "VCF");
    // FINE_PARAM (id:1) is removed — "Fine" should not resolve
    expect(() => resolveParam(mod, "Fine")).toThrow(/Unknown param/);
  });

  it("throws for unknown param", () => {
    const mod = getVcvModule("Fundamental", "VCO");
    expect(() => resolveParam(mod, "Nonexistent")).toThrow(/Unknown param/);
  });
});

describe("list functions", () => {
  it("lists available plugins", () => {
    const plugins = listVcvPlugins();
    expect(plugins).toContain("Core");
    expect(plugins).toContain("Fundamental");
    expect(plugins).toContain("Bogaudio");
    expect(plugins).toContain("AudibleInstruments");
    expect(plugins.length).toBeGreaterThanOrEqual(15);
  });

  it("lists modules in a plugin", () => {
    const modules = listVcvModules("Fundamental");
    expect(modules).toContain("VCO");
    expect(modules).toContain("VCF");
  });
});

describe("expanded registry — new plugins", () => {
  it("loads Bogaudio with 111 modules", () => {
    const modules = listVcvModules("Bogaudio");
    expect(modules.length).toBe(111);
    expect(modules).toContain("Bogaudio-VCO");
  });

  it("resolves Bogaudio VCO ports from .hpp", () => {
    const mod = getVcvModule("Bogaudio", "Bogaudio-VCO");
    expect(mod.outputs.length).toBe(4);
    const saw = resolvePort(mod, "Saw", "output");
    expect(saw.name).toBe("SAW_OUTPUT");
  });

  it("loads CountModula", () => {
    const modules = listVcvModules("CountModula");
    expect(modules.length).toBeGreaterThan(50);
  });

  it("loads ImpromptuModular", () => {
    const modules = listVcvModules("ImpromptuModular");
    expect(modules.length).toBeGreaterThan(20);
  });

  it("loads Befaco", () => {
    const modules = listVcvModules("Befaco");
    expect(modules.length).toBe(32);
  });

  it("loads AudibleInstruments (Mutable)", () => {
    const p = getVcvPlugin("mi");
    expect(p.plugin).toBe("AudibleInstruments");
    expect(Object.keys(p.modules).length).toBe(20);
  });

  it("loads Valley", () => {
    const modules = listVcvModules("Valley");
    expect(modules.length).toBe(8);
  });

  it("loads stoermelder-packone via alias", () => {
    const p = getVcvPlugin("stoermelder");
    expect(p.plugin).toBe("stoermelder-packone");
  });

  it("loads ML_modules", () => {
    const modules = listVcvModules("ML_modules");
    expect(modules.length).toBeGreaterThan(20);
  });

  it("resolves Bogaudio alias 'bg'", () => {
    const p = getVcvPlugin("bg");
    expect(p.plugin).toBe("Bogaudio");
  });
});
