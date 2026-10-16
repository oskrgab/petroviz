# Petroviz

A browser app for exploring the petroleum datasets published by petrodb — production data and well logs. It reads the data directly from where petrodb publishes it; petroviz has no backend and owns no data.

## Language

### Data sources

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

### Well logs

**Well log**:
The curves recorded down one wellbore, against one or more depth references, in a form that does not depend on where they came from. The log view reads only this.
_Avoid_: LAS, log file, well data

**Log adapter**:
What turns one source format (a petrodb dataset such as FORCE 2020, a LAS file) into a well log. Each source gets its own; the log view never knows which one ran.
_Avoid_: loader, parser, importer

**Curve**:
One measured or interpreted quantity sampled along the wellbore (GR, RHOB, lithology), with a mnemonic and a unit. Continuous curves hold numbers; discrete curves hold codes such as lithology.
_Avoid_: log (when meaning a single quantity), channel, trace

**Zone**:
A named depth interval of the wellbore, such as a formation or group.
_Avoid_: top (a top is a zone's upper boundary, not the zone), marker

**Depth reference**:
The depth axis a well log is displayed against: MD (measured along the wellbore) or TVDSS (true vertical depth below sea level). TVD below the rig floor needs a datum elevation and is not available for every well log.
_Avoid_: index, reference (unqualified), SSTVD

**Log view**:
The display of one well log: a row of tracks side by side, sharing one depth reference and one visible depth interval.
_Avoid_: well track, log plot, well section

**Track**:
One column of a log view, holding one or more curves drawn against a shared width.
_Avoid_: lane, panel

**Depth track**:
The track that shows the depth reference's scale.
_Avoid_: index track, depth column

**Curve scale**:
How a curve's values map across its track: a left and a right value (either can be the larger, so a scale can run reversed) and linear or logarithmic.
_Avoid_: range (ambiguous with the depth interval), limits

**Depth cursor**:
The horizontal line across the whole log view that follows the pointer's depth and reads out every displayed curve and the depth reference at that depth.
_Avoid_: crosshair, transversal line, tooltip

**Curve family**:
The kind of quantity a curve measures (gamma ray, resistivity, bulk density, neutron porosity, sonic, lithology), independent of its mnemonic. A log adapter assigns it; the default template keys on it.
_Avoid_: curve type, log type, class

**Template**:
A saved log view layout — its tracks, the curves in each and how each is styled — that can be applied to any well log. The **default template** is the one a well opens with.
_Avoid_: layout file, preset, format
