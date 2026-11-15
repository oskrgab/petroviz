// Offline: data bytes and data requests hyparquet needs for "every curve of one wellbore" (QA), for all 21 wellbores, per layout.
// Usage: node plan_all.mjs <data dir> <ranges.json> <layouts.json>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parquetMetadata } from '/data/dev/apps/petroviz/node_modules/hyparquet/src/index.js'
import { parquetPlan } from '/data/dev/apps/petroviz/node_modules/hyparquet/src/plan.js'
import { readOffsetIndex } from '/data/dev/apps/petroviz/node_modules/hyparquet/src/indexes.js'
import { rowGroupsByWellbore } from './q.mjs'
const [dir, rangesPath, layoutsPath] = process.argv.slice(2)
const ranges = JSON.parse(readFileSync(rangesPath, 'utf8'))
const layouts = JSON.parse(readFileSync(layoutsPath, 'utf8'))
const load = (n) => { const b = readFileSync(join(dir, n)); const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); return { bytes, metadata: parquetMetadata(bytes) } }
const sum = (a) => a.reduce((x, y) => x + y, 0)
const stat = (a) => { const s = [...a].sort((x, y) => x - y); return `min ${s[0]} median ${s[Math.floor(s.length / 2)]} max ${s[s.length - 1]} total ${sum(s)}` }
const L1 = load('L1.parquet'), L2 = load('L2.parquet'), L2z = load('L2z.parquet')
const rows = []
const byWb2 = rowGroupsByWellbore(L2.metadata), byWb2z = rowGroupsByWellbore(L2z.metadata)
let footerColsMatch = true
const oiBytes = {}
for (const name of ['L3.parquet', 'L3d.parquet', 'L3s.parquet']) {
  const f = load(name)
  const pages = {}
  for (const c of f.metadata.row_groups[0].columns) {
    const s = Number(c.offset_index_offset)
    pages[c.meta_data.path_in_schema[0]] = { meta: c.meta_data, locs: readOffsetIndex({ view: new DataView(f.bytes, s, c.offset_index_length), offset: 0 }).page_locations }
  }
  oiBytes[name] = { pages, groupRows: Number(f.metadata.row_groups[0].num_rows), nPages: pages.depth_md.locs.length }
}
function l3(name, r) {
  const { pages, groupRows } = oiBytes[name]
  let bytes = 0, reqs = 0
  for (const col of r.columns) {
    const { meta, locs } = pages[col]
    let first = true
    locs.forEach((p, i) => {
      const ps = Number(p.first_row_index), pe = i + 1 < locs.length ? Number(locs[i + 1].first_row_index) : groupRows
      if (pe > r.rowStart && ps < r.rowEnd) { bytes += p.compressed_page_size; if (first) { reqs++; first = false; if (meta.dictionary_page_offset) { bytes += Number(locs[0].offset) - Number(meta.dictionary_page_offset); if (i > 0) reqs++ } } }
    })
  }
  return { bytes, reqs }
}
for (const r of ranges) {
  const p1 = parquetPlan({ metadata: L1.metadata, columns: r.columns, rowStart: r.rowStart, rowEnd: r.rowEnd })
  const g = byWb2.get(r.wellbore), gz = byWb2z.get(r.wellbore)
  if (JSON.stringify(g.columns) !== JSON.stringify(r.columns) || g.rowStart !== r.rowStart || g.rowEnd !== r.rowEnd) footerColsMatch = false
  const p2 = parquetPlan({ metadata: L2.metadata, columns: g.columns, rowStart: g.rowStart, rowEnd: g.rowEnd })
  const p2z = parquetPlan({ metadata: L2z.metadata, columns: gz.columns, rowStart: gz.rowStart, rowEnd: gz.rowEnd })
  const b = (p) => sum(p.fetches.map(f => f.endByte - f.startByte))
  const a3 = l3('L3.parquet', r), a3d = l3('L3d.parquet', r), a3s = l3('L3s.parquet', r)
  rows.push({ wb: r.wellbore, rows: r.rows, cols: r.columns.length, l1: b(p1), l1n: p1.fetches.length, l2: b(p2), l2n: p2.fetches.length, l2z: b(p2z), l3: a3.bytes, l3n: a3.reqs, l3d: a3d.bytes, l3dn: a3d.reqs, l3s: a3s.bytes, l3sn: a3s.reqs, l4: layouts.l4.find(e => e.wellbore === r.wellbore).bytes })
}
console.log('L2 footer-derived row ranges and column lists equal ranges.json for all wellbores:', footerColsMatch)
console.log('pages per column: L3', oiBytes['L3.parquet'].nPages, 'L3d', oiBytes['L3d.parquet'].nPages, 'L3s', oiBytes['L3s.parquet'].nPages)
console.log('wellbore\trows\tcols\tL1 bytes(req)\tL2 bytes(req)\tL2z bytes\tL3 bytes(req)\tL3d bytes(req)\tL3s bytes(req)\tL4 bytes')
for (const r of rows) console.log([r.wb, r.rows, r.cols, `${r.l1}(${r.l1n})`, `${r.l2}(${r.l2n})`, r.l2z, `${r.l3}(${r.l3n})`, `${r.l3d}(${r.l3dn})`, `${r.l3s}(${r.l3sn})`, r.l4].join('\t'))
for (const k of ['l1', 'l2', 'l2z', 'l3', 'l3d', 'l3s', 'l4', 'l1n', 'l2n', 'l3n', 'l3dn']) console.log(k, stat(rows.map(r => r[k])))
// source_wellbore discovery cost in single-row-group layouts
for (const [n, f] of [['L1', L1], ['L3', load('L3.parquet')]]) { const c = f.metadata.row_groups[0].columns[1]; console.log(n, 'source_wellbore chunk bytes', Number(c.meta_data.total_compressed_size), 'column index bytes', c.column_index_length ?? 0, 'offset index bytes', c.offset_index_length ?? 0) }
const c3 = load('L3.parquet').metadata.row_groups[0].columns
console.log('L3 offset index region bytes', Math.max(...c3.map(c => Number(c.offset_index_offset) + c.offset_index_length)) - Math.min(...c3.map(c => Number(c.offset_index_offset))), 'column index region bytes', Math.max(...c3.map(c => Number(c.column_index_offset) + c.column_index_length)) - Math.min(...c3.map(c => Number(c.column_index_offset))))
