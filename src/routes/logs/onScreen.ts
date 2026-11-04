/**
 * What the well logs have on screen, as the header's dataset line and the
 * tab title name it. A petrodb well is from FORCE 2020, so the line shows
 * that dataset and its links; a LAS file the user opened is theirs, so the
 * line shows the file's name only. Kept apart from the page so it runs
 * under node --test.
 */

import type { Dataset, OnScreen, Visualization } from "../../lib/config/catalog.js";
import type { LinkSource } from "./link.ts";

/** The dataset the petrodb wells come from, out of the well logs' catalog entry. */
export function wellDataset(logs: Visualization): Dataset {
  const found = logs.datasets.find((d) => d.id === "force_2020");
  if (!found) throw new Error(`${logs.name} don't show FORCE 2020, where their wells come from`);
  return found;
}

/** The dataset line for a well log from `source`; every source but a LAS file is a petrodb well. */
export function onScreenOf(source: LinkSource, dataset: Dataset): OnScreen {
  return source.kind === "las" ? { file: source.fileName } : { dataset };
}

/**
 * `<well> · <dataset or file> · Well logs`, like the production dashboard's
 * `Volve · Production dashboard`. Before a well is on screen it names what
 * the dataset line does; a file with no WELL item is named once.
 * @param well - The well on screen, as the picker names it; null before one is
 * @param line - What the dataset line shows; none for a file that isn't open
 */
export function tabTitle(well: string | null, line: OnScreen | undefined, logs: Visualization): string {
  if (!line) return `${logs.name} · petroviz`;
  const from = "file" in line ? line.file : line.dataset.name;
  const named = well === null || well === from ? [from] : [well, from];
  return [...named, logs.name].join(" · ");
}
