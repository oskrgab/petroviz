// Row ranges per source_wellbore, non-null columns per wellbore, and log_curves cross-check.
// Usage: node explore.mjs <petrophysical_interpretation.parquet> <log_curves.parquet> [out.json]
import { readFileSync, writeFileSync } from 'node:fs'
import { parquetMetadata, parquetRead, parquetReadObjects } from '/data/dev/apps/petroviz/node_modules/hyparquet/src/index.js'

const load = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }
const main = load(process.argv[2])
const curvesBuf = load(process.argv[3])

const cmd = parquetMetadata(curvesBuf)
console.log('log_curves schema:', cmd.schema.slice(1).map(s => `${s.name}:${s.type}`).join(', '), 'rows', Number(cmd.num_rows), 'codec', cmd.row_groups[0].columns[0].meta_data.codec)
const curves = await parquetReadObjects({ file: curvesBuf })
console.log('log_curves sample:', JSON.stringify(curves.slice(0, 3), (k, v) => typeof v === 'bigint' ? Number(v) : v))

const md = parquetMetadata(main)
const cols = {}
await parquetRead({ file: main, metadata: md, onChunk: ({ columnName, columnData, rowStart }) => {
  if (rowStart !== 0) throw new Error('unexpected multi-chunk')
  cols[columnName] = columnData
} })
const names = md.schema.slice(1).map(s => s.name)
const sw = cols.source_wellbore
const ranges = []
let start = 0
for (let i = 1; i <= sw.length; i++) {
  if (i === sw.length || sw[i] !== sw[start]) { ranges.push({ wellbore: sw[start], rowStart: start, rowEnd: i, rows: i - start }); start = i }
}
const seen = new Set()
for (const r of ranges) { if (seen.has(r.wellbore)) console.log('NON-CONTIGUOUS', r.wellbore); seen.add(r.wellbore) }
for (const r of ranges) {
  r.columns = names.filter(n => {
    const c = cols[n]
    for (let i = r.rowStart; i < r.rowEnd; i++) if (c[i] !== null && c[i] !== undefined) return true
    return false
  })
  const listed = new Set(curves.filter(c => c.source_wellbore === r.wellbore).map(c => c.mnemonic ?? c.curve ?? c.column))
  r.listedInLogCurves = listed.size
  const dataCurves = r.columns.filter(n => !['npd_wellbore_code', 'source_wellbore', 'depth_md'].includes(n))
  r.matchesLogCurves = dataCurves.length === listed.size && dataCurves.every(n => listed.has(n))
}
console.log('wellbore\trowStart\trowEnd\trows\tnonNullCols\tlistedCurves\tmatch')
for (const r of ranges) console.log([r.wellbore, r.rowStart, r.rowEnd, r.rows, r.columns.length, r.listedInLogCurves, r.matchesLogCurves].join('\t'))
console.log('array types:', names.slice(0, 5).map(n => `${n}:${cols[n].constructor.name}`).join(', '))
console.log('depth_md sample', cols.depth_md.slice(0, 3), 'GR sample', cols.GR.slice(0, 3), 'npd', cols.npd_wellbore_code.slice(0, 2))
for (const w of ['15/9-F-1 B', '15/9-F-15 B']) console.log(w, JSON.stringify(ranges.find(r => r.wellbore === w)))
if (process.argv[4]) writeFileSync(process.argv[4], JSON.stringify(ranges, null, 1))
