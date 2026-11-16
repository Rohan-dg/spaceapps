/**
 * GLSL for the 3D Moon. Three surfaces share one lighting model:
 *   globe  : whole Moon, LROC colour + LOLA relief normals (equirectangular), north of 80°S
 *   cap    : 80°S to the pole, LOLA 148 m heights on the polar stereographic grid
 *   patch  : the selected site, LOLA 5/10/20 m heights, plus procedural craters below the data resolution
 *
 * Cast shadows are real: each pixel marches toward the Sun across the height maps (the same idea the app
 * uses for its horizon profiles), and the visible fraction of the 0.53° solar disc sets the light.
 * Light = Lommel-Seeliger/Lambert mix (the "lunar-Lambert" law), a small opposition surge, and earthshine.
 *
 * Anti-aliasing: every height lookup takes the screen footprint (metres per pixel, `fp`) and reads the
 * prefiltered mip level that matches it (the height textures carry a box-filtered mip chain). Normals use
 * finite differences at max(texel, footprint), shadow edges soften with footprint over occluder distance,
 * and each procedural layer fades out before it drops below about two pixels.
 *
 * Precision: world km at 1737 km has ~0.1 m float resolution, too coarse for metre-scale detail and for
 * fwidth(). The globe and cap therefore pass vRel, the position relative to an anchor near the camera
 * snapped to a 2048 m lattice (exact integers on the CPU), so cell ids are exact and footprints are clean.
 */

