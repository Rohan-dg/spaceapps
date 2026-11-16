/**
 * Rover game engine: the three.js world and the per-frame loop. React (RoverGame.tsx) owns the HUD; this owns the
 * canvas, the input, and everything that moves.
 *
 * What is real: the ground is the app's LOLA terrain (20 m near the site, 148 m to the horizon, with the Moon's
 * curve), and the Sun and Earth sit at the azimuth and elevation the app's ephemeris gives for the rover's own
 * position and the game clock. Whether each is in view is a ray against that terrain, the same test the rest of
 * the app makes; shadows on the ground come from that test run for every patch of ground in a worker.
 * What is invented: bumps finer than the DEM, and the game's power and heat figures (sim.ts).
 *
 * Frame: x east, y up, z south, metres from the site. Two passes share one camera pose: the far pass draws the
 * sky and terrain beyond 7.6 km, then depth is cleared and the near pass draws the rest.
 */
import * as THREE from 'three';
import { bodyFixedGeometry, skyFromGeometry } from '../lib/ephemeris';
import { siteVector } from '../lib/geometry';
import { diskVisibleFraction } from '../lib/horizon';
import { sub, unit } from '../lib/vec';
import { type World, demAt, groundY, makeWorld, skyline, toLatLon, toStereo } from './terrain';
import {
  type Maps, type MissionPlan, type Objective, type Phase, type Pt, type Quest, type Vitals,
  RATE, RATE_FF, STORY, advance, distance, iceSignal, newQuest, stepsOf, newVitals, objective, planMission, stepVitals, DIG_M, CHARGE_PCT, missionById, type MissionDef, type Spec,
} from './sim';
import { buildRover, disposeBuilt, roverById, roverEnvironment, type Built, type RoverDef } from './rovers';
import type { Req, Res } from './worker';

/** top speed multiplier while Shift is held */
const BOOST = 1.8;
const NEAR = 800, MID = 7600, FAR = 152000, BOUND = 700;
const LIT_N = 160, PLAN_N = 128;
/** Height of the solar panels and antenna above the ground, for the Sun and Earth tests (m). */
const OBS_M = 0.6;
const EARTH_R = 0.95; // Earth's angular radius from the Moon, deg (the ephemeris gives the exact value; this sizes the disc)
const D2R = Math.PI / 180;

export interface Hud {
  t: number; rate: number; battPct: number; netW: number; solarW: number; sunFrac: number; earthUp: boolean;
  tempC: number; heaterW: number; speed: number; heading: number; slope: number; ice: number; canDig: boolean;
  busy: null | { kind: 'dig' | 'tx'; p: number }; obj: Objective; objDist: number | null; objBearing: number | null;
  found: number; total: number; sunAz: number; sunEl: number; earthAz: number; earthEl: number;
  lamp: boolean; view: CamView; tele: boolean; odo: number; dead: boolean; phase: Phase; camAz: number; held: number; boost: boolean;
  score: number; combo: number; bonus: number; bonusTotal: number; steps: Phase[]; gain: { id: number; pts: number; label: string } | null; nearBonus: number | null;
}
export interface Stats { odo: number; hours: number; found: number; minTempC: number; battPct: number; score: number; bonus: number; bonusTotal: number; parts: [string, number][]; stars: number; playS: number }
export interface Callbacks {
  onStage: (s: string) => void;
  /** start time actually used (the first good moment at or after the app's), or null when no mission fits this place */
  onReady: (r: { t: number; movedDays: number } | null) => void;
  onHud: (h: Hud) => void;
  onMessage: (m: { from: string; text: string }) => void;
  onEnd: (kind: 'done' | 'frozen' | 'power' | 'time', s: Stats) => void;
  onError: (m: string) => void;
}
export interface Opts { host: HTMLElement; base: string; siteId: string; lat: number; lon: number; t: number; tMax: number; reduce: boolean; roverId: string; missionId?: string }
export interface Tags { sun: HTMLElement; earth: HTMLElement; goal: HTMLElement; map?: HTMLCanvasElement }

const TERRAIN_VS = /* glsl */ `
varying vec3 vW; varying vec3 vN;
void main() {
  vec4 p = vec4(position, 1.0); vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
  #endif
  vec4 w = modelMatrix * p; vW = w.xyz; vN = mat3(modelMatrix) * n;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const TERRAIN_FS = /* glsl */ `
uniform sampler2D uLit; uniform float uHalf, uSunI, uEarthI, uLampI, uDetail, uAlb, uGlow;
uniform vec3 uSun, uEarth, uLampPos, uLampDir;
varying vec3 vW; varying vec3 vN;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { return 0.55 * vn(p) + 0.3 * vn(p * 2.7) + 0.15 * vn(p * 7.1); }
void main() {
  vec3 n = normalize(vN);
  float d = length(vW - cameraPosition);
  if (uDetail > 0.0) { // regolith grain: tilt the normal by a noise field, fading out with distance
    float footprint = max(fwidth(vW.x), fwidth(vW.z));
    float f = uDetail * (1.0 - smoothstep(25.0, 260.0, d)) * (1.0 - smoothstep(0.08, 0.6, footprint)), e = 0.22;
    float h = fbm(vW.xz * 1.9), hx = fbm((vW.xz + vec2(e, 0.0)) * 1.9), hz = fbm((vW.xz + vec2(0.0, e)) * 1.9);
    n = normalize(n + f * vec3(h - hx, 0.0, h - hz) * 0.12);
  }
  float grain = 1.0 - smoothstep(0.1, 0.8, max(fwidth(vW.x), fwidth(vW.z)));
  float alb = uAlb * (0.88 + 0.18 * vn(vW.xz * 0.02) + grain * 0.045 * vn(vW.xz * 0.45));
  float lit = texture2D(uLit, vW.xz / (2.0 * uHalf) + 0.5).r;
  // lunar soil scatters light back toward a low Sun far better than a matte surface would
  float incidence = max(dot(n, uSun), 0.0);
  float emergence = max(dot(n, normalize(cameraPosition - vW)), 0.01);
  float sun = uSunI * lit * (0.58 * incidence + 0.42 * incidence / max(incidence + emergence, 0.01));
  float earth = uEarthI * max(dot(n, uEarth), 0.0);
  vec3 c = alb * (sun * vec3(1.0, 0.965, 0.91) + earth * vec3(0.5, 0.64, 1.0) + uGlow);
  vec3 L = uLampPos - vW; float ld = length(L); L /= ld;
  float cone = smoothstep(0.80, 0.97, dot(-L, uLampDir));
  c += alb * uLampI * cone * max(dot(n, L), 0.0) / (1.0 + 0.012 * ld * ld) * vec3(1.0, 0.98, 0.93);
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
/** frame-rate independent easing factor */
const k = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const dirOf = (az: number, el: number, out = new THREE.Vector3()) => out.set(Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), -Math.cos(az * D2R) * Math.cos(el * D2R));

/** Camera positions the player can switch between (C or the Camera button). All but the mast keep the rover centred. */
export type CamView = 'chase' | 'close' | 'high' | 'top' | 'mast';
export const CAM_VIEWS: { id: CamView; label: string }[] = [
  { id: 'chase', label: 'Chase' }, { id: 'close', label: 'Close' }, { id: 'high', label: 'High' }, { id: 'top', label: 'Overhead' }, { id: 'mast', label: 'Mast' },
];
/** Pitch (degrees down) and distance (× the rover's chase distance) for each orbiting view. */
const CAM_PRESET: Record<Exclude<CamView, 'mast'>, { pitch: number; dist: number }> = {
  chase: { pitch: 16, dist: 1 }, close: { pitch: 9, dist: 0.6 }, high: { pitch: 38, dist: 1.7 }, top: { pitch: 84, dist: 3.2 },
};

