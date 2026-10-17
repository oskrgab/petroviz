// PROTOTYPE (#30) — throwaway Canvas 2D renderer, after docs/research/log-view-rendering.md:
// one canvas per track, M4 min/max decimation per device-pixel row, log10 precomputed,
// fills as clipped polygons, wrap drawn by re-stroking the path shifted one scale width.

import type { Curve, WellLog, Zone } from './data';
import { lowerBound } from './data';
import type { Boundary, Fill, MatchedEntry, ResolvedScale } from './template';
import { hashColour, lithology, type Dash, type Hatch } from './families';

export interface Viewport {
	top: number;
	bottom: number;
	cssW: number;
	cssH: number;
	dpr: number;
}

export interface Theme {
	grid: string;
	gridStrong: string;
	text: string;
	surface: string;
}

export function readTheme(): Theme {
	const s = getComputedStyle(document.documentElement);
	return {
		grid: s.getPropertyValue('--color-border').trim() || '#e2e8f0',
		gridStrong: s.getPropertyValue('--color-border-strong').trim() || '#cbd5e1',
		text: s.getPropertyValue('--color-text-secondary').trim() || '#64748b',
		surface: s.getPropertyValue('--color-surface').trim() || '#fff'
	};
}

// ---- normalised curve positions (0..1 across the track) ------------------------------

const tCache = new WeakMap<Float32Array, Map<string, Float32Array>>();

export function normalised(c: Curve, s: ResolvedScale): Float32Array {
	const key = `${s.left}|${s.right}|${s.log}`;
	let m = tCache.get(c.values);
	if (!m) tCache.set(c.values, (m = new Map()));
	let t = m.get(key);
	if (!t) {
		const v = c.values;
		t = new Float32Array(v.length);
		const span = s.right - s.left;
		for (let i = 0; i < v.length; i++) {
			const x = s.log ? (v[i] > 0 ? Math.log10(v[i]) : NaN) : v[i];
			t[i] = (x - s.left) / span;
		}
		m.set(key, t);
	}
	return t;
}

export function valueToT(value: number, s: ResolvedScale) {
	const x = s.log ? Math.log10(value) : value;
	return (x - s.left) / (s.right - s.left);
}

// ---- shared frame geometry ----------------------------------------------------------

interface Frame {
	w: number; // device px
	h: number;
	k: number; // device px per depth unit
	top: number;
	i0: number;
	i1: number; // exclusive
}

function frameOf(log: WellLog, vp: Viewport): Frame {
	const w = Math.round(vp.cssW * vp.dpr);
	const h = Math.round(vp.cssH * vp.dpr);
	const k = h / (vp.bottom - vp.top);
	const i0 = Math.max(0, lowerBound(log.md, vp.top) - 1);
	const i1 = Math.min(log.md.length, lowerBound(log.md, vp.bottom) + 1);
	return { w, h, k, top: vp.top, i0, i1 };
}

/** M4 envelope: x,y pairs in device px, NaN pairs break the line. */
function envelope(md: Float64Array, t: Float32Array, f: Frame): Float32Array {
	const n = f.i1 - f.i0;
	if (n <= f.h * 4) {
		const out = new Float32Array(n * 2);
		for (let i = f.i0, j = 0; i < f.i1; i++, j += 2) {
			out[j] = t[i] * f.w;
			out[j + 1] = (md[i] - f.top) * f.k;
		}
		return out;
	}
	const out = new Float32Array(f.h * 8 + 8);
	let j = 0;
	let row = -1;
	let first = -1, last = -1, mn = -1, mx = -1;
	const flush = () => {
		if (first < 0) return;
		const idx = [first, mn, mx, last].sort((a, b) => a - b);
		let prev = -1;
		for (const i of idx) {
			if (i === prev) continue;
			prev = i;
			out[j++] = t[i] * f.w;
			out[j++] = (md[i] - f.top) * f.k;
		}
	};
	for (let i = f.i0; i < f.i1; i++) {
		const r = Math.floor((md[i] - f.top) * f.k);
		if (r !== row) {
			flush();
			row = r;
			first = last = mn = mx = -1;
		}
		const v = t[i];
		if (Number.isNaN(v)) {
			if (first >= 0) {
				flush();
				first = last = mn = mx = -1;
			}
			out[j++] = NaN;
			out[j++] = NaN;
			continue;
		}
		if (first < 0) first = mn = mx = i;
		if (v < t[mn]) mn = i;
		if (v > t[mx]) mx = i;
		last = i;
	}
	flush();
	return out.subarray(0, j);
}

