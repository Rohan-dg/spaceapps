# Lunar Site Compare

**Compare Moon south-pole landing sites and dates for sunlight (power) and direct-to-Earth visibility (comms).**
Built for a NASA Space Apps challenge. Mission planners, educators and the public can see, for any site and moment,
where the Sun and Earth sit relative to the *real terrain horizon*, how long until the next sunset or Earthset,
and a green/amber/red verdict with a plain-language reason.

![panels](docs/screenshot.png)

* **Explore:** pick a site, then scrub or play through time. The horizon panorama (or top-down sky plot) shows
  the terrain silhouette, the Sun and Earth at true angular size and their next-24 h paths. Metric cards give
  countdowns and per-lunar-day statistics. A 30-day timeline and a 3-year calendar heatmap with "best windows" sit underneath.
* **Compare:** set 2–4 scenarios (site + date) side by side, with verdicts, panoramas and a highlighted metric table.
* The URL hash keeps the current site, time and comparison, so links are shareable.
  Keyboard: <kbd>Space</kbd> play/pause, <kbd>←</kbd>/<kbd>→</kbd> ±1 h, <kbd>Shift</kbd>+arrows ±1 day.

## Why this is hard
The Moon's spin axis is tilted only ~1.54°, so at the south pole the Sun never climbs more than ~1.5° above the
local horizontal (a little more for sites slightly off the pole). Earth hangs near the horizon and moves about ±7° with libration.
There is no atmosphere, so no twilight and no refraction: a one-degree ridge decides whether you have power or radio.

## Run it
```bash
npm install
npm run dev          # http://localhost:5173
npm test             # Vitest: az/el conversion, horizon masking, countdown/run logic, calendar
npm run build        # static site in dist/
```
The precomputed data (`public/horizons`, `public/series`, `public/sites.json`) is committed, so nothing else is needed to run the app.

### Rebuild the data (one command)
```bash
pip install numpy
python scripts/build_horizons.py     # downloads LOLA DEMs (~500 MB) if missing, writes horizons, then runs the series precompute
#   --range-km 150 --observer-m 2 --synthetic --no-download --no-series
npm run series -- --start 2027-01-01 --end 2029-12-31 --step 30   # series only, custom range
```
Without network access and with no DEMs on disk, the script writes clearly labelled **synthetic** profiles and the app
shows a "SYNTHETIC TERRAIN" banner.

### Deploy
* **GitHub Pages:** `.github/workflows/deploy.yml` builds, tests and deploys on push to `main`
  (enable it under Settings → Pages → Source: GitHub Actions).
* **Vercel:** `vercel.json` is included; import the repo and deploy.
* The build uses a relative base (`./`), so `dist/` works from any sub-path.

