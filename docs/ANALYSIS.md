# What decides sunlight and Earth visibility? All 12 sites analysed

Data: the 12 original sites in `public/` (the flown and planned mission sites added later are not part of this analysis), 2027-01-01 to 2029-12-31 UTC,
52,608 samples per site at 30-minute steps, plus each site's 360° terrain horizon. Reproduce with
`npx tsx scripts/site_analysis.ts --ids connecting-ridge,shackleton-rim,shackleton-floor,de-gerlache-rim,malapert,mons-mouton,nobile-rim,haworth,faustini-rim,chandrayaan-3,apollo-11,change-4`.
Raw outputs are in `data/analysis/`.

## The variable

| | |
|---|---|
| **Name** | **Terrain clearance**, written C |
| **Formula** | C_body(t) = el_body(t) − h(az_body(t)) |
| **Units** | degrees (°) |
| **Meaning** | How far the Sun's (or Earth's) centre is above the terrain horizon *in the exact compass direction it is in at that moment* |
| **Rule** | C > 0 means visible (sunlit, or Earth in view). C ≤ 0 means blocked |
| **Sunlight %** | share of time with C_sun > 0 |
| **Earth in view %** | share of time with C_earth > 0 |
| **Accuracy** | Computing the share of time with C > 0 from scratch reproduces the stored sunlight and Earth percentages for all 12 sites to within 0.06 percentage points (Table 4) |

No single fixed property of a site (latitude, elevation, mean horizon) can stand in for C. It always compares two moving quantities:
where the body is in the sky, and how high the terrain is in that direction.

## Inputs needed to calculate C

| # | Input | Symbol | Units | Source | Where in this repo |
|---|---|---|---|---|---|
| 1 | Site latitude | φ | ° (south negative) | Cited site coordinates, moved onto the local high point | `public/sites.json` → `lat` |
| 2 | Site longitude | λ | ° east | Same | `public/sites.json` → `lon` |
| 3 | Observer height above the 1737.4 km sphere | z | m | LOLA DEM height + 2 m mast | `public/horizons/<id>.json` → `siteHeightM`, `observerHeightM` |
| 4 | Time | t | UTC | You choose it | - |
| 5 | Sun direction from the site | az_sun, el_sun | ° | Ephemeris (astronomy-engine, checked against JPL Horizons to 0.004°) from φ, λ, z, t | `src/lib/ephemeris.ts` `skyAt()` |
| 6 | Earth direction from the site | az_earth, el_earth | ° | Same | same |
| 7 | Terrain horizon profile | h(az) | °, 360 values (1 per degree of azimuth) | Rays traced 150 km over NASA LRO LOLA DEM (40 m/px polar, 1.9 km/px global) | `public/horizons/<id>.json` → `horizonDeg` |

For the app's ratings, two more numbers come from C over the next 29.53 days (`src/config/thresholds.ts`):

| Rating | Uses | Good | Marginal | Poor |
|---|---|---|---|---|
| Solar power | % time C_sun > 0; longest run with C_sun ≤ 0 | ≥ 70% **and** longest dark ≤ 100 h | ≥ 40% **or** longest dark ≤ 200 h | otherwise |
| Radio link to Earth | % time C_earth > 0; longest run with C_earth ≤ 0 | ≥ 90% **and** longest gap ≤ 24 h | ≥ 40% **or** longest gap ≤ 120 h | otherwise |

## Table 1: Every site, all inputs (full 3-year range)