function strokeEnvelope(ctx: CanvasRenderingContext2D, e: Float32Array) {
	ctx.beginPath();
	let pen = false;
	for (let j = 0; j < e.length; j += 2) {
		const x = e[j];
		if (Number.isNaN(x)) {
			pen = false;
			continue;
		}
		if (pen) ctx.lineTo(x, e[j + 1]);
		else ctx.moveTo(x, e[j + 1]);
		pen = true;
	}
	ctx.stroke();
}

const dashes: Record<Dash, number[]> = { solid: [], dashed: [6, 4], dotted: [1.5, 3], dashdot: [7, 3, 1.5, 3] };

function depthGrid(ctx: CanvasRenderingContext2D, f: Frame, dpr: number, theme: Theme) {
	const pxPerUnit = f.k / dpr;
	const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
	const minor = steps.find((s) => s * pxPerUnit >= 10) ?? 1000;
	const major = steps.find((s) => s >= minor * 5) ?? minor * 5;
	const bottom = f.top + f.h / f.k;
	for (const [step, colour] of [[minor, theme.grid], [major, theme.gridStrong]] as const) {
		ctx.strokeStyle = colour;
		ctx.lineWidth = dpr;
		ctx.beginPath();
		for (let d = Math.ceil(f.top / step) * step; d <= bottom; d += step) {
			const y = Math.round((d - f.top) * f.k) + 0.5;
			ctx.moveTo(0, y);
			ctx.lineTo(f.w, y);
		}
		ctx.stroke();
	}
	return { minor, major };
}

function scaleGrid(ctx: CanvasRenderingContext2D, s: ResolvedScale | null, f: Frame, dpr: number, theme: Theme) {
	ctx.strokeStyle = theme.grid;
	ctx.lineWidth = dpr;
	ctx.beginPath();
	if (s?.log) {
		const lo = Math.min(s.left, s.right), hi = Math.max(s.left, s.right);
		for (let d = Math.ceil(lo); d <= hi; d++) {
			for (let m = 1; m < 10; m++) {
				const x = (Math.log10(m * 10 ** d) - s.left) / (s.right - s.left);
				if (x < 0 || x > 1) continue;
				const px = Math.round(x * f.w) + 0.5;
				ctx.moveTo(px, 0);
				ctx.lineTo(px, f.h);
			}
		}
	} else {
		for (let i = 1; i < 10; i++) {
			const px = Math.round((i / 10) * f.w) + 0.5;
			ctx.moveTo(px, 0);
			ctx.lineTo(px, f.h);
		}
	}
	ctx.stroke();
}

// ---- curve track -------------------------------------------------------------------

function boundaryX(b: Boundary, matched: MatchedEntry[], other: Boundary, f: Frame): ((i: number) => number) | null {
	const clamp = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t) * f.w;
	if ('edge' in b) {
		const x = b.edge === 'left' ? 0 : f.w;
		return () => x;
	}
	if ('curve' in b) {
		const m = matched.find((m) => m.entry.id === b.curve);
		if (!m?.curve || !m.scale) return null;
		const t = normalised(m.curve, m.scale);
		return (i) => (Number.isNaN(t[i]) ? NaN : clamp(t[i]));
	}
	const om = 'curve' in other ? matched.find((m) => m.entry.id === other.curve) : null;
	if (!om?.scale) return null;
	const x = clamp(valueToT(b.value, om.scale));
	return () => x;
}

