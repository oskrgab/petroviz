// Headless Chromium benchmark via playwright-core (installed in ../tools).
//   node bench-browser.mjs [--modes main,main4x,worker,workerClone,worker4x,decode,memory]
//                          [--tok scan,naive] [--runs 10] [--warm 2] FILE...
// A fresh browser context + page per (file, tokenizer, mode), so run 1 is cold.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '../tools/node_modules/playwright-core/index.mjs';
import { startServer } from './server.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const modes = opt('modes', 'main,main4x,worker,workerClone').split(',');
const toks = opt('tok', 'scan,naive').split(',');
const runs = Number(opt('runs', 10));
const warm = Number(opt('warm', 2));
const label = opt('label', 'browser');
const exe =
  process.env.CHROME ??
  path.join(process.env.HOME, '.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell');
const files = argv.map((f) => path.resolve(f));

const mounts = { '/src/': here };
const urlOf = new Map();
files.forEach((f, i) => {
  mounts[`/d${i}/`] = path.dirname(f);
  urlOf.set(f, `/d${i}/${encodeURIComponent(path.basename(f))}`);
});
const srv = await startServer(mounts);
const origin = `http://127.0.0.1:${srv.port}`;

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--enable-precise-memory-info', '--enable-blink-features=ForceEagerMeasureMemory', '--js-flags=--expose-gc'],
});
const version = browser.version();
console.log('browser', version, 'exe', exe);

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const get = (o, k) => k.split('.').reduce((x, p) => x?.[p], o);
const summarize = (arr, keys) => ({
  cold: Object.fromEntries(keys.map((k) => [k, get(arr[0], k)])),
  med: Object.fromEntries(keys.map((k) => [k, median(arr.slice(1 + warm).map((x) => get(x, k)))])),
  n: arr.length - 1 - warm,
});

// renderer processes' peak RSS (VmHWM) from /proc
function renderers() {
  const out = {};
  for (const pid of fs.readdirSync('/proc').filter((p) => /^\d+$/.test(p))) {
    try {
      const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (!cmd.includes('chrome-headless-shell') || !cmd.includes('--type=renderer')) continue;
      const st = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      out[pid] = { hwm: +/VmHWM:\s+(\d+)/.exec(st)[1] / 1024, rss: +/VmRSS:\s+(\d+)/.exec(st)[1] / 1024 };
    } catch {}
  }
  return out;
}

async function session(throttle) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && console.log('  [page]', m.text()));
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await page.goto(`${origin}/src/page/index.html`);
  await page.waitForFunction(() => window.benchReady === true);
  if (throttle) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  }
  return { ctx, page };
}

const MAIN_KEYS = ['read', 'decode', 'header', 'data', 'parse', 'sortCheck', 'medianStep', 'sentinelsPack', 'gapRows', 'build', 'sync', 'total', 'longestTask'];
const WORKER_KEYS = ['spawn', 'postSync', 'inputLatency', 'worker.read', 'worker.decode', 'worker.data', 'worker.build', 'worker.sync', 'sendMs', 'resultLatency', 'handlerMs', 'total', 'totalExclSpawn', 'lagMax', 'longestTask'];

