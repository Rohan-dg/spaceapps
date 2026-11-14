/**
 * GLSL for the 3D Moon. Three surfaces share one lighting model:
 *   globe  : whole Moon, LROC colour + LOLA relief normals (equirectangular), north of 80°S
 *   cap    : 80°S to the pole, LOLA 148 m heights on the polar stereographic grid
 *   patch  : the selected site, LOLA 5/10/20 m heights, plus procedural craters below the data resolution
 *
 * Cast shadows are real: each pixel marches toward the Sun across the height maps (the same idea the app
 * uses for its horizon profiles), and the visible fraction of the 0.53° solar disc sets the light.
 * Light = Lommel-Seeliger/Lambert mix (the "lunar-Lambert" law), a small opposition surge, and earthshine.
 */

export const COMMON = /* glsl */ `
#define PI 3.141592653589793
#define DEG 0.017453292519943295
const float R_M = 1737400.0;
const float SUN_R = 0.00465;          // solar angular radius, rad
uniform vec3 uSun;                    // unit, Moon-fixed
uniform vec3 uEarthDir;               // unit, Moon-fixed
uniform float uEarthshine;
uniform float uSunPower;
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

vec3 enuE(float lon) { return vec3(-sin(lon), cos(lon), 0.0); }
vec3 enuN(float lat, float lon) { return vec3(-sin(lat) * cos(lon), -sin(lat) * sin(lon), cos(lat)); }
vec3 enuU(float lat, float lon) { return vec3(cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat)); }
vec3 toENU(vec3 v, float lat, float lon) { return vec3(dot(v, enuE(lon)), dot(v, enuN(lat, lon)), dot(v, enuU(lat, lon))); }

vec2 stereo(float lat, float lon) { float r = 2.0 * R_M * tan((0.5 * PI + lat) * 0.5); return vec2(r * sin(lon), r * cos(lon)); }
vec2 stereoLL(vec2 xy) { float r = length(xy); return vec2(2.0 * atan(r / (2.0 * R_M)) - 0.5 * PI, atan(xy.x, xy.y)); }

vec2 eqUV(float lat, float lon) { return vec2((lon + PI) / (2.0 * PI), (0.5 * PI - lat) / PI); }
float hEq(float lat, float lon) { return textureLod(uEqH, eqUV(lat, lon), 0.0).r; }
vec2 capUV(vec2 xy) { return vec2(xy.x + uCapHalf, uCapHalf - xy.y) / (2.0 * uCapHalf); }
vec2 hiUV(vec2 xy) {
  vec2 cr = vec2(xy.x / uHiRes + uHiOff - uHiRC0.y, uHiOff - xy.y / uHiRes - uHiRC0.x);
  return (cr + 0.5) / uHiN;
}
bool inBox(vec2 uv, float m) { return all(greaterThan(uv, vec2(m))) && all(lessThan(uv, vec2(1.0 - m))); }

/** Height (m) at a polar stereographic point: site patch, then cap, then the global map. */
float hPolar(vec2 xy) {
  if (uHiOn > 0.5) { vec2 u = hiUV(xy); if (inBox(u, 0.0)) return textureLod(uHi, u, 0.0).r; }
  vec2 c = capUV(xy);
  if (uCapOn > 0.5 && inBox(c, 0.0)) return textureLod(uCap, c, 0.0).r;
  vec2 ll = stereoLL(xy);
  return hEq(ll.x, ll.y);
}
/** Height (m) at a latitude/longitude, picking the finest map that covers it. */
float hAt(float lat, float lon) {
  if (lat < -80.0 * DEG) return hPolar(stereo(lat, lon));
  return hEq(lat, lon);
}

/** Visible fraction of the solar disc from a polar point, by marching toward the Sun (horizon method). */
float sunVisPolar(vec2 xy, float lon, float h0, vec3 s, float d0) {
  float el = asin(clamp(s.z, -1.0, 1.0));
  if (el < -0.06) return 0.0;
  if (uShadows < 0.5) return smoothstep(-SUN_R, SUN_R, el);
  vec2 hd = normalize(s.xy + 1e-9);
  float cl = cos(lon), sl = sin(lon);
  vec2 g = vec2(hd.x * cl + hd.y * sl, -hd.x * sl + hd.y * cl);   // east/north -> grid x/y
  float k = exp(log(180000.0 / d0) / 72.0);
  float d = d0, hz = -1.0;
  for (int i = 0; i < 72; i++) {
    float h = hPolar(xy + g * d);
    hz = max(hz, (h - h0) / d - d / (2.0 * R_M));
    if (atan(hz) - el > SUN_R) return 0.0;
    d *= k;
  }
  return smoothstep(-SUN_R, SUN_R, el - atan(hz));
}

/** Same, on the latitude/longitude map (marches into the polar maps when it crosses 80°S). */
float sunVisEq(float lat, float lon, float h0, vec3 s, float d0) {
  float el = asin(clamp(s.z, -1.0, 1.0));
  if (el < -0.06) return 0.0;
  if (uShadows < 0.5) return smoothstep(-SUN_R, SUN_R, el);
  vec2 hd = normalize(s.xy + 1e-9);
  float k = exp(log(220000.0 / d0) / 48.0);
  float d = d0, hz = -1.0, cl = max(cos(lat), 0.02);
  for (int i = 0; i < 48; i++) {
    float la = lat + hd.y * d / R_M, lo = lon + hd.x * d / (R_M * cl);
    float h = hAt(la, lo);
    hz = max(hz, (h - h0) / d - d / (2.0 * R_M));
    if (atan(hz) - el > SUN_R) return 0.0;
    d *= k;
  }
  return smoothstep(-SUN_R, SUN_R, el - atan(hz));
}

vec3 shade(vec3 albedo, vec3 n, vec3 s, vec3 v, vec3 e, float vis) {
  float mu0 = max(dot(n, s), 0.0);
  float mu = max(dot(n, v), 0.0);
  float ls = mu0 / max(mu0 + mu, 1e-4);
  float sunTerm = (0.42 * 2.0 * ls + 0.58 * mu0) * vis;
  float g = acos(clamp(dot(s, v), -1.0, 1.0));
  float phase = 1.0 + 0.3 * exp(-g / 0.1);
  vec3 c = albedo * vec3(1.0, 0.98, 0.94) * uSunPower * sunTerm * phase;
  float me = max(dot(n, e), 0.0) * smoothstep(-0.05, 0.05, e.z);
  c += albedo * vec3(0.62, 0.7, 0.9) * uEarthshine * me;
  // light scattered from nearby sunlit ground keeps shadows from going pure black
  float bounce = 0.035 * clamp(s.z * 4.0 + 0.12, 0.0, 1.0) * (1.0 - 0.6 * vis) * (0.6 + 0.4 * n.z);
  c += albedo * uSunPower * bounce;
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

/* ---------------- globe ---------------- */
export const GLOBE_V = /* glsl */ `
${HEAD_V}
${COMMON}
uniform float uExag;
varying vec3 vDir;
varying vec3 vWorld;
void main() {
  vec3 d = normalize(position);
  float lat = asin(clamp(d.z, -1.0, 1.0)), lon = atan(d.y, d.x);
  float h = textureLod(uEqH, eqUV(lat, lon), 0.0).r;
  vec3 p = d * (R_M + h * uExag) / 1000.0;
  vDir = d;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

export const GLOBE_F = /* glsl */ `
${HEAD_F}
${COMMON}
${FRAG_ONLY}
uniform vec3 uCam;
varying vec3 vDir;
varying vec3 vWorld;
void main() {
  vec3 d = normalize(vDir);
  float lat = asin(clamp(d.z, -1.0, 1.0)), lon = atan(d.y, d.x);
  if (uCapOn > 0.5 && lat < -80.05 * DEG) discard;
  vec2 uv = seamlessUV(lat, lon);
  vec3 albedo = texture(uColor, uv).rgb;
  vec3 nt = texture(uNormal, uv).xyz * 2.0 - 1.0;
  nt.xy *= uRelief;
  vec3 n = normalize(nt);
  vec3 s = toENU(uSun, lat, lon);
  vec3 v = toENU(normalize(uCam - vWorld), lat, lon);
  vec3 e = toENU(uEarthDir, lat, lon);
  float vis = 1.0;
  if (dot(n, s) > 0.0 && s.z < 0.45) {
    float h0 = hEq(lat, lon);
    float px = length(fwidth(vWorld)) * 1000.0;
    vis = sunVisEq(lat, lon, h0 + 30.0, s, max(px * 1.5, 900.0));
  } else if (s.z < -0.06) vis = 0.0;
  gl_FragColor = vec4(shade(albedo, n, s, v, e, vis), 1.0);
  ${TAIL_F}
}`;

/* ---------------- polar cap ---------------- */
export const CAP_V = /* glsl */ `
${HEAD_V}
${COMMON}
uniform float uExag;
varying vec2 vXY;
varying vec3 vWorld;
void main() {
  vec2 xy = position.xy * 1000.0;
  vec2 ll = stereoLL(xy);
  float h = textureLod(uCap, capUV(xy), 0.0).r;
  vec3 d = vec3(cos(ll.x) * cos(ll.y), cos(ll.x) * sin(ll.y), sin(ll.x));
  vec3 p = d * (R_M + h * uExag) / 1000.0;
  vXY = xy;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}`;

export const CAP_F = /* glsl */ `
${HEAD_F}
${COMMON}
${FRAG_ONLY}
uniform vec3 uCam;
varying vec2 vXY;
varying vec3 vWorld;
void main() {
  vec2 ll = stereoLL(vXY);
  float lat = ll.x, lon = ll.y;
  if (lat > -80.0 * DEG) discard;
  if (uHiOn > 0.5 && inBox(hiUV(vXY), 2.0 / uHiN)) discard;
  float e = uCapRes;
  vec2 c = capUV(vXY), du = vec2(e / (2.0 * uCapHalf), 0.0);
  float hx1 = texture(uCap, c + du.xy).r, hx0 = texture(uCap, c - du.xy).r;
  float hy1 = texture(uCap, c - du.yx).r, hy0 = texture(uCap, c + du.yx).r;   // +y is up the image
  vec2 gg = vec2(hx1 - hx0, hy1 - hy0) / (2.0 * e) * uRelief;
  float cl = cos(lon), sl = sin(lon);
  vec2 gEN = vec2(gg.x * cl - gg.y * sl, gg.x * sl + gg.y * cl);
  vec3 n = normalize(vec3(-gEN, 1.0));
  vec3 s = toENU(uSun, lat, lon);
  vec3 v = toENU(normalize(uCam - vWorld), lat, lon);
  vec3 ee = toENU(uEarthDir, lat, lon);
  vec3 albedo = texture(uColor, seamlessUV(lat, lon)).rgb;
  float vis = 0.0;
  if (dot(n, s) > -0.02) {
    float h0 = texture(uCap, c).r;
    float px = length(fwidth(vWorld)) * 1000.0;
    vis = sunVisPolar(vXY, lon, h0 + 4.0, s, max(px, e) * 0.8);
  }
  gl_FragColor = vec4(shade(albedo, n, s, v, ee, vis), 1.0);
  ${TAIL_F}
}`;

/* ---------------- site patch ---------------- */
export const PATCH_V = /* glsl */ `
${HEAD_V}
attribute vec2 aXY;      // stereographic metres (absolute)
attribute vec2 aLocal;   // stereographic metres relative to the site (precise near the camera)
varying vec2 vXY;
varying vec2 vLocal;
varying vec3 vPos;       // km relative to the patch origin
void main() {
  vXY = aXY;
  vLocal = aLocal;
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;

export const PATCH_F = /* glsl */ `
${HEAD_F}
${COMMON}
${FRAG_ONLY}
uniform vec3 uCamLocal;   // camera position relative to the patch origin, km
uniform float uDetail;    // 0..1, procedural detail below the data resolution
varying vec2 vXY;
varying vec2 vLocal;
varying vec3 vPos;

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }

