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
		<div class="error-icon-wrapper">
			<svg class="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="10" />
				<line x1="12" y1="8" x2="12" y2="12" />
				<circle cx="12" cy="16" r="0.5" fill="currentColor" />
			</svg>
		</div>
		{#if title}
			<h1 class="error-title">{title}</h1>
		{/if}
		<p class="error-message">{message}</p>
		{#if onRetry}
			<button onclick={onRetry} class="retry-button">
				<svg viewBox="0 0 16 16" fill="currentColor">
					<path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
					<path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
				</svg>
				Try Again
			</button>
		{/if}
	</div>
{:else if variant === 'banner'}
	<div class="error-banner" role="alert">
		<div class="banner-content">
			<svg class="banner-icon" viewBox="0 0 16 16" fill="currentColor">
				<path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575L6.457 1.047ZM8 5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5Zm1 6a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z"/>
			</svg>
			<p>{message}</p>
		</div>
		{#if onRetry}
			<button onclick={onRetry} class="retry-button-small">
				Retry
			</button>
		{/if}
	</div>
{:else}
	<div class="error-inline" role="alert">
		<svg class="inline-icon" viewBox="0 0 16 16" fill="currentColor">
			<path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16Zm.93-9.412-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.47l-.451-.081.082-.381 2.29-.287Zm-.092-3.042a1.147 1.147 0 1 1 0 2.294 1.147 1.147 0 0 1 0-2.294Z"/>
		</svg>
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
		gap: var(--spacing-lg);
		padding: var(--spacing-xl);
		text-align: center;
		animation: fadeIn 0.3s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.error-icon-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 80px;
		height: 80px;
		background: var(--color-error-soft);
		border-radius: var(--radius-full);
	}

	.error-icon {
		width: 40px;
		height: 40px;
		color: var(--color-error);
	}

	.error-title {
		margin: 0;
		color: var(--color-text);
		font-size: var(--font-size-2xl);
		font-weight: 600;
	}

	.error-message {
		max-width: 480px;
		color: var(--color-text-secondary);
		margin: 0;
		line-height: 1.6;
	}

	.retry-button {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-xl);
		background: var(--color-accent);
		color: white;
		border: none;
		border-radius: var(--radius-md);
		font-size: var(--font-size-base);
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
		box-shadow: var(--shadow-sm);
	}

	.retry-button svg {
		width: 16px;
		height: 16px;
	}

	.retry-button:hover {
		background: var(--color-accent-hover);
		box-shadow: var(--shadow-md);
		transform: translateY(-1px);
	}

	.retry-button:active {
		transform: translateY(0);
	}

	/* Banner variant - horizontal error bar */
	.error-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-error-soft);
		border: 1px solid var(--color-error);
		border-radius: var(--radius-md);
		animation: slideIn 0.2s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateX(-10px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	.banner-content {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.banner-icon {
		width: 16px;
		height: 16px;
		color: var(--color-error);
		flex-shrink: 0;
	}

	.error-banner p {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--color-error);
		font-weight: 500;
	}

	.retry-button-small {
		padding: var(--spacing-xs) var(--spacing-md);
		background: var(--color-error);
		color: white;
		border: none;
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
		font-weight: 500;
		cursor: pointer;
		transition: all var(--transition-fast);
		flex-shrink: 0;
	}

	.retry-button-small:hover {
		filter: brightness(1.1);
	}

	/* Inline variant - small inline error */
	.error-inline {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
	}

	.inline-icon {
		width: 14px;
		height: 14px;
		color: var(--color-error);
		flex-shrink: 0;
	}

	.error-text {
		color: var(--color-error);
	}

	.retry-link {
		background: none;
		border: none;
		color: var(--color-accent);
		font-weight: 500;
		cursor: pointer;
		font-size: inherit;
		padding: 0;
		transition: color var(--transition-fast);
	}

	.retry-link:hover {
		color: var(--color-accent-hover);
		text-decoration: underline;
	}
</style>
