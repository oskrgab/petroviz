// PROTOTYPE (#37) — throwaway colour model for the log view in light and dark themes.
// Three strategies for template colours, switchable via ?variant=A|B|C:
//   A  as stored: chrome follows the theme, template colours are drawn exactly as saved;
//   B  adapted:   on dark, stroke colours below a contrast floor against the track background
//                 are mirrored (or minimally lifted) in OKLCH lightness, hue kept, and fills get
//                 more alpha; the template keeps what it saved;
//   C  paper:     the log sheet stays light in both themes; only the app chrome goes dark.
// Chrome colours are the --welllog-* set below, with light and dark values.

export type Strategy = 'A' | 'B' | 'C';

export interface Tokens {
	bg: string; // curve and zone track background
	headerBg: string;
	depthBg: string; // depth track background
	grid: string; // minor gridlines
	gridMajor: string;
	border: string; // track borders, header rule
	text: string;
	textMuted: string; // scale ends, units, labels
	cursor: string; // depth cursor line
	window: string; // overview strip window
	caution: string; // ⚠ after a mnemonic, well panel badge
	cautionInk: string; // text on the caution badge
	gapHatch: string; // gap band in depth tracks and the overview strip
	noData: string; // dimmed scale bar ("no data in view")
	zoneLine: string; // zone and lithology boundaries
	accent: string; // hover, focus, drop indicator
}

const light: Tokens = {
	bg: '#ffffff',
	headerBg: '#ffffff',
	depthBg: '#f1f5f9',
	grid: '#e2e8f0',
	gridMajor: '#cbd5e1',
	border: '#cbd5e1',
	text: '#0f172a',
	textMuted: '#64748b',
	cursor: '#dc2626',
	window: '#0284c7',
	caution: '#b45309',
	cautionInk: '#ffffff',
	gapHatch: '#94a3b8',
	noData: '#94a3b8',
	zoneLine: '#475569',
	accent: '#0284c7'
};

const dark: Tokens = {
	bg: '#0f172a',
	headerBg: '#1e293b',
	depthBg: '#162033',
	grid: '#1f2a3d',
	gridMajor: '#334155',
	border: '#334155',
	text: '#e2e8f0',
	textMuted: '#94a3b8',
	cursor: '#f87171',
	window: '#38bdf8',
	caution: '#fbbf24',
	cautionInk: '#1c1917',
	gapHatch: '#64748b',
	noData: '#64748b',
	zoneLine: '#0f172a',
	accent: '#38bdf8'
};

/** C on dark: a dimmed sheet of paper, so the log doesn't glare in a dark room. */
const paperDim: Tokens = {
	bg: '#e9e7e2',
	headerBg: '#e1dfd9',
	depthBg: '#dbd9d2',
	grid: '#d4d1ca',
	gridMajor: '#bcb8af',
	border: '#bcb8af',
	text: '#1c1b19',
	textMuted: '#5f5c55',
	cursor: '#dc2626',
	window: '#0369a1',
	caution: '#b45309',
	cautionInk: '#ffffff',
	gapHatch: '#8f8b82',
	noData: '#8f8b82',
	zoneLine: '#5f5c55',
	accent: '#0369a1'
};

export const tokenNames = Object.keys(light) as (keyof Tokens)[];
const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
export const cssName = (k: keyof Tokens) => `--welllog-${kebab(k)}`;

export function tokensCss(t: Tokens): string {
	return tokenNames.map((k) => `${cssName(k)}: ${t[k]}`).join('; ');
}

// ---- colour maths ----------------------------------------------------------------

export interface Rgba {
	r: number; // 0..1, gamma-encoded sRGB
	g: number;
	b: number;
	a: number;
}

