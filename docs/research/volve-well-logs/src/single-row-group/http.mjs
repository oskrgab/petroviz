// HTTP range-request measurement with a counting fetch.
// Usage: node http.mjs <url> <ranges.json> <wellbore> <scenario> <runs>
// Prints one JSON line per run and a summary line.
import { readFileSync } from 'node:fs'
import { asyncBufferFromUrl, cachedAsyncBuffer, parquetMetadata, parquetMetadataAsync, parquetRead } from '/data/dev/apps/petroviz/node_modules/hyparquet/src/index.js'

const [url, rangesPath, wellbore, scenario, runsArg] = process.argv.slice(2)
const runs = Number(runsArg)
const range = JSON.parse(readFileSync(rangesPath, 'utf8')).find(r => r.wellbore === wellbore)
if (!range) throw new Error(`no wellbore ${wellbore}`)

function countingFetch() {
  const log = []
  const fetchFn = async (input, init = {}) => {
    const headers = new Headers(init.headers)
    const entry = { method: init.method ?? 'GET', range: headers.get('Range'), t0: performance.now() }
    log.push(entry)
    const res = await fetch(input, init)
    entry.status = res.status
    entry.redirected = res.redirected
    entry.finalHost = new URL(res.url).host
    entry.contentLength = Number(res.headers.get('content-length') ?? NaN)
    entry.contentRange = res.headers.get('content-range')
    entry.headersMs = +(performance.now() - entry.t0).toFixed(1)
    if (entry.method === 'HEAD') { entry.bodyBytes = 0; return res }
    // count body bytes actually received
    const orig = res.arrayBuffer.bind(res)
    res.arrayBuffer = async () => {
      const ab = await orig()
      entry.bodyBytes = ab.byteLength
      entry.doneMs = +(performance.now() - entry.t0).toFixed(1)
      return ab
    }
    return res
  }
  return { log, fetchFn }
}

const sliceToRange = (out) => (c) => {
  const lo = range.rowStart - c.rowStart, n = range.rowEnd - range.rowStart
  if (c.columnName === 'source_wellbore' || c.columnName === 'npd_wellbore_code') { out[c.columnName] = c.columnData.slice(lo, lo + n); return }
  const f = new Float64Array(n)
  for (let i = 0; i < n; i++) { const v = c.columnData[lo + i]; f[i] = v === null || v === undefined ? NaN : v }
  out[c.columnName] = f
}