| Site | Region | Lat (°) | Lon (°E) | Height (m) | Horizon mean (°) | Horizon max (°) | Sun el. min → max (°) | Earth el. min → max (°) |
|---|---|---|---|---|---|---|---|---|
| Connecting ridge | pole | −89.450 | 222.69 | 1,955 | −1.29 | 0.07 | −2.08 → 2.06 | −7.55 → 6.24 |
| Shackleton rim | pole | −89.688 | 197.32 | 1,730 | −1.52 | 1.33 | −1.84 → 1.83 | −7.40 → 6.32 |
| Shackleton floor | pole | −89.670 | 129.78 | −2,789 | 21.34 | 23.57 | −1.88 → 1.87 | −7.30 → 6.43 |
| de Gerlache rim | pole | −88.678 | 291.55 | 1,805 | −1.13 | 1.49 | −2.85 → 2.88 | −6.78 → 7.22 |
| Malapert | pole | −85.964 | 357.68 | 4,992 | −2.16 | 0.94 | −5.58 → 5.62 | −3.12 → 10.65 |
| Mons Mouton | pole | −84.791 | 29.20 | 5,322 | 1.17 | 4.05 | −6.76 → 6.78 | −2.78 → 11.39 |
| Nobile rim | pole | −85.421 | 31.62 | 6,417 | −0.44 | 6.17 | −6.13 → 6.15 | −3.42 → 10.73 |
| Haworth | pole | −87.450 | 355.04 | −3,320 | 7.01 | 10.31 | −4.09 → 4.14 | −4.61 → 9.16 |
| Faustini rim | pole | −87.749 | 95.08 | 553 | −0.13 | 2.09 | −3.81 → 3.80 | −7.48 → 6.63 |
| Chandrayaan-3 | high latitude | −69.373 | 32.32 | 536 | 1.09 | 2.22 | −22.18 → 22.20 | 9.16 → 24.93 |
| Apollo 11 | equator | 0.674 | 23.47 | −1,922 | 0.06 | 0.92 | −89.90 → 89.94 | 57.91 → 74.34 |
| Chang'e-4 | far side | −45.445 | 177.60 | −5,929 | 1.05 | 2.80 | −46.08 → 46.08 | −51.51 → −37.37 |

Every other column is in `data/analysis/sites_all.csv` (40 columns per site).

## Table 2: Every site, the variable and the outcomes

| Site | Mean C_sun (°) | **Sunlit %** | Longest dark (h) | Mean C_earth (°) | **Earth in view %** | Longest no-Earth (h) | Both at once % |
|---|---|---|---|---|---|---|---|
| Connecting ridge | +1.30 | **80.8** | 219 | +0.31 | **52.2** | 337 | 44.1 |
| Shackleton rim | +1.53 | **86.3** | 75 | +0.04 | **50.9** | 352 | 45.5 |
| Shackleton floor | −21.33 | **0.0** | all | −22.11 | **0.0** | all | 0.0 |
| de Gerlache rim | +1.14 | **73.0** | 316 | +0.36 | **52.4** | 335 | 41.8 |
| Malapert | +2.17 | **68.7** | 403 | +7.45 | **100.0** | 0 | 68.8 |
| Mons Mouton | −1.16 | **45.1** | 458 | +5.67 | **82.0** | 138 | 37.7 |
| Nobile rim | +0.45 | **49.9** | 530 | +2.93 | **64.3** | 260 | 28.5 |
| Haworth | −6.99 | **0.0** | all | −7.41 | **0.0** | all | 0.0 |
| Faustini rim | +0.13 | **55.7** | 444 | −0.54 | **48.1** | 363 | 26.9 |
| Chandrayaan-3 | −1.10 | **48.7** | 380 | +15.55 | **100.0** | 0 | 48.8 |
| Apollo 11 | −0.21 | **49.9** | 356 | +65.06 | **100.0** | 0 | 49.9 |
| Chang'e-4 | −1.01 | **49.6** | 365 | −45.85 | **0.0** | all | 0.0 |

## Table 3: Which variable explains the outcome? (Pearson r)

r runs from −1 to +1; ±1 is a perfect straight-line link. "All" covers 12 sites; "Polar" covers the 9 south-pole sites. With so few sites, read these as indications, not proof.

| Candidate variable | vs Sunlit % (all) | (polar) | vs Earth % (all) | (polar) |
|---|---|---|---|---|
| Latitude | −0.02 | −0.09 | 0.25 | 0.58 |
| Longitude | −0.40 | −0.41 | −0.24 | −0.11 |
| Site height | 0.47 | 0.60 | 0.64 | **0.92** |
| Horizon mean | −0.82 | −0.83 | −0.58 | −0.75 |
| Horizon max | −0.83 | −0.86 | −0.59 | −0.72 |
| Sun elevation max | −0.03 | −0.10 | 0.25 | 0.58 |
| Earth elevation mean | −0.02 | −0.17 | 0.63 | 0.51 |
| Terrain toward the Sun | −0.82 | −0.83 | −0.58 | −0.75 |
| Terrain toward Earth | −0.83 | −0.84 | −0.65 | −0.85 |
| Mean clearance C_sun | 0.82 | 0.83 | 0.58 | 0.75 |
| Mean clearance C_earth | 0.21 | 0.72 | 0.77 | 0.89 |
| **Share of time C_sun > 0** | **1.00** | **1.00** | | |
| **Share of time C_earth > 0** | | | **1.00** | **1.00** |

