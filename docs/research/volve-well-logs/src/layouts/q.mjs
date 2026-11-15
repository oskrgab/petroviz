// Layout strategies for a hyparquet reader. Runs unchanged in Node and in a browser page.
// Every strategy ends with { [wellbore]: { [column]: Float64Array | Array } } holding that wellbore's rows only.
//
// io = { open(name) -> AsyncBuffer|ArrayBuffer (HEAD when over HTTP), whole(name) -> ArrayBuffer (one plain GET) }
// spec = { wellbores: [{ wellbore, rowStart, rowEnd, columns, file }] }   columns = what the query wants for that wellbore

const KEYS = new Set(['source_wellbore', 'npd_wellbore_code'])

/** onChunk handler that copies the overlap of a chunk with one wellbore's rows into dst. */
function sink(wb, dst) {
  const n = wb.rowEnd - wb.rowStart
  const want = new Set(wb.columns)
  return (c) => {
    if (!want.has(c.columnName)) return
    const lo = Math.max(c.rowStart, wb.rowStart), hi = Math.min(c.rowEnd, wb.rowEnd)
    if (hi <= lo) return
    const key = KEYS.has(c.columnName)
    const a = (dst[c.columnName] ??= key ? new Array(n) : new Float64Array(n).fill(NaN))
    const src = c.columnData, so = lo - c.rowStart, d0 = lo - wb.rowStart, m = hi - lo
    if (key) { for (let i = 0; i < m; i++) a[d0 + i] = src[so + i] } else { for (let i = 0; i < m; i++) { const v = src[so + i]; a[d0 + i] = v === null || v === undefined ? NaN : v } }
  }
}

const union = (lists) => [...new Set(lists.flat())]

/** L2: wellbore -> row group and its non-empty columns, from the footer alone. */
export function rowGroupsByWellbore(metadata) {
  const map = new Map()
  let rowStart = 0
  metadata.row_groups.forEach((rg, index) => {
    const rows = Number(rg.num_rows)
    const sw = rg.columns.find(c => c.meta_data.path_in_schema[0] === 'source_wellbore').meta_data.statistics
    if (sw && sw.min_value === sw.max_value) {
      const columns = rg.columns.filter(c => Number(c.meta_data.statistics?.null_count ?? 0) < rows).map(c => c.meta_data.path_in_schema[0])
      map.set(sw.min_value, { index, rowStart, rowEnd: rowStart + rows, columns, rg })
    }
    rowStart += rows
  })
  return map
}

// ---- the few lines that make "one wellbore = one request" work on L2 ----
/** AsyncBuffer that fetches one whole row group as a single range and serves every slice inside it from memory. */
export function rowGroupBuffer(file, rg) {
  const off = (m) => Number(m.dictionary_page_offset || m.data_page_offset)
  const first = rg.columns[0].meta_data, last = rg.columns[rg.columns.length - 1].meta_data
  const start = off(first), end = off(last) + Number(last.total_compressed_size)
  const whole = Promise.resolve(file.slice(start, end)) // the one request
  return {
    byteLength: file.byteLength,
    slice: (s, e = file.byteLength) => s >= start && e <= end ? whole.then(b => b.slice(s - start, e - start)) : file.slice(s, e),
  }
}

// ---- the few lines that save the offset-index requests on L3 ----
/** AsyncBuffer that keeps the tail the footer read fetched anyway; the page index sits just before the footer. */
export function tailBuffer(file, tailSize = 1 << 19) {
  const tailStart = Math.max(0, file.byteLength - tailSize)
  let tail
  return {
    byteLength: file.byteLength,
    slice(s, e = file.byteLength) {
      if (s < tailStart) return file.slice(s, e)
      tail ??= Promise.resolve(file.slice(tailStart, file.byteLength))
      return tail.then(b => b.slice(s - tailStart, e - tailStart))
    },
  }
}

