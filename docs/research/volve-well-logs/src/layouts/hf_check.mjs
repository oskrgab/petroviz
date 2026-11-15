// Does Chromium serialise concurrent Range requests to one URL on the real host? 8 x 256 kB ranges, issued together.
// Usage: node hf_check.mjs <playwright-core dir> <chrome exe> <url>
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
const [pwDir, exe, url] = process.argv.slice(2)
const { chromium } = createRequire(import.meta.url)(pwDir)
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html>') })
await new Promise(r => server.listen(0, '127.0.0.1', r))
for (const cache of [undefined, 'no-store']) {
  const browser = await chromium.launch({ executablePath: exe, headless: true })
  const page = await browser.newPage()
  const reqs = []
  page.on('requestfinished', r => { if (r.url().startsWith('http') && !r.url().includes('127.0.0.1')) reqs.push({ host: new URL(r.url()).host, range: r.headers().range, t: r.timing(), redirected: !!r.redirectedFrom() }) })
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  const res = await page.evaluate(async ({ url, cache }) => {
    // warm the connection and the redirect first
    await (await fetch(url, { headers: { Range: 'bytes=0-3' }, cache: 'no-store' })).arrayBuffer()
    const t0 = performance.now()
    const spans = await Promise.all(Array.from({ length: 8 }, async (_, i) => {
      const s = performance.now() - t0
      const r = await fetch(url, { headers: { Range: `bytes=${i * 2000000}-${i * 2000000 + 262143}` }, ...(cache ? { cache } : {}) })
      const h = performance.now() - t0
      const b = await r.arrayBuffer()
      return { i, status: r.status, bytes: b.byteLength, startMs: Math.round(s), headersMs: Math.round(h), doneMs: Math.round(performance.now() - t0), cacheControl: r.headers.get('cache-control') }
    }))
    return { wallMs: Math.round(performance.now() - t0), spans }
  }, { url, cache })
  // server-side view from the browser's network stack: when was each request actually sent, when did it end
  const fin = reqs.filter(r => r.range && r.range !== 'bytes=0-3').map(r => ({ host: r.host, send: r.t.startTime + r.t.requestStart, end: r.t.startTime + r.t.responseEnd }))
  const ev = fin.flatMap(f => [[f.send, 1], [f.end, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let cur = 0, max = 0
  for (const [, d] of ev) { cur += d; max = Math.max(max, cur) }
  console.log(JSON.stringify({ fetchCache: cache ?? 'default', wallMs: res.wallMs, headersMs: res.spans.map(s => s.headersMs), doneMs: res.spans.map(s => s.doneMs), statuses: [...new Set(res.spans.map(s => s.status))], cacheControl: res.spans[0].cacheControl, hops: fin.length, maxInFlightOnWire: max }))
  await browser.close()
}
server.close()