export class Game {
  private o: Opts; private cb: Callbacks;
  private renderer!: THREE.WebGLRenderer;
  private near = new THREE.Scene(); private far = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(58, 1, 0.25, 16000); private farCam = new THREE.PerspectiveCamera(58, 1, 3000, 900000);
  private worker!: Worker; private mapId = 0;
  private mapWait = new Map<number, { resolve: (d: Uint8Array) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private loadReject: ((e: Error) => void) | null = null;
  private w!: World;
  private raf = 0; private last = 0; private live = true; private ro?: ResizeObserver;
  /** The view's CSS size, kept by size() (ResizeObserver), so the frame loop never forces a layout by reading it. */
  private vw = 1; private vh = 1;
  private state: 'load' | 'brief' | 'play' | 'pause' | 'end' = 'load';
  // uniforms shared by every terrain material
  private U = {
    uSun: { value: new THREE.Vector3(0, 1, 0) }, uEarth: { value: new THREE.Vector3(0, 1, 0) }, uSunI: { value: 0 }, uEarthI: { value: 0 },
    uLampPos: { value: new THREE.Vector3() }, uLampDir: { value: new THREE.Vector3(0, 0, -1) }, uLampI: { value: 0 }, uGlow: { value: 0.004 },
  };
  private lit: { tex: THREE.DataTexture; half: number }[] = [];
  private litU: number[] | null = null; private litBusy = false;
  private nearLit: Uint8Array = new Uint8Array(LIT_N * LIT_N);
  // rover
  private rover = new THREE.Group(); private tilt = new THREE.Group();
  private wheels: THREE.Group[] = [];
  private mission: MissionDef = missionById('survey');
  private def: RoverDef = roverById('badger'); private spec: Spec = this.def.spec; private built: Built | null = null; private digNow = 0;
  private roverParts: THREE.Object3D[] = []; private roverGen = 0;
  // score
  private score = 0; private combo = 1; private comboAt = -1e9; private taken: boolean[] = []; private gain: Hud['gain'] = null; private gainN = 0; private parts: [string, number][] = [];
  private bonusMarks = new THREE.Group(); private playS = 0;
  private e = 0; private n = 0; private psi = 0; private v = 0; private yawRate = 0; private odo = 0;
  private heave = 0; private heaveV = 0; private pitchD = 0; private pitchV = 0; private rollD = 0; private rollV = 0; private lastY = 0;
  private slope = 0;
  // sky
  private sunDisc!: THREE.Mesh; private sunGlow!: THREE.Sprite; private earth!: THREE.Mesh; private sunLightN!: THREE.DirectionalLight; private sunLightF!: THREE.DirectionalLight;
  private earthLight!: THREE.DirectionalLight; private fill!: THREE.PointLight; private bounce = new THREE.HemisphereLight(0x1a2233, 0xa8a49c, 0.2);
  private sky = { sunAz: 0, sunEl: 0, sunR: 0.266, earthAz: 0, earthEl: 0, sunFrac: 0, earthUp: false, sunHit: 0, earthHit: 0 };
  private skyAt = -1;
  private beamSun!: THREE.Line; private beamEarth!: THREE.Line;
  // effects
  private tracks!: THREE.Mesh; private trackN = 0; private trackLast: THREE.Vector3[] | null = null; private trackDist = 0;
  private dust!: THREE.Points; private dustV!: Float32Array; private dustLife!: Float32Array; private dustI = 0;
  private shadow!: THREE.Mesh; private goal = new THREE.Group(); private zoneRing!: THREE.LineLoop; private flags = new THREE.Group();
  // camera
  private camOff = 0; private camAz = 0; private camPitch = 16; private camDist = 7; private lens = 0; private lensTo = 0; private mastFov = 55;
  private view: CamView = 'chase'; private tgt = new THREE.Vector3(); private camRoll = 0; private exposure = 1.2;
  // rules
  private simT = 0; private vit: Vitals = newVitals(); private plan!: MissionPlan; private quest!: Quest;
  private busy: null | { kind: 'dig' | 'tx'; p: number } = null; private ff = false; private boost = false; private lampAuto = true; private lampOn = false;
  private keys = new Set<string>(); private held = 0;
  private queue: { from: string; text: string }[] = []; private flagsSaid = new Set<string>();
  private check: { e: number; n: number; psi: number; vit: Vitals; simT: number; quest: Quest; odo: number; score: number; taken: boolean[]; parts: [string, number][] } | null = null;
  private minTemp = 10; private t0 = 0; private hudAt = 0; private mapAt = 0; private mapBase: HTMLCanvasElement | null = null;
  private tags: Tags | null = null;
  private drag: { x: number; y: number } | null = null;

  constructor(o: Opts, cb: Callbacks) { this.o = o; this.cb = cb; this.def = roverById(o.roverId); this.spec = this.def.spec; this.mission = missionById(o.missionId ?? 'survey'); this.vit = newVitals(this.mission.startPct, this.spec); this.camDist = this.def.geom.cam; this.init().catch((e) => this.fail(e)); }

  private fail(e: unknown) {
    if (!this.live) return;
    this.dispose();
    this.cb.onError(e instanceof Error ? e.message : String(e));
  }

  /* ---------------- setup ---------------- */

  private ask(u: number[], radiusDeg: number, halfM: number, n: number) {
    const id = ++this.mapId;
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => { this.mapWait.delete(id); reject(new Error('Terrain visibility took too long. Please retry.')); }, 45000);
      this.mapWait.set(id, { resolve, reject, timer });
      this.worker.postMessage({ type: 'map', id, u, radiusDeg, halfM, n, obsM: OBS_M } satisfies Req);
    });
  }
  /** Moon-fixed unit vectors toward the Sun and Earth from the site at a time. */
  private bodies(t: number) {
    const g = bodyFixedGeometry(new Date(Math.round(t / 60000) * 60000)), p = siteVector({ lat: this.o.lat, lon: this.o.lon, heightM: this.w.h0 });
    return { g, sun: unit(sub(g.sunKm, p)) as number[], earth: unit(sub(g.earthKm, p)) as number[] };
  }
  /** Sun and Earth as seen from a local point: where they are, and whether the terrain lets them through. */
  private look(t: number, e: number, n: number) {
    const [lat, lon] = toLatLon(this.w, e, n), [x, y] = toStereo(this.w, e, n), ground = demAt(this.w, x, y);
    const s = skyFromGeometry(bodyFixedGeometry(new Date(Math.round(t / 60000) * 60000)), { lat, lon, heightM: ground + OBS_M });
    const hs = skyline(this.w, x, y, ground, s.sun.az, OBS_M, s.sun.el + s.sun.radiusDeg + 0.02), he = skyline(this.w, x, y, ground, s.earth.az, OBS_M, s.earth.el + 0.02);
    return {
      sunAz: s.sun.az, sunEl: s.sun.el, sunR: s.sun.radiusDeg, earthAz: s.earth.az, earthEl: s.earth.el,
      sunFrac: s.sun.el < -3 ? 0 : diskVisibleFraction(s.sun.el, s.sun.radiusDeg, hs.ang), earthUp: s.earth.el > he.ang, sunHit: hs.dist, earthHit: he.dist,
    };
  }

  private async init() {
    const { o, cb } = this;
    cb.onStage('Loading the terrain');
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const grids = await new Promise<Extract<Res, { type: 'loaded' }>>((res, rej) => {
      const timer = setTimeout(() => rej(new Error('The terrain download timed out. Check your connection and retry.')), 60000);
      this.loadReject = (e) => { clearTimeout(timer); rej(e); };
      const failed = (e: Error) => {
        this.loadReject?.(e); this.loadReject = null;
        for (const p of this.mapWait.values()) { clearTimeout(p.timer); p.reject(e); }
        this.mapWait.clear();
        this.fail(e);
      };
      this.worker.onerror = (ev) => { ev.preventDefault(); failed(new Error(ev.message || 'The terrain worker could not start.')); };
      this.worker.onmessage = (ev: MessageEvent<Res>) => {
        const m = ev.data;
        if (m.type === 'loaded') { clearTimeout(timer); this.loadReject = null; res(m); }
        else if (m.type === 'error') failed(new Error(m.message));
        else { const p = this.mapWait.get(m.id); if (p) { clearTimeout(p.timer); p.resolve(m.data); this.mapWait.delete(m.id); } }
      };
      this.worker.postMessage({ type: 'load', base: o.base, siteId: o.siteId, lat: o.lat, lon: o.lon } satisfies Req);
    });
    if (!this.live) return;
    if (!grids.hi) { cb.onReady(null); this.dispose(); return; }
    this.w = makeWorld(grids.hi, grids.cap, o.lat, o.lon);

    // slope and height of the ground the mission can use
    const step = (2 * NEAR) / PLAN_N, slope = new Float32Array(PLAN_N * PLAN_N), elev = new Float32Array(PLAN_N * PLAN_N);
    for (let j = 0; j < PLAN_N; j++) for (let i = 0; i < PLAN_N; i++) {
      const e = -NEAR + (i + 0.5) * step, n = NEAR - (j + 0.5) * step, d = 10;
      const gx = (groundY(this.w, e + d, n, false) - groundY(this.w, e - d, n, false)) / (2 * d), gn = (groundY(this.w, e, n + d, false) - groundY(this.w, e, n - d, false)) / (2 * d);
      slope[j * PLAN_N + i] = Math.atan(Math.hypot(gx, gn)) / D2R; elev[j * PLAN_N + i] = groundY(this.w, e, n, false);
    }
    // the first good moment at or after the app's time: Sun up at the site, and a mission that fits the ground
    cb.onStage('Finding sunlight');
    let seed = 0; for (const ch of o.siteId) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const cand: number[] = [];
    for (let t = o.t; t <= Math.min(o.tMax, o.t + 30 * 86400000) && cand.length < 7; t += 6 * 3600000) {
      if (this.look(t, 0, 0).sunFrac >= 0.9 && (!cand.length || t - cand[cand.length - 1] >= 36 * 3600000)) cand.push(t);
    }
    let plan: MissionPlan | null = null, t0 = o.t;
    for (const t of cand) {
      const b = this.bodies(t);
      const [sun, earth] = await Promise.all([this.ask(b.sun, 0.266, NEAR, PLAN_N), this.ask(b.earth, 0.05, NEAR, PLAN_N)]);
      if (!this.live) return;
      const m: Maps = { n: PLAN_N, halfM: NEAR, sun, earth, slope, elev };
      plan = planMission(m, seed);
      if (plan) { t0 = t; break; }
    }
    if (!plan) { cb.onReady(null); this.dispose(); return; }
    this.plan = plan; this.simT = this.t0 = t0; this.taken = plan.bonus.map(() => false);
    this.e = plan.start.e; this.n = plan.start.n;
    this.startMission();
    this.sky = this.look(this.simT, this.e, this.n); this.skyAt = this.simT;

    cb.onStage('Building the ground');
    await new Promise((r) => setTimeout(r, 0));
    if (!this.live) return;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.autoClear = false; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    o.host.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.buildTerrain(); this.buildSky(); this.buildEffects();
    // reflections for the rover's metal and foil (the terrain uses its own shader and ignores this)
    this.near.environment = roverEnvironment(this.renderer); this.near.environmentIntensity = 0.25;
    cb.onStage('Unpacking the rover');
    await this.buildRover();
    if (!this.live) return;
    this.size(); this.ro = new ResizeObserver(() => this.size()); this.ro.observe(o.host);
    this.bind();
    // shadows for the opening view before the first frame
    await this.refreshLit(true);
    if (!this.live) return;
    this.saveCheck();
    this.state = 'brief';
    cb.onReady({ t: t0, movedDays: (t0 - o.t) / 86400000 });
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private terrainMat(half: number, detail: number, alb = 0.2) {
    const data = new Uint8Array(LIT_N * LIT_N).fill(255);
    const tex = new THREE.DataTexture(data, LIT_N, LIT_N, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
    return { tex, mat: new THREE.ShaderMaterial({ vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS, uniforms: { ...this.U, uLit: { value: tex }, uHalf: { value: half }, uDetail: { value: detail }, uAlb: { value: alb } } }) };
  }
  private ring(half: number, n: number, hole: number, fine: boolean, sink: number, mat: THREE.Material) {
    const N = n + 1, step = (2 * half) / n, H = new Float32Array(N * N), pos = new Float32Array(N * N * 3), nor = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = groundY(this.w, -half + i * step, half - j * step, fine);
    const inHole = (i: number, j: number, m: number) => Math.max(Math.abs(-half + i * step), Math.abs(half - j * step)) < hole - m;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const q = j * N + i, i0 = Math.max(0, i - 1), i1 = Math.min(n, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(n, j + 1);
      const gx = (H[j * N + i1] - H[j * N + i0]) / ((i1 - i0) * step), gz = (H[j1 * N + i] - H[j0 * N + i]) / ((j1 - j0) * step), l = Math.hypot(gx, 1, gz);
      pos[q * 3] = -half + i * step; pos[q * 3 + 1] = H[q] - (inHole(i, j, 0.01) ? sink : 0); pos[q * 3 + 2] = -(half - j * step);
      nor[q * 3] = -gx / l; nor[q * 3 + 1] = 1 / l; nor[q * 3 + 2] = -gz / l;
    }
    const idx: number[] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (hole > 0 && inHole(i, j, step) && inHole(i + 1, j, step) && inHole(i, j + 1, step) && inHole(i + 1, j + 1, step)) continue;
      const a = j * N + i, b = a + 1, d = a + N, c = d + 1;
      idx.push(a, d, b, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false;
    return m;
  }
  private buildTerrain() {
    const a = this.terrainMat(NEAR, 1), b = this.terrainMat(MID, 0), c = this.terrainMat(FAR, 0);
    this.lit = [{ tex: a.tex, half: NEAR }, { tex: b.tex, half: MID }, { tex: c.tex, half: FAR }];
    this.near.add(this.ring(NEAR, 400, 0, true, 0, a.mat), this.ring(MID, 380, NEAR, false, 2.5, b.mat));
    this.far.add(this.ring(FAR, 400, MID, false, 90, c.mat));
  }

  private buildSky() {
    const D = 400000;
    const st = new Float32Array(1600 * 3);
    for (let i = 0; i < 1600; i++) { const u = Math.random() * 2 - 1, a = Math.random() * 6.283, r = Math.sqrt(1 - u * u); st.set([r * Math.cos(a) * 7e5, u * 7e5, r * Math.sin(a) * 7e5], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(st, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.7, depthWrite: false }));
    stars.name = 'stars'; stars.frustumCulled = false; this.far.add(stars);
    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(D * Math.tan(0.266 * D2R), 40), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d')!, gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.06, 'rgba(255,244,214,0.75)'); gr.addColorStop(0.25, 'rgba(255,228,170,0.16)'); gr.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.sunGlow.scale.setScalar(D * Math.tan(7 * D2R) * 2);
    const et = new THREE.TextureLoader().load(`${this.o.base}moon/earth_2k.jpg`); et.colorSpace = THREE.SRGBColorSpace;
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(D * Math.tan(EARTH_R * D2R), 48, 32), new THREE.MeshLambertMaterial({ map: et }));
    this.sunLightF = new THREE.DirectionalLight(0xffffff, 3.2);
    this.far.add(this.sunDisc, this.sunGlow, this.earth, this.sunLightF, this.sunLightF.target, new THREE.AmbientLight(0x4466aa, 0.02));
    // light on the rover itself
    this.sunLightN = new THREE.DirectionalLight(0xfff6e6, 0); this.earthLight = new THREE.DirectionalLight(0x9db8ff, 0);
    this.fill = new THREE.PointLight(0xdfe8ff, 0, 6, 1.6);
    this.near.add(this.sunLightN, this.sunLightN.target, this.earthLight, this.earthLight.target, new THREE.AmbientLight(0xcbd5e5, 0.3));
    const beam = (color: number) => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineDashedMaterial({ color, dashSize: 6, gapSize: 4, transparent: true, opacity: 0.85, depthWrite: false }));
      l.frustumCulled = false; this.near.add(l); return l;
    };
    this.beamSun = beam(0xffd23f); this.beamEarth = beam(0x4ade80);
  }

  private buildEffects() {
    // wheel tracks: two ribbons written as the rover moves (a ring buffer of quads)
    const MAXQ = 4000, tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXQ * 6 * 3), 3)); tg.setDrawRange(0, 0);
    this.tracks = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    this.tracks.frustumCulled = false; this.near.add(this.tracks);
    // dust thrown by the wheels: no air, so every grain flies a clean arc
    const DN = 260, dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DN * 3).fill(-9999), 3)); dg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(DN * 3), 3));
    this.dustV = new Float32Array(DN * 3); this.dustLife = new Float32Array(DN);
    // a soft round puff (a bare PointsMaterial draws hard-edged squares)
    const pc = document.createElement('canvas'); pc.width = pc.height = 32;
    const px = pc.getContext('2d')!, grad = px.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.4, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    px.fillStyle = grad; px.fillRect(0, 0, 32, 32);
    const puff = new THREE.CanvasTexture(pc);
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.13, map: puff, alphaTest: 0.01, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.dust.frustumCulled = false; this.near.add(this.dust);
    // the rover's own long shadow, laid along the ground away from the Sun
    const sg = new THREE.PlaneGeometry(1, 1, 1, 14);
    const mask = document.createElement('canvas'); mask.width = 128; mask.height = 256;
    const mg = mask.getContext('2d')!;
    mg.fillStyle = '#fff'; mg.shadowColor = '#fff'; mg.shadowBlur = 5;
    // A soft silhouette breaks up the elongated projection into chassis, wheels and excavation drums.
    mg.fillRect(40, 32, 48, 184); mg.fillRect(24, 45, 80, 35); mg.fillRect(24, 174, 80, 35);
    mg.fillRect(53, 8, 22, 232); mg.fillRect(10, 15, 108, 30); mg.fillRect(10, 211, 108, 30);
    this.shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(mask), color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide }));
    this.shadow.frustumCulled = false; this.near.add(this.shadow);
    // objective marker: a ring on the ground and a thin column of light
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 90, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    col.position.y = 45;
    const circle = (r: number, color: number) => {
      const pts = Array.from({ length: 96 }, (_, i) => new THREE.Vector3(Math.cos((i / 96) * 6.283) * r, 0, Math.sin((i / 96) * 6.283) * r));
      const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false })); l.frustumCulled = false; return l;
    };
    this.goal.add(col, circle(1, 0xffffff)); this.near.add(this.goal);
    this.zoneRing = circle(1, 0x63a1ff); this.near.add(this.zoneRing, this.flags, this.bonusMarks, this.bounce);
  }

  /** Lay a unit circle on the terrain at a local point with a radius. */
  private drape(l: THREE.LineLoop, c: Pt, r: number) {
    const p = l.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) { const a = (i / p.count) * 6.283, e = c.e + Math.cos(a) * r, n = c.n + Math.sin(a) * r; p.setXYZ(i, e, groundY(this.w, e, n, true) + 0.25, -n); }
    p.needsUpdate = true;
  }

  /** Swap the rover while the briefing is open (the ground, plan and clock stay). */
  /** The chosen mission's steps and starting charge, facing its first objective (or the nearest science target). */
  private startMission() {
    this.quest = newQuest(this.plan, this.mission.steps);
    this.taken = this.plan.bonus.map(() => false); this.pickNext(this.plan.start);
    this.vit = newVitals(this.mission.startPct, this.spec);
    const st = this.plan.start, ob = objective(this.quest, this.plan, false, this.chargePct, this.plan.bonus.length);
    const to = ob.target ?? this.nextTarget() ?? this.plan.charge;
    this.psi = Math.atan2(to.e - st.e, to.n - st.n); this.camAz = this.psi / D2R;
  }
  /** Swap the mission while the briefing is open. */
  setMission(id: string) {
    if (this.state !== 'brief' || id === this.mission.id) return;
    this.mission = missionById(id); this.startMission(); this.saveCheck();
  }
  async setRover(id: string) {
    if (this.state !== 'brief' || id === this.def.id) return;
    this.def = roverById(id); this.spec = this.def.spec; this.vit = newVitals(this.mission.startPct, this.spec); this.camDist = this.def.geom.cam;
    await this.buildRover();
    this.saveCheck();
  }
  private clearRover() {
    for (const o of this.roverParts) { o.parent?.remove(o); disposeBuilt(o); }
    this.roverParts = []; this.wheels = []; this.built = null;
  }
  private async buildRover() {
    const gen = ++this.roverGen;
    const b = await buildRover(this.def.id, this.o.base);
    if (!this.live || gen !== this.roverGen) { disposeBuilt(b.body); b.wheels.forEach(disposeBuilt); return; }
    this.clearRover();
    this.built = b;
    this.tilt.add(b.body); this.roverParts.push(b.body);
    for (const w of b.wheels) { this.tilt.add(w); this.wheels.push(w); this.roverParts.push(w); }
    this.fill.position.set(0, this.def.geom.mastH * 0.8 + 0.3, 0.2); if (!this.fill.parent) this.tilt.add(this.fill);
    if (!this.rover.children.includes(this.tilt)) { this.rover.add(this.tilt); this.near.add(this.rover); }
    this.digNow = 0; b.pose(0);
  }
  /** Sampling tool from stowed to working while digging. */
  private poseArms(dt: number) {
    if (!this.built) return;
    this.digNow = dt ? lerp(this.digNow, this.busy?.kind === 'dig' ? 1 : 0, k(4, dt)) : 0;
    this.built.pose(this.digNow);
  }

  /* ---------------- input ---------------- */

  private bind() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (ev) => { this.drag = { x: ev.clientX, y: ev.clientY }; el.setPointerCapture(ev.pointerId); });
    el.addEventListener('pointermove', (ev) => {
      if (!this.drag) return;
      this.camOff -= (ev.clientX - this.drag.x) * 0.28; this.camPitch = clamp(this.camPitch + (ev.clientY - this.drag.y) * 0.2, this.view === 'mast' ? -50 : 3, 85);
      this.drag = { x: ev.clientX, y: ev.clientY };
    });
    const up = () => { this.drag = null; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      if (this.view === 'mast') this.mastFov = clamp(this.mastFov * Math.exp(ev.deltaY * 0.0012), 8, 75);
      else this.camDist = clamp(this.camDist * Math.exp(ev.deltaY * 0.0012), 2.4, 80);
    }, { passive: false });
    window.addEventListener('keydown', this.onKey, true); window.addEventListener('keyup', this.onKey, true);
    window.addEventListener('blur', this.onBlur);
  }
  private onBlur = () => { this.keys.clear(); };
  private onContextLost = (ev: Event) => { ev.preventDefault(); this.fail(new Error('The graphics context was lost. Close other graphics-heavy tabs, then retry.')); };
  private static MAP: Record<string, string> = { arrowup: 'w', arrowdown: 's', arrowleft: 'a', arrowright: 'd', ' ': 'brake', shift: 'boost' };
  private onKey = (ev: KeyboardEvent) => {
    if (this.state !== 'play') return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const tag = (ev.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'BUTTON' && (ev.key === ' ' || ev.key === 'Enter'))) return;
    const key = Game.MAP[ev.key.toLowerCase()] ?? ev.key.toLowerCase();
    if (key === 'escape') return; // the HUD owns pause
    // the game owns the keyboard while it is open: the app's shortcuts (space = play, arrows = time) must not fire
    if (!['w', 'a', 's', 'd', 'brake', 'boost', 'e', 't', 'f', 'z', 'c', 'l'].includes(key)) return;
    ev.stopPropagation();
    ev.preventDefault();
    if (ev.type === 'keydown') { if (!ev.repeat) this.press(key, true); } else this.press(key, false);
  };
  /** A control went down or up (keyboard, or the on-screen buttons). */
  press(key: string, down: boolean) {
    if (down && this.state !== 'play') return;
    if (down) this.keys.add(key); else this.keys.delete(key);
    if (!down || this.state !== 'play') return;
    if (key === 'e') this.act('dig'); else if (key === 't') this.act('tx');
    else if (key === 'z') this.lensTo = this.lensTo ? 0 : 1;
    else if (key === 'c') this.setView(this.view === 'mast' ? 'chase' : 'mast'); // first person <-> third person
    else if (key === 'l') { this.lampAuto = false; this.lampOn = !this.lampOn; }
  }
  private act(kind: 'dig' | 'tx') {
    if (this.busy || this.vit.wh <= 0) return;
    if (kind === 'dig' && this.quest.phase !== 'ice') { this.say({ from: 'RASSOR', text: 'Complete the current objective before collecting samples.' }); return; }
    if (Math.abs(this.v) > 0.3) { this.say({ from: 'RASSOR', text: kind === 'dig' ? 'Stop before digging.' : 'Stop before transmitting.' }); return; }
    if (kind === 'tx' && !this.sky.earthUp) { this.say({ from: 'RASSOR', text: 'No signal. Earth is behind the terrain.' }); return; }
    if (kind === 'tx' && this.quest.phase !== 'phone' && this.quest.phase !== 'uplink') { this.say({ from: 'RASSOR', text: 'Nothing new to send yet.' }); return; }
    this.busy = { kind, p: 0 }; this.v = 0;
  }

  /* ---------------- messages, checkpoints ---------------- */

  private say(m: { from: string; text: string; link?: boolean }) {
    const cs = this.def.callsign;
    m = { ...m, from: m.from === 'RASSOR' ? cs : m.from, text: m.text.replace(/\bRASSOR\b/g, cs) };
    if (m.link && !this.sky.earthUp) this.queue.push(m); else this.cb.onMessage({ from: m.from, text: m.text });
  }
  private once(key: keyof typeof STORY) { if (this.flagsSaid.has(key)) return; this.flagsSaid.add(key); this.say(STORY[key]); }
  private saveCheck() { this.check = { e: this.e, n: this.n, psi: this.psi, vit: { ...this.vit }, simT: this.simT, quest: { phase: this.quest.phase, found: [...this.quest.found] }, odo: this.odo, score: this.score, taken: [...this.taken], parts: [...this.parts] }; }
  /** Back to the last completed step, with at least enough charge to try again. */
  retry() {
    const c = this.check; if (!c) return;
    this.e = c.e; this.n = c.n; this.psi = c.psi; this.v = 0; this.simT = c.simT; this.odo = c.odo; this.busy = null;
    this.vit = { ...c.vit, wh: Math.max(c.vit.wh, this.spec.batteryWh * 0.45), tempC: Math.max(c.vit.tempC, 0) };
    this.quest = { phase: c.quest.phase, found: [...c.quest.found] }; this.score = c.score; this.taken = [...c.taken]; this.pickNext({ e: c.e, n: c.n }); this.parts = [...c.parts]; this.combo = 1; this.skyAt = -1; this.trackLast = null; this.litU = null;
    this.queue = []; this.flagsSaid.clear(); this.held = 0; this.ff = false; this.keys.clear();
    this.camOff = 0; this.tgt.set(0, 0, 0); this.heave = this.heaveV = this.pitchD = this.pitchV = this.rollD = this.rollV = 0;
    this.syncMarkers(); this.syncBonus(); this.state = 'play'; this.last = performance.now();
    cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(this.frame);
  }
  begin() {
    if (this.state !== 'brief') return;
    // the briefing slowly circles the rover; start driving from straight behind it, looking the way it faces
    // (toward the first objective), so forward on the keys is forward on screen
    this.setView('chase'); this.camAz = this.psi / D2R;
    this.lens = this.lensTo = 0; this.tgt.set(0, 0, 0); this.keys.clear(); this.v = 0; this.yawRate = 0;
    this.state = 'play'; this.syncMarkers(); this.syncBonus(); this.say({ from: 'Stored mission brief', text: this.mission.brief });
    this.say({ from: 'Mission control', text: `${this.plan.bonus.length} science targets are marked in red. Drive over one to scan it; scan several in a row for a combo.` });
  }
  /* ---------------- score ---------------- */
  private static BONUS_NAMES = ['Fresh crater rim', 'Boulder trail', 'Bright ray material', 'Glassy impact melt', 'Regolith ripple', 'Ancient ejecta block', 'Dark soil swirl', 'Possible meteorite'];
  private award(pts: number, label: string) {
    this.score += pts; this.parts.push([label, pts]); this.gain = { id: ++this.gainN, pts, label };
  }
  /** The science target the objective marker points at: the nearest one still to scan from where the last scan
   *  (or the start) happened, so the marker holds still while you drive to it. */
  private nextIdx = -1;
  private nextTarget(): Pt | null { return this.nextIdx >= 0 && !this.taken[this.nextIdx] ? this.plan.bonus[this.nextIdx] : null; }
  private pickNext(from: Pt) {
    let best = -1, bd = Infinity;
    this.plan.bonus.forEach((p, i) => { if (!this.taken[i] && distance(p, from) < bd) { bd = distance(p, from); best = i; } });
    this.nextIdx = best;
  }
  private syncBonus() {
    this.bonusMarks.traverse((x) => { const m = x as THREE.Mesh; m.geometry?.dispose(); if (m.isMesh) (m.material as THREE.Material).dispose(); });
    this.bonusMarks.clear();
    this.plan.bonus.forEach((p, i) => {
      if (this.taken[i]) return;
      const g = new THREE.Group(), y = groundY(this.w, p.e, p.n, true);
      g.position.set(p.e, y, -p.n); g.userData.i = i;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), new THREE.MeshBasicMaterial({ color: 0xff6363, transparent: true, opacity: 0.95 }));
      gem.position.y = 1.6; g.add(gem);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 30, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff6363, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.position.y = 15; g.add(beam);
      const ring = new THREE.Mesh(new THREE.RingGeometry(8.4, 9, 48), new THREE.MeshBasicMaterial({ color: 0xff6363, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3; g.add(ring);
      this.bonusMarks.add(g);
    });
  }
  private scanBonus() {
    const now = this.playS;
    this.plan.bonus.forEach((p, i) => {
      if (this.taken[i] || distance(p, { e: this.e, n: this.n }) > 9) return;
      this.taken[i] = true;
      this.combo = now - this.comboAt < 40 ? Math.min(4, this.combo + 1) : 1; this.comboAt = now;
      const name = Game.BONUS_NAMES[i % Game.BONUS_NAMES.length];
      this.award(150 * this.combo, this.combo > 1 ? `${name} ×${this.combo}` : name);
      this.say({ from: this.def.callsign, text: `Scanned: ${name.toLowerCase()}.${this.combo > 1 ? ` Combo ×${this.combo}!` : ''}${this.taken.every(Boolean) ? ' Every science target scanned.' : ''}` });
      this.pickNext({ e: this.e, n: this.n }); this.syncBonus(); this.syncMarkers();
    });
  }
  pause(on: boolean) {
    if (this.state === 'play' && on) { this.state = 'pause'; this.keys.clear(); this.v = 0; this.ff = false; }
    else if (this.state === 'pause' && !on) { this.state = 'play'; this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); }
  }
  pointCamera(body: 'sun' | 'earth') {
    const az = body === 'sun' ? this.sky.sunAz : this.sky.earthAz;
    this.camOff = wrap180(az - this.psi / D2R);
    this.camPitch = this.view === 'mast' ? -(body === 'sun' ? this.sky.sunEl : this.sky.earthEl) : 7;
  }
  zoom(amount: number) {
    if (this.view === 'mast') this.mastFov = clamp(this.mastFov * Math.exp(amount), 8, 75);
    else this.camDist = clamp(this.camDist * Math.exp(amount), 2.4, 80);
  }
  /** Switch to a camera position, with its default angle and distance. */
  setView(v: CamView) {
    this.view = v; this.camOff = 0; this.lensTo = 0;
    if (v === 'mast') { this.camPitch = 0; this.mastFov = 55; return; }
    this.camPitch = CAM_PRESET[v].pitch; this.camDist = this.def.geom.cam * CAM_PRESET[v].dist;
  }
  /** Back to the current view's default angle and distance, behind the rover. */
  resetCamera() { this.setView(this.view); }
  setTags(t: Tags) { this.tags = t; }

  private syncMarkers() {
    const ob = objective(this.quest, this.plan, this.sky.earthUp, this.chargePct, this.taken.filter((x) => !x).length, this.nextTarget());
    this.goal.visible = !!ob.target && this.quest.phase !== 'ice';
    if (ob.target && this.goal.visible) { this.goal.position.set(ob.target.e, groundY(this.w, ob.target.e, ob.target.n, true), -ob.target.n); this.goal.children[1].scale.setScalar(ob.ring); }
    this.zoneRing.visible = this.quest.phase === 'ice';
    if (this.zoneRing.visible) this.drape(this.zoneRing, this.plan.zone.c, this.plan.zone.r);
    this.flags.traverse((x) => { const m = x as THREE.Mesh; m.geometry?.dispose(); if (m.isMesh) (m.material as THREE.Material).dispose(); });
    this.flags.clear();
    this.plan.ice.forEach((p, i) => {
      if (!this.quest.found[i]) return;
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.6, 4), new THREE.MeshBasicMaterial({ color: 0x63a1ff }));
      f.position.set(p.e, groundY(this.w, p.e, p.n, true) + 1.1, -p.n); f.rotation.x = Math.PI; this.flags.add(f);
    });
  }

  /* ---------------- shadows ---------------- */

  private async refreshLit(force = false) {
    if (this.litBusy) return;
    const b = this.bodies(this.simT);
    if (!force && this.litU && Math.acos(clamp(b.sun[0] * this.litU[0] + b.sun[1] * this.litU[1] + b.sun[2] * this.litU[2], -1, 1)) / D2R < 0.1) return;
    this.litBusy = true; this.litU = b.sun;
    for (const l of this.lit) {
      const d = await this.ask(b.sun, 0.266, l.half, LIT_N);
      if (!this.live) return;
      (l.tex.image.data as Uint8Array).set(d); l.tex.needsUpdate = true;
      if (l.half === NEAR) { this.nearLit = d; this.mapBase = null; }
    }
    this.litBusy = false;
  }

  /* ---------------- the frame ---------------- */

  private size() {
    const { clientWidth: w, clientHeight: h } = this.o.host; if (!w || !h) return;
    this.vw = w; this.vh = h;
    this.renderer.setSize(w, h, false); this.cam.aspect = this.farCam.aspect = w / h; this.cam.updateProjectionMatrix(); this.farCam.updateProjectionMatrix();
  }
  private gy = (e: number, n: number) => groundY(this.w, e, n, Math.abs(e) < NEAR && Math.abs(n) < NEAR);

  private frame = (now: number) => {
    if (!this.live) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000)); this.last = now;
    if (this.state === 'play') this.step(dt);
    else if (this.state === 'brief' && !this.o.reduce) this.camOff += dt * 6;
    this.place(this.state === 'pause' ? 0 : dt, now);
    this.renderer.clear(); this.renderer.render(this.far, this.farCam); this.renderer.clearDepth(); this.renderer.render(this.near, this.cam);
    if (now - this.hudAt > 110) { this.hudAt = now; this.cb.onHud(this.hud()); }
    if (this.tags?.map && now - this.mapAt > 260) { this.mapAt = now; this.drawMap(); }
    if (this.state !== 'pause' && this.state !== 'end') this.raf = requestAnimationFrame(this.frame);
  };

  /** Game rules for one frame. */
  private step(dt: number) {
    const K = this.keys, dead = this.vit.wh <= 0;
    const parked = Math.abs(this.v) < 0.05;
    this.ff = K.has('f') && parked && !this.busy;
    const rate = this.ff ? RATE_FF : RATE;
    this.simT = Math.min(this.o.tMax, this.simT + dt * rate * 1000);
    if (this.simT >= this.o.tMax) { this.state = 'end'; this.cb.onEnd('time', this.stats()); return; }
    this.held = this.ff ? this.held + dt : 0;

    // driving
    const thr = dead || this.busy || this.ff ? 0 : (K.has('w') ? 1 : 0) - (K.has('s') ? 1 : 0), steer = dead || this.busy || this.ff ? 0 : (K.has('d') ? 1 : 0) - (K.has('a') ? 1 : 0);
    const fx = Math.sin(this.psi), fn = Math.cos(this.psi);
    this.slope = Math.atan((this.gy(this.e + fx * 0.6, this.n + fn * 0.6) - this.gy(this.e - fx * 0.6, this.n - fn * 0.6)) / 1.2) / D2R;
    const climb = thr >= 0 ? this.slope : -this.slope;
    // Shift: boost. The motors run past their rating, so top speed rises by 80% and the battery drains about four times as fast
    this.boost = K.has('boost') && thr > 0 && !dead && this.vit.wh > 0;
    let vT = thr * this.spec.vMax * (thr < 0 ? 0.55 : this.boost ? BOOST : 1) * clamp(1 - Math.max(0, climb) / 27, 0, 1);
    if (climb > 25 && thr !== 0) {
      vT = -Math.sign(thr) * 0.7;
      if (!this.flagsSaid.has('slope')) { this.flagsSaid.add('slope'); this.say({ from: 'RASSOR', text: 'This slope is too steep. Approach along a gentler route.' }); }
    }
    const acc = K.has('brake') ? 12 : thr === 0 ? 5 : this.boost ? 7 : 4.2;
    this.v += clamp((K.has('brake') ? 0 : vT) - this.v, -acc * dt, acc * dt);
    this.yawRate = lerp(this.yawRate, steer * (1.9 - 0.9 * Math.min(1, Math.abs(this.v) / this.spec.vMax)), k(8, dt));
    this.psi += this.yawRate * dt;
    this.e += fx * this.v * dt; this.n += fn * this.v * dt; this.odo += Math.abs(this.v) * dt;
    const r = Math.hypot(this.e, this.n);
    if (r > BOUND) { this.e *= BOUND / r; this.n *= BOUND / r; this.v *= 0.5; if (!this.flagsSaid.has('edge')) { this.flagsSaid.add('edge'); this.say({ from: 'Mission control', text: 'That is the edge of the mission area. Turn back.' }); } }

    // Sun and Earth from where the rover is now
    if (this.simT - this.skyAt > 20000 || this.skyAt < 0) {
      const was = this.sky; this.sky = this.look(this.simT, this.e, this.n);
      if (this.skyAt >= 0) {
        if (was.earthUp && !this.sky.earthUp) this.say(STORY.noSignal);
        if (!was.earthUp && this.sky.earthUp) { this.say(STORY.signalBack); for (const m of this.queue.splice(0)) this.cb.onMessage(m); }
        if (was.sunFrac > 0.5 && this.sky.sunFrac === 0) this.once('noSun');
      }
      this.skyAt = this.simT; this.syncGoalForSignal();
      void this.refreshLit().catch((e) => this.fail(e));
    }

    // battery and heat
    const lamp = this.lampAuto ? this.sky.sunFrac < 0.3 : this.lampOn;
    this.lampOn = lamp;
    this.vit = stepVitals(this.vit, (dt * rate) / 3600, {
      sunFrac: this.sky.sunFrac, drive: clamp((Math.abs(this.v) / this.spec.vMax) * (1 + Math.max(0, climb) / 15), 0, 2), dig: this.busy?.kind === 'dig', tx: this.busy?.kind === 'tx', lamp, boost: this.boost && Math.abs(this.v) > 0.3,
    }, this.spec);
    this.minTemp = Math.min(this.minTemp, this.vit.tempC);
    if (this.vit.wh / this.spec.batteryWh < 0.2 && this.sky.sunFrac < 0.2) this.once('lowBatt');
    if (this.vit.heaterW > this.spec.heaterMaxW * 0.95) this.once('cold');
    if (this.vit.tempC < this.spec.freezeC) { this.state = 'end'; this.cb.onEnd('frozen', this.stats()); return; }
    if (this.vit.wh <= 0 && (this.spec.solarW <= 0 || this.sky.sunFrac < 0.01)) { this.busy = null; this.state = 'end'; this.cb.onEnd('power', this.stats()); return; }

    // digging and transmitting
    if (this.busy) {
      if (this.vit.wh <= 0) { this.busy = null; this.say({ from: 'RASSOR', text: 'Battery depleted. Work stopped until the panels recharge it.' }); }
      else if (this.busy.kind === 'tx' && !this.sky.earthUp) { this.busy = null; this.say({ from: 'RASSOR', text: 'Signal lost. Transmission stopped.' }); }
      else {
        this.busy.p += dt / (this.busy.kind === 'dig' ? this.def.digS : 3);
        if (this.busy.p >= 1) { const kind = this.busy.kind; this.busy = null; this.event(kind === 'dig' ? { type: 'dug' } : { type: 'sent' }); }
      }
    }
    this.event({ type: 'tick' });
    this.playS += dt;
    this.scanBonus();
  }
  private get chargePct() { return !this.mission.noCharge && this.spec.solarW > 0 ? CHARGE_PCT : 0; }
  private goalEarth = false;
  private syncGoalForSignal() { if (this.goalEarth !== this.sky.earthUp) { this.goalEarth = this.sky.earthUp; this.syncMarkers(); } }
  private event(ev: Parameters<typeof advance>[3]) {
    const r = advance(this.quest, this.plan, { pos: { e: this.e, n: this.n }, battPct: (100 * this.vit.wh) / this.spec.batteryWh, earthUp: this.sky.earthUp, sunFrac: this.sky.sunFrac, parked: Math.abs(this.v) < 0.05, chargePct: this.chargePct, targetsLeft: this.taken.filter((x) => !x).length }, ev);
    this.quest = r.q;
    if (r.dry) this.say(STORY.dry);
    if (r.iceFound !== null) this.award(300, `Ice sample ${this.quest.found.filter(Boolean).length}`);
    if (r.done && r.done !== 'ice') this.award(500, { charge: 'Charged up', phone: 'Contact with Earth', uplink: 'Data delivered', haven: 'Safe haven', targets: 'Survey complete', ice: '', done: '' }[r.done] || 'Objective');
    if (r.iceFound !== null && !r.done) this.say(STORY.ice1);
    if (r.iceFound !== null || r.done) this.syncMarkers();
    if (r.done) {
      this.say(r.done === 'ice' && this.quest.phase !== 'uplink' ? STORY.iceOut : STORY[r.done]); this.saveCheck();
      if (this.quest.phase === 'done') { this.say(STORY.done); this.pause(true); this.cb.onEnd('done', this.stats()); }
    }
  }
  private stats(): Stats {
    const battPct = (100 * this.vit.wh) / this.spec.batteryWh, done = this.quest.phase === 'done';
    const parts: [string, number][] = [...this.parts];
    if (done) {
      parts.push(['Speed bonus', Math.max(0, Math.round(this.mission.speedPts - this.playS * this.mission.perS))]);
      parts.push(['Battery left', Math.round(battPct * 6)]);
      if (this.taken.every(Boolean)) parts.push(['Every target scanned', 800]);
    }
    const score = parts.reduce((a, [, v]) => a + v, 0);
    const [two, three] = this.mission.stars, stars = !done ? 0 : score >= three ? 3 : score >= two ? 2 : 1;
    return { odo: this.odo, hours: (this.simT - this.t0) / 3600000, found: this.quest.found.filter(Boolean).length, minTempC: this.minTemp, battPct, score, bonus: this.taken.filter(Boolean).length, bonusTotal: this.taken.length, parts, stars, playS: this.playS };
  }

  /** Put everything where it belongs for this frame: rover, effects, sky, camera. */
  private place(dt: number, now: number) {
    const { e, n, psi } = this, up = new THREE.Vector3(0, 1, 0);
    // rover on the ground: four wheel contacts give pitch and roll
    const f = new THREE.Vector3(Math.sin(psi), 0, -Math.cos(psi)), l = new THREE.Vector3(-Math.cos(psi), 0, -Math.sin(psi));
    const h = (df: number, dl: number) => this.gy(e + f.x * df + l.x * dl, n - (f.z * df + l.z * dl));
    const G = this.def.geom;
    const hfl = h(G.wb, G.tw), hfr = h(G.wb, -G.tw), hrl = h(-G.wb, G.tw), hrr = h(-G.wb, -G.tw);
    const F = f.clone().multiplyScalar(2 * G.wb).addScaledVector(up, (hfl + hfr - hrl - hrr) / 2).normalize();
    const L = l.clone().multiplyScalar(2 * G.tw).addScaledVector(up, (hfl + hrl - hfr - hrr) / 2).normalize();
    const Un = new THREE.Vector3().crossVectors(F, L).normalize(); L.crossVectors(Un, F);
    const y = (hfl + hfr + hrl + hrr) / 4 + G.wr * 0.94;
    this.rover.position.set(e, y, -n);
    this.rover.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(L, Un, F));
    if (dt > 0) {
      // motion deflections: the body squats, dives, leans and bounces on springs; the wheels stay on the ground
      const a = (this.v - (this as unknown as { _v?: number })._v!) / dt || 0; (this as unknown as { _v?: number })._v = this.v;
      const spring = (x: number, vel: number, to: number, w: number, z: number): [number, number] => { const acc = w * w * (to - x) - 2 * z * w * vel; vel += acc * dt; return [x + vel * dt, vel]; };
      [this.pitchD, this.pitchV] = spring(this.pitchD, this.pitchV, clamp(a * 0.011, -0.09, 0.09), 9, 0.35);
      [this.rollD, this.rollV] = spring(this.rollD, this.rollV, clamp(this.yawRate * this.v * 0.012, -0.08, 0.08), 8, 0.4);
      const vy = (y - this.lastY) / dt; this.lastY = y;
      [this.heave, this.heaveV] = spring(this.heave, this.heaveV, clamp(-vy * 0.012, -0.05, 0.05), 13, 0.3);
      const shake = this.busy?.kind === 'dig' ? 0.006 * Math.sin(now * 0.09) : 0;
      this.tilt.rotation.set(-this.pitchD, 0, this.rollD + shake); this.tilt.position.y = this.heave;
      // wheels turn with the ground speed of their own side (skid steering), drums only while digging
      const vl = this.v - this.yawRate * G.tw, vr = this.v + this.yawRate * G.tw;
      this.wheels.forEach((g, i) => { g.rotation.x += ((i % 2 === 0 ? vl : vr) / G.wr) * dt; });
      if (this.busy?.kind === 'dig') this.built?.spin(dt);
      this.poseArms(dt);
      this.fx(dt, f, l, [hrl, hrr]);
    }

    // sky: Sun and Earth at the ephemeris direction, at infinity from wherever the camera is
    const s = this.sky, sd = dirOf(s.sunAz, s.sunEl), ed = dirOf(s.earthAz, s.earthEl);
    this.U.uSun.value.copy(sd); this.U.uEarth.value.copy(ed);
    this.U.uSunI.value = s.sunEl > -2 ? 2.3 : 0; this.U.uEarthI.value = 0.012;
    this.sunLightN.intensity = 3.4 * s.sunFrac; this.sunLightN.position.copy(this.rover.position).addScaledVector(sd, 50); this.sunLightN.target.position.copy(this.rover.position);
    this.earthLight.intensity = s.earthUp ? 0.05 : 0; this.earthLight.position.copy(this.rover.position).addScaledVector(ed, 50); this.earthLight.target.position.copy(this.rover.position);
    this.fill.intensity = this.lampOn ? 2.2 : 1.2;
    // sunlit regolith throws light back up onto the rover's shaded side (the only 'ambient' light on the Moon)
    this.bounce.intensity = 0.12 + 1.1 * s.sunFrac;
    this.near.environmentIntensity = 0.08 + 0.32 * s.sunFrac;
    const lampP = this.rover.localToWorld(new THREE.Vector3(0, Math.max(0.35, G.mastH * 0.4), G.wb + 0.05)), lampD = new THREE.Vector3(0, -0.2, 1).normalize().transformDirection(this.rover.matrixWorld);
    this.U.uLampPos.value.copy(lampP); this.U.uLampDir.value.copy(lampD); this.U.uLampI.value = this.lampOn && this.vit.wh > 0 ? 5 : 0;

    this.camera(dt, now);
    const cp = this.cam.position, D = 400000;
    this.sunDisc.position.copy(cp).addScaledVector(sd, D); this.sunDisc.lookAt(cp); this.sunGlow.position.copy(this.sunDisc.position);
    (this.sunGlow.material as THREE.SpriteMaterial).opacity = 0.9;
    this.earth.position.copy(cp).addScaledVector(ed, D);
    this.sunLightF.position.copy(this.earth.position).addScaledVector(sd, 1000); this.sunLightF.target.position.copy(this.earth.position);
    (this.far.getObjectByName('stars') as THREE.Points).position.copy(cp);
    this.farCam.position.copy(cp); this.farCam.quaternion.copy(this.cam.quaternion); this.farCam.fov = this.cam.fov; this.farCam.updateProjectionMatrix();

    // links: a line from the rover toward each body, cut short at the terrain when it is blocked
    const top = this.rover.position.clone().addScaledVector(Un, G.mastH * 0.5);
    const beam = (ln: THREE.Line, d: THREE.Vector3, ok: boolean, hit: number, okColor: number) => {
      const p = ln.geometry.getAttribute('position') as THREE.BufferAttribute, len = ok ? 6000 : clamp(hit, 15, 6000);
      p.setXYZ(0, top.x, top.y, top.z); p.setXYZ(1, top.x + d.x * len, top.y + d.y * len, top.z + d.z * len); p.needsUpdate = true; ln.computeLineDistances();
      const m = ln.material as THREE.LineDashedMaterial; m.color.setHex(ok ? okColor : 0xff5a5a); m.opacity = ok ? 0.55 + 0.25 * Math.sin(now * 0.004) : 0.9;
      m.dashSize = ok ? 5 : 1.2; m.gapSize = ok ? 3 : 1.2;
    };
    beam(this.beamSun, sd, s.sunFrac > 0, s.sunHit, 0xffd23f); beam(this.beamEarth, ed, s.earthUp, s.earthHit, 0x4ade80);

    // eyes adjust: brighter picture in the dark, stopped down in sunlight
    this.exposure = lerp(this.exposure, lerp(2.6, 1.05, clamp(s.sunFrac, 0, 1)), k(1.2, dt || 0.016));
    this.renderer.toneMappingExposure = this.exposure;
    this.goal.rotation.y += dt * 0.6;
    for (const g of this.bonusMarks.children) { const gem = g.children[0]; gem.rotation.y += dt * 1.6; gem.position.y = 1.6 + 0.25 * Math.sin(now * 0.003 + (g.userData.i as number)); }
    this.placeTags();
  }

  /** Wheel tracks, dust and the rover's shadow. */
  private fx(dt: number, f: THREE.Vector3, l: THREE.Vector3, rearH: number[]) {
    const { e, n } = this;
    // tracks
    const G = this.def.geom, cur = [G.tw, -G.tw].map((dl) => { const x = e + l.x * dl, z = -n + l.z * dl; return new THREE.Vector3(x, this.gy(x, -z) + 0.025, z); });
    if (!this.trackLast) this.trackLast = cur;
    this.trackDist += Math.abs(this.v) * dt;
    if (this.trackDist > 0.45) {
      this.trackDist = 0;
      const p = this.tracks.geometry.getAttribute('position') as THREE.BufferAttribute, MAXQ = p.count / 6;
      cur.forEach((c, i) => {
        const a = this.trackLast![i], w = l.clone().multiplyScalar(Math.max(0.075, G.wr * 0.3)), q = (this.trackN++ % MAXQ) * 6;
        const pts = [a.clone().sub(w), a.clone().add(w), c.clone().sub(w), c.clone().sub(w), a.clone().add(w), c.clone().add(w)];
        pts.forEach((v, j) => p.setXYZ(q + j, v.x, v.y, v.z));
      });
      p.needsUpdate = true; this.tracks.geometry.setDrawRange(0, Math.min(this.trackN, MAXQ) * 6); this.trackLast = cur;
    }
    // dust
    const dp = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute, dc = this.dust.geometry.getAttribute('color') as THREE.BufferAttribute, DN = dp.count;
    const bright = 0.05 + 0.55 * this.sky.sunFrac + (this.lampOn ? 0.12 : 0);
    const spawn = (x: number, y: number, z: number, vx: number, vy: number, vz: number) => {
      const i = this.dustI++ % DN; dp.setXYZ(i, x, y, z); this.dustV.set([vx, vy, vz], i * 3); this.dustLife[i] = 1;
    };
    const sp = Math.abs(this.v);
    if (!this.o.reduce && sp > 0.6) for (let c = 0; c < Math.ceil(sp * dt * (this.boost ? 16 : 9)); c++) {
      const side = Math.random() < 0.5 ? 0 : 1, dl = side ? -G.tw : G.tw, back = -(G.wb + 0.05) * Math.sign(this.v);
      spawn(e + f.x * back + l.x * dl, rearH[side] + 0.05, -n + f.z * back + l.z * dl, -f.x * this.v * 0.25 + (Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 1.1, -f.z * this.v * 0.25 + (Math.random() - 0.5) * 0.8);
    }
    if (!this.o.reduce && this.busy?.kind === 'dig') for (let c = 0; c < 3; c++) {
      const d = this.def.id !== 'badger' ? G.wb + 0.15 : Math.random() < 0.5 ? 0.78 : -0.78;
      spawn(e + f.x * d + l.x * (Math.random() - 0.5) * 0.7, this.rover.position.y - 0.15, -n + f.z * d + l.z * (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 1.6, 0.8 + Math.random() * 1.8, (Math.random() - 0.5) * 1.6);
    }
    for (let i = 0; i < DN; i++) {
      if (this.dustLife[i] <= 0) continue;
      this.dustLife[i] -= dt / 1.7; this.dustV[i * 3 + 1] -= 1.62 * dt;
      dp.setXYZ(i, dp.getX(i) + this.dustV[i * 3] * dt, dp.getY(i) + this.dustV[i * 3 + 1] * dt, dp.getZ(i) + this.dustV[i * 3 + 2] * dt);
      const b = this.dustLife[i] > 0 ? bright * this.dustLife[i] : 0; dc.setXYZ(i, b, b * 0.96, b * 0.9);
      if (this.dustLife[i] <= 0) dp.setXYZ(i, 0, -9999, 0);
    }
    dp.needsUpdate = dc.needsUpdate = true;
    // shadow strip
    const s = this.sky, sh = this.shadow, sp2 = sh.geometry.getAttribute('position') as THREE.BufferAttribute;
    sh.visible = s.sunFrac > 0.05 && s.sunEl > 0.15;
    if (sh.visible) {
      const len = clamp(Math.max(0.5, G.mastH * 0.45) / Math.tan(s.sunEl * D2R), 1, 60), ax = -Math.sin(s.sunAz * D2R), an = -Math.cos(s.sunAz * D2R), px = -an, pn = ax, rows = sp2.count / 2;
      for (let r = 0; r < rows; r++) {
        const t = r / (rows - 1), d = t * len, wd = Math.max(0.5, G.tw * 1.2) * (1 - 0.35 * t);
        for (const [c, sgn] of [[0, -1], [1, 1]] as const) { const x = e + ax * d + px * wd * sgn, nn = n + an * d + pn * wd * sgn; sp2.setXYZ(r * 2 + c, x, this.gy(x, nn) + 0.03, -nn); }
      }
      sp2.needsUpdate = true; (sh.material as THREE.MeshBasicMaterial).opacity = 0.62 * s.sunFrac;
    }
  }

  private camera(dt: number, now: number) {
    const cam = this.cam, rp = this.rover.position, d = dt || 0.016;
    this.lens = lerp(this.lens, this.lensTo, k(3.2, d));
    // the camera sits exactly behind the rover: while driving, any look-around offset eases back to dead astern,
    // and the camera follows the heading closely in every view
    if (this.drag === null && Math.abs(this.v) > 0.05 && this.view !== 'top') this.camOff *= 1 - k(3, d);
    const want = this.psi / D2R + this.camOff;
    this.camAz += wrap180(want - this.camAz) * k(14, d);
    const az = this.camAz * D2R;
    if (this.view === 'mast') {
      const p = this.camPitch * D2R, look = new THREE.Vector3(Math.sin(az) * Math.cos(p), -Math.sin(p), -Math.cos(az) * Math.cos(p));
      cam.position.copy(rp).add(new THREE.Vector3(0, this.def.geom.mastH, 0)); cam.up.set(0, 1, 0); cam.lookAt(cam.position.clone().add(look));
      cam.fov = lerp(this.mastFov, Math.min(this.mastFov, 14), this.lens);
    } else {
      // perspective zoom: the long lens pulls the camera back as it narrows, so the rover stays the same size
      // while the hills, the Sun and Earth behind it swell
      const sp = Math.min(1.6, Math.abs(this.v) / this.spec.vMax), wide = 58 + (this.o.reduce ? 0 : 7 * sp * sp), fov = Math.exp(lerp(Math.log(wide), Math.log(17), this.lens));
      const dist = this.camDist * (Math.tan((wide / 2) * D2R) / Math.tan((fov / 2) * D2R));
      const p = lerp(this.camPitch, Math.min(this.camPitch, 9), this.lens) * D2R;
      const look = new THREE.Vector3(Math.sin(az) * Math.cos(p), -Math.sin(p), -Math.cos(az) * Math.cos(p));
      // aim at the middle of the rover itself, held tightly, so it stays in the centre of the screen at any speed
      const to = rp.clone().add(new THREE.Vector3(0, Math.max(0.35, this.def.geom.mastH * 0.3), 0));
      if (this.tgt.lengthSq() === 0) this.tgt.copy(to);
      this.tgt.lerp(to, k(14, d));
      cam.position.copy(this.tgt).addScaledVector(look, -dist);
      if (!this.o.reduce) { // road feel: a little shake that grows with speed
        const a = 0.012 * sp; cam.position.x += a * Math.sin(now * 0.031); cam.position.y += a * Math.sin(now * 0.047 + 1.3);
      }
      const floor = this.gy(cam.position.x, -cam.position.z) + 0.45;
      if (cam.position.y < floor) cam.position.y = floor;
      // lean into turns, nod with acceleration
    this.camRoll = lerp(this.camRoll, this.o.reduce ? 0 : clamp(-this.yawRate * this.v * 0.012, -0.05, 0.05), k(4, d));
      cam.up.set(Math.sin(this.camRoll) * Math.cos(az), Math.cos(this.camRoll), Math.sin(this.camRoll) * Math.sin(az));
      cam.lookAt(this.tgt);
      cam.fov = fov;
    }
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }

  /** Sky labels and the objective label follow their targets on screen, or sit on the nearest edge with an arrow. */
  private placeTags() {
    const t = this.tags; if (!t) return;
    const W = this.vw, H = this.vh, cam = this.cam, v = new THREE.Vector3();
    const put = (el: HTMLElement, world: THREE.Vector3, show: boolean) => {
      if (!show) { el.style.opacity = '0'; return; }
      v.copy(world).project(cam);
      const behind = world.clone().sub(cam.position).dot(cam.getWorldDirection(new THREE.Vector3())) < 0;
      let x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      if (behind) { x = W - x; y = H - y; }
      const m = W < 641 ? 52 : 80, top = W < 641 ? 285 : 165, bottom = W < 641 ? 200 : 150;
      const on = !behind && x > m && x < W - m && y > top && y < H - bottom;
      if (!on) {
        const cx = W / 2, cy = H / 2, dx = x - cx || 1e-3, dy = (behind ? Math.abs(y - cy) + H : y - cy) || 1e-3;
        const sc = Math.max(0.05, Math.min((cx - m) / Math.abs(dx), (cy - (dy < 0 ? top : bottom)) / Math.abs(dy)));
        x = cx + dx * sc; y = cy + dy * sc; el.style.setProperty('--ang', `${Math.atan2(dy, dx)}rad`);
      }
      el.classList.toggle('edge', !on); el.style.opacity = '1'; el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    };
    const s = this.sky, cp = cam.position;
    put(t.sun, dirOf(s.sunAz, s.sunEl).multiplyScalar(1e5).add(cp), true);
    put(t.earth, dirOf(s.earthAz, s.earthEl).multiplyScalar(1e5).add(cp), true);
    const ob = objective(this.quest, this.plan, s.earthUp, this.chargePct, this.taken.filter((x) => !x).length, this.nextTarget());
    put(t.goal, ob.target ? new THREE.Vector3(ob.target.e, this.gy(ob.target.e, ob.target.n) + 4, -ob.target.n) : cp, !!ob.target && this.state === 'play');
  }

  private hud(): Hud {
    const s = this.sky, ob = objective(this.quest, this.plan, s.earthUp, this.chargePct, this.taken.filter((x) => !x).length, this.nextTarget()), pos = { e: this.e, n: this.n };
    const ice = iceSignal(this.quest, this.plan, pos, this.def.detectM);
    return {
      t: this.simT, rate: this.ff ? RATE_FF : RATE, battPct: (100 * this.vit.wh) / this.spec.batteryWh, netW: this.vit.solarW - this.vit.loadW, solarW: this.vit.solarW,
      sunFrac: s.sunFrac, earthUp: s.earthUp, tempC: this.vit.tempC, heaterW: this.vit.heaterW, speed: this.v, heading: ((this.psi / D2R) % 360 + 360) % 360, slope: this.slope,
      ice, canDig: this.plan.ice.some((p, i) => !this.quest.found[i] && distance(p, pos) <= DIG_M), busy: this.busy ? { ...this.busy } : null, obj: ob,
      objDist: ob.target ? distance(ob.target, pos) : null, objBearing: ob.target ? ((Math.atan2(ob.target.e - this.e, ob.target.n - this.n) / D2R) + 360) % 360 : null,
      found: this.quest.found.filter(Boolean).length, total: this.quest.found.length, sunAz: s.sunAz, sunEl: s.sunEl, earthAz: s.earthAz, earthEl: s.earthEl,
      lamp: this.lampOn, view: this.view, tele: this.lensTo > 0, odo: this.odo, dead: this.vit.wh <= 0, phase: this.quest.phase, camAz: ((this.camAz % 360) + 360) % 360, held: this.held, boost: this.boost,
      steps: stepsOf(this.quest), score: this.score, combo: this.playS - this.comboAt < 40 ? this.combo : 1, bonus: this.taken.filter(Boolean).length, bonusTotal: this.taken.length, gain: this.gain,
      nearBonus: this.plan.bonus.reduce<number | null>((m, p, i) => (this.taken[i] ? m : Math.min(m ?? Infinity, distance(p, pos))), null),
    };
  }

  /** North-up map: lit and shadowed ground, the objective, the rover, and which way the Sun and Earth are. */
  private drawMap() {
    const cv = this.tags?.map; if (!cv || this.state === 'load') return;
    const g = cv.getContext('2d')!, S = cv.width, sc = S / (2 * NEAR), X = (e: number) => (e + NEAR) * sc, Y = (n: number) => (NEAR - n) * sc;
    if (!this.mapBase) {
      const b = (this.mapBase = document.createElement('canvas')); b.width = b.height = LIT_N;
      const bg = b.getContext('2d')!, im = bg.createImageData(LIT_N, LIT_N), step = (2 * NEAR) / LIT_N;
      for (let j = 0; j < LIT_N; j++) for (let i = 0; i < LIT_N; i++) {
        const e = -NEAR + (i + 0.5) * step, n = NEAR - (j + 0.5) * step, hs = clamp(0.5 + (groundY(this.w, e - 12, n + 12, false) - groundY(this.w, e + 12, n - 12, false)) * 0.035, 0.25, 1);
        const v = 26 + (this.nearLit[j * LIT_N + i] / 255) * 190 * hs + 22 * hs, q = (j * LIT_N + i) * 4;
        im.data[q] = v; im.data[q + 1] = v; im.data[q + 2] = v * 1.04; im.data[q + 3] = 255;
      }
      bg.putImageData(im, 0, 0);
    }
    g.imageSmoothingEnabled = true; g.drawImage(this.mapBase, 0, 0, S, S);
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,0.5)'; g.setLineDash([4, 4]); g.beginPath(); g.arc(S / 2, S / 2, BOUND * sc, 0, 6.283); g.stroke(); g.setLineDash([]);
    if (this.quest.phase === 'ice') { g.strokeStyle = '#63a1ff'; g.lineWidth = 2; g.beginPath(); g.arc(X(this.plan.zone.c.e), Y(this.plan.zone.c.n), this.plan.zone.r * sc, 0, 6.283); g.stroke(); }
    this.plan.ice.forEach((p, i) => { if (this.quest.found[i]) { g.fillStyle = '#63a1ff'; g.fillRect(X(p.e) - 3, Y(p.n) - 3, 6, 6); } });
    this.plan.bonus.forEach((p, i) => { if (this.taken[i]) return; const x = X(p.e), y = Y(p.n); g.strokeStyle = '#ff6363'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.stroke(); });
    const ob = objective(this.quest, this.plan, this.sky.earthUp, this.chargePct, this.taken.filter((x) => !x).length, this.nextTarget());
    if (ob.target && this.quest.phase !== 'ice') { const x = X(ob.target.e), y = Y(ob.target.n); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.fill(); }
    const tick = (az: number, color: string) => { const a = az * D2R, r = S / 2 - 5; g.fillStyle = color; g.beginPath(); g.arc(S / 2 + Math.sin(a) * r, S / 2 - Math.cos(a) * r, 5, 0, 6.283); g.fill(); };
    tick(this.sky.sunAz, '#ffd23f'); tick(this.sky.earthAz, '#63a1ff');
    g.save(); g.translate(X(this.e), Y(this.n)); g.rotate(this.psi); g.fillStyle = '#ff6363'; g.strokeStyle = '#000'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.stroke(); g.restore();
  }

  dispose() {
    if (!this.live) return;
    this.live = false; cancelAnimationFrame(this.raf); this.ro?.disconnect(); this.worker?.terminate();
    const cancelled = new Error('The rover session was closed.');
    this.loadReject?.(cancelled); this.loadReject = null;
    for (const p of this.mapWait.values()) { clearTimeout(p.timer); p.reject(cancelled); } this.mapWait.clear();
    window.removeEventListener('keydown', this.onKey, true); window.removeEventListener('keyup', this.onKey, true); window.removeEventListener('blur', this.onBlur);
    for (const sc of [this.near, this.far]) sc.traverse((x) => {
      const m = x as THREE.Mesh; m.geometry?.dispose?.();
      for (const mt of ([] as THREE.Material[]).concat(m.material ?? [])) { (mt as THREE.MeshBasicMaterial).map?.dispose(); mt.dispose(); }
    });
    this.lit.forEach((l) => l.tex.dispose()); this.near.environment?.dispose();
    if (this.renderer) { this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost); this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove(); }
  }
}
