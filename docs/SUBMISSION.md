# Project page: text to paste, and the submission checklist

Each section below matches a field on the team's Space Apps **Project** tab (My Team, then Project, then Edit), in the order of the [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/). Every field must be filled in, and all content must be in English.

## Project Name

Sol Teris

## High-Level Project Summary

Sol Teris shows, for any landing site and date, where the Sun and Earth sit against the real terrain skyline. Near the Moon's south pole the Sun never rises far above the horizon and Earth hangs low and drifts with libration. There is no atmosphere and no twilight, so a single ridge decides whether a lander has solar power and a direct radio link to Earth. Sol Teris traces each site's 360° skyline from NASA LRO LOLA terrain and computes the Sun's and Earth's positions over three years, checked against JPL Horizons. It then shows when each one rises and sets, how long it stays up, and a power and radio rating for the coming lunar day. Sites and dates can be compared side by side, and any point on the Moon can be checked. That turns a slow specialist calculation into a quick comparison for mission planners, educators and the public.

## Link to Project Demo

Upload the 30-second video (script in [docs/DEMO.md](DEMO.md)) or a deck of at most 7 slides, set it to public or "anyone with the link", and paste that link here. Test it in a private browser window first.

## Link to Final Project

- Live app: <https://lunar-site-compare.cuda.workers.dev>
- Source code (Apache 2.0): <https://github.com/Rohan-dg/spaceapps>

## Detailed Project Description

**What it does.** Pick a landing site and a time. Sol Teris shows:

- the terrain skyline seen from the site, with the Sun and Earth at their true size and position, as a panorama, a sky plot and a first-person view you can turn and tilt;
- whether the site is sunlit and whether Earth is in view right now, the Sun's and Earth's elevation, and the time to the next sunrise, sunset, Earthrise and Earthset;
- a power and radio rating for the next lunar day (share of time sunlit, longest dark spell, share of time Earth is in view, longest blackout);
- a 30-day strip and a three-year calendar (2027 to 2029) that marks the best landing windows;
- side-by-side comparison of up to four site-and-date scenarios;
- a mission comparison sidebar: pick any two missions, flown or planned, and compare them on the same criteria (sunlight, Earth contact, longest night and the battery to survive it, radio blackouts, good landing days) with a long-run efficiency score whose weights are shown;
- a 3D Moon with real LOLA relief, down to 5 m near the south-pole sites, lit by the true Sun direction;
- a rover-range and launch-window planner built on the same results.

The sites include the Artemis III candidate regions at the south pole (each at a published, cited coordinate) and flown and planned missions from Apollo and CLPS to Chang'e, Chandrayaan-3, SLIM and Luna, including upcoming NASA CLPS deliveries (Griffin Mission One, IM-3, IM-4, IM-5, Blue Ghost 2 to 4, APEX 1.0, Blue Moon MK1) and Chang'e-7 and -8, Chandrayaan-4 and Luna 27. Unpublished landing points use the announced target region and are marked as such. Any other point on the Moon can be entered by coordinates or by clicking the 3D Moon.

**How it works.** For each site, a ray is traced every degree of azimuth for 150 km over the LOLA terrain from an observer 2 m above the ground, with the Moon's curvature included. This gives the skyline. Sun and Earth positions come from astronomy-engine, rotated into the IAU Moon-fixed frame, so libration is included. There is no atmosphere, so there is no refraction. Visibility is sampled every 30 minutes over three years, and rise and set times are refined to about a minute. Positions agree with JPL Horizons (DE441) to within 0.004° at every test point.

**Benefits.** Choosing a polar landing site and date comes down to sunlight for power and line of sight to Earth for communication. Sol Teris makes that trade-off visible in seconds: for example, the ridge between Shackleton and de Gerlache is sunlit 81% of the time but sees Earth only half the time, while Malapert keeps Earth in view all the time with less sunlight.

**What we hope to achieve.** A tool that mission teams can use to shortlist landing dates, and that teachers and the public can use to see why some polar ridges are almost always lit while nearby craters never are.

**Tools.** TypeScript, React, three.js, D3, GSAP and astronomy-engine for the app (built with Vite, tested with Vitest); Python with NumPy, SciPy and Pillow for the terrain processing; hosted as static files on Cloudflare Workers.

## Use of Super Intelligence (SI)

Yes. We used Claude (Anthropic), a large language model, as a coding assistant. Most of the code, the build and data-processing scripts, the documentation and the Sol Teris emblem and logo were written with it, under our direction. Commits made with it carry a "Co-Authored-By: Claude" line, `package.json` and the page metadata state it, and the app's About panel and README describe it. The emblem on the opening screen is labelled as SI-generated artwork. Every number in the app is computed by that code from NASA terrain data and the ephemeris; none is produced by a language model. No NASA logos, flags or mission insignia are used.

## NASA Data

