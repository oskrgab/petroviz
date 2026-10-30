import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultTemplate } from "../../lib/welllog/view/template/defaults.ts";
import { editTemplate } from "../../lib/welllog/view/template/edit.ts";
import { isTemplateFile, restoreTemplate, storeTemplate, TEMPLATE_KEY, UNREADABLE_KEY, type TemplateStorage } from "./templates.ts";

/** A storage over a Map, which can be made to refuse writes or every call. */
function memoryStorage(items: Record<string, string> = {}, refuse: "writes" | "all" | null = null) {
  const map = new Map(Object.entries(items));
  const refused = () => {
    throw new DOMException("refused", "QuotaExceededError");
  };
  const storage: TemplateStorage = {
    getItem: (key) => (refuse === "all" ? refused() : (map.get(key) ?? null)),
    setItem: (key, value) => (refuse ? refused() : void map.set(key, value)),
    removeItem: (key) => (refuse ? refused() : void map.delete(key)),
  };
  return { storage, map };
}

const edited = editTemplate(defaultTemplate(), { kind: "remove-track", trackId: "sonic" });

test("nothing stored opens the default template", () => {
  assert.deepEqual(restoreTemplate(memoryStorage().storage), { template: defaultTemplate(), unreadable: null });
});

test("a stored template is read back as it was stored", () => {
  const { storage, map } = memoryStorage();
  storeTemplate(storage, edited);
  assert.match(map.get(TEMPLATE_KEY)!, /"format": "petroviz-template"/);
  assert.deepEqual(restoreTemplate(storage), { template: edited, unreadable: null });
});

test("a stored copy that won't read opens the default, and is set aside once", () => {
  const corrupt = '{"format": "petroviz-template", "version": 1, "name": "Mine", "tracks": [{"kind": "curve"';
  const { storage, map } = memoryStorage({ [TEMPLATE_KEY]: corrupt });
  assert.deepEqual(restoreTemplate(storage), { template: defaultTemplate(), unreadable: corrupt });
  assert.equal(map.get(UNREADABLE_KEY), corrupt);
  assert.equal(map.has(TEMPLATE_KEY), false);
  // The next visit opens the default with nothing to say, and the text stays under its own key.
  assert.deepEqual(restoreTemplate(storage), { template: defaultTemplate(), unreadable: null });
  assert.equal(map.get(UNREADABLE_KEY), corrupt);
});

test("a stored template that is valid JSON but not a valid template is set aside too", () => {
  const invalid = JSON.stringify({ format: "petroviz-template", version: 1, name: "Mine" });
  const { storage } = memoryStorage({ [TEMPLATE_KEY]: invalid });
  assert.deepEqual(restoreTemplate(storage), { template: defaultTemplate(), unreadable: invalid });
});

test("storage that refuses, or isn't there, never throws", () => {
  assert.deepEqual(restoreTemplate(null), { template: defaultTemplate(), unreadable: null });
  assert.deepEqual(restoreTemplate(memoryStorage({}, "all").storage), { template: defaultTemplate(), unreadable: null });
  storeTemplate(null, edited);
  const full = memoryStorage({ [TEMPLATE_KEY]: "{" }, "writes");
  storeTemplate(full.storage, edited);
  assert.equal(full.map.get(TEMPLATE_KEY), "{");
  // A copy that can't be moved aside is still reported, and the default opens.
  assert.deepEqual(restoreTemplate(full.storage), { template: defaultTemplate(), unreadable: "{" });
});

test("a dropped .json file is a template, and anything else is read as LAS", () => {
  assert.equal(isTemplateFile("mine.petroviz-template.json"), true);
  assert.equal(isTemplateFile("TRACKS.JSON"), true);
  assert.equal(isTemplateFile("well_a.las"), false);
  assert.equal(isTemplateFile("json.las"), false);
  assert.equal(isTemplateFile("well_a"), false);
});