export function parse(hex: string): Rgba {
	let h = hex.trim().replace('#', '');
	if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
	const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
	return { r: n(0), g: n(2), b: n(4), a: h.length >= 8 ? n(6) : 1 };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const byte = (x: number) => Math.round(clamp01(x) * 255).toString(16).padStart(2, '0');

export function hex(c: Rgba, withAlpha = c.a < 1): string {
	return `#${byte(c.r)}${byte(c.g)}${byte(c.b)}${withAlpha ? byte(c.a) : ''}`.toUpperCase();
}

const lin = (u: number) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const enc = (u: number) => (u <= 0.0031308 ? 12.92 * u : 1.055 * u ** (1 / 2.4) - 0.055);

/** WCAG relative luminance of the opaque colour. */
export function luminance(c: Rgba): number {
	return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

export function contrast(a: Rgba, b: Rgba): number {
	const la = luminance(a), lb = luminance(b);
	return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** c drawn over an opaque background. */
export function over(c: Rgba, bg: Rgba): Rgba {
	return { r: c.r * c.a + bg.r * (1 - c.a), g: c.g * c.a + bg.g * (1 - c.a), b: c.b * c.a + bg.b * (1 - c.a), a: 1 };
}

interface Lch {
	L: number;
	C: number;
	h: number;
}

function toOklch(c: Rgba): Lch {
	const r = lin(c.r), g = lin(c.g), b = lin(c.b);
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	return { L, C: Math.hypot(A, B), h: Math.atan2(B, A) };
}

/** OKLCH → linear sRGB, possibly out of gamut. */
function fromOklchLinear({ L, C, h }: Lch): [number, number, number] {
	const A = C * Math.cos(h), B = C * Math.sin(h);
	const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
	const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
	const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	];
}

const inGamut = (x: [number, number, number]) => x.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** Into sRGB at this L and hue, reducing chroma only as far as the gamut needs. */
function fromOklch(p: Lch, a: number): Rgba {
	let rgb = fromOklchLinear(p);
	if (!inGamut(rgb)) {
		let lo = 0, hi = p.C;
		for (let i = 0; i < 20; i++) {
			const mid = (lo + hi) / 2;
			if (inGamut(fromOklchLinear({ ...p, C: mid }))) lo = mid;
			else hi = mid;
		}
		rgb = fromOklchLinear({ ...p, C: lo });
	}
	return { r: enc(clamp01(rgb[0])), g: enc(clamp01(rgb[1])), b: enc(clamp01(rgb[2])), a };
}

/**
 * The least change in OKLCH lightness (hue kept, chroma kept where the gamut allows)
 * that gives `ratio` contrast against `bg`. Colours that already meet it are returned as is.
 */
export function lift(c: Rgba, bg: Rgba, ratio: number): Rgba {
	if (contrast(c, bg) >= ratio) return c;
	const p = toOklch(c);
	const up = luminance(bg) < 0.18;
	let lo = p.L, hi = up ? 1 : 0;
	for (let i = 0; i < 24; i++) {
		const mid = (lo + hi) / 2;
		if (contrast(fromOklch({ ...p, L: mid }, 1), bg) >= ratio) hi = mid;
		else lo = mid;
	}
	return fromOklch({ ...p, L: hi }, c.a);
}

/**
 * Mirror OKLCH lightness (L → 1 − L, hue kept) for colours below the floor, then lift if
 * still short. Unlike `lift`, it keeps the order of the dark colours: black, the strongest
 * ink on paper, becomes the strongest ink on dark.
 */
export function mirror(c: Rgba, bg: Rgba, ratio: number): Rgba {
	if (contrast(c, bg) >= ratio) return c;
	const p = toOklch(c);
	const darkBg = luminance(bg) < 0.18;
	if (darkBg ? p.L >= 0.5 : p.L <= 0.5) return lift(c, bg, ratio); // already on the far side
	return lift(fromOklch({ ...p, L: 1 - p.L }, c.a), bg, ratio);
}

// ---- categorical palettes (zone names, unknown lithology codes) --------------------------

export interface Palette {
	label: string;
	colours: string[];
	alpha: number; // zone blocks: palette colour at this alpha over the track background
}

export const palettes: Record<string, Palette> = {
	tableau: {
		label: 'Tableau 10 · 55% (current placeholder)',
		colours: ['#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', '#EDC948', '#B07AA1', '#FF9DA7', '#9C755F', '#BAB0AC'],
		alpha: 0.55
	},
	okabe: {
		label: 'Okabe–Ito · 55% (colour-blind safe)',
		colours: ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7'],
		alpha: 0.55
	},
	tolLight: {
		label: 'Tol light · opaque (for labelled regions)',
		colours: ['#77AADD', '#99DDFF', '#44BB99', '#BBCC33', '#AAAA00', '#EEDD88', '#EE8866', '#FFAABB', '#DDDDDD'],
		alpha: 1
	},
	set3: {
		label: 'ColorBrewer Set3 · opaque (12 pastels)',
		colours: ['#8DD3C7', '#FFFFB3', '#BEBADA', '#FB8072', '#80B1D3', '#FDB462', '#B3DE69', '#FCCDE5', '#D9D9D9', '#BC80BD', '#CCEBC5', '#FFED6F'],
		alpha: 1
	}
};

function hashIndex(name: string, n: number): number {
	let h = 2166136261;
	for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
	return (h >>> 0) % n;
}

// ---- the theme a draw reads ----------------------------------------------------------

export interface ColourSettings {
	strategy: Strategy;
	palette: keyof typeof palettes;
	method: 'mirror' | 'lift'; // B: how a stroke below the floor is adapted
	floor: number; // B: contrast floor for strokes on dark
	fillBoost: number; // B: alpha multiplier for fills on dark
	paper: 'dim' | 'white'; // C on dark
	caution: boolean; // show a sample caution (FORCE 2020 has none)
}

export interface Theme {
	key: string; // changes whenever any drawn colour could change
	dark: boolean;
	chrome: Tokens; // the app around the log
	sheet: Tokens; // headers, tracks, overview strip
	stroke(stored: string): string;
	fill(stored: string): string;
	zone(name: string, hovered?: boolean): { fill: string; text: string };
	code(code: string): string;
}

const memo = new Map<string, string>();

export function buildTheme(s: ColourSettings, isDark: boolean): Theme {
	const chrome = isDark ? dark : light;
	const sheet = s.strategy === 'C' ? (isDark ? (s.paper === 'dim' ? paperDim : light) : light) : chrome;
	const bg = parse(sheet.bg);
	const adapt = s.strategy === 'B' && isDark;
	const pal = palettes[s.palette];
	const key = `${s.strategy}|${isDark}|${s.palette}|${s.method}|${s.floor}|${s.fillBoost}|${s.paper}`;

	const stroke = (stored: string) => {
		if (!adapt) return stored;
		const k = `${key}|s|${stored}`;
		let v = memo.get(k);
		if (!v) memo.set(k, (v = hex((s.method === 'mirror' ? mirror : lift)(parse(stored), bg, s.floor))));
		return v;
	};
	const fill = (stored: string) => {
		if (!adapt) return stored;
		const c = parse(stored);
		return hex({ ...c, a: Math.min(0.9, c.a * s.fillBoost) }, true);
	};
	const zone = (name: string, hovered = false) => {
		const c = parse(pal.colours[hashIndex(name, pal.colours.length)]);
		const a = hovered ? Math.min(1, pal.alpha + 0.3) : pal.alpha;
		const shown = over({ ...c, a }, bg);
		const ink = parse('#111111'), paper = parse('#F8FAFC');
		return { fill: hex({ ...c, a }, a < 1), text: contrast(ink, shown) >= contrast(paper, shown) ? '#111111' : '#F8FAFC' };
	};
	const code = (c: string) => pal.colours[hashIndex(c, pal.colours.length)];
	return { key, dark: isDark, chrome, sheet, stroke, fill, zone, code };
}

/** For the colour panel: what a stored colour becomes, and how it reads on the sheet. */
export function describe(stored: string, drawn: string, sheetBg: string) {
	const bg = parse(sheetBg);
	const s = parse(stored), d = parse(drawn);
	return {
		storedContrast: contrast(over(s, bg), bg),
		drawnContrast: contrast(over(d, bg), bg),
		shownStored: hex(over(s, bg), false),
		shownDrawn: hex(over(d, bg), false)
	};
}
