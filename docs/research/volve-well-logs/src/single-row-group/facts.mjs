// File facts from the footer + a page-header walk. Usage: node facts.mjs <file.parquet>
import { readFileSync } from 'node:fs'
import { parquetMetadata } from '/data/dev/apps/petroviz/node_modules/hyparquet/src/index.js'
import { parquetHeader } from '/data/dev/apps/petroviz/node_modules/hyparquet/src/column.js'

const path = process.argv[2]
const buf = readFileSync(path)
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
const view = new DataView(ab)
const footerLen = view.getUint32(ab.byteLength - 8, true)
const md = parquetMetadata(ab)
console.log(JSON.stringify({
  fileBytes: ab.byteLength,
  footerMetadataBytes: footerLen,
  footerPlus8: footerLen + 8,
  version: md.version,
  created_by: md.created_by,
  num_rows: Number(md.num_rows),
  row_groups: md.row_groups.length,
  schemaLeaves: md.schema.length - 1,
  kv: (md.key_value_metadata ?? []).map(k => [k.key, String(k.value).length]),
}, null, 1))

for (const [gi, rg] of md.row_groups.entries()) {
  console.log(`row group ${gi}: rows=${rg.num_rows} total_byte_size=${rg.total_byte_size} total_compressed_size=${rg.total_compressed_size} sorting=${JSON.stringify(rg.sorting_columns)}`)
  const rows = []
  for (const c of rg.columns) {
    const m = c.meta_data
    const start = Number(m.dictionary_page_offset || m.data_page_offset)
    const end = start + Number(m.total_compressed_size)
    // walk pages
    const reader = { view: new DataView(ab, start, end - start), offset: 0 }
    let dataPages = 0, dictPages = 0, dictBytes = 0
    const pageEnc = new Set(), pageTypes = new Set()
    const pageRows = []
    const pageComp = []
    while (reader.offset < reader.view.byteLength) {
      const h = parquetHeader(reader)
      pageTypes.add(h.type)
      if (h.type === 'DICTIONARY_PAGE') { dictPages++; dictBytes = h.compressed_page_size }
      else {
        dataPages++
        const d = h.data_page_header ?? h.data_page_header_v2
        pageEnc.add(d.encoding)
        pageRows.push(d.num_values)
        pageComp.push(h.compressed_page_size)
      }
      reader.offset += h.compressed_page_size
    }
    rows.push({
      name: m.path_in_schema.join('.'),
      type: m.type,
      codec: m.codec,
      comp: Number(m.total_compressed_size),
      uncomp: Number(m.total_uncompressed_size),
      start, end,
      num_values: Number(m.num_values),
      nulls: m.statistics?.null_count === undefined ? null : Number(m.statistics.null_count),
      encodings: m.encodings.join('+'),
      pageEnc: [...pageEnc].join('+'),
      pageTypes: [...pageTypes].join('+'),
      dictPages, dictBytes, dataPages,
      pageRowsMin: Math.min(...pageRows), pageRowsMax: Math.max(...pageRows),
      pageCompMax: Math.max(...pageComp),
      colIdx: c.column_index_offset ? `${c.column_index_offset}+${c.column_index_length}` : null,
      offIdx: c.offset_index_offset ? `${c.offset_index_offset}+${c.offset_index_length}` : null,
      bloom: m.bloom_filter_offset ? `${m.bloom_filter_offset}+${m.bloom_filter_length ?? '?'}` : null,
      hasStats: !!m.statistics,
      min: m.statistics?.min_value ?? m.statistics?.min, max: m.statistics?.max_value ?? m.statistics?.max,
    })
  }
  const tot = (k) => rows.reduce((a, r) => a + r[k], 0)
  console.log(`columns=${rows.length} totalComp=${tot('comp')} totalUncomp=${tot('uncomp')} totalDataPages=${tot('dataPages')} dictPages=${tot('dictPages')} dictBytes=${tot('dictBytes')}`)
  console.log(`first chunk start=${Math.min(...rows.map(r => r.start))} last chunk end=${Math.max(...rows.map(r => r.end))}`)
  console.log('name\ttype\tcodec\tcomp\tuncomp\tnulls\tencodings(meta)\tpageEnc\tpageTypes\tdict\tdictBytes\tdataPages\tpageRows(min-max)\tmaxPageComp\tcolIdx\toffIdx\tbloom\tmin\tmax')
  for (const r of rows) {
    console.log([r.name, r.type, r.codec, r.comp, r.uncomp, r.nulls, r.encodings, r.pageEnc, r.pageTypes, r.dictPages, r.dictBytes, r.dataPages, `${r.pageRowsMin}-${r.pageRowsMax}`, r.pageCompMax, r.colIdx, r.offIdx, r.bloom, String(r.min).slice(0, 14), String(r.max).slice(0, 14)].join('\t'))
  }
}
