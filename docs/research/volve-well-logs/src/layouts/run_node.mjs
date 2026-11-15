// One hyparquet measurement in a fresh Node process.
// Usage: node run_node.mjs <http|mem> <base url | data dir> <ranges.json> <layouts.json> <layout file, e.g. L2.parquet> <strategy> <query> [iters]
//   http: one run against the server; prints requests, bytes, concurrency (server log), wall time, max RSS
//   mem:  the same strategy over bytes already in memory, <iters> times; prints cold and warm-median decode time
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as hyp from '/data/dev/apps/petroviz/node_modules/hyparquet/src/index.js'
import { buildSpec, digest, strategies } from './q.mjs'
import { control, summarize } from './stats.mjs'

const [mode, where, rangesPath, layoutsPath, name, strategy, query, itersArg] = process.argv.slice(2)
const ranges = JSON.parse(readFileSync(rangesPath, 'utf8'))
const layouts = JSON.parse(readFileSync(layoutsPath, 'utf8'))
const spec = buildSpec(query, ranges, layouts)
const run = strategies[strategy]
if (!run) throw new Error(`unknown strategy ${strategy}`)
const rss = () => +(process.resourceUsage().maxRSS / 1024).toFixed(0)
const baselineRss = rss()

if (mode === 'http') {
  const io = {
    open: (n) => hyp.asyncBufferFromUrl({ url: `${where}/${n}` }),
    whole: async (n) => (await fetch(`${where}/${n}`)).arrayBuffer(),
  }
  await control(where, '/__reset')
  const t0 = performance.now()
  const out = await run(hyp, io, name, spec)
  const wallMs = performance.now() - t0
  const { cfg, log } = await control(where, '/__log')
  console.log(JSON.stringify({ env: 'node', mode, layout: name, strategy, query, cfg, wallMs: +wallMs.toFixed(0), ...summarize(log), maxRssMB: rss(), baselineRssMB: baselineRss, digest: digest(out) }))
} else {
  const cache = new Map()
  const bytes = (n) => {
    if (!cache.has(n)) { const b = readFileSync(join(where, n)); cache.set(n, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) }
    return cache.get(n)
  }
  const io = { open: async (n) => bytes(n), whole: async (n) => bytes(n) }
  // preload outside the timed region
  if (strategy === 'files') spec.wellbores.forEach(w => bytes(w.file)); else bytes(name)
  const iters = Number(itersArg ?? 7)
  const times = []
  let out
  for (let i = 0; i < iters; i++) { const t0 = performance.now(); out = await run(hyp, io, name, spec); times.push(performance.now() - t0) }
  const warm = times.slice(1).sort((a, b) => a - b)
  console.log(JSON.stringify({ env: 'node', mode, layout: name, strategy, query, coldMs: +times[0].toFixed(0), warmMedianMs: warm.length ? +warm[Math.floor(warm.length / 2)].toFixed(0) : null, maxRssMB: rss(), digest: digest(out) }))
}
