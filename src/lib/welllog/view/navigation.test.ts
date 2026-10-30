import { test } from "node:test";
import assert from "node:assert/strict";
import type { Curve, WellLog } from "../core/index.ts";
import {
  MIN_SPAN,
  centreOn,
  effectiveInterval,
  fitZone,
  keyStep,
  overviewCurve,
  panBy,
  panByPixels,
  parseInterval,
  placeAt,
  spanInUnit,
  typedInterval,
  wheelPixels,
  wheelZoomFactor,
  zoomAround,
  zoomToSpan,
} from "./navigation.ts";

const WHOLE = { top: 1000, base: 3000 };

const close = (actual: number, expected: number, message?: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, message ?? `${actual} ≉ ${expected}`);

test("the effective interval is the bound interval clamped to the well", () => {
  assert.deepEqual(effectiveInterval({ top: 1500, base: 1600 }, WHOLE), { top: 1500, base: 1600 });
  assert.deepEqual(effectiveInterval({ top: 800, base: 1200 }, WHOLE), { top: 1000, base: 1200 });
  assert.deepEqual(effectiveInterval({ top: 2900, base: 3500 }, WHOLE), { top: 2900, base: 3000 });
  assert.deepEqual(effectiveInterval({ top: 0, base: 9000 }, WHOLE), WHOLE);
});

test("the effective interval falls back to the whole well when they don't overlap", () => {
  assert.deepEqual(effectiveInterval(null, WHOLE), WHOLE);
  assert.deepEqual(effectiveInterval({ top: 100, base: 900 }, WHOLE), WHOLE);
  assert.deepEqual(effectiveInterval({ top: 3000, base: 3100 }, WHOLE), WHOLE);
  assert.deepEqual(effectiveInterval({ top: 500, base: 1000 }, WHOLE), WHOLE);
});

test("zooming keeps the depth under the pointer fixed", () => {
  const view = { top: 1500, base: 1700 };
  for (const factor of [0.5, 0.8, 1.25, 2]) {
    for (const depth of [1520, 1600, 1690]) {
      const fraction = (depth - view.top) / (view.base - view.top);
      const next = zoomAround(view, depth, factor, WHOLE);
      close(next.base - next.top, 200 * factor);
      close((depth - next.top) / (next.base - next.top), fraction, `${depth} moved at ×${factor}`);
    }
  }
});

test("zooming stops at the minimum span and at the whole well", () => {
  const tight = zoomAround({ top: 1500, base: 1503 }, 1501, 0.1, WHOLE);
  close(tight.base - tight.top, MIN_SPAN);
  close((1501 - tight.top) / MIN_SPAN, 1 / 3);
  assert.deepEqual(zoomAround({ top: 1500, base: 2500 }, 2000, 10, WHOLE), WHOLE);
});

test("zooming out at an end of the well stays inside it", () => {
  const next = zoomAround({ top: 1000, base: 1100 }, 1010, 2, WHOLE);
  assert.deepEqual(next, { top: 1000, base: 1200 });
  const low = zoomAround({ top: 2900, base: 3000 }, 2990, 2, WHOLE);
  assert.deepEqual(low, { top: 2800, base: 3000 });
});

test("a single-row well log zooms within its one depth unit", () => {
  const whole = { top: 500, base: 501 };
  assert.deepEqual(zoomAround(whole, 500.5, 0.5, whole), whole);
});

test("panning moves by a depth and keeps the span, stopping at the ends", () => {
  const view = { top: 1500, base: 1700 };
  assert.deepEqual(panBy(view, 50, WHOLE), { top: 1550, base: 1750 });
  assert.deepEqual(panBy(view, -50, WHOLE), { top: 1450, base: 1650 });
  assert.deepEqual(panBy(view, -900, WHOLE), { top: 1000, base: 1200 });
  assert.deepEqual(panBy(view, 5000, WHOLE), { top: 2800, base: 3000 });
});

test("a wheel step scrolls by its share of the view height", () => {
  // 100 px of wheel over a 500 px view moves a fifth of the visible span.
  const view = { top: 1500, base: 1700 };
  assert.deepEqual(panByPixels(view, wheelPixels(100, 0, 500), 500, WHOLE), { top: 1540, base: 1740 });
  assert.equal(wheelPixels(3, 1, 500), 48);
  assert.equal(wheelPixels(1, 2, 500), 500);
  assert.equal(wheelPixels(-120, 0, 500), -120);
});

test("pixels pan by their share of the view's span, or of the whole well on the overview", () => {
  const view = { top: 1500, base: 1700 };
  assert.deepEqual(panByPixels(view, 100, 500, WHOLE), { top: 1540, base: 1740 });
  assert.deepEqual(panByPixels(view, -50, 500, WHOLE, 2000), { top: 1300, base: 1500 });
});

test("the overview strip's keys step a tenth of the view, a view, or to an end", () => {
  const view = { top: 1500, base: 1700 };
  assert.deepEqual(keyStep(view, "ArrowDown", WHOLE), { top: 1520, base: 1720 });
  assert.deepEqual(keyStep(view, "ArrowUp", WHOLE), { top: 1480, base: 1680 });
  assert.deepEqual(keyStep(view, "PageDown", WHOLE), { top: 1700, base: 1900 });
  assert.deepEqual(keyStep(view, "PageUp", WHOLE), { top: 1300, base: 1500 });
  assert.deepEqual(keyStep(view, "Home", WHOLE), { top: 1000, base: 1200 });
  assert.deepEqual(keyStep(view, "End", WHOLE), { top: 2800, base: 3000 });
  assert.equal(keyStep(view, "Enter", WHOLE), null);
});

