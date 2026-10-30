/**
 * The state of one <LogView> (#31), shared with its children through
 * context, never a module-level singleton. It reads the bound props through
 * getters, one per prop, so each derivation follows only the props it reads
 * (panning never re-resolves the template). It derives everything drawn
 * from them, and writes the bound interval only through `navigate`, the
 * bound template only through `edit`, and the bound depth reference only
 * through `setDepthRef`, which gestures and controls call on a user action.
 *
 * Glue only: the logic it calls (resolveTemplate, geometry) is pure and
 * tested on its own.
 */

import { getContext, setContext } from "svelte";
import type { LoadWarning, WellLog } from "../core/index.ts";
import { depthAxis, effectiveDepthRef, hasTvdss, intervalOnAxis, intervalToMd, toMd, type DepthAxis } from "./axis.ts";
import { FrameScheduler } from "./canvas.ts";
import { adaptFill, adaptStroke } from "./colour/adapt.ts";
import type { Tokens } from "./kinds/types.ts";
import { wholeWell, type DepthInterval, type DepthRef } from "./interval.ts";
import { effectiveInterval } from "./navigation.ts";
import { curveCautions } from "./quality.ts";
import type { ResolvedEntry, TrackReading } from "./kinds/index.ts";
import { readoutAt, type CursorReadout } from "./readout.ts";
import { resolveTemplate } from "./resolve.ts";
import { editTemplate, type TemplateEdit } from "./template/edit.ts";
import type { Template } from "./template/types.ts";

export interface LogViewProps {
  readonly log: WellLog;
  readonly template: Template;
  readonly interval: DepthInterval | null;
  readonly depthRef: DepthRef;
}

/** Writes the bound props; for user actions only. */
export interface LogViewWriters {
  readonly interval: (interval: DepthInterval) => void;
  readonly template: (template: Template) => void;
  readonly depthRef: (depthRef: DepthRef) => void;
}

/**
 * The one popup open over the log view: a curve entry's editor, opened from
 * its scale bar; a curve track's add-curve picker, opened from its ＋; a
 * track's ⋯ menu, or the fills of a curve track, opened from that menu; or
 * the add-track menu, opened from the ＋ after the tracks. `anchor` is what opened it,
 * which it sits beside.
 */
export type Popup =
  | { readonly kind: "editor"; readonly trackId: string; readonly entryId: string; readonly anchor: HTMLElement }
  | { readonly kind: "picker" | "track-menu" | "fills"; readonly trackId: string; readonly anchor: HTMLElement }
  | { readonly kind: "add-track"; readonly anchor: HTMLElement };

/** A track header being dragged to reorder its track (#56). */
export interface HeaderDrag {
  readonly trackId: string;
  /** How far the header has moved sideways, in CSS px. */
  readonly dx: number;
  /** The index the track takes if dropped now. */
  readonly to: number;
  /** The border it would land on, across the track grid, in CSS px. */
  readonly edge: number;
}

/** A track border being dragged: the width it would set, shown before it is written on release. */
export interface BorderDrag {
  readonly trackId: string;
  readonly width: number;
}

/** The pointer over the track bodies, for the depth cursor. */
export interface CursorPointer {
  /** Its height down the track bodies, and theirs, in CSS px. */
  readonly y: number;
  readonly height: number;
  /** Its place in the window, for the floating card. */
  readonly clientX: number;
  readonly clientY: number;
}

export class LogViewState {
  readonly #props: LogViewProps;
  readonly #write: LogViewWriters;
  readonly #scheduler = new FrameScheduler();

  /** Read from the --welllog-* tokens once mounted, and again whenever the scheme changes. */
  tokens = $state.raw<Tokens | null>(null);

  /**
   * A template stroke colour as drawn on this view's track background: as
   * stored on light, adapted on dark (ADR-0006). For the header and card
   * text drawn in a curve's colour; reactive on the tokens.
   */
  strokeColour(stored: string): string {
    return this.tokens ? adaptStroke(stored, this.tokens.bg) : stored;
  }

  /** A template fill colour as drawn on this view's track background (ADR-0006), for the fill editor. */
  fillColour(stored: string): string {
    return this.tokens ? adaptFill(stored, this.tokens.bg) : stored;
  }

  /** `props` must read each prop through its own getter. */
  constructor(props: LogViewProps, write: LogViewWriters) {
    this.#props = props;
    this.#write = write;
  }

  get log(): WellLog {
    return this.#props.log;
  }

  get template(): Template {
    return this.#props.template;
  }

  /**
   * Applies a template operation and writes the bound template; for user
   * actions only. The host keeps it, so edits outlive the well log.
   */
  edit(change: TemplateEdit) {
    const template = this.#props.template;
    const next = editTemplate(template, change);
    if (next !== template) this.#write.template(next);
  }

  popup = $state.raw<Popup | null>(null);

  /** The entry the curve editor is open on, while the current template has it. */
  editing: ResolvedEntry | null = $derived.by(() => {
    const popup = this.popup;
    if (popup?.kind !== "editor") return null;
    const track = this.resolved.tracks.find((t) => t.track.id === popup.trackId);
    return (track?.kind === "curve" && track.entries.find((e) => e.entry.id === popup.entryId)) || null;
  });

