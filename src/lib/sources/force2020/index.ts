/**
 * The FORCE 2020 log adapter: a petrodb dataset read from petroviz's Data
 * host, so it lives outside welllog/ (ADR-0004). It may import welllog/core,
 * hyparquet and fzstd.
 */

export { loadWell, ForceLoadError, type ForceHosts, type ForceLoadErrorKind, type LoadWellOptions } from "./load.ts";
export { isWellId } from "./wellId.ts";
