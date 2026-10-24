// Sanity check: every tokenizer/storage combination yields identical WellLogs.
// node check.mjs FILE...
import fs from 'node:fs';
import path from 'node:path';
import { readLas } from './laslib.js';

const combos = [
  ['naive', 'array'],
  ['naive-pf', 'array'],
  ['scan', 'array'],
  ['scan', 'typed'],
];
for (const f of process.argv.slice(2)) {
  const blob = await fs.openAsBlob(f);
  const outs = [];
  for (const [tokenizer, storage] of combos) outs.push(await readLas(blob, { tokenizer, storage }));
  const ref = outs[2].log;
  const t = outs[2].timings;
  const diffs = outs.map(({ log }) => {
    if (log.md.length !== ref.md.length || log.curves.length !== ref.curves.length) return 'shape';
    let bad = 0;
    for (let i = 0; i < ref.md.length; i++) if (!Object.is(log.md[i], ref.md[i])) bad++;
    log.curves.forEach((c, j) => {
      const r = ref.curves[j].values;
      for (let i = 0; i < r.length; i++) if (!Object.is(c.values[i], r[i])) bad++;
    });
    return bad;
  });
  const nanFrac =
    ref.curves.reduce((s, c) => s + c.values.reduce((a, v) => a + (v !== v), 0), 0) /
    (ref.curves.length * ref.md.length);
  console.log(
    path.basename(f),
    JSON.stringify({ enc: t.encoding, rows: t.rows, curves: t.curves, dropped: t.dropped, gaps: t.gaps, warnings: ref.warnings.map((w) => w.code + (w.n ?? w.mnemonic ?? '')), step: ref.medianStep, md0: ref.md[0], mdN: ref.md.at(-1), nanFrac: +nanFrac.toFixed(3), mismatches: diffs })
  );
}
