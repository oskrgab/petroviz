# Volve well logs in the log view: design notes

Working notes from a design session on 2026-11-15. The session is unfinished: this file records what was found, what was agreed, what was measured and what is still open, so the next session can pick it up. Nothing here is implemented, and no tickets or ADRs have been written yet.

## Goal

petrodb now publishes well logs for the Volve dataset. The **well logs** visualization should show them next to FORCE 2020: a way to choose the dataset, the Volve wells in the well picker, and a simple **template** that combines **input curves** and **interpreted curves**.

## Where things stand

- **Agreed:** Q1 to Q13 below.
- **Asked, not yet answered:** Q14 to Q17.
- **Not yet asked:** the smaller items under [Still to settle](#still-to-settle).
- **Glossary:** `CONTEXT.md` on this branch carries three edits made during the session (see [Glossary changes](#glossary-changes)).
- **Next steps once the open questions close:** write the ADRs listed under [ADRs to write](#adrs-to-write), then turn the decisions into tickets. The petrodb change comes first.

## What was found

### The log view today

- The logs page (`src/routes/logs/+page.svelte`) reads only FORCE 2020, plus LAS files opened from disk. It imports the FORCE 2020 **log adapter** directly; no dataset is chosen anywhere in the app.
- It does not use DuckDB. The FORCE 2020 adapter (`src/lib/sources/force2020/`) fetches one whole file per well and decodes it with hyparquet and fzstd. ADR-0005 gave logs its own route so that opening a well never waits for DuckDB to start. Earlier research ([force-parquet-reading](https://github.com/oskrgab/petroviz/blob/research/force-parquet-reading/docs/research/force-parquet-reading.md)) measured that start-up at 1.4 to 1.9 s plus 0.1 to 0.5 s for `httpfs`.
- The catalog (`src/lib/config/catalog.js`) lists `force_2020` as the only dataset of the well logs visualization. It drives the **welcome page** and the header, not loading.
- The well list is the manifest `force_2020/wells/_files.json`. A link names a well by its file stem (`well=34-10-16_R`), and the display name is derived from it (ADR-0005). ADR-0005 already says another petrodb dataset with logs adds a `dataset` parameter that defaults to FORCE 2020.
- There is one built-in template, `defaultTemplate()` in `src/lib/welllog/view/template/defaults.ts`. It matches curves by **curve family**, and it carries FORCE 2020 assumptions: zone sets named `GROUP` and `FORMATION`, and the FORCE 2020 lithology codes.
- One **current template** is kept in the browser (`petroviz.logs.template`) and shared by every well and every opened file.
- No test touches the network. Adapters are tested against small fixture files.

### The Volve log data in petrodb

- **One published table.** `volve/petrophysical_interpretation.parquet` on the **Data host**: 20,269,028 bytes, 483,450 rows, 58 columns, one row group, SNAPPY, written by DuckDB 1.5.2. It is wide: one row per depth sample, one column per curve, sorted by wellbore then depth.
- **Keys.** `npd_wellbore_code` (integer), `source_wellbore` (text, such as `15/9-F-1 A`), `depth_md` (metres). The primary key is `(source_wellbore, depth_md)`.
- **21 source wellbores on 20 register codes.** `15/9-F-11` and its technical sidetrack `15/9-F-11 T2` share one code. `15/9-F-11` itself is a 158 m top-hole section with no interpreted curves. Seven Volve wellbores have no logs yet.
- **A curve catalog.** `volve/log_curves.parquet` (443 rows) lists, per wellbore and mnemonic: `curve_kind` (`input` or `interpreted`), `unit`, `source_unit`, first and last depth, sample count and source file.
- **Input curves (28 mnemonics).** GR, NPHI, RHOB, RT, RD, DRHO, DT, CALI, PEF, BS, RS, RM, DTS, ROP, and LWD curves (azimuthal density, propagation resistivities, near-bit gamma ray). These are the interpreter's curated inputs, not the logs as recorded. The recorded logs (LWD, composite and other log types) are not published yet.
- **Interpreted curves (27 mnemonics).** KLOGH, VSH and SAND_FLAG on 20 wellbores; PHIF, SW, BVW and COAL_FLAG on 19; CARB_FLAG on 15; a tail of curves on one to five wellbores. The three flags count as `input` in `15/9-F-12` only.
- **What it lacks.** No TVDSS, no coordinates, no zones or formation tops, no lithology codes, no deviation surveys. Volve is MD only.
- **Depth.** Each wellbore is already on one depth index, stepping 0.1 m or 0.1524 m depending on the source. Nothing is resampled. Sentinels are already NULL.
- **Layout decision upstream.** petrodb's ADR-0012 chose the single row group by measuring two queries through DuckDB with one thread and 80 ms per request: three curves for one wellbore, and three curves for every wellbore. It assumed the log viewer reads through DuckDB. It did not measure "every curve of one wellbore", which is what the log view asks. The script behind that ADR is not in the petrodb repo.
- **Licence.** petroviz's `LICENSE-VOLVE-DATA.md` says CC BY-NC-SA 4.0 and covers production only. petrodb's file describes the operator's open data licence: based on CC BY 4.0, the data may not be sold, and the operator and the former licence partners must be credited. Which is current was not checked against the operator's page.

### How today's curve families treat the Volve mnemonics

Run against `src/lib/welllog/core/families.ts`:

| Mnemonic | Family today | Via |
|---|---|---|
| GR, NPHI, RHOB, DRHO, DT, DTS, CALI, PEF, BS, ROP, RS | the expected family | mnemonic table |
| RT | `resistivity-deep` | mnemonic table |
| RD, RM, RACEHM, RACELM, RPCEHM, RPCELM, RW | `resistivity-unknown-depth` | unit fallback |
| NBGRCFM, GRMAX, GRMIN | `gamma-ray` | unit fallback |
| ROP5_RM | `rop` | unit fallback |
| KLOGH, KLOGV, VSH, PHIF, SW, BVW, VCARB, PHID, the flags, the azimuthal densities | `unknown` | none |

## Decisions agreed

| # | Decision |
|---|---|
| Q1 | Petroviz adopts petrodb's terms **input curve** and **interpreted curve**; "raw" is avoided. This work covers only the petrophysical interpretation table. The recorded logs wait until petrodb publishes them. |
| Q2 | The well picker lists all 21 source wellbores by source wellbore name, each as its own **well log**, with no hand-picked exclusions. A link names a well the way FORCE 2020 does: `15/9-F-1 B` is `well=15-9-F-1_B`. |
| Q3 | The dataset is chosen with a FORCE 2020 / Volve switch at the top of the well picker. It changes which list is shown; the dataset on screen changes only when a well is picked. The welcome page's Volve entry opens `/logs?dataset=volve`. |
| Q4 | Each dataset names its own **default template**. A Volve well opens with the combined input-and-interpreted one. |
| Q5 | The well log does not record whether a curve is input or interpreted. The cost: the curve picker cannot group curves that way. It can come later. |
| Q6 | Each flag (SAND_FLAG, COAL_FLAG, CARB_FLAG, BADDATA_FLAG, PERF_FLAG) becomes its own discrete curve with labelled codes. They are not merged into an invented lithology curve. |
| Q7 | Correcting `LICENSE-VOLVE-DATA.md` and extending it to well logs is a separate small ticket. The current terms are verified against the operator's page first. |
| Q8 | petrodb republishes the interpretation table with one row group per wellbore, and petroviz reads one wellbore's row group at a time. The petrodb change lands first, and reopens its ADR-0012 with the measurements below. No whole-file version ships in the meantime. A multi-well view is out of scope. See Q15: this was agreed before the custom-query plan came up. |
| Q9 | Each dataset keeps its own current template. Opened LAS files keep the existing general one. Switching wells inside a dataset keeps the layout; crossing datasets shows the other dataset's layout. |
| Q10 | The new template is a general interpretation template inside the well log module, matching by curve family, which the Volve dataset names as its default. It needs new curve families for shale volume, porosity, water saturation, bulk volume water and permeability, and RD and RM join the deep and medium resistivity families. |
| Q11 | The template has the eight tracks below, with no sonic, drilling, LWD or flag tracks. Flags stay available in the curve picker. |
| Q12 | `/logs?dataset=volve` with no well opens `15/9-F-15 C`, on the whole well like any other. |
| Q13 | Two housekeeping tickets: petrodb's site gains a link from Volve to `/logs?dataset=volve`, and petroviz's pre-deploy source check gains the two Volve log tables. |

### The interpretation template (Q11)

| # | Track | Curves | Scale |
|---|---|---|---|
| 1 | Gamma ray and caliper | GR, CALI, BS | as the default template |
| 2 | Depth | | |
| 3 | Resistivity | RT or RD, RM, RS | logarithmic, as the default template |
| 4 | Density and neutron | RHOB, NPHI, crossover fill | as the default template |
| 5 | Shale volume | VSH, filled | 0 to 1 |
| 6 | Porosity | PHIF and BVW, fills for hydrocarbon and water | 0.5 to 0 |
| 7 | Water saturation | SW | 1 to 0 |
| 8 | Permeability | KLOGH | logarithmic, 0.1 to 10,000 mD |

Tracks 1 to 4 are input curves and 5 to 8 interpreted.

### Why `15/9-F-15 C` (Q12)

Eight wellbores carry every curve in the template. Seven of them run from about 146 m to total depth, so the interpreted tracks would be nearly empty on the first screen: in `15/9-F-11 A` the interpreted curves span 3,575 to 3,737 m of a well running 188 to 3,762 m. In `15/9-F-15 C` they span 2,910 to 3,218 m of a well running 2,560 to 3,222 m, and it lacks only bit size. Checked against `log_curves`.

## Open questions

Asked in the session, with the recommended answer, and not yet answered.

**Q14. Engine for the log view.** Should opening a well stay on hyparquet, with DuckDB-WASM kept off `/logs` in this work, and a background preload of DuckDB left as a decision for the custom-query work?

- Recommended: yes.
- Context: future petroviz work is planned to let users write their own queries, which needs DuckDB-WASM. The idea raised was a single engine for everything, loaded quietly from the welcome page so it is ready when the user moves to production or logs.
- Why keep both: opening a well is a fixed read of every curve of one wellbore, and DuckDB-WASM is about five times slower at it on the better layout (6.3 s against 1.3 s, see below). A link straight to `/logs?well=…` never passes the welcome page, so it would wait for the engine. Making the view fast on DuckDB means fetching only the curves on screen, which rewrites ADR-0002 and the FORCE 2020 adapter.
- The preload itself fits the custom-query work: start the engine in the background once the page is drawn. Every visitor then downloads it (the engine is about 7.6 MB gzipped, plus a worker script and extensions).

**Q15. Does Q8 still stand, given custom queries?** Should petrodb still move to one row group per wellbore?

- Recommended: yes.
- The trade: every well opened today (1.3 s against 7.6 s) against future SQL across every well (8.5 s against 2.6 s in DuckDB-WASM). SQL on one well gets faster (1.2 s against 2.8 s).
- An unknown that could remove the penalty: native DuckDB 2.0.0 sends its requests in parallel and ran the every-well query in 0.94 s on the per-wellbore layout, against 5.3 s on 1.5.2. DuckDB-WASM 1.32.0 still ships DuckDB 1.4.3.

**Q16. Switching templates by hand.** Should the template menu list both built-in templates, so the interpretation template can go on a LAS file or the general one on a Volve well, with "Reset" returning to that dataset's default?

- Recommended: yes.

**Q17. The existing saved template.** Today one saved template serves FORCE 2020 and opened files. Once each dataset keeps its own, should the existing one stay with opened files and be copied once to FORCE 2020, so nobody's layout disappears?

- Recommended: yes.

## Still to settle

Not yet asked. Each has a proposed default.

- **Order of Volve wells in the picker.** FORCE 2020 groups by quadrant; every Volve well is in 15/9. Proposed: a flat list sorted by name.
- **An unknown `dataset` in a link.** Proposed: a message and the picker, never a fallback, as for an unknown well (ADR-0005).
- **Names of the two built-in templates.** The existing one is called "Default".
- **Resistivity when a well has both RT and RD.** Both would be deep resistivity. Which one the template entry shows needs a rule.
- **Flag labels and colours.** What the codes 0 and 1 are called for each flag, and how a flag's discrete track is coloured.
- **Fill colours** for the shale volume and porosity tracks.
- **Units.** From `log_curves` (per wellbore) or from Volve's `schema.json` on the **Schema host** (as FORCE 2020 does).
- **Cache key.** The Data host does not expose `X-Repo-Commit` to a browser on Parquet responses, only on the 302 before them. `etag` is readable. See the measurements for why the adapter must keep its own cache.
- **Gap rows.** The nominal step differs by wellbore (0.1 m or 0.1524 m). Proposed: the median step, as the LAS adapter does.
- **Test fixture.** A small Volve file in the new layout, checked in, so adapter tests stay off the network.
- **Smaller wiring.** The header's dataset line for Volve, the `dataset` property on the `well-opened` analytics event, the catalog entry, and the wells that open with mostly empty interpreted tracks (the top-hole section, and the 15/9-19 wellbores that lack most input curves).
- **The petrodb ticket's own choices.** Compression (see file sizes below), data page size, whether to keep the bloom filters, and how its DuckDB-based writer produces per-wellbore row groups. The layouts measured here were written with pyarrow.

## Measurements

Three runs, all on 2026-11-15, on one low-power 6-core desktop with other work running. Scripts and raw results are in [`volve-well-logs/`](volve-well-logs/); they are copied as they ran and contain absolute paths from that machine.

### Run 1: the published file with hyparquet

Scripts in `volve-well-logs/src/single-row-group/`. Node 24.20, hyparquet 1.32.0, headless Chromium 156, against the live Data host.

File facts:

| Fact | Value |
|---|---|
| Row groups | 1 |
| Data pages per column chunk | 1 (483,450 values each) |
| Column index, offset index | absent |
| Column chunks, compressed | 18,459,470 B |
| Dictionary pages | 55, totalling 5,805,855 B compressed |
| Bloom filters | 1,802,757 B, never read by either reader in these tests |
| Footer | 6,789 B |

Findings:

- **A wellbore cannot be read on its own.** hyparquet's `rowStart` and `rowEnd` only skip whole pages, and each column is one page. Reading one wellbore fetches and decodes each of its columns for all 21 wellbores.
- **Bytes per wellbore**, own columns only: 3.07 MB minimum, 11.09 MB median, 17.41 MB maximum, in 5 to 15 requests. The file is 20.27 MB.
- **Decode in Chromium:** 0.45 to 0.52 s for a 20-column wellbore, 0.76 to 0.87 s for a 34-column one, 1.1 to 1.2 s for all 58 columns.
- **Memory:** decoding a wellbore's columns peaked at 420 to 550 MB in Node.
- **Over the network** (Chromium, live host, about 10.8 MB/s): range reads of one large wellbore took about 2.2 s; one whole-file GET plus decode took about 2.7 s.
- **Data host headers:** `Range` is honoured; CORS allows any origin; every request is a 302 then the response. `X-Repo-Commit` is on the 302 only, so a browser cannot read it for Parquet files. `_files.json` still carries it.
- **FORCE 2020 for comparison:** 108 files, 134 kB minimum, 767 kB median, 1.88 MB maximum.

### Run 2: alternative layouts, both readers

Scripts in `volve-well-logs/src/layouts/`. The same table was rewritten in each layout and checked equal to the published file. A local server added 80 ms before every response and, where stated, a shared 20 Mbit/s cap.

| Layout | What it is | Size |
|---|---|---|
| L1 | the published file | 20.27 MB |
| L1p | one row group, pages of at most 20,000 rows, no page index | 18.12 MB |
| L2 | one row group per wellbore (21), SNAPPY, dictionary on | 24.13 MB, footer 115 kB |
| L2z | L2 with ZSTD and no dictionary on the curve columns | 16.53 MB (size only; not read) |
| L3 | one row group, 20,000-row pages, no dictionary, page index | 23.13 MB |
| L4 | one file per wellbore | 24.23 MB in total |

Queries:

- **QA:** every curve of one wellbore: `15/9-F-1 B` (33,191 rows, 34 columns) and `15/9-19 BT2` (3,162 rows, 16 columns).
- **QB:** nine template curves plus depth, for 4 wellbores and for all 21.
- **QC:** every curve of 4 wellbores.

hyparquet in Chromium over HTTP/2, with parallel range requests. Every row except L4 includes hyparquet's HEAD and a 512 kB read of the file's tail.

| Query | Layout | Requests | MB | At 80 ms | At 80 ms and 20 Mbit/s | Decode | Peak memory |
|---|---|---|---|---|---|---|---|
| QA, large well | L1 | 15 | 17.93 | 1.45 s | 7.56 s | 0.86 s | 449 MB |
| QA, large well | L1p | 15 | 17.57 | 0.55 s | 7.36 s | 0.12 s | 198 MB |
| QA, large well | L2 | 3 | 2.15 | 0.45 s | 1.31 s | 0.07 s | 145 MB |
| QA, large well | L3 with offset index | 38 to 72 | 2.48 | 0.45 to 0.59 s | 1.28 to 1.36 s | 0.08 s | 150 MB |
| QA, large well | L4 | 1 | 1.64 | 0.23 s | 0.92 s | 0.06 s | 142 MB |
| QA, small well | L1 | 7 | 3.59 | 0.82 s | 1.91 s | 0.32 s | 275 MB |
| QA, small well | L2 | 3 | 0.71 | 0.36 s | 0.64 s | 0.01 s | 111 MB |
| QA, small well | L4 | 1 | 0.19 | 0.14 s | 0.21 s | 0.01 s | 107 MB |
| QB, 4 wells | L1 | 7 | 8.11 | 0.71 s | 3.62 s | 0.29 s | 284 MB |
| QB, 4 wells | L2 | 6 | 2.90 | 0.45 s | 1.54 s | 0.08 s | 155 MB |
| QB, 4 wells | L4 | 4 | 6.36 | 0.26 s | 2.71 s | 0.07 s | 162 MB |
| QB, 21 wells | L1 | 7 | 8.11 | 0.77 s | 3.63 s | 0.31 s | 315 MB |
| QB, 21 wells | L2 | 23 | 11.43 | 0.69 s | 4.90 s | 0.32 s | 297 MB |
| QB, 21 wells | L3 with offset index | 190 to 378 | 19.0 | 0.97 to 1.12 s | 7.9 to 8.0 s | 0.48 s | 332 to 340 MB |
| QB, 21 wells | L4 | 21 | 24.23 | 0.55 s | 9.86 s | 0.30 s | 261 MB |
| QC | L1 | 21 | 18.09 | 1.67 s | 7.70 s | 1.25 s | 515 MB |
| QC | L2 | 7 | 6.84 | 0.61 s | 3.13 s | 0.21 s | 241 MB |
| QC | L4 | 4 | 6.36 | 0.41 s | 2.77 s | 0.22 s | 239 MB |

Bytes for QA across all 21 wellbores, own columns only: L1 3.07 / 11.09 / 17.41 MB (minimum / median / maximum); L2 0.06 / 1.16 / 3.14 MB; L4 0.07 / 1.17 / 3.15 MB.

DuckDB over the same server. "WASM" is DuckDB-WASM 1.32.0 (DuckDB 1.4.3) in Chromium with petroviz's own setup; start-up is not included. Times are at 80 ms, then at 80 ms and 20 Mbit/s.

| Query | Layout | Engine | Requests | MB | Time |
|---|---|---|---|---|---|
| Three curves, one wellbore | L1 | WASM | 8 | 4.75 | 0.94 s, 2.83 s |
| Three curves, one wellbore | L2 | WASM | 9 | 0.63 | 0.94 s, 1.22 s |
| Three curves, every wellbore | L1 | WASM | 5 | 4.75 | 0.71 s, 2.58 s |
| Three curves, every wellbore | L2 | WASM | 57 | 7.47 | 5.55 s, 8.49 s |
| Three curves, every wellbore | L2 | native 1.5.2, one thread | 57 | 8.93 | 5.30 s, 8.93 s |
| Three curves, every wellbore | L2 | native 2.0.0 | 31 to 59 | 7.5 to 9.0 | 0.89 to 0.94 s, 3.7 to 3.8 s |
| Three curves, every wellbore | L3 | WASM | 5 | 6.18 | 0.75 s, 3.20 s |
| Every curve, one wellbore | L1 | WASM | 61 | 18.49 | 6.10 s, 13.52 s |
| Every curve, one wellbore | L2 | WASM | 62 | 1.78 | 5.68 s, 6.34 s |

The DuckDB 1.5.2 and DuckDB-WASM numbers on L1 and L2 reproduce the pattern in petrodb's ADR-0012 (5 requests and 0.7 s against 58 requests and 5.1 s).

### Conclusions

1. **One row group per wellbore (L2) is the better layout for the log view.** A wellbore costs about 1.2 MB at the median, in one to three requests, with a fraction of the decode time and memory. It wins the single-well read and every multi-well read that picks some wells.
2. **Today's layout (L1) wins only "a few curves for every wellbore".** With hyparquet the gap is small. With DuckDB-WASM it is 0.7 s against 5.5 s, because DuckDB-WASM sends its requests one after another.
3. **DuckDB-WASM is slow at loading a whole well on any layout**: about 60 sequential requests, roughly one per column.
4. **The footer can serve as the well list under L2.** Row-group statistics on `source_wellbore` have equal minimum and maximum in every row group, and a column chunk whose null count equals its row count marks a curve the wellbore lacks. Both matched `log_curves` for all 21 wellbores.
5. **A page index (L3) is not the answer.** hyparquet gets similar bytes but needs tens to hundreds of requests, and DuckDB ignores the page index.
6. **One file per wellbore (L4) is slightly better still for hyparquet**, and the worst layout for DuckDB. petrodb's ADR-0012 already rejected it.
7. **L1's decode time and memory come from its single page per column**, not from the single row group. Smaller pages alone (L1p) cut decode from 0.86 s to 0.12 s and memory from 449 MB to 198 MB, but not the bytes.
8. **Chromium does not run range requests to one URL in parallel by default.** With hyparquet's default `fetch`, at most one or two are in flight. With `requestInit: { cache: 'no-store' }` they run in parallel. A probe against the live Data host showed the same. The Volve adapter must set that option and keep its own cache, as the FORCE 2020 adapter already does. The likely cause is the browser's HTTP cache locking the entry per URL; this was not confirmed.
9. **A whole L2 row group is one contiguous byte range.** hyparquet alone fetches it in one request when it is under 2 MB (17 wellbores) and two otherwise. A small wrapper (`rowGroupBuffer` in `src/layouts/q.mjs`) makes it always one, at the cost of fetching every column.
10. **Dictionary encoding on the curve columns** saves about 5 MB of file but triples what an offset-index read fetches. It did not matter for L2.

### Not measured

- Browsers other than headless Chromium 156.
- A real network for run 2: the model is a fixed delay and an optional bandwidth cap on loopback, apart from one probe of the live host.
- L2z read with hyparquet (it needs a ZSTD decompressor; petroviz has fzstd).
- DuckDB-WASM start-up in this session, and warm or cached behaviour of either reader.
- petrodb ADR-0012's exact queries and curves, since its script is not in that repo.

## Glossary changes

Made in `CONTEXT.md` on this branch:

- **Input curve** and **Interpreted curve** added, with petrodb's meaning.
- **Template** now says each dataset names its own default template and keeps its own current template, and that opened files share one of each.

## ADRs to write

None is written yet. Each waits on the open questions.

- **petroviz, new:** how Volve wells are loaded (one row group per wellbore, range requests, own cache), and why it differs from FORCE 2020. Waits on Q14 and Q15.
- **petroviz, ADR-0005:** the `dataset` parameter in practice, how a Volve well is named in a link, and the default Volve well.
- **petroviz, ADR-0003 or ADR-0004:** a default and a current template per dataset, and the second built-in template. Waits on Q16 and Q17.
- **petrodb, ADR-0012:** reopened with the measurements above. This belongs to the petrodb ticket.

## Expected tickets

Rough, not yet written or ordered beyond the first.

1. petrodb: republish the interpretation table with one row group per wellbore, and revise ADR-0012.
2. petroviz: the Volve log adapter and its fixture.
3. petroviz: dataset selection in the well picker, the `dataset` link parameter, the catalog and the welcome page.
4. petroviz: new curve families and the interpretation template.
5. petroviz: a default and a current template per dataset, and the template menu.
6. petroviz: correct `LICENSE-VOLVE-DATA.md` and extend it to well logs.
7. petroviz: add the Volve log tables to the pre-deploy source check.
8. petrodb: link Volve to `/logs?dataset=volve` on its site.
