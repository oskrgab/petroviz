<script lang="ts" module>
	export const name = 'Paper log — readout in headers';
</script>

<script lang="ts">
	// PROTOTYPE (#30) — Variant A. A classic printed-log layout:
	// - every curve gets a scale bar in its track header (name, unit, left/right values,
	//   line sample); the depth cursor's readout replaces the unit in those bars;
	// - editing is inline: click a scale bar for its editor, drag a header to reorder,
	//   drag a border to resize, + and × on each header;
	// - overview strip on the far left, interval input and depth reference in the top bar.
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import type { LogViewState } from '../view.svelte';
	import TrackCanvas from '../TrackCanvas.svelte';
	import Overview from '../Overview.svelte';
	import WellPicker from '../controls/WellPicker.svelte';
	import IntervalInput from '../controls/IntervalInput.svelte';
	import CurveEditor from '../controls/CurveEditor.svelte';
	import AddCurve from '../controls/AddCurve.svelte';
	import { navigate } from '../navigation';
	import { fmt, entryFor, uid, type Track, type MatchedEntry } from '../template';
	import { nearestIndex } from '../data';

	let { view }: { view: LogViewState } = $props();

	let activeRef = $state<'md' | 'tvdss'>('md');
	let scrollW = $state(1000);
	let plotH = $state(600);
	let popover = $state<{ kind: 'edit' | 'add' | 'track'; trackId: string; entryId?: string; x: number; y: number } | null>(null);
	let dragId = $state<string | null>(null);
	let dropAt = $state<number | null>(null);

	const MIN_PX = 44;
	const totalWidth = $derived(view.template.tracks.reduce((s, t) => s + t.width, 0));
	const unitPx = $derived(Math.max(110, (scrollW - 40) / Math.max(totalWidth, 0.1)));
	const px = (t: Track) => Math.max(MIN_PX, t.width * unitPx);

	const cursorY = $derived(view.cursorMd === null ? null : ((view.cursorMd - view.top) / (view.bottom - view.top)) * plotH);
	const idx = $derived(view.log && view.cursorMd !== null ? nearestIndex(view.log.md, view.cursorMd) : null);

	function valueAt(m: MatchedEntry) {
		if (idx === null || !m.curve) return null;
		const v = m.curve.values[idx];
		if (m.curve.kind === 'discrete') return Number.isNaN(v) ? '—' : (view.log!.codeLabels[String(v)] ?? String(v));
		return fmt(v);
	}

	function zoneAt(set: string) {
		if (view.cursorMd === null) return null;
		return view.log?.zoneSets.find((s) => s.name === set)?.zones.find((z) => z.top <= view.cursorMd! && view.cursorMd! < z.base)?.name ?? '—';
	}

	function open(kind: 'edit' | 'add' | 'track', trackId: string, e: MouseEvent, entryId?: string) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		popover = { kind, trackId, entryId, x: Math.min(r.left, innerWidth - 300), y: r.bottom + 4 };
	}

	// ---- resize -----------------------------------------------------------------
	let resizing: { id: string; x: number; w: number } | null = null;
	function startResize(e: PointerEvent, t: Track) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		resizing = { id: t.id, x: e.clientX, w: t.width };
	}
	function doResize(e: PointerEvent) {
		if (!resizing) return;
		view.setWidth(resizing.id, resizing.w + (e.clientX - resizing.x) / unitPx);
	}

	// ---- reorder (HTML5 drag on headers; touch uses the track menu) ---------------
	function dragOver(e: DragEvent, i: number) {
		if (!dragId) return;
		e.preventDefault();
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		dropAt = e.clientX < r.left + r.width / 2 ? i : i + 1;
	}
	function drop() {
		if (dragId !== null && dropAt !== null) {
			const from = view.template.tracks.findIndex((t) => t.id === dragId);
			view.moveTrack(dragId, dropAt > from ? dropAt - 1 : dropAt);
		}
		dragId = null;
		dropAt = null;
	}

	function addTrackOf(kind: string) {
		if (kind === 'curve') view.addCurveTrack();
		if (kind === 'depth') view.addTrack({ id: uid('t'), kind: 'depth', width: 0.5, ref: 'tvdss' });
		if (kind === 'lith') view.addTrack({ id: uid('t'), kind: 'discrete', width: 0.4, curve: entryFor('lithology') });
		if (kind === 'GROUP' || kind === 'FORMATION') view.addTrack({ id: uid('t'), kind: 'zone', width: 0.6, zoneSet: kind });
		popover = null;
	}

	const dashCss = (d: string) => (d === 'solid' ? 'solid' : d === 'dotted' ? 'dotted' : 'dashed');
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && (popover = null)} />

