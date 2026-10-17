<script lang="ts" module>
	export const name = 'Inspector panel — readout and layout on the side';
</script>

<script lang="ts">
	// PROTOTYPE (#30) — Variant B. The plot is kept lean and everything else moves to
	// a right-hand inspector:
	// - one-line track headers (mnemonics in their colours); the first curve's scale
	//   ends sit as tick labels on the track's top edge, the others on hover;
	// - inspector tab "At cursor": the depth cursor readout as a table, holding the last
	//   depth when the pointer leaves, Shift+click on the plot pins a depth;
	// - inspector tab "Layout": ordered track list to reorder, remove, add, expand into
	//   the curve editor; selecting a track highlights it in the plot;
	// - overview strip between plot and inspector, with interval input and zoom presets.
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import type { LogViewState } from '../view.svelte';
	import TrackCanvas from '../TrackCanvas.svelte';
	import Overview from '../Overview.svelte';
	import WellPicker from '../controls/WellPicker.svelte';
	import IntervalInput from '../controls/IntervalInput.svelte';
	import CurveEditor from '../controls/CurveEditor.svelte';
	import AddCurve from '../controls/AddCurve.svelte';
	import { navigate } from '../navigation';
	import { fmt, entryFor, uid, type Track } from '../template';

	let { view }: { view: LogViewState } = $props();

	let activeRef = $state<'md' | 'tvdss'>('md');
	let panelOpen = $state(true);
	let tab = $state<'cursor' | 'layout'>('cursor');
	let scrollW = $state(1000);
	let plotH = $state(600);
	let plotsEl = $state<HTMLDivElement | null>(null);
	let selected = $state<string | null>(null);
	let expanded = $state<Record<string, boolean>>({});
	let editing = $state<string | null>(null); // entry id
	let adding = $state<string | null>(null); // track id
	let addMenu = $state(false);
	let dragId = $state<string | null>(null);
	let pinned = $state<number | null>(null);
	let last = $state<number | null>(null);

	$effect(() => {
		if (view.cursorMd !== null) last = view.cursorMd;
	});

	const MIN_PX = 40;
	const totalWidth = $derived(view.template.tracks.reduce((s, t) => s + t.width, 0));
	const unitPx = $derived(Math.max(100, (scrollW - 2) / Math.max(totalWidth, 0.1)));
	const px = (t: Track) => Math.max(MIN_PX, t.width * unitPx);

	const shownMd = $derived(pinned ?? view.cursorMd ?? last);
	const ro = $derived(view.readoutAt(shownMd));
	const yOf = (d: number) => ((d - view.top) / (view.bottom - view.top)) * plotH;
	const cursorY = $derived(view.cursorMd === null ? null : yOf(view.cursorMd));
	const pinY = $derived(pinned === null ? null : yOf(pinned));

	function trackTitle(t: Track) {
		if (t.kind === 'depth') return (t.ref === 'active' ? activeRef : t.ref).toUpperCase();
		if (t.kind === 'discrete') return 'Lithology';
		if (t.kind === 'zone') return t.zoneSet;
		const ms = view.matched.get(t.id) ?? [];
		return ms.filter((m) => m.curve).map((m) => m.curve!.mnemonic).join(' · ') || 'Curve track';
	}

	function pinClick(e: MouseEvent) {
		if (!e.shiftKey || !plotsEl) return;
		const r = plotsEl.getBoundingClientRect();
		pinned = view.top + ((e.clientY - r.top) / r.height) * (view.bottom - view.top);
		tab = 'cursor';
		panelOpen = true;
	}

	function preset(span: number | null) {
		if (span === null) return view.showWhole();
		const c = (view.top + view.bottom) / 2;
		view.setInterval(c - span / 2, c + span / 2);
	}

	function addTrackOf(kind: string) {
		if (kind === 'curve') view.addCurveTrack();
		if (kind === 'depth') view.addTrack({ id: uid('t'), kind: 'depth', width: 0.5, ref: 'tvdss' });
		if (kind === 'lith') view.addTrack({ id: uid('t'), kind: 'discrete', width: 0.4, curve: entryFor('lithology') });
		if (kind === 'GROUP' || kind === 'FORMATION') view.addTrack({ id: uid('t'), kind: 'zone', width: 0.6, zoneSet: kind });
		addMenu = false;
	}

	function dropOn(i: number) {
		if (dragId) view.moveTrack(dragId, i);
		dragId = null;
	}