export const COMMON = /* glsl */ `
#define PI 3.141592653589793
#define DEG 0.017453292519943295
#define ANCHOR_M 2048.0
const float R_M = 1737400.0;
const float SUN_R = 0.00465;          // solar angular radius, rad
uniform vec3 uSun;                    // unit, Moon-fixed
uniform vec3 uEarthDir;               // unit, Moon-fixed
uniform float uEarthshine;
uniform float uSunPower;
uniform float uFill;                  // 0..1: viewer-side floodlight that ignores shadows (shows dark areas)
uniform sampler2D uColor;
uniform sampler2D uNormal;
uniform sampler2D uEqH;               // equirect heights, metres
uniform sampler2D uCap;               // polar cap heights, metres
uniform float uCapHalf;               // metres
uniform float uCapRes;                // metres per pixel
uniform float uCapOn;
uniform sampler2D uHi;                // site patch heights, metres
uniform float uHiOn;
uniform float uHiRes;
uniform float uHiOff;
uniform vec2 uHiRC0;                  // (row0, col0) of the window in the source product
uniform float uHiN;
uniform float uRelief;
uniform float uShadows;
uniform float uDetail;                // 0..1, procedural detail below the data resolution
uniform float uMarch;                 // 0..1, share of the full shadow-march steps (lowered on slow GPUs)
uniform vec3 uAnchorIdx;              // anchor, Moon-fixed, in whole units of ANCHOR_M
uniform vec3 uAnchorKm;               // the same anchor in km, rounded to float32
uniform vec3 uAnchorCorr;             // metres: (float32 anchor) minus (exact anchor)
uniform vec3 uCamRel;                 // camera relative to the anchor, metres

vec3 enuE(float lon) { return vec3(-sin(lon), cos(lon), 0.0); }
vec3 enuN(float lat, float lon) { return vec3(-sin(lat) * cos(lon), -sin(lat) * sin(lon), cos(lat)); }
vec3 enuU(float lat, float lon) { return vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat)); }
vec3 toENU(vec3 v, float lat, float lon) { return vec3(dot(v, enuE(lon)), dot(v, enuN(lat, lon)), dot(v, enuU(lat, lon))); }

/** Position (km, Moon-fixed) to metres relative to the anchor, without losing precision. */
vec3 anchorRel(vec3 pKm) { return (pKm - uAnchorKm) * 1000.0 + uAnchorCorr; }

vec2 stereo(float lat, float lon) { float r = 2.0 * R_M * tan((0.5 * PI + lat) * 0.5); return vec2(r * sin(lon), r * cos(lon)); }
vec2 stereoLL(vec2 xy) { float r = length(xy); return vec2(2.0 * atan(r / (2.0 * R_M)) - 0.5 * PI, atan(xy.x, xy.y)); }

/** Mip level whose texels match a footprint of fp metres on a map of texel metres per pixel. */
float lodFor(float fp, float texel) { return log2(max(fp, texel) / texel); }

vec2 eqUV(float lat, float lon) { return vec2((lon + PI) / (2.0 * PI), (0.5 * PI - lat) / PI); }
float eqTexel() { return PI * R_M / float(textureSize(uEqH, 0).y); }
float hEq(float lat, float lon, float fp) { return textureLod(uEqH, eqUV(lat, lon), lodFor(fp, eqTexel())).r; }
vec2 capUV(vec2 xy) { return vec2(xy.x + uCapHalf, uCapHalf - xy.y) / (2.0 * uCapHalf); }
vec2 hiUV(vec2 xy) {
  vec2 cr = vec2(xy.x / uHiRes + uHiOff - uHiRC0.y, uHiOff - xy.y / uHiRes - uHiRC0.x);
  return (cr + 0.5) / uHiN;
}
bool inBox(vec2 uv, float m) { return all(greaterThan(uv, vec2(m))) && all(lessThan(uv, vec2(1.0 - m))); }

/** Height (m) at a polar stereographic point, filtered to fp metres: site patch, then cap, then the global map. */
float hPolar(vec2 xy, float fp) {
  if (uHiOn > 0.5) { vec2 u = hiUV(xy); if (inBox(u, 0.0)) return textureLod(uHi, u, lodFor(fp, uHiRes)).r; }
  vec2 c = capUV(xy);
  if (uCapOn > 0.5 && inBox(c, 0.0)) return textureLod(uCap, c, lodFor(fp, uCapRes)).r;
  vec2 ll = stereoLL(xy);
  return hEq(ll.x, ll.y, fp);
}
/** Height (m) at a latitude/longitude, picking the finest map that covers it. */
float hAt(float lat, float lon, float fp) {
  if (lat < -80.0 * DEG) return hPolar(stereo(lat, lon), fp);
  return hEq(lat, lon, fp);
}

/**
 * Shadow edge for one march sample: the solar disc, widened by how much the horizon angle of an occluder
 * at distance d changes across one footprint, so terminator shadows do not sparkle when zoomed out.
 */
float discVis(float el, float a, float fp, float d) {
  float w = SUN_R + min(0.12 * fp / d, 0.015);
  return smoothstep(-w, w, el - a);
}

/**
 * Visible fraction of the solar disc from a polar point, by marching toward the Sun (horizon method).
 * Each sample reads heights filtered to the larger of the pixel footprint and half the step length, so the
 * result does not depend on exactly where the (footprint-scaled) samples land.
 */
float sunVisPolar(vec2 xy, float lon, float h0, vec3 s, float d0, float fp) {
  float el = asin(clamp(s.z, -1.0, 1.0));
  if (el < -0.06) return 0.0;
  if (uShadows < 0.5) return smoothstep(-SUN_R, SUN_R, el);
  vec2 hd = normalize(s.xy + 1e-9);
  float cl = cos(lon), sl = sin(lon);
  vec2 g = vec2(hd.x * cl + hd.y * sl, -hd.x * sl + hd.y * cl);   // east/north -> grid x/y
  int steps = max(12, int(72.0 * uMarch));
  float k = exp(max(log(180000.0 / d0), 0.0) / float(steps));
  float d = d0, vis = 1.0;
  for (int i = 0; i < 72; i++) {
    if (i >= steps) break;
    float h = hPolar(xy + g * d, max(fp, 0.5 * d * (k - 1.0)));
    vis = min(vis, discVis(el, atan((h - h0) / d - d / (2.0 * R_M)), fp, d));
    if (vis < 0.002) return 0.0;
    d *= k;
  }
  return vis;
}

/** Same, on the latitude/longitude map (marches into the polar maps when it crosses 80°S). */
float sunVisEq(float lat, float lon, float h0, vec3 s, float d0, float fp) {
  float el = asin(clamp(s.z, -1.0, 1.0));
  if (el < -0.06) return 0.0;
  if (uShadows < 0.5) return smoothstep(-SUN_R, SUN_R, el);
  vec2 hd = normalize(s.xy + 1e-9);
  int steps = max(12, int(48.0 * uMarch));
  float k = exp(max(log(220000.0 / d0), 0.0) / float(steps));
  float d = d0, vis = 1.0, cl = max(cos(lat), 0.02);
  for (int i = 0; i < 48; i++) {
    if (i >= steps) break;
    float la = lat + hd.y * d / R_M, lo = lon + hd.x * d / (R_M * cl);
    float h = hAt(la, lo, max(fp, 0.5 * d * (k - 1.0)));
    vis = min(vis, discVis(el, atan((h - h0) / d - d / (2.0 * R_M)), fp, d));
    if (vis < 0.002) return 0.0;
    d *= k;
  }
  return vis;
}

/**
 * Extra slope gain under a high Sun. With the Sun near the zenith, slopes barely change the incidence
 * angle, so the lit side reads flat; this lifts the relief there and leaves the terminator (s.z < 0.25) alone.
 */
float reliefGain(float sz) { return 1.0 + 1.1 * smoothstep(0.25, 0.85, sz); }

/** Bowl crater with a raised rim; x = distance / radius. Returns (height m, dh/d(distance)). */
vec2 craterProfile(float x, float rad, float fresh) {
  float depth = rad * mix(0.04, 0.34, fresh * fresh);   // depth/diameter 0.02..0.17, mostly old and soft
  float rimH = depth * mix(0.15, 0.4, fresh), w = 0.32;
  float xi = min(x, 1.0);
  float rim = exp(-((x - 1.0) * (x - 1.0)) / (w * w));
  float h = depth * (xi * xi - 1.0) + rimH * rim;
  float dh = (x < 1.0 ? depth * 2.0 * x : 0.0) + rimH * rim * (-2.0 * (x - 1.0) / (w * w));
  return vec2(h, dh / rad);
}

vec3 shade(vec3 albedo, vec3 n, vec3 s, vec3 v, vec3 e, float vis) {
  // The WAC mosaic is photometrically normalised and flat; a mild luminance contrast curve (gamma 1.25
  // about the mean) keeps maria, highlands and ray systems apart under a full Sun.
  float lum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  albedo *= pow(max(lum, 1e-4) / 0.32, 0.25);
  float mu0 = max(dot(n, s), 0.0);
  float mu = max(dot(n, v), 0.0);
  float ls = mu0 / max(mu0 + mu, 1e-4);
  float sunTerm = (0.35 * 2.0 * ls + 0.65 * mu0) * vis;
  float g = acos(clamp(dot(s, v), -1.0, 1.0));
  float phase = 1.0 + 0.15 * exp(-g / 0.08);
  vec3 c = albedo * vec3(1.0, 0.98, 0.94) * uSunPower * sunTerm * phase;
  float me = max(dot(n, e), 0.0) * smoothstep(-0.05, 0.05, e.z);
  c += albedo * vec3(0.62, 0.7, 0.9) * uEarthshine * me;
  // light scattered from nearby sunlit ground keeps shadows from going pure black
  float bounce = 0.035 * clamp(s.z * 4.0 + 0.12, 0.0, 1.0) * (1.0 - 0.6 * vis) * (0.6 + 0.4 * n.z);
  c += albedo * uSunPower * bounce;
  // floodlight: a lamp at the viewer, so night-side and permanently shadowed ground become readable
  c += albedo * vec3(0.92, 0.95, 1.0) * uFill * (0.3 + 0.7 * mu);
  return c;
}

`;