const scenarios = {
  // hyparquet defaults: HEAD for length, last 512 kB for the footer, then the column chunks
  range_default: async ({ fetchFn }) => {
    const ph = {}
    let t = performance.now()
    const file = await asyncBufferFromUrl({ url, fetch: fetchFn })
    ph.headMs = performance.now() - t; t = performance.now()
    const metadata = await parquetMetadataAsync(file)
    ph.footerMs = performance.now() - t; t = performance.now()
    const out = {}
    await parquetRead({ file, metadata, columns: range.columns, rowStart: range.rowStart, rowEnd: range.rowEnd, onChunk: sliceToRange(out) })
    ph.dataMs = performance.now() - t
    return { ph, rows: out.depth_md.length, cols: Object.keys(out).length }
  },
  // tuned: byteLength known up front (no HEAD), footer fetch sized to the footer
  range_tuned: async ({ fetchFn }) => {
    const ph = {}
    let t = performance.now()
    const file = await asyncBufferFromUrl({ url, fetch: fetchFn, byteLength: 20269028 })
    ph.headMs = performance.now() - t; t = performance.now()
    const metadata = await parquetMetadataAsync(file, { initialFetchSize: 16384 })
    ph.footerMs = performance.now() - t; t = performance.now()
    const out = {}
    await parquetRead({ file, metadata, columns: range.columns, rowStart: range.rowStart, rowEnd: range.rowEnd, onChunk: sliceToRange(out) })
    ph.dataMs = performance.now() - t
    return { ph, rows: out.depth_md.length, cols: Object.keys(out).length }
  },
  // realistic cold start when the row range is not known: HEAD, footer, source_wellbore column, then the curves
  range_discover: async ({ fetchFn }) => {
    const ph = {}
    let t = performance.now()
    const file = cachedAsyncBuffer(await asyncBufferFromUrl({ url, fetch: fetchFn }))
    ph.headMs = performance.now() - t; t = performance.now()
    const metadata = await parquetMetadataAsync(file)
    ph.footerMs = performance.now() - t; t = performance.now()
    let sw
    await parquetRead({ file, metadata, columns: ['source_wellbore'], onChunk: c => { sw = c.columnData } })
    const rowStart = sw.indexOf(wellbore), rowEnd = sw.lastIndexOf(wellbore) + 1
    ph.discoverMs = performance.now() - t; t = performance.now()
    const out = {}
    await parquetRead({ file, metadata, columns: range.columns, rowStart, rowEnd, onChunk: sliceToRange(out) })
    ph.dataMs = performance.now() - t
    return { ph, rows: out.depth_md.length, cols: Object.keys(out).length, rowStart, rowEnd }
  },
  // one whole-file GET, then decode the same columns from memory
  whole_file: async ({ fetchFn }) => {
    const ph = {}
    let t = performance.now()
    const res = await fetchFn(url)
    const bytes = await res.arrayBuffer()
    ph.downloadMs = performance.now() - t; t = performance.now()
    const metadata = parquetMetadata(bytes)
    const out = {}
    await parquetRead({ file: bytes, metadata, columns: range.columns, rowStart: range.rowStart, rowEnd: range.rowEnd, onChunk: sliceToRange(out) })
    ph.decodeMs = performance.now() - t
    return { ph, rows: out.depth_md.length, cols: Object.keys(out).length }
  },
  // one whole-file GET only
  whole_file_download: async ({ fetchFn }) => {
    const t = performance.now()
    const res = await fetchFn(url)
    const bytes = await res.arrayBuffer()
    return { ph: { downloadMs: performance.now() - t }, bytes: bytes.byteLength }
  },
}

const run = scenarios[scenario]
if (!run) throw new Error(`unknown scenario ${scenario}`)
const walls = [], summaries = []
for (let i = 0; i < runs; i++) {
  const c = countingFetch()
  const t0 = performance.now()
  const r = await run(c)
  const wall = performance.now() - t0
  walls.push(wall)
  const requests = c.log.length
  const bodyBytes = c.log.reduce((a, e) => a + (e.bodyBytes ?? 0), 0)
  const s = {
    run: i, wallMs: +wall.toFixed(0), requests,
    head: c.log.filter(e => e.method === 'HEAD').length,
    get: c.log.filter(e => e.method === 'GET').length,
    bodyBytes, statuses: [...new Set(c.log.map(e => e.status))], redirected: c.log.every(e => e.redirected),
    finalHosts: [...new Set(c.log.map(e => e.finalHost))],
    phases: Object.fromEntries(Object.entries(r.ph).map(([k, v]) => [k, +v.toFixed(0)])),
    rows: r.rows, cols: r.cols,
  }
  summaries.push(s)
  console.log(JSON.stringify(s))
  if (i === 0) console.log(JSON.stringify({ requestLog: c.log.map(e => ({ m: e.method, range: e.range, status: e.status, bytes: e.bodyBytes, headersMs: e.headersMs, doneMs: e.doneMs })) }))
}
const sorted = [...walls].sort((a, b) => a - b)
console.log(JSON.stringify({ scenario, wellbore, runs, medianWallMs: +sorted[Math.floor(sorted.length / 2)].toFixed(0), minWallMs: +sorted[0].toFixed(0), maxWallMs: +sorted[sorted.length - 1].toFixed(0), requests: summaries[0].requests, bodyBytes: summaries[0].bodyBytes }))
