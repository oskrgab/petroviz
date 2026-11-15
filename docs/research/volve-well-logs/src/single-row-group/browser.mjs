// Real-browser check (headless Chromium): CORS + Range from a foreign origin, and decode timings in the browser's V8.
// Usage: node browser.mjs <playwright-core dir> <chrome executable> <hyparquet src dir> <url> <ranges.json>
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { createRequire } from 'node:module'

const [pwDir, exe, hypDir, url, rangesPath] = process.argv.slice(2)
const require = createRequire(import.meta.url)
const { chromium } = require(pwDir)
const ranges = JSON.parse(readFileSync(rangesPath, 'utf8'))
const pick = (w) => { const r = ranges.find(r => r.wellbore === w); return { wellbore: w, rowStart: r.rowStart, rowEnd: r.rowEnd, columns: r.columns } }

const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  if (path === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>measure</title>'); return }
  if (path.startsWith('/hyparquet/')) {
    const rel = normalize(path.slice('/hyparquet/'.length))
    if (rel.startsWith('..') || !rel.endsWith('.js')) { res.writeHead(403); res.end(); return }
    try { const body = readFileSync(join(hypDir, rel)); res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(body) } catch { res.writeHead(404); res.end() }
    return
  }
  res.writeHead(404); res.end()
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch({ executablePath: exe, headless: true })
const page = await browser.newPage()
const consoleMsgs = []
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`${m.type()}: ${m.text().slice(0, 300)}`) })
// network-level view: every request incl. redirect hops and preflights
const net = []
page.on('request', r => { if (r.url().startsWith('http') && !r.url().startsWith(origin)) net.push({ method: r.method(), host: new URL(r.url()).host, range: r.headers().range ?? null, redirectedFrom: !!r.redirectedFrom() }) })
await page.goto(origin + '/')

