# Petroviz

A browser dashboard for exploring petroleum production data published by petrodb. It reads the data directly from where petrodb publishes it; petroviz has no backend and owns no data.

## Language

**petrodb**:
The upstream repository that publishes the datasets petroviz visualises. It publishes each dataset's data and its schema to two different hosts.
_Avoid_: volve-db, the database

**Dataset**:
One named collection within petrodb (e.g. Volve), made up of tables plus a schema describing them.
_Avoid_: database, source

**Data host**:
Where petrodb publishes a dataset's parquet tables — Hugging Face. It must support byte-range reads, since queries fetch only the parts of a table they need.
_Avoid_: base URL, data source, CDN

**Schema host**:
Where petrodb publishes a dataset's schema and docs — the petrodb site. It does not serve parquet tables.
_Avoid_: docs site, landing
