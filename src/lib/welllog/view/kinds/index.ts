/**
 * The track kind registry. `Track` is a closed union, and the mapped type on
 * `kinds` makes TypeScript reject a kind with no entry, or an entry for a kind
 * the union lacks.
 */

import type { WellLog } from "../../core/index.ts";
import type { Track, TrackKindName } from "../template/types.ts";
import { curveKind, type ResolvedCurveTrack } from "./curve/index.ts";
import { depthKind, type ResolvedDepthTrack } from "./depth/index.ts";
import { discreteKind, type ResolvedDiscreteTrack } from "./discrete/index.ts";
import type { DrawInput, ReadInput, TrackKind, TrackReading } from "./types.ts";
import { zoneKind, type ResolvedZoneTrack } from "./zone/index.ts";

interface ResolvedTracks {
  curve: ResolvedCurveTrack;
  depth: ResolvedDepthTrack;
  discrete: ResolvedDiscreteTrack;
  zone: ResolvedZoneTrack;
}

export type ResolvedTrack = ResolvedTracks[TrackKindName];

export type ResolvedTrackOf<K extends TrackKindName> = ResolvedTracks[K];

type TrackOf<K extends TrackKindName> = Extract<Track, { kind: K }>;

export const kinds: { readonly [K in TrackKindName]: TrackKind<TrackOf<K>, ResolvedTracks[K]> } = {
  curve: curveKind,
  depth: depthKind,
  discrete: discreteKind,
  zone: zoneKind,
};

// The registry pairs each kind with its own track and resolved types, which
// TypeScript can't follow through an indexed lookup; these do the lookup once.
type AnyKind = TrackKind<Track, ResolvedTrack>;

export function resolveTrack(track: Track, log: WellLog): ResolvedTrack {
  return (kinds[track.kind] as AnyKind).resolve(track, log);
}

export function drawTrack(ctx: CanvasRenderingContext2D, resolved: ResolvedTrack, input: DrawInput) {
  (kinds[resolved.kind] as AnyKind).draw(ctx, resolved, input);
}

/** Whether the track's items highlight under the pointer. */
export function hasHit(resolved: ResolvedTrack): boolean {
  return kinds[resolved.kind].hit !== undefined;
}

/** The item at `md` in the track, or null (always null for kinds without `hit`). */
export function hitTrack(resolved: ResolvedTrack, md: number): number | null {
  return (kinds[resolved.kind] as AnyKind).hit?.(resolved, md) ?? null;
}

/** The track's reading at the depth cursor. */
export function readTrack(resolved: ResolvedTrack, at: ReadInput): TrackReading {
  return (kinds[resolved.kind] as AnyKind).read(resolved, at);
}

export type { DrawInput, MatchedEntry, ReadInput, ResolvedEntry, Tokens, TrackReading } from "./types.ts";
export type { ResolvedCurveTrack, ResolvedDepthTrack, ResolvedDiscreteTrack, ResolvedZoneTrack };
