import { describe, it, expect } from "vitest";
import {
  parseCppSource,
  enumNameToLabel,
  type ParsedModule,
} from "../../scripts/parse-cpp-enums.js";

// ---------------------------------------------------------------------------
// Helper: quick accessor
// ---------------------------------------------------------------------------

function param(mod: ParsedModule, name: string) {
  return mod.params.find((p) => p.name === name);
}
function input(mod: ParsedModule, name: string) {
  return mod.inputs.find((p) => p.name === name);
}
function output(mod: ParsedModule, name: string) {
  return mod.outputs.find((p) => p.name === name);
}

// ---------------------------------------------------------------------------
// Basic enum parsing
// ---------------------------------------------------------------------------

describe("parseCppSource — basic enums", () => {
  it("parses simple ParamIds", () => {
    const src = `
      enum ParamIds {
        FREQ_PARAM,
        FINE_PARAM,
        NUM_PARAMS
      };
    `;
    const mod = parseCppSource(src);
    expect(mod.params).toHaveLength(2);
    expect(param(mod, "FREQ_PARAM")).toEqual({ name: "FREQ_PARAM", id: 0 });
    expect(param(mod, "FINE_PARAM")).toEqual({ name: "FINE_PARAM", id: 1 });
  });

  it("parses InputIds and OutputIds", () => {
    const src = `
      enum InputIds {
        PITCH_INPUT,
        FM_INPUT,
        NUM_INPUTS
      };
      enum OutputIds {
        SIN_OUTPUT,
        SAW_OUTPUT,
        NUM_OUTPUTS
      };
    `;
    const mod = parseCppSource(src);
    expect(mod.inputs).toHaveLength(2);
    expect(input(mod, "PITCH_INPUT")?.id).toBe(0);
    expect(input(mod, "FM_INPUT")?.id).toBe(1);
    expect(mod.outputs).toHaveLength(2);
    expect(output(mod, "SIN_OUTPUT")?.id).toBe(0);
    expect(output(mod, "SAW_OUTPUT")?.id).toBe(1);
  });

  it("parses LightIds", () => {
    const src = `
      enum LightIds {
        BLINK_LIGHT,
        LIGHTS_LEN
      };
    `;
    const mod = parseCppSource(src);
    expect(mod.lights).toHaveLength(1);
    expect(mod.lights[0]).toEqual({ name: "BLINK_LIGHT", id: 0 });
  });

  it("handles singular form: ParamId (no trailing s)", () => {
    const src = `
      enum ParamId {
        FREQ_PARAM,
        PARAMS_LEN
      };
    `;
    const mod = parseCppSource(src);
    expect(mod.params).toHaveLength(1);
    expect(param(mod, "FREQ_PARAM")?.id).toBe(0);
  });

  it("handles Bogaudio variant: ParamsIds", () => {
    const src = `
      enum ParamsIds {
        FREQUENCY_PARAM,
        NUM_PARAMS
      };
    `;
    const mod = parseCppSource(src);
    expect(mod.params).toHaveLength(1);
    expect(param(mod, "FREQUENCY_PARAM")?.id).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ENUMS macro
// ---------------------------------------------------------------------------

describe("parseCppSource — ENUMS macro", () => {
  it("expands ENUMS(NAME, N) occupying N sequential IDs", () => {
    const src = `
      enum InputIds {
        ENUMS(CH_INPUTS, 4),
        SIDECHAIN_INPUT,
        NUM_INPUTS
      };
    `;
    const mod = parseCppSource(src);
    expect(mod.inputs).toHaveLength(2);
    expect(input(mod, "CH_INPUTS")?.id).toBe(0);
    // SIDECHAIN_INPUT starts at id 4 (after 4 ENUMS slots)
    expect(input(mod, "SIDECHAIN_INPUT")?.id).toBe(4);
  });

  it("handles multiple ENUMS in one enum", () => {
    const src = `
      enum ParamIds {
        ENUMS(LVL_PARAMS, 4),
        ENUMS(PAN_PARAMS, 4),
        MIX_PARAM,
        NUM_PARAMS
      };
    `;
    const mod = parseCppSource(src);
    expect(param(mod, "LVL_PARAMS")?.id).toBe(0);
    expect(param(mod, "PAN_PARAMS")?.id).toBe(4);
    expect(param(mod, "MIX_PARAM")?.id).toBe(8);
  });

  it("handles ENUMS mixed with regular members", () => {
    const src = `
      enum OutputIds {
        MIX_OUTPUT,
        ENUMS(CH_OUTPUTS, 4),
        AUX_OUTPUT,
        NUM_OUTPUTS
      };
    `;
    const mod = parseCppSource(src);
    expect(output(mod, "MIX_OUTPUT")?.id).toBe(0);
    expect(output(mod, "CH_OUTPUTS")?.id).toBe(1);
    expect(output(mod, "AUX_OUTPUT")?.id).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Removed params
// ---------------------------------------------------------------------------

describe("parseCppSource — removed params", () => {
  it("marks members with // removed comment", () => {
    const src = `
      enum ParamIds {
        MODE_PARAM, // removed
        FREQ_PARAM,
        FINE_PARAM, // removed in v2
        NUM_PARAMS
      };
    `;
    const mod = parseCppSource(src);
    expect(mod.params).toHaveLength(3);
    expect(param(mod, "MODE_PARAM")).toEqual({ name: "MODE_PARAM", id: 0, removed: true });
    expect(param(mod, "FREQ_PARAM")).toEqual({ name: "FREQ_PARAM", id: 1 });
    expect(param(mod, "FINE_PARAM")).toEqual({ name: "FINE_PARAM", id: 2, removed: true });
  });

  it("removed params still occupy ID slots", () => {
    const src = `
      enum ParamIds {
        A_PARAM, // removed
        B_PARAM,
        NUM_PARAMS
      };
    `;
    const mod = parseCppSource(src);
    expect(param(mod, "B_PARAM")?.id).toBe(1); // not 0!
  });
});

// ---------------------------------------------------------------------------
// Config labels
// ---------------------------------------------------------------------------

describe("parseCppSource — config labels", () => {
  it("extracts configParam labels with min/max/default", () => {
    const src = `
      enum ParamIds { FREQ_PARAM, NUM_PARAMS };
      configParam(FREQ_PARAM, -76.f, 76.f, 0.f, "Frequency", " Hz");
    `;
    const mod = parseCppSource(src);
    const label = mod.labels.get("FREQ_PARAM");
    expect(label).toBeDefined();
    expect(label!.label).toBe("Frequency");
    expect(label!.min).toBe(-76);
    expect(label!.max).toBe(76);
    expect(label!.default).toBe(0);
  });

  it("extracts configSwitch labels", () => {
    const src = `
      enum ParamIds { MODE_PARAM, NUM_PARAMS };
      configSwitch(MODE_PARAM, 0.f, 2.f, 0.f, "Mode", {"Off", "On", "Auto"});
    `;
    const mod = parseCppSource(src);
    expect(mod.labels.get("MODE_PARAM")?.label).toBe("Mode");
  });

  it("extracts configButton labels", () => {
    const src = `
      enum ParamIds { TRIG_PARAM, NUM_PARAMS };
      configButton(TRIG_PARAM, "Trigger");
    `;
    const mod = parseCppSource(src);
    expect(mod.labels.get("TRIG_PARAM")?.label).toBe("Trigger");
  });

  it("extracts configInput labels", () => {
    const src = `
      enum InputIds { PITCH_INPUT, NUM_INPUTS };
      configInput(PITCH_INPUT, "1V/oct pitch");
    `;
    const mod = parseCppSource(src);
    expect(mod.labels.get("PITCH_INPUT")?.label).toBe("1V/oct pitch");
  });

  it("extracts configOutput labels", () => {
    const src = `
      enum OutputIds { SIN_OUTPUT, NUM_OUTPUTS };
      configOutput(SIN_OUTPUT, "Sine");
    `;
    const mod = parseCppSource(src);
    expect(mod.labels.get("SIN_OUTPUT")?.label).toBe("Sine");
  });
});

// ---------------------------------------------------------------------------
// Sentinel skipping
// ---------------------------------------------------------------------------

describe("parseCppSource — sentinels", () => {
  it("skips NUM_PARAMS sentinel", () => {
    const src = `enum ParamIds { A_PARAM, NUM_PARAMS };`;
    const mod = parseCppSource(src);
    expect(mod.params).toHaveLength(1);
  });

  it("skips PARAMS_LEN sentinel", () => {
    const src = `enum ParamIds { A_PARAM, PARAMS_LEN };`;
    const mod = parseCppSource(src);
    expect(mod.params).toHaveLength(1);
  });

  it("skips INPUTS_LEN and OUTPUTS_LEN", () => {
    const src = `
      enum InputIds { A_INPUT, INPUTS_LEN };
      enum OutputIds { A_OUTPUT, OUTPUTS_LEN };
    `;
    const mod = parseCppSource(src);
    expect(mod.inputs).toHaveLength(1);
    expect(mod.outputs).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Explicit values
// ---------------------------------------------------------------------------

describe("parseCppSource — explicit values", () => {
  it("handles explicit ID assignments", () => {
    const src = `
      enum ParamIds {
        A_PARAM = 0,
        B_PARAM = 5,
        C_PARAM,
        NUM_PARAMS
      };
    `;
    const mod = parseCppSource(src);
    expect(param(mod, "A_PARAM")?.id).toBe(0);
    expect(param(mod, "B_PARAM")?.id).toBe(5);
    expect(param(mod, "C_PARAM")?.id).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Real-world: Fundamental VCO-like
// ---------------------------------------------------------------------------

describe("parseCppSource — VCO-like module", () => {
  it("parses a realistic Fundamental VCO source", () => {
    const src = `
      struct VCO : Module {
        enum ParamIds {
          MODE_PARAM, // removed
          SYNC_PARAM,
          FREQ_PARAM,
          FINE_PARAM, // removed
          FM_PARAM,
          PW_PARAM,
          NUM_PARAMS
        };
        enum InputIds {
          PITCH_INPUT,
          FM_INPUT,
          SYNC_INPUT,
          PW_INPUT,
          NUM_INPUTS
        };
        enum OutputIds {
          SIN_OUTPUT,
          TRI_OUTPUT,
          SAW_OUTPUT,
          SQR_OUTPUT,
          NUM_OUTPUTS
        };
        enum LightIds {
          ENUMS(PHASE_LIGHT, 3),
          LIGHTS_LEN
        };

        VCO() {
          config(NUM_PARAMS, NUM_INPUTS, NUM_OUTPUTS, LIGHTS_LEN);
          configParam(FREQ_PARAM, -76.f, 76.f, 0.f, "Frequency", " Hz");
          configParam(FINE_PARAM, -1.f, 1.f, 0.f, "Fine frequency");
          configParam(FM_PARAM, 0.f, 1.f, 0.f, "FM depth", "%", 0.f, 100.f);
          configParam(PW_PARAM, 0.01f, 0.99f, 0.5f, "Pulse width", "%", 0.f, 100.f);
          configInput(PITCH_INPUT, "1V/oct pitch");
          configInput(FM_INPUT, "Frequency modulation");
          configInput(SYNC_INPUT, "Sync");
          configInput(PW_INPUT, "Pulse width modulation");
          configOutput(SIN_OUTPUT, "Sine");
          configOutput(TRI_OUTPUT, "Triangle");
          configOutput(SAW_OUTPUT, "Saw");
          configOutput(SQR_OUTPUT, "Square");
        }
      };
    `;
    const mod = parseCppSource(src);

    // Params
    expect(mod.params).toHaveLength(6);
    expect(param(mod, "MODE_PARAM")?.removed).toBe(true);
    expect(param(mod, "FINE_PARAM")?.removed).toBe(true);
    expect(param(mod, "FREQ_PARAM")?.id).toBe(2);
    expect(param(mod, "FM_PARAM")?.id).toBe(4);

    // Inputs
    expect(mod.inputs).toHaveLength(4);
    expect(input(mod, "PITCH_INPUT")?.id).toBe(0);

    // Outputs
    expect(mod.outputs).toHaveLength(4);
    expect(output(mod, "SIN_OUTPUT")?.id).toBe(0);
    expect(output(mod, "SQR_OUTPUT")?.id).toBe(3);

    // Lights (ENUMS macro)
    expect(mod.lights).toHaveLength(1);
    expect(mod.lights[0].name).toBe("PHASE_LIGHT");
    expect(mod.lights[0].id).toBe(0);

    // Labels
    expect(mod.labels.get("FREQ_PARAM")?.label).toBe("Frequency");
    expect(mod.labels.get("SIN_OUTPUT")?.label).toBe("Sine");
    expect(mod.labels.get("PITCH_INPUT")?.label).toBe("1V/oct pitch");
  });
});

// ---------------------------------------------------------------------------
// enumNameToLabel fallback
// ---------------------------------------------------------------------------

describe("enumNameToLabel", () => {
  it("strips _PARAM suffix and title-cases", () => {
    expect(enumNameToLabel("FREQ_PARAM")).toBe("Freq");
  });

  it("strips _INPUT suffix", () => {
    expect(enumNameToLabel("PITCH_INPUT")).toBe("Pitch");
  });

  it("strips _OUTPUT suffix", () => {
    expect(enumNameToLabel("SIN_OUTPUT")).toBe("Sin");
  });

  it("handles multi-word names", () => {
    expect(enumNameToLabel("FM_DEPTH_PARAM")).toBe("Fm Depth");
  });

  it("handles names without suffix", () => {
    expect(enumNameToLabel("PHASE_LIGHT")).toBe("Phase");
  });
});

// ---------------------------------------------------------------------------
// Preprocessor directive stripping
// ---------------------------------------------------------------------------

describe("parseCppSource — preprocessor directives", () => {
  it("strips #ifdef preprocessor directives from enum bodies", () => {
    const src = `
      enum InputIds {
        MONO_Q_INPUT,
        #ifdef METAMODULE
        ENUMS(MONO_CHAN_INPUT, 6),
        #endif
        NUM_INPUTS
      };
    `;
    const mod = parseCppSource(src);
    expect(mod.inputs).toHaveLength(1);
    expect(input(mod, "MONO_Q_INPUT")?.id).toBe(0);
  });

  it("strips nested #ifdef blocks without leaking inner content", () => {
    const src = `
      enum ParamIds {
        A_PARAM,
        #ifdef PLATFORM_X
        B_PARAM,
        #ifdef SUBFEATURE
        C_PARAM,
        #endif
        D_PARAM,
        #endif
        E_PARAM,
        NUM_PARAMS
      };
    `;
    const mod = parseCppSource(src);
    expect(mod.params).toHaveLength(2); // A and E only
    expect(param(mod, "A_PARAM")?.id).toBe(0);
    expect(param(mod, "E_PARAM")?.id).toBe(1);
    expect(param(mod, "B_PARAM")).toBeUndefined();
    expect(param(mod, "C_PARAM")).toBeUndefined();
    expect(param(mod, "D_PARAM")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Intra-enum expression resolution
// ---------------------------------------------------------------------------

describe("parseCppSource — expression resolution", () => {
  it("resolves MEMBER + N intra-enum references", () => {
    const src = `
      enum ParamIds {
        CELL_NOTE_PARAM,
        CELL_GATE_PARAM = CELL_NOTE_PARAM + 16,
        RND_NOTES_PARAM = CELL_GATE_PARAM + 16,
        NUM_PARAMS
      };
    `;
    const mod = parseCppSource(src);
    expect(param(mod, "CELL_NOTE_PARAM")?.id).toBe(0);
    expect(param(mod, "CELL_GATE_PARAM")?.id).toBe(16);
    expect(param(mod, "RND_NOTES_PARAM")?.id).toBe(32);
  });

  it("skips members with unresolvable expressions", () => {
    const src = `
      enum ParamIds {
        A_PARAM,
        B_PARAM = sizeof(something),
        C_PARAM,
        NUM_PARAMS
      };
    `;
    const mod = parseCppSource(src);
    expect(mod.params).toHaveLength(2); // A and C only
    expect(param(mod, "A_PARAM")?.id).toBe(0);
    expect(param(mod, "C_PARAM")?.id).toBe(1);
  });

  it("resolves MEMBER - N expressions", () => {
    const src = `
      enum ParamIds {
        A_PARAM = 10,
        B_PARAM = A_PARAM - 3,
        NUM_PARAMS
      };
    `;
    const mod = parseCppSource(src);
    expect(param(mod, "B_PARAM")?.id).toBe(7);
  });
});