test("Ctrl+wheel zooms out on a step down and in on a step up, by a bounded factor", () => {
  assert.ok(wheelZoomFactor(100) > 1);
  assert.ok(wheelZoomFactor(-100) < 1);
  close(wheelZoomFactor(100) * wheelZoomFactor(-100), 1);
  assert.equal(wheelZoomFactor(1000), wheelZoomFactor(60));
  assert.equal(wheelZoomFactor(0), 1);
});

test("placing a depth at a fraction of the view, as a pinch does", () => {
  assert.deepEqual(placeAt(2000, 0.25, 400, WHOLE), { top: 1900, base: 2300 });
  assert.deepEqual(placeAt(1050, 0.5, 400, WHOLE), { top: 1000, base: 1400 });
});

test("centring on a depth keeps the span", () => {
  assert.deepEqual(centreOn({ top: 1500, base: 1700 }, 2500, WHOLE), { top: 2400, base: 2600 });
  assert.deepEqual(centreOn({ top: 1500, base: 1700 }, 2950, WHOLE), { top: 2800, base: 3000 });
});

test("the zoom buttons zoom around the centre of the view", () => {
  assert.deepEqual(zoomToSpan({ top: 1800, base: 2200 }, 100, WHOLE), { top: 1950, base: 2050 });
  assert.deepEqual(zoomToSpan({ top: 1950, base: 2050 }, 500, WHOLE), { top: 1750, base: 2250 });
  assert.deepEqual(zoomToSpan({ top: 1800, base: 2200 }, 5000, WHOLE), WHOLE);
});

test("the zoom buttons near the top and base of the well stay inside it", () => {
  assert.deepEqual(zoomToSpan({ top: 1000, base: 1040 }, 500, WHOLE), { top: 1000, base: 1500 });
  assert.deepEqual(zoomToSpan({ top: 2990, base: 3000 }, 100, WHOLE), { top: 2900, base: 3000 });
  assert.deepEqual(zoomToSpan({ top: 1000, base: 3000 }, 20, WHOLE), { top: 1990, base: 2010 });
});

test("zoom button spans are in metres, converted to the well's depth unit", () => {
  assert.equal(spanInUnit(100, "m"), 100);
  close(spanInUnit(100, "ft"), 100 / 0.3048);
});

test("clicking a zone fits the view to it, with a little room above and below", () => {
  const view = fitZone({ top: 2000, base: 2100 }, WHOLE);
  assert.ok(view.top < 2000 && view.top >= 1990);
  assert.ok(view.base > 2100 && view.base <= 2110);
  assert.deepEqual(fitZone({ top: 1000, base: 1500 }, WHOLE).top, 1000);
  close(fitZone({ top: 2000, base: 2000.5 }, WHOLE).base - fitZone({ top: 2000, base: 2000.5 }, WHOLE).top, MIN_SPAN);
});

test("the interval input takes two numbers, top above base", () => {
  assert.deepEqual(parseInterval("1500", "1700.5"), { top: 1500, base: 1700.5 });
  assert.deepEqual(parseInterval(" 1500 ", "1,700"), null);
  assert.equal(parseInterval("1700", "1500"), null);
  assert.equal(parseInterval("1500", "1500"), null);
  assert.equal(parseInterval("", "1500"), null);
  assert.equal(parseInterval("abc", "1500"), null);
  assert.equal(parseInterval("1e3", "Infinity"), null);
});

test("a typed interval is clamped to the well and kept at least MIN_SPAN, or dropped outside it", () => {
  assert.deepEqual(typedInterval("2400", "2550", WHOLE), { top: 2400, base: 2550 });
  assert.deepEqual(typedInterval("900", "1100", WHOLE), { top: 1000, base: 1100 });
  assert.deepEqual(typedInterval("2000", "2000.5", WHOLE), { top: 1999.25, base: 2001.25 });
  assert.equal(typedInterval("100", "900", WHOLE), null);
  assert.equal(typedInterval("3000", "3100", WHOLE), null);
  assert.equal(typedInterval("2550", "2400", WHOLE), null);
});

const curve = (key: string, family: Curve["family"], kind: Curve["kind"] = "continuous"): Curve => ({
  key,
  mnemonic: key,
  unit: "",
  description: "",
  kind,
  family,
  values: new Float32Array(0),
});

const logWith = (curves: Curve[]) => ({ curves }) as unknown as WellLog;

test("the overview shows the first gamma-ray curve in well log order", () => {
  const log = logWith([curve("LITH", "lithology", "discrete"), curve("SGR", "spectral-gamma-ray"), curve("GRC", "gamma-ray"), curve("GR", "gamma-ray")]);
  assert.equal(overviewCurve(log)?.key, "GRC");
});

test("without gamma ray the overview shows the first continuous curve", () => {
  assert.equal(overviewCurve(logWith([curve("LITH", "lithology", "discrete"), curve("RDEP", "resistivity-deep")]))?.key, "RDEP");
  assert.equal(overviewCurve(logWith([curve("LITH", "lithology", "discrete")])), null);
});