<div class="page">
	<header class="bar">
		<div class="brand">petroviz <span>log view · prototype A</span></div>
		<WellPicker {view} />
		<IntervalInput {view} />
		<div class="seg" role="group" aria-label="Depth reference">
			<button class:on={activeRef === 'md'} onclick={() => (activeRef = 'md')}>MD</button>
			<button class:on={activeRef === 'tvdss'} onclick={() => (activeRef = 'tvdss')}>TVDSS</button>
		</div>
		<div class="spacer"></div>
		<span class="dim">{view.unmatched.length} curves not shown</span>
		<button class="ghost" onclick={() => view.resetTemplate()}>Reset layout</button>
		<ThemeToggle />
	</header>

	<div class="body">
		<aside class="ov">
			<div class="ov-head">GR · GROUP</div>
			<div class="ov-plot"><Overview {view} /></div>
		</aside>

		<div class="scroll" bind:clientWidth={scrollW}>
			<div class="log" style:width="{view.template.tracks.reduce((s, t) => s + px(t), 0) + 40}px">
				<!-- headers -->
				<div class="heads">
					{#each view.template.tracks as t, i (t.id)}
						<div
							class="head"
							class:drop-before={dropAt === i && dragId}
							class:drop-after={dropAt === i + 1 && i === view.template.tracks.length - 1 && dragId}
							style:width="{px(t)}px"
							draggable="true"
							ondragstart={(e) => { dragId = t.id; e.dataTransfer?.setData('text/plain', t.id); }}
							ondragover={(e) => dragOver(e, i)}
							ondrop={drop}
							ondragend={() => { dragId = null; dropAt = null; }}
							role="columnheader"
							tabindex="-1"
						>
							<div class="tools">
								<button title="Track menu" onclick={(e) => open('track', t.id, e)}>⋯</button>
								{#if t.kind === 'curve'}<button title="Add curve" onclick={(e) => open('add', t.id, e)}>＋</button>{/if}
								<button title="Remove track" onclick={() => view.removeTrack(t.id)}>×</button>
							</div>
							{#if t.kind === 'curve'}
								{@const ms = view.matched.get(t.id) ?? []}
								{#if !ms.some((m) => m.curve)}
									<div class="empty">{ms.length ? 'No curves of this track in this well' : 'Empty track — ＋ to add a curve'}</div>
								{/if}
								{#each ms as m (m.entry.id)}
									{#if m.curve && m.scale}
										{@const v = valueAt(m)}
										<button class="scalebar" style:--c={m.entry.colour} onclick={(e) => open('edit', t.id, e, m.entry.id)} title="Edit {m.curve.mnemonic}">
											<span class="name">{m.curve.mnemonic}</span>
											<span class="mid" class:live={v !== null}>{v !== null ? `${v} ${m.curve.unit}` : m.curve.unit}{m.scale.fallback ? ' ·P' : ''}</span>
											<span class="ends"><span>{fmt(m.scale.shownLeft)}</span><span>{fmt(m.scale.shownRight)}</span></span>
											<span class="line" style:border-top-style={dashCss(m.entry.dash)} style:border-top-width="{Math.max(1, m.entry.width) + 0.5}px"></span>
										</button>
									{:else}
										<button class="scalebar missing" onclick={(e) => open('edit', t.id, e, m.entry.id)}>
											{m.entry.select[0].value} — not in this well
										</button>
									{/if}
								{/each}
							{:else if t.kind === 'depth'}
								{@const r = t.ref === 'active' ? activeRef : t.ref}
								<div class="label">{r.toUpperCase()}<br /><span class="dim">m</span></div>
								{#if idx !== null && view.log}
									<div class="live">{fmt(r === 'md' ? view.log.md[idx] : (view.log.tvdss?.[idx] ?? NaN))}</div>
								{/if}
							{:else if t.kind === 'discrete'}
								{@const m = view.matched.get(t.id)?.[0]}
								<div class="label">Lithology</div>
								{#if m}<div class="live small">{valueAt(m) ?? ''}</div>{/if}
							{:else}
								<div class="label">{t.zoneSet}</div>
								<div class="live small">{zoneAt(t.zoneSet) ?? ''}</div>
							{/if}
						</div>
					{/each}
					<div class="head add-col">
						<button title="Add track" onclick={(e) => open('track', '', e)}>＋</button>
					</div>
				</div>

				<!-- plots -->
				<div class="plots" bind:clientHeight={plotH} {@attach navigate(view)}>
					{#each view.template.tracks as t (t.id)}
						<div class="plot" class:depth={t.kind === 'depth'} style:width="{px(t)}px">
							<TrackCanvas {view} track={t} {activeRef} />
							<div
								class="resize"
								onpointerdown={(e) => startResize(e, t)}
								onpointermove={doResize}
								onpointerup={() => (resizing = null)}
								ondblclick={() => view.setWidth(t.id, t.kind === 'depth' ? 0.5 : 1)}
								role="separator"
								aria-orientation="vertical"
								tabindex="-1"
							></div>
						</div>
					{/each}
					{#if cursorY !== null}
						<div class="cursor" style:transform="translateY({cursorY}px)"></div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>

{#if popover}
	{@const p = popover}
	<button class="scrim" aria-label="Close" onclick={() => (popover = null)}></button>
	<div class="popover" style:left="{p.x}px" style:top="{p.y}px">
		{#if p.kind === 'edit'}
			{@const m = view.matched.get(p.trackId)?.find((m) => m.entry.id === p.entryId)}
			{#if m}<CurveEditor {view} trackId={p.trackId} {m} onremove={() => (popover = null)} />{/if}
		{:else if p.kind === 'add'}
			<AddCurve {view} trackId={p.trackId} ondone={() => (popover = null)} />
		{:else if p.trackId}
			{@const i = view.template.tracks.findIndex((t) => t.id === p.trackId)}
			<div class="menu">
				<button onclick={() => view.moveTrack(p.trackId, i - 1)}>◀ Move left</button>
				<button onclick={() => view.moveTrack(p.trackId, i + 1)}>Move right ▶</button>
				<button onclick={() => view.setWidth(p.trackId, (view.template.tracks[i]?.width ?? 1) * 1.25)}>Wider</button>
				<button onclick={() => view.setWidth(p.trackId, (view.template.tracks[i]?.width ?? 1) / 1.25)}>Narrower</button>
				<button onclick={() => (view.removeTrack(p.trackId), (popover = null))}>Remove track</button>
			</div>
		{:else}
			<div class="menu">
				<button onclick={() => addTrackOf('curve')}>Curve track</button>
				<button onclick={() => addTrackOf('depth')}>Depth track (TVDSS)</button>
				<button onclick={() => addTrackOf('lith')}>Lithology track</button>
				<button onclick={() => addTrackOf('GROUP')}>Zone track: GROUP</button>
				<button onclick={() => addTrackOf('FORMATION')}>Zone track: FORMATION</button>
			</div>
		{/if}
	</div>
{/if}

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
	.body {
		flex: 1;
		min-height: 0;
		display: flex;
	}
	.ov {
		width: 56px;
		flex: none;
		display: flex;
		flex-direction: column;
		border-right: 1px solid var(--color-border);
		background: var(--color-surface);
	}
	.ov-head {
		font: 9px var(--font-mono);
		color: var(--color-text-muted);
		padding: 4px;
		text-align: center;
	}
	.ov-plot {
		flex: 1;
		min-height: 0;
		margin: 0 6px 8px;
		border: 1px solid var(--color-border);
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
		align-items: stretch;
		border-bottom: 1px solid var(--color-border-strong);
		background: var(--color-surface);
	}
	.head {
		position: relative;
		flex: none;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		gap: 2px;
		padding: 18px 3px 4px;
		border-right: 1px solid var(--color-border-strong);
		min-height: 64px;
		cursor: grab;
	}
	.head.drop-before {
		box-shadow: inset 3px 0 0 var(--color-accent);
	}
	.head.drop-after {
		box-shadow: inset -3px 0 0 var(--color-accent);
	}
	.tools {
		position: absolute;
		top: 2px;
		right: 2px;
		display: flex;
		gap: 1px;
		opacity: 0;
		transition: opacity 0.12s;
	}
	.head:hover .tools,
	.head:focus-within .tools {
		opacity: 1;
	}
	.tools button,
	.add-col button {
		width: 18px;
		height: 16px;
		line-height: 1;
		font-size: 11px;
		border: 0;
		border-radius: 3px;
		background: var(--color-surface-sunken);
		color: var(--color-text-secondary);
		cursor: pointer;
		padding: 0;
	}
	.add-col {
		width: 40px;
		justify-content: center;
		align-items: center;
		cursor: default;
		border-right: 0;
	}
	.add-col button {
		width: 26px;
		height: 26px;
		font-size: 15px;
	}
	.scalebar {
		display: grid;
		grid-template-columns: 1fr;
		width: 100%;
		border: 0;
		padding: 1px 1px 0;
		background: none;
		color: var(--c);
		font: 10.5px/1.2 var(--font-mono);
		cursor: pointer;
		border-radius: 2px;
		text-align: center;
	}
	.scalebar:hover {
		background: var(--color-accent-soft);
	}
	.scalebar .name {
		grid-area: 1 / 1;
		justify-self: start;
		font-weight: 600;
	}
	.scalebar .mid {
		grid-area: 1 / 1;
		justify-self: end;
		color: var(--color-text-muted);
		font-size: 9.5px;
	}
	.scalebar .mid.live {
		color: var(--color-text);
		font-weight: 600;
	}
	.scalebar .ends {
		display: flex;
		justify-content: space-between;
		font-size: 9.5px;
		color: var(--color-text-secondary);
	}
	.scalebar .line {
		display: block;
		border-top-color: var(--c);
		margin-top: 1px;
	}
	.scalebar.missing {
		color: var(--color-text-muted);
		font-size: 9.5px;
		text-decoration: line-through;
		text-align: left;
	}
	.empty {
		font-size: 10px;
		color: var(--color-text-muted);
		text-align: center;
		padding: 4px 0;
	}
	.label {
		font: 600 10.5px var(--font-mono);
		text-align: center;
		color: var(--color-text-secondary);
	}
	.live {
		font: 600 11px var(--font-mono);
		text-align: center;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.live.small {
		font-size: 10px;
		font-weight: 500;
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
	.resize {
		position: absolute;
		top: 0;
		right: -4px;
		width: 7px;
		height: 100%;
		cursor: col-resize;
		z-index: 2;
	}
	.resize:hover {
		background: color-mix(in srgb, var(--color-accent) 30%, transparent);
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
	.scrim {
		position: fixed;
		inset: 0;
		background: transparent;
		border: 0;
		z-index: 40;
	}
	.popover {
		position: fixed;
		z-index: 41;
		padding: 10px;
		border-radius: 8px;
		background: var(--color-surface-elevated);
		border: 1px solid var(--color-border-strong);
		box-shadow: var(--shadow-lg);
		max-width: 320px;
	}
	.menu {
		display: grid;
		gap: 2px;
		min-width: 160px;
	}
	.menu button {
		text-align: left;
		font: inherit;
		font-size: var(--font-size-xs);
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
