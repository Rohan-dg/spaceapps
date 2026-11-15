/**
 * The whole Moon in 3D, always on screen, flying down to the selected landing site.
 *
 * Data, coarse to fine (all NASA LRO):
 *   globe   LROC WAC colour (8k) + LOLA 64 px/deg relief normals + LOLA 16 px/deg heights
 *   cap     LOLA LDEM_80S_80M, 80°S to the pole, resampled to 148 m
 *   patch   LOLA polar DEM around the site: 5 m (87.5°S+), 10 m (85°S+) or 20 m
 *   below the patch resolution: procedural craters, boulders and regolith (illustrative, labelled in the HUD)
 * Lighting uses the true Sun and Earth directions at the selected time; shadows are ray-marched on the heights.
 */
import gsap from 'gsap';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as Astro from 'astronomy-engine';
import type { SiteInfo } from '../lib/data';
import { bodyFixedGeometry, eqjToMoonFixed } from '../lib/ephemeris';
import { type EqGrid, type PolarGrid, R_KM, type V3, dirOf, enu, posOf, sampleEq, sampleGrid, stereoLatLon, stereoXY } from '../lib/moon/frames';
import { CAP_F, CAP_V, EARTH_F, EARTH_V, GLOBE_F, GLOBE_V, PATCH_F, PATCH_V } from '../lib/moon/shaders';
import { horizonFrom, probeNow, probePeriod, type ProbePeriod } from '../lib/moon/probe';
import { CAP_SEGMENTS, CORE_DEPTH_KM, GLOBE_SEGMENTS, constrainCamera, createSurfaceSampler } from '../lib/moon/surface';
import { planSunlight, roverRange, validateRover, type SunPlan } from '../lib/moon/rover';
import { DEFAULT_PLAN, gcInterp } from '../lib/mission';
import { Icon } from './Icons';
const TerrainViewport = lazy(() => import('./TerrainViewport'));

const base = import.meta.env.BASE_URL;

interface HiMeta { id: string; dem: string; resM: number; n: number; lat: number; lon: number; siteRow: number; siteCol: number; row0: number; col0: number; projOffset: number; hMinM: number; quantumM: number }
interface TexMeta { height_4k: { w: number; h: number; hMinM: number; quantumM: number }; south: { n: number; resM: number; halfM: number; hMinM: number; quantumM: number } }

/* ---------- height decoding in a worker ---------- */
interface HeightMip { data: Float32Array; w: number; h: number }
interface Heights { w: number; h: number; data: Float32Array; mips: HeightMip[] }
let worker: Worker | null = null;
let reqId = 0;
const pending = new Map<number, (v: Heights | Error) => void>();
export function decodeHeights(url: string, hMin: number, quantum: number) {
  worker ??= (() => {
    const w = new Worker(new URL('../workers/heightDecode.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e) => { const cb = pending.get(e.data.id); pending.delete(e.data.id); cb?.(e.data.error ? new Error(e.data.error) : e.data); };
    return w;
  })();
  const id = ++reqId;
  return new Promise<Heights>((res, rej) => {
    pending.set(id, (v) => (v instanceof Error ? rej(v) : res(v)));
    // resolve against the page: inside the worker a relative URL would resolve against the worker script in /assets/
    worker!.postMessage({ id, url: new URL(url, document.baseURI).href, hMin, quantum });
  });
}

/**
 * Height texture (R32F). With a mip chain (box-filtered in the worker) the shaders read the level that
 * matches the screen footprint, which is what keeps shadows and slopes from shimmering while zooming.
 */
function floatTex(data: Float32Array, w: number, h: number, linear: boolean, repeatS = false, mips: HeightMip[] = []) {
  const t = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.FloatType);
  t.magFilter = linear ? THREE.LinearFilter : THREE.NearestFilter;
  if (mips.length) {
    t.minFilter = linear ? THREE.LinearMipmapLinearFilter : THREE.NearestMipmapNearestFilter;
    t.mipmaps = [{ data, width: w, height: h }, ...mips.map((m) => ({ data: m.data, width: m.w, height: m.h }))];
  } else t.minFilter = t.magFilter;
  t.wrapS = repeatS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/* ---------- view presets ---------- */
type Scale = 'moon' | 'region' | 'site' | 'ground' | 'boots';
const SCALES: { id: Scale; label: string; km: number }[] = [
  { id: 'moon', label: 'Moon', km: 7200 },
  { id: 'region', label: '200 km', km: 260 },
  { id: 'site', label: '10 km', km: 9 },
  { id: 'ground', label: '50 m', km: 0.06 },
  { id: 'boots', label: '1 m', km: 0.0016 },
];

const v3 = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);
const fmtRes = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : m >= 1 ? `${m.toFixed(m >= 10 ? 0 : 1)} m` : m >= 0.01 ? `${(m * 100).toFixed(m >= 0.1 ? 0 : 1)} cm` : `${(m * 1000).toFixed(1)} mm`);
const fmtLatLon = (lat: number, lon: number) => {
  const l = ((lon % 360) + 360) % 360;
  return `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'}  ·  ${l > 180 ? `${(360 - l).toFixed(4)}° W` : `${l.toFixed(4)}° E`}`;
};
const fmtPct = (x: number) => `${x >= 99.95 || x < 0.05 ? x.toFixed(0) : x.toFixed(1)}%`;
const fmtClear = (d: number) => `${Math.abs(d).toFixed(2)}° ${d >= 0 ? 'above' : 'below'} the skyline`;
/** Default battery life without sunlight: the mission plan's usable charge over its driving load. */
const DEFAULT_BATTERY_H = (DEFAULT_PLAN.batteryWh * (1 - DEFAULT_PLAN.reservePct / 100)) / (DEFAULT_PLAN.hotelW + DEFAULT_PLAN.driveW);
interface RangeShown { lat: number; lon: number; batteryH: number; speedKmH: number; oneWayKm: number; returnKm: number; longestDarkH: number | null }
interface Probe { lat: number; lon: number; groundM: number; hz: number[]; resM: number; src: string; distKm: number | null }
const fmtAlt = (km: number) => (km >= 1 ? `${km.toFixed(km >= 100 ? 0 : 1)} km` : `${(km * 1000).toFixed(km * 1000 >= 10 ? 0 : 1)} m`);

