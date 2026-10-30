/**
 * decodeLas(bytes) → text: the LAS log adapter's first step (#32).
 *
 * A byte order mark picks UTF-8 or UTF-16 LE/BE. Without one, the bytes are
 * read as strict UTF-8, and as windows-1252 if that fails, which is what
 * older files on Windows were written in. `TextDecoder` only, so it runs in a
 * worker, a page or Node unchanged.
 */

export function decodeLas(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
