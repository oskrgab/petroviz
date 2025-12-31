<script lang="ts">
	/**
	 * ErrorMessage Component
	 *
	 * Reusable error display with optional retry functionality.
	 * Supports different visual styles for inline vs full-page errors.
	 */

	interface Props {
		message: string;
		title?: string;
		variant?: 'inline' | 'banner' | 'page';
		onRetry?: () => void;
	}

	let { message, title, variant = 'inline', onRetry }: Props = $props();
</script>

{#if variant === 'page'}
	<div class="error-page" role="alert">
		<div class="error-icon">!</div>
		{#if title}
			<h1>{title}</h1>
		{/if}
		<p class="error-message">{message}</p>
		{#if onRetry}
			<button onclick={onRetry} class="retry-button">
				Try Again
			</button>
		{/if}
	</div>
{:else if variant === 'banner'}
	<div class="error-banner" role="alert">
		<p>{message}</p>
		{#if onRetry}
			<button onclick={onRetry} class="retry-button-small">
				Retry
			</button>
		{/if}
	</div>
{:else}
	<div class="error-inline" role="alert">
		<span class="error-text">{message}</span>
		{#if onRetry}
			<button onclick={onRetry} class="retry-link">
				Retry
			</button>
		{/if}
	</div>
{/if}

<style>
	/* Page variant - full page error */
	.error-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		gap: var(--spacing-md);
		padding: var(--spacing-lg);
		text-align: center;
	}

	.error-icon {
		width: 60px;
		height: 60px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-error);
		color: white;
		font-size: 2rem;
		font-weight: bold;
		border-radius: 50%;
	}

	.error-page h1 {
		margin: 0;
		color: var(--color-error);
		font-size: var(--font-size-xl);
	}

	.error-message {
		max-width: 500px;
		color: var(--color-text-secondary);
		margin: 0;
	}

	.retry-button {
		padding: var(--spacing-sm) var(--spacing-lg);
		background: var(--color-water);
		color: white;
		border: none;
		border-radius: var(--border-radius);
		font-size: var(--font-size-base);
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.retry-button:hover {
		opacity: 0.9;
	}

	.retry-button:focus {
		outline: 2px solid var(--color-water);
		outline-offset: 2px;
	}

	/* Banner variant - horizontal error bar */
	.error-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: rgba(231, 76, 60, 0.1);
		border-left: 3px solid var(--color-error);
		border-radius: calc(var(--border-radius) / 2);
	}

	.error-banner p {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--color-error);
	}

	.retry-button-small {
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-error);
		color: white;
		border: none;
		border-radius: calc(var(--border-radius) / 2);
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: opacity 0.2s;
		flex-shrink: 0;
	}

	.retry-button-small:hover {
		opacity: 0.9;
	}

	/* Inline variant - small inline error */
	.error-inline {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-xs);
		color: var(--color-error);
		font-size: var(--font-size-sm);
	}

	.error-text {
		color: var(--color-error);
	}

	.retry-link {
		background: none;
		border: none;
		color: var(--color-water);
		text-decoration: underline;
		cursor: pointer;
		font-size: inherit;
		padding: 0;
	}

	.retry-link:hover {
		text-decoration: none;
	}
</style>
