/**
 * The template file (#28, #57): the current template as JSON,
 * `{ "format": "petroviz-template", "version": 1, "name", "description?",
 * "tracks": [...] }`. The host writes it to files and to the browser's
 * storage, and reads both through `readTemplate` (ADR-0004).
 *
 * Reading is all or nothing. A file in an older version upgrades forward
 * one version at a time; a newer version is refused. Then every problem is
 * listed, with where it is (`tracks[2].curves[0].style.colour …`): a missing
 * or wrongly typed field, a value outside what it can hold, an unknown track
 * kind, an id used twice, or a fill that names an entry its track lacks or
 * couldn't draw (as `fillCanDraw`). Keys it doesn't know are ignored and
 * left out of the template read. Hand-written, with no schema library.
 */

import { FGDC_PATTERNS } from "./types.ts";
import type {
  CodeStyle,
  CurveEntry,
  CurveScale,
  CurveStyle,
  CurveTrack,
  DiscreteEntry,
  Fill,
  FillBoundary,
  ScaleEnds,
  Selector,
  Template,
  Track,
} from "./types.ts";

export const TEMPLATE_FORMAT = "petroviz-template";
/** The version this module writes and validates. */
export const TEMPLATE_VERSION = 1;

/** A JSON object, as parsed: nothing about it is checked yet. */
type JsonObject = Record<string, unknown>;

/** A file's top-level object, as a step reads and returns it. It may meet anything an old file holds. */
export type Upgrade = (file: JsonObject) => JsonObject;

/** Version n → the step from n to n + 1. None yet: version 1 is the first. */
const UPGRADES: Readonly<Record<number, Upgrade>> = {};

/** The version read, and how to reach it from older ones. A test seam; the page uses the current one. */
export interface Versions {
  readonly version: number;
  readonly upgrades: Readonly<Record<number, Upgrade>>;
}

export type TemplateRead =
  | { readonly ok: true; readonly template: Template }
  | { readonly ok: false; readonly problems: readonly string[] };

/** The file for `template`, format and version first. */
export function writeTemplate(template: Template): string {
  return `${JSON.stringify({ format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, ...template }, null, 2)}\n`;
}