// One layer of simple bowl craters with raised rims, cell size c (m). Returns (height, dh/dx, dh/dy).
vec3 craters(vec2 p, float c, float seed) {
  vec3 acc = vec3(0.0);
  vec2 cell = floor(p / c);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 id = cell + vec2(float(i), float(j));
    if (hash12(id + seed) > 0.3) continue;
    vec2 ctr = (id + 0.15 + 0.7 * hash22(id + seed * 1.7)) * c;
    float rad = c * (0.1 + 0.4 * pow(hash12(id * 1.31 + seed * 2.1), 2.2));
    vec2 dv = p - ctr;
    float rho = length(dv);
    float x = rho / rad;
    if (x > 1.9) continue;
    float fresh = hash12(id * 0.7 + seed * 3.3);
    float depth = rad * mix(0.04, 0.34, fresh * fresh);   // depth/diameter 0.02..0.17, mostly old and soft
    float rimH = depth * mix(0.15, 0.4, fresh), w = 0.32;
    float xi = min(x, 1.0);
    float rim = exp(-((x - 1.0) * (x - 1.0)) / (w * w));
    float h = depth * (xi * xi - 1.0) + rimH * rim;
    float dh = (x < 1.0 ? depth * 2.0 * x : 0.0) + rimH * rim * (-2.0 * (x - 1.0) / (w * w));
    acc += vec3(h, rho > 1e-6 ? dv / rho * dh / rad : vec2(0.0));
  }
  return acc;
}
// Boulders: a sparse layer of steep bumps.
vec3 rocks(vec2 p, float c, float seed) {
  vec3 acc = vec3(0.0);
  vec2 cell = floor(p / c);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 id = cell + vec2(float(i), float(j));
    if (hash12(id + seed) > 0.12) continue;
    vec2 ctr = (id + 0.2 + 0.6 * hash22(id + seed)) * c;
    float rad = c * (0.08 + 0.2 * hash12(id + seed * 5.0));
    vec2 dv = p - ctr; float rho = length(dv); float x = rho / rad;
    if (x >= 1.0) continue;
    float ht = rad * 0.9, q = 1.0 - x * x;
    acc += vec3(ht * q * q, dv / max(rho, 1e-6) * (ht * 2.0 * q * (-2.0 * x)) / rad);
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
    if (w > 0.001) { acc += craters(p, c, float(k) * 17.0) * w; wsum = max(wsum, w); }
    c *= 0.42;
  }
  float wr = smoothstep(fp * 3.0, fp * 9.0, 0.35) * uDetail;
  if (wr > 0.001) acc += rocks(p, 2.2, 5.0) * wr + rocks(p, 0.8, 9.0) * wr;
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
  // data gradient (grid space) from the LOLA patch
  float e = uHiRes;
  vec2 c = hiUV(vXY), du = vec2(1.0 / uHiN, 0.0);
  float h0 = texture(uHi, c).r;
  vec2 gg = vec2(texture(uHi, c + du.xy).r - texture(uHi, c - du.xy).r,
                 texture(uHi, c - du.yx).r - texture(uHi, c + du.yx).r) / (2.0 * e);
  // procedural detail below the data resolution (illustrative)
  float fp = max(length(fwidth(vLocal)), 1e-4);
  float wsum;
  vec3 m = micro(vLocal, fp, wsum);
  float cl = cos(lon), sl = sin(lon);
  vec2 gd = gg * uRelief, gt = gd + m.yz;
  vec2 gEN = vec2(gt.x * cl - gt.y * sl, gt.x * sl + gt.y * cl);
  vec3 n = normalize(vec3(-gEN, 1.0));
  vec3 nb = normalize(vec3(-vec2(gd.x * cl - gd.y * sl, gd.x * sl + gd.y * cl), 1.0));   // data-only normal
  vec3 s = toENU(uSun, lat, lon);
  vec3 v = toENU(normalize(uCamLocal - vPos), lat, lon);
  vec3 ee = toENU(uEarthDir, lat, lon);
  vec3 albedo = texture(uColor, seamlessUV(lat, lon)).rgb;
  albedo *= 0.93 + 0.14 * hash12(floor(vLocal * 3.0));       // speckle of fresh regolith
  float vis = 0.0;
  if (dot(n, s) > -0.02) {
    vis = sunVisPolar(vXY, lon, h0 + 0.4 * e, s, e * 0.75);
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
