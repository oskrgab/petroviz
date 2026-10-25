<script lang="ts">
	// PROTOTYPE (#37) — the colour state, surfaced: the strategy's rule, its knobs, every
	// curve and fill as stored vs as drawn (with contrast against the track background),
	// the zone palette, and the --welllog-* tokens of the chrome and the log sheet.
	import type { LogViewState } from './view.svelte';
	import { palettes, tokenNames, cssName, describe, parse, contrast, over, hex } from './colours';
	import { themeStore } from '$lib/stores/theme.svelte';

	let { view, open = $bindable(true) }: { view: LogViewState; open?: boolean } = $props();
	let tab = $state<'curves' | 'zones' | 'tokens'>('curves');

	const rules = {
		A: 'As stored. Chrome follows the theme; every template colour is drawn exactly as saved.',
		B: 'Adapted on dark. Strokes below the contrast floor have their OKLCH lightness mirrored (black → white) or minimally lifted, hue kept; fills get more alpha. Light theme draws as stored. The template file never changes.',
		C: 'Paper. The log sheet (headers, tracks, overview) stays light in both themes; only the app chrome goes dark.'
	};

	const t = $derived(view.theme);
	const bg = $derived(t.sheet.bg);

	const curves = $derived.by(() => {
		const rows: { mnemonic: string; stored: string; drawn: string; sc: number; dc: number }[] = [];
		for (const tr of view.template.tracks) {
			if (tr.kind !== 'curve') continue;
			for (const m of view.matched.get(tr.id) ?? []) {
				if (!m.curve) continue;
				const drawn = t.stroke(m.entry.colour);
				const d = describe(m.entry.colour, drawn, bg);
				rows.push({ mnemonic: m.curve.mnemonic, stored: m.entry.colour, drawn, sc: d.storedContrast, dc: d.drawnContrast });
			}
		}
		return rows;
	});

	const fills = $derived.by(() => {
		const rows: { label: string; stored: string; drawn: string; shownStored: string; shownDrawn: string }[] = [];
		for (const tr of view.template.tracks) {
			if (tr.kind !== 'curve') continue;
			const name = (b: any) => ('curve' in b ? (view.matched.get(tr.id)?.find((m) => m.entry.id === b.curve)?.curve?.mnemonic ?? '—') : 'edge' in b ? `${b.edge} edge` : String(b.value));
			for (const f of tr.fills)
				for (const [side, c] of [['A left', f.colourWhereALeft], ['A right', f.colourWhereARight]] as const) {
					if (!c) continue;
					const drawn = t.fill(c);
					const d = describe(c, drawn, bg);
					rows.push({ label: `${name(f.a)} | ${name(f.b)} · ${side}`, stored: c, drawn, shownStored: d.shownStored, shownDrawn: d.shownDrawn });
				}
		}
		return rows;
	});

	const zoneRows = $derived.by(() =>
		(view.log?.zoneSets ?? []).map((s) => ({
			set: s.name,
			names: [...new Set(s.zones.map((z) => z.name))].map((n) => ({ n, ...t.zone(n) }))
		}))
	);

	const zoneShown = (fill: string) => hex(over(parse(fill), parse(bg)), false);
	const pass = (c: number) => (c >= 4.5 ? 'ok' : c >= 3 ? 'meh' : 'bad');
</script>

