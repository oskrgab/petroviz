# Log view rendering: which approach meets the performance bar?

Research for [#23](https://github.com/oskrgab/petroviz/issues/23), part of the map [#22](https://github.com/oskrgab/petroviz/issues/22). Researched 2026-10-16. Vocabulary (well log, log view, track, curve, curve scale, depth cursor) follows `CONTEXT.md`.

## The question

Which way of drawing the **log view** meets the map's performance bar for a FORCE 2020 well: about 20k samples × about 20 curves across about 10 tracks? The bar has three parts:

- the **depth cursor** runs at 60 fps;
- zoom and pan stay at or above about 50 fps;
- the view is interactive within 1 s of selecting the well.

This note compares Canvas 2D, WebGL and SVG. It covers per-pixel min/max decimation, putting the depth cursor on its own layer, log curve scales and area fills. It then surveys open-source well-log display libraries and checks whether Unovis, which petroviz already ships, fits the job.

## Recommendation

**Use Canvas 2D and write the renderer in the log view module. Do not adopt a library.**

- **One `<canvas>` per track** holds that track's curves and area fills. Redraw a track only when the visible depth interval, the layout or the styling changes.
- **Make the depth cursor a separate DOM element** that moves with a CSS `transform`, plus a readout element. A pointer move updates only these two things. It never repaints a curve.
- **Decimate per pixel with min/max (M4).** When a curve has more visible samples than about 4× the track height in device pixels, keep only the first, minimum, maximum and last sample of each pixel row before drawing. When zoomed in, draw the raw samples.
- **Precompute log values.** For a curve on a logarithmic curve scale, take `log10` of its values once, not on every frame. A reversed curve scale is just a negative slope.
- **Draw area fills as closed `Path2D` polygons.** The polygon runs down one curve and back up the other curve or a baseline. A crossover fill (a different colour depending on which curve is to the left) uses `clip()`. Build each curve's decimated envelope once per frame and reuse it for both the stroke and the fill.

Why not the other approaches:

- **SVG misses the bar.** Building the path strings alone took 29–138 ms per frame in a headless benchmark, before any rendering.
- **WebGL adds nothing at this data size.** About 400k samples decimate to roughly 70k vertices per frame, and Canvas 2D handled that within budget on the CPU alone. WebGL also brings costs: only 1 px line width is guaranteed, it has no text API, it needs context-loss handling, and Chromium caps the number of active contexts.

**Fallback if building it ourselves costs too much: uPlot.** It is MIT licensed and 23 KB gzipped. It draws with Canvas 2D, already does per-pixel min/max decimation, has log scales, fills between series, and a DOM cursor that can be synced across charts. It can also rotate its x scale to vertical. The prototype ticket (#30) could spike it.

**Don't adopt a well-log library.**

- `@equinor/videx-wellog` is the only maintained, framework-agnostic, permissively licensed candidate. It is a credible reference design, but four things pull against the map's module boundary and templates:
  - its data shape is an array of `[depth, value]` tuples;
  - decimation is opt-in;
  - it brings its own legend, scale and track chrome;
  - one `d3-zoom` controller owns all interaction.
- `@webviz/well-log-viewer` needs React and MUI, and is MPL-2.0.
- `wellioviz` renders SVG, is still pre-1.0 (0.0.x) and has had no release since 2024.

**Unovis is not fit for the log view.**

- It renders SVG.
- Its Line, Area and Crosshair components assume the x axis is horizontal. Line also defaults to a curve type that assumes x increases along the data.
- Its Svelte package declares a peer dependency of Svelte 4, and Svelte 5 issues are open against it.
- Keep it for the production dashboard.

**Not yet proven:** the benchmark below rasterised on the CPU, because the headless browser had no GPU. At device pixel ratio (DPR) 2, raster time, not JavaScript, set the frame rate. The prototype (#30) has to confirm zoom and pan at DPR 2 on real hardware with a GPU before the performance bar counts as met.

## Measurements (headless Chromium, this machine)

**How the benchmark was run.**

- **Machine and browser:** a scratch harness ran in Playwright's cached `headless_shell` (HeadlessChrome/133.0.6943.16) on an Intel i7-8700T. The account had no access to `/dev/dri`, so both WebGL and canvas rasterised in software (WebGL reported its renderer as `SwiftShader`).
- **Data:** a synthetic well log of 20,000 samples × 20 curves, drawn in 10 tracks of 2 curves each, every track 160 × 900 CSS px.
- **Timing:** each scenario ran for 120 frames inside `requestAnimationFrame` with a small pan on every frame.
- **Columns in the table:**
  - "JS" is the median time spent in drawing code per frame;
  - "frame" is the median interval between frames;
  - "fps" is 1000 / frame.
- **Device pixel ratio:** DPR 2 used Playwright's `deviceScaleFactor: 2` with the canvases sized to match.

| Scenario | DPR 1: JS / frame / fps | DPR 2: JS / frame / fps |
|---|---|---|
| Canvas 2D, all 400k samples drawn, full well in view | 13.8 ms / 50 ms / 20 | 13.3 ms / 417 ms / 2.4 |
| Canvas 2D, M4-decimated, full well in view | 6.8 ms / 16.7 ms / **60** | 10.7 ms / 133 ms / 7.5 |
| same, log curve scale, `log10` on every frame | 14.5 ms / 16.8 ms / 59.5 | 19.2 ms / 150 ms / 6.7 |
| same, log curve scale, `log10` precomputed | 6.3 ms / 16.7 ms / **60** | 10.0 ms / 133 ms / 7.5 |
| same, plus an area fill between the 2 curves of every track (envelopes computed twice) | 13.4 ms / 33.3 ms / 30 | 19.8 ms / 150 ms / 6.7 |
| Canvas 2D, zoomed to 10% of the well (about 2k samples per curve), raw samples | 1.6 ms / 16.7 ms / **60** | 1.4 ms / 66.7 ms / 15 |
| Depth cursor as a DOM element moved by `transform`, plus a 20-curve readout; curves left alone | ~0 ms / 16.7 ms / **60** | ~0.1 ms / 16.7 ms / **60** |
| Depth cursor on one overlay canvas that is cleared and redrawn | ~0 ms / 16.7 ms / **60** | ~0 ms / 33.3 ms / 30 |
| Depth cursor drawn by redrawing every track (what a separate layer avoids) | 6.7 ms / 16.7 ms / 60 | 10.9 ms / 133 ms / 7.5 |
| SVG, one `<path>` per curve, `d` rebuilt with all samples | 138 ms / 167 ms / 6 | 134 ms / 167 ms / 6 |
| SVG, one `<path>` per curve, `d` rebuilt from M4-decimated samples | 28.6 ms / 33.4 ms / 30 | 52.1 ms / 66.6 ms / 15 |

**What the numbers support:**

- **Decimation halves the drawing cost and keeps a full-well redraw under one frame on the CPU.** At DPR 1 the decimated full redraw kept 60 fps. Drawing every sample ran at 20 fps.
- **SVG fails on its own JavaScript.** The time to build the path strings (28–138 ms) is already over the 16.7 ms frame budget at both DPRs, before any layout or paint.
- **A depth cursor on its own layer is free.** A cursor that moves by CSS transform cost about 0 ms of JavaScript and held 60 fps even at DPR 2. Redrawing every track for each pointer move dropped to 7.5 fps at DPR 2. A composited transform is also cheaper than clearing a full-width overlay canvas: 60 fps against 30 fps at DPR 2.
- **Computing `log10` on every frame doubles the drawing cost; precomputing it removes that cost.**
- **The DPR 2 rows are limited by raster time, not JavaScript.** Drawing code took 10–20 ms, but software rasterisation of four times as many pixels pushed frames to 133–150 ms. With a GPU, browsers usually accelerate canvas, but these numbers do not show that. #30 must measure it.
- **Rendering is not what threatens "interactive within 1 s".** Setting up and drawing all ten tracks the first time took 5–50 ms across all scenarios, so that budget belongs to data loading.

## Evidence per option

### Canvas 2D

- **Layering is the standard fix for a scene where one part changes often and the rest rarely.** MDN's canvas optimisation guide recommends it: "layer your items using multiple `<canvas>` elements" [S1]. The same guide also gives these tips [S1]:
  - batch calls ("draw a polyline instead of multiple separate lines");
  - avoid unnecessary state changes;
  - round coordinates to integers to avoid sub-pixel anti-aliasing work;
  - size the backing store by `devicePixelRatio` and scale the context.
- **Canvas 2D has native line width, dashes, text and `fill`.** Curve styling and the track headers need no extra layer.
- **`clip(path, fillRule)` turns a path into the clipping region** [S15]. That is how a crossover fill shows different colours on either side of a curve.
- **Drawing can move off the main thread if it ever has to.** `HTMLCanvasElement.transferControlToOffscreen()` hands a canvas to a worker. MDN rates it Baseline Widely available since March 2023 [S16]. The measurements above do not need this.
- **Fit with Svelte 5.** A track canvas mounts through an attachment (`{@attach}`): "functions that run in an effect when an element is mounted to the DOM", and they can return a cleanup function. Attachments exist from Svelte 5.29 [S17]. petroviz locks Svelte 5.46.1 [S23].

### WebGL (raw, or through a thin library)

- **Only 1 px lines are guaranteed.** The OpenGL ES reference that WebGL inherits says "Only width 1 is guaranteed to be supported; others depend on the implementation" [S2]. A curve thicker than 1 px therefore needs triangle-strip lines. `webgl-plot` says its thick lines are "nearly 6 times slower than the normal lines" [S4].
- **Chromium caps active WebGL contexts per render process.** The change that added the cap set it at 16 contexts or 16 × 1024 × 1024 cumulative pixels; when either is exceeded "the oldest context will be forcibly lost" [S3]. One context per track would put 10 tracks near that cap, so a WebGL design needs one shared canvas spanning every track. Context loss still has to be handled.
- **WebGL has no text API.** Axes, track headers and readouts would be DOM or Canvas 2D layered on top.
- **Candidate libraries:**
  - `webgl-plot` 1.1.2, MIT, released 2026-02-16, no dependencies: 78.8 KB minified, 18.2 KB gzipped (measured). It handles WebGL line plots, has log-axis support in its newer unified plot class, and works with OffscreenCanvas [S4][S22].
  - `regl` 2.1.1 (120.3 / 40.2 KB) and `twgl.js` 7.0.0 (80.1 / 24.8 KB) are lower-level WebGL helpers (measured) [S22].
- **Not benchmarked.** The headless browser only had SwiftShader, a software WebGL renderer, so any WebGL timing would have been meaningless. The decision does not need it: Canvas 2D already fits the JavaScript budget at this data size.

### SVG

- **Each curve is one `<path>` whose `d` string must be rebuilt for every new depth interval.** The benchmark measured 28–138 ms just to build those strings for 20 curves (table above), which is over budget before layout or paint.
- **Panning by transforming a group instead avoids the rebuild, with limits.** `vector-effect="non-scaling-stroke"` keeps the stroke width constant under non-uniform scaling [S5]. But per-pixel decimation can then no longer apply, so every sample is rasterised on every frame. The same is true of any SVG-based charting library, including Unovis (below).

### Decimation

- **M4 is pixel-perfect with at most 4w samples.** Jugel et al. prove that "the pixel-column-wise selection of these four tuples [first, min, max, last] is required to ensure an error-free two-color (binary) line visualization". From that they derive an upper bound of 4·w samples for a plot w pixels wide [S6]. In a log view depth runs vertically, so the pixel *rows* of a track play the role of columns.
- **Plain min/max per bucket can be wrong.** The same paper shows it "does not guarantee an error-free line visualization", because it drops the first and last samples of each group [S6].
- **Mature libraries use the same idea:**
  - uPlot's linear path builder decimates whenever "number of points >= 4x available pixels". For each pixel it emits the in, min, max and out values [S8].
  - Chart.js's decimation plugin offers a min-max mode that "will preserve peaks in your data but could require up to 4 points for each pixel". Its LTTB mode is for "showing trends", which is the wrong trade-off for a log, where a thin bed is a peak [S7].
- **The gain is large.** At the full-well zoom, 20k samples fall to at most 4 × 900 = 3,600 per curve at DPR 1. In the benchmark the drawing cost halved.

### Depth cursor on its own layer

- **Only `transform` and `opacity` changes skip layout and paint.** web.dev: "Today there are only two properties for which that is true – transforms and opacity". Promote the element with `will-change`, but "don't overdo it" [S13].
- **uPlot works this way.** Its cursor lines are `div`s moved with `style.transform = "translate(...)"` [S11], and the readout is DOM. So a cursor move never touches the plot canvas.
- **The readout is cheap.** Finding each curve's value at the cursor's depth is a binary search on the shared depth array. Doing it for 20 curves on every frame did not register in the benchmark.
- **Coalesce pointer events to one update per frame** with `requestAnimationFrame`, as MDN recommends for animation [S1].

### Log curve scales

- **A log curve scale is a per-sample transform before drawing.** Precompute `log10` of each log-scaled curve once (see the measurements); after that, a log curve scale draws exactly like a linear one.
- **The domain must not include zero.** "a log scale domain must be strictly-positive or strictly-negative; the domain must not include or cross zero" [S14]. Values at or below zero need a rule. uPlot clamps them during positioning, by default to `scaleMin / 10` [S10]. That rule belongs to the data-quality question on the map.
- **A reversed curve scale (left value larger than right) is just a negative slope.** Any renderer that maps through an affine transform gets it for free.

### Area fills

- **A fill is one closed path.** The path runs down curve A and back up curve B, or along a constant baseline, and is filled.
- **A crossover fill uses two clipped fills, one per side.** With Canvas 2D, clip to one side of curve B with `clip(path)` [S15], fill the polygon, then do the same for the other side.
- **Reusing the decimated envelopes is cheap.** Built once per frame, the same envelopes serve both the stroke and the fill. The benchmark's fill row computed them twice and still drew in 13.4 ms at DPR 1.
- **The libraries handle fills like this:**
  - uPlot exposes fills between two series as `bands`, with a `dir` that fills toward one side [S10];
  - `@equinor/videx-wellog` has a `DifferentialPlot` that colours the segments between two curves "according to the series relative position (left/right) of each other" [S18].

## Open-source well-log display libraries

`npm search` for "well log", "welllog", "well-log", "las viewer" and "petrophysics" returned three display libraries [S22]. The rest were parsers, such as `wellio`, `las-js` and a DLIS parser. A GitHub search for JavaScript and TypeScript well-log viewers found only applications, not reusable libraries.

Bundle sizes were measured by bundling each package's public entry point with esbuild (`--bundle --minify --format=esm --platform=browser`) and gzipping the output at level 9.

| Package | License | Latest release | Maintenance | Bundle (min / gzip) | Renders with | Svelte 5 fit | Takes an arbitrary in-memory well log? |
|---|---|---|---|---|---|---|---|
| `@equinor/videx-wellog` | MIT | 1.6.8, 2026-10-05 | Active: commits in Oct 2026, 32 stars, 19 open issues | 130.7 / 42.3 KB. Named imports don't shrink it; no `sideEffects` flag | Canvas 2D for graph tracks; WebGL2 for distribution and colour-strip tracks; d3 for scales and zoom | Good mechanically: vanilla TS classes mounted on a DOM element, so an attachment works | Yes. A track's `data` is an async function, and plots read arrays of `[depth, value]` tuples. 20 curves × 20k samples would mean converting columnar arrays to tuples |
| `@webviz/well-log-viewer` | MPL-2.0 (file-level copyleft) | 3.0.11, 2026-10-15 | Active (monorepo release commits Oct 2026) | Not measured: peer dependencies on `react`, `react-dom`, `@mui/material` and `@mui/icons-material` | Wraps `@equinor/videx-wellog`, pinned to `^0.11.3` while that package is at 1.6.8 | Poor: needs React and MUI inside a Svelte app | Partly. It takes an in-memory object, but only in the JSON Well Log Format shape (`header`, `curves`, row-major `data`) |
| `wellioviz` | Apache-2.0 | 0.0.34, 2024-06-24 (the one before: 2022-03-16) | Low: the last commit was a 2026-02 dependency bump; 67 stars | 336.7 / 111.9 KB. It pulls in all of d3 v7, and `fs` had to be marked external to bundle it | SVG via d3 | Vanilla, but SVG and pre-1.0 | It takes `wellio` JSON converted from LAS, or a "sparse" JSON; not columnar |

Evidence: [S18] (videx-wellog source, README, CHANGELOG), [S19] (well-log-viewer package.json, `WellLogTypes.ts`, `Intro.mdx`), [S20] (wellioviz README and package.json), [S22] (npm and GitHub metadata, measured sizes).

**Notes on `@equinor/videx-wellog`, the only real candidate:**

- **What it covers.**
  - It has the track kinds the map asks for: graph tracks with line, step, area, dot and differential plots, plus scale, dual-scale, stack, distribution, colour-strip and marker tracks.
  - Log scales come from d3's `scaleLog` [S18].
  - An `InterpolatedScaleHandler` converts between "MD <==> TVD" domains, which matches the depth reference toggle [S18].
  - It offers both min/max `downsample` and mean `resample` helpers, but only as a track `transform` that the caller wires up ("typically used to downsample data at low zoom levels") [S18].
- **Where it pulls against the map.** By default a graph track clears and redraws every plot on each rescale [S18], and pan and zoom belong to one `d3-zoom` behaviour on the `LogViewer` [S18]. The log view would still own:
  - the depth cursor;
  - templates;
  - theming;
  - the overview strip;
  - the exact-interval input.
  
  At that point the library adds mainly its track and plot classes, which replace a modest amount of drawing code we would otherwise write (a few hundred lines, by estimate), and costs 42 KB gzipped, a tuple data shape and a second interaction model. It is worth reading as a reference design. It is not worth taking as a dependency.

**Generic engine, not a well-log library: `uPlot`.**

- **Package facts:** MIT, 1.6.32 released 2025-03-14, repository commits in Oct 2026, 10.5k stars; 51.4 / 22.9 KB measured [S9][S22].
- **What fits:**
  - It draws with Canvas 2D [S9].
  - It decimates with min/max per pixel [S8].
  - It has log scales (`distr: 3`) [S10].
  - It fills between series with bands [S10].
  - Its cursor is a DOM element and can sync across charts [S9][S11], so ten tracks could be ten synced instances.
  - It accepts columnar typed arrays (`AlignedData`), which matches a well log with one shared depth array [S10].
  - Setting `scales.x.ori: 1` turns depth vertical; the linear path builder has a branch for vertical orientation [S8][S10], and the orientation demo exercises it [S12].
- **Gaps:**
  - It has no built-in drag pan; the README sends you to plugin demos for wheel and touch zoom [S9].
  - The listed Svelte wrapper `uplot-svelte` declares a peer dependency of Svelte 4 [S22], so petroviz would mount uPlot directly through an attachment.
  - Gaps in a curve have to be `null`, which a typed array can't hold [S8].

## Is Unovis fit for the log view?

No. petroviz depends on `@unovis/ts` and `@unovis/svelte` `^1.5.0`; the lockfile resolves them to 1.6.2, and the latest release is 1.7.1 [S22][S23]. Five things rule it out:

- **It renders SVG.** The base container appends an `<svg>` [S21]. The SVG cost above applies, and the library has no decimation.
- **It assumes the x axis is horizontal.**
  - Line builds its path with d3's `line().x().y()`, and Area with `area().x().y0().y1()`, so area fills run vertically. A log view needs horizontal fills between curves at the same depth [S21].
  - Crosshair finds the nearest datum with `xScale.invert` of the pointer's x [S21]. The depth cursor is a horizontal line keyed on depth.
  - Plotting depth on x would lay the log on its side.
- **Its defaults fight a log.** Line defaults to `CurveType.MonotoneX`, a d3 curve that preserves monotonicity in y "assuming monotonicity in x" [S24], and to a 600 ms update transition [S21].
- **Its Svelte package declares Svelte 4.** `@unovis/svelte` 1.7.1 declares `svelte: ^4.0.0` (the locked 1.6.2 declares `^3.48.0 || ^4.0.0`) [S21][S23]. Issues titled "Svelte 5: Reactivity is not triggered when changing data", "Svelte 5 Infinite Effect / Reactive Loop", "Svelte 5 Components Rendered After Destruction", "Multiple XY components and Svelte 5" and "Svelte: Runes mode?" are open [S21].
- **Reusing it would not even save bundle size.** The subset needed (XYContainer, Line, Area, Axis, Crosshair) bundles to 199.6 / 66.1 KB [S22], while `d3-scale` plus `d3-shape` alone is 27.5 / 10.8 KB.

It remains fine for the production dashboard.

## Sources

- **[S1]** MDN, *Optimizing canvas*: https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas
- **[S2]** Khronos, OpenGL ES 3.0 reference, `glLineWidth`: https://registry.khronos.org/OpenGL-Refpages/es3.0/html/glLineWidth.xhtml
- **[S3]** Chromium code review 14217005, "Limit the number of WebGL contexts that are active at any given time": https://codereview.chromium.org/14217005/
- **[S4]** `webgl-plot` README: https://github.com/danchitnis/webgl-plot/blob/webglplot-v2/README.md (and `src/UnifiedLinePlot.ts`, `src/LogAxisUtils.ts` in the same repository)
- **[S5]** MDN, `vector-effect`: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/vector-effect
- **[S6]** U. Jugel, Z. Jerzak, G. Hackenbroich, V. Markl, "M4: A Visualization-Oriented Time Series Data Aggregation", PVLDB 7(10), 2014: https://www.vldb.org/pvldb/vol7/p797-jugel.pdf
- **[S7]** Chart.js documentation, *Data Decimation*: https://www.chartjs.org/docs/latest/configuration/decimation.html
- **[S8]** uPlot source, linear path builder: https://github.com/leeoniya/uPlot/blob/master/src/paths/linear.js
- **[S9]** uPlot README: https://github.com/leeoniya/uPlot/blob/master/README.md
- **[S10]** uPlot type definitions (`Scale.distr`, `log`, `clamp`, `ori`, `dir`, `Band`, `AlignedData`): https://github.com/leeoniya/uPlot/blob/master/dist/uPlot.d.ts
- **[S11]** uPlot source, cursor elements and `elTrans`: https://github.com/leeoniya/uPlot/blob/master/src/dom.js, https://github.com/leeoniya/uPlot/blob/master/src/uPlot.js
- **[S12]** uPlot demo, scale direction and orientation: https://github.com/leeoniya/uPlot/blob/master/demos/scales-dir-ori.js
- **[S13]** web.dev, *Stick to compositor-only properties and manage layer count*: https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count
- **[S14]** d3-scale documentation, log scales: https://d3js.org/d3-scale/log
- **[S15]** MDN, `CanvasRenderingContext2D.clip()`: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/clip
- **[S16]** MDN, `HTMLCanvasElement.transferControlToOffscreen()`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/transferControlToOffscreen
- **[S17]** Svelte documentation, `{@attach ...}`: https://svelte.dev/docs/svelte/@attach
- **[S18]** `@equinor/videx-wellog` source, default branch `dev`: https://github.com/equinor/videx-wellog
  - `README.md`, `src/readme.md`, `CHANGELOG.md`, `package.json`;
  - `src/plots/readme.md`, `src/plots/line-plot.ts`, `src/plots/plot.ts`;
  - `src/tracks/canvas-track.ts`, `src/tracks/graph/graph-track.ts`, `src/tracks/graph/interfaces.ts`, `src/tracks/graph/factory.ts`;
  - `src/utils/data-helper.ts`, `src/ui/overlay.ts`, `src/ui/log-controller.ts`;
  - `src/scale-handlers/interpolated-scale-handler.ts`.
- **[S19]** `@webviz/well-log-viewer` source: https://github.com/equinor/webviz-subsurface-components/tree/master/typescript/packages/well-log-viewer
  - `package.json`;
  - `src/components/WellLogTypes.ts`;
  - `src/Intro.mdx`.
- **[S20]** `wellioviz` source, default branch `release`: https://github.com/JustinGOSSES/wellioviz (`README.md`, `package.json`)
- **[S21]** Unovis source: https://github.com/f5/unovis
  - `packages/ts/src/core/container/index.ts`, `packages/ts/src/core/component/config.ts`;
  - `packages/ts/src/components/line/config.ts`, `packages/ts/src/components/line/index.ts`;
  - `packages/ts/src/components/area/index.ts`, `packages/ts/src/components/crosshair/index.ts`;
  - `packages/ts/src/types/scale.ts`, `packages/svelte/package.json`.

  Issues:
  - https://github.com/f5/unovis/issues/379
  - https://github.com/f5/unovis/issues/484
  - https://github.com/f5/unovis/issues/488
  - https://github.com/f5/unovis/issues/500
  - https://github.com/f5/unovis/issues/557
- **[S22]** npm registry metadata (`npm view <pkg>`: version, license, release times, dependencies, peer dependencies) and the GitHub REST API (`repos/<owner>/<repo>` and its commits) for every package named here, queried 2026-10-16. Bundle sizes were measured with esbuild 0.28.2 as described above, using `uplot@1.6.32`, `@equinor/videx-wellog@1.6.8`, `webgl-plot@1.1.2`, `regl@2.1.1`, `twgl.js@7.0.0`, `wellioviz@0.0.34` and `@unovis/ts@1.7.1`.
- **[S23]** This repository: `package.json`, `pnpm-lock.yaml`.
- **[S24]** d3-shape documentation, curves (`curveMonotoneX`): https://d3js.org/d3-shape/curve