## Data sources
| Data | Product | Resolution | Use |
|---|---|---|---|
| Terrain (polar) | LRO LOLA `LDEM_80S_40M`, polar stereographic, heights relative to a 1737.4 km sphere | 40 m/px | sites poleward of 82°S, 150 km horizon rays |
| Terrain (global) | LRO LOLA `LDEM_16`, simple cylindrical | 16 px/deg (~1.9 km/px) | Chandrayaan-3, Apollo 11, Chang'e-4 |
| Ephemeris | [astronomy-engine](https://github.com/cosinekitty/astronomy) (VSOP87 + lunar theory, IAU 2015 lunar rotation) | - | Sun and Earth vectors in the Moon-fixed frame |
| Validation | JPL Horizons API (DE441, `CENTER='coord@301'`) | - | accuracy check |

DEMs come from the NASA PDS Geosciences Node:
`https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/`.
Site coordinates and their sources are in `data/sites.json`. **Entries marked `"verify": true` must be checked against
the cited source.** Rim and summit sites with `snapRadiusM` are moved to the local DEM high point, and both the cited
and the used coordinates are shown in the app.

The math is documented in [docs/MATH.md](docs/MATH.md) and the design decisions in [DECISIONS.md](DECISIONS.md).

### Site summary (2027-01-01 to 2029-12-31, 30-min sampling)
| Site | Region | Lat | DEM | Sunlit | Earth visible | Verify |
|---|---|---|---|---|---|---|
| Connecting ridge | south-pole | 89.450°S | LDEM_80S_40M | 80.8% | 52.1% | yes |
| Shackleton rim | south-pole | 89.688°S | LDEM_80S_40M | 86.3% | 50.9% | yes |
| Shackleton floor | south-pole | 89.670°S | LDEM_80S_40M | 0.0% | 0.0% | no |
| de Gerlache rim | south-pole | 88.664°S | LDEM_80S_40M | 59.1% | 58.2% | yes |
| Malapert | south-pole | 85.991°S | LDEM_80S_40M | 57.6% | 100.0% | yes |
| Mons Mouton | south-pole | 84.790°S | LDEM_80S_40M | 45.0% | 82.0% | yes |
| Nobile rim | south-pole | 85.420°S | LDEM_80S_40M | 45.3% | 74.1% | yes |
| Haworth | south-pole | 87.450°S | LDEM_80S_40M | 0.0% | 0.0% | no |
| Faustini rim | south-pole | 87.994°S | LDEM_80S_40M | 48.1% | 48.6% | yes |
| Chandrayaan-3 | high-latitude | 69.373°S | LDEM_16 | 48.7% | 100.0% | no |
| Apollo 11 | equatorial | 0.674°N | LDEM_16 | 49.9% | 100.0% | no |
| Chang'e-4 | far-side | 45.445°S | LDEM_16 | 49.6% | 0.0% | no |

Sanity checks are printed by the precompute and all pass. Both PSR floors (Shackleton, Haworth) get 0% sun,
the far-side site (Chang'e-4) has 0% Earth visibility, near-pole rim and ridge sites are lit 59–86% of the time,
Malapert keeps Earth in view 100% of the time, and Apollo 11 is at ~50% sun as expected at the equator.

## Accuracy
`npm run validate` queries JPL Horizons at 10 site/time points (5 sites × 2 epochs, Sun and Earth each, so 20 comparisons)
and compares apparent azimuth and elevation for an observer on the lunar surface. Last run:

| Site | UT | Body | Horizons az | Horizons el | Ours az | Ours el | Δaz (°) | Δel (°) |
|---|---|---|---|---|---|---|---|---|
| Shackleton ridge | 2027-03-01 00:00 | Sun | 42.8199 | -0.1665 | 42.8194 | -0.1647 | -0.0005 | 0.0018 |
| Shackleton ridge | 2027-03-01 00:00 | Earth | 141.3328 | -6.6804 | 141.3331 | -6.6829 | 0.0003 | -0.0025 |
| Shackleton ridge | 2027-09-15 12:00 | Sun | 139.4553 | 0.6487 | 139.4538 | 0.6470 | -0.0015 | -0.0018 |
| Shackleton ridge | 2027-09-15 12:00 | Earth | 134.2466 | 3.3791 | 134.2459 | 3.3776 | -0.0007 | -0.0015 |
| Malapert massif | 2028-01-10 06:00 | Sun | 17.9329 | 4.2112 | 17.9310 | 4.2099 | -0.0019 | -0.0013 |
| Malapert massif | 2028-01-10 06:00 | Earth | 351.6515 | 8.0427 | 351.6507 | 8.0418 | -0.0008 | -0.0009 |
| Malapert massif | 2028-06-20 18:00 | Sun | 197.3126 | -4.4932 | 197.3113 | -4.4921 | -0.0013 | 0.0011 |
| Malapert massif | 2028-06-20 18:00 | Earth | 351.4780 | 8.8838 | 351.4778 | 8.8832 | -0.0002 | -0.0007 |
| de Gerlache rim | 2027-12-01 00:00 | Sun | 219.2010 | 0.1259 | 219.1999 | 0.1248 | -0.0010 | -0.0010 |
| de Gerlache rim | 2027-12-01 00:00 | Earth | 72.4118 | -2.3202 | 72.4117 | -2.3191 | -0.0001 | 0.0011 |
| de Gerlache rim | 2029-04-05 03:30 | Sun | 354.9546 | -0.0253 | 354.9510 | -0.0243 | -0.0036 | 0.0010 |
| de Gerlache rim | 2029-04-05 03:30 | Earth | 76.5757 | -0.0398 | 76.5732 | -0.0409 | -0.0025 | -0.0011 |
| Apollo 11 | 2027-05-05 00:00 | Sun | 78.0404 | -79.3723 | 78.0502 | -79.3722 | 0.0098 | 0.0001 |
| Apollo 11 | 2027-05-05 00:00 | Earth | 256.4986 | 59.8616 | 256.5014 | 59.8623 | 0.0028 | 0.0007 |
| Apollo 11 | 2028-11-11 11:00 | Sun | 268.8664 | -47.0830 | 268.8673 | -47.0846 | 0.0008 | -0.0015 |
| Apollo 11 | 2028-11-11 11:00 | Earth | 280.4554 | 62.7110 | 280.4568 | 62.7106 | 0.0014 | -0.0005 |
| Far side (Korolev) | 2027-07-07 07:00 | Sun | 272.8486 | 27.0654 | 272.8496 | 27.0635 | 0.0010 | -0.0019 |
| Far side (Korolev) | 2027-07-07 07:00 | Earth | 95.5709 | -71.6900 | 95.5687 | -71.6891 | -0.0022 | 0.0009 |
| Far side (Korolev) | 2029-02-14 20:00 | Sun | 277.2889 | 53.4675 | 277.2873 | 53.4664 | -0.0017 | -0.0011 |
| Far side (Korolev) | 2029-02-14 20:00 | Earth | 115.1824 | -67.2612 | 115.1805 | -67.2613 | -0.0019 | -0.0000 |

Max |Δel| = 0.0025°, max |Δaz·cos el| = 0.0036°

So the ephemeris and frame are good to **~0.004° (about 15″)**. This is far below the terrain uncertainty, which dominates:
the horizon angles from a 40 m/px DEM are good to roughly 0.1–0.3° near the observer, and the 1.9 km/px global DEM is much coarser.

If the network is blocked, run it later with:
```bash
NODE_USE_ENV_PROXY=1 npx tsx scripts/validate_horizons.ts
# raw query example:
curl "https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='10'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&CENTER='coord@301'&COORD_TYPE='GEODETIC'&SITE_COORD='222.69,-89.45,0'&TLIST='2027-03-01 00:00'&QUANTITIES='4'&ANG_FORMAT='DEG'&APPARENT='AIRLESS'"
```

## Limitations
* Terrain resolution: small ridges, boulders and lander-scale slopes are smoothed out. The observer height is 2 m;
  real masts (10 m or more) see considerably more Sun.
* "Sunlit" means the Sun's *centre* is above the terrain. The visible-disk fraction is stored but not used in the verdicts.
  Earth "visible" also means its centre. Antenna masks, link budgets and relays are not modelled.
* Verdicts summarise one synodic month (29.53 d) from the selected time. Thresholds are in `src/config/thresholds.ts`.
* Precomputed range: 2027-01-01 to 2029-12-31 UTC. Countdowns beyond that read "beyond data range".
* The Moon is treated as a sphere of radius 1737.4 km, matching the LOLA reference.
* Several site coordinates are approximate (flagged). This is not a mission-planning tool of record.

## Credits
NASA Lunar Reconnaissance Orbiter LOLA team and the PDS Geosciences Node (Washington University in St. Louis), NASA/JPL Solar
System Dynamics (Horizons), NASA Moon Trek and LROC QuickMap (site context), and astronomy-engine by Don Cross (MIT).

*This project uses publicly available NASA data. NASA does not endorse any non-U.S. Government entity and is not
responsible for information contained on non-U.S. Government websites.*
