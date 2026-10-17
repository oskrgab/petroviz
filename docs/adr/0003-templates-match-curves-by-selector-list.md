# Templates match curves by a selector list

Each curve entry in a template finds its curve through an **ordered list of selectors**: `key`, `mnemonic` or `curve family`. The first selector that matches a curve in the well log wins, and an entry shows at most one curve. This was decided in [#28](https://github.com/oskrgab/petroviz/issues/28).

## Why

- **The current template is the layout model.** There is no second, already-matched layout: the log view derives what to draw from the current template and the well log with a pure function. Editing the layout edits the template, so switching wells keeps the layout and saving it is just writing it out. That only works if entries keep *how* they find a curve, not *which* curve they found on one well.
- **Mnemonics alone don't travel.** A template built on a FORCE 2020 well would show nothing on a LAS file that names the same curve `ILD`.
- **Curve families alone are too coarse.** A family can't tell two curves of the same family apart, and it can't say "this exact `GR:2`".
- **A list does both.** Picking a curve by hand writes `[key, mnemonic, family]`, which is exact on this well and falls back sensibly on others. The default template can write family-only entries.
- **One curve per entry.** An entry that turned into several curves would leave its fills and per-curve style ambiguous. Two entries may still match the same curve, for example to show GR on two scales.

## Consequences

- An entry that matches nothing stays in the template, greyed in its track header, so the next well can match it. Fills against an unmatched entry are skipped, and the track keeps its place.
- Fills refer to curve entries by a stable `id` within the template, never by mnemonic or position.
- Mnemonic selectors match case-insensitively and take the first curve in well log order.
- A family selector skips any curve that another entry in the same track matches by key or mnemonic. Without this, `[mnemonic RXO, family micro]` and `[mnemonic RMIC, family micro]` would draw RMIC twice in a well that has no RXO. Deliberate duplicates (GR on two scales) use key or mnemonic selectors, so they still work. Added by [#29](https://github.com/oskrgab/petroviz/issues/29).

## Considered options

- **Mnemonic only**, **curve family only**: see above.
- **A matched layout separate from the template**, converted to a template on save. This is two models to keep in sync, and the layout breaks whenever the well changes.
- **Family selectors that match every curve of the family** ("all resistivity"). Rejected for the fill and style ambiguity above.
