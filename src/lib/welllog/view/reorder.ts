/**
 * Where a dragged track header lands (#56), from the tracks' places across
 * the grid as measured when the drag began.
 */

/**
 * The index a dragged track takes once dropped at `x`: after every other
 * track whose centre lies left of it. `centres` are the tracks' centres in
 * display order, `from` the dragged track's index.
 */
export function dropIndex(centres: readonly number[], from: number, x: number): number {
  return centres.filter((centre, i) => i !== from && centre < x).length;
}

/**
 * The border a track dropped at index `to` lands on: the left edge of the
 * other track it goes before, or the right edge of the last one.
 */
export function dropEdge(edges: readonly { left: number; right: number }[], from: number, to: number): number {
  const others = edges.filter((_, i) => i !== from);
  return to < others.length ? others[to].left : (others.at(-1)?.right ?? edges[from].left);
}
