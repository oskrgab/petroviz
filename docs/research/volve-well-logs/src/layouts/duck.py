"""One native DuckDB query over HTTP in a fresh process.

Usage: python -I duck.py <url> <query id> <threads: 1|default> <curve set: raw|interp>
Prints one JSON line. The caller resets and reads the server's request log.
"""
import json
import sys
import time

import duckdb

url, qid, threads, curveset = sys.argv[1:5]
curves = {"raw": "GR, RHOB, NPHI", "interp": "VSH, PHIF, SW"}[curveset]
queries = {
    # ADR-0012's two viewer queries
    "D1": f"SELECT depth_md, {curves} FROM read_parquet('{url}') WHERE source_wellbore = '15/9-F-1 B'",
    "D2": f"SELECT source_wellbore, depth_md, {curves} FROM read_parquet('{url}')",
    # QA-equivalent
    "D3": f"SELECT * FROM read_parquet('{url}') WHERE source_wellbore = '15/9-F-1 B'",
}
con = duckdb.connect()
con.execute("INSTALL httpfs")
con.execute("LOAD httpfs")
if threads != "default":
    con.execute(f"SET threads={int(threads)}")
t0 = time.perf_counter()
rows = con.execute(queries[qid]).fetchall()
wall = time.perf_counter() - t0
print(json.dumps({
    "duckdb": duckdb.__version__, "query": qid, "curves": curveset if qid != "D3" else None,
    "threads": con.execute("SELECT current_setting('threads')").fetchone()[0],
    "rows": len(rows), "cols": len(rows[0]) if rows else 0, "wallMs": round(wall * 1000),
}))
