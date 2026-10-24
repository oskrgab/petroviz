// Throwaway prototype of the planned LAS 2.0 log adapter's hot path, for benchmarking only.
// readLas(blob, opts) = blob.arrayBuffer() -> decodeLas -> parseLas -> buildWellLog.
// Runs unchanged in Node 24, a browser page and a module worker (no Node APIs).
//
// opts.tokenizer: 'naive' (split lines, trim().split(/\s+/), Number) | 'naive-pf' (same, parseFloat)
//                 | 'scan' (charCodeAt scanner with a plain-decimal fast path, Number() fallback)
// opts.storage:   'array' (number[] per column, push)  | 'typed' (growable row-major Float64Array)

const now = () => performance.now();

// ---------------------------------------------------------------- decode

export function decodeLas(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { text: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8' };
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe)
    return { text: new TextDecoder('utf-16le').decode(bytes), encoding: 'utf-16le' };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff)
    return { text: new TextDecoder('utf-16be').decode(bytes), encoding: 'utf-16be' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
}

// ---------------------------------------------------------------- header

function parseHeaderLine(line) {
  const dot = line.indexOf('.');
  if (dot < 0) return null;
  const mnemonic = line.slice(0, dot).trim();
  let rest = line.slice(dot + 1);
  let unit = '';
  const sp = rest.search(/\s/);
  if (sp > 0) {
    unit = rest.slice(0, sp);
    rest = rest.slice(sp);
  } else if (sp < 0) {
    unit = rest;
    rest = '';
  }
  const colon = rest.lastIndexOf(':');
  const value = (colon < 0 ? rest : rest.slice(0, colon)).trim();
  const description = colon < 0 ? '' : rest.slice(colon + 1).trim();
  return { mnemonic, unit, value, description };
}

// Reads header sections up to ~A. Returns sections, curves, wrap, null and the offset of the
// first character after the ~A line.
export function parseHeader(text) {
  const sections = { V: [], W: [], C: [], P: [], O: [] };
  let cur = null;
  let i = 0;
  const n = text.length;
  let dataStart = -1;
  while (i < n) {
    let e = i;
    while (e < n) {
      const c = text.charCodeAt(e);
      if (c === 10 || c === 13) break;
      e++;
    }
    const line = text.slice(i, e);
    // advance past one EOL (\r\n, \n or \r)
    let next = e;
    if (next < n && text.charCodeAt(next) === 13) next++;
    if (next < n && text.charCodeAt(next) === 10) next++;
    const t = line.trim();
    if (t.charCodeAt(0) === 126 /* ~ */) {
      const letter = t[1]?.toUpperCase();
      if (letter === 'A') {
        dataStart = next;
        break;
      }
      cur = sections[letter] ?? (sections[letter] = []);
    } else if (cur && t !== '' && t.charCodeAt(0) !== 35 /* # */) {
      if (cur === sections.O) cur.push(t);
      else {
        const h = parseHeaderLine(t);
        if (h) cur.push(h);
      }
    }
    i = next;
  }
  if (dataStart < 0) throw new Error('no ~A section');
  const wrapItem = sections.V.find((h) => h.mnemonic.toUpperCase() === 'WRAP');
  const wrap = !!wrapItem && /^y/i.test(wrapItem.value);
  const nullItem = sections.W.find((h) => h.mnemonic.toUpperCase() === 'NULL');
  const nullValue = nullItem ? Number(nullItem.value) : NaN;
  return { sections, curves: sections.C, wrap, nullValue, dataStart };
}

// ---------------------------------------------------------------- data storage

class ColumnStore {
  constructor(ncol) {
    this.ncol = ncol;
    this.cols = Array.from({ length: ncol }, () => []);
    this.nrows = 0;
  }
  commit(row) {
    const cols = this.cols;
    for (let j = 0; j < this.ncol; j++) cols[j].push(row[j]);
    this.nrows++;
  }
  finish() {
    return { kind: 'array', columns: this.cols, nrows: this.nrows };
  }
}

