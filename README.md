# Lunar Site Compare

Sunlight and Earth visibility for Moon south-pole landing sites, computed on real LRO LOLA terrain.

Built for the NASA Space Apps Challenge 2026: [Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).

![Lunar Site Compare](https://raw.githubusercontent.com/Rohan-dg/spaceapps/claude/lunar-site-compare-kurzka/docs/screenshot.png)

Near the lunar south pole the Sun never climbs far above the horizon, and Earth hangs low and drifts with libration. There is no atmosphere and no twilight, so a single ridge decides whether a lander has power and a direct radio link. For any site and time, the app shows where the Sun and Earth sit against the actual terrain horizon, and for how long.

## Features

- **Skyline and overhead views.** The terrain horizon with the Sun and Earth at true angular size, and their paths over the next 24 hours.
- **Countdowns and verdicts.** Time to the next sunrise, sunset, Earthrise and Earthset, with a power and comms rating for the next lunar day.
- **Calendar.** A 30-day strip and a three-year heat map (2027 to 2029) that marks the best landing windows.
- **Compare.** Two to four site-and-date scenarios side by side.
- **Custom coordinates.** Any point south of 80.5°S, computed in the browser from a 400 m terrain model (approximate).
- **3D terrain.** 24 × 24 km around each polar site, lit from the true Sun direction.
- **3D Moon.** The whole Moon down to 5 m LOLA detail at polar sites. A *Light dark areas* switch floodlights the night side and shadowed craters, and clicking any point shows its coordinates, how much of the Sun is visible, whether Earth is in view, and the share of the next lunar cycle with each.
- **Rover range.** Enter coordinates (or click the Moon), the rover's battery life without sunlight and its speed, and see the distance it can drive on one charge as rings on the 3D Moon: one way, and out and back. It also checks the battery against the longest dark stretch at that point.
- **Export and share.** CSV or JSON export. The URL keeps the site, time and comparison.

## Sites

Share of time from 2027-01-01 to 2029-12-31, for an observer 2 m above the surface.

| Site | Latitude | Sunlit | Earth visible |
|---|---|--:|--:|
| Connecting ridge | 89.45°S | 80.8% | 52.1% |
| Shackleton rim | 89.69°S | 86.3% | 50.9% |
| Shackleton floor | 89.67°S | 0.0% | 0.0% |
| de Gerlache rim | 88.66°S | 59.1% | 58.2% |
| Malapert | 85.99°S | 57.6% | 100.0% |
| Mons Mouton | 84.79°S | 45.0% | 82.0% |
| Nobile rim | 85.42°S | 45.3% | 74.1% |
| Haworth | 87.45°S | 0.0% | 0.0% |
| Faustini rim | 87.99°S | 48.1% | 48.6% |
| Chandrayaan-3 | 69.37°S | 48.7% | 100.0% |
| Apollo 11 | 0.67°N | 49.9% | 100.0% |
| Chang'e-4 | 45.45°S | 49.6% | 0.0% |

Coordinates and their sources are in [`data/sites.json`](https://github.com/Rohan-dg/spaceapps/blob/claude/lunar-site-compare-kurzka/data/sites.json). Entries marked `verify` still need checking against the cited source.

## Run locally

The app source is on the `claude/lunar-site-compare-kurzka` branch.

```bash
git clone -b claude/lunar-site-compare-kurzka https://github.com/Rohan-dg/spaceapps.git
cd spaceapps
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # static site in dist/
```

The precomputed horizon and visibility data is committed, so nothing else is needed. To rebuild it from the raw LOLA elevation models (about 500 MB download):

```bash
pip install numpy
python scripts/build_horizons.py
```

## Data

| Data | Source |
|---|---|
| Polar terrain | LRO LOLA `LDEM_80S_40M`, 40 m/px |
| Global terrain | LRO LOLA `LDEM_16`, about 1.9 km/px |
| Sun and Earth positions | [astronomy-engine](https://github.com/cosinekitty/astronomy) |
| Validation | JPL Horizons (DE441) |

## Accuracy

Sun and Earth positions match JPL Horizons to within 0.004° at 20 test points (`npm run validate`). Terrain is the larger source of error: roughly 0.1 to 0.3° near the observer on the 40 m polar grid, and much coarser on the global grid. See [MATH.md](https://github.com/Rohan-dg/spaceapps/blob/claude/lunar-site-compare-kurzka/docs/MATH.md) and [validation_results.md](https://github.com/Rohan-dg/spaceapps/blob/claude/lunar-site-compare-kurzka/docs/validation_results.md).

## Limitations

- The observer is 2 m above the ground. A taller mast sees more Sun.
- "Sunlit" and "visible" mean the centre of the Sun or Earth is above the terrain.
- Antenna patterns, link budgets and relay satellites are not modelled.
- Some site coordinates are approximate. This is not a mission-planning tool of record.

## Credits

NASA LRO LOLA team and the PDS Geosciences Node, NASA/JPL Solar System Dynamics (Horizons), NASA Moon Trek, LROC QuickMap, and astronomy-engine by Don Cross.

This project uses publicly available NASA data. NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites.

Apache License 2.0. See [LICENSE](LICENSE).
