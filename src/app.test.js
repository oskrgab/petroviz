import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// The Umami loader in app.html. Opening a LAS file puts its file name in the
// URL's query (?las=) and its well and file names in the page title, and
// Umami sends both with every page view unless told not to.
const html = readFileSync(new URL("./app.html", import.meta.url), "utf8");
const PLACEHOLDER = "%sveltekit.env.PUBLIC_UMAMI_WEBSITE_ID%";
const loader = html.match(/<script data-website-id="([^"]*)">([\s\S]*?)<\/script>/);

/**
 * Run the loader as a browser would, with `id` as the build's website id.
 * @param {string} id
 */
function load(id) {
  assert.ok(loader, "no <script data-website-id=…> loader in app.html");
  /** @type {Record<string, string>[]} */
  const added = [];
  /** @type {Record<string, unknown>} */
  const window = {};
  const document = {
    currentScript: { getAttribute: () => id },
    createElement: () => {
      /** @type {Record<string, string>} */
      const attributes = {};
      return { attributes, setAttribute: (/** @type {string} */ k, /** @type {string} */ v) => (attributes[k] = v) };
    },
    head: { appendChild: (/** @type {{ attributes: Record<string, string> }} */ el) => added.push(el.attributes) },
  };
  vm.runInNewContext(loader[2], { window, document });
  return { added, window };
}

test("the website id comes from the build, not the repo", () => {
  assert.equal(loader?.[1], PLACEHOLDER);
  assert.doesNotMatch(html, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
});

test("a build without a website id loads no tracker", () => {
  const { added, window } = load("");
  assert.deepEqual(added, []);
  assert.deepEqual(Object.keys(window), []);
});

test("the tracker counts the production hostnames only, and never sends the query", () => {
  const { added } = load("some-website-id");
  assert.equal(added.length, 1);
  const [tracker] = added;
  assert.equal(tracker.src, "https://analytics.ocortez.com/script.js");
  assert.equal(tracker["data-website-id"], "some-website-id");
  assert.deepEqual(tracker["data-domains"].split(","), ["petroviz.ocortez.com", "petroviz.pages.dev"]);
  assert.equal(tracker["data-exclude-search"], "true");
});

test("the tracker's before-send hook drops the title, which names an opened LAS file's well", () => {
  const { added, window } = load("some-website-id");
  const name = added[0]["data-before-send"];
  assert.ok(name, "the tracker has no data-before-send");
  const hook = /** @type {(type: string, payload: object) => object} */ (window[name]);
  assert.equal(typeof hook, "function", `the loader defines no window.${name}`);

  const payload = {
    website: "some-website-id",
    hostname: "petroviz.ocortez.com",
    url: "https://petroviz.ocortez.com/logs",
    title: "15/9-F-1 · private.las · Well logs",
  };
  // Compared as the JSON Umami posts: the sandbox's objects have its own prototype
  assert.deepEqual(JSON.parse(JSON.stringify(hook("event", payload))), {
    website: payload.website,
    hostname: payload.hostname,
    url: payload.url,
  });
  assert.equal(payload.title, "15/9-F-1 · private.las · Well logs", "the hook changed its input");
});
