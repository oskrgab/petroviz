// hyparquet measurements in headless Chromium, one fresh browser per job.
// Usage: node run_browser.mjs <playwright-core dir> <chrome exe> <hyparquet src dir> <data base url> <control base url> <ranges.json> <layouts.json> <jobs.json> <out.jsonl>
//   jobs.json: [{ mode: 'http'|'mem'|'noop', layout, strategy, query, iters?, cfg: {delay, mbit}, tag? }]
// The page is served from its own origin, so every data request is cross-origin (CORS), as in production.
import { createServer } from 'node:http'
import { appendFileSync, readFileSync } from 'node:fs'
import { dirname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { control, summarize } from './stats.mjs'

const [pwDir, exe, hypDir, dataBase, controlBase, rangesPath, layoutsPath, jobsPath, outPath] = process.argv.slice(2)
const { chromium } = createRequire(import.meta.url)(pwDir)
const here = dirname(fileURLToPath(import.meta.url))
const ranges = JSON.parse(readFileSync(rangesPath, 'utf8'))
const layouts = JSON.parse(readFileSync(layoutsPath, 'utf8'))
const jobs = JSON.parse(readFileSync(jobsPath, 'utf8'))

const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  if (path === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>measure</title>'); return }
  let file
  if (path === '/q.mjs') file = join(here, 'q.mjs')
  else if (path.startsWith('/hyparquet/')) {
    const rel = normalize(path.slice('/hyparquet/'.length))
    if (!rel.startsWith('..') && rel.endsWith('.js')) file = join(hypDir, rel)
  }
  try { const body = readFileSync(file); res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(body) } catch { res.writeHead(404); res.end() }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

function rendererPeakMB(pids) {
  let max = 0
  for (const pid of pids) {
    try {
      const m = /VmHWM:\s+(\d+) kB/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))
      if (m) max = Math.max(max, Number(m[1]) / 1024)
    } catch { /* gone */ }
  }
  return +max.toFixed(0)
}

for (const job of jobs) {
  await control(controlBase, `/__config?delay=${job.cfg?.delay ?? 0}&mbit=${job.cfg?.mbit ?? 0}`)
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--ignore-certificate-errors', '--enable-precise-memory-info'] })
  const page = await browser.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)))
  await page.goto(origin + '/')
  await control(controlBase, '/__reset')
  let result
  try {
    result = await page.evaluate(async ({ job, dataBase, ranges, layouts }) => {
      const hyp = await import('/hyparquet/index.js')
      const { buildSpec, digest, strategies } = await import('/q.mjs')
      if (job.mode === 'noop') return { noop: true }
      const spec = buildSpec(job.query, ranges, layouts)
      const run = strategies[job.strategy]
      if (job.mode === 'http') {
        const io = {
          // fetchCache 'no-store' keeps Chromium's HTTP cache (and its per-URL entry lock) out of the way
          open: (n) => hyp.asyncBufferFromUrl({ url: `${dataBase}/${n}`, requestInit: job.fetchCache ? { cache: job.fetchCache } : undefined }),
          whole: async (n) => (await fetch(`${dataBase}/${n}`, job.fetchCache ? { cache: job.fetchCache } : undefined)).arrayBuffer(),
        }
        const t0 = performance.now()
        const out = await run(hyp, io, job.layout, spec)
        return { wallMs: Math.round(performance.now() - t0), digest: digest(out), jsHeapMB: Math.round(performance.memory.usedJSHeapSize / 1048576) }
      }
      const cache = new Map()
      const need = job.strategy === 'files' ? spec.wellbores.map(w => w.file) : [job.layout]
      for (const n of need) cache.set(n, await (await fetch(`${dataBase}/${n}`)).arrayBuffer())
      const io = { open: async (n) => cache.get(n), whole: async (n) => cache.get(n) }
      const times = []
      let out
      for (let i = 0; i < (job.iters ?? 7); i++) { const t0 = performance.now(); out = await run(hyp, io, job.layout, spec); times.push(performance.now() - t0) }
      const warm = times.slice(1).sort((a, b) => a - b)
      return { coldMs: Math.round(times[0]), warmMedianMs: Math.round(warm[Math.floor(warm.length / 2)]), digest: digest(out) }
    }, { job, dataBase, ranges, layouts })
  } catch (err) { result = { error: String(err).slice(0, 300) } }
  const cdp = await browser.newBrowserCDPSession()
  const { processInfo } = await cdp.send('SystemInfo.getProcessInfo')
  const peak = rendererPeakMB(processInfo.filter(p => p.type === 'renderer').map(p => p.id))
  const { cfg, log } = await control(controlBase, '/__log')
  const line = { env: 'chromium', proto: dataBase.startsWith('https') ? 'h2' : 'h1', ...job, cfg, ...result, ...(job.mode === 'http' ? summarize(log) : {}), rendererPeakRssMB: peak, errors: errors.length ? errors : undefined }
  appendFileSync(outPath, JSON.stringify(line) + '\n')
  const { digest: _d, ...short } = line
  console.log(JSON.stringify(short))
  await browser.close()
}
server.close()
