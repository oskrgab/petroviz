/**
 * welllog/view: the log view. May import welllog/core and svelte (ADR-0004).
 */

export { default as LogView } from "./LogView.svelte";
export { resolveTemplate, type ResolvedTemplate } from "./resolve.ts";
export { curveFamilyDefaults, defaultTemplate, type CurveFamilyDefault } from "./template/defaults.ts";
export type * from "./template/types.ts";
export type { DepthInterval, DepthRef } from "./interval.ts";
