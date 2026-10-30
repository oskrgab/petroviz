/**
 * parseLas(text) → LasDocument: a faithful read of a LAS 1.2 or 2.x file
 * (#32). It normalises nothing: header items keep their sections and file
 * order, values stay strings, and the data are the file's numeric columns in
 * file order. `buildWellLog` applies the well log contract.
 *
 * It throws only where there is nothing to read: a LAS 3.0 file (naming the
 * version), a file with no `~A` section, or a wrapped file whose values don't
 * divide into rows.
 */

import { scanData, type ScannedData } from "./scan.ts";

/** The header sections a LAS document keeps. `~O` and custom sections are dropped. */
export type LasSection = "V" | "W" | "C" | "P";

export interface LasHeaderLine {
  readonly mnemonic: string;
  readonly unit: string;
  readonly value: string;
  readonly description: string;
}

export interface LasHeaderItem extends LasHeaderLine {
  readonly section: LasSection;
}

export interface LasData {
  readonly rows: number;
  /**
   * The file's numeric columns, in file order. Normally one per `~C` curve,
   * but when every data line holds the same number of values, that number.
   */
  readonly columns: readonly Float64Array[];
  /**
   * Per column, present only where a token wasn't a finite number: for each
   * row, 0, TOKEN_MISSING or TOKEN_UNREADABLE. The column holds NaN there.
   */
  readonly nonNumeric: readonly (Uint8Array | undefined)[];
  /** Data lines dropped because their token count differed from the curves'. */
  readonly droppedLines: number;
}

export interface LasDocument {
  /** `VERS` as written, or null without a `VERS` line. */
  readonly version: string | null;
  readonly wrap: boolean;
  /** Every `~V`, `~W` and `~P` item, in file order. */
  readonly items: readonly LasHeaderItem[];
  /** The `~C` curve definitions, in file order; the first is the index. */
  readonly curves: readonly LasHeaderItem[];
  readonly data: LasData;
}

const KEPT_SECTIONS = new Set<string>(["V", "W", "C", "P"]);

/** The standard sections by their names, which a section line may shorten to the letter. */
const SECTION_NAMES: Readonly<Record<string, string>> = {
  V: "VERSION",
  W: "WELL",
  C: "CURVE",
  P: "PARAMETER",
  O: "OTHER",
  A: "ASCII",
};

/**
 * The standard section a `~` line opens, by its first word: the letter alone
 * (`~A DEPTH GR`) or a word that the section's name starts with or that
 * starts with it (`~Curve`, `~CURVES`, `~ASCII`). Anything else, such as
 * `~Core_Data` or `~Additional_Info`, is a custom section, and null.
 */
function sectionOf(line: string): string | null {
  const word = (/^~([A-Za-z]*)/.exec(line)?.[1] ?? "").toUpperCase();
  const name = SECTION_NAMES[word[0] ?? ""];
  if (!name) return null;
  return word.length === 1 || name.startsWith(word) || word.startsWith(name) ? word[0] : null;
}

function isWhitespace(c: string): boolean {
  return c === " " || c === "\t";
}

/**
 * Where the value ends in the text after the unit: at the first colon with a
 * space or tab beside it, or failing that at the last colon (#32). -1 when
 * there is no colon.
 */
function valueEnd(rest: string): number {
  for (let i = rest.indexOf(":"); i >= 0; i = rest.indexOf(":", i + 1)) {
    if (isWhitespace(rest[i - 1] ?? "") || isWhitespace(rest[i + 1] ?? "")) return i;
  }
  return rest.lastIndexOf(":");
}

/**
 * Splits one header line (#32): the first dot ends the mnemonic, and the
 * first space after it ends the unit. In the rest, the value ends at the first
 * colon with a space beside it, or failing that at the last colon.
 *
 * A line with no dot before its first colon has no unit, and what follows
 * the colon is its value (`HOLE DIA :85.7`), as lasio reads it. A line with
 * neither a dot nor a colon isn't a header item, and gives null.
 */
export function splitHeaderLine(line: string): LasHeaderLine | null {
  const dot = line.indexOf(".");
  const colon = line.indexOf(":");
  if (dot < 0 || (colon >= 0 && colon < dot)) {
    if (colon < 0) return null;
    return { mnemonic: line.slice(0, colon).trim(), unit: "", value: line.slice(colon + 1).trim(), description: "" };
  }

  const mnemonic = line.slice(0, dot).trim();
  let unitEnd = dot + 1;
  while (unitEnd < line.length && !isWhitespace(line[unitEnd])) unitEnd++;
  const unit = line.slice(dot + 1, unitEnd);
  const rest = line.slice(unitEnd);
  const end = valueEnd(rest);
  return {
    mnemonic,
    unit,
    value: (end < 0 ? rest : rest.slice(0, end)).trim(),
    description: end < 0 ? "" : rest.slice(end + 1).trim(),
  };
}

