// In-memory decode benchmark, one scenario per process.
// Usage: node --expose-gc bench.mjs <file.parquet> <ranges.json> <scenario> <iters> [wellbore]
// Prints one JSON line: cold (first iteration) ms, warm median ms, maxRSS, retained bytes, evidence.
import { readFileSync } from 'node:fs'
import { parquetMetadata, parquetRead, parquetReadObjects } from '/data/dev/apps/petroviz/node_modules/hyparquet/src/index.js'

const [file, rangesPath, scenario, itersArg, wellbore] = process.argv.slice(2)
const iters = Number(itersArg)
const b = readFileSync(file)
const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const ranges = JSON.parse(readFileSync(rangesPath, 'utf8'))
const range = wellbore ? ranges.find(r => r.wellbore === wellbore) : undefined
if (wellbore && !range) throw new Error(`no wellbore ${wellbore}`)

const mem = () => { globalThis.gc?.(); const m = process.memoryUsage(); return m.heapUsed + m.arrayBuffers }
const baseline = mem()

/** scenario → async () => { result, evidence } */
const scenarios = {
  // footer parse only
  metadata: async () => ({ result: parquetMetadata(bytes), evidence: {} }),

  // (a) all 58 columns, all rows; chunks kept as hyparquet hands them over
  all_onChunk: async () => {
    const out = {}
    await parquetRead({ file: bytes, onChunk: c => { (out[c.columnName] ??= []).push(c.columnData) } })
    return { result: out, evidence: { columns: Object.keys(out).length, chunksPerColumn: out.GR.length, chunkLen: out.GR[0].length, arrayType: out.GR[0].constructor.name } }
  },
  // (a) the way petroviz decode.ts does it today: prefilled arrays + per-value copy
  all_petrovizStyle: async () => {
    const metadata = parquetMetadata(bytes)
    const rowCount = Number(metadata.num_rows)
    const columns = {}
    for (const el of metadata.schema.slice(1)) if (el.num_children === undefined) columns[el.name] = new Array(rowCount).fill(null)
    await parquetRead({ file: bytes, metadata, onChunk: ({ columnName, columnData, rowStart }) => {
      const out = (columns[columnName] ??= new Array(rowCount).fill(null))
      for (let i = 0; i < columnData.length && rowStart + i < rowCount; i++) out[rowStart + i] = columnData[i] ?? null
    } })
    return { result: columns, evidence: { columns: Object.keys(columns).length } }
  },
  // (a) row objects
  all_objects: async () => {
    const rows = await parquetReadObjects({ file: bytes })
    return { result: rows, evidence: { rows: rows.length } }
  },

  // (b) only source_wellbore
  sw_only: async () => {
    let col
    await parquetRead({ file: bytes, columns: ['source_wellbore'], onChunk: c => { col = c.columnData } })
    // derive the contiguous row range of every wellbore, as an app would
    const found = []
    let start = 0
    for (let i = 1; i <= col.length; i++) if (i === col.length || col[i] !== col[start]) { found.push([col[start], start, i]); start = i }
    return { result: col, evidence: { len: col.length, wellbores: found.length } }
  },
  // (b') the three key columns
  keys_only: async () => {
    const out = {}
    await parquetRead({ file: bytes, columns: ['npd_wellbore_code', 'source_wellbore', 'depth_md'], onChunk: c => { out[c.columnName] = c.columnData } })
    return { result: out, evidence: { len: out.depth_md.length } }
  },

  // (c) one wellbore's rows, all columns, onChunk (what does hyparquet hand over?)
  wb_allCols_onChunk: async () => {
    const out = {}
    const seen = {}
    await parquetRead({ file: bytes, rowStart: range.rowStart, rowEnd: range.rowEnd, onChunk: c => {
      out[c.columnName] = c.columnData
      seen[c.columnName] = [c.rowStart, c.rowEnd, c.columnData.length]
    } })
    return { result: out, evidence: { columns: Object.keys(out).length, want: [range.rowStart, range.rowEnd], chunkGR: seen.GR, chunkDepth: seen.depth_md } }
  },
  // (c) one wellbore's rows, only the columns it has values in, onChunk
  wb_ownCols_onChunk: async () => {
    const out = {}
    const seen = {}
    await parquetRead({ file: bytes, columns: range.columns, rowStart: range.rowStart, rowEnd: range.rowEnd, onChunk: c => {
      out[c.columnName] = c.columnData
      seen[c.columnName] = [c.rowStart, c.rowEnd, c.columnData.length]
    } })
    return { result: out, evidence: { columns: Object.keys(out).length, want: [range.rowStart, range.rowEnd], chunkGR: seen.GR } }
  },
  // (c) same, but keep only the wellbore's rows (slice to Float64Array, NULL -> NaN), dropping the full chunks
  wb_ownCols_sliced: async () => {
    const out = {}
    await parquetRead({ file: bytes, columns: range.columns, rowStart: range.rowStart, rowEnd: range.rowEnd, onChunk: c => {
      const lo = range.rowStart - c.rowStart, n = range.rowEnd - range.rowStart
      if (c.columnName === 'source_wellbore' || c.columnName === 'npd_wellbore_code') { out[c.columnName] = c.columnData.slice(lo, lo + n); return }
      const f = new Float64Array(n)
      for (let i = 0; i < n; i++) { const v = c.columnData[lo + i]; f[i] = v === null || v === undefined ? NaN : v }
      out[c.columnName] = f
    } })
    return { result: out, evidence: { columns: Object.keys(out).length, rows: out.depth_md.length } }
  },
  // (c) same with the offset-index switch on (the file has no offset index)
  wb_ownCols_useOffsetIndex: async () => {
    const seen = {}
    const out = {}
    await parquetRead({ file: bytes, columns: range.columns, rowStart: range.rowStart, rowEnd: range.rowEnd, useOffsetIndex: true, onChunk: c => {
      out[c.columnName] = c.columnData
      seen[c.columnName] = [c.rowStart, c.rowEnd, c.columnData.length]
    } })
    return { result: out, evidence: { chunkGR: seen.GR } }
  },
  // (c) row objects for the range (onComplete slices to the range)
  wb_ownCols_objects: async () => {
    const rows = await parquetReadObjects({ file: bytes, columns: range.columns, rowStart: range.rowStart, rowEnd: range.rowEnd })
    return { result: rows, evidence: { rows: rows.length, first: rows[0].source_wellbore, last: rows[rows.length - 1].source_wellbore } }
  },
  wb_allCols_objects: async () => {
    const rows = await parquetReadObjects({ file: bytes, rowStart: range.rowStart, rowEnd: range.rowEnd })
    return { result: rows, evidence: { rows: rows.length, keys: Object.keys(rows[0]).length } }
  },
}

const run = scenarios[scenario]
if (!run) throw new Error(`unknown scenario ${scenario}; have ${Object.keys(scenarios).join(', ')}`)

const times = []
let last
for (let i = 0; i < iters; i++) {
  last = undefined
  const t0 = performance.now()
  last = await run()
  times.push(performance.now() - t0)
}
const retained = mem() - baseline // last result still referenced
const warm = times.slice(1).sort((a, b) => a - b)
const median = warm.length ? warm[Math.floor(warm.length / 2)] : null
console.log(JSON.stringify({
  scenario, wellbore: wellbore ?? null, iters,
  coldMs: +times[0].toFixed(1),
  warmMedianMs: median === null ? null : +median.toFixed(1),
  warmMinMs: warm.length ? +warm[0].toFixed(1) : null,
  warmMaxMs: warm.length ? +warm[warm.length - 1].toFixed(1) : null,
  maxRssMB: +(process.resourceUsage().maxRSS / 1024).toFixed(0),
  retainedMB: +(retained / 1048576).toFixed(1),
  evidence: last.evidence,
}))