const result = await page.evaluate(async ({ url, big, small }) => {
  const { asyncBufferFromUrl, parquetMetadataAsync, parquetMetadata, parquetRead } = await import('/hyparquet/index.js')
  const out = { ua: navigator.userAgent, origin: location.origin, crossOriginIsolated }
  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
  const round = (x) => Math.round(x)

  const counting = () => {
    const log = []
    const fetchFn = async (input, init = {}) => {
      const h = new Headers(init.headers)
      const e = { m: init.method ?? 'GET', range: h.get('Range') }
      log.push(e)
      const res = await fetch(input, init)
      e.status = res.status; e.type = res.type; e.redirected = res.redirected
      e.finalHost = new URL(res.url).host
      e.xRepoCommit = res.headers.get('x-repo-commit')
      e.contentRange = res.headers.get('content-range')
      e.contentLength = res.headers.get('content-length')
      e.acceptRanges = res.headers.get('accept-ranges')
      e.etag = res.headers.get('etag')
      const orig = res.arrayBuffer.bind(res)
      res.arrayBuffer = async () => { const ab = await orig(); e.bytes = ab.byteLength; return ab }
      return res
    }
    return { log, fetchFn }
  }
  const sliceTo = (range, dst) => (c) => {
    const lo = range.rowStart - c.rowStart, n = range.rowEnd - range.rowStart
    if (c.columnName === 'source_wellbore' || c.columnName === 'npd_wellbore_code') { dst[c.columnName] = c.columnData.slice(lo, lo + n); return }
    const f = new Float64Array(n)
    for (let i = 0; i < n; i++) { const v = c.columnData[lo + i]; f[i] = v === null || v === undefined ? NaN : v }
    dst[c.columnName] = f
  }

  // --- HTTP: range approach vs whole file, 3 runs each, alternating ---
  out.range = []; out.whole = []
  let bytes
  for (let i = 0; i < 3; i++) {
    try {
      const c = counting(); const t0 = performance.now()
      const file = await asyncBufferFromUrl({ url, fetch: c.fetchFn })
      const tHead = performance.now()
      const metadata = await parquetMetadataAsync(file)
      const tFooter = performance.now()
      const dst = {}
      await parquetRead({ file, metadata, columns: big.columns, rowStart: big.rowStart, rowEnd: big.rowEnd, onChunk: sliceTo(big, dst) })
      const t1 = performance.now()
      out.range.push({ wallMs: round(t1 - t0), headMs: round(tHead - t0), footerMs: round(tFooter - tHead), dataMs: round(t1 - tFooter), requests: c.log.length, bytes: c.log.reduce((a, e) => a + (e.bytes ?? 0), 0), rows: dst.depth_md.length, statuses: [...new Set(c.log.map(e => e.status))], types: [...new Set(c.log.map(e => e.type))], sample: i === 0 ? c.log.slice(0, 3) : undefined })
    } catch (err) { out.range.push({ error: String(err) }) }
    try {
      const c = counting(); const t0 = performance.now()
      const res = await c.fetchFn(url)
      bytes = await res.arrayBuffer()
      const tDl = performance.now()
      const dst = {}
      await parquetRead({ file: bytes, metadata: parquetMetadata(bytes), columns: big.columns, rowStart: big.rowStart, rowEnd: big.rowEnd, onChunk: sliceTo(big, dst) })
      const t1 = performance.now()
      out.whole.push({ wallMs: round(t1 - t0), downloadMs: round(tDl - t0), decodeMs: round(t1 - tDl), requests: c.log.length, bytes: c.log[0].bytes, sample: i === 0 ? c.log[0] : undefined })
    } catch (err) { out.whole.push({ error: String(err) }) }
  }
  out.protocols = [...new Set(performance.getEntriesByType('resource').filter(e => !e.name.startsWith(location.origin)).map(e => `${new URL(e.name).host} ${e.nextHopProtocol || '(hidden)'}`))]

  // --- in-memory decode in the browser's V8 ---
  if (bytes) {
    const time = async (fn, n = 5) => { const t = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); await fn(); t.push(performance.now() - t0) } return { coldMs: round(t[0]), warmMedianMs: round(median(t.slice(1))) } }
    out.decode = {}
    out.decode.sw_only = await time(async () => { let col; await parquetRead({ file: bytes, columns: ['source_wellbore'], onChunk: c => { col = c.columnData } }) })
    out.decode.wb_big_ownCols = await time(async () => { const d = {}; await parquetRead({ file: bytes, columns: big.columns, rowStart: big.rowStart, rowEnd: big.rowEnd, onChunk: sliceTo(big, d) }) })
    out.decode.wb_small_ownCols = await time(async () => { const d = {}; await parquetRead({ file: bytes, columns: small.columns, rowStart: small.rowStart, rowEnd: small.rowEnd, onChunk: sliceTo(small, d) }) })
    out.decode.wb_big_allCols = await time(async () => { const d = {}; await parquetRead({ file: bytes, rowStart: big.rowStart, rowEnd: big.rowEnd, onChunk: sliceTo(big, d) }) })
    out.decode.all_onChunk = await time(async () => { const d = {}; await parquetRead({ file: bytes, onChunk: c => { d[c.columnName] = c.columnData } }) })
    out.jsHeap = performance.memory ? { usedMB: round(performance.memory.usedJSHeapSize / 1048576), totalMB: round(performance.memory.totalJSHeapSize / 1048576), limitMB: round(performance.memory.jsHeapSizeLimit / 1048576) } : null
  }
  return out
}, { url, big: pick('15/9-F-1 B'), small: pick('15/9-F-15 B') })

const hops = {}
for (const n of net) { const k = `${n.method} ${n.host}${n.redirectedFrom ? ' (redirect hop)' : ''}`; hops[k] = (hops[k] ?? 0) + 1 }
console.log(JSON.stringify({ result, networkRequestsByKind: hops, consoleMsgs }, null, 1))
await browser.close()
server.close()
