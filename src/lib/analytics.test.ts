import { test } from "node:test";
import assert from "node:assert/strict";

import { track, type AnalyticsWindow, type EventData } from "./analytics.ts";

type Sent = [string, EventData | undefined];

/** A window with the tracker loaded or not, recording what it sends and waits for. */
function fakeWindow(loaded: boolean, readyState: DocumentReadyState) {
  const sent: Sent[] = [];
  const onLoad: (() => void)[] = [];
  const umami = { track: (name: string, data?: EventData) => sent.push([name, data]) };
  const win: { umami?: typeof umami } & AnalyticsWindow = {
    umami: loaded ? umami : undefined,
    document: { readyState },
    addEventListener: (_type, listener) => onLoad.push(listener),
  };
  return { win, sent, onLoad, umami };
}

test("an event goes straight to a tracker that has loaded", () => {
  const { win, sent, onLoad } = fakeWindow(true, "complete");
  track("well-opened", { well: "15_9-13" }, win);
  assert.deepEqual(sent, [["well-opened", { well: "15_9-13" }]]);
  assert.equal(onLoad.length, 0);
});

test("an event ready before the tracker runs is sent once the page loads", () => {
  const { win, sent, onLoad, umami } = fakeWindow(false, "interactive");
  track("well-opened", { well: "15_9-13" }, win);
  assert.deepEqual(sent, []);

  win.umami = umami;
  onLoad.forEach((listener) => listener());
  assert.deepEqual(sent, [["well-opened", { well: "15_9-13" }]]);
});

test("a page that loaded without the tracker drops the event", () => {
  const { win, sent, onLoad } = fakeWindow(false, "complete");
  track("well-opened", { well: "15_9-13" }, win);
  assert.deepEqual(sent, []);
  assert.equal(onLoad.length, 0, "nothing should wait for a load that has happened");
});

test("a tracker still missing when the page loads drops the event", () => {
  const { win, sent, onLoad } = fakeWindow(false, "loading");
  track("well-opened", { well: "15_9-13" }, win);
  assert.doesNotThrow(() => onLoad.forEach((listener) => listener()));
  assert.deepEqual(sent, []);
});
