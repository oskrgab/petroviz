// Footer parse time per layout (hyparquet parquetMetadata on bytes in memory). Usage: node footer_time.mjs <files...>
import { readFileSync } from 'node:fs'
import { parquetMetadata } from '/data/dev/apps/petroviz/node_modules/hyparquet/src/index.js'
for (const p of process.argv.slice(2)) {
  const b = readFileSync(p); const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
  const t = []
  for (let i = 0; i < 30; i++) { const t0 = performance.now(); parquetMetadata(bytes); t.push(performance.now() - t0) }
  const warm = t.slice(5).sort((a, b) => a - b)
  console.log(p.split('/').pop(), 'footer bytes', new DataView(bytes).getUint32(bytes.byteLength - 8, true), 'parse cold ms', t[0].toFixed(1), 'warm median ms', warm[Math.floor(warm.length / 2)].toFixed(2))
}
