/**
 * MCP tool handler for list_vcv_modules.
 *
 * Discovery tool — lets Claude look up exact module slugs and port names
 * BEFORE calling generate_vcv, eliminating trial-and-error.
 */

import { formatModuleListing, formatModuleDetail } from "../vcv/registry.js";

/**
 * Execute module listing / detail lookup.
 */
export function executeListVcvModules(input: {
  plugin: string;
  module?: string;
}): string {
  const module = typeof input.module === "string" && input.module.trim()
    ? input.module.trim()
    : undefined;

  if (module) {
    return formatModuleDetail(input.plugin, module);
  }
  return formatModuleListing(input.plugin);
}
