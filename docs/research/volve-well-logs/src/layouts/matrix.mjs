// The hyparquet measurement matrix.
// Usage: node matrix.mjs node <base url> <data dir> <ranges.json> <layouts.json> <out.jsonl>     runs every Node job
//        node matrix.mjs jobs <kind> <out jobs.json>                                              writes a browser job list
import { execFileSync } from 'node:child_process'
import { appendFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { control } from './stats.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const ALL = ['QA-big', 'QA-small', 'QB-4', 'QB-21', 'QC-4']
const QA = ['QA-big', 'QA-small']
export const combos = [
  ['L1.parquet', 'cols', ALL],
  ['L1.parquet', 'perwell', ['QB-4', 'QC-4']], // naive: one independent read per wellbore
  ['L1p.parquet', 'cols', QA],
  ['L2.parquet', 'perwell', ALL],
  ['L2.parquet', 'rg1', ALL],
  ['L3.parquet', 'oi', ALL],
  ['L3.parquet', 'oitail', ALL],
  ['L3.parquet', 'cols', ALL],
  ['L3d.parquet', 'oi', QA],
  ['L3d.parquet', 'oitail', QA],
  ['L3s.parquet', 'oitail', [...QA, 'QC-4']],
  ['L4', 'files', ALL],
].flatMap(([layout, strategy, queries]) => queries.map(query => ({ layout, strategy, query })))

const [cmd, ...rest] = process.argv.slice(2)
if (cmd === 'node') {
  const [base, dataDir, ranges, layouts, outPath] = rest
  const one = (mode, where, c, extra = []) => JSON.parse(execFileSync('node', [join(here, 'run_node.mjs'), mode, where, ranges, layouts, c.layout, c.strategy, c.query, ...extra], { encoding: 'utf8', maxBuffer: 1 << 26 }))
  for (const c of combos) {
    for (const [cfg, runs] of [[{ delay: 80, mbit: 0 }, 3], [{ delay: 80, mbit: 20 }, 1]]) {
      await control(base, `/__config?delay=${cfg.delay}&mbit=${cfg.mbit}`)
      const rs = []
      for (let i = 0; i < runs; i++) rs.push(one('http', base, c))
      const walls = rs.map(r => r.wallMs).sort((a, b) => a - b)
      const line = { ...rs[0], wallMs: walls[Math.floor(walls.length / 2)], wallAll: rs.map(r => r.wallMs), maxRssMB: Math.max(...rs.map(r => r.maxRssMB)), inFlightAll: rs.map(r => r.maxInFlight) }
      appendFileSync(outPath, JSON.stringify(line) + '\n')
      console.log(`${c.layout} ${c.strategy} ${c.query} delay${cfg.delay} mbit${cfg.mbit}: req ${line.requests} bytes ${line.bytes} wall ${line.wallMs} inflight ${line.maxInFlight} rss ${line.maxRssMB}`)
    }
    const m = one('mem', dataDir, c, ['7'])
    appendFileSync(outPath, JSON.stringify(m) + '\n')
    console.log(`${c.layout} ${c.strategy} ${c.query} mem: cold ${m.coldMs} warm ${m.warmMedianMs} rss ${m.maxRssMB}`)
  }
} else if (cmd === 'jobs') {
  const [kind, outPath] = rest
  const jobs = []
  if (kind === 'parallel') { // fetch cache: 'no-store' -> requests really go out in parallel
    jobs.push({ mode: 'noop' })
    for (const c of combos) {
      jobs.push({ mode: 'http', ...c, cfg: { delay: 80, mbit: 0 }, fetchCache: 'no-store' })
      jobs.push({ mode: 'http', ...c, cfg: { delay: 80, mbit: 0 }, fetchCache: 'no-store', rep: 2 })
      jobs.push({ mode: 'http', ...c, cfg: { delay: 80, mbit: 0 }, fetchCache: 'no-store', rep: 3 })
      jobs.push({ mode: 'http', ...c, cfg: { delay: 80, mbit: 20 }, fetchCache: 'no-store' })
    }
  } else if (kind === 'parallel1') { // one run each, no bandwidth cap (used for HTTP/1.1, where Chromium allows 6 connections per host)
    for (const c of combos) jobs.push({ mode: 'http', ...c, cfg: { delay: 80, mbit: 0 }, fetchCache: 'no-store' })
  } else if (kind === 'default') { // plain fetch, as hyparquet issues it
    for (const c of combos) jobs.push({ mode: 'http', ...c, cfg: { delay: 80, mbit: 0 } })
  } else if (kind === 'mem') {
    for (const c of combos) jobs.push({ mode: 'mem', ...c, iters: 7 })
  }
  writeFileSync(outPath, JSON.stringify(jobs))
  console.log(jobs.length, 'jobs')
}
