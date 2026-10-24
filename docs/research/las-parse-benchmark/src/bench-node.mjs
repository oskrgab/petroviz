// Node benchmark. A fresh process per (file, tokenizer, storage), so run 1 is genuinely cold.
//   node bench-node.mjs [--runs 10] [--warm 2] [--tok scan,naive] [--storage array] FILE...
//   node bench-node.mjs --one FILE TOK STORAGE RUNS WARM        (child: prints JSON)
//   node --expose-gc bench-node.mjs --mem FILE TOK STORAGE        (child: live-set per phase)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PerformanceObserver, performance } from 'node:perf_hooks';
import { readLas, decodeLas, parseLas, buildWellLog } from './laslib.js';

const self = new URL(import.meta.url).pathname;
const argv = process.argv.slice(2);
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

if (argv[0] === '--one') {
  const [, file, tokenizer, storage, runsS, warmS] = argv;
  const runs = Number(runsS);
  const warm = Number(warmS);
  let gcEntries = [];
  const obs = new PerformanceObserver((l) => gcEntries.push(...l.getEntries()));
  obs.observe({ entryTypes: ['gc'] });
  const rss0 = process.resourceUsage().maxRSS;
  const blob = await fs.openAsBlob(file);
  const out = [];
  for (let r = 0; r < runs; r++) {
    gcEntries = [];
    const { timings } = await readLas(blob, { tokenizer, storage });
    await new Promise((res) => setTimeout(res, 20)); // let gc entries arrive
    timings.gcMs = gcEntries.reduce((s, e) => s + e.duration, 0);
    timings.gcMax = gcEntries.reduce((s, e) => Math.max(s, e.duration), 0);
    timings.gcCount = gcEntries.length;
    if (r === 0) timings.maxRssDeltaMB = (process.resourceUsage().maxRSS - rss0) / 1024;
    out.push(timings);
  }
  const cold = out[0];
  const meas = out.slice(1 + warm);
  const keys = ['read', 'decode', 'header', 'data', 'parse', 'sortCheck', 'medianStep', 'sentinelsPack', 'gapRows', 'build', 'sync', 'total', 'gcMs', 'gcMax', 'gcCount'];
  const med = Object.fromEntries(keys.map((k) => [k, median(meas.map((t) => t[k]))]));
  console.log(JSON.stringify({ file: path.basename(file), tokenizer, storage, n: meas.length, cold, med, info: { rows: cold.rows, curves: cold.curves, bytes: cold.bytes, chars: cold.chars, encoding: cold.encoding, gaps: cold.gaps } }));
  process.exit(0);
}

if (argv[0] === '--mem') {
  const [, file, tokenizer, storage] = argv;
  const mem = () => {
    globalThis.gc();
    globalThis.gc();
    const m = process.memoryUsage();
    return (m.heapUsed + m.external) / 1e6;
  };
  const blob = await fs.openAsBlob(file);
  const base = mem();
  let buf = await blob.arrayBuffer();
  const mBytes = mem() - base;
  let { text } = decodeLas(new Uint8Array(buf));
  const mText = mem() - base;
  let doc = parseLas(text, { tokenizer, storage });
  const mDoc = mem() - base;
  const log = buildWellLog(doc, 'x');
  const mAll = mem() - base;
  buf = null;
  text = null;
  doc = null;
  const mLog = mem() - base;
  console.log(
    JSON.stringify({ file: path.basename(file), tokenizer, storage, liveMB: { bytes: mBytes, plusText: mText, plusLasDocument: mDoc, plusWellLog: mAll, wellLogOnly: mLog }, rows: log.md.length })
  );
  process.exit(0);
}

// ---- driver
const opt = (name, def) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const runs = Number(opt('runs', 10));
const warm = Number(opt('warm', 2));
const toks = opt('tok', 'scan,naive').split(',');
const storages = opt('storage', 'array').split(',');
const mem = opt('mem', 'no') === 'yes';
const files = argv;
const results = [];
for (const f of files) {
  for (const tok of toks) {
    for (const st of storages) {
      const res = JSON.parse(execFileSync(process.execPath, [self, '--one', f, tok, st, String(runs), String(warm)], { encoding: 'utf8', maxBuffer: 1 << 24 }));
      if (mem) res.mem = JSON.parse(execFileSync(process.execPath, ['--expose-gc', self, '--mem', f, tok, st], { encoding: 'utf8' })).liveMB;
      results.push(res);
      const m = res.med;
      const r1 = (x) => x.toFixed(0).padStart(5);
      console.log(
        `${res.file.padEnd(32)} ${tok.padEnd(8)} ${st.padEnd(5)} ${(res.info.bytes / 1e6).toFixed(1).padStart(6)}MB  sync ${r1(m.sync)} (cold ${r1(res.cold.sync)})  read ${r1(m.read)} dec ${r1(m.decode)} hdr ${m.header.toFixed(1)} data ${r1(m.data)} build ${r1(m.build)} [sort ${m.sortCheck.toFixed(1)} med ${m.medianStep.toFixed(1)} pack ${m.sentinelsPack.toFixed(1)} gap ${m.gapRows.toFixed(1)}]  gc ${r1(m.gcMs)} max ${m.gcMax.toFixed(1)} n${m.gcCount}  rssΔ1 ${res.cold.maxRssDeltaMB.toFixed(0)}MB` +
          (res.mem ? `  live ${JSON.stringify(Object.fromEntries(Object.entries(res.mem).map(([k, v]) => [k, Math.round(v)])))}` : '')
      );
    }
  }
}
const outPath = path.join(path.dirname(self), '..', 'results', `node-${Date.now()}.json`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ node: process.version, runs, warm, results }, null, 1));
console.log('wrote', outPath);
