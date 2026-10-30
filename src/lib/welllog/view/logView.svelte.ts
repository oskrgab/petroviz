/**
 * The state of one <LogView> (#31), shared with its children through
 * context, never a module-level singleton. It reads the bound props through
 * getters, one per prop, so each derivation follows only the props it reads
 * (panning never re-resolves the template). It derives everything drawn
 * from them, and writes the bound interval only through `navigate`, and the
 * bound template only through `edit`, which gestures and controls call on a
 * user action.
 *
 * Glue only: the logic it calls (resolveTemplate, geometry) is pure and
 * tested on its own.
 */

import { getContext, setContext } from "svelte";
import type { LoadWarning, WellLog } from "../core/index.ts";
import { FrameScheduler } from "./canvas.ts";
import { adaptStroke } from "./colour/adapt.ts";
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
}

/**
 * The one popup open over the log view: a curve entry's editor, opened from
 * its scale bar, or a curve track's add-curve picker, opened from its ＋.
 * `anchor` is what opened it, which it sits beside.
 */
export type Popup =
  | { readonly kind: "editor"; readonly trackId: string; readonly entryId: string; readonly anchor: HTMLElement }
  | { readonly kind: "picker"; readonly trackId: string; readonly anchor: HTMLElement };

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

  /** Opens a popup, or closes it when the same anchor opened the one open. */
  togglePopup(next: Popup) {
    this.popup = this.popup?.anchor === next.anchor ? null : next;
  }

  resolved = $derived.by(() => resolveTemplate(this.#props.template, this.#props.log));

  /** The cautions that mark a curve's scale bar, by curve key. */
  cautions: ReadonlyMap<string, readonly LoadWarning[]> = $derived.by(() => curveCautions(this.#props.log));

  /** The well log's whole MD range: the most the view can show. */
  whole: DepthInterval = $derived.by(() => wholeWell(this.#props.log));

  /** The bound interval clamped to the well, or the whole well. */
  effectiveInterval: DepthInterval = $derived.by(() => effectiveInterval(this.#props.interval, this.whole));

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

  /** MD for now; TVDSS joins with the depth reference toggle (#48). */
  get effectiveDepthRef(): DepthRef {
    return "md";
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
    const { top, base } = this.effectiveInterval;
    return top + (pointer.y / pointer.height) * (base - top);
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
