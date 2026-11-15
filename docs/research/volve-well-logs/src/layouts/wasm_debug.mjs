// Debug: which requests DuckDB-WASM makes and what the worker logs.
// Usage: node wasm_debug.mjs <playwright-core dir> <chrome exe> <dist dir> <bundle.mjs> <data url> [presql...]
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const [pwDir, exe, distDir, bundlePath, url, ...pre] = process.argv.slice(2)
const { chromium } = createRequire(import.meta.url)(pwDir)
const statics = { '/duckdb-bundle.mjs': [bundlePath, 'text/javascript'], '/duckdb-eh.wasm': [join(distDir, 'duckdb-eh.wasm'), 'application/wasm'], '/duckdb-browser-eh.worker.js': [join(distDir, 'duckdb-browser-eh.worker.js'), 'text/javascript'] }
const server = createServer((req, res) => { const p = new URL(req.url, 'http://x').pathname; if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html>'); return } const s = statics[p]; if (!s) { res.writeHead(404); res.end(); return } res.writeHead(200, { 'content-type': s[1] }); res.end(readFileSync(s[0])) })
await new Promise(r => server.listen(0, '127.0.0.1', r))
const browser = await chromium.launch({ executablePath: exe, headless: true })
const ctx = await browser.newContext()
const page = await ctx.newPage()
page.on('console', m => console.log('console', m.type(), m.text().slice(0, 300)))
ctx.on('request', r => console.log('req', r.method(), r.url().slice(0, 120), JSON.stringify(r.headers().range ?? null)))
await page.goto(`http://127.0.0.1:${server.address().port}/`)
const out = await page.evaluate(async ({ url, pre }) => {
  const duckdb = await import('/duckdb-bundle.mjs')
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), new Worker('/duckdb-browser-eh.worker.js'))
  await db.instantiate('/duckdb-eh.wasm')
  const conn = await db.connect()
  for (const q of pre) await conn.query(q)
  const t = await conn.query(`SELECT count(*) AS n, count(GR) AS g FROM read_parquet('${url}') WHERE source_wellbore = '15/9-F-1 B'`)
  const ext = await conn.query(`SELECT extension_name, loaded, installed FROM duckdb_extensions() WHERE loaded`)
  return { r: t.toArray().map(x => x.toJSON()).map(o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v)]))), ext: ext.toArray().map(x => x.extension_name) }
}, { url, pre })
console.log(JSON.stringify(out))
await browser.close(); server.close()
