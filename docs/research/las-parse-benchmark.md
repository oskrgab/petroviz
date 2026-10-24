# LAS parse benchmark: main thread vs Web Worker

Measured for [Does the LAS adapter parse in a Web Worker?](https://github.com/oskrgab/petroviz/issues/35). No parser existed yet, so a throwaway prototype of the planned LAS log adapter's hot path was timed on real and tiled LAS 2.0 files, on the main thread and in a module worker. The scripts and raw results are in [`las-parse-benchmark/`](las-parse-benchmark/).

## The prototype

`src/laslib.js` is one ES module that runs unchanged in Node, a page and a module worker. It follows the pipeline decided in [Does the LAS adapter use an existing parser or its own?](https://github.com/oskrgab/petroviz/issues/32):

- **Decode:** BOM sniffing, then strict UTF-8 (`fatal: true`), falling back to windows-1252.
- **Parse:** header sections and both tokenisers, filling `number[]` columns.
  - **naive:** `line.trim().split(/\s+/)`, then `Number()`.
  - **scan:** a `charCodeAt` scanner with a fast path for plain decimals of up to 15 digits, falling back to `Number()`.
- **Build:** sort check, the median step via `Float64Array.sort`, and sentinel replacement (NULL, −999.25, −9999.25, −9999, within 1e-3, never on the index) while packing into `Float32Array`. Then a separate gap-row pass, and empty curves dropped. MD is a `Float64Array` (ADR-0002).

Both tokenisers produce bit-identical output on every file (`src/check.mjs`).

## Tooling

- **Machine:** i7-8700T (6 cores / 12 threads, 2.4 GHz base, 4.0 GHz turbo; a low-power desktop part), 14 GB RAM, Linux.
- **Node:** v24.20.0.
- **Browser:** Chrome Headless Shell 156.0.8078.4, driven by playwright-core 1.64.1.
- **Throttling:** 4× CPU throttling through CDP `Emulation.setCPUThrottlingRate`, set on the page.
  - CDP refuses it on a worker target ("Operation is only supported for pages, not workers"), and page-level throttling doesn't slow the worker. So **no worker run was measured at 4×**.
  - On the main thread, 4× throttling made runs 3.6–4.3× slower, so a throttled worker would take roughly 4× its unthrottled time.
- **Runs:** each (file, tokeniser, environment) gets a fresh Node process or browser context. Run 1 is reported as cold, runs 2–3 are warm-up, and figures are the median of runs 4–10.
- **Main-thread block:** on the main thread, decode + parse + build, timed after `await file.arrayBuffer()`. The `longtask` entry matched it every time. In the worker runs, it's the largest gap in a `MessageChannel` ping loop running for the whole job.

## Files

| file | rows × curves | MB | notes |
|---|---|---|---|
| GLADE `west_mac60.las` ([GDR 1857](https://gdr.openei.org/submissions/1857), CC BY 4.0) | 21,779 × 63 | 16.5 | unwrapped |
| FORCE 2020 `25_7-2.las` ([repo at `c8d01ee`](https://github.com/bolgebrygg/Force-2020-Machine-Learning-competition/tree/c8d01ee92c1c8e1ecba36f96cca6ea7b689338a1/lithology_competition/data/las_files_Lithostrat_data)) | 31,686 × 24 | 9.9 | unwrapped |
| Utah FORGE `Acord 1-26` ([GDR 1111](https://gdr.openei.org/submissions/1111), CC BY 4.0) | 24,599 × 18 | 9.2 | wrapped, 6 lines per row |
| tiled from west_mac60 | 100k × 50 / 100k × 63 / 200k × 63 | 60.1 / 75.7 / 151.4 | the last 13 curves dropped for the 50-curve file |
| tiled from Acord | 100k × 18, wrapped / unwrapped | 37.2 / 36.2 | same values, two layouts |

Tiles are joined with a 10-step depth gap, so the gap pass has work to do. The real files have no gaps. `west_mac60.las` sits inside a 402 MB zip, and `tools/remotezip.py` pulls just that member with HTTP range requests.

## Results

Times are in ms, median of 7, with the cold run in parentheses, as **scan / naive**. For Node and Chromium the time is the main-thread block. In the worker column, the first figure is total wall time (spawn, read, parse, transfer) and the figure after `;` is the largest main-thread block.

| file | Node | Chromium | Chromium 4× | Worker wall (transfer) ; main block |
|---|---|---|---|---|
| west_mac60, 16.5 MB | 116 (148) / 196 (241) | 120 (154) / 200 (216) | 464 (534) / 764 (822) | 178 / 240 ; ≤1.4 |
| 25_7-2, 9.9 MB | 67 (89) / 126 (148) | 86 (105) / 124 (148) | 278 (344) / 464 (516) | 138 / 144 ; ≤1.0 |
| Acord wrapped, 9.2 MB | 60 (76) / 104 (131) | 75 (80) / 105 (118) | 228 (282) / 385 (428) | 125 / 154 ; ≤1.1 |
| 100k × 50, 60 MB | 483 (492) / 799 (847) | 539 (503) / 787 (775) | 2143 (2081) / 3305 (3264) | 588 / 829 ; 2.6 / 4.9 |
| 100k × 63, 76 MB | 599 (669) / 975 (1014) | 660 (658) / 1027 (970) | 2674 (2599) / 4287 (3912) | 706 / 1040 ; ≤5.7 |
| 200k × 63, 151 MB | 1213 (1275) / 1996 (1970) | 1384 (1248) / 2035 (1931) | 5655 (5151) / 8765 (7803) | 1378 / 2009 ; ≤5.6 |
| Acord 100k × 18 wrapped | 270 (275) / 448 (538) | 261 (300) / 457 (575) | 1057 (1161) / 1766 (1857) | 360 / 525 ; ≤3.5 |
| Acord 100k × 18 unwrapped | 259 (322) / 362 (386) | 274 (290) / 342 (401) | 1091 (1279) / 1351 (1586) | 346 / 411 ; ≤2.3 |

**Where the time goes,** for 100k × 50 with the scanner. Columns are decode / tokenise + parse / build, and the build breakdown in brackets is sort check, median step, sentinels + pack, gap rows.

- Chromium: 47 / 379 / 114 [3, 24, 48, 34]. The naive tokeniser's data phase is 627.
- Chromium 4×: 191 / 1549 / 416 [12, 92, 166, 140].
- Node: 34 / 374 / 71 [4, 4.5, 46, 17].

Tokenising the data is 70–80% of the time, and the header takes under 0.3 ms. Reading the file (`arrayBuffer()`, 45–115 ms) is async and not part of the main-thread block. A worker's wall time is about the main-thread time plus the read, so the worker adds almost no total time.

## Worker overheads (Chromium)

- **Spawning a module worker:** 8–36 ms, median about 23 ms.
- **`postMessage(File)`:** 0.02–0.06 ms on the main thread. The worker receives it 0.3–0.9 ms later.
- **Result with buffers transferred:** 0.1–0.2 ms to post and 0.2–2 ms to deliver. The largest main-thread block is ≤5.7 ms even at 200k × 63, and no longtask is recorded.
- **Result structured-cloned instead:** the main thread pays for deserialising.

| file | worker serialise (ms) | delivery (ms) | main-thread block (ms) |
|---|---|---|---|
| west_mac60 | 6 | 9 | 3 |
| 100k × 50 | 25 | 36 | 12 |
| 100k × 63 | 28 | 61 | 34 |
| 200k × 63 | 56 | 114 | 54 (a 52 ms longtask) |

Chromium deserialises before `onmessage` runs, so timing inside the handler shows ~0. Only the ping loop sees the cost.

## Memory (Chromium renderer)

- **Live memory at the end of the build, 100k × 50:** 187 MB, made up of file bytes 60 + decoded text 60 (a one-byte JS string, about 1× the file) + `number[]` columns 46 + well log 21. At 200k × 63 it's 484 MB.
- **Peak RSS increase over one cold main-thread parse, scan / naive:** west_mac60 +83 / +107 MB; 100k × 50 +272 / +326 MB; Acord 100k wrapped +150 / +181 MB; 200k × 63 +581 / +643 MB. Node is similar: +304 / +435 MB at 100k × 50.
- `measureUserAgentSpecificMemory` is unavailable in headless shell. These figures come from `performance.memory` and `/proc` RSS, with the peak reset through `clear_refs`.

## Findings worth keeping

1. **On the main thread, the well log keeps the whole decoded text alive.** Mnemonics, units and descriptions are `slice`/`trim` results, which V8 stores as references into the original string.
   - At 100k × 50, 81 MB stays live instead of 21 MB.
   - RegExp's legacy last-match record (`$_`) does the same until the next successful match anywhere on the page.
   - A worker avoids both, because structured clone copies the strings.
2. **`fatal: true` costs nothing measurable** on large ASCII files: 47 vs 48 ms at 60 MB.
3. **The windows-1252 fallback costs depend on where the bad byte sits.**
   - In the header, the strict decode throws in 0.3 ms.
   - After the data, the whole UTF-8 pass is wasted: 118 ms instead of 47.
   - A byte in 0x80–0x9F (curly quotes, €) decodes above U+00FF and turns the whole text into a two-byte string: 103 ms and +60 MB, with parse speed unchanged.
   - Node's windows-1252 decoder is slow (about 175 ms vs 33 ms); Chromium's is not.
4. **Wrapped and unwrapped files cost the same with the scanner** (261 vs 274 ms). The naive tokeniser is 34% slower on wrapped files.
5. **The scanner is 1.5–1.9× faster than naive on large files,** and 1.2–1.4× on the small ones. `parseFloat` is no faster than `Number()`, and it reads `1.#INF` as 1.
6. **Two build steps cost more in Chromium than in Node.** `Float64Array.prototype.sort()` takes 24 ms at 100k rows, against 4.5 ms in Node. The separate gap-row copy pass costs 34 ms at 100k × 50.
7. **GC in Node:** 17–82 ms per run in total, and the longest single pause is 12–22 ms. Naive triggers 2–3× more collections.
8. **Row-major `Float64Array` storage** in the scanner makes the data phase 23–28% faster in Node, but strided packing gives most of that back, for a net 8–10% gain.

## Re-running

```sh
cd docs/research/las-parse-benchmark/tools && npm install   # playwright-core 1.64.1; needs a Chromium headless shell
cd ../src
node tile.mjs --in DATA/west_mac60.las --out GEN/mac60_100k_50.las --rows 100000 --keep 50
node bench-node.mjs --tok scan,naive FILE...
node bench-browser.mjs --modes main,main4x,worker,workerClone,decode,memory --tok scan,naive FILE...
```

Keep the downloaded and generated LAS files outside the repo. Some original headers name commercial software.
