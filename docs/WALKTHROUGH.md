# 90-second live walkthrough

This is for presenting the app live, for example at the Local Event. It is **not** the submitted demo: the Project Demo must be 30 seconds or less (or at most 7 slides), see [DEMO.md](DEMO.md).

Open the app (it starts on the opening scene below; first-time visitors see the How to use guide, so press **Start exploring**), or use the direct links. All times are UTC.
Each link is a URL hash, so append it to the deployed URL.

| t | Action | What to say |
|---|---|---|
| 0:00 | **Explore a site** view, **Connecting ridge**, 2027-07-08 00:00 (default). Point at the Horizon view. | "This is the real skyline at the ridge between Shackleton and de Gerlache, from NASA's LOLA laser altimeter. The vertical axis is stretched about 8×. The whole sky band that matters is a couple of degrees tall." |
| 0:12 | Point at the Sun disk and the **Right now: In sunlight** card (Sun at −0.7° but still lit). | "The Sun is *below* the flat horizon, yet we're in sunlight, because the ridge looks down over lower ground. A flat-horizon model would get this wrong." |
| 0:22 | Point at the Earth marker under the terrain and the **Radio link to Earth: Marginal** card. | "Earth is behind the terrain. Over the next lunar day it's visible only 47% of the time, with a 12-day blackout. Sunny, but Earth comes and goes." |
| 0:32 | Click **Compare sites** (or the **Ridge vs. crater rim** example chip). Scenario A is the ridge; set B to **de Gerlache rim** at the same time. | "A rim about 40 km away, at the same moment: the Sun is 1.9° below level and the skyline hides it. Sunrise is about two and a half days away." |
| 0:45 | In scenario A, press **+10 d**. | "Slip the landing ten days. We're now at the tail of the ridge's one long night, and sunrise is under a day away. The next lunar day ahead is 97% lit, so the power verdict flips from amber to green. Same site, different week, different answer." |
| 0:58 | Set B to **Malapert**. | "Malapert, a 5 km mountain on the Earth-facing side, keeps Earth in view 100% of the time but gets less sun. That's the power-versus-comms trade-off." |
| 1:08 | Click **Add a plan** and set C to **Chang'e-4**. | "And the far side: the comms verdict is red. Earth never rises, so you need a relay satellite." |
| 1:15 | Back to **Explore a site**, scroll to **Go deeper → Best landing dates** and click an entry under **Best 14-day stretches**. | "For mission planning, this calendar shows three years of daily sunlight and Earth visibility. Click a window and the whole view jumps there." |
| 1:25 | Click **About** (the i button). | "Every number comes from NASA LOLA terrain and an ephemeris we validated against JPL Horizons to 0.004°. Approximations are labelled. Thanks!" |

Direct links:
* Opening scene: `#site=connecting-ridge&t=1815004800000&mode=explore`
* Comparison: `#site=connecting-ridge&t=1815004800000&mode=compare&cmp=connecting-ridge@1815004800000|de-gerlache-rim@1815004800000`

Back-up facts (from `npm run demo-detail -- connecting-ridge@2027-07-08T00:00Z ...`):
* Ridge, 2027-07-08 00:00: Sun −0.71° and lit; next sunset in 6 d 10 h. Earth −3.9° and hidden. Power amber (85%, longest dark 4.4 d), comms amber (47%).
* Ridge, 2027-07-18: in shadow, sunrise in about 20 h. Power green (97% over the next 29.5 d; the remaining dark is about 20 h, shown as "≥" because the window starts inside it).
* de Gerlache rim, 2027-07-08: dark (Sun −1.94°), sunrise in 2 d 11 h; power amber (67% sunlit over the next lunar day), comms amber (46%).
* Malapert, 2027-07-08: Sun −3.46° and dark, sunrise in 3 d 22 h; Earth +0.56° and in view. Comms green (Earth 100%), power amber (66%). Chang'e-4: comms red (Earth never rises). Shackleton floor: 0% sun (permanent shadow).

<!-- SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history. -->
