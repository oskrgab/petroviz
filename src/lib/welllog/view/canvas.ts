/**
 * The thin canvas layer: sizing a track canvas for the device pixel ratio,
 * stroking the pure geometry, reading the --welllog-* tokens, and one
 * requestAnimationFrame per frame for every track that asked to redraw.
 * Not unit-tested: it is checked by running the app.
 */

import { depthGridlines, type Gridline } from "./geometry/grid.ts";
import { pixelsPerUnit, type Frame } from "./geometry/polyline.ts";
import type { Tokens } from "./kinds/types.ts";
import type { Dash } from "./template/types.ts";

/** Dash patterns in CSS px, for a 1 px line. */
export const DASHES: Readonly<Record<Dash, readonly number[]>> = {
  solid: [],
  dashed: [6, 4],
  dotted: [1.5, 3],
  dashdot: [7, 3, 1.5, 3],
};

/** Sizes the canvas's backing store to its CSS size × dpr and clears it. */
export function prepareCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number, dpr: number) {
  const width = Math.round(cssWidth * dpr);
  const height = Math.round(cssHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx?.clearRect(0, 0, width, height);
  return ctx;
}

/** Strokes a flat [x, y, …] polyline, lifting the pen at each NaN pair. */
export function strokePolyline(ctx: CanvasRenderingContext2D, line: Float32Array) {
  ctx.beginPath();
  let pen = false;
  for (let j = 0; j < line.length; j += 2) {
    const x = line[j];
    if (Number.isNaN(x)) {
      pen = false;
    } else if (pen) {
      ctx.lineTo(x, line[j + 1]);
    } else {
      ctx.moveTo(x, line[j + 1]);
      pen = true;
    }
  }
  ctx.stroke();
}

/** A 1 CSS px line's width in whole device px. */
export function hairline(dpr: number): number {
  return Math.max(1, Math.round(dpr));
}

/** Where a hairline sits crisply on the device pixel grid. */
export function crisp(position: number, dpr: number): number {
  return Math.round(position) + (hairline(dpr) % 2 ? 0.5 : 0);
}

export function strokeVerticalGrid(
  ctx: CanvasRenderingContext2D,
  lines: readonly Gridline[],
  frame: Frame,
  dpr: number,
  tokens: Tokens,
) {
  ctx.lineWidth = hairline(dpr);
  for (const major of [false, true]) {
    ctx.strokeStyle = major ? tokens.gridMajor : tokens.grid;
    ctx.beginPath();
    for (const line of lines) {
      if (line.major !== major) continue;
      const x = crisp(line.fraction * frame.width, dpr);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, frame.height);
    }
    ctx.stroke();
  }
}

export function strokeDepthGrid(ctx: CanvasRenderingContext2D, frame: Frame, dpr: number, tokens: Tokens) {
  const k = pixelsPerUnit(frame);
  const { minor, major } = depthGridlines(frame.top, frame.base, k / dpr);
  ctx.lineWidth = hairline(dpr);
  for (const [depths, colour] of [
    [minor, tokens.grid],
    [major, tokens.gridMajor],
  ] as const) {
    ctx.strokeStyle = colour;
    ctx.beginPath();
    for (const depth of depths) {
      const y = crisp((depth - frame.top) * k, dpr);
      ctx.moveTo(0, y);
      ctx.lineTo(frame.width, y);
    }
    ctx.stroke();
  }
}

/** The tokens the canvas draws with, as resolved on the log view's element. */
export function readTokens(element: Element): Tokens {
  const style = getComputedStyle(element);
  const token = (name: string) => style.getPropertyValue(`--welllog-${name}`).trim();
  return {
    grid: token("grid"),
    gridMajor: token("grid-major"),
    text: token("text"),
    textMuted: token("text-muted"),
    font: style.fontFamily,
  };
}

/**
 * Coalesces redraw requests into one requestAnimationFrame. A later request
 * for the same key replaces an earlier one within a frame.
 */
export class FrameScheduler {
  #pending = new Map<object, () => void>();
  #frame = 0;

  request(key: object, draw: () => void) {
    this.#pending.set(key, draw);
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      const draws = [...this.#pending.values()];
      this.#pending.clear();
      for (const draw of draws) draw();
    });
  }

  cancel(key: object) {
    this.#pending.delete(key);
  }

  destroy() {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#pending.clear();
  }
}
