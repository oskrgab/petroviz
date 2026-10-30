/**
 * The module worker `readLas` starts for one file (#35): it reads the
 * posted `File`, runs the pipeline, and posts the well log back with every
 * array buffer transferred. It is terminated once it replies, so it handles
 * one message.
 */

import { lasToWellLog } from "./pipeline.ts";
import { couldNotRead, transferables, type LasReply } from "./transfer.ts";

addEventListener("message", async (event: MessageEvent<File>) => {
  const file = event.data;
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    // Moved, deleted or refused since it was picked: the browser's own message names none of that.
    reply({ ok: false, message: couldNotRead(file.name) });
    return;
  }
  try {
    const log = lasToWellLog(bytes, file.name);
    reply({ ok: true, log }, transferables(log));
  } catch (error) {
    reply({ ok: false, message: error instanceof Error ? error.message : String(error) });
  }
});

function reply(message: LasReply, transfer: Transferable[] = []) {
  postMessage(message, { transfer });
}
