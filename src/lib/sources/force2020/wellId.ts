/**
 * A well id is a FORCE 2020 file stem (`34-10-16_R`). It goes into a Data
 * host URL, so anything else is refused before a URL is built (ADR-0005).
 */
const WELL_ID = /^[A-Za-z0-9_-]+$/;

export function isWellId(id: string): boolean {
  return WELL_ID.test(id);
}

/**
 * The name a reader knows a well by, from its file stem: the first `-`
 * becomes `/` and each `_` a space, so `34-10-16_R` is `34/10-16 R`.
 */
export function wellName(id: string): string {
  return id.replace("-", "/").replaceAll("_", " ");
}

/** A FORCE 2020 well as the well list names it. */
export interface ForceWell {
  /** Its file stem. */
  readonly id: string;
  readonly name: string;
}

/**
 * The wells in the dataset's `_files.json`: each `.parquet` file whose stem
 * is a well id, in the manifest's order. Anything else is skipped.
 */
export function wellsIn(files: readonly unknown[]): ForceWell[] {
  const wells: ForceWell[] = [];
  for (const file of files) {
    if (typeof file !== "string" || !file.endsWith(".parquet")) continue;
    const id = file.slice(0, -".parquet".length);
    if (isWellId(id)) wells.push({ id, name: wellName(id) });
  }
  return wells;
}
