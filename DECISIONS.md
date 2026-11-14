# Decisions log

| # | Decision | Why |
|---|---|---|
| 1 | Moon-fixed frame = IAU 2015 rotation model from astronomy-engine (`RotationAxis`) | Built into the required library; matches Horizons' MEAN_ME frame to <0.004° in our validation. |
| 2 | Sun aberration applied (first order), Earth light-time/aberration ignored | Effects are ≤0.006° / ≤0.0002°, much smaller than the terrain uncertainty. |
| 3 | Spherical Moon, R = 1737.4 km | LOLA reference sphere; DEM heights are relative to it. |
| 4 | Network: the NASA hosts were blocked by the sandbox policy; created a personal environment allowing them | Needed for the real DEM and Horizons validation. |
| 5 | The Horizons API host is `ssd.jpl.nasa.gov/api/horizons.api` (the brief's `ssd-api.jpl.nasa.gov` is the documentation host and returns 404 for the API) | Verified by fetching the docs. |
| 6 | Validation and precompute scripts are TypeScript run with `tsx` (not .mjs/.py) | Reuses the exact same math module as the app, so one code path is validated. |
| 7 | "Earth visible" = Earth centre above terrain horizon; "sunlit" = Sun centre above horizon, disk fraction also stored | Simple, explainable, and standard in the illumination literature, which uses disk fraction. |
| 8 | DEM: LOLA `LDEM_80S_40M` (40 m/px, polar stereographic) for sites poleward of 82°S; `LDEM_16` (16 px/deg, ~1.9 km/px) for Chandrayaan-3, Apollo 11 and Chang'e-4 | 40 m is the brief's 20–60 m/px class and covers every polar site plus 150 km of terrain around it (462 MB). The global product is enough where the Sun climbs well above the terrain. |
| 9 | Horizon ray range is 150 km, not the brief's 30–50 km | Distant massifs matter at grazing angles. Malapert, for example, is 5 km high and ~120 km from Shackleton, and still stands ~0.4° above the curvature-dropped horizon. Steps grow with distance (max(res/2, 0.3%·d)). |
| 10 | Exact spherical geometry for terrain elevation angles, not the bare d²/2R term | It equals the d²/2R formula to second order and stays exact at 150 km. |
| 11 | Rim/summit sites whose cited point lands on a slope get `snapRadiusM`: the analysis point moves to the highest DEM cell within that radius (Shackleton rim 600 m, Malapert 280 m, de Gerlache rim 5.0 km, Faustini rim 4.5 km). The cited and used coordinates are both shown | A point 140 m down an inner crater wall is not where anyone would land. Two of these coordinates were approximations to begin with (`verify: true`). |
| 12 | The series is stored as run-length encoded visibility plus base64 Int16 elevations (0.01°) and a Uint8 solar-disk fraction, about 350 KB per site for 3 years at 30 min | Run-lengths make sunset/sunrise countdowns an O(log n) binary search, and the file loads lazily per site. |
| 13 | Sanity rule "rims are highly lit" applies only within ~1.6° of the pole | Nobile (4.6° out) and Faustini (2° out) are expected to be ~45–50% lit, consistent with the literature. |
| 14 | Verdicts look forward one synodic month (29.53 d) from the selected time; gaps cut by the window edge are shown with "≥" / "(at least)" | "Percent of the lunar day" needs a defined window, and a forward window answers "what if we land now?" |
| 15 | Verdict reasons describe the *middle* of the longest gap (edges trimmed by 15%) | At a gap's edges the body is by definition on the skyline, which made reasons say "−0.8° vs −0.8°". |
| 16 | Countdowns refine the 30-min series crossing by bisection on the live ephemeris (~30 s precision) | Cheap (a dozen ephemeris calls) and avoids ±30 min jitter in the headline numbers. |
| 17 | Early deploy = a private claude.ai Artifact of `dist/`; GitHub Pages workflow and `vercel.json` are included but need the repo owner to enable Pages / import into Vercel | The session may only push to its feature branch, and Pages deploys from `main`. |
| 18 | Compare panoramas share one vertical scale only when it doesn't stretch any scenario's range by more than 1.8× | An equatorial site's 70° Sun would otherwise flatten polar terrain into a line. |