/** The offset of the character after the line break that ends at `end`. */
function nextLine(text: string, end: number): number {
  if (text.charCodeAt(end) === 13) end++;
  if (text.charCodeAt(end) === 10) end++;
  return end;
}

interface Header {
  readonly items: LasHeaderItem[];
  readonly curves: LasHeaderItem[];
  /** The offset of the first character after the `~A` line, or -1. */
  readonly dataStart: number;
}

function readHeader(text: string): Header {
  const items: LasHeaderItem[] = [];
  const curves: LasHeaderItem[] = [];
  let section: string | null = null;
  let i = 0;
  while (i < text.length) {
    let end = i;
    while (end < text.length && text[end] !== "\n" && text[end] !== "\r") end++;
    const line = text.slice(i, end).trim();
    i = nextLine(text, end);

    if (line.startsWith("~")) {
      section = sectionOf(line);
      if (section === "A") return { items, curves, dataStart: i };
      continue;
    }
    if (line === "" || line.startsWith("#") || section === null || !KEPT_SECTIONS.has(section)) continue;
    const split = splitHeaderLine(line);
    if (!split) continue;
    const item = { section: section as LasSection, ...split };
    (section === "C" ? curves : items).push(item);
  }
  return { items, curves, dataStart: -1 };
}

function itemValue(items: readonly LasHeaderItem[], section: LasSection, mnemonic: string): string | null {
  return items.find((h) => h.section === section && h.mnemonic.toUpperCase() === mnemonic)?.value ?? null;
}

/**
 * Lays the scanned tokens out as columns. A wrapped file is one token stream
 * cut every `curves` tokens. In an unwrapped file, when every line holds the
 * same count, that count is the width; otherwise only lines holding one value
 * per curve are kept.
 */
function layOut(scan: ScannedData, curves: number, wrap: boolean): LasData {
  const { values, lineCounts, nonNumericAt, nonNumericKind } = scan;
  let width: number;
  const keptLines: boolean[] = [];
  if (wrap) {
    if (values.length % curves !== 0) {
      throw new Error(
        `This wrapped file has ${values.length} data values, which don't divide into rows of ${curves} curves`,
      );
    }
    width = curves;
  } else {
    const uniform = lineCounts.every((count) => count === lineCounts[0]);
    width = uniform && lineCounts.length > 0 ? lineCounts[0] : curves;
    for (const count of lineCounts) keptLines.push(count === width);
  }

  const rows = wrap ? values.length / width : keptLines.filter(Boolean).length;
  const columns = Array.from({ length: width }, () => new Float64Array(rows));
  const nonNumeric: (Uint8Array | undefined)[] = Array(width).fill(undefined);
  let o = 0; // next entry in nonNumericAt

  const copyRow = (from: number, row: number) => {
    for (let j = 0; j < width; j++) columns[j][row] = values[from + j];
    while (o < nonNumericAt.length && nonNumericAt[o] < from + width) {
      const at = nonNumericAt[o];
      if (at >= from) {
        const j = at - from;
        (nonNumeric[j] ??= new Uint8Array(rows))[row] = nonNumericKind[o];
      }
      o++;
    }
  };

  if (wrap) {
    for (let row = 0; row < rows; row++) copyRow(row * width, row);
  } else {
    let from = 0;
    let row = 0;
    lineCounts.forEach((count, line) => {
      if (keptLines[line]) copyRow(from, row++);
      from += count;
    });
  }

  return { rows, columns, nonNumeric, droppedLines: keptLines.filter((kept) => !kept).length };
}

export function parseLas(text: string): LasDocument {
  const { items, curves, dataStart } = readHeader(text);

  const version = itemValue(items, "V", "VERS");
  if (version !== null && Number(version) >= 3) {
    throw new Error(`This is a LAS ${version} file; only LAS 1.2 and 2.x files can be read`);
  }
  if (dataStart < 0) throw new Error("This file has no ~A section, so it holds no data");
  if (curves.length === 0) throw new Error("This file defines no curves in ~C, so it has no depth");

  const wrap = /^y/i.test(itemValue(items, "V", "WRAP") ?? "");
  const data = layOut(scanData(text, dataStart), curves.length, wrap);
  return { version, wrap, items, curves, data };
}
