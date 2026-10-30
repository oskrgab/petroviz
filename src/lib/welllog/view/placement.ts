/**
 * Where the depth cursor's floating card sits: beside the pointer, right of
 * and below it, flipping to the other side near the window's edges.
 */

/** Gap between the pointer and the card, in CSS px. */
export const CARD_OFFSET = 12;

/** The card keeps at least this far from the window's edges. */
export const EDGE_MARGIN = 8;

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

/** The card's top-left corner in the viewport, for a pointer at `pointer`. */
export function cardPlacement(pointer: Point, card: Size, viewport: Size): { left: number; top: number } {
  const along = (at: number, size: number, room: number) => {
    const after = at + CARD_OFFSET;
    const start = after + size <= room - EDGE_MARGIN ? after : at - CARD_OFFSET - size;
    return Math.max(EDGE_MARGIN, Math.min(start, room - EDGE_MARGIN - size));
  };
  return { left: along(pointer.x, card.width, viewport.width), top: along(pointer.y, card.height, viewport.height) };
}
