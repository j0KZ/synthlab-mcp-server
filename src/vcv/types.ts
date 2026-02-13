/**
 * VCV Rack patch generation types.
 *
 * Three layers:
 *   1. Registry — scraped from C++ source (VcvPortDef, VcvParamDef, VcvModuleDef, VcvPluginRegistry)
 *   2. User spec — AI-facing input (VcvModuleSpec, VcvCableSpec, VcvPatchSpec)
 *   3. Serialized JSON — .vcv file output (VcvModuleJson, VcvCableJson, VcvPatchJson)
 */

// ---------------------------------------------------------------------------
// Registry types (scraped from C++ source enums + configParam/configInput/etc.)
// ---------------------------------------------------------------------------

export interface VcvPortDef {
  id: number;
  name: string;
  label: string;
}

export interface VcvParamDef extends VcvPortDef {
  min?: number;
  max?: number;
  default?: number;
  /** Enum slot still occupied but param removed from panel. */
  removed?: boolean;
}

export interface VcvModuleDef {
  name: string;
  hp: number;
  tags: string[];
  params: VcvParamDef[];
  inputs: VcvPortDef[];
  outputs: VcvPortDef[];
}

export interface VcvPluginRegistry {
  plugin: string;
  version: string;
  modules: Record<string, VcvModuleDef>;
}

// ---------------------------------------------------------------------------
// User-facing spec (AI provides this to generate_vcv tool)
// ---------------------------------------------------------------------------

export interface VcvModuleSpec {
  plugin: string;
  model: string;
  params?: Record<string, number>;
}

export interface VcvCableSpec {
  from: { module: number; port: string };
  to: { module: number; port: string };
  color?: string;
}

export interface VcvPatchSpec {
  modules: VcvModuleSpec[];
  cables?: VcvCableSpec[];
}

// ---------------------------------------------------------------------------
// Serialized .vcv JSON (plain JSON v1 format, loaded by VCV Rack 2.x)
// ---------------------------------------------------------------------------

export interface VcvModuleJson {
  id: number;
  plugin: string;
  model: string;
  version: string;
  params: Array<{ id: number; value: number }>;
  pos: [number, number];
  leftModuleId: number | null;
  rightModuleId: number | null;
  data?: Record<string, unknown>;
}

export interface VcvCableJson {
  id: number;
  outputModuleId: number;
  outputId: number;
  inputModuleId: number;
  inputId: number;
  color: string;
}

export interface VcvPatchJson {
  version: string;
  modules: VcvModuleJson[];
  cables: VcvCableJson[];
}
