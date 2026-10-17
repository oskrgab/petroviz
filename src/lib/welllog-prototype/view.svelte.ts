// PROTOTYPE (#30) — throwaway view state: the loaded well log, the current template,
// the visible depth interval, the depth cursor, one rAF draw loop and perf counters.

import { replaceState } from '$app/navigation';
import { loadWell, listWells, nearestIndex, type Curve, type LoadTiming, type WellLog, type Zone } from './data';
import { defaultTemplate, entryFor, entryForCurve, fmt, matchTrack, uid, unmatchedCurves, type CurveEntry, type MatchedEntry, type Template, type Track } from './template';
import { readTheme, type Theme } from './render';

export type Drawer = { draw(theme: Theme): void };

export interface ReadoutRow {
	trackId: string;
	label: string;
	value: string;
	unit: string;
	colour: string;
}

export class LogViewState {
	wells = $state<string[]>([]);
	well = $state('15-9-13');
	log = $state.raw<WellLog | null>(null);
	loading = $state(false);
	error = $state<string | null>(null);
	timing = $state<(LoadTiming & { firstDrawMs: number; totalMs: number }) | null>(null);

	template = $state<Template>(defaultTemplate());
	/** bumped on every template edit; drawers key off it */
	layoutVersion = $state(0);

	top = $state(0);
	bottom = $state(100);
	cursorMd = $state<number | null>(null);
	hoveredZone = $state.raw<Zone | null>(null);
	dprOverride = $state<number | null>(null);

	fps = $state(0);
	lastDrawMs = $state(0);

	#drawers = new Set<Drawer>();
	#pending = false;
	#frameTimes: number[] = [];
	#selectStart = 0;
	#awaitingFirstDraw = false;
	#urlTimer: ReturnType<typeof setTimeout> | null = null;

