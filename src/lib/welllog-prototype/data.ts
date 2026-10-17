// PROTOTYPE (#30) — throwaway FORCE 2020 log adapter, following
// docs/research/force-parquet-reading.md: one whole-file GET, hyparquet + fzstd,
// Cache API for the bytes, NULL and sentinels (<= -999) to NaN.

import { parquetMetadata, parquetRead } from 'hyparquet';
import { decompress } from 'fzstd';
import { DEFAULTS } from '$lib/config/sources.js';
import { forceMnemonicFamily } from './families';

export interface Curve {
	key: string;
	mnemonic: string;
	unit: string;
	family: string;
	kind: 'continuous' | 'discrete';
	values: Float32Array;
}

export interface Zone {
	name: string;
	top: number;
	base: number;
}

export interface WellLog {
	name: string;
	md: Float64Array;
	tvdss: Float64Array | null;
	curves: Curve[];
	zoneSets: { name: string; zones: Zone[] }[];
	codeLabels: Record<string, string>;
}

export interface LoadTiming {
	cached: boolean;
	fetchMs: number;
	decodeMs: number;
	buildMs: number;
	bytes: number;
}

const base = `${DEFAULTS.PUBLIC_DATA_BASE_URL}/force_2020/wells`;
const schemaUrl = `${DEFAULTS.PUBLIC_SCHEMA_BASE_URL}/force_2020/schema.json`;
const compressors = { ZSTD: (input: Uint8Array) => decompress(input) };
const NON_CURVES = new Set(['WELL', 'DEPTH_MD', 'X_LOC', 'Y_LOC', 'Z_LOC', 'GROUP', 'FORMATION', 'dataset']);

export async function listWells(): Promise<string[]> {
	const files: string[] = await (await fetch(`${base}/_files.json`)).json();
	return files.map((f) => f.replace(/\.parquet$/, ''));
}

let schemaPromise: Promise<any> | null = null;
function schema() {
	schemaPromise ??= fetch(schemaUrl).then((r) => r.json());
	return schemaPromise;
}

async function cachedBytes(url: string): Promise<{ bytes: ArrayBuffer; cached: boolean }> {
	let cache: Cache | null = null;
	try {
		cache = await caches.open('petroviz-prototype-wells');
		const hit = await cache.match(url);
		if (hit) return { bytes: await hit.arrayBuffer(), cached: true };
	} catch {
		cache = null;
	}
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
	const bytes = await res.arrayBuffer();
	cache?.put(url, new Response(bytes.slice(0))).catch(() => {});
	return { bytes, cached: false };
}

function toFloat32(data: ArrayLike<unknown>, sentinels: boolean): Float32Array {
	const out = new Float32Array(data.length);
	for (let i = 0; i < data.length; i++) {
		const v = data[i];
		if (v === null || v === undefined) out[i] = NaN;
		else {
			const n = typeof v === 'bigint' ? Number(v) : (v as number);
			out[i] = sentinels && n <= -999 ? NaN : n;
		}
	}
	return out;
}

function zonesOf(md: Float64Array, names: ArrayLike<string | null>): Zone[] {
	const zones: Zone[] = [];
	let start = 0;
	for (let i = 1; i <= names.length; i++) {
		if (i === names.length || names[i] !== names[start]) {
			const name = names[start];
			if (name) zones.push({ name, top: md[start], base: i < md.length ? md[i] : md[md.length - 1] });
			start = i;
		}
	}
	return zones;
}

export async function loadWell(well: string): Promise<{ log: WellLog; timing: LoadTiming }> {
	const t0 = performance.now();
	const [{ bytes, cached }, sch] = await Promise.all([cachedBytes(`${base}/${well}.parquet`), schema()]);
	const t1 = performance.now();
	const metadata = parquetMetadata(bytes);
	const raw: Record<string, ArrayLike<any>> = {};
	await parquetRead({
		file: bytes,
		metadata,
		compressors,
		onChunk: (c: { columnName: string; columnData: ArrayLike<any> }) => {
			raw[c.columnName] = c.columnData;
		}
	});
	const t2 = performance.now();

	const units: Record<string, string> = {};
	for (const c of sch.tables.wells.columns) units[c.name] = c.unit ?? '';

	const n = raw.DEPTH_MD.length;
	const md = Float64Array.from(raw.DEPTH_MD as ArrayLike<number>);
	const tvdss = new Float64Array(n);
	for (let i = 0; i < n; i++) tvdss[i] = raw.Z_LOC[i] == null ? NaN : -raw.Z_LOC[i];

	const curves: Curve[] = [];
	for (const col of sch.tables.wells.columns) {
		const name: string = col.name;
		if (NON_CURVES.has(name) || !raw[name]) continue;
		const family = forceMnemonicFamily[name] ?? 'unknown';
		const discrete = family === 'lithology';
		const values = toFloat32(raw[name], !discrete);
		let any = false;
		for (let i = 0; i < n && !any; i++) any = !Number.isNaN(values[i]);
		if (!any) continue; // all-NULL in this well: treated as absent
		curves.push({ key: name, mnemonic: name, unit: units[name], family, kind: discrete ? 'discrete' : 'continuous', values });
	}

	const log: WellLog = {
		name: String(raw.WELL[0] ?? well),
		md,
		tvdss,
		curves,
		zoneSets: [
			{ name: 'GROUP', zones: zonesOf(md, raw.GROUP) },
			{ name: 'FORMATION', zones: zonesOf(md, raw.FORMATION) }
		],
		codeLabels: sch.lithology_labels ?? {}
	};
	const t3 = performance.now();
	return { log, timing: { cached, fetchMs: t1 - t0, decodeMs: t2 - t1, buildMs: t3 - t2, bytes: bytes.byteLength } };
}

/** Index of the sample nearest to depth d (md strictly increasing). */
export function nearestIndex(md: Float64Array, d: number): number {
	let lo = 0;
	let hi = md.length - 1;
	if (d <= md[0]) return 0;
	if (d >= md[hi]) return hi;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (md[mid] <= d) lo = mid;
		else hi = mid;
	}
	return d - md[lo] < md[hi] - d ? lo : hi;
}

/** First index with md >= d. */
export function lowerBound(md: Float64Array, d: number): number {
	let lo = 0;
	let hi = md.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (md[mid] < d) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}
