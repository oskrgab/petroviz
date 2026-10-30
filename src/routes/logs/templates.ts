/**
 * The current template in the browser and in files (#57, ADR-0004). The
 * host keeps it in localStorage and reads it back through the template file
 * parser, the same as a file opened or dropped. Only the current template
 * is kept; named templates live as files. Other tabs aren't kept in sync,
 * so the last write wins.
 *
 * A stored copy that won't read is moved to a second key, so the page can
 * offer it as a file once and then opens with the default template as if
 * nothing were stored. Kept apart from the page so it runs under node --test.
 */

import { defaultTemplate } from "../../lib/welllog/view/template/defaults.ts";
import { readTemplate, writeTemplate } from "../../lib/welllog/view/template/file.ts";
import type { Template } from "../../lib/welllog/view/template/types.ts";

export const TEMPLATE_KEY = "petroviz.logs.template";
export const UNREADABLE_KEY = "petroviz.logs.template.unreadable";

/** The part of Storage used, so a test can pass its own. */
export type TemplateStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface Restored {
  readonly template: Template;
  /** The stored text that wouldn't read, now under UNREADABLE_KEY; null when there was none. */
  readonly unreadable: string | null;
}

/**
 * The page's localStorage, or null where the browser refuses it (storage
 * disabled, or blocked for the site). The page then keeps its template only
 * while open.
 */
export function browserStorage(): TemplateStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The stored template, else the default; a stored copy that won't read is set aside. */
export function restoreTemplate(storage: TemplateStorage | null): Restored {
  const text = attempt(() => storage?.getItem(TEMPLATE_KEY) ?? null) ?? null;
  if (text === null) return { template: defaultTemplate(), unreadable: null };
  const read = readTemplate(text);
  if (read.ok) return { template: read.template, unreadable: null };
  // Removed only once kept: if the second key can't take it, it stays where it was.
  attempt(() => {
    storage?.setItem(UNREADABLE_KEY, text);
    storage?.removeItem(TEMPLATE_KEY);
  });
  return { template: defaultTemplate(), unreadable: text };
}

/** Store `template`; a full or refused storage keeps what it had. */
export function storeTemplate(storage: TemplateStorage | null, template: Template): void {
  attempt(() => storage?.setItem(TEMPLATE_KEY, writeTemplate(template)));
}

/** Whether a dropped file goes to the template parser rather than readLas: a `.json` file. */
export function isTemplateFile(fileName: string): boolean {
  return /\.json$/i.test(fileName);
}

/** `run`'s result, or undefined if storage threw (refused, or over its quota). */
function attempt<T>(run: () => T): T | undefined {
  try {
    return run();
  } catch {
    return undefined;
  }
}