	get dpr() {
		return this.dprOverride ?? (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
	}

	get extent(): [number, number] {
		const md = this.log?.md;
		return md ? [md[0], md[md.length - 1]] : [0, 100];
	}

	/** matched entries for every curve and discrete track, recomputed on layout or well change */
	matched = $derived.by(() => {
		void this.layoutVersion;
		const log = this.log;
		const out = new Map<string, MatchedEntry[]>();
		if (!log) return out;
		for (const t of this.template.tracks) {
			if (t.kind === 'curve') out.set(t.id, matchTrack(t.curves, log));
			if (t.kind === 'discrete') out.set(t.id, matchTrack([t.curve], log));
		}
		return out;
	});

	unmatched = $derived.by(() => {
		void this.layoutVersion;
		return this.log ? unmatchedCurves(this.template, this.log) : [];
	});

	/** depth cursor readout, grouped by track in display order */
	readout = $derived.by(() => this.readoutAt(this.cursorMd));

	readoutAt(d: number | null) {
		const log = this.log;
		const rows: ReadoutRow[] = [];
		if (!log || d === null) return { md: null as number | null, tvdss: null as number | null, rows, zones: [] as { set: string; name: string }[] };
		const i = nearestIndex(log.md, d);
		for (const t of this.template.tracks) {
			const m = this.matched.get(t.id) ?? [];
			for (const e of m) {
				if (!e.curve) continue;
				const v = e.curve.values[i];
				const discrete = e.curve.kind === 'discrete';
				rows.push({
					trackId: t.id,
					label: e.curve.mnemonic,
					value: discrete ? (Number.isNaN(v) ? '—' : (log.codeLabels[String(v)] ?? String(v))) : fmt(v),
					unit: discrete ? '' : e.curve.unit,
					colour: e.entry.colour
				});
			}
		}
		const zones = log.zoneSets.map((s) => ({ set: s.name, name: s.zones.find((z) => z.top <= d && d < z.base)?.name ?? '—' }));
		return { md: log.md[i], tvdss: log.tvdss ? log.tvdss[i] : null, rows, zones };
	}

	// ---- loading ------------------------------------------------------------------

	async init(params: URLSearchParams) {
		this.well = params.get('well') ?? this.well;
		const dpr = Number(params.get('dpr'));
		if (dpr > 0) this.dprOverride = dpr;
		const top = Number(params.get('top'));
		const bottom = Number(params.get('bottom'));
		listWells().then((w) => (this.wells = w)).catch(() => {});
		await this.select(this.well, params.has('top') && bottom > top ? [top, bottom] : null);
	}

	async select(well: string, interval: [number, number] | null = null) {
		this.well = well;
		this.loading = true;
		this.error = null;
		this.#selectStart = performance.now();
		try {
			const { log, timing } = await loadWell(well);
			this.log = log;
			const [a, b] = this.extent;
			[this.top, this.bottom] = interval ?? [a, b];
			this.timing = { ...timing, firstDrawMs: 0, totalMs: 0 };
			this.#awaitingFirstDraw = true;
			this.layoutVersion++;
			this.requestDraw();
			this.syncUrl();
		} catch (e) {
			this.error = String(e);
		} finally {
			this.loading = false;
		}
	}

	// ---- drawing ------------------------------------------------------------------

	register(d: Drawer) {
		this.#drawers.add(d);
		this.requestDraw();
		return () => this.#drawers.delete(d);
	}

	requestDraw() {
		if (this.#pending || typeof window === 'undefined') return;
		this.#pending = true;
		requestAnimationFrame((ts) => {
			this.#pending = false;
			this.drawAll(ts);
		});
	}

	drawAll(ts = performance.now()) {
		if (!this.log) return;
		const theme = readTheme();
		const t0 = performance.now();
		for (const d of this.#drawers) d.draw(theme);
		const t1 = performance.now();
		this.lastDrawMs = t1 - t0;
		this.#frameTimes.push(ts);
		while (this.#frameTimes.length && ts - this.#frameTimes[0] > 1000) this.#frameTimes.shift();
		this.fps = this.#frameTimes.length;
		if (this.#awaitingFirstDraw && this.timing) {
			this.#awaitingFirstDraw = false;
			this.timing = { ...this.timing, firstDrawMs: t1 - t0, totalMs: t1 - this.#selectStart };
		}
		return t1 - t0;
	}

	// ---- navigation ---------------------------------------------------------------

	setInterval(top: number, bottom: number) {
		const [a, b] = this.extent;
		const margin = (b - a) * 0.02;
		let span = Math.min(Math.max(bottom - top, 2), b - a + 2 * margin);
		top = Math.min(Math.max(top, a - margin), b + margin - span);
		this.top = top;
		this.bottom = top + span;
		this.requestDraw();
		this.syncUrl();
	}

	panBy(depth: number) {
		this.setInterval(this.top + depth, this.bottom + depth);
	}

	zoomAt(depth: number, factor: number) {
		this.setInterval(depth - (depth - this.top) * factor, depth + (this.bottom - depth) * factor);
	}

	centreOn(depth: number) {
		const h = (this.bottom - this.top) / 2;
		this.setInterval(depth - h, depth + h);
	}

	showWhole() {
		this.setInterval(...this.extent);
	}

	jumpToZone(z: Zone) {
		const pad = (z.base - z.top) * 0.08;
		this.setInterval(z.top - pad, z.base + pad);
	}

	syncUrl() {
		if (this.#urlTimer) clearTimeout(this.#urlTimer);
		this.#urlTimer = setTimeout(() => {
			const url = new URL(location.href);
			url.searchParams.set('well', this.well);
			url.searchParams.set('top', this.top.toFixed(1));
			url.searchParams.set('bottom', this.bottom.toFixed(1));
			try {
				replaceState(url, {});
			} catch {
				/* router not ready yet */
			}
		}, 250);
	}

	// ---- template edits (in memory only) -----------------------------------------

	edited() {
		this.layoutVersion++;
		this.requestDraw();
	}

	addCurveTrack(at = this.template.tracks.length) {
		this.template.tracks.splice(at, 0, { id: uid('t'), kind: 'curve', width: 1, curves: [], fills: [] });
		this.edited();
	}

	addTrack(t: Track, at = this.template.tracks.length) {
		this.template.tracks.splice(at, 0, t);
		this.edited();
	}

	removeTrack(id: string) {
		this.template.tracks = this.template.tracks.filter((t) => t.id !== id);
		this.edited();
	}

	moveTrack(id: string, to: number) {
		const ts = this.template.tracks;
		const from = ts.findIndex((t) => t.id === id);
		if (from < 0) return;
		const [t] = ts.splice(from, 1);
		ts.splice(Math.max(0, Math.min(to, ts.length)), 0, t);
		this.edited();
	}

	addCurve(trackId: string, c: Curve) {
		const t = this.template.tracks.find((t) => t.id === trackId);
		if (t?.kind !== 'curve') return;
		t.curves.push(entryForCurve(c));
		this.edited();
	}

	addFamily(trackId: string, family: string) {
		const t = this.template.tracks.find((t) => t.id === trackId);
		if (t?.kind !== 'curve') return;
		t.curves.push(entryFor(family));
		this.edited();
	}

	removeCurve(trackId: string, entryId: string) {
		const t = this.template.tracks.find((t) => t.id === trackId);
		if (t?.kind !== 'curve') return;
		t.curves = t.curves.filter((e) => e.id !== entryId);
		t.fills = t.fills.filter((f) => !('curve' in f.a && f.a.curve === entryId) && !('curve' in f.b && f.b.curve === entryId));
		this.edited();
	}

	updateEntry(entry: CurveEntry, patch: Partial<CurveEntry>) {
		Object.assign(entry, patch);
		this.edited();
	}

	setWidth(id: string, width: number) {
		const t = this.template.tracks.find((t) => t.id === id);
		if (!t) return;
		t.width = Math.max(0.2, Math.min(4, width));
		this.edited();
	}

	resetTemplate() {
		this.template = defaultTemplate();
		this.edited();
	}

	// ---- benchmark ----------------------------------------------------------------

	/** Scripted zoom + pan with a full redraw every frame. */
	benchmark(frames = 240): Promise<BenchResult> {
		const [a, b] = this.extent;
		const span0 = Math.min(400, b - a);
		const startTop = this.top, startBottom = this.bottom;
		const stamps: number[] = [];
		const draws: number[] = [];
		return new Promise((resolve) => {
			let f = 0;
			const step = (ts: number) => {
				const phase = f / frames;
				const span = span0 * (0.15 + 0.85 * (0.5 + 0.5 * Math.cos(phase * Math.PI * 4)));
				const centre = a + span0 / 2 + (b - a - span0) * phase;
				this.top = centre - span / 2;
				this.bottom = centre + span / 2;
				draws.push(this.drawAll(ts) ?? 0);
				stamps.push(ts);
				if (++f < frames) requestAnimationFrame(step);
				else {
					const gaps = stamps.slice(1).map((t, i) => t - stamps[i]).sort((x, y) => x - y);
					const ds = draws.sort((x, y) => x - y);
					const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.floor(p * arr.length))];
					this.setInterval(startTop, startBottom);
					resolve({
						frames,
						dpr: this.dpr,
						medianFrameMs: q(gaps, 0.5),
						p95FrameMs: q(gaps, 0.95),
						medianFps: 1000 / q(gaps, 0.5),
						medianDrawMs: q(ds, 0.5),
						p95DrawMs: q(ds, 0.95),
						tracks: this.template.tracks.length,
						curves: [...this.matched.values()].flat().filter((m) => m.curve).length
					});
				}
			};
			requestAnimationFrame(step);
		});
	}
}

export interface BenchResult {
	frames: number;
	dpr: number;
	medianFrameMs: number;
	p95FrameMs: number;
	medianFps: number;
	medianDrawMs: number;
	p95DrawMs: number;
	tracks: number;
	curves: number;
}