<aside class="panel" class:closed={!open}>
	<header>
		<button class="toggle" onclick={() => (open = !open)}>{open ? '▾' : '▸'} Colours · {view.colours.strategy} · {themeStore.isDark ? 'dark' : 'light'}</button>
		<button class="theme" onclick={() => themeStore.toggle()} title="Toggle theme">{themeStore.isDark ? '☾' : '☀'}</button>
	</header>
	{#if open}
		<p class="rule">{rules[view.colours.strategy]}</p>

		<div class="knobs">
			<label>
				Zone palette
				<select bind:value={view.colours.palette}>
					{#each Object.entries(palettes) as [k, p] (k)}<option value={k}>{p.label}</option>{/each}
				</select>
			</label>
			{#if view.colours.strategy === 'B'}
				<label>
					Adapt strokes by
					<select bind:value={view.colours.method}>
						<option value="mirror">mirroring lightness (black → white)</option>
						<option value="lift">least lift to the floor</option>
					</select>
				</label>
				<label>
					Contrast floor
					<select bind:value={view.colours.floor}>
						<option value={3}>3 : 1 (graphics)</option>
						<option value={4.5}>4.5 : 1 (text)</option>
					</select>
				</label>
				<label>
					Fill alpha on dark
					<select bind:value={view.colours.fillBoost}>
						<option value={1}>as stored</option>
						<option value={1.5}>× 1.5</option>
						<option value={2}>× 2</option>
					</select>
				</label>
			{/if}
			{#if view.colours.strategy === 'C'}
				<label>
					Paper on dark
					<select bind:value={view.colours.paper}>
						<option value="dim">dimmed</option>
						<option value="white">white</option>
					</select>
				</label>
			{/if}
			<label class="check"><input type="checkbox" bind:checked={view.colours.caution} /> Sample caution on DTC</label>
		</div>

		<nav>
			<button class:on={tab === 'curves'} onclick={() => (tab = 'curves')}>Curves & fills</button>
			<button class:on={tab === 'zones'} onclick={() => (tab = 'zones')}>Zones</button>
			<button class:on={tab === 'tokens'} onclick={() => (tab = 'tokens')}>Tokens</button>
		</nav>

		<div class="scroll">
			{#if tab === 'curves'}
				<table>
					<thead><tr><th>Curve</th><th>Stored</th><th>Drawn</th><th title="Contrast against the track background">vs bg</th></tr></thead>
					<tbody>
						{#each curves as r, i (i)}
							<tr>
								<td class="mono">{r.mnemonic}</td>
								<td><span class="sw" style:background={r.stored}></span><span class="mono">{r.stored}</span></td>
								<td>{#if r.drawn !== r.stored}<span class="sw" style:background={r.drawn}></span><span class="mono">{r.drawn}</span>{:else}<span class="same">same</span>{/if}</td>
								<td class="mono">
									{#if r.drawn !== r.stored}<span class={pass(r.sc)}>{r.sc.toFixed(1)}</span> → {/if}<span class={pass(r.dc)}>{r.dc.toFixed(1)}</span>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<table>
					<thead><tr><th>Fill</th><th>Stored</th><th>Drawn</th></tr></thead>
					<tbody>
						{#each fills as f, i (i)}
							<tr>
								<td class="small">{f.label}</td>
								<td><span class="sw" style:background={f.shownStored} title="{f.stored} over the track background"></span><span class="mono">{f.stored}</span></td>
								<td>{#if f.drawn !== f.stored}<span class="sw" style:background={f.shownDrawn}></span><span class="mono">{f.drawn}</span>{:else}<span class="same">same</span>{/if}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="note">Swatches are shown composited on the track background ({bg}). Lithology is drawn as stored (KGS colours, black hatches) in every strategy.</p>
			{:else if tab === 'zones'}
				{#each zoneRows as s (s.set)}
					<h4>{s.set} <span class="dim">{s.names.length} names</span></h4>
					<div class="chips" style:background={bg}>
						{#each s.names as z, i (i)}
							<span class="chip" style:background={zoneShown(z.fill)} style:color={z.text}>{z.n}</span>
						{/each}
					</div>
				{/each}
				<p class="note">Colour is picked by hashing the zone name, so a name keeps its colour across wells. Label colour is black or white, whichever contrasts more.</p>
			{:else}
				<table>
					<thead><tr><th>Token</th><th>Sheet</th>{#if view.colours.strategy === 'C'}<th>Chrome</th>{/if}</tr></thead>
					<tbody>
						{#each tokenNames as k (k)}
							<tr>
								<td class="mono small">{cssName(k)}</td>
								<td><span class="sw" style:background={t.sheet[k]}></span><span class="mono">{t.sheet[k]}</span></td>
								{#if view.colours.strategy === 'C'}<td><span class="sw" style:background={t.chrome[k]}></span><span class="mono">{t.chrome[k]}</span></td>{/if}
							</tr>
						{/each}
					</tbody>
				</table>
				<p class="note">
					Text on the sheet: {contrast(parse(t.sheet.text), parse(t.sheet.bg)).toFixed(1)} : 1; muted {contrast(parse(t.sheet.textMuted), parse(t.sheet.headerBg)).toFixed(1)} : 1 on the header;
					caution {contrast(parse(t.sheet.caution), parse(t.sheet.headerBg)).toFixed(1)} : 1 on the header.
				</p>
			{/if}
		</div>
	{/if}
</aside>

<style>
	.panel {
		position: fixed;
		right: 0;
		top: 0;
		bottom: 0;
		z-index: 60;
		width: 380px;
		display: flex;
		flex-direction: column;
		background: var(--color-surface-elevated);
		color: var(--color-text);
		border-left: 1px solid var(--color-border-strong);
		font-size: 12px;
	}
	.panel.closed {
		width: auto;
		bottom: auto;
		top: 48px;
		border: 1px solid var(--color-border-strong);
		border-right: 0;
		border-radius: 6px 0 0 6px;
		box-shadow: var(--shadow-md);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 6px;
	}
	header button {
		border: 0;
		background: none;
		color: inherit;
		font: 600 12px var(--font-sans);
		cursor: pointer;
		padding: 4px 6px;
		border-radius: 4px;
	}
	header button:hover {
		background: var(--color-accent-soft);
	}
	.rule {
		margin: 0 10px 8px;
		color: var(--color-text-secondary);
		line-height: 1.4;
	}
	.knobs {
		display: grid;
		gap: 6px;
		padding: 0 10px 8px;
	}
	.knobs label {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.knobs label.check {
		justify-content: flex-start;
	}
	select {
		font: inherit;
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-border-strong);
		border-radius: 4px;
		padding: 2px 4px;
		max-width: 230px;
	}
	nav {
		display: flex;
		gap: 2px;
		padding: 0 8px;
		border-bottom: 1px solid var(--color-border);
	}
	nav button {
		border: 0;
		background: none;
		color: var(--color-text-secondary);
		font: inherit;
		padding: 5px 8px;
		cursor: pointer;
		border-bottom: 2px solid transparent;
	}
	nav button.on {
		color: var(--color-text);
		border-bottom-color: var(--color-accent);
	}
	.scroll {
		overflow: auto;
		padding: 6px 10px 10px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin-bottom: 8px;
	}
	th {
		text-align: left;
		font-weight: 600;
		color: var(--color-text-secondary);
		font-size: 11px;
		padding: 2px 4px;
	}
	td {
		padding: 2px 4px;
		white-space: nowrap;
	}
	.mono {
		font-family: var(--font-mono);
		font-size: 11px;
	}
	.small {
		font-size: 10.5px;
		white-space: normal;
	}
	.sw {
		display: inline-block;
		width: 12px;
		height: 12px;
		border-radius: 2px;
		border: 1px solid var(--color-border-strong);
		vertical-align: -2px;
		margin-right: 4px;
	}
	.same,
	.dim {
		color: var(--color-text-muted);
		font-size: 11px;
		font-weight: 400;
	}
	.ok {
		color: var(--color-success);
	}
	.meh {
		color: var(--color-warning);
	}
	.bad {
		color: var(--color-error);
		font-weight: 700;
	}
	.note {
		color: var(--color-text-muted);
		font-size: 11px;
		line-height: 1.4;
		margin: 4px 0 0;
	}
	h4 {
		margin: 6px 0 4px;
		font-size: 12px;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		padding: 6px;
		border-radius: 4px;
	}
	.chip {
		font-size: 10.5px;
		padding: 2px 6px;
		border-radius: 3px;
	}
</style>