function drawFill(ctx: CanvasRenderingContext2D, log: WellLog, fill: Fill, matched: MatchedEntry[], f: Frame) {
	const xa = boundaryX(fill.a, matched, fill.b, f);
	const xb = boundaryX(fill.b, matched, fill.a, f);
	if (!xa || !xb) return;
	const md = log.md;
	const stride = Math.max(1, Math.floor((f.i1 - f.i0) / f.h));
	// runs where both boundaries are defined
	const runs: number[][] = [];
	let run: number[] = [];
	for (let i = f.i0; i < f.i1; i += stride) {
		if (Number.isNaN(xa(i)) || Number.isNaN(xb(i))) {
			if (run.length > 1) runs.push(run);
			run = [];
		} else run.push(i);
	}
	if (run.length > 1) runs.push(run);
	const y = (i: number) => (md[i] - f.top) * f.k;
	const side = (xs: (i: number) => number, r: number[], edge: number) => {
		const p = new Path2D();
		p.moveTo(edge, y(r[0]));
		for (const i of r) p.lineTo(xs(i), y(i));
		p.lineTo(edge, y(r[r.length - 1]));
		p.closePath();
		return p;
	};
	for (const r of runs) {
		for (const [colour, clipEdge, fillEdge] of [
			[fill.colourWhereALeft, f.w + 1, -1],
			[fill.colourWhereARight, -1, f.w + 1]
		] as const) {
			if (!colour) continue;
			ctx.save();
			ctx.clip(side(xa, r, clipEdge)); // the side of A away from clipEdge's opposite
			ctx.fillStyle = colour;
			ctx.fill(side(xb, r, fillEdge));
			ctx.restore();
		}
	}
}

export function drawCurveTrack(ctx: CanvasRenderingContext2D, log: WellLog, matched: MatchedEntry[], fills: Fill[], vp: Viewport, theme: Theme) {
	const f = frameOf(log, vp);
	ctx.clearRect(0, 0, f.w, f.h);
	scaleGrid(ctx, matched.find((m) => m.scale)?.scale ?? null, f, vp.dpr, theme);
	depthGrid(ctx, f, vp.dpr, theme);
	for (const fill of fills) drawFill(ctx, log, fill, matched, f);
	ctx.save();
	ctx.beginPath();
	ctx.rect(0, 0, f.w, f.h);
	ctx.clip();
	ctx.lineJoin = 'round';
	for (const m of matched) {
		if (!m.curve || !m.scale) continue;
		const e = envelope(log.md, normalised(m.curve, m.scale), f);
		ctx.strokeStyle = m.entry.colour;
		ctx.lineWidth = m.entry.width * vp.dpr;
		ctx.setLineDash(dashes[m.entry.dash].map((d) => d * vp.dpr));
		ctx.globalAlpha = 1;
		strokeEnvelope(ctx, e);
		if (m.entry.offScale === 'wrap') {
			ctx.globalAlpha = 0.45;
			for (const dx of [-f.w, f.w]) {
				ctx.save();
				ctx.translate(dx, 0);
				strokeEnvelope(ctx, e);
				ctx.restore();
			}
		}
	}
	ctx.restore();
	ctx.globalAlpha = 1;
	ctx.setLineDash([]);
}

// ---- depth track -------------------------------------------------------------------

