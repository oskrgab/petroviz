<script lang="ts">
  /**
   * LoadingSpinner Component
   *
   * Modern loading indicator with pulsing animation.
   * Supports different sizes for various contexts.
   */

  interface Props {
    size?: "small" | "medium" | "large";
    message?: string;
    detail?: string;
  }

  let { size = "medium", message, detail }: Props = $props();

  const sizes = {
    small: { ring: 24, stroke: 3 },
    medium: { ring: 48, stroke: 4 },
    large: { ring: 72, stroke: 5 },
  };

  const { ring, stroke } = sizes[size];
  const radius = (ring - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
</script>

<div
  class="loading-container"
  class:small={size === "small"}
  role="status"
  aria-live="polite"
  aria-busy="true"
>
  <div class="spinner-wrapper">
    <svg
      class="spinner"
      width={ring}
      height={ring}
      viewBox={`0 0 ${ring} ${ring}`}
    >
      <!-- Background track -->
      <circle
        class="track"
        cx={ring / 2}
        cy={ring / 2}
        r={radius}
        stroke-width={stroke}
        fill="none"
      />
      <!-- Animated arc -->
      <circle
        class="arc"
        cx={ring / 2}
        cy={ring / 2}
        r={radius}
        stroke-width={stroke}
        fill="none"
        stroke-linecap="round"
        stroke-dasharray={circumference}
        stroke-dashoffset={circumference * 0.75}
      />
    </svg>
    <!-- Center dot -->
    <div class="center-dot"></div>
  </div>

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
    gap: var(--spacing-md);
    padding: var(--spacing-lg);
  }

  .loading-container.small {
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    flex-direction: row;
  }

  .spinner-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .spinner {
    animation: rotate 1.5s linear infinite;
  }

  .track {
    stroke: var(--color-border);
  }

  .arc {
    stroke: var(--color-accent);
    animation: dash 1.5s ease-in-out infinite;
    transform-origin: center;
  }

  .center-dot {
    position: absolute;
    width: 6px;
    height: 6px;
    background: var(--color-accent);
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .loading-container.small .center-dot {
    width: 4px;
    height: 4px;
  }

  @keyframes rotate {
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes dash {
    0% {
      stroke-dashoffset: calc(var(--circumference, 138) * 0.85);
      transform: rotate(0deg);
    }
    50% {
      stroke-dashoffset: calc(var(--circumference, 138) * 0.25);
      transform: rotate(45deg);
    }
    100% {
      stroke-dashoffset: calc(var(--circumference, 138) * 0.85);
      transform: rotate(360deg);
    }
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(0.8);
    }
  }

  .message {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 500;
    color: var(--color-text);
    text-align: center;
  }

  .loading-container.small .message {
    font-size: var(--font-size-sm);
  }

  .detail {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-muted);
    text-align: center;
  }

  .loading-container.small .detail {
    display: none;
  }
</style>
