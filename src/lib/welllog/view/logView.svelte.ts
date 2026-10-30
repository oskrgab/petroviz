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
import type { Tokens } from "./kinds/types.ts";
import { wholeWell, type DepthInterval, type DepthRef } from "./interval.ts";
import { effectiveInterval } from "./navigation.ts";
import { resolveTemplate } from "./resolve.ts";
import type { Template } from "./template/types.ts";

export interface LogViewProps {
  readonly log: WellLog;
  readonly template: Template;
  readonly interval: DepthInterval | null;
  readonly depthRef: DepthRef;
}

export class LogViewState {
  readonly #props: LogViewProps;
  readonly #writeInterval: (interval: DepthInterval) => void;
  readonly #scheduler = new FrameScheduler();

  /** Read from the --welllog-* tokens once mounted, and again whenever the scheme changes. */
  tokens = $state.raw<Tokens | null>(null);

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
