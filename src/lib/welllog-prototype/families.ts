// PROTOTYPE (#30) — throwaway. Curve family defaults condensed from
// docs/research/curve-family-defaults.md (research/curve-family-defaults branch)
// and the default template resolution on #29.

export type Dash = 'solid' | 'dashed' | 'dotted' | 'dashdot';

export type ScaleEnds =
	| { mode: 'fixed'; left: number; right: number; unit: string }
	| { mode: 'percentile'; lo: number; hi: number }
	| { mode: 'centredOnMedian'; width: number };

export interface FamilyDefault {
	label: string;
	track: string;
	ends: ScaleEnds;
	type: 'linear' | 'log';
	offScale: 'wrap' | 'clip';
	colour: string;
	dash: Dash;
}

export const curveFamilyDefaults: Record<string, FamilyDefault> = {
	gr: { label: 'Gamma ray', track: 'gr', ends: { mode: 'fixed', left: 0, right: 150, unit: 'gAPI' }, type: 'linear', offScale: 'wrap', colour: '#006400', dash: 'solid' },
	sgr: { label: 'Spectral gamma ray', track: 'gr', ends: { mode: 'fixed', left: 0, right: 150, unit: 'gAPI' }, type: 'linear', offScale: 'wrap', colour: '#006400', dash: 'dashed' },
	sp: { label: 'SP', track: 'gr', ends: { mode: 'centredOnMedian', width: 100 }, type: 'linear', offScale: 'clip', colour: '#0000FF', dash: 'solid' },
	caliper: { label: 'Caliper', track: 'gr', ends: { mode: 'fixed', left: 6, right: 16, unit: 'in' }, type: 'linear', offScale: 'wrap', colour: '#FF0000', dash: 'dashed' },
	bitsize: { label: 'Bit size', track: 'gr', ends: { mode: 'fixed', left: 6, right: 16, unit: 'in' }, type: 'linear', offScale: 'wrap', colour: '#000000', dash: 'dotted' },
	dcal: { label: 'Differential caliper', track: 'gr', ends: { mode: 'fixed', left: -2, right: 8, unit: 'in' }, type: 'linear', offScale: 'clip', colour: '#A0522D', dash: 'solid' },
	rdep: { label: 'Deep resistivity', track: 'res', ends: { mode: 'fixed', left: 0.2, right: 2000, unit: 'ohm·m' }, type: 'log', offScale: 'clip', colour: '#330000', dash: 'solid' },
	rmed: { label: 'Medium resistivity', track: 'res', ends: { mode: 'fixed', left: 0.2, right: 2000, unit: 'ohm·m' }, type: 'log', offScale: 'clip', colour: '#CC0000', dash: 'dashed' },
	rsha: { label: 'Shallow resistivity', track: 'res', ends: { mode: 'fixed', left: 0.2, right: 2000, unit: 'ohm·m' }, type: 'log', offScale: 'clip', colour: '#FF8C00', dash: 'dotted' },
	rmicro: { label: 'Micro resistivity', track: 'res', ends: { mode: 'fixed', left: 0.2, right: 2000, unit: 'ohm·m' }, type: 'log', offScale: 'clip', colour: '#0000CC', dash: 'dashdot' },
	rhob: { label: 'Bulk density', track: 'dn', ends: { mode: 'fixed', left: 1.95, right: 2.95, unit: 'g/cm³' }, type: 'linear', offScale: 'clip', colour: '#FF0000', dash: 'solid' },
	drho: { label: 'Density correction', track: 'dn', ends: { mode: 'fixed', left: -0.25, right: 0.25, unit: 'g/cm³' }, type: 'linear', offScale: 'clip', colour: '#808080', dash: 'dotted' },
	nphi: { label: 'Neutron porosity', track: 'dn', ends: { mode: 'fixed', left: 0.45, right: -0.15, unit: 'v/v' }, type: 'linear', offScale: 'clip', colour: '#0099CC', dash: 'dashed' },
	pef: { label: 'PEF', track: 'dn', ends: { mode: 'fixed', left: 0, right: 10, unit: 'b/e' }, type: 'linear', offScale: 'clip', colour: '#000000', dash: 'solid' },
	dtc: { label: 'Compressional sonic', track: 'sonic', ends: { mode: 'fixed', left: 140, right: 40, unit: 'µs/ft' }, type: 'linear', offScale: 'wrap', colour: '#800080', dash: 'solid' },
	dts: { label: 'Shear sonic', track: 'sonic', ends: { mode: 'fixed', left: 440, right: 40, unit: 'µs/ft' }, type: 'linear', offScale: 'wrap', colour: '#FF00FF', dash: 'dashed' },
	rop: { label: 'ROP', track: 'drill', ends: { mode: 'fixed', left: 100, right: 0, unit: 'm/h' }, type: 'linear', offScale: 'clip', colour: '#000000', dash: 'solid' },
	mudweight: { label: 'Mud weight', track: 'drill', ends: { mode: 'percentile', lo: 1, hi: 99 }, type: 'linear', offScale: 'clip', colour: '#8B4513', dash: 'solid' },
	unknown: { label: 'Unknown', track: '', ends: { mode: 'percentile', lo: 1, hi: 99 }, type: 'linear', offScale: 'clip', colour: '#808080', dash: 'solid' }
};

export const forceMnemonicFamily: Record<string, string> = {
	GR: 'gr', SGR: 'sgr', SP: 'sp', CALI: 'caliper', BS: 'bitsize', DCAL: 'dcal',
	RDEP: 'rdep', RMED: 'rmed', RSHA: 'rsha', RXO: 'rmicro', RMIC: 'rmicro',
	RHOB: 'rhob', DRHO: 'drho', NPHI: 'nphi', PEF: 'pef', DTC: 'dtc', DTS: 'dts',
	ROP: 'rop', ROPA: 'rop', MUDWEIGHT: 'mudweight', FORCE_2020_LITHOFACIES_LITHOLOGY: 'lithology'
};

export type Hatch = 'dots' | 'dotdash' | 'dashes' | 'wavy' | 'brick' | 'rhomb' | 'openbrick' | 'checker' | 'chevrons' | 'ticks' | 'solid' | 'crosses';

export const lithology: Record<string, { colour: string; hatch: Hatch }> = {
	'30000': { colour: '#FFFF00', hatch: 'dots' },
	'65030': { colour: '#FFE119', hatch: 'dotdash' },
	'65000': { colour: '#BEBEBE', hatch: 'dashes' },
	'80000': { colour: '#7CFC00', hatch: 'wavy' },
	'74000': { colour: '#8080FF', hatch: 'rhomb' },
	'70000': { colour: '#80FFFF', hatch: 'brick' },
	'70032': { colour: '#80FFFF', hatch: 'openbrick' },
	'88000': { colour: '#7FFFD4', hatch: 'checker' },
	'86000': { colour: '#FF80FF', hatch: 'chevrons' },
	'99000': { colour: '#FF8C00', hatch: 'ticks' },
	'90000': { colour: '#000000', hatch: 'solid' },
	'93000': { colour: '#FF1493', hatch: 'crosses' }
};

// Placeholder categorical palette (the real one is Theming fog on #22).
const palette = ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac', '#86bcb6', '#d37295'];

export function hashColour(name: string): string {
	let h = 2166136261;
	for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
	return palette[(h >>> 0) % palette.length];
}