- **LRO LOLA gridded topography** (PDS Geosciences Node): `LDEM_80S_40M` (40 m/px, south pole) and `LDEM_16` (about 1.9 km/px, global) for every skyline, rating and calendar value; `LDEM_80S_80M` and the 5, 10 and 20 m polar products for the 3D terrain. <https://pds-geosciences.wustl.edu/missions/lro/lola.htm>
- **JPL Horizons** (DE441): used to check the Sun and Earth positions. <https://ssd.jpl.nasa.gov/horizons/>
- **NASA SVS CGI Moon Kit**: LOLA relief and LROC WAC colour for the 3D Moon. <https://svs.gsfc.nasa.gov/4720>
- **LROC** (Arizona State University, for NASA LRO): the IM-2 Athena landing position. <https://lroc.im-ldi.com/images/1408>
- **NASA Moon Trek** and **LROC QuickMap**, for site context.

## Space Agency Partner Data and Other References

Data from other agencies is not used directly. Landing positions of other agencies' missions (Chang'e, Chandrayaan-3, SLIM, Luna) come from their published sources, cited per site in [`data/sites.json`](https://github.com/Rohan-dg/spaceapps/blob/main/data/sites.json).

Site coordinates:

- Bussey et al. (2010), *Icarus* 208, 558-564, doi:10.1016/j.icarus.2010.03.028 (Shackleton rim, de Gerlache rim)
- Mazarico et al. (2011), *Icarus* 211, 1066-1081, doi:10.1016/j.icarus.2010.10.030 (connecting ridge)
- Gläser et al. (2014), *Icarus* 243, 78-90, doi:10.1016/j.icarus.2014.08.013, and Gläser et al. (2018), *Planetary and Space Science* 162, 170-178, doi:10.1016/j.pss.2017.07.006
- Kring et al. (2025), *JGR Planets* 130, e2024JE008905, doi:10.1029/2024JE008905 (Malapert)
- Beyer et al. (2025), *Planetary Science Journal* 6, 236, doi:10.3847/PSJ/ae061a (Nobile rim, VIPER)
- Wueller et al. (2026), *JGR Planets* 131, e2025JE009434, doi:10.1029/2025JE009434 (Faustini rim)

Open-source software: astronomy-engine (MIT), three.js (MIT), React (MIT), D3 (ISC), GSAP (GSAP Standard "No Charge" License), Vite (MIT), TypeScript (Apache 2.0), Vitest (MIT), NumPy and SciPy (BSD), Pillow (MIT-CMU), Inter typeface (SIL Open Font License). Our own code is under the Apache License 2.0.

## How the challenge's objectives are covered

| Objective in the challenge | Where in Sol Teris |
|---|---|
| Curated sites and custom coordinates | Site list (south-pole candidates plus flown and planned missions); "Custom point" by coordinates, or by clicking the 3D Moon |
| Side-by-side comparison | Compare: up to four site-and-date scenarios; Missions sidebar: any two missions, past or future, with a long-run verdict |
| Date and time flexibility | Time slider, step buttons, date entry, three-year calendar |
| Sun and Earth relative to the horizon | Horizon view: Panorama, Sky plot and First person |
| Time to sunset or Earthset | Summary: "Sun sets in", "Sets in" (Earth), and rise times when below |
| Solar elevation shown prominently | Summary: solar elevation next to the skyline angle it is compared against |
| Sunlight duration and Earth visibility windows | Next 30 days strip, three-year calendar, power and radio ratings |
| 2D and 3D views | Panorama, sky plot, first person (2D); 3D Moon and terrain (3D) |
| Animations and timelines | Play, timeline, Sun and Earth paths |
| Content for all skill levels | How to use guide, plain-language ratings, term explanations, About panel (data, method and limits) |
| No atmospheric refraction | Not applied (the Moon has no atmosphere), see docs/MATH.md |
| Libration | Included through the IAU Moon-fixed rotation (docs/MATH.md) and shown in its own **Libration & orbit** tool, the first tab of Detailed analysis: Earth's ±8°/±7° wobble, perigee to apogee distance, the Sun's ±1.5° seasonal swing, and whether libration hides Earth at the site or is the only reason it is ever in view |

## Checklist before pressing "Submit for Judging"

- [ ] Every required field above is filled in, in English.
- [ ] The demo link opens without a login in a private window, and the video is 30 seconds or less (or the deck has at most 7 slides).
- [ ] The final project link (live app) and the GitHub link open without a login.
- [ ] Every team member appears on the team's **Members** tab, the team has at most 6 people, and everyone is registered for the same Local Event (not waitlisted).
- [ ] The terms and originality checkboxes on the project form are ticked.
- [ ] **Submit for Judging** is pressed before **Sunday, November 15, 2026, 11:59 pm local time** of our Local Event. Saving progress is not submitting.
- [ ] Optional: request a FortiGuard Web Filter Classification for the live app's domain, so school or office networks don't block it for judges (see the Project Submission Guide).