export const strategies = {
  // One read of the union of columns, whole column chunks, then slice per wellbore. (L1; also L3 for "every wellbore")
  async cols(hyp, io, name, spec) {
    const file = await io.open(name)
    const metadata = await hyp.parquetMetadataAsync(file)
    const out = Object.fromEntries(spec.wellbores.map(w => [w.wellbore, {}]))
    const sinks = spec.wellbores.map(w => sink(w, out[w.wellbore]))
    await hyp.parquetRead({
      file, metadata, columns: union(spec.wellbores.map(w => w.columns)),
      rowStart: Math.min(...spec.wellbores.map(w => w.rowStart)), rowEnd: Math.max(...spec.wellbores.map(w => w.rowEnd)),
      onChunk: c => { for (const s of sinks) s(c) },
    })
    return out
  },
  // One independent read per wellbore, in parallel, row range known. Naive on L1, natural on L2.
  async perwell(hyp, io, name, spec, { useOffsetIndex = false, wrap } = {}) {
    let file = await io.open(name)
    if (wrap === 'tail') file = tailBuffer(file)
    const metadata = await hyp.parquetMetadataAsync(file)
    const byWb = metadata.row_groups.length > 1 ? rowGroupsByWellbore(metadata) : null
    const out = {}
    await Promise.all(spec.wellbores.map(async (w) => {
      // L2: the footer gives the row group; the row range in spec is not used
      const g = byWb?.get(w.wellbore)
      const range = g ? { ...w, rowStart: g.rowStart, rowEnd: g.rowEnd, columns: w.columns.filter(c => g.columns.includes(c)) } : w
      const dst = out[w.wellbore] = {}
      await hyp.parquetRead({
        file: wrap === 'rg' ? rowGroupBuffer(file, g.rg) : file, metadata, columns: range.columns,
        rowStart: range.rowStart, rowEnd: range.rowEnd, useOffsetIndex, onChunk: sink(range, dst),
      })
    }))
    return out
  },
  rg1: (hyp, io, name, spec) => strategies.perwell(hyp, io, name, spec, { wrap: 'rg' }),
  oi: (hyp, io, name, spec) => strategies.perwell(hyp, io, name, spec, { useOffsetIndex: true }),
  oitail: (hyp, io, name, spec) => strategies.perwell(hyp, io, name, spec, { useOffsetIndex: true, wrap: 'tail' }),
  // L4: one plain GET per wellbore file, decode from memory.
  async files(hyp, io, name, spec) {
    const out = {}
    await Promise.all(spec.wellbores.map(async (w) => {
      const bytes = await io.whole(w.file)
      const metadata = hyp.parquetMetadata(bytes)
      const dst = out[w.wellbore] = {}
      const n = Number(metadata.num_rows)
      await hyp.parquetRead({ file: bytes, metadata, columns: w.columns, onChunk: sink({ ...w, rowStart: 0, rowEnd: n }, dst) })
    }))
    return out
  },
}

/** Order-independent digest of a result, to prove every layout returns the same arrays. */
export function digest(out) {
  let cols = 0, rows = 0, finite = 0, sum = 0
  for (const wb of Object.keys(out).sort()) {
    for (const [name, a] of Object.entries(out[wb])) {
      cols++; rows += a.length
      if (KEYS.has(name)) continue
      for (let i = 0; i < a.length; i++) { const v = a[i]; if (v === v) { finite++; sum += v * ((i % 7) + 1) } }
    }
  }
  return { wellbores: Object.keys(out).length, cols, rows, finite, sum: sum.toPrecision(12) }
}

/** Build the per-wellbore spec for a query from the catalog (ranges.json) and layouts.json. */
export function buildSpec(query, ranges, layouts) {
  const QB = ['depth_md', 'GR', 'RT', 'RHOB', 'NPHI', 'VSH', 'PHIF', 'BVW', 'SW', 'KLOGH']
  const four = ['15/9-F-1 B', '15/9-F-11 A', '15/9-F-15 D', '15/9-19 A']
  const file = (w) => layouts.l4.find(e => e.wellbore === w).file
  const pick = (w, cols) => {
    const r = ranges.find(r => r.wellbore === w)
    if (!r) throw new Error(`no wellbore ${w}`)
    return { wellbore: w, rowStart: r.rowStart, rowEnd: r.rowEnd, columns: cols ? cols.filter(c => r.columns.includes(c)) : r.columns, file: file(w) }
  }
  switch (query) {
    case 'QA-big': return { wellbores: [pick('15/9-F-1 B')] }
    case 'QA-small': return { wellbores: [pick('15/9-19 BT2')] }
    case 'QB-4': return { wellbores: four.map(w => pick(w, QB)) }
    case 'QB-21': return { wellbores: ranges.map(r => pick(r.wellbore, QB)) }
    case 'QC-4': return { wellbores: four.map(w => pick(w)) }
    default: throw new Error(`unknown query ${query}`)
  }
}
