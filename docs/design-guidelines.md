# Design guidelines shared with petrodb

petroviz and the petrodb site are siblings. A visitor who moves from one to the
other should see the same family: the same type, the same header and footer,
and the same colour for the same fluid. This file is the one place those shared
rules are written down, for both repos to point to.

## What both sites share

- **Typefaces.** IBM Plex Sans for text, and IBM Plex Mono for data: values,
  scale ends, axis labels and the header's nav links.
- **Header.** From the left: a logo tile, the site's name in lowercase, a rule,
  then the nav links in mono. The GitHub icon and the theme toggle sit on the
  right. Each site's nav links to the other, so a visitor is one click away
  from either: petrodb's says "Explore in petroviz", and petroviz's says
  "petrodb ↗". petroviz's opens in a new tab, so a visualization's state (an
  opened LAS file, say) is still there when the visitor comes back.
- **Footer.** "Made with ❤️ by Oscar Cortez", beside a line that credits the
  other site. petroviz shows its footer on the welcome page only, so the
  visualizations keep their full height for data.
- **Fluid colours.** A quantity looks the same on both sites:

  | Fluid | Light     | Dark      | petroviz token  | petrodb token |
  | ----- | --------- | --------- | --------------- | ------------- |
  | Oil   | `#16a34a` | `#22c55e` | `--color-oil`   | `--oil`       |
  | Water | `#0ea5e9` | `#38bdf8` | `--color-water` | `--water`     |
  | Gas   | `#f59e0b` | `#fbbf24` | `--color-gas`   | `--gas`       |

- **Chart headers.** Every chart header follows the log view's curve track
  header: the curve's name between the two ends of its scale, over a rule in
  the curve's colour. In the log view that rule is a sample of the curve's
  line, with its width and dash. A scale that several curves share sits over
  a thin neutral rule. Scale ends are in mono.
- **Themes.** Both sites have a light and a dark theme, switched from the
  header and remembered in the browser.

## What each site keeps its own

- **Neutrals and accent.** petroviz is slate with a sky accent (the water
  colour) and a green logo tile. petrodb is log-paper grey-green with an amber
  accent and an amber tile.
- **Surfaces.** Decided on 2026-11-15 (#63): each site keeps the style that fits
  its purpose, and neither moves toward the other.
  - petroviz is for analysing data, so it aims for practical, clear charts and
    the best interface it can give for working with them. Its production
    dashboard keeps its panels: rounded cards that group each chart with its
    controls.
  - petrodb shows how to get the data in code, with a glimpse of what parts of
    it look like. Its pages are for reading, so they stay flat, with rules
    between sections and no boxes.

## Changing a shared rule

Change both sites together, then update this file. The shared parts live in:

| Part           | petroviz                                                   | petrodb                                      |
| -------------- | ---------------------------------------------------------- | -------------------------------------------- |
| Type, colours  | `src/app.css`                                              | `site/src/app.css`                           |
| Header, footer | `src/lib/components/AppHeader.svelte`, `SiteFooter.svelte` | `site/src/routes/+layout.svelte`             |
| Chart headers  | `src/lib/welllog/view/kinds/curve/Header.svelte`           | `site/src/lib/components/CurveHeader.svelte` |