class RowMajorStore {
  constructor(ncol, rowsHint) {
    this.ncol = ncol;
    this.cap = Math.max(1024, rowsHint | 0);
    this.buf = new Float64Array(this.cap * ncol);
    this.nrows = 0;
  }
  commit(row) {
    if (this.nrows === this.cap) {
      this.cap *= 2;
      const b = new Float64Array(this.cap * this.ncol);
      b.set(this.buf);
      this.buf = b;
    }
    this.buf.set(row, this.nrows * this.ncol);
    this.nrows++;
  }
  finish() {
    return { kind: 'rowmajor', buf: this.buf, ncol: this.ncol, nrows: this.nrows };
  }
}

function makeStore(storage, ncol, text, dataStart) {
  if (storage === 'typed') {
    // cheap upper-bound guess: one row per ~(8 chars * ncol)
    const hint = Math.ceil((text.length - dataStart) / (8 * ncol));
    return new RowMajorStore(ncol, hint);
  }
  return new ColumnStore(ncol);
}

// ---------------------------------------------------------------- tokeniser 1: naive

function parseDataNaive(text, dataStart, ncol, wrap, store, numberFn) {
  const lines = text.slice(dataStart).split(/\r\n|\r|\n/);
  const row = new Float64Array(ncol);
  let dropped = 0;
  if (!wrap) {
    for (let li = 0; li < lines.length; li++) {
      const t = lines[li].trim();
      if (t === '' || t.charCodeAt(0) === 35) continue;
      const toks = t.split(/\s+/);
      if (toks.length !== ncol) {
        dropped++;
        continue;
      }
      for (let j = 0; j < ncol; j++) row[j] = numberFn(toks[j]);
      store.commit(row);
    }
  } else {
    let k = 0;
    for (let li = 0; li < lines.length; li++) {
      const t = lines[li].trim();
      if (t === '' || t.charCodeAt(0) === 35) continue;
      const toks = t.split(/\s+/);
      for (let q = 0; q < toks.length; q++) {
        row[k++] = numberFn(toks[q]);
        if (k === ncol) {
          store.commit(row);
          k = 0;
        }
      }
    }
    if (k !== 0) dropped++;
  }
  return dropped;
}

// ---------------------------------------------------------------- tokeniser 2: scanner

const POW10 = Array.from({ length: 23 }, (_, i) => 10 ** i);

function parseDataScan(text, dataStart, ncol, wrap, store) {
  const n = text.length;
  const row = new Float64Array(ncol);
  let i = dataStart;
  let k = 0; // tokens seen in the current row (unwrapped: current line)
  let lineStart = true;
  let dropped = 0;
  while (i < n) {
    let c = text.charCodeAt(i);
    if (c === 10 || c === 13) {
      if (!wrap) {
        if (k === ncol) store.commit(row);
        else if (k !== 0) dropped++;
        k = 0;
      }
      lineStart = true;
      i++;
      continue;
    }
    if (c <= 32) {
      i++;
      continue;
    }
    if (c === 35 && lineStart) {
      // comment line
      while (i < n) {
        c = text.charCodeAt(i);
        if (c === 10 || c === 13) break;
        i++;
      }
      continue;
    }
    lineStart = false;
    // ---- number
    const s = i;
    let j = i;
    let neg = false;
    if (c === 45) {
      neg = true;
      c = text.charCodeAt(++j);
    } else if (c === 43) {
      c = text.charCodeAt(++j);
    }
    let mant = 0;
    let nd = 0;
    let frac = 0;
    while (c >= 48 && c <= 57) {
      mant = mant * 10 + (c - 48);
      nd++;
      c = text.charCodeAt(++j);
    }
    if (c === 46) {
      c = text.charCodeAt(++j);
      while (c >= 48 && c <= 57) {
        mant = mant * 10 + (c - 48);
        nd++;
        frac++;
        c = text.charCodeAt(++j);
      }
    }
    let v;
    if (nd > 0 && nd <= 15 && !(c > 32)) {
      // plain decimal ending at whitespace/EOL/EOF: exact (mantissa < 2^53, exact power of ten)
      v = frac === 0 ? mant : mant / POW10[frac];
      if (neg) v = -v;
      i = j;
    } else {
      // anything unusual: exponent, too many digits, nan, -, #N/A, 1.#INF ...
      let e = j;
      while (e < n && text.charCodeAt(e) > 32) e++;
      v = Number(text.slice(s, e));
      i = e;
    }
    if (wrap) {
      row[k++] = v;
      if (k === ncol) {
        store.commit(row);
        k = 0;
      }
    } else {
      if (k < ncol) row[k] = v;
      k++;
    }
  }
  if (!wrap) {
    if (k === ncol) store.commit(row);
    else if (k !== 0) dropped++;
  } else if (k !== 0) dropped++;
  return dropped;
}

