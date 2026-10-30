/**
 * Categorical colours for zones and for discrete codes with no known style
 * (#37): ColorBrewer Set3, opaque and the same in both themes, picked by an
 * FNV-1a hash of the name, so a name keeps its colour from well to well.
 */

/** ColorBrewer Set3, 12 pastels. */
export const SET3: readonly string[] = [
  "#8DD3C7",
  "#FFFFB3",
  "#BEBADA",
  "#FB8072",
  "#80B1D3",
  "#FDB462",
  "#B3DE69",
  "#FCCDE5",
  "#D9D9D9",
  "#BC80BD",
  "#CCEBC5",
  "#FFED6F",
];

/** 32-bit FNV-1a over UTF-16 code units. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

/** The Set3 index a name hashes to. */
export function hashedIndex(name: string): number {
  return fnv1a(name) % SET3.length;
}

const same = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

/**
 * One colour per zone, in order.
 *
 * - A name in `overrides` takes that colour.
 * - Otherwise it takes its hashed Set3 colour, except that a name seen for
 *   the first time whose colour matches the differently named zone directly
 *   above moves on one colour.
 * - A name keeps the first colour it gets in the well, so a name repeated
 *   further down (Heather Fm. around its sandstones) stays one colour.
 */
export function zoneColours(
  zones: readonly { readonly name: string }[],
  overrides: Readonly<Record<string, string>> = {},
): string[] {
  const byName = new Map<string, string>();
  let above: { name: string; colour: string } | null = null;
  return zones.map(({ name }) => {
    let colour = byName.get(name);
    if (colour === undefined) {
      if (Object.hasOwn(overrides, name)) {
        colour = overrides[name];
      } else {
        const hashed = hashedIndex(name);
        colour = SET3[hashed];
        if (above && above.name !== name && same(above.colour, colour)) colour = SET3[(hashed + 1) % SET3.length];
      }
      byName.set(name, colour);
    }
    above = { name, colour };
    return colour;
  });
}

/**
 * A Set3 colour for each code with no known style. Taken in sorted order, a
 * code takes its hashed colour, or the next one no earlier code has taken,
 * so no two codes share a colour up to 12 codes. Past 12, codes repeat their
 * hashed colour.
 */
export function unknownCodeColours(codes: Iterable<number>): Map<number, string> {
  const sorted = [...new Set(codes)].sort((a, b) => a - b);
  const taken = new Set<number>();
  const out = new Map<number, string>();
  for (const code of sorted) {
    let index = hashedIndex(String(code));
    if (taken.size < SET3.length) {
      while (taken.has(index)) index = (index + 1) % SET3.length;
    }
    taken.add(index);
    out.set(code, SET3[index]);
  }
  return out;
}