## Table 4: Check that C reproduces the stored values

| Site | Sunlit % (stored) | Share of time C_sun > 0 | Earth % (stored) | Share of time C_earth > 0 |
|---|---|---|---|---|
| Connecting ridge | 80.82 | 80.83 | 52.15 | 52.11 |
| Shackleton rim | 86.27 | 86.23 | 50.91 | 50.90 |
| Shackleton floor | 0.00 | 0.00 | 0.00 | 0.00 |
| de Gerlache rim | 73.03 | 73.06 | 52.42 | 52.46 |
| Malapert | 68.74 | 68.80 | 100.00 | 100.00 |
| Mons Mouton | 45.06 | 45.10 | 81.98 | 81.95 |
| Nobile rim | 49.91 | 49.89 | 64.31 | 64.32 |
| Haworth | 0.00 | 0.00 | 0.00 | 0.00 |
| Faustini rim | 55.73 | 55.73 | 48.14 | 48.11 |
| Chandrayaan-3 | 48.73 | 48.75 | 100.00 | 100.00 |
| Apollo 11 | 49.85 | 49.85 | 100.00 | 100.00 |
| Chang'e-4 | 49.60 | 49.62 | 0.00 | 0.00 |

The small differences come from sampling every 2 hours here instead of every 30 minutes.

## Table 5: How the app rates each site, over every possible start day (1,065 per site)

| Site | Power Good / Marginal / Poor (%) | Radio Good / Marginal / Poor (%) |
|---|---|---|
| Connecting ridge | 60.7 / 32.7 / 6.6 | 0 / 100 / 0 |
| Shackleton rim | 77.9 / 22.1 / 0 | 0 / 100 / 0 |
| Shackleton floor | 0 / 0 / 100 | 0 / 0 / 100 |
| de Gerlache rim | 58.2 / 21.2 / 20.6 | 0 / 100 / 0 |
| Malapert | 32.9 / 67.1 / 0 | 100 / 0 / 0 |
| Mons Mouton | 0 / 73.7 / 26.3 | 0 / 100 / 0 |
| Nobile rim | 1.9 / 55.7 / 42.5 | 0 / 100 / 0 |
| Haworth | 0 / 0 / 100 | 0 / 0 / 100 |
| Faustini rim | 0.2 / 80.1 / 19.7 | 0 / 100 / 0 |
| Chandrayaan-3 | 0 / 100 / 0 | 100 / 0 / 0 |
| Apollo 11 | 0 / 100 / 0 | 100 / 0 / 0 |
| Chang'e-4 | 0 / 100 / 0 | 0 / 0 / 100 |

The rating for every day is in `data/analysis/daily_ratings.csv`.

## What this shows

1. **Latitude does not predict sunlight** (r = −0.02). Both the best site (Shackleton rim, 86%) and the worst (Shackleton floor, 0%) are at 89.7°S, about 1 km apart.
2. **Terrain alone is not enough either.** Connecting ridge's horizon never rises above 0.07°, yet the site is dark 19% of the time, because the Sun dips to −2.1°. You have to compare the Sun's position with the terrain *in its direction*, and that is exactly C.
3. **For Earth, height is the best single proxy at the pole** (r = 0.92): Malapert, Mons Mouton and Nobile sit 5–6.4 km up on the Earth-facing side. But C_earth is what decides it. Chang'e-4 is 0% because Earth is always 37–52° below its horizon.
4. **Away from the pole the answer is about 50/50 sunlight whatever the terrain** (normal day/night). Earth visibility is then all-or-nothing: near side 100%, far side 0%.

<!-- SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 2 commits), under the team's direction. Attribution from the commit history. -->
