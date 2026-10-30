/**
 * A well id is a FORCE 2020 file stem (`34-10-16_R`). It goes into a Data
 * host URL, so anything else is refused before a URL is built (ADR-0005).
 */
const WELL_ID = /^[A-Za-z0-9_-]+$/;

export function isWellId(id: string): boolean {
  return WELL_ID.test(id);
}
