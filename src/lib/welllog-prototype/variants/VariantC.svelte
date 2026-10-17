<script lang="ts" module>
	export const name = 'stub';
</script>

<script lang="ts">
	import type { LogViewState } from '../view.svelte';
	let { view }: { view: LogViewState } = $props();
</script>

<p>Variant C stub — {view.well}</p>
