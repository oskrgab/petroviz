/**
 * What `readLas` and its worker share, kept apart from both so Node runs it
 * in tests: the size limit, and the buffers a well log is posted back with.
 */

import type { WellLog } from "../core/index.ts";

const MB = 1024 * 1024;

/**
 * The largest LAS file read (#35). Peak memory is about 4× the file, V8
 * can't hold a string much past ~512 MB, and a worker that runs out of
 * memory takes the page down with it.
 */
export const MAX_LAS_BYTES = 256 * MB;

/** Why a file of `size` bytes isn't read, or null when it is. */
export function tooLargeMessage(fileName: string, size: number): string | null {
  if (size <= MAX_LAS_BYTES) return null;
  // Rounded up, so a file just over the limit never reads as the limit.
  const shown = (Math.ceil((size / MB) * 10) / 10).toFixed(1);
  return `${fileName} is ${shown} MB, over the ${MAX_LAS_BYTES / MB} MB limit for a LAS file.`;
}

/** Why a file the worker couldn't get through, or that killed it, wasn't read. */
export function couldNotRead(fileName: string): string {
  return `Could not read ${fileName}.`;
}

/** The worker's reply: a well log, or the message of why there is none. */
export type LasReply =
  | { readonly ok: true; readonly log: WellLog }
  | { readonly ok: false; readonly message: string };

/**
 * Every array buffer under `log`, each once: MD, TVDSS and each curve's
 * values. Transferring them costs the page nothing, where cloning them
 * would block it for up to ~50 ms on a large file.
 */
export function transferables(log: WellLog): ArrayBuffer[] {
  const arrays = [log.md, log.tvdss, ...log.curves.map((curve) => curve.values)];
  const buffers = new Set<ArrayBuffer>();
  for (const array of arrays) {
    if (array && array.buffer instanceof ArrayBuffer) buffers.add(array.buffer);
  }
  return [...buffers];
}
