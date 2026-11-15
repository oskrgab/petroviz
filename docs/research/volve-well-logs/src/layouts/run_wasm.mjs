// DuckDB-WASM (petroviz's 1.32.0, "eh" bundle) in headless Chromium, one fresh browser per query.
// Usage: node run_wasm.mjs <playwright-core dir> <chrome exe> <duckdb-wasm dist dir> <bundle.mjs> <data base url> <control base url> <out.jsonl> <runs> <delay> <mbit> <layout files...>
import { createServer } from 'node:http'
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { control, summarize } from './stats.mjs'

const [pwDir, exe, distDir, bundlePath, dataBase, controlBase, outPath, runsArg, delay, mbit, ...files] = process.argv.slice(2)
const { chromium } = createRequire(import.meta.url)(pwDir)
const statics = {
  '/duckdb-bundle.mjs': [bundlePath, 'text/javascript'],
  '/duckdb-eh.wasm': [join(distDir, 'duckdb-eh.wasm'), 'application/wasm'],
  '/duckdb-browser-eh.worker.js': [join(distDir, 'duckdb-browser-eh.worker.js'), 'text/javascript'],
}
const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  if (path === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>measure</title>'); return }
  const s = statics[path]
  if (!s) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': s[1] }); res.end(readFileSync(s[0]))
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`
const curveSets = { raw: 'GR, RHOB, NPHI', interp: 'VSH, PHIF, SW' }
const sql = (url, qid, curves) => ({
  D1: `SELECT depth_md, ${curveSets[curves]} FROM read_parquet('${url}') WHERE source_wellbore = '15/9-F-1 B'`,
  D2: `SELECT source_wellbore, depth_md, ${curveSets[curves]} FROM read_parquet('${url}')`,
  D3: `SELECT * FROM read_parquet('${url}') WHERE source_wellbore = '15/9-F-1 B'`,
})[qid]

await control(controlBase, `/__config?delay=${delay}&mbit=${mbit}`)
for (const file of files) {
  for (const [qid, curves] of [['D1', 'raw'], ['D2', 'raw'], ['D1', 'interp'], ['D2', 'interp'], ['D3', 'raw']]) {
    const runs = []
    for (let i = 0; i < Number(runsArg); i++) {
      const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--ignore-certificate-errors'] })
      const page = await browser.newPage()
      const external = new Set()
      page.on('request', r => { const h = new URL(r.url()).host; if (!h.startsWith('127.0.0.1')) external.add(h) })
      await page.goto(origin + '/')
      let r
      try {
        const version = await page.evaluate(async () => {
          const duckdb = await import('/duckdb-bundle.mjs')
          const worker = new Worker('/duckdb-browser-eh.worker.js')
          const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker)
          await db.instantiate('/duckdb-eh.wasm')
          globalThis.conn = await db.connect()
          // the same setup petroviz does in src/lib/data/db.ts: without it every query downloads the whole file
          await globalThis.conn.query('SET builtin_httpfs = false; LOAD httpfs;')
          await globalThis.conn.query('SET enable_http_metadata_cache = true; SET enable_object_cache = true;')
          // load the parquet extension now, so its download from extensions.duckdb.org is not inside the timed query
          await globalThis.conn.query('LOAD parquet;')
          const v = await globalThis.conn.query('SELECT version() AS v')
          return v.toArray()[0].v
        })
        await control(controlBase, '/__reset')
        r = await page.evaluate(async (q) => {
          const t0 = performance.now()
          const t = await globalThis.conn.query(q)
          return { wallMs: Math.round(performance.now() - t0), rows: t.numRows, cols: t.numCols }
        }, sql(`${dataBase}/${file}`, qid, curves))
        r.duckdb = version
      } catch (err) { r = { error: String(err).slice(0, 400) } }
      const { cfg, log } = await control(controlBase, '/__log')
      runs.push({ ...r, cfg, ...summarize(log), external: [...external] })
      await browser.close()
    }
    const walls = runs.map(r => r.wallMs).sort((a, b) => a - b)
    const line = { env: 'duckdb-wasm', layout: file, query: qid, curves: qid === 'D3' ? null : curves, ...runs[0], wallMs: walls[Math.floor(walls.length / 2)], wallAll: runs.map(r => r.wallMs), requestsAll: runs.map(r => r.requests) }
    appendFileSync(outPath, JSON.stringify(line) + '\n')
    console.log(JSON.stringify(line))
  }
}
server.close()
