/**
 * The track kind registry. `Track` is a closed union, and the mapped type on
 * `kinds` makes TypeScript reject a kind with no entry, or an entry for a kind
 * the union lacks.
 */

import type { WellLog } from "../../core/index.ts";
import type { Track, TrackKindName } from "../template/types.ts";
import { curveKind, type ResolvedCurveTrack } from "./curve/index.ts";
import { depthKind, type ResolvedDepthTrack } from "./depth/index.ts";
import type { DrawInput, TrackKind } from "./types.ts";

interface ResolvedTracks {
  curve: ResolvedCurveTrack;
  depth: ResolvedDepthTrack;
}

export type ResolvedTrack = ResolvedTracks[TrackKindName];

export type ResolvedTrackOf<K extends TrackKindName> = ResolvedTracks[K];

type TrackOf<K extends TrackKindName> = Extract<Track, { kind: K }>;

export const kinds: { readonly [K in TrackKindName]: TrackKind<TrackOf<K>, ResolvedTracks[K]> } = {
  curve: curveKind,
  depth: depthKind,
};

// The registry pairs each kind with its own track and resolved types, which
// TypeScript can't follow through an indexed lookup; these two do the lookup once.
type AnyKind = TrackKind<Track, ResolvedTrack>;

export function resolveTrack(track: Track, log: WellLog): ResolvedTrack {
  return (kinds[track.kind] as AnyKind).resolve(track, log);
}

export function drawTrack(ctx: CanvasRenderingContext2D, resolved: ResolvedTrack, input: DrawInput) {
  (kinds[resolved.kind] as AnyKind).draw(ctx, resolved, input);
}

export type { DrawInput, ResolvedEntry, Tokens } from "./types.ts";
export type { ResolvedCurveTrack, ResolvedDepthTrack };
