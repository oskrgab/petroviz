# The well log is columnar on one depth index

A well log is a plain, immutable data object. Every curve and depth reference is an array of the same length *n*, aligned to one strictly increasing MD array, and NaN is the only way to say "no value". The `WellLog` type is the seam between sources and the log view: there is no shared log adapter interface, and each adapter is its own function, `(input, { signal }) => Promise<WellLog>`. This was decided in [#27](https://github.com/oskrgab/petroviz/issues/27).

## Why

- **Both first sources are single-index.** A LAS file has one `~A` table, and FORCE 2020 has one row per sample. A shared index makes the depth cursor readout a single binary search, and lets TVDSS, zones and every curve be looked up by row.
- **Depths are stored, never computed.** FORCE 2020 has 153 holes across 50 wells, and LAS allows STEP = 0, so STRT/STEP cannot describe the index.
- **One rule breaks a line.** The adapter inserts a single all-NaN row at each depth gap. A 269 m hole is therefore handled by the same rule as a missing value, and no renderer needs its own gap-detection heuristic. Only the adapter knows its sampling well enough to tell a gap from a normal step.
- **The seam is the data, not the adapter.** The FORCE adapter takes a well id, a fetch and a byte cache, while the LAS adapter takes a `File`. A common interface over inputs that different would be a hypothetical seam. The log view accepts a `WellLog` and nothing else, which is what keeps it ignorant of the source.

## Shape, in brief

- MD is `Float64Array`, required and strictly increasing. TVDSS is optional, `Float64Array`, positive down and NaN where unknown. There is one depth unit per well log (`m` or `ft`), never converted.
- Where TVDSS is present, it is strictly increasing over its non-NaN samples. An adapter whose source breaks this drops TVDSS and records a load warning, so no renderer ever has to draw a fold. All 108 FORCE 2020 wells meet the rule once sorted by MD, and FORCE 2020 is the only TVDSS source in scope, because a LAS `TVD` column stays an ordinary curve. Added by [#31](https://github.com/oskrgab/petroviz/issues/31).
- Curve values are `Float32Array`. Precision is far beyond what the display shows, and big LAS files take half the memory. Discrete curves hold integer codes in the same array, plus an optional code → label table. Colour and pattern are styling and do not live here.
- Zone sets are separate lists of `{ name, top, base }` in MD. They are not a tree, and a zone is not keyed by its name.
- The gap row sits at the last sample's MD plus the nominal step: 0.152 m for FORCE 2020, the median step for LAS. That always falls inside the gap, because a gap is longer than 1.5 steps. A zone's base is the MD of the first row after its run, gap rows included, so a zone and a discrete block end at the same depth. A gap row alone doesn't end a run, though: when the same name resumes after a gap, it is one zone across the gap ([#37](https://github.com/oskrgab/petroviz/issues/37)). At the end of the data, the base is the last sample's MD. The log view shows a gap wherever no curve has a value: it reads the NaN rows, never the step sizes. Added by [#34](https://github.com/oskrgab/petroviz/issues/34).
- Every curve has at least one value. An adapter leaves out a curve that has none, and `checkWellLog` rejects one. A first-match template selector can then never pick an empty `GR` over a usable `GR:2`. Added by [#34](https://github.com/oskrgab/petroviz/issues/34).
- Each adapter removes sentinels on its own terms (never on depth references) and records load warnings. Derived buffers such as log10 and decimation belong to the renderer.
- Load warning codes are a closed set, and each code has a fixed severity: a note when nothing was lost, a caution when data was dropped or the adapter assumed something. Added by [#34](https://github.com/oskrgab/petroviz/issues/34).

## Considered options

- **A depth basis per curve** (as welly does). This is more general, but no source in scope needs it, and it would make every readout and fill a resampling problem. A future multi-basis source resamples onto one index inside its adapter.
- **Leaving gaps to the renderer** (break a line where a step is much larger than the typical step), or **listing gaps explicitly** in the well log. Both push sampling knowledge out of the adapter and add a second "missing" mechanism next to NaN.
