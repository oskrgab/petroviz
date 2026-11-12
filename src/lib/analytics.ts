/**
 * Umami custom events. The tracker is the tag in `src/app.html`, which
 * counts the production hostnames only, so a caller needn't check where the
 * page is. It drops the URL's query and the page title from everything it
 * sends; an event's data is all it adds, so data names only public things.
 */

/** What an event carries: Umami stores strings and numbers. */
export type EventData = Readonly<Record<string, string | number>>;

/** The part of `window` an event needs, so a test can stand in for it. */
export interface AnalyticsWindow {
  /** Defined by the tracker when it runs; absent until then, or for good if it's blocked. */
  readonly umami?: { track(name: string, data?: EventData): unknown };
  readonly document: { readonly readyState: DocumentReadyState };
  addEventListener(type: "load", listener: () => void, options: { once: true }): void;
}

/**
 * Send event `name` with `data`. The tracker is a deferred script, so an
 * event ready before it runs waits for the page's load event. A page that
 * loaded without it (an ad blocker, a failed fetch) drops the event.
 */
export function track(
  name: string,
  data: EventData,
  win: AnalyticsWindow = window as unknown as AnalyticsWindow,
): void {
  if (win.umami) {
    win.umami.track(name, data);
  } else if (win.document.readyState !== "complete") {
    win.addEventListener("load", () => win.umami?.track(name, data), { once: true });
  }
}
