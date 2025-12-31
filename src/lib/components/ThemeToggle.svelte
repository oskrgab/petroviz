<script lang="ts">
	/**
	 * ThemeToggle Component
	 *
	 * Animated toggle switch for dark/light theme.
	 * Uses sun/moon icons with smooth transitions.
	 */

	import { themeStore } from '$lib/stores/theme.svelte';

	// Reactive binding to theme state
	const isDark = $derived(themeStore.isDark);
</script>

<button
	type="button"
	class="theme-toggle"
	onclick={() => themeStore.toggle()}
	aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
	title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
>
	<span class="toggle-track">
		<span class="toggle-thumb" class:dark={isDark}>
			<!-- Sun Icon -->
			<svg
				class="icon sun"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="12" cy="12" r="5" />
				<line x1="12" y1="1" x2="12" y2="3" />
				<line x1="12" y1="21" x2="12" y2="23" />
				<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
				<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
				<line x1="1" y1="12" x2="3" y2="12" />
				<line x1="21" y1="12" x2="23" y2="12" />
				<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
				<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
			</svg>

			<!-- Moon Icon -->
			<svg
				class="icon moon"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
			</svg>
		</span>
	</span>
</button>

<style>
	.theme-toggle {
		position: relative;
		padding: 0;
		background: none;
		border: none;
		cursor: pointer;
		outline: none;
	}

	.theme-toggle:focus-visible .toggle-track {
		box-shadow: 0 0 0 2px var(--color-accent);
	}

	.toggle-track {
		display: flex;
		align-items: center;
		width: 52px;
		height: 28px;
		padding: 2px;
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		transition: all var(--transition-base);
	}

	.theme-toggle:hover .toggle-track {
		border-color: var(--color-border-strong);
	}

	.toggle-thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		background: var(--color-surface);
		border-radius: 50%;
		box-shadow: var(--shadow-sm);
		transition: transform var(--transition-base) cubic-bezier(0.68, -0.55, 0.265, 1.55);
		transform: translateX(0);
	}

	.toggle-thumb.dark {
		transform: translateX(24px);
		background: var(--color-surface-elevated);
	}

	.icon {
		width: 14px;
		height: 14px;
		transition: all var(--transition-base);
	}

	.sun {
		color: #f59e0b;
		opacity: 1;
		transform: scale(1) rotate(0deg);
	}

	.moon {
		position: absolute;
		color: #38bdf8;
		opacity: 0;
		transform: scale(0.5) rotate(-90deg);
	}

	.toggle-thumb.dark .sun {
		opacity: 0;
		transform: scale(0.5) rotate(90deg);
	}

	.toggle-thumb.dark .moon {
		opacity: 1;
		transform: scale(1) rotate(0deg);
	}

	/* Active state */
	.theme-toggle:active .toggle-thumb {
		width: 26px;
	}

	.theme-toggle:active .toggle-thumb.dark {
		transform: translateX(20px);
	}
</style>