const HEAD_V = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
`;
const HEAD_F = /* glsl */ `
#include <logdepthbuf_pars_fragment>
`;
const FRAG_ONLY = /* glsl */ `
/** Equirect texture coordinate without a seam at ±180° (Tarini's trick). */
vec2 seamlessUV(float lat, float lon) {
  float x = (lon + PI) / (2.0 * PI);
  float ua = x, ub = fract(x + 0.5) - 0.5;
  float u = fwidth(ua) <= fwidth(ub) + 1e-7 ? ua : ub;
  return vec2(u, (0.5 * PI - lat) / PI);
}
`;
const TAIL_F = /* glsl */ `
  #include <logdepthbuf_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

/*
 * Sub-texel detail for the globe and cap: fBm slopes and albedo mottling plus small craters, seeded in
 * Moon-fixed metres on power-of-two lattices (ANCHOR_M / 2^k), so the pattern is fixed to the ground while
 * orbiting and continuous across the globe/cap seam. Cell ids are the anchor's integer index times 2^k
 * plus floor(vRel / cell), which stays exact at any zoom.
 */
const DETAIL = /* glsl */ `
uvec3 pcg3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 hash3i(ivec3 p, uint seed) {
  uvec3 sd = uvec3(seed * 0x9E3779B9u, seed * 0x85EBCA6Bu, seed * 0xC2B2AE35u);
  return vec3(pcg3(uvec3(p + ivec3(16777216)) ^ sd)) * (1.0 / 4294967296.0);
}
float hash1i(ivec3 p, uint seed) { return hash3i(p, seed).x; }

/** Integer cell of size ANCHOR_M / 2^k containing the point, and the position inside it (0..1). */
ivec3 cellOf(vec3 rel, int k, out vec3 f) {
  float c = ANCHOR_M / float(1 << k);
  vec3 q = rel / c, fl = floor(q);
  f = q - fl;
  return ivec3(round(uAnchorIdx)) * (1 << k) + ivec3(fl);
}

/** 3D value noise, wavelength ANCHOR_M / 2^k: (value -1..1, gradient per metre). */
vec4 vnoise3(vec3 rel, int k, uint seed) {
  vec3 f;
  ivec3 i = cellOf(rel, k, f);
  float c = ANCHOR_M / float(1 << k);
  vec3 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = hash1i(i, seed), b = hash1i(i + ivec3(1, 0, 0), seed);
  float cc = hash1i(i + ivec3(0, 1, 0), seed), d = hash1i(i + ivec3(1, 1, 0), seed);
  float e = hash1i(i + ivec3(0, 0, 1), seed), ff = hash1i(i + ivec3(1, 0, 1), seed);
  float g = hash1i(i + ivec3(0, 1, 1), seed), h = hash1i(i + ivec3(1, 1, 1), seed);
  float k1 = b - a, k2 = cc - a, k3 = e - a, k4 = a - b - cc + d;
  float k5 = a - cc - e + g, k6 = a - b - e + ff, k7 = -a + b + cc - d + e - ff - g + h;
  float v = a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
  vec3 gr = du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
                      k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
                      k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y);
  return vec4(2.0 * v - 1.0, 2.0 * gr / c);
}

/**
 * One layer of craters on a 3D lattice of cell c = ANCHOR_M / 2^k. Each cell may hold one crater whose
 * rim stays within half a cell of its centre, so the 2x2x2 nearest cells are enough. The ground cuts each
 * crater's sphere of influence, so craters centred off the surface show smaller and shallower, which
 * widens the size mix. Returns (tangent slope, Moon-fixed; ejecta brightness).
 */
vec4 craters3(vec3 rel, int k, uint seed, vec3 up, float fp) {
  float c = ANCHOR_M / float(1 << k);
  vec3 f;
  ivec3 i0 = cellOf(rel, k, f);
  ivec3 st = ivec3(step(0.5, f)) * 2 - 1;
  vec4 acc = vec4(0.0);
  for (int n = 0; n < 8; n++) {
    ivec3 o = ivec3(n & 1, (n >> 1) & 1, (n >> 2) & 1) * st;
    ivec3 id = i0 + o;
    vec3 r = hash3i(id, seed);
    if (r.x > 0.6) continue;
    float rad = c * (0.06 + 0.2 * r.y * r.y);            // <= 0.26 c, so 1.9 rad < 0.5 c
    float q = smoothstep(0.7 * fp, 2.0 * fp, 0.32 * rad);   // rim narrower than about a pixel: fade out
    if (q <= 0.0) continue;
    vec3 dv = (f - (hash3i(id, seed + 7u) + vec3(o))) * c;
    float rho = length(dv), x = rho / rad;
    if (x > 1.9) continue;
    vec2 pr = craterProfile(x, rad, r.z);
    vec3 g = rho > 1e-6 ? dv / rho * pr.y : vec3(0.0);
    g -= dot(g, up) * up;
    float ej = r.z * r.z * exp(-((x - 1.15) * (x - 1.15)) / 0.2);   // bright halo on fresh craters
    acc += q * vec4(g, ej);
  }
  return acc;
}

/**
 * Detail below the data: returns (dh/dEast, dh/dNorth, albedo factor). nTexel is the metres per texel of
 * the data that already supplies the relief, cTexel that of the colour. Every octave fades in only below
 * its data texel and fades out by footprint before Nyquist, so nothing shimmers and nothing pops.
 */
vec3 subTexel(vec3 rel, float fp, vec3 up, vec3 E, vec3 N, float nTexel, float cTexel) {
  if (uDetail < 0.001) return vec3(0.0, 0.0, 1.0);
  vec3 g = vec3(0.0);
  float alb = 0.0;
  for (int k = 0; k < 14; k++) {
    float lam = ANCHOR_M / float(1 << k);
    float wq = smoothstep(2.0 * fp, 5.0 * fp, lam);
    if (wq < 0.001) break;
    float wn = wq * smoothstep(nTexel, 0.5 * nTexel, lam);
    float wa = wq * smoothstep(cTexel, 0.5 * cTexel, lam);
    if (wn + wa < 0.001) continue;
    vec4 nz = vnoise3(rel, k, uint(k) + 11u);
    g += nz.yzw * (0.02 * lam) * wn;
    alb += nz.x * 0.035 * wa;
  }
  for (int k = 0; k < 12; k++) {
    float c = ANCHOR_M / float(1 << k);
    if (0.32 * 0.26 * c < 0.7 * fp) break;                 // every crater in this layer is below a pixel
    float wl = smoothstep(2.5 * nTexel, 1.5 * nTexel, c);  // only craters the data cannot show
    if (wl < 0.001) continue;
    vec4 cr = craters3(rel, k, uint(k) * 31u + 5u, up, fp);
    g += cr.xyz * wl;
    alb += cr.w * 0.12 * wl;
  }
  g -= dot(g, up) * up;
  return vec3(dot(g, E) * uDetail, dot(g, N) * uDetail, 1.0 + alb * uDetail);
}
`;

