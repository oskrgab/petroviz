// Tile a real LAS file to a target row count (as lasio did for sample_big.las): repeat the data
// rows with a depth offset so MD stays strictly increasing. Keeps every token's original text
// except the depth, which is reformatted with the same decimals and field width.
//
// node tile.mjs --in SRC --out DST [--rows N] [--keep K] [--gap G] [--unwrap] [--badbyte early|late]
//   --rows N     target data rows (default: same as source)
//   --keep K     keep the first K curves (depth included), drop the rest
//   --gap G      extra empty steps between tiles (default 10 -> one gap row per tile boundary)
//   --unwrap     write a wrapped source unwrapped (one row per line)
//   --badbyte    insert a 0xB0 byte (windows-1252 degree sign) in a comment line, in the
//                header (early) or after the last data row (late), so strict UTF-8 fails
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? def : args[i + 1];
};
const flag = (name) => args.includes('--' + name);

const src = opt('in');
const dst = opt('out');
const gap = Number(opt('gap', 10));
const unwrap = flag('unwrap');
const badbyte = opt('badbyte', null);

const raw = fs.readFileSync(src, 'latin1');
const EOL = raw.includes('\r\n') ? '\r\n' : '\n';
const lines = raw.split(/\r\n|\r|\n/);
const aIdx = lines.findIndex((l) => /^\s*~A/i.test(l));
let header = lines.slice(0, aIdx + 1);
const dataLines = lines.slice(aIdx + 1).filter((l) => l.trim() !== '' && !l.trim().startsWith('#'));

// curves
let section = null;
const curveLineIdx = [];
header.forEach((l, i) => {
  const t = l.trim();
  if (t.startsWith('~')) section = t[1].toUpperCase();
  else if (section === 'C' && t && !t.startsWith('#')) curveLineIdx.push(i);
});
const ncol = curveLineIdx.length;
const wrapLine = header.find((l) => /^\s*WRAP\s*\./i.test(l));
const wrapped = !!wrapLine && /\.\s*YES/i.test(wrapLine);
const keep = Number(opt('keep', ncol));
if (wrapped && keep !== ncol) throw new Error('--keep on a wrapped file is not supported');

// rows: unwrapped -> one line each; wrapped -> group lines by token count
const rows = [];
if (!wrapped) {
  for (const l of dataLines) rows.push([l]);
} else {
  let cur = [];
  let k = 0;
  for (const l of dataLines) {
    cur.push(l);
    k += l.trim().split(/\s+/).length;
    if (k >= ncol) {
      if (k !== ncol) throw new Error('row straddles lines unexpectedly');
      rows.push(cur);
      cur = [];
      k = 0;
    }
  }
}
const depthOf = (row) => Number(row[0].trim().split(/\s+/)[0]);
const depths = rows.map(depthOf);
const diffs = depths.slice(1).map((d, i) => d - depths[i]).sort((a, b) => a - b);
const step = diffs[diffs.length >> 1];
const span = depths[depths.length - 1] - depths[0];
const tileOffset = span + step * (1 + gap);
const firstTok = rows[0][0].trim().split(/\s+/)[0];
const decimals = firstTok.includes('.') ? firstTok.split('.')[1].length : 0;
const target = Number(opt('rows', rows.length));

// cut an unwrapped line after its keep-th token
function cutLine(l, k) {
  if (k === ncol) return l;
  const re = /\S+/g;
  let m;
  let end = 0;
  for (let q = 0; q < k; q++) {
    m = re.exec(l);
    end = m.index + m[0].length;
  }
  return l.slice(0, end);
}
function replaceDepth(l, newDepth) {
  const m = /^(\s*)(\S+)/.exec(l);
  const width = m[0].length;
  const s = newDepth.toFixed(decimals).padStart(width);
  return s + l.slice(width);
}

// header edits
header = header.map((l, i) => {
  if (curveLineIdx.indexOf(i) >= keep) return null;
  if (/^\s*~A/i.test(l)) return '~A';
  if (unwrap && /^\s*WRAP\s*\./i.test(l)) return l.replace(/YES/i, 'NO ');
  return l;
}).filter((l) => l !== null);
if (badbyte === 'early') {
  const v = header.findIndex((l) => /^\s*~W/i.test(l));
  header.splice(v, 0, '# Temperature in °F (windows-1252 degree sign)');
}

const fd = fs.openSync(dst, 'w');
let chunk = [];
const flush = () => {
  if (chunk.length) fs.writeSync(fd, chunk.join(EOL) + EOL, null, 'latin1');
  chunk = [];
};
chunk.push(...header);
let written = 0;
for (let t = 0; written < target; t++) {
  const off = t * tileOffset;
  for (let r = 0; r < rows.length && written < target; r++) {
    const row = rows[r];
    const d = depths[r] + off;
    let out = row.slice();
    out[0] = replaceDepth(out[0], d);
    if (!wrapped) out[0] = cutLine(out[0], keep);
    if (unwrap) out = [out.join('')];
    chunk.push(...out);
    written++;
    if (chunk.length > 20000) flush();
  }
}
if (badbyte === 'late') chunk.push('# end of data °');
flush();
fs.closeSync(fd);
const size = fs.statSync(dst).size;
console.log(
  JSON.stringify({ src, dst, srcRows: rows.length, rows: written, curves: keep, wrapped: wrapped && !unwrap, step, tileOffset, MB: +(size / 1e6).toFixed(2) })
);
