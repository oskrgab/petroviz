/**
 * Depth gestures on the track bodies, as one attachment on the track grid:
 * wheel to scroll, Ctrl+wheel (a trackpad pinch arrives as one) to zoom
 * around the pointer, drag to pan, two-finger pinch to zoom on touch, and a
 * click on a zone to fit the view to it. Headers are left alone.
 *
 * Glue only: every interval comes from the pure functions in navigation.ts,
 * worked on the view's depth axis (axis.ts) since the tracks are laid out
 * down it, and reaches the bound interval through view.navigateOnAxis.
 * Checked in the app.
 */

import type { Attachment } from "svelte/attachments";
import { onAxisWithin } from "./axis.ts";
import { hitTrack } from "./kinds/index.ts";
import type { LogViewState } from "./logView.svelte.ts";
import { fitZone, panByPixels, placeAt, wheelPixels, wheelZoomFactor, zoomAround } from "./navigation.ts";

/** A press that moves less than this many CSS px is a click, not a drag. */
const CLICK_SLOP_PX = 4;

/** Two fingers closer than this don't zoom further, so a pinch can't run away. */
const MIN_PINCH_PX = 20;

/** Marks a track body in LogView, with its track's id: for the zone a click lands on, and the depth cursor. */
export const TRACK_BODY = "data-track-body";

interface Point {
  x: number;
  y: number;
}

export function depthGestures(view: LogViewState): Attachment<HTMLElement> {
  return (grid) => {
    const pointers = new Map<number, Point>();
    // The body a press began on: its rect is every body's, as they share one row.
    let body: HTMLElement | null = null;
    let press: Point | null = null;
    let moved = false;
    let pinch: { anchor: number; span: number; distance: number } | null = null;

    const bodyOf = (target: EventTarget | null) =>
      target instanceof Element ? target.closest<HTMLElement>(`[${TRACK_BODY}]`) : null;
    const fractionDown = (rect: DOMRect, clientY: number) => (clientY - rect.top) / rect.height;

    function onwheel(event: WheelEvent) {
      const target = bodyOf(event.target);
      if (!target) return;
      const zoom = event.ctrlKey;
      // Sideways scrolling belongs to the track row when it overflows.
      if (!zoom && (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))) return;
      event.preventDefault();
      const rect = target.getBoundingClientRect();
      const interval = view.axisInterval;
      const pixels = wheelPixels(event.deltaY, event.deltaMode, rect.height);
      if (zoom) {
        const depth = view.axisDepthAt(fractionDown(rect, event.clientY));
        view.navigateOnAxis(zoomAround(interval, depth, wheelZoomFactor(pixels), view.axisExtent));
      } else {
        view.navigateOnAxis(panByPixels(interval, pixels, rect.height, view.axisExtent));
      }
    }

    function startPinch() {
      if (!body) return;
      const [p, q] = [...pointers.values()];
      const { top, base } = view.axisInterval;
      pinch = {
        anchor: view.axisDepthAt(fractionDown(body.getBoundingClientRect(), (p.y + q.y) / 2)),
        span: base - top,
        distance: Math.max(MIN_PINCH_PX, Math.hypot(p.x - q.x, p.y - q.y)),
      };
      moved = true;
    }

    function onpointerdown(event: PointerEvent) {
      const target = bodyOf(event.target);
      if (!target || (event.pointerType === "mouse" && event.button !== 0)) return;
      if (pointers.size === 0) {
        body = target;
        press = { x: event.clientX, y: event.clientY };
        moved = false;
      }
      grid.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) startPinch();
      grid.dataset.dragging = "";
    }

    function onpointermove(event: PointerEvent) {
      const last = pointers.get(event.pointerId);
      if (!last || !body || !press) return;
      const point = { x: event.clientX, y: event.clientY };
      const rect = body.getBoundingClientRect();

      if (pinch && pointers.size >= 2) {
        pointers.set(event.pointerId, point);
        const [p, q] = [...pointers.values()];
        const distance = Math.max(MIN_PINCH_PX, Math.hypot(p.x - q.x, p.y - q.y));
        const fraction = fractionDown(rect, (p.y + q.y) / 2);
        view.navigateOnAxis(placeAt(pinch.anchor, fraction, (pinch.span * pinch.distance) / distance, view.axisExtent));
        return;
      }

      if (!moved && Math.hypot(point.x - press.x, point.y - press.y) <= CLICK_SLOP_PX) return;
      moved = true;
      pointers.set(event.pointerId, point);
      view.navigateOnAxis(panByPixels(view.axisInterval, last.y - point.y, rect.height, view.axisExtent));
    }

    function onpointerup(event: PointerEvent) {
      if (!pointers.delete(event.pointerId)) return;
      if (pointers.size < 2) pinch = null;
      if (pointers.size > 0) return;
      if (!moved && body && event.type === "pointerup") fitZoneAt(body, event.clientY);
      body = press = null;
      delete grid.dataset.dragging;
    }

    function fitZoneAt(target: HTMLElement, clientY: number) {
      const resolved = view.resolved.tracks.find((t) => t.track.id === target.getAttribute(TRACK_BODY));
      if (resolved?.kind !== "zone" || !resolved.zoneSet) return;
      const item = hitTrack(resolved, view.mdAt(fractionDown(target.getBoundingClientRect(), clientY)));
      if (item !== null) view.navigateOnAxis(fitZone(onAxisWithin(view.axis, resolved.zoneSet.zones[item]), view.axisExtent));
    }

    // Not passive: the wheel must not also scroll the page or zoom it.
    grid.addEventListener("wheel", onwheel, { passive: false });
    grid.addEventListener("pointerdown", onpointerdown);
    grid.addEventListener("pointermove", onpointermove);
    grid.addEventListener("pointerup", onpointerup);
    grid.addEventListener("pointercancel", onpointerup);
    return () => {
      grid.removeEventListener("wheel", onwheel);
      grid.removeEventListener("pointerdown", onpointerdown);
      grid.removeEventListener("pointermove", onpointermove);
      grid.removeEventListener("pointerup", onpointerup);
      grid.removeEventListener("pointercancel", onpointerup);
    };
  };
}
