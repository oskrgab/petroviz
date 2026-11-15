// Static file server for measurements: Range, CORS, per-request delay, shared bandwidth cap, request log.
// Usage: node server.mjs <root dir> <http port> [<https/h2 port> <key.pem> <cert.pem>]
// Control (not logged):  /__config?delay=80&mbit=20   /__reset   /__log
import { createServer } from 'node:http'
import { createSecureServer } from 'node:http2'
import { readFileSync, statSync } from 'node:fs'
import { join, normalize, resolve } from 'node:path'

const [rootArg, portArg, tlsPortArg, keyPath, certPath] = process.argv.slice(2)
const root = resolve(rootArg)
const cfg = { delay: 0, mbit: 0 }
let log = []
let seq = 0
const cache = new Map()
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function load(rel) {
  const p = join(root, normalize(rel))
  if (!p.startsWith(root + '/')) return null
  let b = cache.get(p)
  if (!b) {
    try { if (!statSync(p).isFile()) return null; b = readFileSync(p) } catch { return null }
    cache.set(p, b)
  }
  return b
}

// one shared link: every chunk of every response reserves its slot on the same clock
let linkFreeAt = 0
async function pace(n) {
  if (!cfg.mbit) return
  const bytesPerMs = cfg.mbit * 1e6 / 8 / 1000
  const now = performance.now()
  const start = Math.max(now, linkFreeAt)
  linkFreeAt = start + n / bytesPerMs
  const wait = linkFreeAt - now
  if (wait >= 1) await sleep(wait)
}

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-allow-headers': 'Range',
  'access-control-expose-headers': 'Content-Range, Content-Length, Accept-Ranges, ETag',
  'cross-origin-resource-policy': 'cross-origin',
  'cache-control': 'no-store',
}

async function handle(req, res) {
  const u = new URL(req.url, 'http://x')
  if (u.pathname === '/__config') {
    for (const k of ['delay', 'mbit']) if (u.searchParams.has(k)) cfg[k] = Number(u.searchParams.get(k))
    res.writeHead(200, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify(cfg)); return
  }
  if (u.pathname === '/__reset') { log = []; linkFreeAt = 0; res.writeHead(200, cors); res.end('ok'); return }
  if (u.pathname === '/__log') { res.writeHead(200, { 'content-type': 'application/json', ...cors }); res.end(JSON.stringify({ cfg, log })); return }

  const e = { id: seq++, method: req.method, path: decodeURIComponent(u.pathname), range: req.headers.range ?? null, http: req.httpVersion, t0: performance.now(), bytes: 0 }
  log.push(e)
  const finish = (status) => { e.status = status; e.t1 = performance.now() }
  if (cfg.delay) await sleep(cfg.delay)
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); finish(204); return }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, cors); res.end(); finish(405); return }
  const body = load(e.path.slice(1))
  if (!body) { res.writeHead(404, cors); res.end(); finish(404); return }
  const size = body.length
  let start = 0, end = size, status = 200
  const headers = { 'content-type': 'application/octet-stream', 'accept-ranges': 'bytes', etag: `"${size}"`, ...cors }
  if (e.range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(e.range)
    if (!m || (m[1] === '' && m[2] === '')) { res.writeHead(416, { 'content-range': `bytes */${size}`, ...cors }); res.end(); finish(416); return }
    if (m[1] === '') { start = Math.max(0, size - Number(m[2])) } else { start = Number(m[1]); if (m[2] !== '') end = Math.min(size, Number(m[2]) + 1) }
    if (start >= size || start >= end) { res.writeHead(416, { 'content-range': `bytes */${size}`, ...cors }); res.end(); finish(416); return }
    status = 206
    headers['content-range'] = `bytes ${start}-${end - 1}/${size}`
  }
  headers['content-length'] = end - start
  res.writeHead(status, headers)
  if (req.method === 'HEAD') { res.end(); finish(status); return }
  const CH = 16384
  for (let o = start; o < end; o += CH) {
    const chunk = body.subarray(o, Math.min(end, o + CH))
    await pace(chunk.length)
    if (res.destroyed) break
    if (!res.write(chunk)) await new Promise(r => { res.once('drain', r); res.once('close', r) })
    e.bytes += chunk.length
  }
  res.end()
  finish(status)
}

const wrap = (req, res) => { handle(req, res).catch(err => { console.error(err); try { res.destroy() } catch {} }) }
createServer(wrap).listen(Number(portArg), '127.0.0.1', () => console.log(`http://127.0.0.1:${portArg} root ${root}`))
if (tlsPortArg) {
  createSecureServer({ key: readFileSync(keyPath), cert: readFileSync(certPath), allowHTTP1: true }, wrap)
    .listen(Number(tlsPortArg), '127.0.0.1', () => console.log(`https://127.0.0.1:${tlsPortArg} (h2)`))
}
