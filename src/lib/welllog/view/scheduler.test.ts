import { test } from "node:test";
import assert from "node:assert/strict";
import { FRAME_BUDGET_MS, FrameScheduler, type FrameClock } from "./scheduler.ts";

/** A clock whose frames run when told, and whose time moves only as draws spend it. */
function fakeClock() {
  let now = 0;
  let next: (() => void) | null = null;
  let frames = 0;
  const clock: FrameClock = {
    now: () => now,
    request(callback) {
      assert.equal(next, null, "one frame requested at a time");
      next = callback;
      return ++frames;
    },
    cancel() {
      next = null;
    },
  };
  return {
    clock,
    spend: (ms: number) => (now += ms),
    /** Run the requested frame; false when none was requested. */
    frame() {
      const run = next;
      next = null;
      run?.();
      return run !== null;
    },
  };
}

test("requests within a frame are drawn once, in that frame, the later request for a key winning", () => {
  const { clock, frame } = fakeClock();
  const scheduler = new FrameScheduler(clock);
  const drawn: string[] = [];
  const a = {};
  scheduler.request(a, () => drawn.push("a1"));
  scheduler.request({}, () => drawn.push("b"));
  scheduler.request(a, () => drawn.push("a2"));
  assert.deepEqual(drawn, []);
  assert.ok(frame());
  assert.deepEqual(drawn, ["a2", "b"]);
  assert.equal(frame(), false, "nothing left, so no frame requested");
});

test("a frame's draws stop once they have taken the budget, and the rest are drawn in the next frame", () => {
  const { clock, spend, frame } = fakeClock();
  const scheduler = new FrameScheduler(clock);
  const drawn: string[] = [];
  const cost = FRAME_BUDGET_MS * 0.4;
  for (const name of ["a", "b", "c", "d"]) {
    scheduler.request({}, () => {
      drawn.push(name);
      spend(cost);
    });
  }
  frame();
  assert.deepEqual(drawn, ["a", "b", "c"]);
  frame();
  assert.deepEqual(drawn, ["a", "b", "c", "d"]);
});

test("a draw over the budget on its own is still drawn, one per frame", () => {
  const { clock, spend, frame } = fakeClock();
  const scheduler = new FrameScheduler(clock);
  const drawn: string[] = [];
  for (const name of ["a", "b"]) {
    scheduler.request({}, () => {
      drawn.push(name);
      spend(FRAME_BUDGET_MS * 3);
    });
  }
  frame();
  assert.deepEqual(drawn, ["a"]);
  frame();
  assert.deepEqual(drawn, ["a", "b"]);
});

test("draws left over go first in the next frame, so none waits behind the others for long", () => {
  const { clock, spend, frame } = fakeClock();
  const scheduler = new FrameScheduler(clock);
  const drawn: string[] = [];
  const keys = { a: {}, b: {}, c: {} };
  const request = (name: keyof typeof keys) =>
    scheduler.request(keys[name], () => {
      drawn.push(name);
      spend(FRAME_BUDGET_MS * 0.6);
    });
  request("a");
  request("b");
  request("c");
  frame(); // a, b
  // Everything asks again before the next frame, c's earlier request replaced.
  request("a");
  request("b");
  request("c");
  frame();
  assert.deepEqual(drawn, ["a", "b", "c", "a"]);
});

test("a cancelled request isn't drawn, left over or not", () => {
  const { clock, spend, frame } = fakeClock();
  const scheduler = new FrameScheduler(clock);
  const drawn: string[] = [];
  const keys = [{}, {}, {}];
  keys.forEach((key, i) =>
    scheduler.request(key, () => {
      drawn.push(String(i));
      spend(FRAME_BUDGET_MS);
    }),
  );
  scheduler.cancel(keys[0]);
  frame();
  scheduler.cancel(keys[2]);
  assert.equal(frame(), false);
  assert.deepEqual(drawn, ["1"]);
});

test("destroy drops every request and the frame", () => {
  const { clock, frame } = fakeClock();
  const scheduler = new FrameScheduler(clock);
  const drawn: string[] = [];
  scheduler.request({}, () => drawn.push("a"));
  scheduler.destroy();
  assert.equal(frame(), false);
  assert.deepEqual(drawn, []);
});

test("a draw left over keeps its place when it is cancelled and asked for again, as a track's effect does", () => {
  const { clock, spend, frame } = fakeClock();
  const scheduler = new FrameScheduler(clock);
  const drawn: string[] = [];
  const keys = { a: {}, b: {}, c: {} };
  // As TrackCanvas reruns its effect: cancel, then ask again.
  const rerun = (name: keyof typeof keys) => {
    scheduler.cancel(keys[name]);
    scheduler.request(keys[name], () => {
      drawn.push(name);
      spend(FRAME_BUDGET_MS * 0.6);
    });
  };
  for (const name of ["a", "b", "c"] as const) rerun(name);
  frame(); // a, b
  for (const name of ["a", "b", "c"] as const) rerun(name);
  frame(); // c first, then a
  for (const name of ["a", "b", "c"] as const) rerun(name);
  frame(); // b, which waited this time, first
  assert.deepEqual(drawn, ["a", "b", "c", "a", "b", "a"]);
});
