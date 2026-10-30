/**
 * Blocks for a discrete curve: one per run of equal codes, in device px.
 * A row covers its MD down to the next row's MD, so a run ends where the
 * next code starts. A NaN code (no value, or a gap row) draws nothing.
 */

import { pixelsPerUnit, visibleRows, type Frame } from "./polyline.ts";

export interface Block {
  readonly code: number;
  /** Device px from the frame's top edge; may lie outside the frame. */
  readonly y0: number;
  readonly y1: number;
}

export function discreteBlocks(md: Float64Array, values: Float32Array, frame: Frame): Block[] {
  const [start, end] = visibleRows(md, frame);
  const k = pixelsPerUnit(frame);
  const y = (i: number) => (md[Math.min(i, md.length - 1)] - frame.top) * k;
  const blocks: Block[] = [];
  let run = start;
  for (let i = start + 1; i <= end; i++) {
    if (i < end && (values[i] === values[run] || (Number.isNaN(values[i]) && Number.isNaN(values[run])))) continue;
    if (!Number.isNaN(values[run])) blocks.push({ code: values[run], y0: y(run), y1: y(i) });
    run = i;
  }
  return blocks;
}
