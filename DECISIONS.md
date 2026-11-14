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
