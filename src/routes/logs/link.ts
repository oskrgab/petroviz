/**
 * The log view's link rules (ADR-0005): what `/logs?well=…&ref=…&md=…`
 * names, and how the host writes it back. Kept apart from the page so they
 * run under node --test.
 */

import { isWellId } from "../../lib/sources/force2020/wellId.ts";
import type { DepthInterval, DepthRef } from "../../lib/welllog/view/interval.ts";

/** The well a link without `well` or `las` opens, as a file stem. */
export const DEFAULT_WELL = "35-11-11";

/** Where a link's well log comes from. */
export type LinkSource =
  /** Neither `well` nor `las`: the page opens the default well. */
  | { readonly kind: "none" }
  /** A FORCE 2020 well, by its file stem. */
  | { readonly kind: "well"; readonly id: string }
  /** A `well` that fails the well id check, so no URL is built from it. */
  | { readonly kind: "unknown-well"; readonly name: string }
  /** A LAS file opened from disk, by its file name. */
  | { readonly kind: "las"; readonly fileName: string };

export interface LogLink {
  readonly source: LinkSource;
  readonly ref: DepthRef;
  /** In MD whatever `ref` is; null shows the whole well. */
  readonly interval: DepthInterval | null;
}

/** A decimal, signed or not, with no exponent: `-25.5`, `2100`, `2100.0`. */
const DEPTH = String.raw`-?\d+(?:\.\d+)?`;
const MD = new RegExp(`^(${DEPTH})-(${DEPTH})$`);

/** MD rounded to 0.1, never -0. */
export function roundMd(md: number): number {
  return Math.round(md * 10) / 10 + 0;
}

function parseSource(params: URLSearchParams): LinkSource {
  const fileName = params.get("las");
  if (fileName) return { kind: "las", fileName };
  const well = params.get("well");
  if (!well) return { kind: "none" };
  return isWellId(well) ? { kind: "well", id: well } : { kind: "unknown-well", name: well };
}

/** `<top>-<base>`, or null when it won't parse or its top isn't above its base. */
function parseMd(md: string | null): DepthInterval | null {
  const match = md === null ? null : MD.exec(md);
  if (!match) return null;
  const top = Number(match[1]);
  const base = Number(match[2]);
  return top < base ? { top, base } : null;
}

/**
 * What a link names. `las` wins over `well`. A bad `md` is dropped, so the
 * whole well is shown; an `md` outside the well is kept, for the log view to
 * clamp. Anything but `ref=tvdss` is MD.
 */
export function parseLink(params: URLSearchParams): LogLink {
  return {
    source: parseSource(params),
    ref: params.get("ref")?.toLowerCase() === "tvdss" ? "tvdss" : "md",
    interval: parseMd(params.get("md")),
  };
}

/**
 * The query that names `link`: `well` or `las`, then `ref` (absent for MD),
 * then `md` rounded to 0.1. An interval narrower than that keeps a tenth, so
 * the link still parses.
 */
export function writeLink(link: LogLink): URLSearchParams {
  const params = new URLSearchParams();
  const { source, ref, interval } = link;
  if (source.kind === "well") params.set("well", source.id);
  else if (source.kind === "unknown-well") params.set("well", source.name);
  else if (source.kind === "las") params.set("las", source.fileName);
  if (ref === "tvdss") params.set("ref", "tvdss");
  if (interval) {
    const top = roundMd(interval.top);
    const base = Math.max(roundMd(interval.base), roundMd(top + 0.1));
    params.set("md", `${top.toFixed(1)}-${base.toFixed(1)}`);
  }
  return params;
}
