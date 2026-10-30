# FORCE 2020 fixture

`34-6-1_S.head-300.parquet` holds the first 300 rows of well 34/6-1 S as
petrodb publishes it (`force_2020/wells/34-6-1_S.parquet`), in their stored
order, with every column kept. It was rewritten with ZSTD compression, as the
published files are. `decode.test.ts` reads it.

The rows are not in depth order, because the published file isn't either, so
`build` sorts them.

## Attribution

The data comes from the FORCE 2020 Machine Predicted Lithology competition
dataset, released under the
[Creative Commons Attribution 4.0 International licence (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/):

> Bormann, P., Aursand, P., Dilib, F., Manral, S., & Dischington, P. (2020).
> FORCE 2020 Well well log and lithofacies dataset for machine learning
> competition [Data set]. Zenodo. https://doi.org/10.5281/zenodo.4351156

Source repository:
<https://github.com/bolgebrygg/Force-2020-Machine-Learning-competition>.
petrodb republishes it as one Parquet file per well. This fixture keeps 300 of
the well's 6,479 rows and changes no value.
