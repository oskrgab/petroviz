# The well log module is layered and owns no loading or persistence

The well log code lives in `src/lib/welllog/`, split into three layers: `core`, `view` and `las`. The FORCE 2020 log adapter lives outside it, in `src/lib/sources/force2020/`. A test enforces which layer may import what. The log view is a controlled Svelte component, `<LogView log bind:template bind:interval bind:depthRef />`. The host page loads the well log, syncs the URL and keeps the current template in the browser. The log view keeps only the depth cursor, hover and which panels are open. This was decided in [#31](https://github.com/oskrgab/petroviz/issues/31).

## Layers

| Layer | Holds | May import |
|---|---|---|
| `welllog/core` | the `WellLog` type, its query functions, `checkWellLog`, the mnemonic → curve family table | nothing |
| `welllog/view` | templates (types, file validation, operations, the default template, `curveFamilyDefaults`), `resolveTemplate`, track kinds, geometry, canvas drawing, components | `core`, `svelte` |
| `welllog/las` | the LAS 2.0 log adapter | `core` |
| `sources/force2020` | the FORCE 2020 log adapter | `core`, hyparquet, fzstd |

Nothing under `welllog/` imports `$app/*`, `$lib/` outside `welllog/`, DuckDB, or any petrodb source. A `node --test` file checks every import under `welllog/` against this table. It runs in `pnpm test`, which gates deploy.

## Why

- **`welllog/` is the package-to-be.** Everything in it is source-agnostic. LAS is a file format, not a dataset, so its adapter belongs inside. FORCE 2020 is a petrodb dataset read from petroviz's Data host, so its adapter never leaves petroviz.
- **Adapters need the contract, not the display.** Keeping `core` separate means an adapter and its tests never pull in Svelte or canvas code.
- **A rule nobody checks erodes.** The repo has no linter. A scanner with no dependencies, as simple as `check-sources.test.js`, stops deploy when the rule is broken.
- **Loading depends on the source; the URL and storage belong to the app.** A log view that fetched or parsed would know its sources. One that wrote the URL or `localStorage` would need SvelteKit's `$app/*`. Owning neither is what lets the module be extracted. It also makes "switching wells keeps the layout" structural: `template` simply outlives `log`.

## Consequences

- The log view accepts a `WellLog` and nothing else. The host renders the loading, error and empty states.
- The log view writes a bound prop only on a user action. The interval clamped to the well, and the depth reference the well actually has, are derived values. So a TVDSS preference survives a well without TVDSS.
- Template file parsing and validation are pure functions in `view`. The host wires up the file picker and `localStorage` and uses the same parser for both.
- Colours reach the module as `--welllog-*` CSS custom properties, never by importing petroviz's theme store.
- Modules under `welllog/` import each other by relative path with the `.ts` extension, not through `$lib`. That way `node --test` on Node 24 runs their tests with no build step.

## Considered options

- **One flat `welllog/` module, with adapters elsewhere.** The LAS adapter would then import the view just to reach the contract.
- **The LAS adapter outside `welllog/`, next to FORCE 2020.** It is generic, so it would have to move back in when the package is extracted.
- **ESLint with a boundaries plugin, or dependency-cruiser.** Same rule, but with a dependency and a config to maintain.
- **A log view that owns loading, the URL and storage**, as the throwaway prototype did. That is simpler wiring for one page, but it ties the module to SvelteKit and to its sources.
