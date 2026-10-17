// PROTOTYPE (#30) — throwaway, simplified version of the layout model in ADR-0003
// with the default template from #29. Not the real validator or file format.

import { curveFamilyDefaults, type Dash, type ScaleEnds } from './families';
import type { Curve, WellLog } from './data';

export type Selector = { by: 'key' | 'mnemonic' | 'family'; value: string };

export interface CurveEntry {
	id: string;
	select: Selector[];
	ends: ScaleEnds;
	type: 'linear' | 'log';
	offScale: 'wrap' | 'clip';
	colour: string;
	width: number;
	dash: Dash;
}

export type Boundary = { curve: string } | { edge: 'left' | 'right' } | { value: number };

export interface Fill {
	id: string;
	a: Boundary;
	b: Boundary;
	colourWhereALeft: string | null;
	colourWhereARight: string | null;
}

export type Track =
	| { id: string; kind: 'curve'; width: number; curves: CurveEntry[]; fills: Fill[] }
	| { id: string; kind: 'depth'; width: number; ref: 'active' | 'md' | 'tvdss' }
	| { id: string; kind: 'discrete'; width: number; curve: CurveEntry }
	| { id: string; kind: 'zone'; width: number; zoneSet: string };

export interface Template {
	name: string;
	tracks: Track[];
}

let seq = 0;
export const uid = (p: string) => `${p}${++seq}`;

export function entryFor(family: string, select?: Selector[]): CurveEntry {
	const d = curveFamilyDefaults[family] ?? curveFamilyDefaults.unknown;
	return {
		id: uid(family),
		select: select ?? [{ by: 'family', value: family }],
		ends: structuredClone(d.ends),
		type: d.type,
		offScale: d.offScale,
		colour: d.colour,
		width: 1,
		dash: d.dash
	};
}

/** An entry for a curve picked by hand: [key, mnemonic, family]. */
export function entryForCurve(c: Curve): CurveEntry {
	return entryFor(c.family, [
		{ by: 'key', value: c.key },
		{ by: 'mnemonic', value: c.mnemonic },
		{ by: 'family', value: c.family }
	]);
}

export function defaultTemplate(): Template {
	const gr = entryFor('gr');
	const cal = entryFor('caliper');
	const bs = entryFor('bitsize');
	const rhob = entryFor('rhob');
	const nphi = entryFor('nphi');
	return {
		name: 'Default',
		tracks: [
			{
				id: uid('t'), kind: 'curve', width: 1,
				curves: [gr, entryFor('sgr'), entryFor('sp'), cal, bs],
				fills: [
					{ id: uid('f'), a: { curve: gr.id }, b: { edge: 'right' }, colourWhereALeft: '#FFFF0066', colourWhereARight: null },
					{ id: uid('f'), a: { edge: 'left' }, b: { curve: gr.id }, colourWhereALeft: '#BEBEBE66', colourWhereARight: null },
					{ id: uid('f'), a: { curve: bs.id }, b: { curve: cal.id }, colourWhereALeft: '#FFA50066', colourWhereARight: '#8FBC8F66' }
				]
			},
			{ id: uid('t'), kind: 'depth', width: 0.5, ref: 'active' },
			{ id: uid('t'), kind: 'curve', width: 1, curves: ['rdep', 'rmed', 'rsha'].map((f) => entryFor(f)).concat([
				entryFor('rmicro', [{ by: 'mnemonic', value: 'RXO' }, { by: 'family', value: 'rmicro' }]),
				{ ...entryFor('rmicro', [{ by: 'mnemonic', value: 'RMIC' }, { by: 'family', value: 'rmicro' }]), dash: 'dotted' }
			]), fills: [] },
			{
				id: uid('t'), kind: 'curve', width: 1,
				curves: [rhob, nphi, entryFor('pef')],
				fills: [{ id: uid('f'), a: { curve: rhob.id }, b: { curve: nphi.id }, colourWhereALeft: '#FFFF0066', colourWhereARight: '#BEBEBE66' }]
			},
			{ id: uid('t'), kind: 'curve', width: 1, curves: [entryFor('dtc'), entryFor('dts')], fills: [] },
			{ id: uid('t'), kind: 'curve', width: 0.75, curves: [
				entryFor('rop', [{ by: 'mnemonic', value: 'ROP' }, { by: 'family', value: 'rop' }]),
				{ ...entryFor('rop', [{ by: 'mnemonic', value: 'ROPA' }, { by: 'family', value: 'rop' }]), dash: 'dashed' },
				entryFor('mudweight')
			], fills: [] },
			{ id: uid('t'), kind: 'discrete', width: 0.4, curve: entryFor('lithology') },
			{ id: uid('t'), kind: 'zone', width: 0.6, zoneSet: 'GROUP' },
			{ id: uid('t'), kind: 'zone', width: 0.6, zoneSet: 'FORMATION' }
		]
	};
}

