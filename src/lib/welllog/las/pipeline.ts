/**
 * The LAS log adapter's pipeline: bytes and a file name in, a well log out
 * (#32, #35). Pure and DOM-free, so the worker that `readLas` will own runs
 * it unchanged, and Node runs it in tests.
 */

import type { WellLog } from "../core/index.ts";
import { buildWellLog } from "./build.ts";
import { decodeLas } from "./decode.ts";
import { parseLas } from "./parse.ts";

export function lasToWellLog(bytes: Uint8Array, fileName: string): WellLog {
  return buildWellLog(parseLas(decodeLas(bytes)), fileName);
}
