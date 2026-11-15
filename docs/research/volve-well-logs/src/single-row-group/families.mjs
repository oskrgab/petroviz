// Run petroviz's curveFamilyOf (read-only import) over the asked mnemonics and over every (mnemonic, unit) in log_curves.parquet.
// Usage: node families.mjs <log_curves.parquet>
import { readFileSync } from 'node:fs'
import { parquetReadObjects } from '/data/dev/apps/petroviz/node_modules/hyparquet/src/index.js'
import { curveFamilyOf, MNEMONIC_FAMILIES, CURVE_FAMILIES } from '/data/dev/apps/petroviz/src/lib/welllog/core/families.ts'

const how = (m, u) => {
  const fam = curveFamilyOf(m, u)
  const via = MNEMONIC_FAMILIES[m.trim().toUpperCase()] ? 'mnemonic table' : fam === 'unknown' ? 'unknown' : 'unit fallback'
  return [fam, via]
}
const asked = [['GR', 'gAPI'], ['NPHI', 'v/v'], ['RHOB', 'g/cm³'], ['RT', 'ohm·m'], ['RD', 'ohm·m'], ['RM', 'ohm·m'], ['RS', 'ohm·m'], ['DRHO', 'g/cm³'], ['DT', 'µs/ft'], ['DTS', 'µs/ft'], ['CALI', 'in'], ['PEF', 'b/e'], ['BS', 'in'], ['ROP', 'm/h'], ['NBGRCFM', 'gAPI'], ['ABDCQF01', 'g/cm³'], ['RACEHM', 'ohm·m'], ['RPCEHM', 'ohm·m'], ['ROBB', 'g/cm³'], ['KLOGH', 'mD'], ['KLOGV', 'mD'], ['VSH', 'v/v'], ['PHIF', 'v/v'], ['SW', 'v/v'], ['BVW', 'v/v'], ['VCARB', 'v/v'], ['PHID', 'v/v'], ['SAND_FLAG', ''], ['COAL_FLAG', ''], ['CARB_FLAG', '']]
console.log('FAMILIES:', CURVE_FAMILIES.join(', '))
console.log('--- asked (mnemonic, unit as given in the task) ---')
for (const [m, u] of asked) console.log([m, u || '(none)', ...how(m, u)].join('\t'))

const b = readFileSync(process.argv[2])
const rows = await parquetReadObjects({ file: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) })
const pairs = new Map()
for (const r of rows) { const k = `${r.mnemonic}\t${r.unit ?? '(null)'}`; pairs.set(k, (pairs.get(k) ?? 0) + 1) }
console.log('--- every (mnemonic, unit) in log_curves.parquet: wellbores, family, via ---')
for (const [k, n] of [...pairs].sort()) { const [m, u] = k.split('\t'); console.log([m, u === '' ? '(empty)' : u, n, ...how(m, u === '(null)' ? '' : u)].join('\t')) }
const askedSet = new Map(asked)
console.log('--- unit in file vs unit in task, for asked mnemonics ---')
for (const [k] of pairs) { const [m, u] = k.split('\t'); if (askedSet.has(m) && askedSet.get(m) !== (u === '(null)' ? '' : u)) console.log('DIFF', m, JSON.stringify(u), 'task says', JSON.stringify(askedSet.get(m))) }