// ---------------------------------------------------------------- parseLas

export function parseLas(text, opts = {}, timings = {}) {
  const t0 = now();
  const header = parseHeader(text);
  const t1 = now();
  const ncol = header.curves.length;
  const store = makeStore(opts.storage ?? 'array', ncol, text, header.dataStart);
  const tok = opts.tokenizer ?? 'scan';
  let dropped;
  if (tok === 'scan') dropped = parseDataScan(text, header.dataStart, ncol, header.wrap, store);
  else if (tok === 'naive') dropped = parseDataNaive(text, header.dataStart, ncol, header.wrap, store, Number);
  else if (tok === 'naive-pf')
    dropped = parseDataNaive(text, header.dataStart, ncol, header.wrap, store, parseFloat);
  else throw new Error('unknown tokenizer ' + tok);
  const data = store.finish();
  const t2 = now();
  timings.header = t1 - t0;
  timings.data = t2 - t1;
  return { ...header, data, droppedLines: dropped };
}

// ---------------------------------------------------------------- buildWellLog

function getColumn(data, j) {
  // returns an indexable source for column j
  if (data.kind === 'array') return data.columns[j];
  const out = new Float64Array(data.nrows);
  const buf = data.buf;
  const nc = data.ncol;
  for (let r = 0, p = j; r < data.nrows; r++, p += nc) out[r] = buf[p];
  return out;
}

