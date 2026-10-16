# Curve family display defaults

Research note for [#26](https://github.com/oskrgab/petroviz/issues/26) (map: [#22](https://github.com/oskrgab/petroviz/issues/22)). Researched 2026-10-16.

## Question

For the curve families in FORCE 2020 and common LAS 2.0 files, what are the
conventional display defaults? For each family this note gives the default
**curve scale** (left and right values, linear or log, reversed or not), the
usual **track** grouping, a typical colour and line style, and the standard
area fills. It also gives a mnemonic → **curve family** mapping and a colour and
pattern for each FORCE 2020 lithology code.

## Answer in brief

- **Scales.** There is a firm, well-documented convention for the core
  families: GR 0–150 gAPI; caliper and bit size 6–16 in; resistivity on a log
  scale, 0.2–2000 ohm·m; bulk density 1.95–2.95 g/cm³ with neutron 0.45 → −0.15
  v/v on the matching ("limestone-compatible") reversed scale; PEF 0–10 b/e;
  compressional sonic 140 → 40 µs/ft, reversed. Sources: [G5], [G9], [G11],
  [G13], [G14], [G15], [G16], [G19], [PP].
- **Tracks.** Use the classic API layout, extended: GR/caliper/SP track →
  depth track → resistivity track (log) → density–neutron track → sonic track →
  drilling track → lithology and zone tracks [G5], [AW].
- **Colours.** No vendor-neutral standard sets curve colours. The open-source
  projects agree on GR green, density red, neutron blue (dashed) and sonic
  purple [PP], [AM]. Every other colour below is a petroviz choice and is
  labelled as one.
- **Fills.** Four fills are standard: the neutron–density crossover, GR
  sand/shale shading, caliper vs bit size, and (optionally) resistivity or PEF
  cut-offs [G9], [G15], [AAPG-DN], [AM], [PP].
- **Lithology.** Use the Kansas Geological Survey (KGS) lithology colours
  [KGS] with USGS/FGDC pattern numbers [FGDC]. All 12 FORCE 2020 codes are
  covered. KGS is a geological survey and documents every code. The FORCE 2020
  organisers' own plots use a different, undocumented palette [F-IMG]. The two
  are compared in [Lithology colours](#lithology-colours-and-patterns).
- **The FORCE 2020 data clashes with the conventions in four places**
  ([FORCE 2020 fit](#force-2020-fit)): 26 % of caliper samples and 25 % of DTC
  samples fall outside the conventional scale; SP has no common baseline across
  wells; `MUDWEIGHT` mixes at least three unit systems.

## Conventions this note assumes

- **The API grid.** A log has track 1 (always linear), then a depth column,
  then tracks 2 and 3 (linear or logarithmic, and often merged into one). Modern
  displays add more tracks but keep the depth track between tracks 1 and 2
  [G5].
- **Wrap-around.** Off-scale values have traditionally been handled by
  wrap-around, not by widening the scale [G5], [G11]. This matters for the
  FORCE 2020 fit below. How petroviz shows off-scale values is a separate
  decision ("data quality in the view" on #22). This note keeps the
  conventional scales and flags where they clip.
- **Scales are per unit, not per family.** The log view shows each curve in its
  source unit (#22), so a default curve scale must follow the unit. The
  [CWLS LAS 2.0 example](#sources) records `RHOB` in kg/m³ and `CALI` in mm
  [CWLS]. The neutron convention is 45 → −15 when the unit is percent [G15],
  [AM]. Each default below is given in the FORCE 2020 unit. Equivalents for
  other units follow in [Unit-aware defaults](#unit-aware-defaults).
- **"Reversed"** means the left value is larger than the right one, as in the
  CONTEXT.md definition of curve scale.

## Defaults per curve family

The "Source" column cites the evidence. "petroviz choice" means no
vendor-neutral source was found, and the value is a proposal to settle in the
default template.

### Gamma ray

| Property | Default | Source |
|---|---|---|
| Curve scale | 0 → 150 gAPI, linear, not reversed | [G11]: 0–100 or 0–150 gAPI, values above 150 by wrap-around; [PP] 0–150 |
| Track | Track 1 (GR/caliper/SP), first curve | [G11], [G5] |
| Colour | `#006400` (dark green) | [PP]; [AM] uses `green` |
| Line style | Solid | [PP] |

Disagreement: [AM] plots FORCE 2020 GR at 0–200. 0–150 is chosen because two
sources use it and only 2.4 % of FORCE 2020 GR samples exceed 150.

### Spectral gamma ray

Covers total (`SGR`, `HSGR`) and uranium-free computed (`CGR`, `HCGR`) spectral
GR, in gAPI. Potassium, thorium and uranium curves (`POTA`/`K`,
`THOR`/`TH`, `URAN`/`U`) are separate quantities with their own units, and none
appear in FORCE 2020.

| Property | Default | Source |
|---|---|---|
| Curve scale | Same as GR: 0 → 150 gAPI, linear | [G12]: SGR and CGR go in track 1 alongside GR |
| Track | Track 1 | [G12] |
| Colour | `#006400` (GR's colour) | petroviz choice |
| Line style | Dashed (`SGR`), dotted (`CGR`) | petroviz choice, so the curve reads as the same family on the same scale |

K, Th and U go in tracks 2–3 [G12]. They are out of scope until a LAS file
needs them.

### Spontaneous potential (SP)

| Property | Default | Source |
|---|---|---|
| Curve scale | 100 mV span, linear, negative to the left | [G18] §18.4: SP is in track 1 "with negative deflections to the left" and is read against a shale baseline; Fig. 18.9 gives the scale as a 10 mV bar, not absolute values. The 100 mV span is a petroviz choice |
| Left/right values | median(SP) − 50 → median(SP) + 50 mV, computed per well | petroviz choice. SP is relative, so the scale has no fixed absolute value |
| Track | Track 1 | [G18], [G11] |
| Colour | `#0000FF` (blue) | petroviz choice |
| Line style | Solid | petroviz choice |

In FORCE 2020 the median SP per well ranges from −231 to +127 mV, so any fixed
absolute scale fails. The median per-well p5–p95 spread is 62 mV, so a 100 mV
window fits most wells.

### Caliper

| Property | Default | Source |
|---|---|---|
| Curve scale | 6 → 16 in, linear | [G9] Fig. 9.2: CAL and BIT SIZE share a 6–16 in scale |
| Track | Track 1, on the same scale as bit size | [G9], [G5] |
| Colour | `#FF0000` (red) | [PP] |
| Line style | Dashed | [WV] (caliper template is dashed) |

### Bit size

| Property | Default | Source |
|---|---|---|
| Curve scale | Same as caliper: 6 → 16 in, linear | [G9] |
| Track | Track 1 | [G9], [G11] |
| Colour | `#000000` | petroviz choice |
| Line style | Dotted | petroviz choice |

### Differential caliper

FORCE 2020 `DCAL` is `CALI − BS` [PDB], which matches the IODP definition of
`DCAL` as "Differential Caliper" [IODP]. It needs its own family: on the 6–16 in
caliper scale it would sit off the left edge.

| Property | Default | Source |
|---|---|---|
| Curve scale | −2 → 8 in, linear | [G9] Fig. 9.2: differential caliper on a −2 to 8 in scale |
| Track | Track 1 | [G9] |
| Colour | `#A0522D` (sienna) | petroviz choice |
| Line style | Solid | petroviz choice |

### Resistivity: deep, medium, shallow, micro

All four families share one track and one scale, so their readings can be
compared directly [G19].

| Property | Deep | Medium | Shallow | Micro / flushed zone |
|---|---|---|---|---|
| Curve scale | 0.2 → 2000 ohm·m, **log** | same | same | same |
| Track | Resistivity track | same | same | same |
| Colour | `#330000` [PP] | `#CC0000` [PP] | `#FF8C00` (choice) | `#0000CC` (choice) |
| Line style | Solid (choice) | Dashed (choice) | Dotted (choice) | Dash-dot (choice) |

- **Scale.** Resistivity goes "in Track 2 or in Tracks 2 and 3 combined on a
  log scale", from 0.2–20 ohm·m (3 cycles) up to 0.2–20 000 ohm·m (6 cycles)
  [G19]. Electrical data "is almost always presented on a logarithmic track"
  [G5]. IODP plots its deep, medium and shallow resistivity curves on a log
  scale [IODP-RES]. [PP] uses 2–2000. 0.2–2000 (4 decades) is chosen: it is
  in the middle of [G19]'s range, and it clips only 0.1 % of FORCE 2020
  `RDEP`/`RMED` and under 1 % of `RSHA`/`RXO`/`RMIC`.
- **Micro.** A stand-alone microlog is drawn linearly, 0–10 ohm·m [G19]. When
  shown with the other resistivities, it goes on their log scale, which is the
  case the default template needs.
- **Line styles.** No public vendor-neutral source for deep/medium/shallow line
  styles was found. The solid → dashed → dotted order (deepest to shallowest)
  is a petroviz choice.

### Bulk density

| Property | Default | Source |
|---|---|---|
| Curve scale | 1.95 → 2.95 g/cm³, linear, not reversed | [G13]: "usually spans 1.95 to 2.95 g/cm³"; [PP], [AM] |
| Track | Density–neutron track (API tracks 2–3) | [G13], [G14] |
| Colour | `#FF0000` (red) | [PP], [AM] |
| Line style | Solid | [PP] |

### Density correction

| Property | Default | Source |
|---|---|---|
| Curve scale | −0.25 → 0.25 g/cm³, linear | [SEPM] log header: "Density Correction .25 −.25 (GM/CC)". [G13]: corrections beyond ±0.15 g/cm³ mean the density is unreliable |
| Track | Density–neutron track | [G13]: "often shown in either track 2 or track 3 on a linear scale" |
| Colour | `#808080` (grey) | petroviz choice. It is a quality-control curve, so a muted colour suits it |
| Line style | Dotted | petroviz choice |

### Neutron porosity

| Property | Default | Source |
|---|---|---|
| Curve scale | 0.45 → −0.15 v/v, linear, **reversed** | [G15]: the compatible scale is density 1.95–2.95 g/cm³ with neutron −15 to 45 limestone porosity units, "the most commonly used scale range"; [PP] 0.45 → −0.15; [AM] 45 → −15 |
| Track | Density–neutron track, overlaid on bulk density | [G15], [G14] |
| Colour | `#0099CC` (blue) | [PP]; [AM] uses `blue` |
| Line style | Dashed | [PP] |

The two scales only overlay in a clean, water-filled limestone [G15]. That is
what makes the crossover fill below meaningful.

### Photoelectric factor (PEF)

| Property | Default | Source |
|---|---|---|
| Curve scale | 0 → 10 b/e, linear | [G14]: 0–10, 0–15 or 0–20 b/e "most often used"; [PP] 0–10 |
| Track | Density–neutron track, usually at its left side | [G14] |
| Colour | `#000000` | [PP] |
| Line style | Solid | [PP] |

8.9 % of FORCE 2020 PEF samples (in 62 wells) exceed 10 b/e, and 2.9 % exceed
20. [G14] shows barite far "off scale" on PEF, so barite-weighted mud is a
plausible cause. This was not checked well by well. 0–10 stays the default because both sources use it. 0–20 is the
documented alternative.

### Compressional sonic

| Property | Default | Source |
|---|---|---|
| Curve scale | 140 → 40 µs/ft, linear, **reversed** | [G16]: "Most formations give transit times between 40 µs/ft and 140 µs/ft, so these values are usually used as the scale"; [AM] 140 → 40 |
| Track | Sonic track (classic layout: track 3) | [G16] |
| Colour | `#800080` (purple) | [AM] |
| Line style | Solid | [AM] |

### Shear sonic

| Property | Default | Source |
|---|---|---|
| Curve scale | 440 → 40 µs/ft, linear, **reversed** | [IODP-DSI]: one field log shows shear slowness on 440 → 40. Shear scales vary from log to log, and no single convention was found |
| Track | Sonic track, with compressional sonic | petroviz choice |
| Colour | `#FF00FF` (magenta) | petroviz choice |
| Line style | Dashed | petroviz choice |

This is the weakest default in the note. 440 → 40 is chosen because it covers
98.7 % of FORCE 2020 `DTS` samples. The common alternative, 240 → 40, would
clip 17.6 % of them.

### Rate of penetration (ROP)

| Property | Default | Source |
|---|---|---|
| Curve scale | 100 → 0 m/h, linear, **reversed** (faster drilling plots further left) | [WP-ML]: on the mud log, "the farther to the left that the line goes, the faster the rate of penetration". The 100 m/h value is a petroviz choice that covers 95 % of FORCE 2020 `ROP` |
| Track | Drilling track | [AW]: ROP is in track 1 of the mud log, not on the wireline grid |
| Colour | `#000000` | [WP-ML]: "the black line" |
| Line style | Solid; `ROPA` (average ROP) dashed | petroviz choice |

### Mud weight

| Property | Default | Source |
|---|---|---|
| Curve scale | Per-well min → max, linear | petroviz choice. No published display convention was found |
| Track | Drilling track | petroviz choice, grouping it with the other drilling curves |
| Colour | `#8B4513` (brown) | petroviz choice |
| Line style | Solid | petroviz choice |

No fixed default is safe for FORCE 2020: `MUDWEIGHT` has at least three
magnitudes. 19 wells read about 0.13–0.20, 9 wells about 1.05–1.80, and
`16/10-2` reads 155–186 [PDB-QA]. The LAS files leave the unit blank [F-LAS].
petrodb labels the column g/cm³ [PDB], which only fits the middle group. This is
a petrodb data issue. It is recorded here because it decides the scale.

### Lithology (discrete)

It goes in its own lithology track, one colour block and pattern per code. See
[Lithology colours and patterns](#lithology-colours-and-patterns).

## Default track grouping

This is the layout the default template would build from curve families,
following the API grid [G5] with the drilling track from the mud log [AW]:

| # | Track | Scale | Families, in draw order |
|---|---|---|---|
| 1 | GR / caliper | linear | gamma ray, spectral GR, SP, caliper, bit size, differential caliper |
| — | Depth track | — | depth reference |
| 2 | Resistivity | **log** | deep, medium, shallow, micro resistivity |
| 3 | Density–neutron | linear | bulk density, neutron porosity, PEF, density correction |
| 4 | Sonic | linear | compressional sonic, shear sonic |
| 5 | Drilling | linear | ROP, mud weight |
| 6 | Lithology | discrete | lithology |
| 7 | Zones | discrete | `GROUP` / `FORMATION` (not a curve family) |

A family missing from a well drops out of its track, and a track left empty
drops out of the view.

FORCE 2020 sometimes has two curves of the same family, such as `RXO` and
`RMIC` (micro) or `ROP` and `ROPA`. The template must then vary the style of
the second curve. The tables above handle this by mnemonic where it matters.

## Standard area fills

| Fill | Between | Rule and colours | Source |
|---|---|---|---|
| **Neutron–density crossover** | bulk density and neutron porosity, on the compatible scales above | Density left of neutron (density porosity > neutron porosity): "crossover" → `#FFFF00` (yellow). Neutron left of density (shale-type separation) → `#BEBEBE` (grey) | [AAPG-DN]: crossover "is due to the presence of gas"; [G15]: separations by lithology; [AM]: yellow/green fill on the same rule |
| **GR sand/shale** | GR curve and the track edges | Curve to right edge (low GR, the clean side) → `#FFFF00`. Left edge to curve (shaly side) → `#BEBEBE` | [AM]: green left of curve, yellow right; [KGS-CL]: clean intervals light, shales dark; [PP]: colour-mapped fill left of curve |
| **Caliper vs bit size** | caliper and bit size | Caliper > bit size (washout, caving) → `#FFA500` (orange). Caliper < bit size (mudcake, swelling) → `#8FBC8F` (grey-green) | Meanings: [G9] Table 9.1. Colours: petroviz choice |
| Resistivity cut-off (optional) | deep resistivity and a cut-off value | Above the cut-off → `#FF9994` | [PP] (cut-off 20 ohm·m) |
| PEF cut-off (optional) | PEF and a cut-off value | Below 3 b/e → `#FFFF99`, above → `#CDE7F0` | [PP] |

Disagreement: for the shale side of the crossover and GR fills, [AM] uses green
and [KGS-CL] uses a dark grey. petroviz uses grey `#BEBEBE`, the KGS shale
colour [KGS], so the fills and the lithology track read as one legend.

The two optional fills need a parameter (a cut-off value), so they should be
off in the default template.

## Mnemonic → curve family

A log adapter assigns the family, and the default template keys on it
(CONTEXT.md). In the open-source alias lists the mapping is a lookup from
mnemonic to family [WY], [PPA]. Recognition from mnemonic and unit together is
the approach taken by the OSDU wellbore work [OSDU].

### Every FORCE 2020 column

| Column | Unit | Curve family | Notes |
|---|---|---|---|
| `GR` | gAPI | gamma ray | [WY], [PPA] |
| `SGR` | gAPI | spectral gamma ray | [WY] and [PPA] put it under GR. It is split out because #26 lists spectral GR as a family. Same scale either way |
| `SP` | mV | SP | [WY], [PPA] |
| `CALI` | in | caliper | [WY], [PPA] |
| `BS` | in | bit size | Absent from [WY]/[PPA]. CWLS uses `BS` for bit size [CWLS] |
| `DCAL` | in | differential caliper | [WY] and [PPA] list `DCAL` as caliper. [PDB] and [IODP] define it as a differential. IODP and the data win (median 0.52 in) |
| `RDEP` | ohm·m | deep resistivity | [WY] |
| `RMED` | ohm·m | medium resistivity | [WY] |
| `RSHA` | ohm·m | shallow resistivity | In neither alias list. [PDB] defines it as shallow-reading |
| `RXO` | ohm·m | micro resistivity | [WY]/[PPA] lump it with shallow. The CWLS example names the micro curve "Rxo RESISTIVITY" [CWLS] |
| `RMIC` | ohm·m | micro resistivity | [PDB] |
| `RHOB` | g/cm³ | bulk density | [WY], [PPA] |
| `DRHO` | g/cm³ | density correction | [WY], [PPA] |
| `NPHI` | v/v | neutron porosity | [WY], [PPA] |
| `PEF` | b/e | PEF | [WY], [PPA] |
| `DTC` | µs/ft | compressional sonic | [WY], [PPA] |
| `DTS` | µs/ft | shear sonic | [WY], [PPA] |
| `ROP` | m/h | ROP | [PDB] |
| `ROPA` | m/h | ROP | [PDB]: averaged ROP |
| `MUDWEIGHT` | mixed (see above) | mud weight | [PDB] |
| `FORCE_2020_LITHOFACIES_LITHOLOGY` | code | lithology | Discrete [PDB] |
| `DEPTH_MD` | m | — | Depth reference (MD), not a curve |
| `Z_LOC` | m | — | Depth reference (TVDSS = `-Z_LOC`, #22), not a curve |
| `X_LOC`, `Y_LOC` | m | — | Location, not displayed |
| `GROUP`, `FORMATION` | — | — | Zones, not curves |
| `WELL`, `dataset` | — | — | Metadata |

The upstream LAS files also carry `FORCE_2020_LITHOFACIES_CONFIDENCE` [F-LAS],
which petrodb does not publish.

### Widely used LAS mnemonics

Families are listed in default-template order. Membership comes from [WY]
(Apache-2.0, extended from a published mnemonic list), [PPA] (MIT), the CWLS
LAS 2.0 example [CWLS] and IODP's mnemonic glossary [IODP].

| Curve family | Mnemonics | Source |
|---|---|---|
| gamma ray | `GR`, `GRC`, `ECGR`, `GAM`, `GRS` | [WY], [PPA], [IODP], [CWLS] |
| spectral gamma ray | `SGR`, `HSGR`, `CGR`, `HCGR` | [WY]/[PPA] (as GR), [IODP], [G12] |
| SP | `SP`, `SPBR`, `SP_S` | [WY], [PPA], [CWLS] |
| caliper | `CALI`, `CAL`, `HCAL`, `LCAL`, `HLCA`, `C1`, `C2`, `CALX`, `CALY` | [WY], [PPA], [IODP], [CWLS] |
| bit size | `BS` | [CWLS] (a parameter there; a curve in FORCE 2020) |
| differential caliper | `DCAL` | [IODP], [PDB] |
| deep resistivity | `RDEP`, `ILD`, `RILD`, `IDPH`, `LLD`, `HLLD`, `RT`, `AT90`, `AF90` | [WY], [PPA], [CWLS], [IODP] |
| medium resistivity | `RMED`, `ILM`, `RILM`, `IMPH`, `LLS`, `HLLS`, `AT30` | [WY], [PPA], [CWLS], [IODP] |
| shallow resistivity | `RSHA`, `SFL`, `SFLU`, `SFLA`, `AT10`, `RS` | [WY], [PPA], [CWLS], [IODP] |
| micro resistivity | `RXO`, `RMIC`, `MSFL`, `MLL`, `RXOZ`, `MINV`, `MNOR` | [CWLS], [G19], [PDB] (both lists file these under shallow) |
| bulk density | `RHOB`, `RHOZ`, `ZDEN`, `DEN`, `DENS`, `RHOM` | [WY], [PPA], [IODP], [CWLS] |
| density correction | `DRHO`, `DRH`, `HDRA`, `ZCOR`, `DCOR` | [WY], [PPA], [IODP] |
| neutron porosity | `NPHI`, `TNPH`, `NPOR`, `CNC`, `NPHS`, `NPSS`, `APLC`, `NPH` | [WY], [PPA], [IODP], [CWLS] |
| PEF | `PEF`, `PE`, `PEFZ`, `PEFL` | [WY], [PPA], [IODP] |
| compressional sonic | `DTC`, `DT`, `DTCO`, `AC`, `DTP` | [WY], [PPA], [IODP] |
| shear sonic | `DTS`, `DTSM`, `DT4S`, `DTSF` | [WY], [PPA], [IODP] (`DTSM` is in neither alias list) |
| ROP | `ROP`, `ROPA`, `ROP5` | [PDB], [IODP] |
| mud weight | `MUDWEIGHT`, `DFD` | [PDB], [CWLS] (`DFD`, "Mud Weight", is a parameter there) |

Known traps in the alias lists:

- **Ambiguous laterolog arrays.** [WY] files `RLA1` as deep and `RLA3` as both
  deep and medium. These should not be trusted without the unit and the
  sibling curves.
- **`GRD` is listed as deep resistivity** in [WY] and [PPA].
- **`LLS` is "Laterolog Shallow"** [IODP], but [WY] and [PPA] map it to medium.
  Mapping it to medium is right in practice: it is the shallower curve of a
  deep/shallow pair and reads well beyond the micro devices.
- **Unknown mnemonics** fall back to the unit: gAPI → gamma ray, mV → SP,
  b/e → PEF, µs/ft → sonic, m/h or ft/h → ROP. A resistivity unit cannot tell
  deep from shallow, so an unknown resistivity defaults to "resistivity,
  unknown depth" on the shared log scale.

## Unit-aware defaults

The same scale in the other units LAS files commonly use. These are plain unit
conversions of the defaults above. The scale values are converted; the curve
values are not (#22 keeps them in their source unit).

| Family | FORCE 2020 unit → default | Other unit → default |
|---|---|---|
| caliper, bit size | in: 6 → 16 | mm: 152 → 406 (CWLS example uses mm [CWLS]) |
| differential caliper | in: −2 → 8 | mm: −51 → 203 |
| bulk density | g/cm³: 1.95 → 2.95 | kg/m³: 1950 → 2950 (CWLS example [CWLS]) |
| density correction | g/cm³: −0.25 → 0.25 | kg/m³: −250 → 250 |
| neutron porosity | v/v: 0.45 → −0.15 | %, p.u.: 45 → −15 [G15], [AM] |
| compressional sonic | µs/ft: 140 → 40 | µs/m: 459 → 131 |
| shear sonic | µs/ft: 440 → 40 | µs/m: 1444 → 131 |
| ROP | m/h: 100 → 0 | ft/h: 328 → 0 |

## FORCE 2020 fit

Computed from the 108 petrodb FORCE 2020 well files on 2026-10-16 [PDB-QA].
Each figure is the share of non-null samples outside the default scale, after
discarding sentinels ≤ −998.

| Curve | Default | Outside | Comment |
|---|---|---|---|
| `GR` | 0–150 | 2.4 % | fine |
| `CALI` | 6–16 in | **25.7 %** | 17½-in sections (`BS` = 17.5 in 17.2 % of samples). Fine with wrap-around; clipped without it. 6–26 in would cover 100 % |
| `DCAL` | −2–8 in | 1.6 % | fine |
| `RDEP` / `RMED` | 0.2–2000 | 0.1 % | fine |
| `RSHA` / `RXO` / `RMIC` | 0.2–2000 | 0.4 / 0.8 / 0.9 % | fine |
| `RHOB` | 1.95–2.95 | 8.6 % | mostly low-density shallow or washed-out intervals |
| `DRHO` | ±0.25 | 1.3 % | fine |
| `NPHI` | 0.45 → −0.15 | 19.2 % | high-porosity shales above 0.45, as expected |
| `PEF` | 0–10 | 8.9 % | see PEF above |
| `DTC` | 140 → 40 | **25.3 %** | slow, shallow young sediments. Only 0.1 % exceed 190 µs/ft |
| `DTS` | 440 → 40 | 1.3 % | 240 → 40 would clip 17.6 % |
| `ROP` | 100 → 0 | 4.6 % | a few wells carry implausible values (one has a median of ~17 800 m/h) |
| `SP` | per-well window | — | per-well median from −231 to +127 mV, so no fixed scale works |
| `MUDWEIGHT` | per-well | — | mixed magnitudes, see mud weight above |

Recommendation: keep the conventional scales as defaults. Settle off-scale
behaviour (wrap-around [G5], clipping with a marker, or rescaling) in the
data-quality decision on #22. `CALI` and `DTC` are the two curves where that
decision changes what a FORCE 2020 user sees.

## Lithology colours and patterns

### Sources compared

- **KGS lithology symbol chart** [KGS]. The Kansas Geological Survey's legend
  for its well-profile tools. It gives a colour and pattern for every FORCE 2020
  class, including evaporites, coal, tuff and igneous rock. Hex values below
  were sampled from the chart's swatch images.
- **USGS/FGDC lithologic patterns** [FGDC]. FGDC-STD-013-2006, section 37,
  the US federal standard for geologic-map symbols. It defines numbered
  black-and-white patterns and no colours. It has no anhydrite pattern; 667
  (gypsum) is the nearest evaporite.
- **FORCE 2020 organisers' plots** [F-IMG]. The upstream repository's
  comparison images use one palette: shale bright green, limestone blue, and so
  on. The repository's code and notebooks define no colour mapping [F-NB]. Only
  7 of the 12 classes are labelled in the images, so the palette is incomplete
  and undocumented.
- **Community FORCE 2020 notebook** [AM]. An MIT-licensed notebook series that
  states its colours are "based on the Kansas Geological Survey website". It
  differs from the chart in a few values.

**Pick: KGS colours with FGDC pattern numbers.** KGS is a public geological
survey, its chart covers all 12 codes, and its scheme follows the
widely shared defaults: sand yellow, shale grey, limestone cyan/blue [WP-ML].
The organisers' palette would match the FORCE 2020 images, but it is
undocumented, partly unidentifiable, and diverges from that wider convention
(green shale, red halite).

### Per code

| Code | Lithology | Colour (KGS) | KGS pattern | FGDC pattern | Fallback hatch [AM] | Organisers' colour [F-IMG] |
|---|---|---|---|---|---|---|
| 30000 | Sandstone | `#FFFF00` | dots | 607 massive sand or sandstone | `..` | `#FFFF00` |
| 65030 | Sandstone/Shale | `#FFE119` | dots with dashes ("Sand, Sandstone (shaly)") | 670 interbedded sandstone and shale | `-.` | `#00FFDD` |
| 65000 | Shale | `#BEBEBE` | dashes | 620 clay or clay shale | `--` | `#00FF00` |
| 80000 | Marl | `#7CFC00` | wavy lines | 623 calcareous shale or marl | — | `#00FFAA` |
| 74000 | Dolomite | `#8080FF` | slanted brick (rhomb) | 642 dolostone or dolomite | `-/` | not identifiable |
| 70000 | Limestone | `#80FFFF` | brick | 627 limestone | `+` | `#0099FF` |
| 70032 | Chalk | `#80FFFF` | open brick (staggered T marks) | 626 chalk | `..` | `#00DDFF` |
| 88000 | Halite | `#7FFFD4` | fine checker / crosshatch | 668 salt | `x` | `#FF3300` |
| 86000 | Anhydrite | `#FF80FF` | small chevrons (`^`) | none (667 gypsum is nearest) | — | `#FFAA00` (inferred, unlabelled) |
| 99000 | Tuff | `#FF8C00` | short vertical ticks | 711 tuffaceous rock | `\|\|` | `#EE00FF` (inferred, unlabelled) |
| 90000 | Coal | `#000000` | solid | 658 coal | — | not identifiable |
| 93000 | Basement | `#FF1493` | crosses (`+`) ("Igneous – Intrusive (Plutonic) Rocks") | 718 granite (or 707 schist and gneiss if metamorphic) | `-\|` | not identifiable |
| null | No interpretation | transparent | none | — | — | `#C0C0C0` ("UNDEF") |

Notes:

- **Limestone and chalk share `#80FFFF` in the KGS chart.** Only the pattern
  tells them apart. If petroviz draws patterns, follow the chart. If it draws
  colour only, chalk needs a distinct colour; that is an open template decision.
- **Basement.** KGS has no "basement" entry, and FORCE 2020 does not say what
  rock it is. Intrusive igneous `#FF1493` with FGDC 718 is a guess for
  crystalline basement. [AM] uses `#EF138A`, close to this.
- **Where [AM] differs from the chart:** shale (`#BEBEBE`) and sandstone match;
  limestone and chalk match (`#80FFFF`); halite is `#7DDFBE` in [AM] against
  `#7FFFD4` in the chart; anhydrite (`#FF80FF`), tuff (`#FF8C00`), marl
  (`#7CFC00`) and dolomite (`#8080FF`) match.
- **Organisers' colours** were read from the pixel values of
  `lithology_competition/images/wellslogs *.png`. A colour is attributed to a
  class only where the plot labels it ("Sandstone", "shale", "shale sandy",
  "Limestone", "Chalk", "Marl", "Evaporite Halite"). The anhydrite and tuff
  attributions are inferences from depth and stratigraphy, not labels.
- **Rendering patterns.** The FGDC patterns are published by the USGS as part
  of a federal standard [FGDC]. The matplotlib hatch strings from [AM] give a
  cheap fallback that maps to SVG/canvas line patterns.

## Sources

Primary or authoritative:

- **[G5] [G9] [G11] [G12] [G13] [G14] [G15] [G16] [G18] [G19]**: P. Glover,
  *Petrophysics MSc Course Notes*, University of Leeds, chapters 5 (Wireline
  logging, §5.3 Presentation of log data), 9 (Caliper, §9.2, Table 9.1),
  11 (Total gamma ray, §11.4), 12 (Spectral gamma ray, §12.4), 13 (Formation
  density, §13.6), 14 (Litho-density, §14.4), 15 (Neutron, §15.11.1),
  16 (Sonic, §16.5), 18 (SP, §18.4), 19 (Electrical logs, §19.11).
  <https://homepages.see.leeds.ac.uk/~earpwjg/PG_EN/CD%20Contents/GGL-66565%20Petrophysics%20English/>
  (read via the Internet Archive copy, `web.archive.org/web/2022id_/…`, because
  the original host's certificate has expired).
- **[CWLS]** Canadian Well Logging Society, *LAS Version 2.0* specification,
  example file (curve and parameter sections).
  <https://www.cwls.org/wp-content/uploads/2017/02/Las2_Update_Feb2017.pdf>
- **[FGDC]** USGS / Federal Geographic Data Committee, *FGDC Digital
  Cartographic Standard for Geologic Map Symbolization* (FGDC-STD-013-2006),
  section 37, Lithologic patterns.
  <https://ngmdb.usgs.gov/fgdc_gds/geolsymstd/fgdc-geolsym-sec37.pdf>
- **[KGS]** Kansas Geological Survey, *Lithology Symbols* (J. R. Victorine),
  colour and pattern legend for KGS well-profile tools.
  <http://www.kgs.ku.edu/PRS/Ozark/PROFILE/HELP/DATA_ENTRY/lithology/Lithology-Symbols.html>
- **[KGS-CL]** Kansas Geological Survey, *Gamma Ray Colorlith Cross Section*.
  <https://www.kgs.ku.edu/stratigraphic/GR_CROSS_SECTION/index.html>
- **[IODP]** IODP-USIO logging acronyms and mnemonics (Expedition 352 data
  documentation). Definitions of `DCAL`, `DRH`, `DTCO`, `DTSM`, `ECGR`,
  `HSGR`, `HCGR`, `IDPH`, `IMPH`, `LLD`, `LLS`, `PEFL`, `RHOM`, `ROP5`,
  `SFLU`, `TNPH`, `APLC` and others.
  <https://mlp.ldeo.columbia.edu/data/iodp-usio/exp352/U1442A/documents/iodp-usio-acronyms.html>
- **[IODP-RES]** IODP, downhole tool description (dual induction
  resistivity), "Log Presentation". <https://iodp.tamu.edu/tools/logging/TRIPLE/dit.html>
- **[IODP-DSI]** LDEO/IODP field log plot showing sonic slowness scales,
  including shear on 440 → 40 µs/ft.
  <https://mlp.ldeo.columbia.edu/data/iodp-usio/exp318/U1359D/field_log_plots/318-U1359D_dsi.pdf>
- **[AAPG-DN]** AAPG Wiki, *Density-neutron log porosity* (after Hartmann &
  Beaumont, AAPG Treatise of Petroleum Geology).
  <https://wiki.aapg.org/Density-neutron_log_porosity>
- **[AW]** AAPG Wiki, *Mudlogging: the mudlog* (A. Whittaker, AAPG Methods in
  Exploration 10). <https://wiki.aapg.org/Mudlogging:_the_mudlog>
- **[SEPM]** SEPM, *Berryessa Peak core and log* (log header showing a
  ±0.25 g/cm³ density-correction scale).
  <https://www.sepm.org/files/Berryessa-Peak-Core-and-Log.tfagjovy70dozoyd.pdf>
- **[OSDU]** OSDU (The Open Group), wellbore domain services issue on log
  recognition from mnemonic and unit.
  <https://community.opengroup.org/osdu/platform/domain-data-mgmt-services/wellbore/wellbore-domain-services/-/issues/27>

FORCE 2020 and petrodb:

- **[F-IMG]** FORCE 2020 competition repository, comparison images
  `lithology_competition/images/wellslogs 1 .png`, `… 2 .png`, `… 3 .png`.
  <https://github.com/bolgebrygg/Force-2020-Machine-Learning-competition/tree/master/lithology_competition/images>
- **[F-NB]** FORCE 2020 starter notebook (lithology keys; no colours).
  <https://github.com/bolgebrygg/Force-2020-Machine-Learning-competition/blob/master/lithology_competition/data/starter_notebook.ipynb>
- **[F-LAS]** FORCE 2020 LAS files, e.g. `15_9-13.las` (`~Curve` section; the
  `MUDWEIGHT` unit is blank).
  <https://github.com/bolgebrygg/Force-2020-Machine-Learning-competition/tree/master/lithology_competition/data/las_files_Lithostrat_data>
- **[PDB]** petrodb `force_2020/schema.md` and `schema.json` (column
  descriptions and units).
- **[PDB-QA]** Statistics computed for this note with DuckDB over the 108
  petrodb `force_2020/wells/*.parquet` files (2026-10-16).

Open-source software (conventions in code):

- **[PP]** PetroPy (MIT), `petropy/data/default_raw_template.xml`: track
  scales, colours, line style and cut-off fills.
  <https://github.com/toddheitmann/PetroPy/blob/master/petropy/data/default_raw_template.xml>
- **[PPA]** PetroPy (MIT), `petropy/data/curve_alias.xml`: mnemonic → family
  aliases. <https://github.com/toddheitmann/PetroPy/blob/master/petropy/data/curve_alias.xml>
- **[WY]** welly (Apache-2.0), `welly/defaults.py` `ALIAS`: mnemonic → family
  aliases. <https://github.com/agile-geoscience/welly/blob/main/welly/defaults.py>
- **[WV]** wellioviz (Apache-2.0), caliper curve template (dashed stroke).
  <https://github.com/JustinGOSSES/wellioviz/blob/master/dist/log_style_templates/CAL.js>
- **[AM]** A. McDonald, *Petrophysics-Python-Series* (MIT), notebooks 02
  (well plot), 12 (plot fills) and 14 (lithology, FORCE 2020 codes; colours
  "based on the Kansas Geological Survey website").
  <https://github.com/andymcdgeo/Petrophysics-Python-Series>

Secondary:

- **[WP-ML]** Wikipedia, *Mud logging* (ROP direction; lithology colours
  "not necessarily standardized"). <https://en.wikipedia.org/wiki/Mud_logging>

Not used: two widely cited references for log presentation were unavailable or
unsuitable. The industry hardcopy-presentation standard (API RP 31A) is behind
a paywall; [G5] summarises its grid. A popular online petrophysics handbook's
plot-default tables require a login.
