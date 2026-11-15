"""Write the layouts of the Volve interpretation table from the published file.

Usage: python -I make_layouts.py <published.parquet> <out_dir>

Every layout has identical rows, column order and sort. Only the physical layout differs.
"""
import json
import os
import re
import sys

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
table = pq.read_table(src)
n = table.num_rows
double_cols = [f.name for f in table.schema if pa.types.is_floating(f.type)]
other_cols = [f.name for f in table.schema if not pa.types.is_floating(f.type)]

# contiguous source_wellbore runs
sw = table.column("source_wellbore").to_pylist()
runs = []
start = 0
for i in range(1, n + 1):
    if i == n or sw[i] != sw[start]:
        runs.append((sw[start], start, i))
        start = i
assert len(runs) == len({r[0] for r in runs}), "source_wellbore runs are not unique"


def write(path, slices, **kw):
    with pq.ParquetWriter(path, table.schema, **kw) as w:
        for a, b in slices:
            w.write_table(table.slice(a, b - a), row_group_size=b - a)


one = [(0, n)]
per_wb = [(a, b) for _, a, b in runs]
big = dict(data_page_size=1 << 30)  # never split a page on size

# L1p: the published layout rewritten by pyarrow (separates writer effects from layout effects)
write(f"{out}/L1p.parquet", one, compression="snappy", **big)
# L2: one row group per source_wellbore, SNAPPY, pyarrow defaults otherwise (dictionary on)
write(f"{out}/L2.parquet", per_wb, compression="snappy")
# L2z: L2 with ZSTD and no dictionary on DOUBLE columns
write(f"{out}/L2z.parquet", per_wb, compression="zstd", use_dictionary=other_cols)
# L2n: L2 SNAPPY with no dictionary on DOUBLE columns (isolates the dictionary effect)
write(f"{out}/L2n.parquet", per_wb, compression="snappy", use_dictionary=other_cols)
# L3: one row group, ~20,000 rows per page, no dictionary on DOUBLE, page index
write(f"{out}/L3.parquet", one, compression="snappy", use_dictionary=other_cols,
      max_rows_per_page=20000, write_batch_size=20000, write_page_index=True, **big)
# L3d: L3 with dictionary left on (to see what dictionary pages do to an offset-index read)
write(f"{out}/L3d.parquet", one, compression="snappy",
      max_rows_per_page=20000, write_batch_size=20000, write_page_index=True, **big)
# L3s: L3 with ~5,000 rows per page (page-size sensitivity)
write(f"{out}/L3s.parquet", one, compression="snappy", use_dictionary=other_cols,
      max_rows_per_page=5000, write_batch_size=5000, write_page_index=True, **big)
# L4: one file per wellbore (all 58 columns kept, so the schema is identical)
os.makedirs(f"{out}/L4", exist_ok=True)
l4 = []
for name, a, b in runs:
    fn = re.sub(r"[^A-Za-z0-9]+", "_", name) + ".parquet"
    write(f"{out}/L4/{fn}", [(a, b)], compression="snappy")
    l4.append({"wellbore": name, "file": f"L4/{fn}", "bytes": os.path.getsize(f"{out}/L4/{fn}")})

# identical-rows check
for f in ["L1p", "L2", "L2z", "L2n", "L3", "L3d", "L3s"]:
    t = pq.read_table(f"{out}/{f}.parquet")
    assert t.equals(table), f
assert pa.concat_tables([pq.read_table(f"{out}/{e['file']}") for e in l4]).equals(table)

json.dump({"rows": n, "runs": [{"wellbore": w, "rowStart": a, "rowEnd": b} for w, a, b in runs], "l4": l4},
          open(f"{out}/layouts.json", "w"), indent=1)
print("ok", n, len(runs))