export function buildWellLog(doc, fileName, timings = {}) {
  const warnings = [];
  const ncol = doc.curves.length;
  const nrows = doc.data.nrows;

  // --- depth index + sort check (+ sort/dedupe if needed)
  let t0 = now();
  const mdSrc = getColumn(doc.data, 0);
  let increasing = true;
  let anyNaN = false;
  for (let i = 0; i < nrows; i++) {
    const v = mdSrc[i];
    if (v !== v) {
      anyNaN = true;
      increasing = false;
      break;
    }
    if (i > 0 && !(v > mdSrc[i - 1])) increasing = false;
  }
  let order = null; // Uint32Array of source rows, or null = identity
  let md;
  if (increasing) {
    md = Float64Array.from(mdSrc);
  } else {
    const idx = [];
    for (let i = 0; i < nrows; i++) if (mdSrc[i] === mdSrc[i]) idx.push(i);
    idx.sort((a, b) => mdSrc[a] - mdSrc[b] || a - b);
    const keep = [];
    for (let q = 0; q < idx.length; q++) {
      if (q > 0 && mdSrc[idx[q]] === mdSrc[idx[q - 1]]) continue; // repeated depth: keep first
      keep.push(idx[q]);
    }
    order = Uint32Array.from(keep);
    md = new Float64Array(order.length);
    for (let i = 0; i < order.length; i++) md[i] = mdSrc[order[i]];
    warnings.push({ code: anyNaN ? 'depth-nan' : 'depth-unsorted', n: nrows - order.length });
  }
  const n = md.length;
  let t1 = now();
  timings.sortCheck = t1 - t0;

  // --- median step
  const steps = new Float64Array(Math.max(0, n - 1));
  for (let i = 1; i < n; i++) steps[i - 1] = md[i] - md[i - 1];
  steps.sort();
  const m = steps.length;
  const medianStep = m === 0 ? NaN : m % 2 ? steps[(m - 1) >> 1] : (steps[m / 2 - 1] + steps[m / 2]) / 2;
  let t2 = now();
  timings.medianStep = t2 - t1;

  // --- sentinels + packing into Float32Array
  const sentinels = [...new Set([doc.nullValue, -999.25, -9999.25, -9999].filter((x) => x === x))];
  const TOL = 1e-3;
  const lo = Math.min(...sentinels) - TOL;
  const hi = Math.max(...sentinels) + TOL;
  const ns = sentinels.length;
  const curves = [];
  let sentinelHits = 0;
  for (let j = 1; j < ncol; j++) {
    const src = getColumn(doc.data, j);
    const out = new Float32Array(n);
    let has = false;
    for (let r = 0; r < n; r++) {
      let v = order === null ? src[r] : src[order[r]];
      if (v >= lo && v <= hi) {
        for (let q = 0; q < ns; q++) {
          if (Math.abs(v - sentinels[q]) <= TOL) {
            v = NaN;
            sentinelHits++;
            break;
          }
        }
      }
      if (v === v) has = true;
      out[r] = v;
    }
    const c = doc.curves[j];
    if (!has) {
      warnings.push({ code: 'curve-empty', mnemonic: c.mnemonic });
      continue;
    }
    curves.push({ mnemonic: c.mnemonic, unit: c.unit, description: c.description, values: out });
  }
  let t3 = now();
  timings.sentinelsPack = t3 - t2;

  // --- gap rows: one all-NaN row after each step longer than 1.5 median steps
  const thr = 1.5 * medianStep;
  let gaps = 0;
  for (let i = 1; i < n; i++) if (md[i] - md[i - 1] > thr) gaps++;
  let outMd = md;
  if (gaps > 0) {
    const N = n + gaps;
    outMd = new Float64Array(N);
    const gapAfter = new Uint8Array(n);
    for (let i = 1; i < n; i++) if (md[i] - md[i - 1] > thr) gapAfter[i - 1] = 1;
    for (let i = 0, o = 0; i < n; i++) {
      outMd[o++] = md[i];
      if (gapAfter[i]) outMd[o++] = md[i] + medianStep;
    }
    for (const c of curves) {
      const src = c.values;
      const dst = new Float32Array(N);
      for (let i = 0, o = 0; i < n; i++) {
        dst[o++] = src[i];
        if (gapAfter[i]) dst[o++] = NaN;
      }
      c.values = dst;
    }
    warnings.push({ code: 'gaps', n: gaps });
  }
  let t4 = now();
  timings.gapRows = t4 - t3;
  timings.gaps = gaps;
  timings.sentinelHits = sentinelHits;

  const depthCurve = doc.curves[0];
  const u = (depthCurve?.unit ?? '').toLowerCase();
  return {
    name: fileName,
    depthUnit: u.startsWith('f') ? 'ft' : 'm',
    md: outMd,
    curves,
    warnings,
    medianStep,
  };
}

// ---------------------------------------------------------------- readLas

export async function readLas(blob, opts = {}) {
  const { signal } = opts;
  const t = {};
  const tA = now();
  const buf = await blob.arrayBuffer();
  const tB = now();
  signal?.throwIfAborted();
  const { text, encoding } = decodeLas(new Uint8Array(buf));
  const tC = now();
  signal?.throwIfAborted();
  const doc = parseLas(text, opts, t);
  const tD = now();
  signal?.throwIfAborted();
  const log = buildWellLog(doc, blob.name ?? 'file.las', t);
  const tE = now();
  t.read = tB - tA;
  t.decode = tC - tB;
  t.parse = tD - tC;
  t.build = tE - tD;
  t.sync = tE - tB; // the blocking part: decode + parse + build
  t.total = tE - tA;
  t.encoding = encoding;
  t.rows = log.md.length;
  t.curves = log.curves.length;
  t.dropped = doc.droppedLines;
  t.chars = text.length;
  t.bytes = buf.byteLength;
  return { log, timings: t };
}
