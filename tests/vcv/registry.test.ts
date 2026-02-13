import { describe, it, expect } from "vitest";
import {
  getVcvPlugin,
  getVcvModule,
  resolvePort,
  resolveParam,
  listVcvPlugins,
  listVcvModules,
  formatModuleListing,
  formatModuleDetail,
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

describe("module aliases — Mutable Instruments", () => {
  it("resolves texture_synthesizer → Clouds", () => {
    const mod = getVcvModule("mi", "texture_synthesizer");
    expect(mod.name).toBe("Clouds");
    expect(mod.pluginName).toBe("AudibleInstruments");
  });

  it("resolves tidal_modulator → Tides", () => {
    const mod = getVcvModule("AudibleInstruments", "tidal_modulator");
    expect(mod.name).toBe("Tides");
  });

  it("resolves tidal_modulator_2 → Tides2", () => {
    const mod = getVcvModule("mi", "tidal_modulator_2");
    expect(mod.name).toBe("Tides2");
  });

  it("resolves macro_oscillator → Braids", () => {
    const mod = getVcvModule("mi", "macro_oscillator");
    expect(mod.name).toBe("Braids");
  });

  it("resolves macro_oscillator_2 → Plaits", () => {
    const mod = getVcvModule("mi", "macro_oscillator_2");
    expect(mod.name).toBe("Plaits");
  });

  it("resolves modal_synthesizer → Elements", () => {
    const mod = getVcvModule("mi", "modal_synthesizer");
    expect(mod.name).toBe("Elements");
  });

  it("resolves spectrum_processor → Warps", () => {
    const mod = getVcvModule("mi", "spectrum_processor");
    expect(mod.name).toBe("Warps");
  });

  it("resolves resonator → Rings", () => {
    const mod = getVcvModule("mi", "resonator");
    expect(mod.name).toBe("Rings");
  });

  it("resolves bernoulli_gate → Branches", () => {
    const mod = getVcvModule("mi", "bernoulli_gate");
    expect(mod.name).toBe("Branches");
  });

  it("resolves random_sampler → Marbles", () => {
    const mod = getVcvModule("mi", "random_sampler");
    expect(mod.name).toBe("Marbles");
  });

  it("resolves segment_generator → Stages", () => {
    const mod = getVcvModule("mi", "segment_generator");
    expect(mod.name).toBe("Stages");
  });

  it("resolves liquid_filter → Ripples", () => {
    const mod = getVcvModule("mi", "liquid_filter");
    expect(mod.name).toBe("Ripples");
  });
});

describe("module aliases — Fundamental", () => {
  it("resolves LFO-1 → LFO", () => {
    const mod = getVcvModule("Fundamental", "LFO-1");
    expect(mod.name).toBe("LFO");
  });

  it("resolves VCO-1 → VCO", () => {
    const mod = getVcvModule("Fundamental", "VCO-1");
    expect(mod.name).toBe("VCO");
  });

  it("resolves VCF-1 → VCF", () => {
    const mod = getVcvModule("Fundamental", "VCF-1");
    expect(mod.name).toBe("VCF");
  });

  it("resolves lfo_1 → LFO (underscore variant)", () => {
    const mod = getVcvModule("Fundamental", "lfo_1");
    expect(mod.name).toBe("LFO");
  });
});

describe("formatModuleListing", () => {
  it("lists all modules in Fundamental with version, tags and HP", () => {
    const result = formatModuleListing("Fundamental");
    expect(result).toMatch(/^# Fundamental v[\d.]+ \(\d+ modules\)/);
    expect(result).toContain("VCO");
    expect(result).toContain("VCF");
    expect(result).toContain("LFO");
    expect(result).toContain("hp");
  });

  it("lists AudibleInstruments via alias with version", () => {
    const result = formatModuleListing("mi");
    expect(result).toMatch(/^# AudibleInstruments v[\d.]+/);
    expect(result).toContain("Clouds");
    expect(result).toContain("Braids");
  });
});

describe("formatModuleDetail", () => {
  it("shows full detail for VCO with version", () => {
    const result = formatModuleDetail("Fundamental", "VCO");
    expect(result).toMatch(/# Fundamental v[\d.]+ \/ VCO/);
    expect(result).toContain("Inputs:");
    expect(result).toContain("Outputs:");
    expect(result).toContain("Params:");
    expect(result).toContain("PITCH_INPUT");
    expect(result).toContain("SIN_OUTPUT");
    expect(result).toContain("FREQ_PARAM");
  });

  it("shows full detail for Clouds with version", () => {
    const result = formatModuleDetail("mi", "Clouds");
    expect(result).toMatch(/# AudibleInstruments v[\d.]+ \/ Clouds/);
    expect(result).toContain("Inputs:");
    expect(result).toContain("Outputs:");
  });

  it("shows param ranges", () => {
    const result = formatModuleDetail("Fundamental", "VCO");
    // Frequency param should have range info
    expect(result).toMatch(/Frequency \(FREQ_PARAM\) \[/);
  });

  it("resolves alias in detail view", () => {
    const result = formatModuleDetail("mi", "texture_synthesizer");
    expect(result).toMatch(/# AudibleInstruments v[\d.]+ \/ Clouds/);
  });
});
