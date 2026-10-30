/**
 * `readLas`: a LAS file from disk into a well log, off the main thread
 * (#35). The thin wrapper around the worker; checked by hand in the browser,
 * since Node has no web Worker. The worker's body, the pipeline, is tested
 * on Node.
 */

import type { WellLog } from "../core/index.ts";
import { couldNotRead, tooLargeMessage, type LasReply } from "./transfer.ts";

export interface ReadLasOptions {
  readonly signal?: AbortSignal;
}

/**
 * Read `file` as LAS in a fresh module worker, terminated once the promise
 * settles or `signal` aborts. A file over 256 MB is refused before it is
 * read.
 *
 * Rejects with `signal.reason` on an abort, with the adapter's message when
 * the file can't become a well log, and with "Could not read <file>" when
 * the worker itself dies.
 */
export function readLas(file: File, options: ReadLasOptions = {}): Promise<WellLog> {
  const { signal } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const tooLarge = tooLargeMessage(file.name, file.size);
    if (tooLarge) {
      reject(new Error(tooLarge));
      return;
    }

    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const onAbort = () => settle(() => reject(signal?.reason));
    const died = () => settle(() => reject(new Error(couldNotRead(file.name))));

    function settle(then: () => void) {
      worker.terminate();
      signal?.removeEventListener("abort", onAbort);
      then();
    }

    worker.addEventListener("message", (event: MessageEvent<LasReply>) => {
      const reply = event.data;
      settle(() => (reply.ok ? resolve(reply.log) : reject(new Error(reply.message))));
    });
    worker.addEventListener("messageerror", died);
    worker.addEventListener("error", (event) => {
      // Handled here: the page's console shouldn't report it as uncaught.
      event.preventDefault();
      died();
    });
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.postMessage(file);
  });
}
