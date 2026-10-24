// Page side of the browser benchmark. Exposes window.bench* for bench-browser.mjs.
import { readLas, decodeLas, parseLas, buildWellLog } from '../laslib.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const T = () => performance.timeOrigin + performance.now();

// long tasks (>= 50 ms) on this thread
const longtasks = [];
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) longtasks.push({ start: e.startTime, dur: e.duration });
  }).observe({ type: 'longtask', buffered: true });
} catch {}
const longestTaskIn = (t0, t1) =>
  longtasks.filter((e) => e.start >= t0 - 1 && e.start <= t1).reduce((m, e) => Math.max(m, e.dur), 0);

// main-thread lag monitor: MessageChannel ping loop; the largest gap between pings is the
// longest stretch the main thread could not run a task (catches tasks shorter than 50 ms too)
function startLagMonitor() {
  const ch = new MessageChannel();
  let last = performance.now();
  let max = 0;
  let running = true;
  ch.port1.onmessage = () => {
    const t = performance.now();
    if (t - last > max) max = t - last;
    last = t;
    if (running) ch.port2.postMessage(0);
  };
  ch.port2.postMessage(0);
  return () => {
    running = false;
    const t = performance.now();
    if (t - last > max) max = t - last;
    ch.port1.close();
    return max;
  };
}

const files = new Map();
async function getFile(url) {
  if (!files.has(url)) {
    const b = await (await fetch(url)).blob();
    files.set(url, new File([b], url.split('/').pop()));
  }
  return files.get(url);
}

window.benchMain = async (url, opts, runs) => {
  const file = await getFile(url);
  const out = [];
  for (let r = 0; r < runs; r++) {
    await sleep(150);
    const t0 = performance.now();
    const { timings } = await readLas(file, opts);
    const t1 = performance.now();
    await sleep(150);
    timings.longestTask = longestTaskIn(t0, t1);
    out.push(timings);
  }
  return out;
};

window.benchWorker = async (url, opts, runs, transfer) => {
  const file = await getFile(url);
  const out = [];
  for (let r = 0; r < runs; r++) {
    await sleep(150);
    const stopLag = startLagMonitor();
    const tStart = performance.now();
    const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    const msgs = [];
    let notify = null;
    w.onmessage = (e) => {
      if (e.data?.type === 'result') {
        const tArriveAbs = T();
        const h0 = performance.now();
        const d = e.data; // Blink deserialises lazily, on first .data access
        let s = d.log.md.length;
        for (const c of d.log.curves) s += c.values.length + c.values[0];
        const h1 = performance.now();
        msgs.push({ type: 'result', d, tArriveAbs, handlerMs: h1 - h0, tEnd: h1, s });
      } else msgs.push(e.data);
      notify?.();
    };
    const waitFor = async (type) => {
      for (;;) {
        const m = msgs.find((x) => x.type === type);
        if (m) return m;
        await new Promise((r) => (notify = r));
      }
    };
    await waitFor('ready');
    const tReady = performance.now();
    const p0 = performance.now();
    const tPostAbs = T();
    w.postMessage({ type: 'parse', file, opts, transfer });
    const postSync = performance.now() - p0;
    const res = await waitFor('result');
    const st = await waitFor('sendTiming');
    const lagMax = stopLag();
    w.terminate();
    await sleep(150);
    const wt = res.d.timings;
    out.push({
      spawn: tReady - tStart,
      postSync,
      inputLatency: res.d.tRecvAbs - tPostAbs, // post -> worker onmessage
      worker: wt, // read/decode/parse/build inside the worker
      sendMs: st.sendMs, // worker-side postMessage (serialise) cost
      resultLatency: res.tArriveAbs - res.d.tSendAbs, // worker post -> main onmessage
      handlerMs: res.handlerMs, // main-thread receive (deserialise + touch)
      total: res.tEnd - tStart,
      totalExclSpawn: res.tEnd - tReady,
      lagMax,
      longestTask: longestTaskIn(tStart, res.tEnd),
      transferredDetached: transfer ? true : false,
    });
  }
  return out;
};

// TextDecoder variants on one buffer: utf-8 lenient, utf-8 fatal, windows-1252, decodeLas()
window.benchDecode = async (url, runs) => {
  const file = await getFile(url);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const variants = {
    utf8: () => new TextDecoder('utf-8').decode(bytes),
    utf8fatal: () => {
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      } catch {
        return 'threw';
      }
    },
    win1252: () => new TextDecoder('windows-1252').decode(bytes),
    decodeLas: () => decodeLas(bytes).text,
  };
  const res = {};
  for (const [k, f] of Object.entries(variants)) {
    const ts = [];
    for (let r = 0; r < runs; r++) {
      const t0 = performance.now();
      const s = f();
      ts.push(performance.now() - t0);
      if (s.length < 0) throw 0;
      await sleep(30);
    }
    res[k] = ts;
  }
  return res;
};

// live memory, one phase per call, so the driver can read renderer RSS from /proc in between.
// JS heap (strings, number[] columns) is performance.memory; ArrayBuffers live outside it.
const memState = {};
window.memStep = async (step, url, opts) => {
  const s = memState;
  if (step === 'base') {
    s.file = await getFile(url);
    s.opts = opts;
  } else if (step === 'read') s.buf = await s.file.arrayBuffer();
  else if (step === 'decode') s.text = decodeLas(new Uint8Array(s.buf)).text;
  else if (step === 'parse') s.doc = parseLas(s.text, s.opts);
  else if (step === 'build') s.log = buildWellLog(s.doc, s.file.name);
  else if (step === 'dropBuf') s.buf = null;
  else if (step === 'dropDoc') s.doc = null;
  else if (step === 'dropText') {
    s.text = null;
    /x/.exec('x'); // a successful match replaces RegExp.lastMatch/$_ (a failed one does not)
  } else if (step === 'later') await sleep(2000); else if (step === 'dropHeaderStrings') {
    for (const c of s.log.curves) c.description = c.mnemonic = c.unit = null;
    s.log.name = null;
  }
  await sleep(50);
  gc();
  gc();
  await sleep(50);
  return { jsHeap: performance.memory.usedJSHeapSize / 1e6, coi: crossOriginIsolated };
};

window.benchReady = true;