const results = [];
const f0 = (x) => (x === undefined ? '-' : x.toFixed(x < 10 ? 1 : 0)).padStart(5);
for (const f of files) {
  const url = urlOf.get(f);
  const MB = fs.statSync(f).size / 1e6;
  for (const mode of modes) {
    const tokList = mode === 'decode' || mode === 'memory' ? ['-'] : mode === 'workerClone' || mode === 'worker4x' ? toks.slice(0, 1) : toks;
    for (const tok of tokList) {
      const throttle = mode.endsWith('4x') ? 4 : 0;
      const { ctx, page } = await session(throttle);
      const opts = { tokenizer: tok, storage: 'array' };
      let rec = { file: path.basename(f), MB, mode, tok };
      try {
        if (mode === 'main' || mode === 'main4x') {
          const before = renderers();
          const arr = await page.evaluate(([u, o, n]) => window.benchMain(u, o, n), [url, opts, runs]);
          const after = renderers();
          rec = { ...rec, ...summarize(arr, MAIN_KEYS), info: { rows: arr[0].rows, curves: arr[0].curves, encoding: arr[0].encoding }, renderers: { before, after } };
          const m = rec.med;
          console.log(
            `${rec.file.padEnd(30)} ${mode.padEnd(11)} ${tok.padEnd(6)} sync ${f0(m.sync)} (cold ${f0(rec.cold.sync)}) read ${f0(m.read)} dec ${f0(m.decode)} data ${f0(m.data)} build ${f0(m.build)} [sort ${f0(m.sortCheck)} med ${f0(m.medianStep)} pack ${f0(m.sentinelsPack)} gap ${f0(m.gapRows)}] longtask ${f0(m.longestTask)} (cold ${f0(rec.cold.longestTask)})`
          );
        } else if (mode.startsWith('worker')) {
          const transfer = mode !== 'workerClone';
          const arr = await page.evaluate(([u, o, n, t]) => window.benchWorker(u, o, n, t), [url, opts, runs, transfer]);
          rec = { ...rec, ...summarize(arr, WORKER_KEYS), transfer };
          const m = rec.med;
          const c = rec.cold;
          console.log(
            `${rec.file.padEnd(30)} ${mode.padEnd(11)} ${tok.padEnd(6)} total ${f0(m.total)} (cold ${f0(c.total)}) spawn ${f0(m.spawn)} (cold ${f0(c.spawn)}) post ${m.postSync.toFixed(2)} in ${f0(m.inputLatency)} wsync ${f0(m['worker.sync'])} wread ${f0(m['worker.read'])} send ${f0(m.sendMs)} back ${f0(m.resultLatency)} recv ${f0(m.handlerMs)} lagMax ${f0(m.lagMax)} longtask ${f0(m.longestTask)}`
          );
        } else if (mode === 'decode') {
          const r = await page.evaluate(([u, n]) => window.benchDecode(u, n), [url, 8]);
          rec.decode = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, { cold: v[0], med: median(v.slice(1)) }]));
          console.log(`${rec.file.padEnd(30)} decode      ${Object.entries(rec.decode).map(([k, v]) => `${k} ${v.med.toFixed(1)} (cold ${v.cold.toFixed(1)})`).join('  ')}`);
        } else if (mode === 'memory') {
          // phase-by-phase live set (JS heap + renderer RSS), then a separate fresh page for
          // the renderer's peak RSS (VmHWM) over one cold readLas run
          for (const t of toks) {
            const s2 = t === toks[0] ? { ctx, page } : await session(0);
            const steps = {};
            const pick = () => {
              const r = renderers();
              const pid = Object.keys(r).sort((a, b) => r[b].rss - r[a].rss)[0];
              return r[pid];
            };
            for (const step of ['base', 'read', 'decode', 'parse', 'build', 'dropBuf', 'dropDoc', 'dropText', 'later', 'dropHeaderStrings']) {
              const js = await s2.page.evaluate(([st, u, o]) => window.memStep(st, u, o), [step, url, { tokenizer: t, storage: 'array' }]);
              const p = pick();
              steps[step] = { jsHeap: js.jsHeap, rss: p.rss };
            }
            const rel = Object.fromEntries(Object.entries(steps).map(([k, v]) => [k, { jsHeap: +(v.jsHeap - steps.base.jsHeap).toFixed(0), rss: +(v.rss - steps.base.rss).toFixed(0) }]));
            if (s2.ctx !== ctx) await s2.ctx.close();
            // peak: fresh page, file already fetched, renderer VmHWM reset via clear_refs, one cold run
            const pre = new Set(Object.keys(renderers()));
            const s3 = await session(0);
            await s3.page.evaluate(([u]) => window.memStep('base', u, {}), [url]);
            const fresh = Object.keys(renderers()).filter((p) => !pre.has(p));
            if (fresh.length !== 1) throw new Error('cannot identify renderer: ' + fresh);
            const pid = fresh[0];
            fs.writeFileSync(`/proc/${pid}/clear_refs`, '5');
            const b = renderers()[pid];
            await s3.page.evaluate(([u, o]) => window.benchMain(u, o, 1), [url, { tokenizer: t, storage: 'array' }]);
            const a = renderers()[pid];
            await s3.ctx.close();
            rec[t] = { phases: rel, peak: { rssBefore: +b.rss.toFixed(0), hwmAfterReset: +b.hwm.toFixed(0), hwmAfter: +a.hwm.toFixed(0), peakIncrement: +(a.hwm - b.rss).toFixed(0) } };
            console.log(`${rec.file.padEnd(30)} memory ${t.padEnd(6)} phases(MB over base) ${JSON.stringify(rel)} peak ${JSON.stringify(rec[t].peak)}`);
          }
        }
      } catch (e) {
        console.log(`${rec.file} ${mode} ${tok} FAILED: ${e.message.split('\n')[0]}`);
        rec.error = e.message;
      }
      results.push(rec);
      await ctx.close();
    }
  }
}
await browser.close();
srv.close();
const outPath = path.join(here, '..', 'results', `${label}-${Date.now()}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ browser: version, runs, warm, results }, null, 1));
console.log('wrote', outPath);
