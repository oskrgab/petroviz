// Native DuckDB matrix: resets the server log, runs duck.py in a fresh process, reads the log.
// Usage: node run_duck.mjs <base url> <out.jsonl> <duckdb version spec, e.g. duckdb==1.5.2> <runs> <delay> <mbit> <layout files...>
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { control, summarize } from './stats.mjs'

const [base, outPath, spec, runsArg, delay, mbit, ...files] = process.argv.slice(2)
const here = dirname(fileURLToPath(import.meta.url))
await control(base, `/__config?delay=${delay}&mbit=${mbit}`)
for (const file of files) {
  for (const [qid, curves] of [['D1', 'raw'], ['D2', 'raw'], ['D1', 'interp'], ['D2', 'interp'], ['D3', 'raw']]) {
    for (const threads of ['1', 'default']) {
      const runs = []
      for (let i = 0; i < Number(runsArg); i++) {
        await control(base, '/__reset')
        const stdout = execFileSync('uv', ['run', '--quiet', '--with', spec, 'python', '-I', join(here, 'duck.py'), `${base}/${file}`, qid, threads, curves], { encoding: 'utf8', cwd: here })
        const r = JSON.parse(stdout.trim().split('\n').pop())
        const { cfg, log } = await control(base, '/__log')
        runs.push({ ...r, cfg, ...summarize(log) })
      }
      const walls = runs.map(r => r.wallMs).sort((a, b) => a - b)
      const line = { env: 'duckdb-native', layout: file, ...runs[0], wallMs: walls[Math.floor(walls.length / 2)], wallAll: runs.map(r => r.wallMs), requestsAll: runs.map(r => r.requests) }
      appendFileSync(outPath, JSON.stringify(line) + '\n')
      console.log(JSON.stringify(line))
    }
  }
}
