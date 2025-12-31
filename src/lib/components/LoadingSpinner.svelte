<script lang="ts">
	/**
	 * LoadingSpinner Component
	 *
	 * Reusable loading indicator with optional message.
	 * Supports different sizes for various contexts.
	 */

	interface Props {
		size?: 'small' | 'medium' | 'large';
		message?: string;
		detail?: string;
	}

	let { size = 'medium', message, detail }: Props = $props();

	const sizeClasses = {
		small: 'spinner-small',
		medium: 'spinner-medium',
		large: 'spinner-large'
	};
</script>

<div class="loading-container" role="status" aria-live="polite" aria-busy="true">
	<div class="spinner {sizeClasses[size]}"></div>
	{#if message}
		<p class="message">{message}</p>
	{/if}
	{#if detail}
		<p class="detail">{detail}</p>
	{/if}
</div>

<style>
	.loading-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
	}

	.spinner {
		border: 4px solid var(--color-border);
		border-top-color: var(--color-water);
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	.spinner-small {
		width: 20px;
		height: 20px;
		border-width: 2px;
	}

	.spinner-medium {
		width: 40px;
		height: 40px;
		border-width: 4px;
	}

	.spinner-large {
		width: 60px;
		height: 60px;
		border-width: 5px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.message {
		margin: 0;
		font-size: var(--font-size-base);
		color: var(--color-text);
		text-align: center;
	}

	.detail {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		text-align: center;
	}
</style>
