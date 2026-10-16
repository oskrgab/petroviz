# What must a well log carry to represent both LAS 2.0 and FORCE 2020?

Research for [#25](https://github.com/oskrgab/petroviz/issues/25), under the map [#22](https://github.com/oskrgab/petroviz/issues/22).
It feeds the well log contract grilling ([#27](https://github.com/oskrgab/petroviz/issues/27)).
The terms used here (well log, log adapter, curve, curve family, zone, depth reference) are the ones in `CONTEXT.md`.
Written 2026-10-16. Every claim cites a source listed at the end as **[S#]**. Findings marked **(data)** come from running DuckDB over petrodb's FORCE 2020 parquet files; the queries are summarised in [S12].

## Question

What does a well log need to carry so that it is independent of its source, judged against the two sources it has to serve first?

- **LAS 2.0**, a file dropped into the browser and read by a log adapter.
- **FORCE 2020** as petrodb publishes it: one parquet file per well.

## Short answer

A well log that can hold both sources needs these parts. Each part is either always present or explicitly optional.

1. **Well identity plus an open bag of header items.** A name and id are always present. Every other header line is kept as `{mnemonic, unit, value, description}`, because LAS 2.0 lets you add any number of extra lines [S1 §5.4, §5.6] and FORCE has almost no well metadata at all.
2. **A primary index: MD, stored as an explicit value per sample, with its unit.** It should not be stored as STRT/STEP. LAS allows STEP = 0 for irregular data [S1 §5.4]. FORCE is a regular 0.152 m grid but has 153 holes across 50 wells **(data)**.
3. **Extra depth references, optional and stored per sample.** For FORCE this is TVDSS = −`Z_LOC`, which is missing at the top or bottom of 17 wells **(data)**. LAS 2.0 has nothing for this beyond an ordinary curve.
4. **Datum elevations, optional, with units** (EKB, EDF, EGL and similar). LAS can carry them [S1 §5.6]. FORCE never does, and they cannot be derived reliably from it **(data)**. TVD below the rig floor depends on them.
5. **Curves**, each with:
   - a unique key, kept separate from the original mnemonic, because LAS mnemonics can repeat [S3, S9]
   - the unit as the raw source string
   - a description
   - a **kind**: continuous or discrete
   - values in a float array where a missing sample is `NaN`
6. **For discrete curves, a code table** mapping each code to a label. FORCE's lithology needs one. LAS 2.0 has no way to express one: its data section allows only numbers [S1 §3.0], and a code table would have to come from outside the file.
7. **Zones**: a list of named depth intervals `{name, top, base}` in MD, each tagged with a level (group or formation). FORCE carries zones only as text columns on every sample, and the zones have to be rebuilt from runs of those values. LAS 2.0 cannot express zones at all [S1 §3.0, §5.8]. Formation tops only arrive in LAS 3.0 [S2 p.21–22], which is out of scope.
8. **Load warnings / provenance**: values swapped for NULL, sentinels found, spec violations the parser tolerated. This lets the log view report data quality without having to know which source the data came from.

## Concept × source

| Concept | LAS 2.0 (CWLS spec) | FORCE 2020 (petrodb parquet) |
|---|---|---|
| **Well identity** | `WELL`, `UWI` (or `API`), `FLD`, `LOC`, `PROV`/`CNTY`/`STAT`/`CTRY`, `COMP`, `SRVC`, `DATE` in `~W`. Further lines are allowed without limit [S1 §5.4]. | Only `WELL` (NPD id such as `15/9-13`). It is repeated on every row and doubles as the file name [S10]. 26 ids contain spaces, e.g. `34/11-2 S` **(data)**. There is no field, operator or date. |
| **Primary index (MD)** | The first `~C` curve must be `DEPT`, `DEPTH`, `TIME` or `INDEX` [S1 §5.5]. A depth index must be in `M`, `F` or `FT`, and STRT/STOP/STEP must share that unit [S1 §5.4]. The index can increase or decrease [S1 §5.4]. A time or index axis is also legal [S1 §5.9, Ex. 4–5]. | `DEPTH_MD` in m, strictly increasing, primary key together with `WELL` [S10]. 0 duplicate `(WELL, DEPTH_MD)` pairs **(data)**. |
| **Sampling** | `STEP` is the exact constant increment. If the increment is not constant, STEP must be `0` [S1 §5.4]. STRT/STEP and STOP/STEP must be whole numbers [S1 §1.0, §5.4]. A file holds "only one continuous interval" [S1 §3.0]. | 1,307,036 of 1,307,189 steps are 0.152 m. The remaining 153 are gaps in 50 wells, each an exact multiple of 0.152, the largest 269.3 m (35/4-1) **(data)**. So this is a regular grid with missing rows, not irregular sampling. |
| **Second depth reference (TVDSS)** | No standard slot. A TVD/TVDSS column would be an ordinary curve with a free mnemonic. lasio even ships a fixture whose `~W` uses `TVD` in place of `STRT`/`STOP` [S4 `sample_TVD.las`]. | `Z_LOC`: TVDSS, negative downward [S10]. Upstream documents it only as "Z_LOC: DEPTH" [S8 cell 5]. Present in all 108 wells. In 17 wells it is NULL for 3,363 samples at the top and 7,471 at the bottom, never in between. Where present it is strictly decreasing with MD (0 flat or upward steps), and \|Z_LOC\| ≤ MD everywhere **(data)**. |
| **Datum elevations (EKB/EDF/EGL)** | The spec's `~P` example carries `EKB .M 566.9700 : Elevation Kelly Bushing` and `EGL .M` [S1 §5.6]. `EDF` does not appear in the 2017 text. LAS 3.0 adds `PDAT`, `APD`, `DREF` ("Depth Reference (KB, DF, CB)") and `EREF` [S2 p.17]. All are optional. | Absent. The upstream LAS exports also leave `~P` empty [S9]. MD + Z_LOC at each well's shallowest sample ranges from 18.0 to 1,113.8 m (median 25.1 m) **(data)**. That only equals the datum elevation in a well that is vertical down to its first sample, so it **cannot be used as a datum**. |
| **Continuous curves** | Each `~C` line holds MNEM, UNIT, an optional API code and a description [S1 §5.2, §5.5]. All `~A` values must be floating-point or integer [S1 §3.0]. | 20 DOUBLE log columns, with units from `schema.json` [S10, S11]. Each well has 9–18 of them (median 13). GR is the only one present in every sample. SGR is missing from 95 wells, DCAL from 84, MUDWEIGHT 79, RMIC 78, ROPA 77, DTS 70, RXO 67 **(data)**. |
| **Discrete curves / code labels** | Can only be a numeric column, with nothing to mark it as discrete and no place for labels [S1 §3.0]. | `FORCE_2020_LITHOFACIES_LITHOLOGY` is BIGINT with 12 codes, populated in 100% of samples **(data)**. The code→label table lives outside the data: in petrodb's `schema.md` [S10] and upstream's starter notebook `lithology_keys` [S8 cell 12]. Upstream also ships `FORCE_2020_LITHOFACIES_CONFIDENCE` (1/2/3) [S8 cell 5, S9], which petrodb does not publish [S10]. |
| **Zones** | None. LAS 2.0 has no tops section [S1 §3.0]. LAS 3.0 adds `~Tops_Definition` with `TOPN`/`TOPT`/`TOPB` (name, top, base) [S2 p.21–22]. | Per-sample text columns, `GROUP` (14 names) and `FORMATION` (69 names) [S10]. See "Zones in FORCE 2020" below. |
| **Units** | A free string right after the first dot, with no spaces [S1 §5.2]. The spec's own examples write density as `K/M3` in one place and `K/M` in another [S1 Ex. 1, Ex. 3]. | One unit per column, written in Unicode in petrodb (`ohm·m`, `g/cm³`, `µs/ft`) [S11]. The upstream LAS exports for the same curves use `ohm.m`, `g/cm3`, `us/ft`, and `_` where there is no unit [S9]. |
| **NULL / sentinels** | One `NULL` value per file in `~W`. "Commonly used null values are -9999, -999.25 and -9999.25" [S1 §5.4]. | SQL NULL, plus leftover sentinels the source kept [S10]. See "Sentinels in FORCE 2020" below. |
| **Well location** | `LOC` is free text [S1 §5.4]. The spec defines no coordinate fields. | `X_LOC`/`Y_LOC` per sample in UTM 31N ED50 [S10]. They change with depth: 55 wells drift more than 50 m, so these are positions along the wellbore, not a single wellhead point **(data)**. |
| **Other** | `~O` holds free text, e.g. "tools became stuck … data … invalid" [S1 §5.7, Ex. 1]. | `dataset` (train/test) applies to whole wells: 98 train, 10 test, none mixed **(data)**. |

## FORCE 2020 in detail (data)

### Zones in FORCE 2020

Zones come from collapsing consecutive samples that share a value into a run `{name, top MD, base MD}`.

- **GROUP**: 634 runs, filled in 99.9% of samples. NULL appears only at the top of 4 wells.
- **FORMATION**: 1,483 runs, filled in 89.0% of samples. NULL appears in 43 wells, always at the top of the well.
- Wherever `FORMATION` has a value, `GROUP` has one too (0 exceptions).

Four properties matter for the contract:

1. **One name can make several zones in the same well.** 44 (well, formation) pairs and 2 (well, group) pairs recur. For example, 33/5-2 alternates `VIKING GP.` and `BAAT GP.` three times. A zone therefore needs its own id; its name cannot serve as one.
2. **Formations are not strictly nested inside groups.** 119,882 of 1,163,229 formation-labelled samples (10.3%) fall outside the most common group for that formation. `Skagerrak Fm.` appears under 9 different groups. The two levels have to be stored as independent zone sets, not as a tree.
3. **Ranks are mixed.** 11 `FORMATION` values are not formations: they are members (`Ty Mb.`), `Intra … Sst.` units, or `BASEMENT`. So "level" should be a label taken from the column the zone came from, not a geological rank.
4. **Zones have no explicit boundaries.** Top and base can only be known to the nearest sample, and a run can be a single sample long. The base of one zone and the top of the next differ by one 0.152 m step, unless a depth gap falls between them.

### Sentinels in FORCE 2020

- **Sentinels left in the data.** Columns are DOUBLE, but these values are float32 artefacts:
  - `RXO`: −999.0 (18,172 samples, 1 well), −999.9000244 (16,309 samples, 2 wells) and one −995.8640747.
  - `SP`: −999.0 (402 samples, 1 well).
  - `ROPA`: −999.2501221 (24 samples).
- **Exact comparison fails.** `RXO = -999.9` matches 0 rows and `ROPA = -999.25` matches 0 rows. A tolerance of 1e‑3 catches all of them. Sentinel matching has to use a tolerance.
- **Range rules alone would misfire.** `Z_LOC` legitimately falls between −1000 and −999 for 336 samples, so a global "≤ −999 means NULL" rule would erase real depths. Sentinel rules have to apply per curve, and depth references have to be exempt. lasio applies the same exemption to the index curve [S3 `las.py` L477].
- **Implausible values that are not sentinels:**
  - `DRHO` −7429.3 (1 sample)
  - `SGR` minimum −777.99
  - `DCAL` maximum 10,011
  - `RMIC` capped at exactly 10,000
  - `ROP` maximum 47,015
  - `MUDWEIGHT` maximum 426.9

  These are data-quality issues for the view (#22 "Data quality in the view"), not NULLs.

### Lithology runs

The lithology curve has 37,459 runs across the corpus. The median run is 9 samples and 712 runs are a single sample **(data)**. A lithology track therefore draws mostly short intervals. A discrete curve stored per sample, with intervals derived for drawing, fits this better than storing it as zones.

### What upstream's own LAS exports show

The FORCE repository also publishes one LAS 2.0 file per well [S9]. Their headers make a ready real-world test set for the LAS adapter:

- `NULL . -999.250000` and `STEP .m 0.15200000`. STRT is not a multiple of STEP (`25.000000000`, `133.61000061`, `388.97360000`), which breaks the whole-number rule in [S1 §5.4].
- An empty `~P`, so there is no datum elevation.
- No `GROUP`/`FORMATION` columns, because LAS 2.0 cannot carry text. The zones only exist in the competition's CSV, which is petrodb's source [S8, S10].
- Two MD columns: the index `DEPT` and a float32 copy `DEPTH_MD` (e.g. `473.704` vs `473.70401001`). Mnemonics are lower-case (`x_loc`, `z_loc`), and those curves have unit `_`.
- `DATE. 2020-08-09 20:01:10 : Log Export Date {yyyy-MM-dd HH:mm:ss}`. Colons appear in both the value and the description, so neither the first-colon nor the last-colon rule splits it correctly (see the parser table).
- The petrodb well is a subset of the LAS file. 15/9-13 starts at MD 25.0 m in LAS but at 494.5 m in petrodb **(data)**.

## LAS 2.0 edge cases a parser must survive

| Edge case | What the spec says | What real files and parsers show |
|---|---|---|
| **Wrapped mode** (`WRAP. YES`) | The index sits alone on its line. Data lines are at most 80 characters [S1 §5.3, §5.8]. | The only robust approach is to tokenise the whole `~A` section and cut it into rows of N curves. All three parsers below do this [S3 `reader.py` L472–485, S5 `index.ts` L176–190, S6 `index.js` L333–345]. One missing or extra token shifts every later row with no error. lasio refuses to read the file if the token count is not a multiple of N [S3 L478]. |
| **NULL variants** | A single `NULL` value per file [S1 §5.4]. | The spec's own wrapped example has `999.2500` and `-999.2502` next to `-999.2500` [S1 Ex. 3]. lasio's `null_policy` presets also null out `±999.25`, `±9999.25`, `(null)`, `-`, `#N/A`, `1.#INF`, `1.#IND`, and, in "aggressive" mode, `-0.0`, `32767`, `±999` [S3 `defaults.py` L145–217]. Files with no `NULL` line exist in the wild (fixture `missing_null.las`) [S4]. |
| **Duplicate mnemonics** | Not addressed. Mnemonics are "not restricted" [S1 §5.5]. | lasio keeps `original_mnemonic` and renames the copies `SFLU:1`, `SFLU:2` [S3 `las_items.py` L33–56, L509–532]. las-js stores curve parameters in an object keyed by mnemonic, so the last copy wins [S5 L366]. wellio does the same [S6 L270]; its column list then has fewer names than the data has columns, so the extras become `UNKNOWN<n>` and the columns after the duplicate fall out of line [S6 L355–360]. |
| **Index direction / monotonicity** | Increasing or decreasing; STEP carries the sign [S1 §5.4, Ex. 1–3]. | None of the parsers checks for monotonic depth or sorts it (no such check in lasio's source [S3]). STOP can disagree with the last row (fixture `sample_2.0_wrong_stop_value.las` [S4]). The adapter should sort ascending, reject or flag repeated depths, and compute the extent from the data rather than from STRT/STOP. |
| **STRT/STEP inconsistencies** | STRT/STEP must be whole numbers. STEP = 0 when sampling is irregular [S1 §5.4]. | Upstream FORCE files break the whole-number rule [S9]. welly works STEP out from the data and returns 0 when the spacing is uneven [S7 `curve.py` L503–517]. Do not trust STEP. |
| **Unit strings** | Directly after the first dot, no spaces, no colons [S1 §5.2]. | lasio accepts one special case, `1000 psi`, which breaks the spec [S3 `reader.py` L995–1000]. It also accepts bracketed units (`[M]`) [S4 `sample_bracketed_units.las`]. lasio maps depth unit aliases such as `F`, `FEET`, `METRES` and the Cyrillic `м` [S3 `defaults.py` L125–129]. A unit containing a dot (`ohm.m`, used by FORCE's LAS files [S9]) makes las-js report `none`, and wellio's fixed-offset slicing returns an empty unit for every line we tested, including `gAPI` (reproduced in [S12]). |
| **Delimiter rule (first dot, first space after it, last colon)** | [S1 §1.0, §5.2]. | las-js and wellio split on the **first** colon, so a value containing a colon (such as a time) breaks the line [S5 L361, S6 L520]. lasio follows the last-colon rule and adds a time-aware pattern for `~P` [S3 `reader.py` L1007]. On FORCE's `DATE` line, though, it still returns the description as `ss}` [S12], because the description itself contains colons. |
| **Encodings** | ASCII 13, 10 and 32–126 only. Other characters should be turned into spaces [S1 §3.0]. | lasio checks for a BOM, then uses chardet, then tries ascii, windows‑1252 and latin‑1 [S3 `reader.py` L174–260]. Its fixtures include cp1252, ISO‑8859‑1, UTF‑8 with BOM and UTF‑16 LE/BE with and without BOM [S4]. Both JS parsers decode only as UTF‑8 (`readAsText` default / `'utf8'`) [S5 L377, L393]. |
| **Non-numeric data** | Not allowed in `~A` [S1 §3.0]. | lasio detects types from the first row and keeps text columns as `str` [S3 `reader.py` L521–542]. Its fixtures include date/time text columns (`data_characters.las`) and numbers that run together in fixed-width columns (`7.020101130.188`), which it splits with regex "read policies" [S3 `defaults.py` L131–141, S4 `null_policy_runon.las`]. las-js converts each value to a number only if it looks numeric and otherwise leaves it as a string [S5 L43–45]. wellio leaves every value as a string and puts `'0'` in a missing cell [S6 L371]. Writing 0 into a missing cell turns missing data into a fake measurement. |
| **Version drift** | `VERS. 2.0` | Users will drop 1.2 files too. In LAS 1.2 `~W` the value and description swap places (`COMP. COMPANY: ANY OIL…`), which lasio handles with a version-specific `descr:value` order [S3 `defaults.py` L46–98, S4 `sample_TVD.las`]. |
| **Sections** | `~V` comes first and `~A` last. Each standard section appears once. Custom sections are allowed between them [S1 §3.0]. | lasio and wellio tolerate non-standard sections [S4 `non-standard-header-sections.las`, S6 `readSections`]. Some files contain only a header (fixture `header_only.las` [S4]). |

## How open-source parsers model a log

| | lasio (Python) [S3] | welly (Python, built on lasio) [S7] | las-js (JS/TS, npm) [S5] | wellio.js (JS, npm) [S6] |
|---|---|---|---|---|
| Header | `SectionItems` of `HeaderItem{mnemonic, unit, value, descr}` per section (`version`, `well`, `curves`, `params`, `other`) | `Well.header` + `Location`. EKB/EGL/KB/GL/TD are read from `~P` [S7 `fields.py` L38–45] | One object per section, `{unit, value, description}` keyed by mnemonic | JSON blocks keyed by mnemonic |
| Curve | `CurveItem` = header item + `data` ndarray. Index = first curve | `Curve`: a DataFrame with its **own index (basis)**, `units`, `null`, `run`, `service_company` | Column array (`column(name)`) | `CURVES[mnemonic]` = array of strings |
| Missing values | Replaced by NaN (exact float match on `NULL`), never in the index [S3 `las.py` L477–484] | NaN | Kept as-is. `dataStripped()` **drops the whole row** if any value equals NULL [S5 L212] | Kept as strings |
| Discrete / categorical | Not modelled | `assign_categorical(mnemonics)`, which the user has to call [S7 `well.py` L1234–1246] | Not modelled | Not modelled |
| Families | Not modelled | `alias` dict: one alias name → a list of mnemonics [S7 `well.py`] | — | — |
| Zones | — | Interval data (striplogs) stored alongside the curves in `Well.data` [S7 `well.py`] | — | — |
| Duplicates | `:1`/`:2` suffixes, original kept | via lasio | Last wins | Last wins and columns shift |
| Encodings | BOM, chardet, fallbacks | via lasio | UTF‑8 only | UTF‑8 only |

None of the JS parsers is a safe dependency for the LAS adapter as it stands: missing values become `'0'` or whole rows are dropped, units are lost, and duplicates misalign columns. lasio is the reference for the edge cases to handle, and its `tests/examples` folder is a ready-made fixture set [S4]. This is an observation for the dependency decision, not a decision.

## What this means for the contract (inputs to the grilling, not decisions)

- **Store depths as arrays, never as STRT/STEP.** FORCE's holes and LAS's STEP=0 both rule out a computed grid. All depth references share the sample index of the primary MD array, which is ascending once the adapter has normalised it.
- **Any depth reference except MD can be missing, wholly or in part.** TVDSS has NULLs at the ends in FORCE and does not exist in LAS. A LAS file could also have a TVD curve, but that is only a guess from its mnemonic. TVD below the rig floor needs a datum elevation that FORCE never has. In LAS it is only optional and sits in `~P` [S1 §5.6, S7 `fields.py`].
- **One NULL representation (NaN) inside the well log.** Each adapter handles sentinels its own way: lasio-style NULL variants for LAS, and per-curve, tolerance-based sentinel removal for FORCE that leaves depth references alone. Each adapter records what it replaced, so the view can report data quality.
- **The unit is a raw string, plus optional normalised metadata.** Unit conversion is out of scope (#22). Unit strings for the same quantity still differ between sources (`ohm.m` vs `ohm·m`), so curve-family assignment cannot rely on the unit alone.
- **The curve key is not the mnemonic.** Duplicate LAS mnemonics are legal in practice, and lower-case mnemonics occur (`x_loc`).
- **A discrete curve is a curve with `kind: discrete`, integer codes and an optional `codes → label` table.** LAS can only supply one through an external mapping keyed on the mnemonic, for example a built-in table for `FORCE_2020_LITHOFACIES_LITHOLOGY`.
- **Zones are a separate list of intervals, grouped into named sets** (`GROUP`, `FORMATION`). They are not a tree and are not keyed by name. LAS 2.0 well logs have none, so the zone track and "click a zone to jump" must cope with an empty list.

## Sources

- **[S1]** CWLS LAS Committee, *LAS Version 2.0: A Digital Standard for Logs, Update February 2017*. Original: <https://www.cwls.org/wp-content/uploads/2017/02/Las2_Update_Feb2017.pdf>. When this note was written cwls.org served a TLS certificate for a different hostname, so the text was read from the archived copy: <https://web.archive.org/web/20240407183515/https://www.cwls.org/wp-content/uploads/2017/02/Las2_Update_Feb2017.pdf>. Section numbers as printed.
- **[S2]** CWLS, *LAS 3.0 File Structure Specifications*, Release 3.00, 2000. Archived: <https://web.archive.org/web/20241102212657/http://www.cwls.org/wp-content/uploads/2014/09/LAS_3_File_Structure.pdf> (`~Parameter` p.17, `~Tops_*` p.21–22). Cited only to show what LAS 2.0 lacks. LAS 3.0 is out of scope (#22).
- **[S3]** lasio source at `bf9874e`: <https://github.com/kinverarity1/lasio/tree/bf9874e3d4396cf777f5ca413a3559d2eb793de4/lasio>. Files: `defaults.py`, `las.py`, `las_items.py`, `reader.py`. Line numbers refer to that commit.
- **[S4]** lasio test fixtures at the same commit: <https://github.com/kinverarity1/lasio/tree/bf9874e3d4396cf777f5ca413a3559d2eb793de4/tests/examples>.
- **[S5]** las-js source at `079de55`: <https://github.com/laslibs/las-js/blob/079de55a7228261e158c08102d546d1dfdd3d8f4/src/index.ts> (npm `las-js` 3.4.2).
- **[S6]** wellio.js source at `23dced3`: <https://github.com/JustinGOSSES/wellio.js/blob/23dced3a2eb8b0733aedac250cb3f08e61372702/dist/index.js>.
- **[S7]** welly source at `6ed78b5`: <https://github.com/agile-geoscience/welly/tree/6ed78b533ac7a5878bf7fd353d2b27ce3981b96a/welly> (`fields.py`, `curve.py`, `well.py`).
- **[S8]** FORCE 2020 upstream starter notebook at `c8d01ee`: <https://github.com/bolgebrygg/Force-2020-Machine-Learning-competition/blob/c8d01ee92c1c8e1ecba36f96cca6ea7b689338a1/lithology_competition/data/starter_notebook.ipynb>. Cell 5 has the column descriptions and cell 12 has `lithology_keys`.
- **[S9]** FORCE 2020 upstream LAS files at the same commit: <https://github.com/bolgebrygg/Force-2020-Machine-Learning-competition/tree/c8d01ee92c1c8e1ecba36f96cca6ea7b689338a1/lithology_competition/data/las_files_Lithostrat_data>. Headers read from `15_9-13`, `25_2-7`, `34_10-35`, `16_1-6 A`, `35_9-10 S` and `7_1-1`.
- **[S10]** petrodb at `f74bd9f`, `parquet/force_2020/schema.md` and `README.md`, which describe the published FORCE 2020 dataset: <https://github.com/oskrgab/petrodb/tree/f74bd9fa03a4893ad0f0b9d75406805df7d7e295/parquet/force_2020>.
- **[S11]** petrodb at the same commit, `parquet/force_2020/schema.json`, which gives the unit for each column.
- **[S12]** Checks run for this note, not published:
  - DuckDB over all 108 `parquet/force_2020/wells/*.parquet` files, with window functions for steps, runs and NULL positions, and exact-vs-tolerance sentinel matching.
  - lasio 0.32 reading upstream `15_9-13.las` and lasio's own fixtures.
  - A Node script that re-runs the unit and description expressions from las-js `property()` and wellio `splitLineofType1()` on header lines taken from [S1] and [S9].