/** `<name-slug>.petroviz-template.json`; a name with no letters or digits gives `template`. */
export function templateFileName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "template"}.${TEMPLATE_FORMAT}.json`;
}

/** The template in `text`, or every problem that keeps it from being one. */
export function readTemplate(text: string, versions: Versions = { version: TEMPLATE_VERSION, upgrades: UPGRADES }): TemplateRead {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch (error) {
    return rejected(`The file isn't JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isObject(file)) return rejected(`The file should hold a JSON object, not ${describe(file)}`);

  if (file.format === undefined) return rejected(`format is missing: a template file has "format": "${TEMPLATE_FORMAT}"`);
  if (file.format !== TEMPLATE_FORMAT) return rejected(`format should be "${TEMPLATE_FORMAT}", not ${describe(file.format)}`);
  const { version } = file;
  if (version === undefined) return rejected("version is missing");
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return rejected(`version should be a whole number from 1, not ${describe(version)}`);
  }
  if (version > versions.version) {
    return rejected(
      `This template is version ${version}, saved by a newer petroviz than this page, which reads up to version ${versions.version}. Reload the page to update it.`,
    );
  }
  let current = file;
  for (let v = version; v < versions.version; v++) {
    const step = versions.upgrades[v];
    if (!step) return rejected(`This page can't upgrade a version ${v} template.`);
    try {
      current = step(current);
    } catch (error) {
      return rejected(`This page couldn't upgrade the version ${v} template: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isObject(current)) return rejected(`This page couldn't upgrade the version ${v} template.`);
  }

  const check = new Check();
  const template = check.template(current);
  return check.problems.length === 0 && template ? { ok: true, template } : { ok: false, problems: check.problems };
}

const rejected = (problem: string): TemplateRead => ({ ok: false, problems: [problem] });

/** A track's fields but its id and width, kind by kind. */
type TrackFields = Track extends infer T ? (T extends Track ? Omit<T, "id" | "width"> : never) : never;

const isObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

/** A value as a problem quotes it. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "a list";
  if (typeof value === "object") return "an object";
  if (typeof value === "string") return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
  return String(value);
}

const RGB = /^#[0-9a-f]{6}$/i;
const RGBA = /^#[0-9a-f]{8}$/i;

const SELECTOR_BY = ["key", "mnemonic", "family"] as const;
const SCALE_TYPES = ["linear", "log"] as const;
const ENDS_KINDS = ["fixed", "centredOnMedian", "percentile"] as const;
const OFF_SCALE = ["wrap", "clip"] as const;
const DASHES = ["solid", "dashed", "dotted", "dashdot"] as const;
const TRACK_KINDS = ["curve", "depth", "discrete", "zone"] as const;
const DEPTH_REFS = ["active", "md", "tvdss"] as const;
const BOUNDARY_KINDS = ["curve", "value", "edge"] as const;
const EDGES = ["left", "right"] as const;

/**
 * Reads a file's body field by field, collecting problems. Each reader
 * returns what it read, or undefined once it has noted why it couldn't, so
 * one bad field never hides the next.
 */
class Check {
  readonly problems: string[] = [];
  private readonly trackIds = new Set<string>();
  private readonly entryIds = new Set<string>();
  private readonly fillIds = new Set<string>();

  private problem(path: string, message: string): undefined {
    this.problems.push(`${path} ${message}`);
    return undefined;
  }

  /** A problem, for a check that goes on to note others: always false. */
  private fails(path: string, message: string): false {
    this.problem(path, message);
    return false;
  }

  /** `value`, if `ok`; else a problem saying it should be `expected`. */
  private expect<T>(value: unknown, path: string, ok: (value: unknown) => value is T, expected: string): T | undefined {
    if (value === undefined) return this.problem(path, "is missing");
    return ok(value) ? value : this.problem(path, `should be ${expected}, not ${describe(value)}`);
  }

  private object(value: unknown, path: string) {
    return this.expect(value, path, isObject, "an object");
  }

  private list(value: unknown, path: string) {
    return this.expect(value, path, Array.isArray, "a list");
  }

  private text(value: unknown, path: string) {
    return this.expect(value, path, (v): v is string => typeof v === "string", "text");
  }

  private number(value: unknown, path: string) {
    return this.expect(value, path, (v): v is number => typeof v === "number" && Number.isFinite(v), "a number");
  }

  private positive(value: unknown, path: string) {
    return this.expect(value, path, (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0, "a number above 0");
  }

  private percent(value: unknown, path: string) {
    return this.expect(value, path, (v): v is number => typeof v === "number" && v >= 0 && v <= 100, "a number from 0 to 100");
  }

  private boolean(value: unknown, path: string) {
    return this.expect(value, path, (v): v is boolean => typeof v === "boolean", "true or false");
  }

  private oneOf<const T extends string | number>(value: unknown, path: string, options: readonly T[]) {
    return this.expect(value, path, (v): v is T => options.includes(v as T), `one of ${options.join(", ")}`);
  }

  private colour(value: unknown, path: string, alpha = false) {
    const pattern = alpha ? RGBA : RGB;
    return this.expect(value, path, (v): v is string => typeof v === "string" && pattern.test(v), `a colour like ${alpha ? "#RRGGBBAA" : "#RRGGBB"}`);
  }

  /** An id, noting a second use among `seen`, which are things of one sort (`what`). */
  private id(value: unknown, path: string, seen: Set<string>, what: string) {
    const id = this.text(value, path);
    if (id === undefined) return undefined;
    if (seen.has(id)) return this.problem(path, `${JSON.stringify(id)} is used by another ${what}`);
    seen.add(id);
    return id;
  }

  /** Each item read by `read`; undefined if the list, or any item, couldn't be. */
  private items<T>(value: unknown, path: string, readItem: (item: unknown, path: string) => T | undefined): T[] | undefined {
    const list = this.list(value, path);
    if (!list) return undefined;
    const read = list.map((item, i) => readItem(item, `${path}[${i}]`));
    return read.every((item) => item !== undefined) ? (read as T[]) : undefined;
  }

  /** A map of names to values read by `read`, or undefined if absent. */
  private record<T>(value: unknown, path: string, readItem: (item: unknown, path: string) => T | undefined): Record<string, T> | undefined {
    const map = this.object(value, path);
    if (!map) return undefined;
    const entries = Object.entries(map).map(([key, item]) => [key, readItem(item, `${path}[${JSON.stringify(key)}]`)] as const);
    return entries.every(([, item]) => item !== undefined) ? (Object.fromEntries(entries) as Record<string, T>) : undefined;
  }

  template(file: JsonObject): Template | undefined {
    const name = this.text(file.name, "name");
    const description = file.description === undefined ? undefined : this.text(file.description, "description");
    const tracks = this.items(file.tracks, "tracks", (track, path) => this.track(track, path));
    if (name === undefined || tracks === undefined || (file.description !== undefined && description === undefined)) return undefined;
    return { name, ...(description !== undefined && { description }), tracks };
  }

  private track(value: unknown, path: string): Track | undefined {
    const track = this.object(value, path);
    if (!track) return undefined;
    const id = this.id(track.id, `${path}.id`, this.trackIds, "track");
    const kind = this.oneOf(track.kind, `${path}.kind`, TRACK_KINDS);
    const width = this.positive(track.width, `${path}.width`);
    if (kind === undefined) return undefined;
    const rest = this.trackOfKind(kind, track, path);
    if (id === undefined || width === undefined || rest === undefined) return undefined;
    return { id, width, ...rest };
  }

  /** The fields particular to a track's kind, with the kind first. */
  private trackOfKind(kind: Track["kind"], track: JsonObject, path: string): TrackFields | undefined {
    switch (kind) {
      case "curve":
        return this.curveTrack(track, path);
      case "depth": {
        const ref = this.oneOf(track.ref, `${path}.ref`, DEPTH_REFS);
        return ref && { kind, ref };
      }
      case "discrete": {
        const curve = this.discreteEntry(track.curve, `${path}.curve`);
        return curve && { kind, curve };
      }
      case "zone": {
        const zoneSet = this.text(track.zoneSet, `${path}.zoneSet`);
        const colours =
          track.colours === undefined ? undefined : this.record(track.colours, `${path}.colours`, (c, p) => this.colour(c, p));
        if (zoneSet === undefined || (track.colours !== undefined && colours === undefined)) return undefined;
        return { kind, zoneSet, ...(colours && { colours }) };
      }
    }
  }

  private curveTrack(track: JsonObject, path: string): Omit<CurveTrack, "id" | "width"> | undefined {
    const curves = this.items(track.curves, `${path}.curves`, (entry, p) => this.curveEntry(entry, p));
    if (track.fills === undefined) return curves && { kind: "curve", curves };
    // Fills are checked against the entry ids the track names, even when an entry is wrong otherwise.
    const entries = Array.isArray(track.curves)
      ? new Set(track.curves.flatMap((e) => (isObject(e) && typeof e.id === "string" ? [e.id] : [])))
      : undefined;
    const fills = this.items(track.fills, `${path}.fills`, (fill, p) => this.fill(fill, p, entries));
    return curves && fills && { kind: "curve", curves, fills };
  }

  private selectors(value: unknown, path: string): Selector[] | undefined {
    return this.items(value, path, (item, p) => {
      const selector = this.object(item, p);
      if (!selector) return undefined;
      const by = this.oneOf(selector.by, `${p}.by`, SELECTOR_BY);
      const text = this.text(selector.value, `${p}.value`);
      return by && text !== undefined ? { by, value: text } : undefined;
    });
  }

  private curveEntry(value: unknown, path: string): CurveEntry | undefined {
    const entry = this.object(value, path);
    if (!entry) return undefined;
    const id = this.id(entry.id, `${path}.id`, this.entryIds, "curve entry");
    const select = this.selectors(entry.select, `${path}.select`);
    const scale = this.scale(entry.scale, `${path}.scale`);
    const offScale = this.oneOf(entry.offScale, `${path}.offScale`, OFF_SCALE);
    const style = this.style(entry.style, `${path}.style`);
    if (id === undefined || !select || !scale || !offScale || !style) return undefined;
    return { id, select, scale, offScale, style };
  }

  private scale(value: unknown, path: string): CurveScale | undefined {
    const scale = this.object(value, path);
    if (!scale) return undefined;
    const type = this.oneOf(scale.type, `${path}.type`, SCALE_TYPES);
    const ends = this.ends(scale.ends, `${path}.ends`, type);
    return type && ends && { type, ends };
  }

  /** Ends that make a scale: fixed ends apart, and above zero on a log scale; percentiles in order. */
  private ends(value: unknown, path: string, type: CurveScale["type"] | undefined): ScaleEnds | undefined {
    const ends = this.object(value, path);
    if (!ends) return undefined;
    const kind = this.oneOf(ends.kind, `${path}.kind`, ENDS_KINDS);
    switch (kind) {
      case undefined:
        return undefined;
      case "fixed": {
        const left = this.number(ends.left, `${path}.left`);
        const right = this.number(ends.right, `${path}.right`);
        const unit = this.text(ends.unit, `${path}.unit`);
        if (left === undefined || right === undefined) return undefined;
        let ok = unit !== undefined;
        if (left === right) ok = this.fails(`${path}.right`, "should differ from left");
        for (const [side, end] of [["left", left], ["right", right]] as const) {
          if (type === "log" && end <= 0) ok = this.fails(`${path}.${side}`, `should be above 0 on a log scale, not ${end}`);
        }
        return ok ? { kind, left, right, unit: unit! } : undefined;
      }
      case "centredOnMedian": {
        const width = this.positive(ends.width, `${path}.width`);
        const reversed = this.boolean(ends.reversed, `${path}.reversed`);
        return width !== undefined && reversed !== undefined ? { kind, width, reversed } : undefined;
      }
      case "percentile": {
        const lo = this.percent(ends.lo, `${path}.lo`);
        const hi = this.percent(ends.hi, `${path}.hi`);
        const reversed = this.boolean(ends.reversed, `${path}.reversed`);
        if (lo === undefined || hi === undefined || reversed === undefined) return undefined;
        if (hi <= lo) return this.problem(`${path}.hi`, "should be above lo");
        return { kind, lo, hi, reversed };
      }
    }
  }

  private style(value: unknown, path: string): CurveStyle | undefined {
    const style = this.object(value, path);
    if (!style) return undefined;
    const colour = this.colour(style.colour, `${path}.colour`);
    const width = this.positive(style.width, `${path}.width`);
    const dash = this.oneOf(style.dash, `${path}.dash`, DASHES);
    return colour && width !== undefined && dash ? { colour, width, dash } : undefined;
  }

  /** A fill; `entries` are its track's curve entry ids, or undefined when the track has no list of entries. */
  private fill(value: unknown, path: string, entries: ReadonlySet<string> | undefined): Fill | undefined {
    const fill = this.object(value, path);
    if (!fill) return undefined;
    const id = this.id(fill.id, `${path}.id`, this.fillIds, "fill");
    const a = this.boundary(fill.a, `${path}.a`);
    const b = this.boundary(fill.b, `${path}.b`);
    const colourWhereALeft = this.colour(fill.colourWhereALeft, `${path}.colourWhereALeft`, true);
    const colourWhereARight = this.colour(fill.colourWhereARight, `${path}.colourWhereARight`, true);
    if (id === undefined || !a || !b || !colourWhereALeft || !colourWhereARight || !entries) return undefined;
    // As fillCanDraw, but saying which rule fails.
    let ok = true;
    for (const [side, boundary] of [["a", a], ["b", b]] as const) {
      if (boundary.kind === "curve" && !entries.has(boundary.id)) {
        ok = this.fails(`${path}.${side}`, `names ${JSON.stringify(boundary.id)}, which isn't a curve in this track`);
      }
    }
    if (a.kind !== "curve" && b.kind !== "curve") ok = this.fails(path, "needs a curve on at least one side");
    for (const [side, boundary, other] of [["a", a, b], ["b", b, a]] as const) {
      if (boundary.kind === "value" && other.kind !== "curve") {
        ok = this.fails(`${path}.${side}`, "is a value, which needs a curve on the other side");
      }
    }
    return ok ? { id, a, b, colourWhereALeft, colourWhereARight } : undefined;
  }

  private boundary(value: unknown, path: string): FillBoundary | undefined {
    const boundary = this.object(value, path);
    if (!boundary) return undefined;
    const kind = this.oneOf(boundary.kind, `${path}.kind`, BOUNDARY_KINDS);
    switch (kind) {
      case undefined:
        return undefined;
      case "curve": {
        const id = this.text(boundary.id, `${path}.id`);
        return id === undefined ? undefined : { kind, id };
      }
      case "value": {
        const number = this.number(boundary.value, `${path}.value`);
        return number === undefined ? undefined : { kind, value: number };
      }
      case "edge": {
        const edge = this.oneOf(boundary.edge, `${path}.edge`, EDGES);
        return edge && { kind, edge };
      }
    }
  }

  private discreteEntry(value: unknown, path: string): DiscreteEntry | undefined {
    const entry = this.object(value, path);
    if (!entry) return undefined;
    const id = this.id(entry.id, `${path}.id`, this.entryIds, "curve entry");
    const select = this.selectors(entry.select, `${path}.select`);
    const codes = entry.codes === undefined ? undefined : this.record(entry.codes, `${path}.codes`, (c, p) => this.codeStyle(c, p));
    if (id === undefined || !select || (entry.codes !== undefined && !codes)) return undefined;
    return { id, select, ...(codes && { codes }) };
  }

  private codeStyle(value: unknown, path: string): CodeStyle | undefined {
    const style = this.object(value, path);
    if (!style) return undefined;
    const colour = this.colour(style.colour, `${path}.colour`);
    const pattern = style.pattern === undefined ? undefined : this.oneOf(style.pattern, `${path}.pattern`, FGDC_PATTERNS);
    if (!colour || (style.pattern !== undefined && pattern === undefined)) return undefined;
    return { colour, ...(pattern !== undefined && { pattern }) };
  }
}
