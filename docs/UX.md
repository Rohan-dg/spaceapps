# First-time-user UX pass

Goal: a judge who has never heard of libration should understand what the app does and get a result within 30 seconds.

## Audit: the top 5 problems in the first 30 seconds (before this pass)

1. **The answer was below the fold.** The Good / Marginal / Poor verdicts, which are the whole point, sat under a 330 px chart and a 30-day strip.
   At 1440 × 900 a judge saw a site list, a wall of time buttons and an abstract chart, but no conclusion.
2. **Unlabelled icon columns.** The site list headers "Now" and "Verdict" had only `title` tooltips. Two tiny icons per column (sun/globe, then two
   triangles or checks) had no legend, so nobody could tell which icon meant power and which meant comms.
3. **Too many equal-weight controls.** Seven step buttons (−10 d … +10 d), a speed dropdown, a datetime field and a range slider all had the same
   visual weight. There was no single obvious thing to do first. The slider had no label saying what it was for.
4. **Jargon without help.** Skyline, Overhead, elevation, clearance over the skyline, azimuth, direct-to-Earth comms, lunar day, "height stretched 8.5×",
   UTC, and a dense one-paragraph chart caption explaining dashed vs dotted vs ruled lines. Some terms had hover help (`Term`), but most of the
   controls had none.
5. **No entry point or guided path.** No "how to use", no example scenarios (the good ones lived only in `docs/DEMO.md`), and the strongest
   storytelling (ridge vs rim, the far side, permanent shadow) needed manual setup. Loading states were plain grey text, and power-user panels
   (3-year heatmap, raw readout table, CSV export, full coordinates) all competed with the core view.

## What changed

| Area | Change |
|---|---|
| Entry point | **How to use** guide (`Guide.tsx`) opens on the first visit (not for shared `#` links) and is always reachable from the header button or the <kbd>?</kbd> key. It holds the 30-second quick start, a legend drawn with the same marks as the chart, and six one-click examples. |
| Examples | **Try an example** bar under the header with four preset chips (`lib/presets.ts`): sunny ridge, wait 10 days, ridge vs rim, power vs radio trade-off. |
| Guided layout | The screen *is* the quick start: numbered **1 Pick a landing site → 2 Pick a moment → 3 Read the answer**. |
| Answer first | New `Summary` panel right after the time controls: *Right now* (in sunlight / Earth hidden, with countdowns) plus two traffic-light cards, **Solar power** and **Radio link to Earth**, each with the plain question it answers. |
| Progressive disclosure | Time: Play, ±1 day and the date are visible; ±1 h, ±10 d, speed and shortcuts sit behind **More controls**. The heatmap, readout table and export live under **Go deeper** tabs. Site coordinates and source are under a disclosure. The compare numbers table is collapsed. |
| Microcopy | "One site / Side by side" → **Explore a site / Compare sites**; "Skyline / Overhead / 3D terrain" → **Horizon view / Sky from above / 3D landscape**, each with a one-line caption; "Elevation" → **Height above the flat horizon**; "Clearance over the skyline" → **Clears the mountains by**; "Three years, day by day" → **Find the best landing dates**; "Method & sources" → **Data & method**. |
| Inline help | `HelpTip` `?` icons on the site list columns, rating rules, UTC, view switcher, height exaggeration, best-stretch ranking and readout rows. Existing `Term` glossary tooltips are kept. |
| Legend | The paragraph under the horizon chart is replaced by a visual legend: mountains, Sun, Earth, behind terrain, next 24 h, flat horizon. |
| States | Shared `Loading` component (spinner and specific message) for the initial data, each site, the compare columns and the lazy 3D view. Friendlier "3D not available for this site" message. |
| Mobile | The header help button shortens to "Help", the example chips scroll horizontally, and the answer cards stack. No horizontal page scroll at 390 px. |

No science, data or calculations changed. Verdict thresholds are untouched (`src/config/thresholds.ts`). The rating help text quotes them.
