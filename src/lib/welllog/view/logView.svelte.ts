/**
 * The state of one <LogView> (#31), shared with its children through
 * context, never a module-level singleton. It reads the bound props through
 * getters, one per prop, so each derivation follows only the props it reads
 * (panning never re-resolves the template). It derives everything drawn
 * from them, and writes the bound interval only through `navigate`, which
 * gestures and controls call on a user action.
 *
 * Glue only: the logic it calls (resolveTemplate, geometry) is pure and
 * tested on its own.
 */

import { getContext, setContext } from "svelte";
import type { WellLog } from "../core/index.ts";
import { FrameScheduler } from "./canvas.ts";
import { adaptStroke } from "./colour/adapt.ts";
import type { Tokens } from "./kinds/types.ts";
import { wholeWell, type DepthInterval, type DepthRef } from "./interval.ts";
import { effectiveInterval } from "./navigation.ts";
import type { TrackReading } from "./kinds/index.ts";
import { readoutAt, type CursorReadout } from "./readout.ts";
import { resolveTemplate } from "./resolve.ts";
import type { Template } from "./template/types.ts";

export interface LogViewProps {
  readonly log: WellLog;
  readonly template: Template;
  readonly interval: DepthInterval | null;
  readonly depthRef: DepthRef;
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
  readonly #writeInterval: (interval: DepthInterval) => void;
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
  constructor(props: LogViewProps, writeInterval: (interval: DepthInterval) => void) {
    this.#props = props;
    this.#writeInterval = writeInterval;
  }

  get log(): WellLog {
    return this.#props.log;
  }

  resolved = $derived.by(() => resolveTemplate(this.#props.template, this.#props.log));

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
    this.#writeInterval(interval);
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
