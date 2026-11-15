#!/usr/bin/env bash
# Everything after the Node matrix: Chromium (hyparquet), native DuckDB, DuckDB-WASM. One job at a time; the server log is shared.
# Usage: run_rest.sh <work dir> <ranges.json>
set -u
W=$1
R=$2
S=$W/scripts
O=$W/out
PW=/home/oskrgab/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core
EXE=$HOME/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell
HYP=/data/dev/apps/petroviz/node_modules/hyparquet/src
WASM=/data/dev/apps/petroviz/node_modules/@duckdb/duckdb-wasm/dist
H1=http://127.0.0.1:8471
H2=https://127.0.0.1:8472
unset DISPLAY
cd "$S" || exit 1

browser() { # <data base> <jobs kind> <out name>
  rm -f "$O/$3.jsonl"
  node run_browser.mjs "$PW" "$EXE" "$HYP" "$1" "$H1" "$R" "$W/data/layouts.json" "$O/jobs-$2.json" "$O/$3.jsonl" > "$O/$3.log" 2>&1
  echo "done $3 $(wc -l < "$O/$3.jsonl")"
}
browser "$H2" parallel browser-h2-parallel
browser "$H2" default browser-h2-default
browser "$H1" parallel1 browser-h1-parallel
browser "$H1" mem browser-mem

rm -f "$O"/duck-*.jsonl "$O"/wasm-*.jsonl
for spec in duckdb==2.0.0 duckdb==1.5.2; do
  node run_duck.mjs "$H1" "$O/duck-delay.jsonl" "$spec" 3 80 0 L1.parquet L2.parquet L3.parquet > "$O/duck-delay-$spec.log" 2>&1
  node run_duck.mjs "$H1" "$O/duck-cap.jsonl" "$spec" 1 80 20 L1.parquet L2.parquet L3.parquet > "$O/duck-cap-$spec.log" 2>&1
  echo "done duck $spec"
done
node run_wasm.mjs "$PW" "$EXE" "$WASM" "$O/duckdb-bundle.mjs" "$H1" "$H1" "$O/wasm-delay.jsonl" 3 80 0 L1.parquet L2.parquet L3.parquet > "$O/wasm-delay.log" 2>&1
node run_wasm.mjs "$PW" "$EXE" "$WASM" "$O/duckdb-bundle.mjs" "$H1" "$H1" "$O/wasm-cap.jsonl" 1 80 20 L1.parquet L2.parquet L3.parquet > "$O/wasm-cap.log" 2>&1
echo "done wasm"
curl -s "$H1/__config?delay=0&mbit=0" > /dev/null
