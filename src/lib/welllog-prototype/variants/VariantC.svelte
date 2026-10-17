<script lang="ts" module>
	export const name = 'Canvas-first — floating readout, edit mode';
</script>

<script lang="ts">
	// PROTOTYPE (#30) — Variant C. The data area is the page:
	// - headers are a thin strip of curve-coloured scale lines with end values; hover a
	//   header for that track's full legend;
	// - the depth cursor readout is either a floating card that follows the pointer or
	//   value chips sitting on the cursor line in each track (toggle to compare);
	// - nothing is editable until "Edit layout" (button or E): the plot dims, each track
	//   gets big overlay controls (drag the handle to reorder, works on touch), + slots
	//   appear between tracks, and curve editing opens in a bottom sheet;
	// - zones-only overview on the left, a floating navigation toolbar bottom-left and a
	//   small control cluster top-right; no full-width bar.
	import { fly } from 'svelte/transition';
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
	let readoutMode = $state<'card' | 'chips'>('card');
	let editing = $state(false);
	let scrollW = $state(1000);
	let plotH = $state(600);
	let headH = $state(30);
	let ptr = $state<{ x: number; y: number } | null>(null);
	let cardW = $state(220);
	let cardH = $state(200);
	let sheet = $state<{ kind: 'edit' | 'add'; trackId: string; entryId?: string } | null>(null);
	let slotMenu = $state<number | null>(null);
	let drag = $state<{ id: string; from: number; x0: number; dx: number } | null>(null);

	const MIN_PX = 44;
	const tracks = $derived(view.template.tracks);
	const totalWidth = $derived(tracks.reduce((s, t) => s + t.width, 0));
	const unitPx = $derived(Math.max(110, scrollW / Math.max(totalWidth, 0.1)));
	const px = (t: Track) => Math.max(MIN_PX, t.width * unitPx);
	const lefts = $derived.by(() => {
		const out: number[] = [];
		let x = 0;
		for (const t of tracks) {
			out.push(x);
			x += px(t);
		}
		out.push(x);
		return out;
	});

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
		const d = view.cursorMd;
		return view.log?.zoneSets.find((s) => s.name === set)?.zones.find((z) => z.top <= d && d < z.base)?.name ?? '—';
	}
	function depthValue(r: 'md' | 'tvdss') {
		if (idx === null || !view.log) return '';
		return fmt(r === 'md' ? view.log.md[idx] : (view.log.tvdss?.[idx] ?? NaN));
	}

	// floating card position, flipped near the right and bottom edges
	const cardPos = $derived.by(() => {
		if (!ptr) return null;
		const off = 18;
		const x = ptr.x + off + cardW > innerWidth - 8 ? ptr.x - off - cardW : ptr.x + off;
		const y = ptr.y + off + cardH > innerHeight - 8 ? Math.max(8, ptr.y - off - cardH) : ptr.y + off;
		return { x, y };
	});

	const readoutGroups = $derived.by(() => {
		const r = view.readout;
		return tracks
			.filter((t) => t.kind === 'curve' || t.kind === 'discrete')
			.map((t) => r.rows.filter((row) => row.trackId === t.id))
			.filter((g) => g.length);
	});

	// ---- edit mode: reorder by dragging the column ---------------------------------
	const dropIndex = $derived.by(() => {
		if (!drag) return null;
		const t = tracks[drag.from];
		if (!t) return null;
		const centre = lefts[drag.from] + px(t) / 2 + drag.dx;
		let n = 0;
		tracks.forEach((o, i) => {
			if (i !== drag!.from && lefts[i] + px(o) / 2 < centre) n++;
		});
		return n;
	});
	function dragStart(e: PointerEvent, t: Track, i: number) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		drag = { id: t.id, from: i, x0: e.clientX, dx: 0 };
	}
	function dragMove(e: PointerEvent) {
		if (drag) drag.dx = e.clientX - drag.x0;
	}
	function dragEnd() {
		if (drag && dropIndex !== null && dropIndex !== drag.from) view.moveTrack(drag.id, dropIndex);
		drag = null;
	}
	// where the dragged column will land, as an x position
	const dropX = $derived.by(() => {
		if (!drag || dropIndex === null) return null;
		const others = tracks.filter((_, i) => i !== drag!.from);
		let x = 0;
		for (let i = 0; i < dropIndex; i++) x += px(others[i]);
		return x;
	});

	function addTrackAt(kind: string, at: number) {
		if (kind === 'curve') view.addCurveTrack(at);
		if (kind === 'depth') view.addTrack({ id: uid('t'), kind: 'depth', width: 0.5, ref: 'tvdss' }, at);
		if (kind === 'lith') view.addTrack({ id: uid('t'), kind: 'discrete', width: 0.4, curve: entryFor('lithology') }, at);
		if (kind === 'GROUP' || kind === 'FORMATION') view.addTrack({ id: uid('t'), kind: 'zone', width: 0.6, zoneSet: kind }, at);
		slotMenu = null;
	}

	function zoomBy(f: number) {
		view.zoomAt((view.top + view.bottom) / 2, f);
	}

	function onKey(e: KeyboardEvent) {
		if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return;
		if (e.key === 'e' || e.key === 'E') {
			editing = !editing;
			sheet = null;
			slotMenu = null;
		}
		if (e.key === 'Escape') {
			if (sheet) sheet = null;
			else if (slotMenu !== null) slotMenu = null;
			else editing = false;
		}
	}

	const dashCss = (d: string) => (d === 'solid' ? 'solid' : d === 'dotted' ? 'dotted' : 'dashed');
	const trackLabel = (t: Track) =>
		t.kind === 'depth' ? (t.ref === 'active' ? activeRef : t.ref).toUpperCase() : t.kind === 'discrete' ? 'Lithology' : t.kind === 'zone' ? t.zoneSet : '';
