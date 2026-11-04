/**
 * The catalog: petroviz's visualizations and the datasets each one shows.
 *
 * The welcome page and the header both read it, so they can't disagree.
 * Each dataset links to its docs on the Schema host, its folder on the Data
 * host and its upstream licence; the Docs and Data links are built from the
 * same resolved hosts as the data itself, so PUBLIC_DATA_BASE_URL and
 * PUBLIC_SCHEMA_BASE_URL overrides move them too.
 *
 * Plain JavaScript with no SvelteKit imports, so plain Node tests can load it.
 */

import { resolveHosts } from "./sources.js";

/**
 * @typedef {object} Dataset
 * @property {string} id - Its folder name on both hosts
 * @property {string} name - Display name
 * @property {string} docs - Its page on the Schema host
 * @property {string} data - Its folder on the Data host
 * @property {string} license - Its upstream terms
 */

/**
 * @typedef {object} Visualization
 * @property {string} id
 * @property {string} name - Display name
 * @property {string} route - Path within the app
 * @property {string} summary - One sentence on what it shows
 * @property {Dataset[]} datasets - The datasets it shows
 * @property {boolean} takesFile - Whether it also shows a file the user opens
 * @property {"time" | "depth"} runsAlong - The axis its data is plotted against
 */

/**
 * @typedef {object} Catalog
 * @property {Dataset[]} datasets
 * @property {Visualization[]} visualizations
 */

const DATASETS = [
  {
    id: "volve",
    name: "Volve",
    license:
      "https://cdn.equinor.com/files/h61q9gi9/global/de6532f6134b9a953f6c41bac47a0c055a3712d3.pdf",
  },
  {
    id: "force_2020",
    name: "FORCE 2020",
    license: "https://creativecommons.org/licenses/by/4.0/",
  },
];

const VISUALIZATIONS = [
  {
    id: "production",
    name: "Production dashboard",
    route: "/production",
    summary:
      "Oil, water and gas produced by each well, day by day, with totals for the dates you pick.",
    datasets: ["volve"],
    takesFile: false,
    runsAlong: /** @type {const} */ ("time"),
  },
  {
    id: "logs",
    name: "Well logs",
    route: "/logs",
    summary:
      "The curves recorded down a well, side by side in tracks, against measured or vertical depth.",
    datasets: ["force_2020"],
    takesFile: true,
    runsAlong: /** @type {const} */ ("depth"),
  },
];

/**
 * The browsable folder for a dataset. A Hugging Face `resolve/<rev>` base
 * serves files, not listings, so it becomes the matching `tree/<rev>` page.
 * @param {string} dataHost - Without a trailing slash
 * @param {string} id
 * @returns {string}
 */
function dataFolder(dataHost, id) {
  const hf = dataHost.match(/^(https:\/\/huggingface\.co\/.+)\/resolve\/([^/]+)$/);
  if (hf) return `${hf[1]}/tree/${hf[2]}/${id}`;
  return `${dataHost}/${id}/`;
}

/**
 * Resolve the catalog against the hosts, plus any overrides.
 * @param {import("./sources.js").SourceSettings} [overrides]
 * @returns {Catalog}
 */
export function resolveCatalog(overrides = {}) {
  const { dataHost, schemaHost } = resolveHosts(overrides);

  /** @type {Dataset[]} */
  const datasets = DATASETS.map((d) => ({
    ...d,
    docs: `${schemaHost}/${d.id}/`,
    data: dataFolder(dataHost, d.id),
  }));

  /** @param {string} id */
  const byId = (id) => {
    const found = datasets.find((d) => d.id === id);
    if (!found) throw new Error(`Unknown dataset: ${id}`);
    return found;
  };

  return {
    datasets,
    visualizations: VISUALIZATIONS.map((v) => ({
      ...v,
      datasets: v.datasets.map(byId),
    })),
  };
}
