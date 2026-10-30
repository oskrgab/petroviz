/**
 * Each track kind's header component, checked against the closed Track union
 * like the registry in `index.ts`. Kept apart from it so the pure side never
 * loads a .svelte file.
 */

import type { Component } from "svelte";
import type { TrackKindName } from "../template/types.ts";
import CurveHeader from "./curve/Header.svelte";
import DepthHeader from "./depth/Header.svelte";
import DiscreteHeader from "./discrete/Header.svelte";
import ZoneHeader from "./zone/Header.svelte";
import type { ResolvedTrack, ResolvedTrackOf } from "./index.ts";

export const headers: { readonly [K in TrackKindName]: Component<{ resolved: ResolvedTrackOf<K> }> } = {
  curve: CurveHeader,
  depth: DepthHeader,
  discrete: DiscreteHeader,
  zone: ZoneHeader,
};

/** The header for any resolved track; the lookup pairs kind and props, as `drawTrack` does. */
export function headerFor(resolved: ResolvedTrack): Component<{ resolved: ResolvedTrack }> {
  return headers[resolved.kind] as Component<{ resolved: ResolvedTrack }>;
}