/* ---------------- globe ---------------- */
export const GLOBE_V = /* glsl */ `
${HEAD_V}
${COMMON}
uniform float uExag;
varying vec3 vDir;
varying vec3 vRel;
void main() {
  vec3 d = normalize(position);
  float lat = asin(clamp(d.z, -1.0, 1.0)), lon = atan(d.y, d.x);
  float h = textureLod(uEqH, eqUV(lat, lon), 0.0).r;
  vec3 p = d * (R_M + h * uExag) / 1000.0;
  vDir = d;
  vRel = anchorRel(p);
  vec4 w = modelMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

export const GLOBE_F = /* glsl */ `
${HEAD_F}
${COMMON}
${FRAG_ONLY}
${DETAIL}
varying vec3 vDir;
varying vec3 vRel;
uniform sampler2D uTileMask;   // 72 x 36, one texel per 5-degree tile: 1 where a real-terrain tile is drawn
void main() {
  vec3 d = normalize(vDir);
  float lat = asin(clamp(d.z, -1.0, 1.0)), lon = atan(d.y, d.x);
  if (uCapOn > 0.5 && lat < -80.05 * DEG) discard;
  if (textureLod(uTileMask, eqUV(lat, lon), 0.0).r > 0.5) discard;
  float fp = max(length(fwidth(vRel)), 1e-3);   // metres per pixel on the ground
  vec2 uv = seamlessUV(lat, lon);
  vec3 s = toENU(uSun, lat, lon);
  float gs = reliefGain(s.z);
  vec3 albedo = texture(uColor, uv).rgb;
  vec3 nt = texture(uNormal, uv).xyz * 2.0 - 1.0;
  nt.z = max(nt.z, 0.05);
  float cTex = PI * R_M / float(textureSize(uColor, 0).y);
  float nTex = PI * R_M / float(textureSize(uNormal, 0).y);
  vec3 dt = subTexel(vRel, fp, d, enuE(lon), enuN(lat, lon), nTex, cTex);
  vec3 n = normalize(vec3(nt.xy * uRelief * gs - dt.xy * gs * nt.z, nt.z));
  albedo *= dt.z;
  vec3 v = toENU(normalize(uCamRel - vRel), lat, lon);
  vec3 e = toENU(uEarthDir, lat, lon);
  float vis = 1.0;
  if (dot(n, s) > 0.0 && s.z < 0.45) {
    float h0 = hEq(lat, lon, fp);
    vis = sunVisEq(lat, lon, h0 + 30.0, s, max(fp * 1.5, 900.0), fp);
  } else if (s.z < -0.06) vis = 0.0;
  gl_FragColor = vec4(shade(albedo, n, s, v, e, vis), 1.0);
  ${TAIL_F}
}`;

/* ---------------- real-terrain tiles (LOLA ldem_64 from the CGI Moon Kit) ---------------- */
/*
 * One mesh per 5-degree tile, built on the CPU from the tile's 321 x 321 LOLA heights (true scale; uExag adds
 * the optional exaggeration along the vertical). Slopes, shading and near-field shadows come from the same
 * heights per pixel, read at the mip that matches the screen footprint. Positions are km relative to the tile
 * centre, so precision holds at any zoom.
 */
export const TILE_V = /* glsl */ `
${HEAD_V}
attribute vec2 aUV;     // 0..1 across the tile, v = 0 on the north edge
attribute vec3 aUp;     // unit outward direction of the sphere at the vertex
attribute float aH;     // terrain height, metres
uniform float uExag;
varying vec2 vUV;
varying vec3 vLoc;      // km, relative to the tile centre
varying vec3 vW;        // km, Moon-fixed
void main() {
  vUV = aUV;
  vec3 p = position + aUp * (aH * (uExag - 1.0) / 1000.0);
  vLoc = p;
  vW = (modelMatrix * vec4(p, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}`;

export const TILE_F = /* glsl */ `
${HEAD_F}
${COMMON}
uniform sampler2D uTH;    // tile heights, metres (corner-registered, mipmapped)
uniform sampler2D uTC;    // tile colour (LROC WAC 16k)
uniform vec3 uTileLL;     // north edge latitude, west edge longitude, tile size (radians)
uniform float uTileN;     // samples per edge minus one
varying vec2 vUV;
varying vec3 vLoc;
varying vec3 vW;

float tileTexel() { return uTileLL.z * R_M / uTileN; }
vec2 texUV(vec2 f) { return (f * uTileN + 0.5) / (uTileN + 1.0); }
bool inTile(vec2 f) { return all(greaterThanEqual(f, vec2(0.0))) && all(lessThanEqual(f, vec2(1.0))); }
/** Height from this tile where it covers the point, else from the global and polar maps. */
float hAny(float la, float lo, float fp) {
  vec2 f = vec2((lo - uTileLL.y) / uTileLL.z, (uTileLL.x - la) / uTileLL.z);
  if (inTile(f)) return textureLod(uTH, texUV(f), lodFor(fp, tileTexel())).r;
  return hAt(la, lo, fp);
}
float sunVisTile(float lat, float lon, float h0, vec3 s, float d0, float fp) {
  float el = asin(clamp(s.z, -1.0, 1.0));
  if (el < -0.06) return 0.0;
  if (uShadows < 0.5) return smoothstep(-SUN_R, SUN_R, el);
  vec2 hd = normalize(s.xy + 1e-9);
  int steps = max(12, int(56.0 * uMarch));
  float k = exp(max(log(220000.0 / d0), 0.0) / float(steps));
  float d = d0, vis = 1.0, cl = max(cos(lat), 0.02);
  for (int i = 0; i < 56; i++) {
    if (i >= steps) break;
    float la = lat + hd.y * d / R_M, lo = lon + hd.x * d / (R_M * cl);
    float h = hAny(la, lo, max(fp, 0.5 * d * (k - 1.0)));
    vis = min(vis, discVis(el, atan((h - h0) / d - d / (2.0 * R_M)), fp, d));
    if (vis < 0.002) return 0.0;
    d *= k;
  }
  return vis;
}
void main() {
  float lat = uTileLL.x - vUV.y * uTileLL.z, lon = uTileLL.y + vUV.x * uTileLL.z;
  float fp = max(length(fwidth(vLoc)) * 1000.0, 1e-3);   // metres per pixel on the ground
  float tN = tileTexel(), cl = max(cos(lat), 1e-3);
  float e = max(tN, fp), lod = lodFor(fp, tN);
  vec2 tc = texUV(vUV);
  vec2 dx = vec2(e / (uTileLL.z * R_M * cl) * uTileN / (uTileN + 1.0), 0.0);
  vec2 dy = vec2(0.0, e / (uTileLL.z * R_M) * uTileN / (uTileN + 1.0));
  float gx = (textureLod(uTH, tc + dx, lod).r - textureLod(uTH, tc - dx, lod).r) / (2.0 * e);   // east
  float gy = (textureLod(uTH, tc - dy, lod).r - textureLod(uTH, tc + dy, lod).r) / (2.0 * e);   // north (v runs south)
  vec3 s = toENU(uSun, lat, lon);
  float gs = reliefGain(s.z) * uRelief;
  vec3 n = normalize(vec3(-gx * gs, -gy * gs, 1.0));
  vec3 v = toENU(normalize(cameraPosition - vW), lat, lon);
  vec3 ee = toENU(uEarthDir, lat, lon);
  vec3 albedo = texture(uTC, vUV).rgb;
  float vis = 1.0;
  if (dot(n, s) > -0.02 && s.z < 0.45) {
    float h0 = textureLod(uTH, tc, lod).r;
    vis = sunVisTile(lat, lon, h0 + 8.0, s, max(fp, tN) * 0.8, fp);
  } else if (s.z < -0.06) vis = 0.0;
  gl_FragColor = vec4(shade(albedo, n, s, v, ee, vis), 1.0);
  ${TAIL_F}
}`;

/* ---------------- polar cap ---------------- */
export const CAP_V = /* glsl */ `
${HEAD_V}
${COMMON}
uniform float uExag;
varying vec2 vXY;
varying vec3 vRel;
void main() {
  vec2 xy = position.xy * 1000.0;
  vec2 ll = stereoLL(xy);
  float h = textureLod(uCap, capUV(xy), 0.0).r;
  vec3 d = vec3(cos(ll.x) * cos(ll.y), cos(ll.x) * sin(ll.y), sin(ll.x));
  vec3 p = d * (R_M + h * uExag) / 1000.0;
  vXY = xy;
  vRel = anchorRel(p);
  vec4 w = modelMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

export const CAP_F = /* glsl */ `
${HEAD_F}
${COMMON}
${FRAG_ONLY}
${DETAIL}
varying vec2 vXY;
varying vec3 vRel;
void main() {
  vec2 ll = stereoLL(vXY);
  float lat = ll.x, lon = ll.y;
  if (lat > -80.0 * DEG) discard;
  if (uHiOn > 0.5 && inBox(hiUV(vXY), 2.0 / uHiN)) discard;
  float fp = max(length(fwidth(vRel)), 1e-3);
  // slope from the 148 m heights, differenced over max(texel, footprint) on the matching mip
  float e = max(uCapRes, fp), lod = lodFor(fp, uCapRes);
  vec2 c = capUV(vXY), du = vec2(e / (2.0 * uCapHalf), 0.0);
  float hx1 = textureLod(uCap, c + du.xy, lod).r, hx0 = textureLod(uCap, c - du.xy, lod).r;
  float hy1 = textureLod(uCap, c - du.yx, lod).r, hy0 = textureLod(uCap, c + du.yx, lod).r;   // +y is up the image
  vec3 s = toENU(uSun, lat, lon);
  float gs = reliefGain(s.z);
  vec2 gg = vec2(hx1 - hx0, hy1 - hy0) / (2.0 * e) * uRelief * gs;
  float cl = cos(lon), sl = sin(lon);
  vec2 gEN = vec2(gg.x * cl - gg.y * sl, gg.x * sl + gg.y * cl);
  float cTex = PI * R_M / float(textureSize(uColor, 0).y);
  vec3 dt = subTexel(vRel, fp, enuU(lat, lon), enuE(lon), enuN(lat, lon), uCapRes, cTex);
  vec3 n = normalize(vec3(-gEN - dt.xy * gs, 1.0));
  vec3 v = toENU(normalize(uCamRel - vRel), lat, lon);
  vec3 ee = toENU(uEarthDir, lat, lon);
  vec3 albedo = texture(uColor, seamlessUV(lat, lon)).rgb * dt.z;
  float vis = 0.0;
  if (dot(n, s) > -0.02) {
    float h0 = textureLod(uCap, c, lod).r;
    vis = sunVisPolar(vXY, lon, h0 + 4.0, s, max(fp, uCapRes) * 0.8, fp);
  }
  gl_FragColor = vec4(shade(albedo, n, s, v, ee, vis), 1.0);
  ${TAIL_F}
}`;

/* ---------------- site patch ---------------- */
export const PATCH_V = /* glsl */ `
${HEAD_V}
attribute vec2 aXY;      // stereographic metres (absolute)
attribute vec2 aLocal;   // stereographic metres relative to the site (precise near the camera)
attribute vec3 aUp;      // unit outward direction of the sphere at the vertex
attribute float aH;      // terrain height, metres
uniform float uExag;     // relief exaggeration, applied along the vertical like the globe, cap and tiles
varying vec2 vXY;
varying vec2 vLocal;
varying vec3 vPos;       // km relative to the patch origin
void main() {
  vXY = aXY;
  vLocal = aLocal;
  vec3 p = position + aUp * (aH * (uExag - 1.0) / 1000.0);
  vPos = p;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}`;

export const PATCH_F = /* glsl */ `
${HEAD_F}
${COMMON}
${FRAG_ONLY}
uniform vec3 uCamLocal;   // camera position relative to the patch origin, km
varying vec2 vXY;
varying vec2 vLocal;
varying vec3 vPos;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

// One layer of simple bowl craters with raised rims, cell size c (m). Returns (height, dh/dx, dh/dy).
// Craters whose rim is narrower than about a pixel fade out, so the smallest ones in a layer never alias.
vec3 craters(vec2 p, float c, float seed, float fp) {
  vec3 acc = vec3(0.0);
  vec2 cell = floor(p / c);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 id = cell + vec2(float(i), float(j));
    if (hash12(id + seed) > 0.3) continue;
    vec2 ctr = (id + 0.15 + 0.7 * hash22(id + seed * 1.7)) * c;
    float rad = c * (0.1 + 0.4 * pow(hash12(id * 1.31 + seed * 2.1), 2.2));
    float q = smoothstep(0.7 * fp, 2.0 * fp, 0.32 * rad);
    if (q <= 0.0) continue;
    vec2 dv = p - ctr;
    float rho = length(dv);
    float x = rho / rad;
    if (x > 1.9) continue;
    vec2 pr = craterProfile(x, rad, hash12(id * 0.7 + seed * 3.3));
    acc += q * vec3(pr.x, rho > 1e-6 ? dv / rho * pr.y : vec2(0.0));
  }
  return acc;
}
// Boulders: a sparse layer of steep bumps.
vec3 rocks(vec2 p, float c, float seed, float fp) {
  vec3 acc = vec3(0.0);
  vec2 cell = floor(p / c);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 id = cell + vec2(float(i), float(j));
    if (hash12(id + seed) > 0.12) continue;
    vec2 ctr = (id + 0.2 + 0.6 * hash22(id + seed)) * c;
    float rad = c * (0.08 + 0.2 * hash12(id + seed * 5.0));
    float qa = smoothstep(fp, 3.0 * fp, rad);
    if (qa <= 0.0) continue;
    vec2 dv = p - ctr; float rho = length(dv); float x = rho / rad;
    if (x >= 1.0) continue;
    float ht = rad * 0.9, q = 1.0 - x * x;
    acc += qa * vec3(ht * q * q, dv / max(rho, 1e-6) * (ht * 2.0 * q * (-2.0 * x)) / rad);
  }
  return acc;
}
// Fine regolith roughness (value noise with analytic gradient).
vec3 vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
  float v = a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
  vec2 g = du * vec2(b - a + (a - b - c + d) * u.y, c - a + (a - b - c + d) * u.x);
  return vec3(v, g);
}

// Procedural micro-relief: crater layers from just below the data resolution down to centimetres.
vec3 micro(vec2 p, float fp, out float wsum) {
  vec3 acc = vec3(0.0);
  wsum = 0.0;
  float c = uHiRes * 1.6;
  for (int k = 0; k < 7; k++) {
    float w = smoothstep(fp * 3.0, fp * 9.0, c * 0.3) * uDetail;
    if (w > 0.001) { acc += craters(p, c, float(k) * 17.0, fp) * w; wsum = max(wsum, w); }
    c *= 0.42;
  }
  float wr = smoothstep(fp * 3.0, fp * 9.0, 0.35) * uDetail;
  if (wr > 0.001) acc += rocks(p, 2.2, 5.0, fp) * wr + rocks(p, 0.8, 9.0, fp) * wr;
  float wn = smoothstep(fp * 2.0, fp * 6.0, 0.05) * uDetail;
  if (wn > 0.001) { vec3 nz = vnoise(p * 9.0); acc += vec3(nz.x * 0.012, nz.yz * 0.012 * 9.0) * wn; }
  return acc;
}
float microH(vec2 p, float fp) {
  float ws; return micro(p, fp, ws).x;
}

void main() {
  vec2 ll = stereoLL(vXY);
  float lat = ll.x, lon = ll.y;
  float fp = max(length(fwidth(vLocal)), 1e-4);
  // data gradient (grid space) from the LOLA patch, differenced over max(texel, footprint) on the matching mip
  float e = max(uHiRes, fp), lod = lodFor(fp, uHiRes);
  vec2 c = hiUV(vXY), du = vec2(e / (uHiRes * uHiN), 0.0);
  float h0 = textureLod(uHi, c, lod).r;
  vec2 gg = vec2(textureLod(uHi, c + du.xy, lod).r - textureLod(uHi, c - du.xy, lod).r,
                 textureLod(uHi, c - du.yx, lod).r - textureLod(uHi, c + du.yx, lod).r) / (2.0 * e);
  // procedural detail below the data resolution (illustrative)
  float wsum;
  vec3 m = micro(vLocal, fp, wsum);
  float cl = cos(lon), sl = sin(lon);
  vec3 s = toENU(uSun, lat, lon);
  vec2 gd = gg * uRelief * reliefGain(s.z), gt = gd + m.yz;
  vec2 gEN = vec2(gt.x * cl - gt.y * sl, gt.x * sl + gt.y * cl);
  vec3 n = normalize(vec3(-gEN, 1.0));
  vec3 nb = normalize(vec3(-vec2(gd.x * cl - gd.y * sl, gd.x * sl + gd.y * cl), 1.0));   // data-only normal
  vec3 v = toENU(normalize(uCamLocal - vPos), lat, lon);
  vec3 ee = toENU(uEarthDir, lat, lon);
  vec3 albedo = texture(uColor, seamlessUV(lat, lon)).rgb;
  // mottling of fresh regolith at ~30 cm, faded out before it drops below a couple of pixels
  float wsp = smoothstep(2.0 * fp, 5.0 * fp, 0.33) * uDetail;
  albedo *= 1.0 + 0.07 * (2.0 * vnoise(vLocal * 3.0).x - 1.0) * wsp;
  float vis = 0.0;
  if (dot(n, s) > -0.02) {
    vis = sunVisPolar(vXY, lon, h0 + 0.4 * e, s, max(0.75 * uHiRes, 0.8 * fp), fp);
    // micro shadows: march the procedural relief toward the Sun for a few metres
    if (vis > 0.0 && wsum > 0.01 && uShadows > 0.5) {
      vec2 hd = normalize(s.xy + 1e-9);
      vec2 g = vec2(hd.x * cl + hd.y * sl, -hd.x * sl + hd.y * cl);
      float elb = asin(clamp(dot(nb, s), -1.0, 1.0));
      float hm0 = m.x, hz = -1.0, d = max(fp * 2.0, 0.02);
      for (int i = 0; i < 12; i++) {
        hz = max(hz, (microH(vLocal + g * d, fp) - hm0) / d);
        d *= 1.55;
      }
      vis *= smoothstep(-SUN_R, SUN_R, elb - atan(hz));
    }
  }
  gl_FragColor = vec4(shade(albedo, n, s, v, ee, vis), 1.0);
  ${TAIL_F}
}`;

/* ---------------- Earth ---------------- */
export const EARTH_V = /* glsl */ `
${HEAD_V}
varying vec3 vN;
varying vec2 vUv;
varying vec3 vW;
void main() {
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;
export const EARTH_F = /* glsl */ `
${HEAD_F}
uniform sampler2D uMap;
uniform vec3 uSun;
uniform vec3 uCam;
varying vec3 vN;
varying vec2 vUv;
varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(uCam - vW);
  float l = dot(n, uSun);
  vec3 day = texture(uMap, vUv).rgb * 1.6;
  vec3 c = day * smoothstep(-0.08, 0.25, l);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  c += vec3(0.25, 0.5, 1.0) * rim * smoothstep(-0.2, 0.4, l) * 1.4;
  gl_FragColor = vec4(c, 1.0);
  ${TAIL_F}
}`;

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 7 commits), under the team's direction. Attribution from the commit history.
