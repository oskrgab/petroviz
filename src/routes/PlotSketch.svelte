<script lang="ts">
  /**
   * PlotSketch Component
   *
   * A small drawing of the kind of plot a visualization makes, oriented the
   * way its data runs: production across time (oil, water and gas rates),
   * well logs down depth (one curve in a track). The shapes are fixed, not
   * read from any dataset: the welcome page loads no data. Each draws in once
   * along its axis, unless the user prefers reduced motion.
   */

  interface Props {
    axis: "time" | "depth";
  }

  let { axis }: Props = $props();

  /** Points of a curve sampled at n steps of t in [0, 1]. */
  function path(n: number, point: (t: number) => [number, number]): string {
    let d = "";
    for (let i = 0; i <= n; i++) {
      const [x, y] = point(i / n);
      d += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  }

  // Production: oil peaks early and declines, water breaks through later,
  // gas follows the oil. Rates on a 0–1 scale, drawn in a 400 × 64 box.
  const W = 400;
  const H = 64;
  const noise = (t: number, k: number) =>
    0.05 * Math.sin(37 * t + k) + 0.035 * Math.sin(91 * t + 2 * k);
  const oil = (t: number) => (t < 0.08 ? t / 0.08 : Math.exp(-(t - 0.08) * 2.4));
  const water = (t: number) => (t < 0.3 ? 0 : 0.6 * (1 - Math.exp(-(t - 0.3) * 4)));
  const rate = (q: (t: number) => number, k: number) =>
    path(120, (t) => [t * W, H - 4 - Math.max(0, q(t) + noise(t, k) * Math.min(1, q(t) * 4)) * (H - 10)]);

  const production = [
    { colour: "var(--color-water)", d: rate(water, 1) },
    { colour: "var(--color-gas)", d: rate((t) => 0.78 * oil(t), 2) },
    { colour: "var(--color-oil)", d: rate(oil, 0) },
  ];

  // Well log: a gamma-ray-like curve, blocky beds with fine variation, drawn
  // down a 64 × 400 track.
  const log = path(120, (t) => {
    const y = t * W;
    const beds = Math.sin(y * 0.045) + 0.6 * Math.sin(y * 0.013 + 1);
    const v = 0.5 + 0.3 * Math.tanh(3 * beds) + 0.06 * Math.sin(y * 0.31) + 0.03 * Math.sin(y * 0.77 + 1);
    return [6 + v * (H - 12), y];
  });
</script>

{#if axis === "time"}
  <svg class="sketch time" viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">
    <line class="grid" x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} />
    {#each production as curve (curve.colour)}
      <path d={curve.d} stroke={curve.colour} />
    {/each}
  </svg>
{:else}
  <svg class="sketch depth" viewBox="0 0 {H} {W}" preserveAspectRatio="none" aria-hidden="true">
    <line class="grid" x1="0.5" y1="0" x2="0.5" y2={W} />
    <line class="grid" x1={H / 2} y1="0" x2={H / 2} y2={W} />
    <line class="grid" x1={H - 0.5} y1="0" x2={H - 0.5} y2={W} />
    <path d={log} stroke="var(--color-oil)" />
  </svg>
{/if}

<style>
  .sketch {
    display: block;
    overflow: visible;
  }

  .sketch path {
    fill: none;
    stroke-width: 1.5;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .grid {
    stroke: var(--color-border-strong);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  /* The one moment of motion on the page: each sketch draws along its axis */
  .time {
    animation: draw-across 1100ms cubic-bezier(0.3, 0, 0.2, 1) both;
  }

  .depth {
    animation: draw-down 1100ms cubic-bezier(0.3, 0, 0.2, 1) 120ms both;
  }

  @keyframes draw-across {
    from {
      clip-path: inset(0 100% 0 0);
    }
    to {
      clip-path: inset(0);
    }
  }

  @keyframes draw-down {
    from {
      clip-path: inset(0 0 100% 0);
    }
    to {
      clip-path: inset(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .time,
    .depth {
      animation: none;
    }
  }
</style>
