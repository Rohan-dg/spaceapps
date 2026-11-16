# Math: from ephemeris to "is the Sun above that ridge?"

All code lives in `src/lib/` (`vec.ts`, `geometry.ts`, `ephemeris.ts`, `horizon.ts`) and is
unit-tested in `src/lib/__tests__/`.

## 1. Sun and Earth positions (inertial, J2000 / EQJ)
Using [`astronomy-engine`](https://github.com/cosinekitty/astronomy) (VSOP87 / truncated ELP lunar theory):

* **Sun as seen from the Moon:** `S = −HelioState(Moon, t).position`.
  Stellar aberration from the Moon's heliocentric velocity *v* (≈30 km/s, ≈20″) is applied to first
  order: `ŝ_app = normalize(ŝ + v/c)`. Light time to the Sun (≈8.3 min) does not matter in a
  heliocentric frame because the Sun hardly moves.
* **Earth as seen from the Moon:** `E = −GeoMoon(t)`. Light time (≈1.3 s) and relative aberration
  (≈0.7″) are ignored.

## 2. Inertial → Moon-fixed (selenographic) frame
astronomy-engine's `RotationAxis(Moon, t)` returns the IAU WGCCRE-2015 rotation elements:
pole right ascension α₀, declination δ₀, and prime-meridian angle W (these include the
physical-libration series terms). The rotation is the standard IAU one:

```
r_fixed = Rz(W) · Rx(90° − δ₀) · Rz(90° + α₀) · r_EQJ
```
(passive frame rotations). The IAU frame differs from the LOLA **Mean-Earth / polar-axis (ME)**
frame used by the DEM and by JPL Horizons by well under 0.01°, which our Horizons comparison confirms.

Libration (optical + physical) is not modelled separately: it is simply the result of
expressing the true Earth vector in the true Moon-fixed frame. The Earth's selenographic
latitude swings by about ±6.7°, so from near the south pole Earth bobs up and down about the horizon.

## 3. Site and local horizon frame (East-North-Up)
The Moon is a sphere with R = 1737.4 km. A site at planetocentric latitude φ, east longitude λ,
height h:

```
p = (R+h) [cosφ cosλ, cosφ sinλ, sinφ]
ê = [−sinλ, cosλ, 0]
n̂ = [−sinφ cosλ, −sinφ sinλ, cosφ]
û = [cosφ cosλ, cosφ sinλ, sinφ]
```
For a target at Moon-fixed position T, `d = T − p` (this subtraction is the **topocentric
parallax**, ≈0.26° for Earth, negligible for the Sun), then

```
azimuth   = atan2(d·ê, d·n̂)       (clockwise from north, 0–360°)
elevation = asin(d·û / |d|)
```
There is no atmosphere, so **no refraction**. At the south pole "north" means the direction
toward the near side along the local meridian (the 0° and 180° meridians point to azimuths 0° and 180° when seen from
just off the pole).

Apparent radii: `asin(R_body / distance)`. The Sun is about 0.267° and Earth about 0.95°.

## 4. Terrain horizon (scripts/build_horizons.py)
For each azimuth α (1° steps), march outward from the site in the DEM's polar-stereographic
plane. For each sample at ground distance *d* with terrain height *z*, the elevation angle seen
from an observer at height `z₀ + 2 m` is

```
θ(d) = atan2( z − (z₀+2) − d²/(2R),  d )
```
where `d²/2R` is the drop of the surface below the observer's tangent plane due to lunar curvature
(≈259 m at 30 km). The horizon is `H(α) = max_d θ(d)`, out to the configured range.

## 5. Visibility
* **Earth visible (comms):** Earth's centre is above the terrain horizon, `el_E > H(az_E)`.
* **Sunlit (power):** the fraction of the solar disk above the horizon line, using the
  circular-segment area with x = (el − H)/r:
  `f = 1 − (acos x − x√(1−x²))/π`.
  A sample counts as "sunlit" when the Sun's centre is above the horizon (f > 0.5). We also store f.

## 6. Accuracy
`npm run validate` compares 10 site/time points (20 Sun/Earth pairs) with JPL Horizons (DE441,
`CENTER='coord@301'`). Max error is about 0.004° (see `docs/validation_results.md`). This is far smaller
than the terrain uncertainty (DEM resolution → horizon errors of ~0.05–0.3°).

## Libration and orbital variation tool

`src/lib/libration.ts` reads the same Moon-fixed Earth and Sun vectors. The sub-Earth point
(lon = atan2(y, x), lat = asin(z / |E|)) is the optical libration, checked against
astronomy-engine's `Libration()` to 0.3°. Its measured periods are the anomalistic month
(27.55 d, longitude and distance) and the draconic month (27.21 d, latitude); the sub-solar
latitude repeats every eclipse year (about 346.6 d). For a site, the tool compares Earth's real
track against the skyline with a counterfactual Earth held at its mean position (selenographic
0°, 0°, 384,400 km). Shackleton rim: hidden without libration, in view 44 % of a cycle with it.
Connecting ridge: always in view without libration, 47 % with it.

<!-- SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 2 commits), under the team's direction. Attribution from the commit history. -->