  /** Written by the header drag (rearrange.ts) while a header is dragged. */
  dragging = $state.raw<HeaderDrag | null>(null);

  /** Written by the border drag (rearrange.ts) while a border is dragged. */
  resizing = $state.raw<BorderDrag | null>(null);

  /** Opens a popup, or closes it when the same anchor opened the one open. */
  togglePopup(next: Popup) {
    this.popup = this.popup?.anchor === next.anchor ? null : next;
  }

  resolved = $derived.by(() => resolveTemplate(this.#props.template, this.#props.log));

  /** The cautions that mark a curve's scale bar, by curve key. */
  cautions: ReadonlyMap<string, readonly LoadWarning[]> = $derived.by(() => curveCautions(this.#props.log));

  /** The well log's whole MD range, as the overview strip shows it. */
  whole: DepthInterval = $derived.by(() => wholeWell(this.#props.log));

  /** Whether the well log has TVDSS to show (axis.ts). */
  hasTvdss: boolean = $derived.by(() => hasTvdss(this.#props.log));

  /** The bound depth reference, or MD when the well log has no TVDSS. */
  effectiveDepthRef: DepthRef = $derived.by(() => effectiveDepthRef(this.#props.depthRef, this.#props.log));

  /** The depth axis the tracks are drawn down. */
  axis: DepthAxis = $derived.by(() => depthAxis(this.#props.log, this.effectiveDepthRef));

  /** The MD the view can show: the whole well, or on TVDSS the rows that have it. */
  extent: DepthInterval = $derived.by(() => this.axis.extent);

  /** The bound interval clamped to the extent, or the whole extent; in MD. */
  effectiveInterval: DepthInterval = $derived.by(() => effectiveInterval(this.#props.interval, this.extent));

  /** The effective interval, and the extent, as depths on the axis: what the tracks show top to bottom. */
  axisInterval: DepthInterval = $derived.by(() => intervalOnAxis(this.axis, this.effectiveInterval));
  axisExtent: DepthInterval = $derived.by(() => intervalOnAxis(this.axis, this.extent));

  /**
   * Writes the bound interval; for user actions only. A gesture held at an
   * end of the well asks for the interval already shown, which is dropped so
   * it doesn't redraw every track.
   */
  navigate(interval: DepthInterval) {
    const shown = this.effectiveInterval;
    if (interval.top === shown.top && interval.base === shown.base) return;
    this.#write.interval(interval);
  }

  /** `navigate` for an interval of axis depths, as the tracks' gestures and the interval input work. */
  navigateOnAxis(interval: DepthInterval) {
    const shown = this.axisInterval;
    if (interval.top === shown.top && interval.base === shown.base) return;
    this.navigate(intervalToMd(this.axis, interval));
  }

  /** The axis depth at `fraction` down the track bodies. */
  axisDepthAt(fraction: number): number {
    const { top, base } = this.axisInterval;
    return top + fraction * (base - top);
  }

  /** The MD at `fraction` down the track bodies. */
  mdAt(fraction: number): number {
    return toMd(this.axis, this.axisDepthAt(fraction));
  }

  /** Writes the bound depth reference; for user actions only. */
  setDepthRef(depthRef: DepthRef) {
    if (depthRef !== this.#props.depthRef) this.#write.depthRef(depthRef);
  }

  /**
   * Written by the depth cursor's pointer handlers (cursor.ts); null when the
   * pointer is away from the track bodies. Only the cursor line, the headers
   * and the floating card read it, so a pointer move redraws no canvas.
   */
  pointer = $state.raw<CursorPointer | null>(null);

  /**
   * The MD under the pointer. Kept as a height rather than a depth, so
   * scrolling under a still pointer moves the readout too.
   */
  cursorDepth: number | null = $derived.by(() => {
    const pointer = this.pointer;
    if (!pointer || pointer.height <= 0) return null;
    const md = this.mdAt(pointer.y / pointer.height);
    return Number.isNaN(md) ? null : md;
  });

  /** What every track reads at the depth cursor, or null when there is none. */
  readout: CursorReadout | null = $derived.by(() => {
    const depth = this.cursorDepth;
    if (depth === null) return null;
    return readoutAt(this.#props.log, this.resolved.tracks, depth, this.effectiveDepthRef);
  });

  /** A track's reading at the depth cursor, for its header; undefined when there is none. */
  readingOf(trackId: string): TrackReading | undefined {
    return this.readout?.tracks.get(trackId);
  }

  /** Asks for `draw` on the next frame; requests for the same key coalesce. */
  requestFrame(key: object, draw: () => void) {
    this.#scheduler.request(key, draw);
  }

  cancelFrame(key: object) {
    this.#scheduler.cancel(key);
  }

  destroy() {
    this.#scheduler.destroy();
  }
}

const KEY = Symbol("log-view");

export function setLogView(view: LogViewState): LogViewState {
  return setContext(KEY, view);
}

export function getLogView(): LogViewState {
  return getContext<LogViewState>(KEY);
}
