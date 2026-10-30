# Template colours are written for a light background; the log view adapts them on a dark one

A template stores one colour per curve and fill: the colour it should have on a white track. The log view draws those colours as stored on a light track background. On a dark one it adapts them at draw time. The template file never changes with the theme. This was decided in [#37](https://github.com/oskrgab/petroviz/issues/37).

## The rule

- **When.** Colours are adapted when the resolved `--welllog-bg` is dark (relative luminance below 0.18). The theme's name doesn't decide it. The host passes `scheme: 'light' | 'dark'` to the log view and may override any `--welllog-*` token. A host that keeps a light track in dark mode gets no adaptation.
- **Strokes.** This covers curve lines, wrapped segments, and the mnemonic, value and scale ends in a curve's header. A stroke at 4.5:1 or more against the track background is drawn as stored. Below 4.5:1, its OKLCH lightness is mirrored (L → 1 − L) and its hue kept, then it is lifted only as far as 4.5:1 needs. A colour already on the light side is only lifted. Ratios are taken as quoted, to one decimal: pure red is 4.46:1 on the dark track, and the lifts below land between 4.48 and 4.52:1 once rounded to bytes. For example:

  | Stored | Drawn on dark |
  |---|---|
  | `#000000` (black) | `#FFFFFF` (white) |
  | `#330000` | `#EEA99F` |
  | `#0000CC` | `#437BFF` |
  | `#FF0000` (pure red) | stays red |
- **Fills.** A fill keeps its stored colour and alpha. A near-neutral fill (OKLCH chroma below 0.03) has its lightness mirrored, so a grey shale fill sits back on dark as it does on white.
- **Discrete styles and zones.** Lithology colours and hatches, and the zone palette, are drawn as stored in both themes. They are opaque, so they never sit on the track background.
- **Editing.** The colour control shows the stored colour. When the drawn colour differs, it adds a "drawn on dark as" swatch.
- **Where.** The colour maths is a pure function in `welllog/view`, memoised per stored colour and track background and tested on Node.

## Why

- **One file, any theme.** A template is shared as a file and applied to any well (ADR-0003). If colours depended on the viewer's theme, the same file would look different to different people, or every curve would need two colours.
- **As stored, the default template is unreadable on dark.**
  - 10 of its 15 curve colours fall below 3:1 against the dark track.
  - BS, PEF, ROP and RDEP (black and `#330000`) sit at 1.0–1.2:1.
- **Mirroring, not the smallest change.** The smallest lift turns black into mid grey (`#808080`), which reads as disabled. It also merges SP and RMIC into one blue. Mirroring keeps black the strongest ink and keeps different colours different.
- **4.5:1, not 3:1.** The header draws each curve's mnemonic and values in its colour, so the colour is used for text. If it has to change, it should change to something legible.
- **Light draws as stored.** Templates are written for white, so on light what you pick is what you see. Lifting there would turn the default RSHA orange (2.3:1 on white) brown.

## Considered options

- **As stored in every theme.** It needs no colour logic, but four of the default template's curves vanish on dark.
- **A light "paper" track in both themes.** Colours match the file exactly, but the log view becomes a bright slab inside a dark app. Even on a dimmed paper, CALI, RHOB, NPHI and DTS only reach 2.5–3.2:1.
- **Two colours per curve in the template, one per theme.** Every template author would have to pick twice, and the template format would need a new version.
- **Mirroring every fill.** Yellow would turn almost black and disappear.
