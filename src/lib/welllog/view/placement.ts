/**
 * Where floating things sit in the window: the depth cursor's card beside
 * the pointer, and the curve editor and add-curve picker beside what opened
 * them. Each flips to the other side near the window's edges.
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

/** Gap between a popup and the element that opened it, in CSS px. */
export const POPUP_GAP = 4;

interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * A popup's top-left corner in the viewport: below its anchor and aligned to
 * its left edge, above it when there is no room below, and kept inside the
 * window (the top edge wins for a popup taller than the window).
 */
export function popupPlacement(anchor: Rect, popup: Size, viewport: Size): { left: number; top: number } {
  const clamp = (start: number, size: number, room: number) =>
    Math.max(EDGE_MARGIN, Math.min(start, room - EDGE_MARGIN - size));
  const below = anchor.bottom + POPUP_GAP;
  const top = below + popup.height <= viewport.height - EDGE_MARGIN ? below : anchor.top - POPUP_GAP - popup.height;
  return { left: clamp(anchor.left, popup.width, viewport.width), top: clamp(top, popup.height, viewport.height) };
}
