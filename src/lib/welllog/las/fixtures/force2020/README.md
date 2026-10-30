# FORCE 2020 LAS fixture

`32_2-1.trimmed.las` is well 32/2-1's LAS export from the FORCE 2020
competition repository, at commit
[`c8d01ee`](https://github.com/bolgebrygg/Force-2020-Machine-Learning-competition/tree/c8d01ee92c1c8e1ecba36f96cca6ea7b689338a1/lithology_competition/data/las_files_Lithostrat_data),
trimmed to its header and 300 of its 6,059 data rows (rows 3,250–3,549,
873.1–918.5 m), where the lithology changes several
times. `pipeline.test.ts` reads it.

The header is kept whole, so `STRT` and `STOP` still name the full well. The
file's first comment named the commercial program that exported it; that name
was replaced with "a log export tool". No value was changed.

## Attribution

The data comes from the FORCE 2020 Machine Predicted Lithology competition
dataset, released under the
[Creative Commons Attribution 4.0 International licence (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/):

> Bormann, P., Aursand, P., Dilib, F., Manral, S., & Dischington, P. (2020).
> FORCE 2020 Well well log and lithofacies dataset for machine learning
> competition [Data set]. Zenodo. https://doi.org/10.5281/zenodo.4351156

The upstream GitHub repository carries no licence of its own, so the Zenodo
record is the licence's source.
