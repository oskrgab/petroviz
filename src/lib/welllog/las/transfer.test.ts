import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_LAS_BYTES, tooLargeMessage, transferables } from "./transfer.ts";
import { lasToWellLog } from "./pipeline.ts";
import type { WellLog } from "../core/index.ts";

const MB = 1024 * 1024;

test("a file up to 256 MB is read", () => {
  assert.equal(MAX_LAS_BYTES, 256 * MB);
  assert.equal(tooLargeMessage("big.las", 0), null);
  assert.equal(tooLargeMessage("big.las", 256 * MB), null);
});

test("a file over 256 MB is refused with its size and the limit", () => {
  assert.equal(
    tooLargeMessage("big.las", 300.25 * MB),
    "big.las is 300.3 MB, over the 256 MB limit for a LAS file.",
  );
  assert.equal(
    tooLargeMessage("big.las", 256 * MB + 1),
    "big.las is 256.1 MB, over the 256 MB limit for a LAS file.",
    "never rounded down to the limit itself",
  );
});

test("every array buffer of a well log is transferred, each once", () => {
  const bytes = new Uint8Array(readFileSync(new URL("./fixtures/force2020/32_2-1.trimmed.las", import.meta.url)));
  const log = lasToWellLog(bytes, "32_2-1.las");
  const buffers = transferables(log);
  assert.equal(buffers.length, 1 + log.curves.length);
  assert.ok(buffers.includes(log.md.buffer as ArrayBuffer));
  for (const curve of log.curves) assert.ok(buffers.includes(curve.values.buffer as ArrayBuffer));
});

test("TVDSS is transferred, and a buffer two arrays share is listed once", () => {
  const shared = new ArrayBuffer(32);
  const md = new Float64Array([1, 2]);
  const log = {
    md,
    tvdss: new Float64Array([0.5, 1.5]),
    curves: [
      { values: new Float32Array(shared, 0, 2) },
      { values: new Float32Array(shared, 8, 2) },
    ],
  } as unknown as WellLog;
  const buffers = transferables(log);
  assert.equal(buffers.length, 3);
  assert.ok(buffers.includes(log.tvdss!.buffer as ArrayBuffer));
  assert.ok(buffers.includes(shared));
});