export default function MoonView({ sites, selectedId, t, onSelect }: {
  sites: SiteInfo[]; selectedId: string; t: number; onSelect: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const readout = useRef<{ res: HTMLElement | null; alt: HTMLElement | null; src: HTMLElement | null }>({ res: null, alt: null, src: null });
  const [status, setStatus] = useState('Loading the LROC mosaic');
  const [scale, setScale] = useState<Scale>('moon');
  const [shadows, setShadows] = useState(true);
  const [detail, setDetail] = useState(true);
  const [relief, setRelief] = useState(1);
  const [hiInfo, setHiInfo] = useState<HiMeta | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const [fill, setFill] = useState(false);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [period, setPeriod] = useState<ProbePeriod | null>(null);
  const probePin = useRef<HTMLDivElement>(null);
  const rangePin = useRef<HTMLDivElement>(null);
  const sunPin = useRef<HTMLDivElement>(null);
  const sunPtr = useRef<HTMLDivElement>(null);
  const earthPtr = useRef<HTMLDivElement>(null);
  const [pointers, setPointers] = useState(true);
  const [sunPlan, setSunPlan] = useState<SunPlan | 'busy' | null>(null);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeIn, setRangeIn] = useState({ lat: '', lon: '', hours: DEFAULT_BATTERY_H.toFixed(1), speed: String(DEFAULT_PLAN.speedKmH) });
  const [rangeErr, setRangeErr] = useState<string | null>(null);
  const [rangeShown, setRangeShown] = useState<RangeShown | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);

  // everything three.js lives here so React re-renders never rebuild the scene
  const S = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls;
    u: Record<string, THREE.IUniform>; patch: THREE.Mesh | null; patchOrigin: V3; earth: THREE.Mesh; sun: THREE.Sprite;
    eq: EqGrid | null; cap: PolarGrid | null; hi: PolarGrid | null; mode: 'globe' | 'site'; flying: gsap.core.Tween | null;
    request: () => void; markers: { id: string; el: HTMLButtonElement; pos: THREE.Vector3 }[]; meta: TexMeta | null;
    exag: number; core: THREE.Mesh; probePos: THREE.Vector3 | null; rangeGroup: THREE.Group; rangePos: THREE.Vector3 | null; sunPos: THREE.Vector3 | null;
    terrainM: (lat: number, lon: number) => { h: number; resM: number; src: string };
    surfaceRadius: (p: THREE.Vector3) => number;
  } | null>(null);

  const siteList = useMemo(() => sites.filter((s) => isFinite(s.lat)), [sites]);
  const sel = siteList.find((s) => s.id === selectedId) ?? null;

  /* ---------- scene setup (once) ---------- */
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    } catch { setFail('WebGL is not available in this browser, so the 3D Moon cannot be shown.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 1);
    el.prepend(renderer.domElement);
    const linearFloat = renderer.extensions.has('OES_texture_float_linear');

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, el.clientWidth / Math.max(1, el.clientHeight) || 1, 1e-4, 3e6);
    camera.up.set(0, 0, 1);
    camera.position.set(0, -16000, -6000);

    const blank = floatTex(new Float32Array([0]), 1, 1, false);
    const loader = new THREE.TextureLoader();
    const grey = new THREE.DataTexture(new Uint8Array([140, 138, 134, 255]), 1, 1); grey.needsUpdate = true; grey.colorSpace = THREE.SRGBColorSpace;
    const flat = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); flat.needsUpdate = true;
    const u: Record<string, THREE.IUniform> = {
      uSun: { value: new THREE.Vector3(1, 0, 0) }, uEarthDir: { value: new THREE.Vector3(0, -1, 0) },
      uEarthshine: { value: 0.02 }, uSunPower: { value: 1.35 }, uFill: { value: 0 },
      uColor: { value: grey }, uNormal: { value: flat }, uEqH: { value: blank },
      uCap: { value: blank }, uCapHalf: { value: 304000 }, uCapRes: { value: 148.4 }, uCapOn: { value: 0 },
      uHi: { value: blank }, uHiOn: { value: 0 }, uHiRes: { value: 5 }, uHiOff: { value: 0 }, uHiRC0: { value: new THREE.Vector2() }, uHiN: { value: 1 },
      uRelief: { value: 1 }, uShadows: { value: 1 }, uExag: { value: 1 }, uCam: { value: new THREE.Vector3() },
      uCamLocal: { value: new THREE.Vector3() }, uDetail: { value: 1 },
      // precision anchor for the globe and cap shaders (see shaders.ts): a 2048 m lattice point under the camera
      uAnchorIdx: { value: new THREE.Vector3() }, uAnchorKm: { value: new THREE.Vector3() },
      uAnchorCorr: { value: new THREE.Vector3() }, uCamRel: { value: new THREE.Vector3() },
    };
    const mat = (vertexShader: string, fragmentShader: string) => new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: u });

    // globe
    const gGeo = new THREE.SphereGeometry(1, GLOBE_SEGMENTS, GLOBE_SEGMENTS / 2);
    gGeo.rotateX(Math.PI / 2);
    const globe = new THREE.Mesh(gGeo, mat(GLOBE_V, GLOBE_F));
    globe.frustumCulled = false;
    scene.add(globe);
    // solid core just below the deepest terrain: wherever the surface meshes leave a seam or a hole
    // (globe/cap/patch edges, exaggerated relief) you see rock, not the far side or the stars
    const core = new THREE.Mesh(new THREE.SphereGeometry(1, 180, 90), new THREE.MeshBasicMaterial({ color: 0x24221f }));
    core.scale.setScalar(R_KM - CORE_DEPTH_KM);
    core.renderOrder = 1;
    scene.add(core);
    // rover range rings (filled in by the range effect)
    const rangeGroup = new THREE.Group();
    scene.add(rangeGroup);
    // polar cap (positions are stereographic km; the vertex shader puts them on the sphere)
    const cGeo = new THREE.PlaneGeometry(608, 608, CAP_SEGMENTS, CAP_SEGMENTS);
    const cap = new THREE.Mesh(cGeo, mat(CAP_V, CAP_F));
    cap.frustumCulled = false;
    cap.visible = false;
    scene.add(cap);

    // stars: fixed seed so the sky is the same every visit
    {
      const N = 7000, p = new Float32Array(N * 3), c = new Float32Array(N * 3);
      let s = 1234567;
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < N; i++) {
        const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z);
        p.set([r * Math.cos(a) * 2e6, r * Math.sin(a) * 2e6, z * 2e6], i * 3);
        const b = Math.pow(rnd(), 6) * 0.9 + 0.08, warm = rnd();
        c.set([b * (0.85 + 0.15 * warm), b * 0.9, b * (1.05 - 0.2 * warm)], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false, toneMapped: false }));
      stars.frustumCulled = false;
      stars.renderOrder = -1;
      scene.add(stars);
    }
    // sun: a sprite with a hard disc and a faint corona (no atmosphere, so no sky glow)
    const sunTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.07, 'rgba(255,253,245,1)'); gr.addColorStop(0.09, 'rgba(255,240,215,0.55)');
      gr.addColorStop(0.25, 'rgba(255,225,190,0.12)'); gr.addColorStop(1, 'rgba(255,220,180,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, sizeAttenuation: false, depthWrite: false, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending }));
    sun.scale.set(0.09, 0.09, 1);
    scene.add(sun);
    // earth
    const earthMat = new THREE.ShaderMaterial({ vertexShader: EARTH_V, fragmentShader: EARTH_F, uniforms: { uMap: { value: grey }, uSun: u.uSun, uCam: u.uCam } });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(6371, 96, 48), earthMat);
    earth.matrixAutoUpdate = false;
    scene.add(earth);
    loader.load(`${base}moon/earth_2k.jpg`, (tx) => { tx.colorSpace = THREE.SRGBColorSpace; earthMat.uniforms.uMap.value = tx; request(); });

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = R_KM + 60; controls.maxDistance = 40000; controls.enablePan = false;

    let raf = 0;
    const request = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const st = {
      renderer, scene, camera, controls, u, patch: null as THREE.Mesh | null, patchOrigin: [0, 0, 0] as V3, earth, sun,
      eq: null as EqGrid | null, cap: null as PolarGrid | null, hi: null as PolarGrid | null, mode: 'globe' as 'globe' | 'site',
      flying: null as gsap.core.Tween | null, request, markers: [] as { id: string; el: HTMLButtonElement; pos: THREE.Vector3 }[], meta: null as TexMeta | null,
      exag: 1, core, probePos: null as THREE.Vector3 | null, terrainM, rangeGroup, rangePos: null as THREE.Vector3 | null, sunPos: null as THREE.Vector3 | null,
      surfaceRadius: (p: THREE.Vector3): number => surfaceRadius(p),
    };
    const surfaceRadius = createSurfaceSampler(() => ({ eq: st.eq, cap: st.cap, hi: st.hi, exag: st.exag, capHalfM: st.meta?.south.halfM ?? 304000 }));
    S.current = st;
    if (import.meta.env.DEV) Object.assign(window as object, { __moon: st, __gsap: gsap });

    const tmp = new THREE.Vector3();
    /** True terrain height (m) from the finest loaded grid, with its resolution and source. */
    function terrainM(lat: number, lon: number) {
      if (lat < -80) {
        const [x, y] = stereoXY(lat, lon);
        if (st.hi) { const h = sampleGrid(st.hi, x, y); if (!isNaN(h)) return { h, resM: st.hi.resM, src: `LOLA ${st.hi.resM} m site patch` }; }
        if (st.cap) { const h = sampleGrid(st.cap, x, y); if (!isNaN(h)) return { h, resM: st.cap.resM, src: `LOLA polar ${Math.round(st.cap.resM)} m` }; }
      }
      if (st.eq) return { h: sampleEq(st.eq, lat, lon), resM: (Math.PI * R_KM * 1000) / st.eq.hgt, src: `LOLA global ${((Math.PI * R_KM) / st.eq.hgt).toFixed(1)} km` };
      return { h: 0, resM: 5000, src: 'reference sphere (heights still loading)' };
    }
    /** Radius (km) of the rendered ground under a point: the site patch is true scale, globe and cap carry the relief exaggeration. */
    function groundKm(p: THREE.Vector3) {
      const r = p.length(), lat = Math.asin(p.z / r) * 180 / Math.PI, lon = Math.atan2(p.y, p.x) * 180 / Math.PI;
      const g = terrainM(lat, lon);
      return R_KM + (g.h * (g.src.includes('site patch') ? 1 : st.exag)) / 1000;
    }
    /** First hit of a screen ray with the rendered ground (sphere-traced on the height grids), or null. */
    function pickGround(ndcX: number, ndcY: number) {
      const rc = new THREE.Raycaster();
      rc.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
      const o = rc.ray.origin, d = rc.ray.direction;
      const Rmax = R_KM + 11 * st.exag + 0.05;
      const b = o.dot(d), c = o.lengthSq() - Rmax * Rmax, disc = b * b - c;
      if (disc < 0) return null;
      const tEnd = -b + Math.sqrt(disc);
      let t = Math.max(0, -b - Math.sqrt(disc)), prev = t;
      const at = (x: number) => o.clone().addScaledVector(d, x);
      const alt = (x: number) => { const p = at(x); return p.length() - groundKm(p); };
      let f = alt(t);
      for (let i = 0; i < 6000 && t < tEnd; i++) {
        if (f < 0) {
          let lo = prev, hi = t;
          for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (alt(m) < 0) hi = m; else lo = m; }
          return at(hi);
        }
        prev = t;
        t += Math.max(f * 0.3, 2e-7 * (t + 1));
        f = alt(t);
      }
      return null;
    }
    function frame() {
      raf = 0;
      const moving = st.flying ? false : st.controls.update();
      constrainCamera(camera.position, st.controls.target, surfaceRadius, st.mode === 'site' && !st.flying);
      camera.lookAt(st.controls.target);
      u.uCam.value.copy(camera.position);
      {
        // anchor = ground point under the camera, snapped to whole 2048 m cells; everything here is float64,
        // and uAnchorCorr carries the float32 rounding of the km value so the shader can undo it exactly
        const r0 = camera.position.length() || 1, k = (R_KM * 1000) / r0, A = 2048;
        const ai = [Math.round((camera.position.x * k) / A), Math.round((camera.position.y * k) / A), Math.round((camera.position.z * k) / A)];
        const am = ai.map((i) => i * A), akm = am.map((m) => Math.fround(m / 1000));
        u.uAnchorIdx.value.set(ai[0], ai[1], ai[2]);
        u.uAnchorKm.value.set(akm[0], akm[1], akm[2]);
        u.uAnchorCorr.value.set(akm[0] * 1000 - am[0], akm[1] * 1000 - am[1], akm[2] * 1000 - am[2]);
        u.uCamRel.value.set(camera.position.x * 1000 - am[0], camera.position.y * 1000 - am[1], camera.position.z * 1000 - am[2]);
      }
      if (st.patch) u.uCamLocal.value.copy(camera.position).sub(st.patch.position);
      st.sun.position.copy(camera.position).addScaledVector(u.uSun.value, 1e5);
      renderer.render(scene, camera);
      // markers
      const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
      // declutter: the selected site first, then any marker whose label would overlap one already shown
      const placed: [number, number][] = [];
      const order = [...st.markers].sort((a, b) => Number(b.el.classList.contains('on')) - Number(a.el.classList.contains('on')));
      for (const m of order) {
        tmp.copy(m.pos).project(camera);
        const toCam = camera.position.clone().sub(m.pos);
        const facing = toCam.dot(m.pos) / (toCam.length() * m.pos.length());
        const sx = ((tmp.x + 1) / 2) * w, sy = ((1 - tmp.y) / 2) * h;
        let show = tmp.z < 1 && facing > 0.02 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05 && toCam.length() > 3;
        if (show && placed.some(([x, y]) => Math.abs(x - sx) < 90 && Math.abs(y - sy) < 18)) show = false;
        if (show) placed.push([sx, sy]);
        m.el.style.opacity = show ? '1' : '0';
        m.el.style.pointerEvents = show ? 'auto' : 'none';
        m.el.style.transform = `translate(${sx}px, ${sy}px)`;
      }
      // Sun and Earth pointers: a ring on the body when it is on screen, otherwise an arrow at the edge
      // pointing the shortest way to turn toward it
      {
        const cx = w / 2, cy = h / 2, inset = 34;
        const earthPos = new THREE.Vector3().setFromMatrixPosition(st.earth.matrix);
        const sunPos = camera.position.clone().addScaledVector(u.uSun.value as THREE.Vector3, 1e5);
        for (const [el, world] of [[sunPtr.current, sunPos], [earthPtr.current, earthPos]] as const) {
          if (!el) continue;
          const d = world.clone().applyMatrix4(camera.matrixWorldInverse);
          tmp.copy(world).project(camera);
          // hidden by the Moon? (ray from the camera hits the lunar sphere before reaching the body)
          const o = camera.position, dir = world.clone().sub(o), len = dir.length(); dir.divideScalar(len);
          const bq = o.dot(dir), cq = o.lengthSq() - R_KM * R_KM, disc = bq * bq - cq;
          const blocked = disc > 0 && -bq - Math.sqrt(disc) > 0 && -bq - Math.sqrt(disc) < len;
          const onScreen = d.z < 0 && Math.abs(tmp.x) < 0.9 && Math.abs(tmp.y) < 0.86;
          let x: number, y: number, ang = 0;
          if (onScreen) { x = ((tmp.x + 1) / 2) * w; y = ((1 - tmp.y) / 2) * h; }
          else {
            let dx = d.x, dy = d.y;
            if (Math.hypot(dx, dy) < 1e-9) { dx = 0; dy = -1; }
            const k = Math.min((cx - inset) / Math.max(Math.abs(dx), 1e-9), (cy - inset) / Math.max(Math.abs(dy), 1e-9));
            x = cx + dx * k; y = cy - dy * k; ang = Math.atan2(-dy, dx);
          }
          el.style.transform = `translate(${x}px, ${y}px)`;
          el.style.setProperty('--ang', `${ang}rad`);
          el.classList.toggle('edge', !onScreen);
          el.classList.toggle('blocked', blocked);
          el.style.opacity = '1';
        }
      }
      // probe and rover-range pins
      for (const [pin, pp] of [[probePin.current, st.probePos], [rangePin.current, st.rangePos], [sunPin.current, st.sunPos]] as const) {
        if (!pin) continue;
        let show = false;
        if (pp) {
          tmp.copy(pp).project(camera);
          const toCam = camera.position.clone().sub(pp);
          show = tmp.z < 1 && toCam.dot(pp) / (toCam.length() * pp.length()) > 0.0 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
          pin.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
        }
        pin.style.opacity = show ? '1' : '0';
      }
      // readouts: ground resolution at the screen centre and altitude
      const alt = camera.position.length() - surfaceRadius(camera.position);
      if (import.meta.env.DEV) el.dataset.cameraClearanceM = String(alt * 1000);
      const dist = camera.position.distanceTo(st.controls.target);
      const mpp = (2 * dist * 1000 * Math.tan((camera.fov * Math.PI) / 360)) / h;
      const ro = readout.current;
      if (ro.res) ro.res.textContent = `${fmtRes(mpp)} / px`;
      if (ro.alt) ro.alt.textContent = fmtAlt(Math.max(0, alt));
      if (ro.src) {
        const hiRes = st.hi?.resM ?? Infinity;
        const near = st.mode === 'site' && st.patch && dist < 40;
        ro.src.textContent = !near ? (alt > 1500 ? 'LROC WAC 8k · LOLA 64 px/deg' : 'LOLA polar 148 m · LROC WAC')
          : mpp < hiRes / 3 && u.uDetail.value > 0 ? `LOLA ${hiRes} m + procedural below ${hiRes} m` : `LOLA ${hiRes} m/px`;
      }
      if (moving) request();
    }
    controls.addEventListener('change', request);

    // a click (not a drag) on the ground probes that point
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => { down = e.isPrimary ? [e.clientX, e.clientY] : null; };
    const onUp = (e: PointerEvent) => {
      const d0 = down; down = null;
      if (!d0 || st.flying || Math.hypot(e.clientX - d0[0], e.clientY - d0[1]) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const hit = pickGround(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      if (hit) pickRef.current(hit);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    if (import.meta.env.DEV) (window as unknown as { __moonFrame: () => void }).__moonFrame = frame;

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, true);
      camera.aspect = w / h; camera.updateProjectionMatrix(); request();
    });
    ro.observe(el);

    /* progressive data loading: small textures first, then the 8k mosaic and the height maps */
    const texture = (path: string, srgb: boolean) => new Promise<THREE.Texture>((res, rej) => loader.load(`${base}${path}`, (tx) => {
      tx.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      tx.wrapS = THREE.RepeatWrapping; tx.anisotropy = renderer.capabilities.getMaxAnisotropy();
      res(tx);
    }, undefined, rej));
    let alive = true;
    (async () => {
      try {
        const [c2, n2, meta] = await Promise.all([texture('moon/color_2k.jpg', true), texture('moon/normal_2k.jpg', false), fetch(`${base}moon/textures.json`).then((r) => r.json() as Promise<TexMeta>)]);
        if (!alive) return;
        st.meta = meta;
        u.uColor.value = c2; u.uNormal.value = n2; request();
        setStatus('Loading LOLA heights');
        const eh = meta.height_4k;
        const eq = await decodeHeights(`${base}moon/height_4k.png`, eh.hMinM, eh.quantumM);
        if (!alive) return;
        st.eq = { h: eq.data, w: eq.w, hgt: eq.h };
        u.uEqH.value = floatTex(eq.data, eq.w, eq.h, linearFloat, true, eq.mips); request();
        setStatus('Loading the south polar terrain');
        const sm = meta.south;
        const sp = await decodeHeights(`${base}moon/south_height.png`, sm.hMinM, sm.quantumM);
        if (!alive) return;
        st.cap = { h: sp.data, n: sp.w, resM: sm.resM, x0: -sm.halfM + sm.resM / 2, y0: sm.halfM - sm.resM / 2 };
        u.uCap.value = floatTex(sp.data, sp.w, sp.h, linearFloat, false, sp.mips); u.uCapHalf.value = sm.halfM; u.uCapRes.value = sm.resM; u.uCapOn.value = 1;
        cap.visible = true; request();
        setStatus('Loading the 8k LROC mosaic');
        const [c8, n8] = await Promise.all([texture('moon/color_8k.jpg', true), texture('moon/normal_8k.jpg', false)]);
        if (!alive) return;
        u.uColor.value = c8; u.uNormal.value = n8; c2.dispose(); n2.dispose();
        setStatus(''); request();
      } catch (e) { setStatus(`Some terrain failed to load (${String(e)})`); }
    })();

    // pause rendering work when the Moon is scrolled out of view
    const io = new IntersectionObserver(([en]) => { if (en.isIntersecting) request(); });
    io.observe(el);
    return () => {
      alive = false; ro.disconnect(); io.disconnect(); cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      st.flying?.kill(); st.controls.dispose();
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mm = m.material as THREE.Material | undefined; mm?.dispose?.(); });
      renderer.dispose(); renderer.domElement.remove(); S.current = null;
    };
  }, []);

  /* ---------- time: Sun, Earth and earthshine ---------- */
  useEffect(() => {
    const st = S.current; if (!st) return;
    const date = new Date(t);
    const g = bodyFixedGeometry(date);
    const sun = v3(g.sunKm as V3).normalize(), eKm = v3(g.earthKm as V3);
    st.u.uSun.value.copy(sun);
    st.u.uEarthDir.value.copy(eKm.clone().normalize());
    // Earth's lit fraction seen from the Moon drives earthshine (boosted so night-side terrain stays readable)
    const sunFromEarth = v3(g.sunKm as V3).sub(eKm).normalize(), moonFromEarth = eKm.clone().negate().normalize();
    const frac = (1 + sunFromEarth.dot(moonFromEarth)) / 2;
    st.u.uEarthshine.value = 0.004 + 0.05 * frac;
    // Earth: its spin axis and sidereal rotation, carried into the Moon-fixed frame
    const axis = Astro.RotationAxis(Astro.Body.Moon, Astro.MakeTime(date));
    const gst = Astro.SiderealTime(date) * 15 * Math.PI / 180;
    const toMF = (v: V3) => v3(eqjToMoonFixed(v, axis) as V3);
    const c = Math.cos(gst), s = Math.sin(gst);
    // sphere geometry axes: +x = Greenwich, +y = north, +z = 90°W
    const bx = toMF([c, s, 0]), by = toMF([0, 0, 1]), bz = toMF([s, -c, 0]);
    st.earth.matrix.makeBasis(bx, by, bz).setPosition(eKm);
    st.earth.matrixWorldNeedsUpdate = true;
    st.request();
  }, [t]);

  /* ---------- markers ---------- */
  useEffect(() => {
    const st = S.current, layer = labels.current; if (!st || !layer) return;
    layer.replaceChildren();
    st.markers = siteList.map((s) => {
      const b = document.createElement('button');
      b.className = `moon-marker${s.id === selectedId ? ' on' : ''}`;
      b.innerHTML = `<i></i><span>${s.short || s.name}</span>`;
      b.setAttribute('aria-label', `Fly to ${s.name}`);
      b.onclick = () => { onSelect(s.id); if (s.lat < -80.5 && !s.id.startsWith('custom')) setViewer(s.id); };
      layer.appendChild(b);
      return { id: s.id, el: b, pos: v3(posOf(s.lat, s.lon, (s.siteHeightM ?? 0) + 30)) };
    });
    st.request();
  }, [siteList, selectedId, onSelect]); // setViewer is stable

  /* ---------- camera flights ---------- */
  const fly = useCallback((toPos: THREE.Vector3, toTarget: THREE.Vector3, up: THREE.Vector3, mode: 'globe' | 'site', dur = 2.6) => {
    const st = S.current; if (!st) return;
    st.flying?.kill();
    const { camera, controls } = st;
    controls.enabled = false;
    const p0 = camera.position.clone(), t0 = controls.target.clone(), up0 = camera.up.clone();
    const r0 = p0.length(), r1 = toPos.length();
    const a0 = Math.max(r0 - st.surfaceRadius(p0), 0.001), a1 = Math.max(r1 - st.surfaceRadius(toPos), 0.001);
    const d0 = p0.clone().normalize(), d1 = toPos.clone().normalize();
    const ang = d0.angleTo(d1);
    const hop = Math.min(2600, Math.max(0, ang * R_KM * 0.5));
    const o = { k: 0 };
    st.mode = mode;
    st.flying = gsap.to(o, {
      k: 1, duration: dur, ease: 'power3.inOut',
      onUpdate: () => {
        const k = o.k;
        const dir = new THREE.Vector3().copy(d0).lerp(d1, k).normalize();
        if (ang > 1e-4) { const q = new THREE.Quaternion().setFromUnitVectors(d0, d1); dir.copy(d0).applyQuaternion(new THREE.Quaternion().slerp(q, k)); }
        // Interpolate clearance above the actual terrain, including destinations below the reference sphere.
        const alt = Math.exp(Math.log(a0) * (1 - k) + Math.log(a1) * k) + hop * Math.sin(Math.PI * k);
        camera.position.copy(dir.multiplyScalar(st.surfaceRadius(dir) + alt));
        controls.target.copy(t0).lerp(toTarget, gsap.parseEase('power2.inOut')(k));
        camera.up.copy(up0).applyQuaternion(new THREE.Quaternion().slerp(new THREE.Quaternion().setFromUnitVectors(up0, up), k));
        camera.lookAt(controls.target);
        st.request();
      },
      onComplete: () => {
        st.flying = null;
        camera.up.copy(up);
        // OrbitControls caches the up vector, so rebuild it for the new frame
        const target = controls.target.clone();
        controls.dispose();
        const c = new OrbitControls(camera, st.renderer.domElement);
        c.target.copy(target);
        c.enableDamping = true; c.dampingFactor = 0.08;
        c.zoomSpeed = 2.2; c.rotateSpeed = 0.6;
        c.screenSpacePanning = false;
        if (mode === 'globe') { c.minDistance = R_KM + 60; c.maxDistance = 40000; c.enablePan = false; }
        else {
          c.minDistance = 0.0012; c.maxDistance = 9000; c.enablePan = true; c.panSpeed = 0.6;
          c.maxPolarAngle = Math.PI / 2 - 0.02;
        }
        c.addEventListener('change', st.request);
        st.controls = c;
        st.request();
      },
    });
  }, []);

  const goTo = useCallback((sc: Scale, dur?: number) => {
    const st = S.current; if (!st) return;
    setScale(sc);
    const sunMF = st.u.uSun.value as THREE.Vector3;
    if (sc === 'moon' || !sel) {
      // look at the site's hemisphere from about 70° off the Sun, so the terminator and its long shadows cross the disc
      const up = sel ? v3(dirOf(sel.lat, sel.lon)) : new THREE.Vector3(0, 0, -1);
      const side = new THREE.Vector3().crossVectors(sunMF, up).normalize();
      const dir = up.clone().multiplyScalar(0.9).add(sunMF.clone().multiplyScalar(0.55)).add(side.multiplyScalar(0.5)).normalize();
      // portrait screens: back off so the whole disc fits the narrow width
      const fit = Math.max(1, 0.95 / Math.max(st.camera.aspect, 0.3));
      fly(dir.multiplyScalar(SCALES[0].km * fit), new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 'globe', dur);
      return;
    }
    const { e, n, u } = enu(sel.lat, sel.lon);
    const E = v3(e), N = v3(n), U = v3(u);
    const hSite = (st.hi ? sampleGrid(st.hi, ...stereoXY(sel.lat, sel.lon)) : NaN);
    const target = v3(posOf(sel.lat, sel.lon, isNaN(hSite) ? sel.siteHeightM ?? 0 : hSite));
    target.setLength(st.surfaceRadius(target));
    // stand on the sunward side looking away from the Sun, so faces are lit and shadows run away from you
    const sh = new THREE.Vector3(sunMF.dot(E), sunMF.dot(N), 0);
    if (sh.lengthSq() < 1e-8) sh.set(0, 1, 0);
    sh.normalize();
    const az = Math.atan2(sh.x, sh.y) + 0.45;
    const D = SCALES.find((s) => s.id === sc)!.km;
    const el = sc === 'region' ? 0.75 : sc === 'site' ? 0.42 : sc === 'ground' ? 0.3 : 0.5;
    const off = E.clone().multiplyScalar(Math.sin(az) * Math.cos(el)).add(N.clone().multiplyScalar(Math.cos(az) * Math.cos(el))).add(U.clone().multiplyScalar(Math.sin(el)));
    fly(target.clone().addScaledVector(off, D), target, U, 'site', dur);
  }, [fly, sel]);

  /* ---------- site patch: real high-resolution LOLA terrain ---------- */
  const firstSite = useRef(selectedId);
  useEffect(() => {
    const st = S.current; if (!st || !sel) return;
    let live = true;
    const clear = () => {
      if (st.patch) { st.scene.remove(st.patch); st.patch.geometry.dispose(); (st.patch.material as THREE.Material).dispose(); st.patch = null; }
      st.hi = null; st.u.uHiOn.value = 0; setHiInfo(null);
    };
    clear();
    // fly only when the user picked this site; the first load keeps the whole-Moon intro
    if (selectedId !== firstSite.current) firstSite.current = '\u0000picked';
    const picked = firstSite.current === '\u0000picked';
    const arrive = (fallback: Scale) => { if (picked) goTo(scale === 'moon' ? fallback : scale); };
    (async () => {
      let meta: HiMeta | null = null;
      if (sel.lat < -80.5 && !sel.id.startsWith('custom')) {
        meta = await fetch(`${base}hires/${sel.id}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      }
      if (!live) return;
      if (!meta) { arrive('region'); return; }
      const dec = await decodeHeights(`${base}hires/${sel.id}.png`, meta.hMinM, meta.quantumM);
      if (!live) return;
      const n = meta.n, res = meta.resM, off = meta.projOffset;
      const x0 = (meta.col0 - off) * res, y0 = (off - meta.row0) * res;
      st.hi = { h: dec.data, n, resM: res, x0, y0 };
      const u = st.u;
      u.uHi.value?.dispose?.();
      u.uHi.value = floatTex(dec.data, n, n, st.renderer.extensions.has('OES_texture_float_linear'), false, dec.mips);
      u.uHiRes.value = res; u.uHiOff.value = off; (u.uHiRC0.value as THREE.Vector2).set(meta.row0, meta.col0); u.uHiN.value = n; u.uHiOn.value = 1;
      // geometry: every 2nd sample for the 5 m windows (10 m vertices; lighting uses every sample)
      const step = n > 1100 ? 2 : 1, m = Math.floor((n - 1) / step) + 1;
      const [xs, ys] = stereoXY(sel.lat, sel.lon);
      const hSite = sampleGrid(st.hi, xs, ys);
      const origin = posOf(sel.lat, sel.lon, hSite);
      const pos = new Float32Array(m * m * 3), xy = new Float32Array(m * m * 2), loc = new Float32Array(m * m * 2);
      for (let r = 0, k = 0; r < m; r++) for (let c = 0; c < m; c++, k++) {
        const rr = r * step, cc = c * step;
        const x = x0 + cc * res, y = y0 - rr * res;
        const [la, lo] = stereoLatLon(x, y);
        const p = posOf(la, lo, dec.data[rr * n + cc]);
        pos[k * 3] = p[0] - origin[0]; pos[k * 3 + 1] = p[1] - origin[1]; pos[k * 3 + 2] = p[2] - origin[2];
        xy[k * 2] = x; xy[k * 2 + 1] = y; loc[k * 2] = x - xs; loc[k * 2 + 1] = y - ys;
      }
      // skirt: a wall hanging 3 km down from every edge vertex, shaded like the ground at the edge,
      // so the patch reads as solid rock wherever it meets the coarser (or exaggerated) cap around it
      const ring: number[] = [];
      for (let c = 0; c < m - 1; c++) ring.push(c);
      for (let r = 0; r < m - 1; r++) ring.push(r * m + m - 1);
      for (let c = m - 1; c > 0; c--) ring.push((m - 1) * m + c);
      for (let r = m - 1; r > 0; r--) ring.push(r * m);
      const nv = m * m, ns = ring.length, SKIRT_KM = 3;
      const P = new Float32Array((nv + ns) * 3), XY = new Float32Array((nv + ns) * 2), LOC = new Float32Array((nv + ns) * 2);
      P.set(pos); XY.set(xy); LOC.set(loc);
      ring.forEach((v, i) => {
        const ax = pos[v * 3] + origin[0], ay = pos[v * 3 + 1] + origin[1], az = pos[v * 3 + 2] + origin[2];
        const k = 1 - SKIRT_KM / Math.hypot(ax, ay, az), j = nv + i;
        P[j * 3] = ax * k - origin[0]; P[j * 3 + 1] = ay * k - origin[1]; P[j * 3 + 2] = az * k - origin[2];
        XY[j * 2] = xy[v * 2]; XY[j * 2 + 1] = xy[v * 2 + 1]; LOC[j * 2] = loc[v * 2]; LOC[j * 2 + 1] = loc[v * 2 + 1];
      });
      const idx = new Uint32Array((m - 1) * (m - 1) * 6 + ns * 12);
      let k = 0;
      for (let r = 0; r < m - 1; r++) for (let c = 0; c < m - 1; c++) {
        const a = r * m + c, b = a + 1, d = a + m, e2 = d + 1;
        idx.set([a, d, b, b, d, e2], k); k += 6;
      }
      for (let i = 0; i < ns; i++) {
        const a = ring[i], b = ring[(i + 1) % ns], a2 = nv + i, b2 = nv + ((i + 1) % ns);
        idx.set([a, b, a2, b, b2, a2, a, a2, b, b, a2, b2], k); k += 12; // both windings: visible from either side
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('aXY', new THREE.BufferAttribute(XY, 2));
      geo.setAttribute('aLocal', new THREE.BufferAttribute(LOC, 2));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: PATCH_V, fragmentShader: PATCH_F, uniforms: u }));
      mesh.position.set(origin[0], origin[1], origin[2]);
      mesh.frustumCulled = false;
      st.scene.add(mesh);
      st.patch = mesh; st.patchOrigin = origin;
      setHiInfo(meta);
      st.request();
      arrive('site');
    })().catch(() => live && arrive('region'));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id]);

  // H or Home key: back to the home view (ignored while typing)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'h' || e.key === 'H' || e.key === 'Home') { e.preventDefault(); goToRef.current('moon'); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  // first visit: drift in from deep space (runs once per mount; the ref keeps the latest goTo)
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  useEffect(() => {
    goToRef.current('moon', 3.4);
    const tw = hud.current ? gsap.from(hud.current.querySelectorAll('.hud-anim'), { opacity: 0, y: 14, duration: 1.1, ease: 'power3.out', stagger: 0.08, delay: 0.6 }) : null;
    return () => { tw?.progress(1).kill(); };
  }, []);

  /* ---------- toggles ---------- */
  useEffect(() => {
    const st = S.current; if (!st) return;
    st.u.uShadows.value = shadows ? 1 : 0; st.u.uDetail.value = detail ? 1 : 0; st.u.uRelief.value = relief; st.u.uExag.value = relief;
    st.u.uFill.value = fill ? 0.55 : 0;
    st.exag = relief; st.core.scale.setScalar(R_KM - CORE_DEPTH_KM * relief);
    st.request();
  }, [shadows, detail, relief, fill]);

  /* ---------- point probe ---------- */
  const pickRef = useRef<(p: THREE.Vector3) => void>(() => {});
  useEffect(() => {
    pickRef.current = (p: THREE.Vector3) => {
      const st = S.current; if (!st) return;
      const r = p.length(), lat = Math.asin(p.z / r) * 180 / Math.PI, lon = Math.atan2(p.y, p.x) * 180 / Math.PI;
      const g = st.terrainM(lat, lon);
      const hz = horizonFrom((la, lo) => st.terrainM(la, lo).h, lat, lon, g.h, g.resM);
      const distKm = sel ? v3(dirOf(sel.lat, sel.lon)).angleTo(v3(dirOf(lat, lon))) * R_KM : null;
      st.probePos = v3(posOf(lat, lon, g.h * (g.src.includes('site patch') ? 1 : st.exag)));
      setPeriod(null);
      setProbe({ lat, lon, groundM: g.h, hz, resM: g.resM, src: g.src, distKm });
      recenter(lat, lon);
      st.request();
      if (rangeOpen) {
        const next = { ...rangeIn, lat: lat.toFixed(4), lon: (((lon % 360) + 360) % 360).toFixed(4) };
        setRangeIn(next);
        applyRangeRef.current(next, false);
      }
    };
    // recenter only touches refs and the stable fly()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, rangeOpen, rangeIn]);
  /**
   * Make a clicked point the pivot of the camera: it glides to the centre of the view, and from then on
   * dragging orbits around that point (about its local vertical) and scrolling zooms toward it.
   */
  const recenter = (lat: number, lon: number) => {
    const st = S.current; if (!st || st.flying) return;
    const gg = st.terrainM(lat, lon);
    const P = v3(posOf(lat, lon, gg.h * (gg.src.includes('site patch') ? 1 : st.exag)));
    const U = P.clone().normalize();
    const cam = st.camera.position.clone();
    // keep the viewing distance: from the old pivot when zoomed in, from the surface point on the globe view
    const dist = Math.min(8500, st.mode === 'globe' ? cam.distanceTo(P) : cam.distanceTo(st.controls.target));
    // keep the viewing direction, but never from below ~15° elevation or from exactly overhead
    const dir = cam.sub(P).normalize();
    const elev = dir.dot(U);
    if (elev < 0.26) dir.addScaledVector(U, 0.26 - elev).normalize();
    if (dir.dot(U) > 0.985) dir.addScaledVector(v3(enu(lat, lon).n), -0.18).normalize();
    fly(P.clone().addScaledVector(dir, dist), P, U, 'site', 1.3);
  };

  /* ---------- rover range on battery ---------- */
  const groundAt = (lat: number, lon: number) => {
    const st = S.current!; const gg = st.terrainM(lat, lon);
    return { true: gg.h, drawn: gg.h * (gg.src.includes('site patch') ? 1 : st.exag) };
  };
  const applyRange = (inp: typeof rangeIn, flyThere: boolean) => {
    const st = S.current; if (!st) return;
    const q = { lat: Number(inp.lat), lon: Number(inp.lon), batteryH: Number(inp.hours), speedKmH: Number(inp.speed) };
    const err = validateRover(q);
    setRangeErr(err);
    if (err) return;
    const r = roverRange(q, 4);
    const h0 = groundAt(q.lat, q.lon).true;
    // can the battery carry the rover through the longest dark stretch here in the next lunar cycle?
    let longestDarkH: number | null = null;
    try {
      const gg = st.terrainM(q.lat, q.lon);
      const hz = horizonFrom((la, lo) => st.terrainM(la, lo).h, q.lat, q.lon, h0, gg.resM);
      longestDarkH = probePeriod(q.lat, q.lon, h0, hz, Math.round(t / 1800000) * 1800000).longestDarkH;
    } catch { longestDarkH = null; }
    setRangeShown({ lat: q.lat, lon: q.lon, batteryH: q.batteryH, speedKmH: q.speedKmH, oneWayKm: r.oneWayKm, returnKm: r.returnKm, longestDarkH });
    // nearest sunlight the rover can drive to (or wait for) on this charge; deferred so the rings draw first
    setSunPlan('busy');
    const t0 = t;
    setTimeout(() => {
      const gg = st.terrainM(q.lat, q.lon);
      const hzStart = horizonFrom((la, lo) => st.terrainM(la, lo).h, q.lat, q.lon, gg.h, gg.resM);
      try { setSunPlan(planSunlight((la, lo) => st.terrainM(la, lo).h, q, t0, gg.resM, hzStart)); } catch { setSunPlan(null); }
    }, 30);
    if (flyThere) {
      const { e, n, u } = enu(q.lat, q.lon);
      const target = v3(posOf(q.lat, q.lon, groundAt(q.lat, q.lon).drawn)), U = v3(u);
      const off = v3(n).multiplyScalar(-Math.cos(1.0)).add(v3(e).multiplyScalar(0.25)).add(U.clone().multiplyScalar(Math.sin(1.0))); // look down at ~57° from the south-east
      fly(target.clone().addScaledVector(off.normalize(), Math.min(6000, Math.max(3, r.oneWayKm * 3.4))), target, U, 'site');
    }
  };
  const applyRangeRef = useRef(applyRange);
  useEffect(() => { applyRangeRef.current = applyRange; });
  // draw the rings on the terrain; redrawn when the relief or the loaded heights change
  useEffect(() => {
    const st = S.current; if (!st) return;
    const grp = st.rangeGroup;
    grp.children.forEach((o) => { const l = o as THREE.Line; l.geometry.dispose(); (l.material as THREE.Material).dispose(); });
    grp.clear();
    st.rangePos = null;
    if (rangeShown) {
      const r = roverRange(rangeShown, 512);
      const lift = Math.max(25, rangeShown.oneWayKm * 3); // metres above the ground so the ring is not buried in the surface
      const ringLine = (pts: { lat: number; lon: number }[], color: number, dashed: boolean) => {
        const arr = new Float32Array(pts.length * 3);
        pts.forEach((p, i) => { const q = posOf(p.lat, p.lon, groundAt(p.lat, p.lon).drawn + lift); arr.set(q, i * 3); });
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        const m = dashed
          ? new THREE.LineDashedMaterial({ color, dashSize: Math.max(0.02, rangeShown.returnKm * 0.06), gapSize: Math.max(0.015, rangeShown.returnKm * 0.04), toneMapped: false })
          : new THREE.LineBasicMaterial({ color, toneMapped: false });
        const line = new THREE.LineLoop(g, m);
        if (dashed) line.computeLineDistances();
        line.frustumCulled = false; line.renderOrder = 3;
        grp.add(line);
      };
      ringLine(r.ring, 0x7cc4ff, false);
      ringLine(r.returnRing, 0x7cc4ff, true);
      st.rangePos = v3(posOf(rangeShown.lat, rangeShown.lon, groundAt(rangeShown.lat, rangeShown.lon).drawn));
      if (sunPlan && sunPlan !== 'busy' && sunPlan.kind === 'drive') {
        const a = { lat: rangeShown.lat, lon: rangeShown.lon }, b = sunPlan.target;
        const pts = Array.from({ length: 129 }, (_, i) => gcInterp(a, b, i / 128));
        const arr = new Float32Array(pts.length * 3);
        pts.forEach((p, i) => arr.set(posOf(p.lat, p.lon, groundAt(p.lat, p.lon).drawn + lift), i * 3));
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffd166, toneMapped: false }));
        line.frustumCulled = false; line.renderOrder = 3;
        grp.add(line);
        st.sunPos = v3(posOf(b.lat, b.lon, groundAt(b.lat, b.lon).drawn));
      }
    }
    if (!rangeShown || !sunPlan || sunPlan === 'busy' || sunPlan.kind !== 'drive') st.sunPos = null;
    st.request();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeShown, relief, hiInfo, sunPlan]);
  const openRange = () => {
    if (rangeOpen) { setRangeOpen(false); return; }
    setRangeOpen(true);
    if (!rangeIn.lat) {
      const c = probe ?? sel;
      if (c) setRangeIn((x) => ({ ...x, lat: c.lat.toFixed(4), lon: (((c.lon % 360) + 360) % 360).toFixed(4) }));
    }
  };

  const clearProbe = () => { const st = S.current; if (st) { st.probePos = null; st.request(); } setProbe(null); setPeriod(null); };
  // next-lunar-cycle shares: recomputed (debounced) when the point or the time changes
  useEffect(() => {
    if (!probe) return;
    const id = setTimeout(() => setPeriod(probePeriod(probe.lat, probe.lon, probe.groundM, probe.hz, Math.round(t / 1800000) * 1800000)), 350);
    return () => clearTimeout(id);
  }, [probe, t]);

  const d = new Date(t);
  const g = useMemo(() => bodyFixedGeometry(d), [t]); // eslint-disable-line react-hooks/exhaustive-deps
  const sunInfo = useMemo(() => {
    if (!sel) return null;
    const { e, n, u } = enu(sel.lat, sel.lon);
    const s = v3(g.sunKm as V3).normalize();
    const el = Math.asin(s.dot(v3(u))) * 180 / Math.PI;
    const az = ((Math.atan2(s.dot(v3(e)), s.dot(v3(n))) * 180) / Math.PI + 360) % 360;
    return { el, az };
  }, [g, sel]);

  const now = useMemo(() => (probe ? probeNow(probe.lat, probe.lon, probe.groundM, probe.hz, t) : null), [probe, t]);

  if (fail) return <div className="moon-fail">{fail}</div>;
  return (
    <section className="moon" aria-label="3D Moon">
      <div ref={host} className="moon-canvas" role="img" aria-label="The Moon in 3D, lit by the Sun at the selected time. Drag to rotate, scroll to zoom, click the surface to probe a point." />
      <div ref={labels} className="moon-markers" />
      <div className="moon-markers"><div ref={probePin} className="moon-probe-pin" aria-hidden><i /></div><div ref={rangePin} className="moon-probe-pin range" aria-hidden><i /></div><div ref={sunPin} className="moon-probe-pin sun" aria-hidden><i /></div></div>
      <div className="moon-markers sky-ptrs" hidden={!pointers} aria-hidden>
        <div ref={sunPtr} className="sky-ptr sun"><i /><b /><span>Sun<em> · behind the Moon</em></span></div>
        <div ref={earthPtr} className="sky-ptr earth"><i /><b /><span>Earth<em> · behind the Moon</em></span></div>
      </div>
      <div ref={hud} className="moon-hud">
        <div className="hud-tl hud-anim">
          <h2 className="hud-title">{sel?.name ?? 'The Moon'}</h2>
          {sel && <p className="hud-coords num">{fmtLatLon(sel.lat, sel.lon)}</p>}
          {!probe && <p className="hud-hint">Click anywhere on the surface for light and Earth contact</p>}
        </div>
        {probe && (
          <div className="hud-probe" aria-live="polite">
            <div className="hud-probe-head">
              <span>Probed point</span>
              <button onClick={clearProbe} aria-label="Clear probed point">×</button>
            </div>
            <dl>
              <dt>Coordinates</dt><dd className="num">{fmtLatLon(probe.lat, probe.lon)}</dd>
              <dt>Elevation</dt><dd className="num">{probe.groundM >= 0 ? '+' : ''}{probe.groundM.toFixed(0)} m{probe.distKm !== null && <span className="dim"> · {probe.distKm < 10 ? probe.distKm.toFixed(2) : probe.distKm.toFixed(0)} km from {sel?.short || sel?.name}</span>}</dd>
              {now && <>
                <dt>Light now</dt>
                <dd><b className={now.sunPct >= 99.5 ? 'ok' : now.sunPct > 0.5 ? 'part' : 'no'}>{fmtPct(now.sunPct)}</b> of the Sun visible<br /><span className="dim">{now.sunEl < -0.3 ? 'Sun below the horizon (night)' : fmtClear(now.sunClear)}</span></dd>
                <dt>Earth link now</dt>
                <dd><b className={now.earthUp ? 'ok' : 'no'}>{now.earthUp ? 'Yes, Earth in view' : 'No, Earth blocked'}</b><br /><span className="dim">{now.earthEl < -1 ? 'Earth below the horizon (far side or limb)' : fmtClear(now.earthClear)}</span></dd>
              </>}
              <dt>Next 29.5 days</dt>
              <dd>{period ? <>Sunlit <b>{fmtPct(period.sunPct)}</b> · Earth in view <b>{fmtPct(period.earthPct)}</b><br /><span className="dim">longest dark {period.longestDarkH >= 708 ? 'whole cycle' : `${period.longestDarkH.toFixed(1)} h`} · longest without Earth {period.longestNoEarthH >= 708 ? 'whole cycle' : `${period.longestNoEarthH.toFixed(1)} h`}</span></> : <span className="dim">Computing…</span>}</dd>
            </dl>
            <p className="hud-probe-note">Skyline from {probe.src} terrain, 2 m mast. Approximate.</p>
          </div>
        )}
        <dl className="hud-tr hud-anim">
          <div><dt>Ground</dt><dd className="num" ref={(e) => { readout.current.res = e; }}>-</dd></div>
          <div><dt>Altitude</dt><dd className="num" ref={(e) => { readout.current.alt = e; }}>-</dd></div>
          {sunInfo && <div><dt>Sun</dt><dd className="num">{sunInfo.el >= 0 ? '+' : ''}{sunInfo.el.toFixed(2)}° el · {sunInfo.az.toFixed(0)}° az</dd></div>}
          <div className="wide"><dt>Data</dt><dd ref={(e) => { readout.current.src = e; }}>-</dd></div>
        </dl>
        <div className="hud-bl hud-anim">
          <div className="hud-home-row">
          <button className="hud-toggle" onClick={() => goTo('moon')} title="Home view: the whole Moon, north up (H)"><Icon name="home" /> Home</button>
          <div className="hud-seg" role="radiogroup" aria-label="Zoom to">
            {SCALES.map((s) => (
              <button key={s.id} role="radio" aria-checked={scale === s.id} disabled={s.id !== 'moon' && !sel} onClick={() => goTo(s.id)}>{s.label}</button>
            ))}
          </div>
          </div>
          {status && <p className="hud-status">{!status.startsWith('Some') && <span className="hud-spin" aria-hidden />}{status}</p>}
        </div>
        {rangeOpen && (
          <form className="hud-range" onSubmit={(e) => { e.preventDefault(); applyRange(rangeIn, true); }}>
            <div className="hud-probe-head">
              <span>Rover range on battery</span>
              <button type="button" onClick={() => setRangeOpen(false)} aria-label="Close rover range">×</button>
            </div>
            <div className="range-grid">
              <label>Latitude °<input id="range-lat" inputMode="decimal" value={rangeIn.lat} onChange={(e) => setRangeIn({ ...rangeIn, lat: e.target.value })} placeholder="-89.45" /></label>
              <label>Longitude ° E<input id="range-lon" inputMode="decimal" value={rangeIn.lon} onChange={(e) => setRangeIn({ ...rangeIn, lon: e.target.value })} placeholder="222.69" /></label>
              <label>Battery life without sun (h)<input id="range-hours" inputMode="decimal" value={rangeIn.hours} onChange={(e) => setRangeIn({ ...rangeIn, hours: e.target.value })} /></label>
              <label>Driving speed (km/h)<input id="range-speed" inputMode="decimal" value={rangeIn.speed} onChange={(e) => setRangeIn({ ...rangeIn, speed: e.target.value })} /></label>
            </div>
            <div className="range-actions">
              <button type="submit" className="range-go">Show range</button>
              <span className="dim">or click the Moon to set the start</span>
            </div>
            {rangeErr && <p className="range-err" role="alert">{rangeErr}</p>}
            {rangeShown && !rangeErr && (
              <dl aria-live="polite">
                <dt>Start</dt><dd className="num">{fmtLatLon(rangeShown.lat, rangeShown.lon)}</dd>
                <dt>Distance on battery</dt><dd><b>{rangeShown.oneWayKm < 10 ? rangeShown.oneWayKm.toFixed(2) : rangeShown.oneWayKm.toFixed(1)} km</b> one way <span className="swatch solid" /><br /><span className="dim">{rangeShown.batteryH} h × {rangeShown.speedKmH} km/h</span></dd>
                <dt>Travel per hour</dt><dd className="num">{rangeShown.speedKmH} km</dd>
                <dt>Reach sunlight?</dt>
                <dd>{sunPlan === 'busy' || sunPlan === null ? <span className="dim">{sunPlan === 'busy' ? 'Searching the terrain…' : 'Could not check'}</span>
                  : sunPlan.kind === 'here' ? <b className="ok">Yes, the start is in sunlight now</b>
                  : sunPlan.kind === 'drive' ? <><b className="ok">Yes, {sunPlan.km < 10 ? sunPlan.km.toFixed(2) : sunPlan.km.toFixed(1)} km away</b> <span className="swatch sun" /><br /><span className="dim">{sunPlan.hours.toFixed(1)} h of driving, {sunPlan.spareH.toFixed(1)} h of battery left on arrival · {fmtLatLon(sunPlan.target.lat, sunPlan.target.lon)}</span></>
                  : sunPlan.kind === 'wait' ? <><b className="part">Only by waiting</b><br /><span className="dim">No sunlit ground within {rangeShown.oneWayKm.toFixed(1)} km, but the Sun rises over the start in {sunPlan.hours.toFixed(1)} h, inside the battery life</span></>
                  : <><b className="no">No</b><br /><span className="dim">No sunlit ground within {sunPlan.searchedKm.toFixed(1)} km, and no sunrise at the start within {rangeShown.batteryH} h</span></>}</dd>
                <dt>Out and back</dt><dd><b>{rangeShown.returnKm < 10 ? rangeShown.returnKm.toFixed(2) : rangeShown.returnKm.toFixed(1)} km</b> radius <span className="swatch dashed" /></dd>
                {rangeShown.longestDarkH !== null && <>
                  <dt>Longest dark here</dt>
                  <dd>{rangeShown.longestDarkH >= 708 ? 'whole next cycle' : `${rangeShown.longestDarkH.toFixed(1)} h`} in the next 29.5 days<br />
                    <b className={rangeShown.batteryH >= rangeShown.longestDarkH ? 'ok' : 'no'}>{rangeShown.batteryH >= rangeShown.longestDarkH ? 'Battery outlasts it' : `Battery runs out ${(Math.min(rangeShown.longestDarkH, 708) - rangeShown.batteryH).toFixed(1)} h early`}</b></dd>
                </>}
              </dl>
            )}
            <p className="hud-probe-note">Straight-line reach on flat ground at constant speed. Slopes and detours shorten it; the mission planner routes around them.</p>
          </form>
        )}
        <div className="hud-br hud-anim">
          <button className={`hud-toggle${pointers ? ' on' : ''}`} aria-pressed={pointers} onClick={() => setPointers((x) => !x)} title="Show where the Sun and Earth are, with arrows when they are off screen"><Icon name="compass" /> Sun &amp; Earth</button>
          <button className={`hud-toggle${rangeOpen ? ' on' : ''}`} aria-pressed={rangeOpen} onClick={openRange} title="How far a rover can drive on battery alone, drawn as a ring on the Moon"><Icon name="rover" /> Rover range</button>
          <button className={`hud-toggle${fill ? ' on' : ''}`} aria-pressed={fill} onClick={() => setFill((x) => !x)} title="Shine a floodlight from your viewpoint so the night side and shadowed craters are visible. Display only: the probe and verdicts still use real sunlight."><Icon name="lamp" /> Light dark areas</button>
          <button className={`hud-toggle${shadows ? ' on' : ''}`} aria-pressed={shadows} onClick={() => setShadows((x) => !x)} title="Cast shadows, ray-traced on the LOLA heights"><Icon name="shadow" /> Shadows</button>
          <button className={`hud-toggle${relief > 1 ? ' on' : ''}`} aria-pressed={relief > 1} onClick={() => setRelief((x) => (x > 1 ? 1 : 3))} title="Exaggerate the relief 3×"><Icon name="mountain" /> Relief ×3</button>
          <button className={`hud-toggle${detail ? ' on' : ''}`} aria-pressed={detail} onClick={() => setDetail((x) => !x)} title="Procedural craters and rocks below the resolution of the real data. Illustrative only."><Icon name="sparkle" /> Fine detail</button>
          {hiInfo && sel && <button className="hud-toggle" onClick={() => setViewer(sel.id)} title="Open the site mesh in a 3D viewport"><Icon name="mountain" /> Terrain 3D</button>}
        </div>
        {hiInfo && scale !== 'moon' && <p className="hud-foot num">{hiInfo.dem} {hiInfo.resM} m/px {((hiInfo.n * hiInfo.resM) / 1000).toFixed(1)} km{detail ? ` | <${hiInfo.resM} m procedural` : ''} | {d.toISOString().slice(0, 16).replace('T', ' ')} UTC</p>}
      </div>
      {viewer && sel && sel.id === viewer && (
        <Suspense fallback={null}>
          <TerrainViewport siteId={sel.id} siteName={sel.name} lat={sel.lat} lon={sel.lon} sunEl={sunInfo?.el ?? null} sunAz={sunInfo?.az ?? null} onClose={() => setViewer(null)} />
        </Suspense>
      )}
    </section>
  );
}
