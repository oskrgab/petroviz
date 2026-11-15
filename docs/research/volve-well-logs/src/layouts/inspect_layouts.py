"""Physical facts about each layout, from the footer.

Usage: python -I inspect_layouts.py <file.parquet>...
"""
import os
import struct
import sys

import pyarrow.parquet as pq

for path in sys.argv[1:]:
    size = os.path.getsize(path)
    with open(path, "rb") as f:
        f.seek(-8, 2)
        footer_len = struct.unpack("<I", f.read(4))[0]
    md = pq.ParquetFile(path).metadata
    rgs = [md.row_group(i) for i in range(md.num_row_groups)]
    first = rgs[0]
    # contiguity of each row group's column chunks
    contiguous = True
    rg_ranges = []
    for rg in rgs:
        pos = None
        lo = hi = None
        for j in range(rg.num_columns):
            c = rg.column(j)
            s = c.dictionary_page_offset if c.has_dictionary_page and c.dictionary_page_offset else c.data_page_offset
            e = s + c.total_compressed_size
            if pos is not None and s != pos:
                contiguous = False
            pos = e
            lo = s if lo is None else min(lo, s)
            hi = e if hi is None else max(hi, e)
        rg_ranges.append((lo, hi))
    sw = [rg.column(1) for rg in rgs]
    sw_stats = [(c.statistics.min, c.statistics.max) if c.is_stats_set and c.statistics.has_min_max else None for c in sw]
    sw_minmax_equal = all(s is not None and s[0] == s[1] for s in sw_stats)
    nullcount_known = all(rg.column(j).is_stats_set and rg.column(j).statistics.has_null_count
                          for rg in rgs for j in range(rg.num_columns))
    enc = {}
    for j in range(first.num_columns):
        c = first.column(j)
        key = (c.physical_type, tuple(sorted(c.encodings)), c.compression, bool(c.has_dictionary_page))
        enc[key] = enc.get(key, 0) + 1
    has_oi = any(rg.column(j).has_offset_index for rg in rgs for j in range(rg.num_columns))
    has_ci = any(rg.column(j).has_column_index for rg in rgs for j in range(rg.num_columns))
    data_end = max(hi for _, hi in rg_ranges)
    print(f"== {os.path.basename(path)}")
    print(f"  size {size}  footer {footer_len}  rowGroups {md.num_row_groups}  rows {md.num_rows}  cols {md.num_columns}  createdBy {md.created_by}")
    print(f"  dataEnd {data_end}  betweenDataAndFooter {size - 8 - footer_len - data_end} (page index / bloom)  offsetIndex {has_oi}  columnIndex {has_ci}")
    print(f"  chunksContiguousWithinEveryRowGroup {contiguous}")
    print(f"  source_wellbore stats min==max in every row group: {sw_minmax_equal}; null_count on every chunk: {nullcount_known}")
    for k, v in enc.items():
        print(f"  rg0 {v:3d} cols: {k}")
    if md.num_row_groups > 1:
        sizes = [hi - lo for lo, hi in rg_ranges]
        print(f"  rowGroup bytes: min {min(sizes)} median {sorted(sizes)[len(sizes)//2]} max {max(sizes)}")
        for i, rg in enumerate(rgs):
            print(f"    rg{i:2d} {sw_stats[i][0] if sw_stats[i] else '?':14s} rows {rg.num_rows:6d} bytes {sizes[i]:8d} [{rg_ranges[i][0]},{rg_ranges[i][1]})")
