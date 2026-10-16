# Reading a FORCE 2020 well file in the browser

Research for [#24](https://github.com/oskrgab/petroviz/issues/24), part of the log view map [#22](https://github.com/oskrgab/petroviz/issues/22). Measured 2026-10-16.

## Question

What is the fastest and lightest way for the FORCE 2020 **log adapter** to turn one well file (`force_2020/wells/<well>.parquet` on the **Data host**) into columnar typed arrays in the browser? The options are DuckDB-WASM (which petroviz already loads for Volve), a JavaScript or WASM parquet reader (hyparquet, parquet-wasm), and fetching the whole file versus reading byte ranges. Where does the well list come from, and where do the units and lithology labels live?

## Recommendation

1. **Fetch the whole file with one plain `GET`.** Don't send a `HEAD` or byte-range reads. Each well file is a single row group, and the log view needs almost every column, so range reads save no bytes. They also add round trips, and every request to the Data host pays for a redirect. In the browser, the whole-file path was the fastest way to get the arrays (median ~470 ms over the network), while the range-read paths took ~780–980 ms.
2. **Decode with hyparquet plus a ZSTD-only decompressor (fzstd).** It adds ~21 KB gzipped of JavaScript, needs no WASM, and has nothing to initialise. Once the code is warm, decode time is about the same as parquet-wasm and DuckDB-WASM (~70–90 ms for the largest well in the browser).
3. **Convert NULLs explicitly.** hyparquet returns a plain `Array` with `null` entries, and the adapter writes `Float64Array` with `NaN` for NULL. Don't use `Float64Array.from(arr)` (it turns `null` into `0`), and don't use Arrow `Vector.toArray()` either (it also puts `0` in null slots).
4. **Cache the bytes yourself.** The browser HTTP cache doesn't help on this host (see [Caching](#caching-the-warm-cache-case)). Store each fetched file in the Cache API (or in memory for the session) under its resolve URL. Reading a cached file back took 2–5 ms.
5. **Keep DuckDB-WASM out of this path.** It decodes fine, but a page that hasn't started it yet pays 1.4–1.9 s for instantiation, plus ~0.1–0.5 s to load `httpfs`. That alone breaks the 1 s bar, and the map's Notes say the log view must stay independent of DuckDB.

## Facts about the files

All 108 files were checked with `parquetMetadata` (hyparquet), against the local copy that petrodb publishes. The local bytes are identical to the Data host's: the SHA-256 of `15-9-13.parquet` matches the host's `x-linked-etag`.

| Property | Value |
|---|---|
| Files | 108, all listed in `wells/_files.json` |
| Row groups per file | **1** (every file) |
| Compression codec | **ZSTD** (every column, every file) |
| Size | 134 KB min, 767 KB median, 1.88 MB max; 85.6 MB in total |
| Rows | 1,734 min, 12,644 median, 25,131 max |
| Footer (metadata) | ≤ 4.7 KB |
| Columns | 29, all `OPTIONAL` in the parquet schema. Curves are `DOUBLE`, `WELL`/`GROUP`/`FORMATION`/`dataset` are UTF-8 strings, and `FORCE_2020_LITHOFACIES_LITHOLOGY` is `INT64` |

Some curves are entirely NULL in a given well. In `25-7-2`, for example, `DTS`, `MUDWEIGHT` and `ROPA` are NULL in all 23,879 rows. The footer statistics carry `null_count` for each column, so the adapter can detect an absent curve without decoding it.

The files contain no sentinels in place of NULLs. They also carry upstream sentinel values (≤ −999): RXO in 3 wells, SP in 1, ROPA in 1. These are real numbers in the file, not NULLs. The petrodb dataset README says to treat them as NULL, so that mapping is the adapter's job.

## Options and evidence

### How the numbers were taken

- **Node:** Node 24, a 12-thread 2.4 GHz desktop x86-64 CPU. Each library ran in its own process on a file already in memory. The output was 25 columns (all except `WELL`, `X_LOC`, `Y_LOC`, `dataset`), each converted to `Float64Array` with `NaN` for NULL. "Cold" is the first call, which includes JIT and module start-up. "Warm" is the median of 20 calls.
- **Browser:** headless Chromium 133 on the same machine, reading the **live Data host** over one home connection. Six wells from 0.66 to 1.88 MB were read with every method, and the order of methods was rotated for each well, so no method always paid for opening the connection. These numbers depend on the network and will differ for other users. The relative order of the methods is the useful part.
- **Cross-check:** for `25-7-2`, all three readers produced identical NULL counts per column and identical values (sampled max absolute difference 0).

### hyparquet (+ fzstd)

- **Fit:** pure JavaScript with no dependencies. On its own it reads only uncompressed and Snappy pages, so ZSTD needs a decompressor passed in through `compressors` ([hyparquet README, Compression][hyp-readme]). `hyparquet-compressors` wires ZSTD to fzstd with `ZSTD: input => decompressZstd(input)` ([source][hypc-src]). Passing just that one entry avoids bundling the Brotli, gzip, LZ4 and Snappy WASM code.
- **Output:** `parquetRead({ onChunk })` hands back column-oriented data without transposing it into rows ([README, parquetRead / Chunk Streaming][hyp-readme]). Measured: `DOUBLE` comes back as `Array<number | null>`, `INT64` as `bigint`, and strings as `string`.
- **Size (measured, esbuild minified, tree-shaken read path):** hyparquet + fzstd is 64.5 KB raw / **21.1 KB gzip**. hyparquet + the full `hyparquet-compressors` is 172 KB / 92 KB gzip (the package README states 75 KB gzip for the compressors alone, [README, Bundle size][hypc-readme]). No WASM, no initialisation.
- **Time-to-arrays:**

  | Well (bytes, rows) | Node cold / warm | Browser decode (in a network run) |
  |---|---|---|
  | 25-7-2 (1.88 MB, 23,879) | 202 / 68 ms | 161 ms (first call) |
  | 15-9-13 (1.18 MB, 18,270) | 102 / 47 ms | 83 ms |
  | 16-2-6 (0.66 MB, 9,138) | 71 / 21 ms | 21 ms |

  Browser, bytes already in memory, warm, largest well: **88 ms** (median of 10). Using the full `hyparquet-compressors` instead of fzstd alone made decoding slightly slower (warm 72 / 49 / 24 ms in Node).
- **Range reads:** `asyncBufferFromUrl` sends a `HEAD` to learn the length, then a `Range` `GET` per slice ([src/utils.js][hyp-utils]). Metadata is read with a 512 KB tail fetch (`defaultInitialFetchSize = 1 << 19`, [src/metadata.js][hyp-meta]), and the column chunks are then fetched again. Measured in the browser:

  | Columns read | Requests (excl. redirects) | Bytes fetched vs file | Median time |
  |---|---|---|---|
  | 25 (whole view) | HEAD + 2–3 GET | **1.3–1.8× the file** | 805 ms |
  | 6 (depth, GR, RHOB, NPHI, RDEP, lithology) | HEAD + 4–5 GET | 0.5–0.8× the file (1.2× for the 0.66 MB well) | 783 ms |
  | whole-file `fetch` + decode | 1 GET | 1.0× | **468 ms** |

  Fetching fewer columns cut the bytes but not the time. A request from this location takes about 0.3 s however small it is (an 8-byte range took 0.30–0.34 s with curl, against 0.57–0.65 s for the whole 1.18 MB file), so each extra sequential round trip costs more than the bytes it saves.

### parquet-wasm (+ apache-arrow)

- **Fit:** a Rust/WASM reader that returns an Arrow table, which is moved into JavaScript with `tableFromIPC(table.intoIPCStream())` ([README][pw-readme]). It supports ZSTD in the default build.
- **Size:** the published `parquet_wasm_bg.wasm` (v0.9.0) is 5.25 MB raw, 1.67 MB gzip, and **1.62 MB** brotli as served by the public npm CDN (measured). The README states 1.2 MB brotli for the default build, and as little as 456 KB for a custom reader-only build without compression, which means building it with Rust and `wasm-pack` ([README, Custom builds][pw-readme]). The JavaScript glue plus apache-arrow comes to 253 KB raw / 58 KB gzip (measured).
- **Time-to-arrays:** WASM init 15 ms in Node and 34–51 ms in the browser (WASM served locally, so this is compile time only). Node cold / warm: 132/61, 111/56, 95/25 ms for the three wells above. Browser decode median 110 ms in the network run, and **68 ms** warm on the largest well.
- **NULLs:** Arrow keeps values and a validity bitmap separately, and null slots may hold any value ([Arrow columnar format, Validity bitmaps][arrow-validity]). Measured: `Vector.toArray()` on `SGR` (21,102 NULLs) returns a `Float64Array` with **`0` in the null slots**, while `vector.get(i)` returns `null`. The adapter has to apply the bitmap itself. `INT64` comes back as `BigInt64Array`.
- **Range reads:** `ParquetFile.fromUrl` exists ([README, Async API][pw-readme]), but because each file is one row group it has the same problem as hyparquet's range path. It was not timed separately.

### DuckDB-WASM (already a dependency)

- **Fit:** petroviz pins `@duckdb/duckdb-wasm` 1.32.0 and loads its bundles from the public npm CDN at runtime, then swaps in the loadable `httpfs` extension for range reads (`src/lib/data/db.ts`). Its bytes don't count against petroviz's own bundle, but the user still downloads them.
- **Size (1.32.0, measured):** `duckdb-eh.wasm` is 34.2 MB raw, 7.6 MB gzip, **6.76 MB** brotli as served by the CDN. The worker script is 189 KB brotli, and the `httpfs` extension is ~74 KB transferred.
- **Initialisation (browser, measured):** `instantiate` + `connect` took **1.75 s** in a fresh profile, and still took 1.4–1.8 s on the second and third page loads with a warm HTTP cache. `LOAD httpfs` took 0.44 s cold and 0.12–0.15 s warm. In Node, initialisation took 0.84–1.25 s.
- **Time-to-arrays once initialised:**
  - `read_parquet('<url>')` through `httpfs`: median **978 ms**, max 1,589 ms (browser). It sends a `HEAD`, a 16 KB tail read, and then a single range covering the rest of the file (`bytes=4-…`). That is the whole file in three sequential round trips.
  - Fetch the whole file, then `registerFileBuffer` + `read_parquet`: median 458 ms total, decode median 66 ms, and **80 ms** warm on the largest well. Node warm: 55 / 46 / 29 ms.
- **NULLs:** results come back as an Arrow table, with the same bitmap caveat as parquet-wasm. `Vector.toArray()` puts `0` where values are NULL.
- Decode speed is not the problem. Startup cost is, and so is the coupling: the map says the log view module never imports DuckDB. A FORCE adapter could still borrow DuckDB when the Volve dashboard has already started it, but it shouldn't rely on that.

### Summary

| | hyparquet + fzstd | parquet-wasm | DuckDB-WASM |
|---|---|---|---|
| Extra download | **21 KB gz JS** | 1.6 MB WASM + 58 KB gz JS | 6.8 MB WASM + 0.2 MB worker (+ httpfs) |
| Init before first read | **none** | ~40 ms | 1.4–1.9 s (+0.1–0.5 s httpfs) |
| Warm decode, largest well (browser) | 88 ms | 68 ms | 80 ms |
| Median fetch + decode, live host (browser) | **468 ms** (whole) / 805 ms (range) | 485 ms (whole) | 458 ms (whole + buffer) / 978 ms (`httpfs`) — init not included |
| NULL arrives as | `null` in an `Array` | validity bitmap (`0` in `toArray()`) | validity bitmap (`0` in `toArray()`) |
| `INT64` arrives as | `bigint` | `BigInt64Array` | `BigInt64Array` |

## Whole file vs byte ranges on the Data host

Checked with `curl` and in the browser, against `<Data host>/force_2020/wells/15-9-13.parquet` (`<Data host>` is `PUBLIC_DATA_BASE_URL`'s default in `src/lib/config/sources.js`):

- **CORS works for both kinds of request.** The resolve URL answers `302` to a signed CDN URL. The first hop echoes the request `Origin` in `access-control-allow-origin` and exposes `Content-Range`, `Accept-Ranges` and `X-Linked-Size`. The CDN hop sends `access-control-allow-origin: *` and `access-control-expose-headers: *`. A preflight for the `range` header gets `200` on both hops. In the browser, a `Range` request followed the redirect and came back **206** with `Content-Range: bytes 0-1023/1178936`, and suffix ranges (`bytes=-8`) also returned 206.
- **No content encoding on parquet.** The CDN returned raw bytes even when `gzip`/`br` were accepted, so ranges apply to the real file. The gzip-plus-range problem described in `db.ts` doesn't apply to this host.
- **Size without a HEAD:** the first hop sends `x-linked-size` (the file length) and `x-linked-etag` (its SHA-256), but the manifest doesn't carry sizes. A range reader therefore needs a `HEAD` or a suffix read first, which is one more round trip through the redirect.
- **Cost of a request vs bytes** (curl, from this location): an 8-byte range took 0.30–0.34 s, and the whole 1.18 MB file took 0.57–0.65 s (about 0.1 s of that was the redirect). At ≤ 1.9 MB per file, latency matters more than size.
- **Why ranges don't help here:** parquet can skip work only at row-group and column-chunk granularity ([Parquet file format][parquet-format]). These files have one row group, and the default template needs most of the curve columns, so range reads still fetch most of the file, just spread over more round trips.

### Caching (the warm-cache case)

The performance bar in #22 assumes a warm cache, and the browser HTTP cache can't supply one here:

- The `302` from the resolve URL carries `cache-control: no-store`.
- The `Location` it points to is a newly signed URL on every request (two consecutive `HEAD`s returned different targets), valid for about an hour.
- The CDN's `200`/`206` responses carry an `ETag` but no `Cache-Control`.

Measured: fetching the same well twice in a row in one page hit the network both times (~300 ms each), and so did the same fetch on a second page load. The adapter should keep its own cache. With the [Cache API][cache-api], `cache.match()` plus `arrayBuffer()` for a 1.18 MB file took **2–5 ms**, so a warm reselection costs well under 100 ms in total once decode is added. The first hop exposes `X-Repo-Commit`. If the cache must not outlive a data change on `main`, the key can include that commit, or the adapter can resolve against a fixed commit (petrodb ADR-0005 describes swapping `main` for a SHA to get a frozen snapshot).

## Well list: `wells/_files.json`

- petrodb [ADR-0004][adr-0004] makes `_files.json` the discovery contract for a multi-parquet table: a JSON array of paths relative to the directory. Consumers must not glob or rely on directory listings. ADR-0005 keeps the manifest on the Data host, next to the files.
- Live: `<Data host>/force_2020/wells/_files.json` returns 108 entries (`"15-9-13.parquet"`, …) in 2,274 bytes, with CORS enabled. It took 178 ms in the browser. It arrives through a `307` to a cache path, not the `302` the parquet files use.
- Per ADR-0004 the filename carries no query semantics. The well's display name comes from the file's `WELL` column (e.g. `16-1-6_A.parquet` holds `"16/1-6 A"`). For a picker shown before any file is opened, the filename stem is a fair label. The petrodb README documents the rule (`/` → `-`, space → `_`), and it held for all 108 files, but it is documentation, not contract. Once a file is loaded, the header should show `WELL`.

## Units and lithology labels: `schema.json`

- On the **Schema host**: `<Schema host>/force_2020/schema.json` (`<Schema host>` is `PUBLIC_SCHEMA_BASE_URL`'s default). The live copy matches the petrodb tree. It answers with `access-control-allow-origin: *`, is brotli-encoded, and is sent with `cache-control: public, max-age=0, must-revalidate`, so the browser revalidates it each time. Fetching it took 142 ms.
- **Units:** `tables.wells.columns[]` gives `{ name, type, unit, not_null, primary_key }` for all 29 columns. Units are Unicode strings (`"ohm·m"`, `"g/cm³"`, `"µs/ft"`, `"gAPI"`, `"v/v"`, …). `GROUP`/`FORMATION`/`WELL` have `unit: null`, and the lithology column has `unit: "code"`. That covers "each curve shown in its source unit" with no hard-coded table.
- **Lithology labels:** the top-level `lithology_labels` maps a **string** code to a label (`"30000": "Sandstone"`, … 12 entries, the same as the dataset README). The column arrives as `bigint` (hyparquet) or `BigInt64Array` (Arrow), so convert it with `String(Number(code))` before the lookup.
- The column list in `schema.json` is also the natural source for the adapter's list of possible curves. Which of them hold data in a given well comes from that file's footer `null_count`.

## Sketch of the read path

```js
import { parquetMetadata, parquetRead } from 'hyparquet'
import { decompress } from 'fzstd'

const compressors = { ZSTD: input => decompress(input) }

async function readWell(url, columns) {
  const bytes = await cachedFetch(url)            // Cache API, then one plain GET
  const meta = parquetMetadata(bytes)             // footer: null_count per column
  const raw = {}
  await parquetRead({ file: bytes, metadata: meta, columns, compressors,
    onChunk: c => { raw[c.columnName] = c.columnData } })
  // Array<number|null> -> Float64Array with NaN; never Float64Array.from()
  // (null -> 0). Sentinels (<= -999) -> NaN here too.
  return raw
}
```

## Not settled here

- **Worker or main thread.** Decoding the largest well takes 70–90 ms warm, but 160–240 ms on the very first call while the code is still cold. That is several frames on the main thread. Moving the work to a worker, and transferring the `Float64Array`s back, removes the jank but adds a module seam. That choice belongs with the "Large or irregular inputs" item on #22.
- **Sentinel handling and display of all-NULL curves** belong to the "Data quality in the view" item on #22. This note only shows that both can be detected cheaply.

## Sources

- hyparquet 1.31.4: [README][hyp-readme]; [`src/utils.js` `asyncBufferFromUrl`][hyp-utils]; [`src/metadata.js` `defaultInitialFetchSize`][hyp-meta]. Also npm metadata (`npm view hyparquet`: MIT, 0 dependencies).
- hyparquet-compressors 1.1.2: [README][hypc-readme]; [`src/compressors.js`][hypc-src] (depends on `fzstd` 0.1.1, [repo][fzstd]).
- parquet-wasm 0.9.0: [README][pw-readme] (bundle size, async API, custom builds, `intoIPCStream`).
- @duckdb/duckdb-wasm 1.32.0: [repo][duckdb-wasm]; the petroviz integration in `src/lib/data/db.ts`.
- Apache Arrow columnar format, [validity bitmaps][arrow-validity]; Apache Parquet [file format][parquet-format].
- [MDN: Cache API][cache-api].
- petrodb: [ADR-0004][adr-0004] (multi-parquet tables and the `_files.json` manifest), [ADR-0005][adr-0005] (Data host, range reads, pinning to a commit), `parquet/force_2020/README.md` and `schema.json`.
- Measurements: HTTP headers via `curl -I` and preflight `OPTIONS`; bundle sizes via esbuild 0.25 (`--bundle --minify`) and `gzip -9`; CDN transfer sizes via `curl -H 'Accept-Encoding: br, gzip'`; Node and headless Chromium 133 benchmarks run outside the repo.

[hyp-readme]: https://github.com/hyparam/hyparquet/blob/master/README.md
[hyp-utils]: https://github.com/hyparam/hyparquet/blob/master/src/utils.js
[hyp-meta]: https://github.com/hyparam/hyparquet/blob/master/src/metadata.js
[hypc-readme]: https://github.com/hyparam/hyparquet-compressors/blob/master/README.md
[hypc-src]: https://github.com/hyparam/hyparquet-compressors/blob/master/src/compressors.js
[fzstd]: https://github.com/101arrowz/fzstd
[pw-readme]: https://github.com/kylebarron/parquet-wasm/blob/main/README.md
[duckdb-wasm]: https://github.com/duckdb/duckdb-wasm
[arrow-validity]: https://arrow.apache.org/docs/format/Columnar.html#validity-bitmaps
[parquet-format]: https://parquet.apache.org/docs/file-format/
[cache-api]: https://developer.mozilla.org/en-US/docs/Web/API/Cache
[adr-0004]: https://github.com/oskrgab/petrodb/blob/main/docs/adr/0004-multi-parquet-table-convention.md
[adr-0005]: https://github.com/oskrgab/petrodb/tree/main/docs/adr