export function drawDepthTrack(ctx: CanvasRenderingContext2D, log: WellLog, ref: 'md' | 'tvdss', vp: Viewport, theme: Theme) {
	const f = frameOf(log, vp);
	ctx.clearRect(0, 0, f.w, f.h);
	const pxPerUnit = f.k / vp.dpr;
	const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
	const step = steps.find((s) => s * pxPerUnit >= 40) ?? 1000;
	ctx.fillStyle = theme.text;
	ctx.strokeStyle = theme.gridStrong;
	ctx.lineWidth = vp.dpr;
	ctx.font = `${11 * vp.dpr}px "IBM Plex Mono", monospace`;
	ctx.textAlign = 'right';
	ctx.textBaseline = 'middle';
	const tick = (d: number, label: number) => {
		const y = Math.round((d - f.top) * f.k) + 0.5;
		ctx.beginPath();
		ctx.moveTo(f.w - 5 * vp.dpr, y);
		ctx.lineTo(f.w, y);
		ctx.stroke();
		ctx.fillText(String(Math.round(label * 10) / 10), f.w - 7 * vp.dpr, y);
	};
	if (ref === 'md' || !log.tvdss) {
		const bottom = f.top + f.h / f.k;
		for (let d = Math.ceil(f.top / step) * step; d <= bottom; d += step) tick(d, d);
	} else {
		const tv = log.tvdss;
		let prev = NaN;
		for (let i = f.i0; i < f.i1; i++) {
			const b = Math.floor(tv[i] / step);
			if (!Number.isNaN(prev) && b !== prev) tick(log.md[i], b * step);
			prev = b;
		}
	}
}

// ---- discrete track ----------------------------------------------------------------

const patternCache = new Map<string, CanvasPattern | string>();

function hatchTile(colour: string, hatch: Hatch, dpr: number): HTMLCanvasElement {
	const s = Math.round(12 * dpr);
	const c = document.createElement('canvas');
	c.width = c.height = s;
	const g = c.getContext('2d')!;
	g.fillStyle = colour;
	g.fillRect(0, 0, s, s);
	g.strokeStyle = g.fillStyle = 'rgba(0,0,0,0.55)';
	g.lineWidth = Math.max(1, dpr * 0.9);
	const u = s / 12;
	const line = (pts: number[]) => {
		g.beginPath();
		g.moveTo(pts[0] * u, pts[1] * u);
		for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i] * u, pts[i + 1] * u);
		g.stroke();
	};
	const dot = (x: number, y: number) => g.fillRect(x * u, y * u, 1.3 * u, 1.3 * u);
	switch (hatch) {
		case 'dots': dot(2, 2); dot(8, 8); break;
		case 'dotdash': dot(2, 2); line([6, 8, 11, 8]); break;
		case 'dashes': line([1, 3, 6, 3]); line([7, 9, 12, 9]); break;
		case 'wavy': line([0, 6, 3, 4, 6, 6, 9, 8, 12, 6]); break;
		case 'brick': line([0, 0, 12, 0]); line([0, 6, 12, 6]); line([3, 0, 3, 6]); line([9, 6, 9, 12]); break;
		case 'rhomb': line([0, 0, 12, 0]); line([0, 6, 12, 6]); line([2, 0, 4, 6]); line([8, 6, 10, 12]); break;
		case 'openbrick': line([1, 3, 5, 3]); line([3, 3, 3, 5]); line([7, 9, 11, 9]); line([9, 9, 9, 11]); break;
		case 'checker': line([0, 0, 12, 12]); line([12, 0, 0, 12]); break;
		case 'chevrons': line([2, 6, 4, 3, 6, 6]); line([8, 11, 10, 8, 12, 11]); break;
		case 'ticks': line([3, 2, 3, 5]); line([9, 8, 9, 11]); break;
		case 'crosses': line([3, 1, 3, 5]); line([1, 3, 5, 3]); line([9, 7, 9, 11]); line([7, 9, 11, 9]); break;
		case 'solid': break;
	}
	return c;
}

export function codeStyle(code: number): { colour: string; hatch: Hatch | null } {
	const l = lithology[String(code)];
	return l ? { colour: l.colour, hatch: l.hatch } : { colour: hashColour(String(code)), hatch: null };
}

function fillFor(ctx: CanvasRenderingContext2D, code: number, dpr: number): CanvasPattern | string {
	const key = `${code}@${dpr}`;
	let p = patternCache.get(key);
	if (!p) {
		const st = codeStyle(code);
		p = st.hatch ? ctx.createPattern(hatchTile(st.colour, st.hatch, dpr), 'repeat')! : st.colour;
		patternCache.set(key, p);
	}
	return p;
}

