/**
 * The discrete track kind: one discrete curve entry, drawn as blocks of
 * colour per code, with the code's pattern hatched over it. Opaque and as
 * stored in both themes (#37).
 */

import { valueAt, type Curve, type WellLog } from "../../../core/index.ts";
import { fillDiscreteBlocks } from "../../canvas.ts";
import { unknownCodeColours } from "../../colour/categorical.ts";
import { GAP, NO_VALUE } from "../../format.ts";
import { discreteBlocks } from "../../geometry/blocks.ts";
import { matchEntries } from "../../match.ts";
import { discreteFamilyDefaults } from "../../template/defaults.ts";
import { familyLabel } from "../../template/label.ts";
import type { CodeStyle, DiscreteEntry, DiscreteTrack } from "../../template/types.ts";
import type { MatchedEntry, ResolvedTrackBase, TrackKind } from "../types.ts";

export interface ResolvedDiscreteTrack extends ResolvedTrackBase<DiscreteTrack, MatchedEntry<DiscreteEntry>> {
  /** Every code in the matched curve → how it is drawn; empty when nothing matched. */
  readonly styles: ReadonlyMap<number, CodeStyle>;
}

/** A discrete curve's name: its family label, or its mnemonic when the family has none. */
export function discreteCurveName(curve: Curve): string {
  return curve.family === "unknown" ? curve.mnemonic : familyLabel(curve.family);
}

/** A discrete curve's reading at `md`: "gap", "—", or its code's label, else the raw code. */
export function codeLabelAt(log: WellLog, curve: Curve, md: number, gap: boolean): string {
  if (gap) return GAP;
  const code = valueAt(log, curve, md);
  return Number.isNaN(code) ? NO_VALUE : (curve.codes?.[String(code)] ?? String(code));
}

/**
 * How each of a curve's codes is drawn: the template's code map, else the
 * curve family default, else a hashed categorical colour with no pattern.
 */
export function codeStyles(curve: Curve, overrides: Readonly<Record<string, CodeStyle>> = {}): Map<number, CodeStyle> {
  const familyCodes = discreteFamilyDefaults[curve.family]?.codes ?? {};
  const known = (code: number) => {
    const name = String(code);
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (Object.hasOwn(familyCodes, name)) return familyCodes[name];
    return undefined;
  };

  const codes = new Set<number>();
  for (const v of curve.values) if (!Number.isNaN(v)) codes.add(v);
  const styles = new Map<number, CodeStyle>();
  const unknown: number[] = [];
  for (const code of codes) {
    const style = known(code);
    if (style) styles.set(code, style);
    else unknown.push(code);
  }
  for (const [code, colour] of unknownCodeColours(unknown)) styles.set(code, { colour });
  return styles;
}

export const discreteKind: TrackKind<DiscreteTrack, ResolvedDiscreteTrack> = {
  resolve(track, log) {
    const [curve] = matchEntries([track.curve], log.curves.filter((c) => c.kind === "discrete"));
    return {
      kind: "discrete",
      track,
      entries: [{ entry: track.curve, curve }],
      styles: curve ? codeStyles(curve, track.curve.codes) : new Map(),
    };
  },

  read(resolved, { log, md, gap }) {
    const [{ curve }] = resolved.entries;
    return [curve ? codeLabelAt(log, curve, md, gap) : null];
  },

  draw(ctx, resolved, { axis, frame, dpr }) {
    const [{ curve }] = resolved.entries;
    if (!curve) return;
    fillDiscreteBlocks(ctx, discreteBlocks(axis.depths, curve.values, frame), resolved.styles, frame, dpr);
  },
};
