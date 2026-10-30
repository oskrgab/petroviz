/**
 * The state of one <LogView> (#31), shared with its children through
 * context, never a module-level singleton. It reads the bound props through
 * a getter and derives everything drawn from them; it writes no prop.
 *
 * Glue only: the logic it calls (resolveTemplate, geometry) is pure and
 * tested on its own.
 */

import { getContext, setContext } from "svelte";
import type { WellLog } from "../core/index.ts";
import { FrameScheduler } from "./canvas.ts";
import type { Tokens } from "./kinds/types.ts";
import { wholeWell, type DepthInterval, type DepthRef } from "./interval.ts";
import { resolveTemplate } from "./resolve.ts";
import type { Template } from "./template/types.ts";

export interface LogViewProps {
  readonly log: WellLog;
  readonly template: Template;
  readonly interval: DepthInterval | null;
  readonly depthRef: DepthRef;
}

export class LogViewState {
  readonly #props: () => LogViewProps;
  readonly #scheduler = new FrameScheduler();

  /** Read from the --welllog-* tokens once mounted, and again whenever the scheme changes. */
  tokens = $state.raw<Tokens | null>(null);

  constructor(props: () => LogViewProps) {
    this.#props = props;
  }

  get log(): WellLog {
    return this.#props().log;
  }

  resolved = $derived.by(() => resolveTemplate(this.#props().template, this.#props().log));

  /** The whole well for now; navigation clamps the bound interval to it (#46). */
  effectiveInterval: DepthInterval = $derived.by(() => wholeWell(this.#props().log));

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