export function drawDiscreteTrack(ctx: CanvasRenderingContext2D, log: WellLog, curve: Curve | null, vp: Viewport, theme: Theme) {
	const f = frameOf(log, vp);
	ctx.clearRect(0, 0, f.w, f.h);
	if (!curve) return;
	const v = curve.values;
	const md = log.md;
	let start = f.i0;
	for (let i = f.i0 + 1; i <= f.i1; i++) {
		if (i === f.i1 || v[i] !== v[start]) {
			const code = v[start];
			if (!Number.isNaN(code)) {
				const y0 = (md[start] - f.top) * f.k;
				const y1 = ((i < md.length ? md[i] : md[md.length - 1]) - f.top) * f.k;
				ctx.fillStyle = fillFor(ctx, code, vp.dpr);
				ctx.fillRect(0, y0, f.w, Math.max(y1 - y0, 1));
			}
			start = i;
		}
	}
	void theme;
}

// ---- zone track --------------------------------------------------------------------

export function drawZoneTrack(ctx: CanvasRenderingContext2D, log: WellLog, zones: Zone[], vp: Viewport, theme: Theme, hovered: Zone | null) {
	const f = frameOf(log, vp);
	ctx.clearRect(0, 0, f.w, f.h);
	ctx.font = `${10.5 * vp.dpr}px "IBM Plex Sans", sans-serif`;
	ctx.textBaseline = 'middle';
	ctx.textAlign = 'left';
	for (const z of zones) {
		if (z.base < vp.top || z.top > vp.bottom) continue;
		const y0 = (z.top - f.top) * f.k;
		const y1 = (z.base - f.top) * f.k;
		ctx.globalAlpha = z === hovered ? 0.85 : 0.55;
		ctx.fillStyle = hashColour(z.name);
		ctx.fillRect(0, y0, f.w, y1 - y0);
		ctx.globalAlpha = 1;
		ctx.strokeStyle = theme.gridStrong;
		ctx.lineWidth = vp.dpr;
		ctx.beginPath();
		ctx.moveTo(0, Math.round(y0) + 0.5);
		ctx.lineTo(f.w, Math.round(y0) + 0.5);
		ctx.stroke();
		if (y1 - y0 > 14 * vp.dpr) {
			const yc = Math.min(Math.max((Math.max(y0, 0) + Math.min(y1, f.h)) / 2, y0 + 8 * vp.dpr), y1 - 8 * vp.dpr);
			ctx.fillStyle = '#111';
			ctx.save();
			ctx.beginPath();
			ctx.rect(0, y0, f.w, y1 - y0);
			ctx.clip();
			ctx.fillText(z.name, 4 * vp.dpr, yc);
			ctx.restore();
		}
	}
}

// ---- overview strip ----------------------------------------------------------------

/** Whole-well miniature: an optional curve trace plus zone colour bands. */
export function drawOverview(ctx: CanvasRenderingContext2D, log: WellLog, curve: { c: Curve; s: ResolvedScale; colour: string } | null, zones: Zone[], vp: Viewport, theme: Theme, zoneWidth = 0.35) {
	const f = frameOf(log, vp);
	ctx.clearRect(0, 0, f.w, f.h);
	const zw = Math.round(f.w * zoneWidth);
	for (const z of zones) {
		ctx.fillStyle = hashColour(z.name);
		ctx.globalAlpha = 0.6;
		ctx.fillRect(0, (z.top - f.top) * f.k, zw, (z.base - z.top) * f.k);
	}
	ctx.globalAlpha = 1;
	if (curve) {
		const sub = { ...f, w: f.w - zw };
		ctx.save();
		ctx.translate(zw, 0);
		ctx.beginPath();
		ctx.rect(0, 0, sub.w, f.h);
		ctx.clip();
		ctx.strokeStyle = curve.colour;
		ctx.lineWidth = vp.dpr;
		strokeEnvelope(ctx, envelope(log.md, normalised(curve.c, curve.s), sub));
		ctx.restore();
	}
	void theme;
}
