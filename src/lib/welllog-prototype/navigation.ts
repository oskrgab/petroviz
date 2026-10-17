// PROTOTYPE (#30) — throwaway depth navigation as a Svelte attachment on the plot area
// (the box the track canvases fill, headers excluded): wheel scroll, Ctrl/pinch zoom,
// drag pan, touch pan + pinch, depth cursor, click a zone to jump to it.

import type { Attachment } from 'svelte/attachments';
import type { LogViewState } from './view.svelte';

export function navigate(view: LogViewState): Attachment<HTMLElement> {
	return (el) => {
		el.style.touchAction = 'none';
		const pointers = new Map<number, { x: number; y: number }>();
		let downAt: { x: number; y: number } | null = null;
		let moved = false;
		let pinch: { dist: number; span: number; anchor: number; frac: number } | null = null;

		const depthAt = (clientY: number) => {
			const r = el.getBoundingClientRect();
			return view.top + ((clientY - r.top) / r.height) * (view.bottom - view.top);
		};
		const zoneUnder = (e: PointerEvent | MouseEvent, d: number) => {
			const id = (e.target as HTMLElement)?.dataset?.track;
			const t = view.template.tracks.find((t) => t.id === id);
			if (t?.kind !== 'zone') return null;
			return view.log?.zoneSets.find((s) => s.name === t.zoneSet)?.zones.find((z) => z.top <= d && d < z.base) ?? null;
		};

		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const r = el.getBoundingClientRect();
			const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
			if (e.ctrlKey || e.metaKey) {
				view.zoomAt(depthAt(e.clientY), Math.exp(Math.max(-60, Math.min(60, dy)) * 0.01));
			} else {
				view.panBy((dy / r.height) * (view.bottom - view.top));
			}
		};

		const onDown = (e: PointerEvent) => {
			if (e.button !== 0 && e.pointerType === 'mouse') return;
			el.setPointerCapture(e.pointerId);
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (pointers.size === 1) {
				downAt = { x: e.clientX, y: e.clientY };
				moved = false;
			} else if (pointers.size === 2) {
				const [p, q] = [...pointers.values()];
				const r = el.getBoundingClientRect();
				const midY = (p.y + q.y) / 2;
				pinch = { dist: Math.hypot(p.x - q.x, p.y - q.y), span: view.bottom - view.top, anchor: depthAt(midY), frac: (midY - r.top) / r.height };
				moved = true;
			}
		};

		const onMove = (e: PointerEvent) => {
			const prev = pointers.get(e.pointerId);
			if (!prev) {
				const d = depthAt(e.clientY);
				view.cursorMd = d;
				const z = zoneUnder(e, d);
				if (z !== view.hoveredZone) {
					view.hoveredZone = z;
					view.requestDraw();
				}
				el.style.cursor = z ? 'pointer' : 'crosshair';
				return;
			}
			const r = el.getBoundingClientRect();
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			if (pinch && pointers.size >= 2) {
				const [p, q] = [...pointers.values()];
				const span = pinch.span * (pinch.dist / Math.max(20, Math.hypot(p.x - q.x, p.y - q.y)));
				const midY = (p.y + q.y) / 2;
				const frac = (midY - r.top) / r.height;
				const top = pinch.anchor - frac * span;
				view.setInterval(top, top + span);
				return;
			}
			if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) moved = true;
			if (moved) view.panBy((-(e.clientY - prev.y) / r.height) * (view.bottom - view.top));
			if (e.pointerType !== 'mouse') view.cursorMd = depthAt(e.clientY);
		};

		const onUp = (e: PointerEvent) => {
			if (!pointers.has(e.pointerId)) return;
			pointers.delete(e.pointerId);
			if (pointers.size < 2) pinch = null;
			if (pointers.size === 0) {
				if (!moved) {
					const z = zoneUnder(e, depthAt(e.clientY));
					if (z) view.jumpToZone(z);
				}
				downAt = null;
			}
		};

		const onLeave = () => {
			if (pointers.size) return;
			view.cursorMd = null;
			if (view.hoveredZone) {
				view.hoveredZone = null;
				view.requestDraw();
			}
		};

		el.addEventListener('wheel', onWheel, { passive: false });
		el.addEventListener('pointerdown', onDown);
		el.addEventListener('pointermove', onMove);
		el.addEventListener('pointerup', onUp);
		el.addEventListener('pointercancel', onUp);
		el.addEventListener('pointerleave', onLeave);
		return () => {
			el.removeEventListener('wheel', onWheel);
			el.removeEventListener('pointerdown', onDown);
			el.removeEventListener('pointermove', onMove);
			el.removeEventListener('pointerup', onUp);
			el.removeEventListener('pointercancel', onUp);
			el.removeEventListener('pointerleave', onLeave);
		};
	};
}