// ---- matching ----------------------------------------------------------------

export interface ResolvedScale {
	left: number; // in scale space (log10 for log scales)
	right: number;
	log: boolean;
	shownLeft: number; // in curve units, for headers
	shownRight: number;
	fallback: boolean; // fixed scale whose unit did not match
}

export interface MatchedEntry {
	entry: CurveEntry;
	curve: Curve | null;
	scale: ResolvedScale | null;
}

function matches(s: Selector, c: Curve) {
	if (s.by === 'key') return c.key === s.value;
	if (s.by === 'mnemonic') return c.mnemonic.toUpperCase() === s.value.toUpperCase();
	return c.family === s.value;
}

/** Match a track's entries; a family selector skips curves another entry in the track matched by key or mnemonic. */
export function matchEntries(entries: CurveEntry[], log: WellLog): (Curve | null)[] {
	const explicit = new Set<Curve>();
	for (const e of entries)
		for (const s of e.select) {
			const c = s.by === 'family' ? undefined : log.curves.find((c) => matches(s, c));
			if (c) {
				explicit.add(c);
				break;
			}
		}
	return entries.map((e) => {
		for (const s of e.select) {
			const c = log.curves.find((c) => matches(s, c) && (s.by !== 'family' || !explicit.has(c)));
			if (c) return c;
		}
		return null;
	});
}

function percentile(sorted: Float32Array, p: number) {
	if (!sorted.length) return NaN;
	const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
	return sorted[i];
}

const sortedCache = new WeakMap<Float32Array, Float32Array>();
function sortedFinite(values: Float32Array, log: boolean) {
	let s = sortedCache.get(values);
	if (!s) {
		s = values.filter((v) => !Number.isNaN(v)).sort();
		sortedCache.set(values, s);
	}
	return log ? s.filter((v) => v > 0) : s;
}

export function resolveScale(e: CurveEntry, c: Curve): ResolvedScale {
	const log = e.type === 'log';
	let left: number;
	let right: number;
	let fallback = false;
	const ends = e.ends;
	if (ends.mode === 'fixed' && (ends.unit === c.unit || !ends.unit)) {
		left = ends.left;
		right = ends.right;
	} else if (ends.mode === 'centredOnMedian') {
		const s = sortedFinite(c.values, false);
		const m = percentile(s, 50);
		left = m - ends.width / 2;
		right = m + ends.width / 2;
	} else {
		fallback = ends.mode === 'fixed';
		const s = sortedFinite(c.values, log);
		const lo = ends.mode === 'percentile' ? ends.lo : 1;
		const hi = ends.mode === 'percentile' ? ends.hi : 99;
		left = percentile(s, lo);
		right = percentile(s, hi);
		if (ends.mode === 'fixed' && ends.left > ends.right) [left, right] = [right, left];
		if (left === right) right = left + 1;
	}
	return {
		left: log ? Math.log10(Math.max(left, 1e-6)) : left,
		right: log ? Math.log10(Math.max(right, 1e-6)) : right,
		log,
		shownLeft: left,
		shownRight: right,
		fallback
	};
}

export function matchTrack(entries: CurveEntry[], log: WellLog): MatchedEntry[] {
	const cs = matchEntries(entries, log);
	return entries.map((entry, i) => ({ entry, curve: cs[i], scale: cs[i] ? resolveScale(entry, cs[i]!) : null }));
}

/** Curves of the well that no entry in the template matches. */
export function unmatchedCurves(t: Template, log: WellLog): Curve[] {
	const used = new Set<Curve>();
	for (const tr of t.tracks) {
		if (tr.kind === 'curve') matchEntries(tr.curves, log).forEach((c) => c && used.add(c));
		if (tr.kind === 'discrete') matchEntries([tr.curve], log).forEach((c) => c && used.add(c));
	}
	return log.curves.filter((c) => !used.has(c));
}

export function fmt(v: number): string {
	if (!Number.isFinite(v)) return '—';
	const a = Math.abs(v);
	if (a !== 0 && (a < 0.01 || a >= 10000)) return v.toExponential(1);
	if (a >= 100) return v.toFixed(0);
	if (a >= 10) return v.toFixed(1);
	return v.toFixed(2);
}
