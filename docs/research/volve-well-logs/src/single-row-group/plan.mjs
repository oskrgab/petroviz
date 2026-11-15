// What hyparquet would fetch per wellbore (own columns), computed from the footer only. No network.
// Usage: node plan.mjs <file.parquet> <ranges.json>
import { readFileSync } from 'node:fs'
import { parquetMetadata } from '/data/dev/apps/petroviz/node_modules/hyparquet/src/index.js'
import { parquetPlan } from '/data/dev/apps/petroviz/node_modules/hyparquet/src/plan.js'

const b = readFileSync(process.argv[2])
const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
const ranges = JSON.parse(readFileSync(process.argv[3], 'utf8'))
const metadata = parquetMetadata(bytes)
const cols = metadata.row_groups[0].columns
const comp = Object.fromEntries(cols.map(c => [c.meta_data.path_in_schema[0], Number(c.meta_data.total_compressed_size)]))
const uncomp = Object.fromEntries(cols.map(c => [c.meta_data.path_in_schema[0], Number(c.meta_data.total_uncompressed_size)]))
const bloom = cols.reduce((a, c) => a + (c.meta_data.bloom_filter_length ?? 0), 0)
const firstBloom = Math.min(...cols.filter(c => c.meta_data.bloom_filter_offset).map(c => Number(c.meta_data.bloom_filter_offset)))
console.log(JSON.stringify({ bloomFilterBytes: bloom, bloomStart: firstBloom, columnsWithBloom: cols.filter(c => c.meta_data.bloom_filter_offset).length, hasAnyColumnIndex: cols.some(c => c.column_index_offset), hasAnyOffsetIndex: cols.some(c => c.offset_index_offset) }))

const sum = (names, m) => names.reduce((a, n) => a + m[n], 0)
console.log('wellbore\trows\tcols\tcompBytesOwnCols\t%ofFile\tuncompBytes\tplannedDataFetches\tplannedFetchBytes\tfetchesWithOffsetIndexFlag')
const all = []
for (const r of ranges) {
  const plan = parquetPlan({ metadata, columns: r.columns, rowStart: r.rowStart, rowEnd: r.rowEnd })
  const planOI = parquetPlan({ metadata, columns: r.columns, rowStart: r.rowStart, rowEnd: r.rowEnd, useOffsetIndex: true })
  const fetchBytes = plan.fetches.reduce((a, f) => a + f.endByte - f.startByte, 0)
  const c = sum(r.columns, comp)
  all.push({ c, n: plan.fetches.length, fetchBytes })
  console.log([r.wellbore, r.rows, r.columns.length, c, (100 * c / bytes.byteLength).toFixed(1), sum(r.columns, uncomp), plan.fetches.length, fetchBytes, planOI.fetches.length].join('\t'))
}
const sorted = all.map(a => a.fetchBytes).sort((a, b) => a - b)
console.log(JSON.stringify({ minFetchBytes: sorted[0], medianFetchBytes: sorted[Math.floor(sorted.length / 2)], maxFetchBytes: sorted[sorted.length - 1], minReq: Math.min(...all.map(a => a.n)), maxReq: Math.max(...all.map(a => a.n)) }))
// a few fixed column sets, for scale
for (const set of [['source_wellbore'], ['npd_wellbore_code', 'source_wellbore', 'depth_md'], ['source_wellbore', 'depth_md', 'GR'], ['source_wellbore', 'depth_md', 'GR', 'RT', 'RHOB', 'NPHI', 'DT'], ['source_wellbore', 'depth_md', 'VSH', 'PHIF', 'SW', 'KLOGH']]) {
  const plan = parquetPlan({ metadata, columns: set })
  console.log(set.join('+'), 'comp', sum(set, comp), 'fetches', plan.fetches.length, 'fetchBytes', plan.fetches.reduce((a, f) => a + f.endByte - f.startByte, 0))
}
const planAll = parquetPlan({ metadata })
console.log('all columns (no columns option): fetches', planAll.fetches.length, 'bytes', planAll.fetches.reduce((a, f) => a + f.endByte - f.startByte, 0))
