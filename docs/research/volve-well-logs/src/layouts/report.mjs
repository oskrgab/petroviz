// Turn out/*.jsonl into markdown tables.
// Usage: node report.mjs <out dir>
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
const read = (n) => existsSync(join(dir, n)) ? readFileSync(join(dir, n), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
const node = read('node.jsonl')
const bPar = read('browser-h2-parallel.jsonl'), bDef = read('browser-h2-default.jsonl'), bH1 = read('browser-h1-parallel.jsonl'), bMem = read('browser-mem.jsonl')
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : undefined }
const mb = (b) => b === undefined ? '' : (b / 1e6).toFixed(2)
const s = (ms) => ms === undefined || ms === null ? '' : (ms / 1000).toFixed(2)
const labels = {
  'L1.parquet/cols': 'L1, one read of the needed columns', 'L1.parquet/perwell': 'L1, one read per wellbore (naive)',
  'L1p.parquet/cols': 'L1p (pyarrow rewrite, dict, 20k-row pages), one read',
  'L2.parquet/perwell': 'L2, plain hyparquet', 'L2.parquet/rg1': 'L2, + row-group wrapper',
  'L3.parquet/oi': 'L3, useOffsetIndex', 'L3.parquet/oitail': 'L3, useOffsetIndex + tail wrapper', 'L3.parquet/cols': 'L3, offset index not used',
  'L3d.parquet/oi': 'L3d (dictionary on), useOffsetIndex', 'L3d.parquet/oitail': 'L3d (dictionary on), + tail wrapper',
  'L3s.parquet/oitail': 'L3s (5k-row pages), + tail wrapper', 'L4/files': 'L4, whole file per wellbore',
}
const queries = ['QA-big', 'QA-small', 'QB-4', 'QB-21', 'QC-4']
const digests = {}
for (const q of queries) {
  console.log(`\n### ${q}\n`)
  console.log('| layout, reader | req | MB | max in flight: as issued (Node) / Chromium default fetch | 80 ms: Node | Chromium no-store h2 | Chromium no-store h1 | Chromium default fetch | 80 ms + 20 Mbit: Node | Chromium no-store h2 | decode warm (cold) s: Node | Chromium | peak RSS MB: Node | renderer |')
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
  for (const key of Object.keys(labels)) {
    const [layout, strategy] = key.split('/')
    const is = (r) => r.layout === layout && r.strategy === strategy && r.query === q
    const n0 = node.find(r => is(r) && r.mode === 'http' && r.cfg.mbit === 0)
    if (!n0) continue
    const n20 = node.find(r => is(r) && r.mode === 'http' && r.cfg.mbit === 20)
    const nm = node.find(r => is(r) && r.mode === 'mem')
    const p0 = bPar.filter(r => is(r) && r.cfg.mbit === 0), p20 = bPar.find(r => is(r) && r.cfg.mbit === 20)
    const d0 = bDef.find(is), h1 = bH1.find(is), bm = bMem.find(is)
    for (const r of [n0, n20, nm, ...p0, p20, d0, h1, bm]) if (r?.digest) (digests[q] ??= new Set()).add(JSON.stringify(r.digest))
    const consistent = [n0, n20, ...p0, p20, d0, h1].filter(Boolean).every(r => r.requests === n0.requests && r.bytes === n0.bytes)
    console.log(`| ${labels[key]} | ${n0.requests}${consistent ? '' : ' (!)'} | ${mb(n0.bytes)} | ${n0.maxInFlight} / ${d0?.maxInFlight ?? ''} | ${s(n0.wallMs)} | ${s(median(p0.map(r => r.wallMs)))} | ${s(h1?.wallMs)} | ${s(d0?.wallMs)} | ${s(n20?.wallMs)} | ${s(p20?.wallMs)} | ${nm ? `${s(nm.warmMedianMs)} (${s(nm.coldMs)})` : ''} | ${bm ? `${s(bm.warmMedianMs)} (${s(bm.coldMs)})` : ''} | ${n0.maxRssMB} | ${p0.length ? Math.max(...p0.map(r => r.rendererPeakRssMB)) : ''} |`)
  }
}
console.log('\nresult digests per query (1 = every layout and reader returned identical arrays):', Object.fromEntries(Object.entries(digests).map(([k, v]) => [k, v.size])))
const noop = bPar.find(r => r.mode === 'noop')
console.log('baselines: Node process with hyparquet loaded', node.find(r => r.baselineRssMB)?.baselineRssMB, 'MB; Chromium renderer on an empty page with hyparquet imported', noop?.rendererPeakRssMB, 'MB')
const errs = [...bPar, ...bDef, ...bH1, ...bMem].filter(r => r.error || r.errors)
console.log('browser errors:', errs.length, errs.slice(0, 3).map(r => `${r.layout}/${r.strategy}/${r.query}: ${r.error ?? r.errors}`))

// DuckDB
const dq = { D1: 'three curves, one wellbore', D2: 'three curves, every wellbore', D3: 'SELECT * for one wellbore' }
const duck0 = read('duck-delay.jsonl'), duck20 = read('duck-cap.jsonl'), wasm0 = read('wasm-delay.jsonl'), wasm20 = read('wasm-cap.jsonl')
for (const [qid, curves] of [['D1', 'raw'], ['D2', 'raw'], ['D1', 'interp'], ['D2', 'interp'], ['D3', null]]) {
  console.log(`\n### DuckDB ${qid}: ${dq[qid]}${curves ? ` (${curves === 'raw' ? 'GR, RHOB, NPHI' : 'VSH, PHIF, SW'})` : ''}\n`)
  console.log('| layout | engine | req (HEAD+GET) | MB | in flight | 80 ms s | +20 Mbit s |')
  console.log('|---|---|---|---|---|---|---|')
  for (const layout of ['L1.parquet', 'L2.parquet', 'L3.parquet']) {
    const is = (r) => r.layout === layout && r.query === qid && (r.curves ?? null) === curves
    const groups = new Map()
    for (const r of duck0.filter(is)) groups.set(`native ${r.duckdb}, threads=${r.threads}`, [r, duck20.find(x => is(x) && x.duckdb === r.duckdb && x.threads === r.threads)])
    for (const r of wasm0.filter(is)) groups.set(`WASM ${r.duckdb} in Chromium`, [r, wasm20.find(is)])
    for (const [name, [a, b]] of groups) console.log(`| ${layout.replace('.parquet', '')} | ${name} | ${a.requests} (${a.head}+${a.get})${new Set(a.requestsAll).size > 1 ? ` [${a.requestsAll}]` : ''} | ${mb(a.bytes)} | ${a.maxInFlight} | ${s(a.wallMs)} | ${s(b?.wallMs)} |`)
  }
}
