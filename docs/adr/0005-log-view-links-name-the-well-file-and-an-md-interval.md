# Log view links name the well's file and an MD interval

The log view has its own prerendered route, `/logs`, rather than a tab of `/`, so opening a well never waits for the production dashboard's DuckDB start-up. Its URL carries the well and the view, as in `/logs?well=34-10-16_R&ref=tvdss&md=2100.0-2350.0`. A well opened from disk is named by its file instead, as in `/logs?las=well_a.las&md=1200.0-1450.0`. This was decided in [#36](https://github.com/oskrgab/petroviz/issues/36).

## The format

- **`well`** is the FORCE 2020 file name from `force_2020/wells/_files.json`, without `.parquet`. The display name is derived from it: the first `-` becomes `/` and `_` becomes a space, so `34-10-16_R` is `34/10-16 R`. A value must match `^[A-Za-z0-9_-]+$` before it is used to build a Data host URL. Anything else is an unknown well.
- **`las`** is the file name of a LAS file opened from disk, and replaces `well`. The page keeps the most recent LAS well log in memory, so Back or Forward to its entry restores it. A reload or a shared link can't, so the page asks for the file to be dropped again and applies the interval once it is.
- **`ref`** is `tvdss`, or absent for MD.
- **`md`** is `<top>-<base>` in MD, in the well's own depth unit, rounded to 0.1. It is MD even when `ref=tvdss`.
- **No `well` and no `las`** opens 35/11-11 and writes `well=35-11-11` into the URL, replacing the entry.
- **History:** changing the well or opening a file adds an entry. Changes to the interval or reference replace the current entry, about 250 ms after the last change.
- **Bad links:** an `md` that won't parse, or whose top isn't above its base, is ignored and the whole well is shown. An interval outside the well is passed through, and the log view clamps it (ADR-0004). An unknown well (missing from the list, or a 404 from the Data host) shows a message and opens the picker; it never falls back to the default well. The URL is left alone until the user acts.
- **Another petrodb dataset with logs** adds a `dataset` parameter, defaulting to FORCE 2020.

## Why

- **The file name, not the display name.** It needs no encoding (`34/10-16 R` would be `34%2F10-16+R`), it is exactly what the FORCE 2020 log adapter fetches, and no lookup table is needed to get from one to the other. The cost: a link breaks if petrodb renames its files.
- **`md` is always MD.** The interval is stored in MD (ADR-0004), so a link means the same depths whichever reference is shown, and switching the reference never rewrites the interval. The parameter's name says which axis it is, so a link from a TVDSS view isn't misread.
- **`las=` instead of dropping the well.** The link stays honest about where the well came from, and dropping the file again returns to the same place.
- **Wells add history, intervals replace it.** Back steps through the wells looked at, not through every scroll.
- **An unknown well is an error, not the default.** A shared link that quietly shows another well misleads whoever opens it.

## Considered options

- **The display name in `well`.** It reads better, but every link needs encoding and the adapter needs the name mapped back to a file.
- **`top` and `bottom` in the active depth reference.** The same link would then mean different depths depending on `ref`.
- **A path segment, `/logs/<well>`.** A prerendered static site would need every well listed at build time, from a manifest on the Data host, or a fallback page. Query parameters work with the one `/logs` shell.
- **For a disk file, clearing the URL**, which loses the interval, or **keeping the file in browser storage**, which would need room for files up to 256 MB.
