/**
 * The frame scheduler every track canvas and the overview strip draw
 * through: one requestAnimationFrame for all the redraws asked for, held to
 * a budget so no frame holds the main thread for long.
 */

/** How a scheduler asks for frames and tells the time; the browser's by default. */
export interface FrameClock {
  now(): number;
  request(callback: () => void): number;
  cancel(handle: number): void;
}

const browserClock: FrameClock = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

/**
 * A frame stops drawing once its draws have taken this long, in ms. On a
 * slow device a large well log's first draw, or its whole well, can take
 * hundreds of ms over every track: drawn in one frame, the page wouldn't
 * answer for that long. Most frames draw well inside it.
 */
export const FRAME_BUDGET_MS = 20;

/**
 * Coalesces redraw requests into one frame. A later request for the same
 * key replaces an earlier one that hasn't been drawn.
 *
 * Once a frame's draws reach FRAME_BUDGET_MS, the rest wait for the next
 * frame and are drawn first there, so every request is drawn within a few
 * frames; at least one is drawn per frame. They keep that place when they
 * are cancelled and asked for again, as a track's effect does each time it
 * reruns: otherwise, while a gesture keeps every track asking, the first
 * tracks would take every frame. A track drawn a frame later shows the
 * interval before for that frame.
 */
export class FrameScheduler {
  readonly #clock: FrameClock;
  #pending = new Map<object, () => void>();
  /** The keys the last frame left undrawn, drawn first in the next. */
  #waiting = new Set<object>();
  #frame = 0;

  constructor(clock: FrameClock = browserClock) {
    this.#clock = clock;
  }

  request(key: object, draw: () => void) {
    this.#pending.set(key, draw);
    this.#schedule();
  }

  cancel(key: object) {
    this.#pending.delete(key);
    if (this.#pending.size === 0) this.#cancelFrame();
  }

  destroy() {
    this.#cancelFrame();
    this.#pending.clear();
    this.#waiting.clear();
  }

  #schedule() {
    if (this.#frame || this.#pending.size === 0) return;
    this.#frame = this.#clock.request(() => this.#run());
  }

  #cancelFrame() {
    if (this.#frame) this.#clock.cancel(this.#frame);
    this.#frame = 0;
  }

  #run() {
    this.#frame = 0;
    const start = this.#clock.now();
    // A snapshot, those left waiting first: anything asked for while
    // drawing waits for the next frame.
    const order = [...this.#waiting].filter((key) => this.#pending.has(key));
    for (const key of this.#pending.keys()) if (!this.#waiting.has(key)) order.push(key);
    const draws = order.map((key) => [key, this.#pending.get(key)] as const);
    for (const [key, draw] of draws) {
      if (this.#pending.get(key) !== draw) continue;
      this.#pending.delete(key);
      draw!();
      if (this.#clock.now() - start >= FRAME_BUDGET_MS) break;
    }
    this.#waiting = new Set(this.#pending.keys());
    this.#schedule();
  }
}
