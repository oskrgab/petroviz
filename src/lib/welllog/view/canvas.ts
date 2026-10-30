/**
 * The thin canvas layer: sizing a track canvas for the device pixel ratio,
 * stroking the pure geometry, reading the --welllog-* tokens, and one
 * requestAnimationFrame per frame for every track that asked to redraw.
 * Not unit-tested: it is checked by running the app.
 */

import type { Block } from "./geometry/blocks.ts";
import type { FillPolygon } from "./geometry/fill.ts";
import { depthGridlines, type Gridline } from "./geometry/grid.ts";
import { pixelsPerUnit, type Frame } from "./geometry/polyline.ts";
import { HATCHES, HATCH_TILE } from "./hatches.ts";
import type { Tokens } from "./kinds/types.ts";
import type { CodeStyle, Dash, Fill } from "./template/types.ts";

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

/** Fills a fill's polygons, one Path2D per side, in that side's colour. */
export function fillPolygonPaths(ctx: CanvasRenderingContext2D, polygons: readonly FillPolygon[], fill: Fill) {
  for (const aLeft of [true, false]) {
    const path = new Path2D();
    let empty = true;
    for (const polygon of polygons) {
      if (polygon.aLeft !== aLeft) continue;
      const { points } = polygon;
      path.moveTo(points[0], points[1]);
      for (let j = 2; j < points.length; j += 2) path.lineTo(points[j], points[j + 1]);
      path.closePath();
      empty = false;
    }
    if (empty) continue;
    ctx.fillStyle = aLeft ? fill.colourWhereALeft : fill.colourWhereARight;
    ctx.fill(path);
  }
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

/** FGDC hatches are black, softened so the colour beneath still reads. */
const HATCH_INK = "rgba(0, 0, 0, 0.55)";

const hatchTiles = new Map<string, HTMLCanvasElement>();

/** A repeating tile of the style's colour with its pattern's marks, at this dpr. */
function hatchTile(style: CodeStyle & { pattern: NonNullable<CodeStyle["pattern"]> }, dpr: number) {
  const key = `${style.colour} ${style.pattern} ${dpr}`;
  let tile = hatchTiles.get(key);
  if (tile) return tile;
  const size = Math.max(HATCH_TILE, Math.round(HATCH_TILE * dpr));
  const unit = size / HATCH_TILE;
  tile = document.createElement("canvas");
  tile.width = tile.height = size;
  const g = tile.getContext("2d");
  if (g) {
    g.fillStyle = style.colour;
    g.fillRect(0, 0, size, size);
    const { lines, dots } = HATCHES[style.pattern];
    g.strokeStyle = g.fillStyle = HATCH_INK;
    g.lineWidth = Math.max(1, 0.9 * dpr);
    for (const line of lines) {
      g.beginPath();
      g.moveTo(line[0] * unit, line[1] * unit);
      for (let j = 2; j < line.length; j += 2) g.lineTo(line[j] * unit, line[j + 1] * unit);
      g.stroke();
    }
    for (const [x, y] of dots) g.fillRect(x * unit, y * unit, 1.3 * unit, 1.3 * unit);
  }
  hatchTiles.set(key, tile);
  return tile;
}

/**
 * Fills each block across the track in its code's colour and pattern, the
 * pattern fixed to depth so it pans with the blocks. Edges
 * snap to whole device px so neighbours meet without a seam, and a block
 * thinner than a pixel still shows as one.
 */
export function fillDiscreteBlocks(
  ctx: CanvasRenderingContext2D,
  blocks: readonly Block[],
  styles: ReadonlyMap<number, CodeStyle>,
  frame: Frame,
  dpr: number,
) {
  const k = pixelsPerUnit(frame);
  const mod = (a: number, n: number) => ((a % n) + n) % n;
  const fills = new Map<number, string | CanvasPattern>();
  const fillOf = (code: number) => {
    let fill = fills.get(code);
    if (fill === undefined) {
      const style = styles.get(code);
      if (!style) return undefined;
      const tile = style.pattern ? hatchTile({ ...style, pattern: style.pattern }, dpr) : null;
      const pattern = tile ? ctx.createPattern(tile, "repeat") : null;
      // Anchored to depth, not to the canvas, so the marks move with the blocks.
      if (tile && pattern) pattern.setTransform(new DOMMatrix([1, 0, 0, 1, 0, -mod(frame.top * k, tile.height)]));
      fill = pattern ?? style.colour;
      fills.set(code, fill);
    }
    return fill;
  };
  for (const { code, y0, y1 } of blocks) {
    const fill = fillOf(code);
    if (!fill) continue;
    const top = Math.max(0, Math.round(y0));
    const bottom = Math.min(frame.height, Math.max(Math.round(y1), top + 1));
    if (bottom <= top) continue;
    ctx.fillStyle = fill;
    ctx.fillRect(0, top, frame.width, bottom - top);
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
    zoneLine: token("zone-line"),
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
