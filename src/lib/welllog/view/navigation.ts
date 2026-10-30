/**
 * Depth navigation maths (#46): zooming around a depth, wheel scroll, pan,
 * the zoom buttons and fitting a zone. Every interval is in MD, and every
 * operation returns a new one kept inside the well at a span between
 * MIN_SPAN and the whole well; the caller writes it to the bound interval.
 */

import type { Curve, DepthUnit, WellLog, Zone } from "../core/index.ts";
import type { DepthInterval } from "./interval.ts";

/** The narrowest view, in depth units: a few samples at FORCE 2020's 0.152 m step. */
export const MIN_SPAN = 2;

/** A zone fitted to the view keeps this share of its thickness above and below it. */
const ZONE_ROOM = 0.05;

/** A wheel line, in CSS px. */
const LINE_PX = 16;

/** Ctrl+wheel: the zoom factor per px of wheel, and the most px one event counts. */
const ZOOM_PER_PX = 0.01;
const MAX_ZOOM_PX = 60;

const METRES_PER_FOOT = 0.3048;

/**
 * The interval drawn: the bound one clamped to the well, or the whole well
 * when there is none or it lies wholly outside.
 */
export function effectiveInterval(interval: DepthInterval | null, whole: DepthInterval): DepthInterval {
  if (!interval) return whole;
  const top = Math.max(interval.top, whole.top);
  const base = Math.min(interval.base, whole.base);
  return base > top ? { top, base } : whole;
}

function spanWithin(span: number, whole: DepthInterval): number {
  const max = whole.base - whole.top;
  return Math.min(Math.max(span, Math.min(MIN_SPAN, max)), max);
}

/** The interval of `span` with `depth` at `fraction` down it, moved inside the well. */
export function placeAt(depth: number, fraction: number, span: number, whole: DepthInterval): DepthInterval {
  const s = spanWithin(span, whole);
  const top = Math.min(Math.max(depth - fraction * s, whole.top), whole.base - s);
  return { top, base: top + s };
}

/** Moves the view down by `delta` (up when negative), keeping its span. */
export function panBy(view: DepthInterval, delta: number, whole: DepthInterval): DepthInterval {
  return placeAt(view.top + delta, 0, view.base - view.top, whole);
}

/**
 * Moves the view by a pointer or wheel movement of `pixels` CSS px over
 * something `height` px tall that shows `depthPerHeight`: the view's span on
 * the tracks (the default), the whole well's on the overview strip.
 */
export function panByPixels(view: DepthInterval, pixels: number, height: number, whole: DepthInterval, depthPerHeight = view.base - view.top): DepthInterval {
  return panBy(view, (pixels / height) * depthPerHeight, whole);
}

/** Scales the span by `factor`, keeping `depth` where it is on screen. */
export function zoomAround(view: DepthInterval, depth: number, factor: number, whole: DepthInterval): DepthInterval {
  const span = view.base - view.top;
  return placeAt(depth, (depth - view.top) / span, span * factor, whole);
}

/** Puts `depth` mid-view, keeping the span. */
export function centreOn(view: DepthInterval, depth: number, whole: DepthInterval): DepthInterval {
  return placeAt(depth, 0.5, view.base - view.top, whole);
}

/** A zoom button: `span` around the centre of the view. */
export function zoomToSpan(view: DepthInterval, span: number, whole: DepthInterval): DepthInterval {
  return placeAt((view.top + view.base) / 2, 0.5, span, whole);
}

/** The view fitted to a zone, with a little room above and below. */
export function fitZone(zone: Zone, whole: DepthInterval): DepthInterval {
  const room = (zone.base - zone.top) * ZONE_ROOM;
  return placeAt((zone.top + zone.base) / 2, 0.5, zone.base - zone.top + 2 * room, whole);
}

/** The overview strip's keys: arrows a tenth of the view, pages a view, Home and End the ends. */
export function keyStep(view: DepthInterval, key: string, whole: DepthInterval): DepthInterval | null {
  const span = view.base - view.top;
  switch (key) {
    case "ArrowUp":
      return panBy(view, -span / 10, whole);
    case "ArrowDown":
      return panBy(view, span / 10, whole);
    case "PageUp":
      return panBy(view, -span, whole);
    case "PageDown":
      return panBy(view, span, whole);
    case "Home":
      return placeAt(whole.top, 0, span, whole);
    case "End":
      return placeAt(whole.base, 1, span, whole);
    default:
      return null;
  }
}

/** A zoom button's span, written in metres, in the well's depth unit. */
export function spanInUnit(metres: number, unit: DepthUnit): number {
  return unit === "ft" ? metres / METRES_PER_FOOT : metres;
}

/** A wheel event's deltaY in CSS px, whatever its deltaMode (px, lines or pages). */
export function wheelPixels(deltaY: number, deltaMode: number, pageHeight: number): number {
  return deltaMode === 1 ? deltaY * LINE_PX : deltaMode === 2 ? deltaY * pageHeight : deltaY;
}

/** Ctrl+wheel (and a trackpad pinch, which browsers send as one): > 1 zooms out. */
export function wheelZoomFactor(pixels: number): number {
  return Math.exp(Math.min(Math.max(pixels, -MAX_ZOOM_PX), MAX_ZOOM_PX) * ZOOM_PER_PX);
}

/** The interval input's two fields, or null unless both are numbers with top above base. */
export function parseInterval(top: string, base: string): DepthInterval | null {
  if (!top.trim() || !base.trim()) return null;
  const t = Number(top);
  const b = Number(base);
  return Number.isFinite(t) && Number.isFinite(b) && b > t ? { top: t, base: b } : null;
}

/**
 * An interval typed into the interval input, or null when it doesn't parse
 * or lies wholly outside the well. Otherwise it is clamped to the well and
 * widened to MIN_SPAN about its middle, like every other way of moving.
 */
export function typedInterval(top: string, base: string, whole: DepthInterval): DepthInterval | null {
  const entered = parseInterval(top, base);
  if (!entered || entered.base <= whole.top || entered.top >= whole.base) return null;
  const clamped = effectiveInterval(entered, whole);
  return placeAt((clamped.top + clamped.base) / 2, 0.5, clamped.base - clamped.top, whole);
}

/** The overview strip's curve: the first gamma-ray curve in well log order, else the first continuous one. */
export function overviewCurve(log: WellLog): Curve | null {
  const continuous = log.curves.filter((c) => c.kind === "continuous");
  return continuous.find((c) => c.family === "gamma-ray") ?? continuous[0] ?? null;
}
