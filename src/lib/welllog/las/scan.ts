/**
 * The data section's character scanner (#32, #35).
 *
 * One pass over the text after the `~A` line, reading every whitespace-
 * separated token as a number. A plain decimal of up to 15 digits (an
 * optional sign, digits, an optional point and digits) is read on the fast
 * path, which gives exactly what `Number()` gives: its digits form an integer
 * below 2^53 and 10^k is exact, so the quotient is correctly rounded. Any
 * other token falls back to `Number()`. `parseFloat` is never used, because it
 * reads `1.#INF` as 1 and `123,4` as 123.
 *
 * A token that isn't a finite number is stored as NaN and classified: a
 * spelled-out missing marker (`nan`, `-`, `#N/A`) or an unreadable token.
 */

/** A token that wasn't a finite number, by what it was. */
export const TOKEN_MISSING = 1;
export const TOKEN_UNREADABLE = 2;
export type NonNumericToken = typeof TOKEN_MISSING | typeof TOKEN_UNREADABLE;

export interface ScannedData {
  /** Every token's value in file order, NaN where it wasn't a finite number. */
  readonly values: Float64Array;
  /** How many tokens each data line held, for lines that held any. */
  readonly lineCounts: readonly number[];
  /** Positions in `values` of the tokens that weren't finite numbers, ascending. */
  readonly nonNumericAt: readonly number[];
  /** What each of those tokens was, matching `nonNumericAt`. */
  readonly nonNumericKind: readonly NonNumericToken[];
}

const POW10 = Array.from({ length: 16 }, (_, i) => 10 ** i);
const MAX_FAST_DIGITS = 15;

const LF = 10;
const CR = 13;
const SPACE = 32;
const HASH = 35;
const PLUS = 43;
const MINUS = 45;
const POINT = 46;
const ZERO = 48;
const NINE = 57;
const TILDE = 126;

/** The spelled-out missing markers the spec counts as missing, not unreadable. */
export function isMissingMarker(token: string): boolean {
  return token === "-" || /^[+-]?nan$/i.test(token) || /^#n\/a$/i.test(token);
}

/**
 * Scans the data lines from `start` to the end of the text, or to a line that
 * starts a new `~` section. Lines whose first token starts with `#` are
 * comments and skipped.
 */
export function scanData(text: string, start: number): ScannedData {
  const n = text.length;
  let values = new Float64Array(Math.max(1024, (n - start) >> 3));
  let count = 0;
  const lineCounts: number[] = [];
  const nonNumericAt: number[] = [];
  const nonNumericKind: NonNumericToken[] = [];

  let i = start;
  let onLine = 0; // tokens on the current line
  let lineStart = true; // no token yet on this line

  while (i < n) {
    let c = text.charCodeAt(i);
    if (c === LF || c === CR) {
      if (onLine > 0) lineCounts.push(onLine);
      onLine = 0;
      lineStart = true;
      i++;
      continue;
    }
    if (c <= SPACE) {
      i++;
      continue;
    }
    if (lineStart && (c === HASH || c === TILDE)) {
      if (c === TILDE) break;
      while (i < n && (c = text.charCodeAt(i)) !== LF && c !== CR) i++;
      continue;
    }
    lineStart = false;

    const tokenStart = i;
    let j = i;
    let negative = false;
    if (c === MINUS || c === PLUS) {
      negative = c === MINUS;
      c = text.charCodeAt(++j);
    }
    let mantissa = 0;
    let digits = 0;
    let fraction = 0;
    while (c >= ZERO && c <= NINE) {
      mantissa = mantissa * 10 + (c - ZERO);
      digits++;
      c = text.charCodeAt(++j);
    }
    if (c === POINT) {
      c = text.charCodeAt(++j);
      while (c >= ZERO && c <= NINE) {
        mantissa = mantissa * 10 + (c - ZERO);
        digits++;
        fraction++;
        c = text.charCodeAt(++j);
      }
    }

    let value: number;
    // `!(c > SPACE)` is also true past the end, where charCodeAt gives NaN.
    if (digits > 0 && digits <= MAX_FAST_DIGITS && !(c > SPACE)) {
      value = fraction === 0 ? mantissa : mantissa / POW10[fraction];
      if (negative) value = -value;
      i = j;
    } else {
      while (j < n && text.charCodeAt(j) > SPACE) j++;
      const token = text.slice(tokenStart, j);
      value = Number(token);
      if (!Number.isFinite(value)) {
        nonNumericAt.push(count);
        nonNumericKind.push(isMissingMarker(token) ? TOKEN_MISSING : TOKEN_UNREADABLE);
        value = NaN;
      }
      i = j;
    }

    if (count === values.length) {
      const grown = new Float64Array(values.length * 2);
      grown.set(values);
      values = grown;
    }
    values[count++] = value;
    onLine++;
  }
  if (onLine > 0) lineCounts.push(onLine);

  return { values: values.subarray(0, count), lineCounts, nonNumericAt, nonNumericKind };
}