</script>

<svelte:window onkeydown={onKey} />

<div class="page">
	<aside class="ov">
		<Overview {view} zoneWidth={1} zoneSet="GROUP" showLabels />
	</aside>

	<main class="main">
		<div class="scroll" bind:clientWidth={scrollW}>
			<div class="log" style:width="{lefts[lefts.length - 1]}px">
				<!-- thin headers -->
				<div class="heads" bind:clientHeight={headH}>
					{#each tracks as t, i (t.id)}
						<div class="head" style:width="{px(t)}px">
							{#if t.kind === 'curve'}
								{@const ms = (view.matched.get(t.id) ?? []).filter((m) => m.curve && m.scale)}
								{#each ms as m (m.entry.id)}
									<div class="sline" style:--c={m.entry.colour}>
										<span>{fmt(m.scale!.shownLeft)}</span>
										<i style:border-top-style={dashCss(m.entry.dash)}></i>
										<span>{fmt(m.scale!.shownRight)}</span>
									</div>
								{:else}
									<div class="tag dim">empty</div>
								{/each}
							{:else}
								<div class="tag">{trackLabel(t)}</div>
							{/if}

							<!-- hover legend -->
							<div class="legend" class:right={i > tracks.length / 2}>
								{#if t.kind === 'curve'}
									{#each view.matched.get(t.id) ?? [] as m (m.entry.id)}
										{#if m.curve && m.scale}
											<div class="lrow" style:--c={m.entry.colour}>
												<i style:border-top-style={dashCss(m.entry.dash)}></i>
												<b>{m.curve.mnemonic}</b>
												<span>{m.curve.unit}</span>
												<span class="sc">{fmt(m.scale.shownLeft)} → {fmt(m.scale.shownRight)}{m.scale.log ? ' log' : ''}{m.scale.fallback ? ' (P1–P99)' : ''}</span>
												<span class="wr">{m.entry.offScale}</span>
											</div>
										{:else}
											<div class="lrow missing">{m.entry.select[0].value} — not in this well</div>
										{/if}
									{:else}
										<div class="lrow dim">Empty track</div>
									{/each}
								{:else if t.kind === 'depth'}
									<div class="lrow">Depth track · {trackLabel(t)} · m</div>
								{:else if t.kind === 'discrete'}
									<div class="lrow">Lithology (FORCE 2020 codes, KGS colours)</div>
								{:else}
									<div class="lrow">Zone set {t.zoneSet} · click a zone to jump to it</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>

				<!-- plots -->
				<div class="plotwrap">
					<div
						class="plots"
						bind:clientHeight={plotH}
						{@attach navigate(view)}
						onpointermove={(e) => (ptr = { x: e.clientX, y: e.clientY })}
						onpointerleave={() => (ptr = null)}
					>
						{#each tracks as t (t.id)}
							<div class="plot" class:depth={t.kind === 'depth'} style:width="{px(t)}px">
								<TrackCanvas {view} track={t} {activeRef} />
								{#if readoutMode === 'chips' && cursorY !== null && !editing}
									<div class="chips" style:transform="translateY({cursorY}px)">
										{#if t.kind === 'curve'}
											{#each view.matched.get(t.id) ?? [] as m (m.entry.id)}
												{#if m.curve}<span class="chip" style:color={m.entry.colour}>{valueAt(m)}</span>{/if}
											{/each}
										{:else if t.kind === 'depth'}
											<span class="chip strong">{depthValue(t.ref === 'active' ? activeRef : t.ref)}</span>
										{:else if t.kind === 'discrete'}
											{@const m = view.matched.get(t.id)?.[0]}
											{#if m}<span class="chip">{valueAt(m)}</span>{/if}
										{:else}
											<span class="chip">{zoneAt(t.zoneSet)}</span>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
						{#if cursorY !== null && !editing}
							<div class="cursor" style:transform="translateY({cursorY}px)"></div>
						{/if}
					</div>

					{#if editing}
						<!-- edit layer: a sibling of the plot area, so navigation never sees these events -->
						<div class="editlayer">
							{#each tracks as t, i (t.id)}
								<div
									class="ecol"
									class:dragging={drag?.id === t.id}
									style:left="{lefts[i]}px"
									style:width="{px(t)}px"
									style:transform={drag?.id === t.id ? `translateX(${drag.dx}px)` : ''}
								>
									<button
										class="handle"
										title="Drag to reorder"
										onpointerdown={(e) => dragStart(e, t, i)}
										onpointermove={dragMove}
										onpointerup={dragEnd}
										onpointercancel={() => (drag = null)}
									>⠿</button>
									<div class="ename">{trackLabel(t) || 'Curves'}</div>
									<div class="erow">
										<button title="Narrower" onclick={() => view.setWidth(t.id, t.width / 1.25)}>−</button>
										<button title="Wider" onclick={() => view.setWidth(t.id, t.width * 1.25)}>+</button>
										<button class="danger" title="Remove track" onclick={() => view.removeTrack(t.id)}>×</button>
									</div>
									{#if t.kind === 'curve'}
										<div class="ecurves">
											{#each view.matched.get(t.id) ?? [] as m (m.entry.id)}
												<button
													class="ecurve"
													class:missing={!m.curve}
													style:--c={m.entry.colour}
													onclick={() => (sheet = { kind: 'edit', trackId: t.id, entryId: m.entry.id })}
												>
													{m.curve?.mnemonic ?? m.entry.select[0].value}
												</button>
											{/each}
											<button class="ecurve add" onclick={() => (sheet = { kind: 'add', trackId: t.id })}>+ curve</button>
										</div>
									{/if}
								</div>
							{/each}

							{#each lefts as x, i (i)}
								<div class="slot" style:left="{Math.min(Math.max(14, x), lefts[lefts.length - 1] - 14)}px" class:hidden={!!drag}>
									<button title="Add track here" onclick={() => (slotMenu = slotMenu === i ? null : i)}>+</button>
									{#if slotMenu === i}
										<div class="slotmenu" class:right={i > tracks.length / 2}>
											<button onclick={() => addTrackAt('curve', i)}>Curve track</button>
											<button onclick={() => addTrackAt('depth', i)}>Depth track (TVDSS)</button>
											<button onclick={() => addTrackAt('lith', i)}>Lithology track</button>
											<button onclick={() => addTrackAt('GROUP', i)}>Zone track: GROUP</button>
											<button onclick={() => addTrackAt('FORMATION', i)}>Zone track: FORMATION</button>
										</div>
									{/if}
								</div>
							{/each}

							{#if dropX !== null}
								<div class="dropline" style:left="{dropX}px"></div>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- top-right cluster (hidden while editing; the banner carries Done) -->
		{#if !editing}
		<div class="cluster" style:top="{headH + 8}px">
			<WellPicker {view} />
			<div class="seg" role="group" aria-label="Depth reference">
				<button class:on={activeRef === 'md'} onclick={() => (activeRef = 'md')}>MD</button>
				<button class:on={activeRef === 'tvdss'} onclick={() => (activeRef = 'tvdss')}>TVDSS</button>
			</div>
			<div class="seg" role="group" aria-label="Readout">
				<button class:on={readoutMode === 'card'} onclick={() => (readoutMode = 'card')}>Card</button>
				<button class:on={readoutMode === 'chips'} onclick={() => (readoutMode = 'chips')}>Chips</button>
			</div>
			<button class="edit" class:on={editing} onclick={() => ((editing = !editing), (sheet = null), (slotMenu = null))} title="Edit layout (E)">
				{editing ? 'Done' : 'Edit layout'}
			</button>
			<ThemeToggle />
		</div>
		{/if}

		{#if editing}
			<div class="editbanner">
				Editing layout · drag ⠿ to reorder · {view.unmatched.length} curve{view.unmatched.length === 1 ? '' : 's'} not shown
				<button onclick={() => view.resetTemplate()}>Reset to default</button>
				<button class="done" onclick={() => ((editing = false), (sheet = null), (slotMenu = null))}>Done</button>
			</div>
		{/if}

		<!-- floating navigation -->
		<div class="nav">
			<button title="Zoom in" onclick={() => zoomBy(0.5)}>+</button>
			<button title="Zoom out" onclick={() => zoomBy(2)}>−</button>
			<IntervalInput {view} />
		</div>
	</main>
</div>

{#if readoutMode === 'card' && view.cursorMd !== null && cardPos && !editing}
	{@const r = view.readout}
	<div class="card" style:left="{cardPos.x}px" style:top="{cardPos.y}px" bind:clientWidth={cardW} bind:clientHeight={cardH}>
		<div class="depths">
			<span><b>MD</b> {fmt(r.md ?? NaN)} m</span>
			{#if r.tvdss !== null}<span><b>TVDSS</b> {fmt(r.tvdss)} m</span>{/if}
		</div>
		{#each readoutGroups as g, gi (gi)}
			<div class="group">
				{#each g as row (row.label + row.trackId)}
					<div class="crow">
						<span class="mn" style:color={row.colour} title={row.label}>{row.unit === '' && row.label.includes('LITH') ? 'LITH' : row.label}</span>
						<span class="val">{row.value}</span>
						<span class="unit">{row.unit}</span>
					</div>
				{/each}
			</div>
		{/each}
		<div class="group">
			{#each r.zones as z (z.set)}
				<div class="crow"><span class="mn">{z.set}</span><span class="val zone">{z.name}</span></div>
			{/each}
		</div>
	</div>
{/if}

{#if sheet}
	{@const s = sheet}
	<div class="sheet" transition:fly={{ y: 300, duration: 180 }}>
		<div class="sheethead">
			<b>{s.kind === 'add' ? 'Add curve' : 'Curve'}</b>
			<button onclick={() => (sheet = null)} aria-label="Close">×</button>
		</div>
		{#if s.kind === 'edit'}
			{@const m = view.matched.get(s.trackId)?.find((m) => m.entry.id === s.entryId)}
			{#if m}<CurveEditor {view} trackId={s.trackId} {m} onremove={() => (sheet = null)} />{/if}
		{:else}
			<AddCurve {view} trackId={s.trackId} ondone={() => (sheet = null)} />
		{/if}
	</div>
{/if}

<style>
	.page {
		height: 100vh;
		display: flex;
		background: var(--color-surface);
		color: var(--color-text);
		font-family: var(--font-sans);
		overflow: hidden;
	}
	.ov {
		width: 70px;
		flex: none;
		border-right: 1px solid var(--color-border-strong);
	}
	.main {
		position: relative;
		flex: 1;
		min-width: 0;
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

	/* thin headers */
	.heads {
		display: flex;
		align-items: stretch;
		border-bottom: 1px solid var(--color-border-strong);
		background: var(--color-surface);
		position: relative;
		z-index: 20;
	}
	.head {
		position: relative;
		flex: none;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		padding: 3px 3px 2px;
		border-right: 1px solid var(--color-border);
		min-height: 22px;
		cursor: help;
	}
	.head:hover {
		background: var(--color-surface-sunken);
	}
	.sline {
		display: flex;
		align-items: center;
		gap: 3px;
		font: 8.5px/1.15 var(--font-mono);
		color: var(--color-text-muted);
	}
	.sline i {
		flex: 1;
		height: 0;
		border-top: 1.5px solid var(--c);
	}
	.tag {
		font: 600 9px var(--font-mono);
		color: var(--color-text-secondary);
		text-align: center;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.dim {
		color: var(--color-text-muted);
		font-weight: 400;
	}
	.legend {
		display: none;
		position: absolute;
		top: 100%;
		left: 0;
		z-index: 30;
		min-width: 240px;
		padding: 8px 10px;
		border-radius: 0 0 8px 8px;
		background: var(--color-surface-elevated);
		border: 1px solid var(--color-border-strong);
		box-shadow: var(--shadow-lg);
		cursor: default;
	}
	.legend.right {
		left: auto;
		right: 0;
	}
	.head:hover .legend {
		display: grid;
		gap: 4px;
	}
	.lrow {
		display: flex;
		align-items: center;
		gap: 6px;
		font: 11px var(--font-mono);
		white-space: nowrap;
	}
	.lrow i {
		width: 18px;
		height: 0;
		border-top: 2px solid var(--c);
	}
	.lrow b {
		color: var(--c);
	}
	.lrow span {
		color: var(--color-text-secondary);
	}
	.lrow .sc {
		margin-left: auto;
		color: var(--color-text);
	}
	.lrow .wr {
		color: var(--color-text-muted);
		font-size: 9.5px;
	}
	.lrow.missing {
		color: var(--color-text-muted);
		text-decoration: line-through;
	}

	/* plots */
	.plotwrap {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
	}
	.plots {
		position: relative;
		flex: 1;
		display: flex;
		cursor: crosshair;
		user-select: none;
	}
	.plot {
		position: relative;
		flex: none;
		height: 100%;
		border-right: 1px solid var(--color-border);
	}
	.plot.depth {
		background: var(--color-surface-sunken);
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
	.chips {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 2px;
		padding: 0 2px;
		pointer-events: none;
		will-change: transform;
		z-index: 4;
		translate: 0 calc(-100% - 2px);
	}
	.chip {
		font: 600 10px/1.3 var(--font-mono);
		padding: 0 3px;
		border-radius: 3px;
		background: color-mix(in srgb, var(--color-surface) 85%, transparent);
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
	.chip.strong {
		color: var(--color-error);
	}

	/* edit layer */
	.editlayer {
		position: absolute;
		inset: 0;
		z-index: 10;
		background: color-mix(in srgb, var(--color-background) 72%, transparent);
	}
	.ecol {
		position: absolute;
		top: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 12px 4px;
		border-right: 1px dashed var(--color-border-strong);
		box-sizing: border-box;
	}
	.ecol.dragging {
		z-index: 2;
		background: color-mix(in srgb, var(--color-accent) 14%, var(--color-surface));
		box-shadow: var(--shadow-lg);
		opacity: 0.95;
	}
	.handle {
		width: 100%;
		max-width: 64px;
		height: 36px;
		font-size: 18px;
		border: 1px solid var(--color-border-strong);
		border-radius: 6px;
		background: var(--color-surface);
		color: var(--color-text-secondary);
		cursor: grab;
		touch-action: none;
	}
	.handle:active {
		cursor: grabbing;
	}
	.ename {
		font: 600 10px var(--font-mono);
		color: var(--color-text-secondary);
		text-transform: uppercase;
		text-align: center;
	}
	.erow {
		display: flex;
		gap: 3px;
		flex-wrap: wrap;
		justify-content: center;
	}
	.erow button {
		width: 28px;
		height: 28px;
		font-size: 15px;
		border: 1px solid var(--color-border-strong);
		border-radius: 6px;
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
	}
	.erow .danger {
		color: var(--color-error);
	}
	.ecurves {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 100%;
	}
	.ecurve {
		font: 600 11px var(--font-mono);
		padding: 6px 4px;
		border: 1px solid var(--color-border-strong);
		border-left: 4px solid var(--c);
		border-radius: 5px;
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ecurve.missing {
		color: var(--color-text-muted);
		text-decoration: line-through;
		border-left-color: var(--color-border-strong);
	}
	.ecurve.add {
		border: 1px dashed var(--color-accent);
		color: var(--color-accent);
		font-weight: 500;
	}
	.slot {
		position: absolute;
		top: 50%;
		width: 0;
		z-index: 3;
	}
	.slot.hidden {
		display: none;
	}
	.slot > button {
		position: absolute;
		left: -14px;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: 1px solid var(--color-accent);
		background: var(--color-surface);
		color: var(--color-accent);
		font-size: 15px;
		cursor: pointer;
		box-shadow: var(--shadow-md);
	}
	.slotmenu {
		position: absolute;
		top: 34px;
		left: -14px;
		display: grid;
		gap: 2px;
		min-width: 170px;
		padding: 6px;
		border-radius: 8px;
		background: var(--color-surface-elevated);
		border: 1px solid var(--color-border-strong);
		box-shadow: var(--shadow-lg);
	}
	.slotmenu.right {
		left: auto;
		right: -14px;
	}
	.slotmenu button {
		text-align: left;
		font: inherit;
		font-size: var(--font-size-xs);
		border: 0;
		background: none;
		color: var(--color-text);
		padding: 5px 6px;
		border-radius: 4px;
		cursor: pointer;
	}
	.slotmenu button:hover {
		background: var(--color-accent-soft);
	}
	.dropline {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 0;
		border-left: 3px solid var(--color-accent);
		margin-left: -1px;
		z-index: 4;
		pointer-events: none;
	}
	.editbanner {
		position: absolute;
		left: 50%;
		top: 8px;
		transform: translateX(-50%);
		z-index: 20;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 5px 10px;
		border-radius: 999px;
		background: var(--color-accent);
		color: #fff;
		font-size: var(--font-size-xs);
		box-shadow: var(--shadow-md);
		white-space: nowrap;
	}
	.editbanner button {
		font: inherit;
		border: 1px solid rgba(255, 255, 255, 0.6);
		background: none;
		color: inherit;
		border-radius: 999px;
		padding: 1px 8px;
		cursor: pointer;
	}
	.editbanner .done {
		background: #fff;
		color: var(--color-accent);
		font-weight: 600;
	}

	/* floating chrome */
	.cluster {
		position: absolute;
		right: 10px;
		z-index: 15;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 8px;
		border-radius: 10px;
		background: var(--glass-bg);
		backdrop-filter: var(--backdrop-blur);
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-md);
		flex-wrap: wrap;
		justify-content: flex-end;
		max-width: calc(100% - 20px);
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
		padding: 3px 7px;
		background: var(--color-surface);
		color: var(--color-text-secondary);
		cursor: pointer;
	}
	.seg button.on {
		background: var(--color-accent);
		color: #fff;
	}
	.edit {
		font: 600 12px var(--font-sans);
		padding: 4px 10px;
		border-radius: 6px;
		border: 1px solid var(--color-accent);
		background: var(--color-surface);
		color: var(--color-accent);
		cursor: pointer;
	}
	.edit.on {
		background: var(--color-accent);
		color: #fff;
	}
	.nav {
		position: absolute;
		left: 10px;
		bottom: 12px;
		z-index: 15;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 8px;
		border-radius: 10px;
		background: var(--glass-bg);
		backdrop-filter: var(--backdrop-blur);
		border: 1px solid var(--color-border);
		box-shadow: var(--shadow-md);
	}
	.nav > button {
		width: 26px;
		height: 24px;
		font-size: 14px;
		border: 1px solid var(--color-border-strong);
		border-radius: 5px;
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
	}

	/* floating readout card */
	.card {
		position: fixed;
		z-index: 50;
		min-width: 190px;
		max-width: 260px;
		padding: 6px 8px;
		border-radius: 8px;
		background: color-mix(in srgb, var(--color-surface-elevated) 94%, transparent);
		border: 1px solid var(--color-border-strong);
		box-shadow: var(--shadow-lg);
		pointer-events: none;
		font: 11px/1.35 var(--font-mono);
	}
	.depths {
		display: flex;
		gap: 10px;
		padding-bottom: 4px;
		margin-bottom: 3px;
		border-bottom: 1px solid var(--color-border);
		color: var(--color-error);
	}
	.depths b {
		color: var(--color-text-secondary);
		font-weight: 500;
	}
	.group {
		padding: 2px 0;
		border-bottom: 1px solid var(--color-border);
	}
	.group:last-child {
		border-bottom: 0;
	}
	.crow {
		display: grid;
		grid-template-columns: 9ch 1fr auto;
		gap: 6px;
	}
	.crow .mn {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
		color: var(--color-text-secondary);
	}
	.crow .val {
		text-align: right;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.crow .val.zone {
		grid-column: span 2;
		text-align: left;
	}
	.crow .unit {
		color: var(--color-text-muted);
		font-size: 10px;
		min-width: 5ch;
	}

	/* bottom sheet */
	.sheet {
		position: fixed;
		left: 80px;
		bottom: 0;
		z-index: 55;
		width: min(440px, calc(100vw - 96px));
		max-height: 70vh;
		overflow: auto;
		padding: 10px 14px 56px;
		border-radius: 12px 12px 0 0;
		background: var(--color-surface-elevated);
		border: 1px solid var(--color-border-strong);
		border-bottom: 0;
		box-shadow: 0 -10px 30px rgba(15, 23, 42, 0.18);
	}
	.sheethead {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}
	.sheethead button {
		border: 0;
		background: none;
		font-size: 18px;
		color: var(--color-text-secondary);
		cursor: pointer;
	}
</style>