</script>

<div class="page">
	<header class="bar">
		<div class="brand">petroviz <span>log view · prototype B</span></div>
		<WellPicker {view} />
		<div class="seg" role="group" aria-label="Depth reference">
			<button class:on={activeRef === 'md'} onclick={() => (activeRef = 'md')}>MD</button>
			<button class:on={activeRef === 'tvdss'} onclick={() => (activeRef = 'tvdss')}>TVDSS</button>
		</div>
		<div class="spacer"></div>
		<ThemeToggle />
		<button class="ghost" onclick={() => (panelOpen = !panelOpen)} aria-pressed={panelOpen}>{panelOpen ? 'Hide' : 'Show'} inspector</button>
	</header>

	<div class="body">
		<div class="scroll" bind:clientWidth={scrollW}>
			<div class="log" style:width="{view.template.tracks.reduce((s, t) => s + px(t), 0)}px">
				<div class="heads">
					{#each view.template.tracks as t (t.id)}
						<button
							class="head"
							class:sel={selected === t.id}
							style:width="{px(t)}px"
							onclick={() => { selected = selected === t.id ? null : t.id; tab = 'layout'; panelOpen = true; expanded[t.id] = true; }}
							title="Select in Layout"
						>
							{#if t.kind === 'curve'}
								{@const ms = (view.matched.get(t.id) ?? []).filter((m) => m.curve)}
								{#if ms.length}
									{#each ms as m (m.entry.id)}
										<span style:color={m.entry.colour} title="{m.curve!.mnemonic} {fmt(m.scale!.shownLeft)} → {fmt(m.scale!.shownRight)} {m.curve!.unit}">{m.curve!.mnemonic}</span>
									{/each}
								{:else}
									<span class="dim">empty</span>
								{/if}
							{:else}
								<span class="dim">{trackTitle(t)}</span>
							{/if}
						</button>
					{/each}
				</div>

				<div class="plots" bind:this={plotsEl} bind:clientHeight={plotH} {@attach navigate(view)} onclick={pinClick} role="presentation">
					{#each view.template.tracks as t (t.id)}
						<div class="plot" class:depth={t.kind === 'depth'} class:sel={selected === t.id} style:width="{px(t)}px">
							<TrackCanvas {view} track={t} {activeRef} />
							{#if t.kind === 'curve'}
								{@const ms = (view.matched.get(t.id) ?? []).filter((m) => m.curve && m.scale)}
								{#if ms.length}
									<div class="ticks">
										{#each ms as m, i (m.entry.id)}
											<div class="tickrow" class:rest={i > 0} style:color={m.entry.colour}>
												<span>{fmt(m.scale!.shownLeft)}</span><span>{fmt(m.scale!.shownRight)}</span>
											</div>
										{/each}
									</div>
								{/if}
							{/if}
						</div>
					{/each}
					{#if pinY !== null}
						<div class="pin" style:transform="translateY({pinY}px)"><span>📌 {fmt(pinned!)}</span></div>
					{/if}
					{#if cursorY !== null}
						<div class="cursor" style:transform="translateY({cursorY}px)"></div>
					{/if}
				</div>
			</div>
		</div>

		<aside class="ovcol">
			<IntervalInput {view} compact />
			<div class="presets">
				<button onclick={() => preset(null)}>All</button>
				<button onclick={() => preset(500)}>500</button>
				<button onclick={() => preset(100)}>100</button>
				<button onclick={() => preset(20)}>20</button>
			</div>
			<div class="ov-plot"><Overview {view} zoneSet="FORMATION" zoneWidth={0.6} showLabels /></div>
		</aside>

		{#if panelOpen}
			<aside class="panel">
				<div class="tabs" role="tablist">
					<button role="tab" aria-selected={tab === 'cursor'} class:on={tab === 'cursor'} onclick={() => (tab = 'cursor')}>At cursor</button>
					<button role="tab" aria-selected={tab === 'layout'} class:on={tab === 'layout'} onclick={() => (tab = 'layout')}>Layout</button>
				</div>

				{#if tab === 'cursor'}
					<div class="readout">
						<div class="depths">
							<div><span>MD</span><b>{ro.md === null ? '—' : fmt(ro.md)}</b><i>m</i></div>
							<div><span>TVDSS</span><b>{ro.tvdss === null ? '—' : fmt(ro.tvdss)}</b><i>m</i></div>
						</div>
						<div class="state">
							{#if pinned !== null}
								Pinned depth · <button class="link" onclick={() => (pinned = null)}>unpin</button>
							{:else if view.cursorMd === null && last !== null}
								Last cursor depth · Shift+click the plot to pin
							{:else if view.cursorMd === null}
								Move over the plot · Shift+click to pin
							{:else}
								Following cursor · Shift+click to pin
							{/if}
						</div>
						{#each view.template.tracks as t (t.id)}
							{@const rows = ro.rows.filter((r) => r.trackId === t.id)}
							{#if rows.length}
								<div class="group">
									<div class="gtitle">{trackTitle(t)}</div>
									<table>
										<tbody>
											{#each rows as r (r.label + r.colour)}
												<tr>
													<td class="l"><span class="sw" style:background={r.colour}></span>{t.kind === 'discrete' ? 'Lithology' : r.label}</td>
													<td class="v">{r.value}</td>
													<td class="u">{r.unit}</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						{/each}
						<div class="group">
							<div class="gtitle">Zones</div>
							<table>
								<tbody>
									{#each ro.zones as z (z.set)}
										<tr><td>{z.set}</td><td class="v zone" colspan="2">{z.name}</td></tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{:else}
					<div class="layout">
						<div class="lhead">
							<span>{view.template.tracks.length} tracks · {view.unmatched.length} curve{view.unmatched.length === 1 ? '' : 's'} not shown</span>
							<button class="link" onclick={() => view.resetTemplate()}>Reset</button>
						</div>
						<ol>
							{#each view.template.tracks as t, i (t.id)}
								<li
									class:sel={selected === t.id}
									class:dragging={dragId === t.id}
									draggable="true"
									ondragstart={() => (dragId = t.id)}
									ondragover={(e) => e.preventDefault()}
									ondrop={() => dropOn(i)}
									ondragend={() => (dragId = null)}
								>
									<div class="trow">
										<span class="grip" title="Drag to reorder">⋮⋮</span>
										<button class="tname" onclick={() => { selected = selected === t.id ? null : t.id; expanded[t.id] = selected === t.id || expanded[t.id]; }}>
											<span class="kind">{t.kind}</span> {trackTitle(t)}
										</button>
										<button class="ib" title="Move up" disabled={i === 0} onclick={() => view.moveTrack(t.id, i - 1)}>↑</button>
										<button class="ib" title="Move down" disabled={i === view.template.tracks.length - 1} onclick={() => view.moveTrack(t.id, i + 1)}>↓</button>
										<button class="ib" title={expanded[t.id] ? 'Collapse' : 'Expand'} onclick={() => (expanded[t.id] = !expanded[t.id])}>{expanded[t.id] ? '▾' : '▸'}</button>
										<button class="ib danger" title="Remove track" onclick={() => view.removeTrack(t.id)}>×</button>
									</div>
									{#if expanded[t.id]}
										<div class="tbody">
											<label class="wrow">Width
												<input type="range" min="0.2" max="3" step="0.05" value={t.width} oninput={(e) => view.setWidth(t.id, Number(e.currentTarget.value))} />
												<span>{t.width.toFixed(2)}</span>
											</label>
											{#if t.kind === 'curve' || t.kind === 'discrete'}
												{#each view.matched.get(t.id) ?? [] as m (m.entry.id)}
													<div class="crow">
														<button class="cname" class:missing={!m.curve} onclick={() => (editing = editing === m.entry.id ? null : m.entry.id)}>
															<span class="sw" style:background={m.entry.colour}></span>
															{m.curve ? m.curve.mnemonic : `${m.entry.select[0].value} — not in this well`}
															{#if m.scale}<i>{fmt(m.scale.shownLeft)} → {fmt(m.scale.shownRight)} {m.curve?.unit}</i>{/if}
														</button>
														{#if editing === m.entry.id && t.kind === 'curve'}
															<div class="ed"><CurveEditor {view} trackId={t.id} {m} onremove={() => (editing = null)} /></div>
														{/if}
													</div>
												{/each}
												{#if t.kind === 'curve'}
													{#if adding === t.id}
														<div class="ed"><AddCurve {view} trackId={t.id} ondone={() => (adding = null)} /></div>
													{:else}
														<button class="link" onclick={() => (adding = t.id)}>+ Add curve</button>
													{/if}
												{/if}
											{:else if t.kind === 'depth'}
												<div class="dim small">Depth reference: {t.ref === 'active' ? `active (${activeRef.toUpperCase()})` : t.ref.toUpperCase()}</div>
											{:else}
												<div class="dim small">Zone set {t.zoneSet}; click a zone in the plot to jump to it.</div>
											{/if}
										</div>
									{/if}
								</li>
							{/each}
						</ol>
						<div class="addtrack">
							{#if addMenu}
								<div class="menu">
									<button onclick={() => addTrackOf('curve')}>Curve track</button>
									<button onclick={() => addTrackOf('depth')}>Depth track (TVDSS)</button>
									<button onclick={() => addTrackOf('lith')}>Lithology track</button>
									<button onclick={() => addTrackOf('GROUP')}>Zone track: GROUP</button>
									<button onclick={() => addTrackOf('FORMATION')}>Zone track: FORMATION</button>
									<button class="dim" onclick={() => (addMenu = false)}>Cancel</button>
								</div>
							{:else}
								<button class="ghost" onclick={() => (addMenu = true)}>+ Add track</button>
							{/if}
						</div>
					</div>
				{/if}
			</aside>
		{/if}
	</div>
</div>

<style>
	.page {
		height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--color-background);
		color: var(--color-text);
		font-family: var(--font-sans);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 6px 12px;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
		flex-wrap: wrap;
	}
	.brand {
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.brand span {
		font-weight: 400;
		color: var(--color-text-muted);
		font-size: var(--font-size-xs);
		margin-left: 4px;
	}
	.spacer {
		flex: 1;
	}
	.dim {
		color: var(--color-text-muted);
	}
	.small {
		font-size: var(--font-size-xs);
	}
	.seg {
		display: inline-flex;
		border: 1px solid var(--color-border-strong);
		border-radius: 5px;
		overflow: hidden;
	}
	.seg button {
		font: 500 11px var(--font-mono);
		border: 0;
		padding: 3px 8px;
		background: var(--color-surface);
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.seg button.on {
		background: var(--color-accent);
		color: #fff;
	}
	.ghost {
		font: inherit;
		font-size: var(--font-size-xs);
		border: 1px solid var(--color-border-strong);
		background: none;
		color: var(--color-text);
		border-radius: 4px;
		padding: 3px 8px;
		cursor: pointer;
	}
	.link {
		font: inherit;
		font-size: var(--font-size-xs);
		border: 0;
		background: none;
		color: var(--color-accent);
		padding: 0;
		cursor: pointer;
	}
	.body {
		flex: 1;
		min-height: 0;
		display: flex;
	}
	.scroll {
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
	}
	.log {
		height: 100%;
		display: flex;
		flex-direction: column;
		min-width: 100%;
	}
	.heads {
		display: flex;
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border-strong);
	}
	.head {
		flex: none;
		display: flex;
		gap: 5px;
		justify-content: center;
		align-items: center;
		height: 24px;
		padding: 0 4px;
		overflow: hidden;
		white-space: nowrap;
		border: 0;
		border-right: 1px solid var(--color-border-strong);
		background: none;
		font: 600 10.5px var(--font-mono);
		cursor: pointer;
	}
	.head:hover {
		background: var(--color-accent-soft);
	}
	.head.sel {
		background: var(--color-accent-soft);
		box-shadow: inset 0 -2px 0 var(--color-accent);
	}
	.plots {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		background: var(--color-surface);
		cursor: crosshair;
		user-select: none;
	}
	.plot {
		position: relative;
		flex: none;
		height: 100%;
		border-right: 1px solid var(--color-border-strong);
	}
	.plot.depth {
		background: var(--color-surface-sunken);
	}
	.plot.sel::after {
		content: '';
		position: absolute;
		inset: 0;
		border: 2px solid var(--color-accent);
		pointer-events: none;
	}
	.ticks {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		pointer-events: none;
		font: 600 9px/1.25 var(--font-mono);
	}
	.tickrow {
		display: flex;
		justify-content: space-between;
		padding: 0 2px;
		background: color-mix(in srgb, var(--color-surface) 80%, transparent);
	}
	.tickrow.rest {
		display: none;
	}
	.plot:hover .tickrow.rest {
		display: flex;
	}
	.cursor {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 0;
		border-top: 1px solid var(--color-error);
		pointer-events: none;
		will-change: transform;
		z-index: 3;
	}
	.pin {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		height: 0;
		border-top: 1.5px dashed var(--color-accent);
		pointer-events: none;
		z-index: 3;
	}
	.pin span {
		position: absolute;
		right: 4px;
		top: -16px;
		font: 600 10px var(--font-mono);
		color: var(--color-accent);
		background: var(--color-surface);
		padding: 0 3px;
		border-radius: 3px;
	}
	.ovcol {
		flex: none;
		width: 112px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 6px;
		border-left: 1px solid var(--color-border);
		background: var(--color-surface);
	}
	.ovcol :global(.interval) {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 3px 4px;
	}
	.ovcol :global(.interval input) {
		width: 100%;
		box-sizing: border-box;
	}
	.presets {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 2px;
	}
	.presets button {
		font: 500 10px var(--font-mono);
		padding: 2px 0;
		border: 1px solid var(--color-border-strong);
		border-radius: 3px;
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
	}
	.ov-plot {
		flex: 1;
		min-height: 0;
		border: 1px solid var(--color-border);
	}
	.panel {
		flex: none;
		width: 300px;
		display: flex;
		flex-direction: column;
		border-left: 1px solid var(--color-border-strong);
		background: var(--color-surface);
		min-height: 0;
	}
	.tabs {
		display: flex;
		border-bottom: 1px solid var(--color-border);
	}
	.tabs button {
		flex: 1;
		font: 600 var(--font-size-xs) var(--font-sans);
		padding: 8px;
		border: 0;
		background: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		border-bottom: 2px solid transparent;
	}
	.tabs button.on {
		color: var(--color-text);
		border-bottom-color: var(--color-accent);
	}
	.readout,
	.layout {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 10px 12px 60px;
		font-size: var(--font-size-xs);
	}
	.depths {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.depths div {
		display: flex;
		flex-direction: column;
		padding: 6px 8px;
		border-radius: 6px;
		background: var(--color-surface-sunken);
	}
	.depths span {
		font-size: 10px;
		color: var(--color-text-muted);
	}
	.depths b {
		font: 600 18px var(--font-mono);
	}
	.depths i {
		font-style: normal;
		font-size: 10px;
		color: var(--color-text-muted);
	}
	.state {
		margin: 6px 0 4px;
		color: var(--color-text-muted);
		font-size: 10.5px;
	}
	.group {
		margin-top: 8px;
	}
	.gtitle {
		font: 600 10px var(--font-mono);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid var(--color-border);
		padding-bottom: 2px;
		margin-bottom: 2px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-mono);
	}
	td {
		padding: 1.5px 0;
	}
	td.l {
		white-space: nowrap;
	}
	td.v {
		text-align: right;
		font-weight: 600;
		padding-right: 6px;
	}
	td.zone {
		font-family: var(--font-sans);
	}
	td.u {
		color: var(--color-text-muted);
		width: 52px;
	}
	.sw {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 2px;
		margin-right: 5px;
		vertical-align: baseline;
	}
	.lhead {
		display: flex;
		justify-content: space-between;
		color: var(--color-text-muted);
		margin-bottom: 6px;
	}
	ol {
		grid-template-columns: minmax(0, 1fr);
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 3px;
	}
	li {
		min-width: 0;
		border: 1px solid var(--color-border);
		border-radius: 6px;
		background: var(--color-surface);
	}
	li.sel {
		border-color: var(--color-accent);
	}
	li.dragging {
		opacity: 0.4;
	}
	.trow {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 3px 4px;
	}
	.grip {
		cursor: grab;
		color: var(--color-text-muted);
		font-size: 10px;
		padding: 0 2px;
	}
	.tname {
		flex: 1;
		min-width: 0;
		text-align: left;
		font: 600 11px var(--font-mono);
		border: 0;
		background: none;
		color: var(--color-text);
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding: 2px;
	}
	.kind {
		font: 500 9px var(--font-sans);
		color: var(--color-text-muted);
		text-transform: uppercase;
		margin-right: 2px;
	}
	.ib {
		width: 20px;
		height: 20px;
		border: 0;
		border-radius: 3px;
		background: var(--color-surface-sunken);
		color: var(--color-text-secondary);
		cursor: pointer;
		font-size: 11px;
		padding: 0;
	}
	.ib:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.ib.danger:hover {
		color: var(--color-error);
	}
	.tbody {
		min-width: 0;
		padding: 4px 8px 8px;
		display: grid;
		gap: 4px;
		border-top: 1px solid var(--color-border);
	}
	.wrow {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--color-text-secondary);
	}
	.wrow input {
		flex: 1;
		min-width: 0;
	}
	.wrow span {
		font-family: var(--font-mono);
		width: 3.5ch;
	}
	.cname {
		width: 100%;
		display: flex;
		align-items: baseline;
		gap: 4px;
		text-align: left;
		font: 600 11px var(--font-mono);
		border: 0;
		background: none;
		color: var(--color-text);
		padding: 2px;
		border-radius: 3px;
		cursor: pointer;
	}
	.cname:hover {
		background: var(--color-accent-soft);
	}
	.cname i {
		margin-left: auto;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
		font: 400 10px var(--font-mono);
		color: var(--color-text-muted);
	}
	.cname.missing {
		color: var(--color-text-muted);
		text-decoration: line-through;
		font-weight: 400;
	}
	.ed {
		min-width: 0;
		overflow: hidden;
		margin: 4px 0 6px;
		padding: 8px;
		border-radius: 6px;
		background: var(--color-surface-sunken);
	}
	.ed :global(.grid) {
		grid-template-columns: auto minmax(0, 1fr);
	}
	.ed :global(select) {
		max-width: 100%;
	}
	.crow {
		min-width: 0;
	}
	.addtrack {
		margin-top: 8px;
	}
	.menu {
		display: grid;
		gap: 2px;
		padding: 4px;
		border: 1px solid var(--color-border);
		border-radius: 6px;
	}
	.menu button {
		text-align: left;
		font: inherit;
		border: 0;
		background: none;
		color: var(--color-text);
		padding: 4px 6px;
		border-radius: 4px;
		cursor: pointer;
	}
	.menu button:hover {
		background: var(--color-accent-soft);
	}
</style>
