// Summarise the server's request log for one run.
export async function control(base, path) {
  const res = await fetch(base + path)
  return path === '/__log' || path.startsWith('/__config') ? res.json() : res.text()
}

export function summarize(log) {
  const done = log.filter(e => e.t1 !== undefined)
  const by = (m) => log.filter(e => e.method === m).length
  // max requests in flight (server view: arrival .. last byte written)
  const ev = []
  for (const e of done) { ev.push([e.t0, 1]); ev.push([e.t1, -1]) }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let cur = 0, max = 0
  for (const [, d] of ev) { cur += d; if (cur > max) max = cur }
  // waves: groups of requests that started while an earlier one of the group was still in flight
  const sorted = [...done].sort((a, b) => a.t0 - b.t0)
  const waves = []
  let end = -Infinity
  for (const e of sorted) {
    if (e.t0 >= end) waves.push(0)
    waves[waves.length - 1]++
    end = Math.max(end, e.t1)
  }
  return {
    requests: log.length, head: by('HEAD'), get: by('GET'), options: by('OPTIONS'),
    bytes: log.reduce((a, e) => a + e.bytes, 0),
    statuses: [...new Set(log.map(e => e.status))].join(','),
    http: [...new Set(log.map(e => e.http))].join(','),
    maxInFlight: max, waves: waves.join('+'),
    largestRequest: Math.max(0, ...log.map(e => e.bytes)),
    unfinished: log.length - done.length,
  }
}
