/**
 * The whole Moon in 3D, always on screen, flying down to the selected landing site.
 *
 * Data, coarse to fine (all NASA LRO):
 *   globe   LROC WAC colour (8k) + LOLA 64 px/deg relief normals + LOLA 16 px/deg heights
 *   tiles   NASA SVS CGI Moon Kit LOLA ldem_64 (64 px/deg, ~474 m) meshes + LROC 16k colour, 5° tiles streamed
 *           around the view when zoomed in (90°N to 80°S)
 *   cap     LOLA LDEM_80S_80M, 80°S to the pole, resampled to 148 m
 *   patch   LOLA polar DEM around the site: 5 m (87.5°S+), 10 m (85°S+) or 20 m
 *   below the patch resolution: optional procedural detail (off by default, labelled in the HUD)
 * Antialiasing: every frame is supersampled with jittered sub-pixel samples, and refines to 32 samples once the
 * camera stops, so shading does not flicker while zooming.
 * Lighting uses the true Sun and Earth directions at the selected time; shadows are ray-marched on the heights.
 */
import gsap from 'gsap';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { TAARenderPass } from 'three/examples/jsm/postprocessing/TAARenderPass.js';
import * as Astro from 'astronomy-engine';
import type { SiteInfo } from '../lib/data';
import { bodyFixedGeometry, eqjToMoonFixed } from '../lib/ephemeris';
import { type EqGrid, type PolarGrid, R_KM, type V3, dirOf, enu, posOf, sampleEq, sampleGrid, stereoLatLon, stereoXY } from '../lib/moon/frames';
import { CAP_F, CAP_V, EARTH_F, EARTH_V, GLOBE_F, GLOBE_V, PATCH_F, PATCH_V, TILE_F, TILE_V } from '../lib/moon/shaders';
import { type TileHeights, type TileIndex, buildTileMesh, tileAt, tileHeight, tileKey, tileOrigin } from '../lib/moon/tiles';
import { horizonFrom, probeNow, probePeriod, type ProbePeriod } from '../lib/moon/probe';
import { CAP_SEGMENTS, CORE_DEPTH_KM, GLOBE_SEGMENTS, constrainCamera, createSurfaceSampler } from '../lib/moon/surface';
import { planSunlight, roverRange, validateRover, type SunPlan } from '../lib/moon/rover';
import { DEFAULT_PLAN, gcInterp } from '../lib/mission';
import { Icon } from './Icons';
import { introActive, whenIntroDone } from '../lib/intro';
const TerrainViewport = lazy(() => import('./TerrainViewport'));

const base = import.meta.env.BASE_URL;
/** Spacing of the ldem_64 tile samples: 5 degrees / 320 on a 1737.4 km sphere. */
const TILE_RES_M = ((5 / 320) * Math.PI / 180) * R_KM * 1000;
/** Normal field of view (the scale presets and site flights use it). */
const SCALE_FOV = 32;

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

export default function MoonView({ sites, selectedId, t, onSelect, onPlanLaunch, homeSignal = 0 }: {
  sites: SiteInfo[]; selectedId: string; t: number; onSelect: (id: string) => void; onPlanLaunch?: (lat: number, lon: number) => void;
  /** bumped by the app logo: fly back to the home view, as the H key does */
  homeSignal?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const readout = useRef<{ res: HTMLElement | null; alt: HTMLElement | null; src: HTMLElement | null }>({ res: null, alt: null, src: null });
  const [status, setStatus] = useState('Loading the LROC mosaic');
  const [scale, setScale] = useState<Scale>('moon');
  const [shadows, setShadows] = useState(true);
  const [detail, setDetail] = useState(false);
  const [relief, setRelief] = useState(3);
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
  const [earthLineOn, setEarthLineOn] = useState(true);
  const [sunLineOn, setSunLineOn] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [probeMin, setProbeMin] = useState(false);
  const [rangeMin, setRangeMin] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
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
    request: () => void; markers: { id: string; el: HTMLButtonElement; pos: THREE.Vector3}[]; meta: TexMeta | null;
    exag: number; core: THREE.Mesh; probePos: THREE.Vector3 | null; rangeGroup: THREE.Group; rangePos: THREE.Vector3 | null; sunPos: THREE.Vector3 | null; earthLine: THREE.Line; sunLine: THREE.Line;
    terrainM: (lat: number, lon: number) => { h: number; resM: number; src: string };
    surfaceRadius: (p: THREE.Vector3) => number;
    /** A double-clicked point being viewed close up: only its neighbourhood gets full-detail terrain. */
    focus: { P: THREE.Vector3; lat: number; lon: number; D: number } | null;
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
    // start at 1x: antialiasing comes from accumulated sub-pixel samples once the view is still (below)
    renderer.setPixelRatio(1);
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

    // Antialiasing: while the camera moves, one sample per pixel (two on fast GPUs); once it stops, jittered
    // sub-pixel samples accumulate one per frame up to 32, so a still view is fully supersampled without any
    // single heavy frame. Shading detail below a pixel averages out instead of flickering.
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    const taa = new TAARenderPass(scene, camera, 0x000000, 1);
    taa.unbiased = true;
    composer.addPass(taa);
    composer.addPass(new OutputPass());
    const TAA_SAMPLES = 32;
    /**
     * Quality levels, chosen by a frame-time governor in frame(): pixel ratio, share of the shadow-march
     * steps, samples per moving frame, and how many terrain tiles may be on screen. Level 1 is the default;
     * the governor drops a level when moving frames run under ~30 fps and tries the top level only when the
     * display rate holds steadily (and never again after that has failed once).
     */
    const LEVELS = [
      { pr: 0.75, march: 0.5, motion: 0, tiles: 12 },
      { pr: 1, march: 0.75, motion: 0, tiles: 20 },
      { pr: Math.min(window.devicePixelRatio, 1.5), march: 1, motion: 1, tiles: 28 },
    ];
    let level = 1;
    const gov = { sum: 0, n: 0, last: 0, upLocked: false, since: 0 };
    /** Resize the canvas and every render target (TAARenderPass does not resize its hold buffer itself). */
    function resizeTargets() {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h, true);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      const hold = (taa as unknown as { _holdRenderTarget: THREE.WebGLRenderTarget | null });
      hold._holdRenderTarget?.dispose(); hold._holdRenderTarget = null;
      camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    }
    function setLevel(l: number) {
      level = l;
      const L = LEVELS[l];
      renderer.setPixelRatio(L.pr);
      u.uMarch.value = L.march;
      resizeTargets();
      request();
    }

    const blank = floatTex(new Float32Array([0]), 1, 1, false);
    // one texel per 5-degree tile (72 x 36): the globe skips ground that a real-terrain tile is drawing
    const maskData = new Uint8Array(72 * 36);
    const tileMask = new THREE.DataTexture(maskData, 72, 36, THREE.RedFormat, THREE.UnsignedByteType);
    tileMask.magFilter = tileMask.minFilter = THREE.NearestFilter; tileMask.needsUpdate = true;
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
      uCamLocal: { value: new THREE.Vector3() }, uDetail: { value: 0 }, uTileMask: { value: tileMask }, uMarch: { value: 0.75 },
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
    // dotted line of sight from the probed point to Earth (positions set by the probe effect); the depth test
    // hides it inside any terrain that blocks the view, so a blocked line visibly runs into the ridge
    const sightLine = (color: number) => {
      const l = new THREE.Line(
        new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)),
        new THREE.LineDashedMaterial({ color, dashSize: 1, gapSize: 1, toneMapped: false, transparent: true, opacity: 0.95 }),
      );
      l.frustumCulled = false; l.renderOrder = 4; l.visible = false;
      scene.add(l);
      return l;
    };
    const earthLine = sightLine(0x0071bc);
    // the Sun is ~150 million km away, past the far plane, so its line runs 1 million km along the exact Sun direction
    const sunLine = sightLine(0xffffff);
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

    let raf = 0, fresh = true, held = false;
    // request() from anything that changes the picture restarts the antialiasing accumulation;
    // request(false) is the accumulation itself asking for its next frame
    const request = (reset: unknown = true) => {
      if (reset !== false) fresh = true;
      // nothing is visible behind the opening sting, so draw nothing until it fades (see lib/intro.ts)
      if (introActive()) { held = true; return; }
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const st = {
      renderer, scene, camera, controls, u, patch: null as THREE.Mesh | null, patchOrigin: [0, 0, 0] as V3, earth, sun,
      eq: null as EqGrid | null, cap: null as PolarGrid | null, hi: null as PolarGrid | null, mode: 'globe' as 'globe' | 'site',
      flying: null as gsap.core.Tween | null, request, markers: [] as { id: string; el: HTMLButtonElement; pos: THREE.Vector3}[], meta: null as TexMeta | null,
      exag: 1, core, probePos: null as THREE.Vector3 | null, terrainM, rangeGroup, rangePos: null as THREE.Vector3 | null, sunPos: null as THREE.Vector3 | null, earthLine, sunLine,
      surfaceRadius: (p: THREE.Vector3): number => surfaceRadius(p),
      focus: null as { P: THREE.Vector3; lat: number; lon: number; D: number } | null,
    };
    // the drawn tile mesh uses every 2nd sample; taking the higher of both keeps the camera above either surface
    const tileSurfaceH = (la: number, lo: number) => Math.max(tileH(la, lo, false), tileH(la, lo, true));
    const surfaceRadius = createSurfaceSampler(() => ({ eq: st.eq, cap: st.cap, hi: st.hi, exag: st.exag, capHalfM: st.meta?.south.halfM ?? 304000, tileH: tileSurfaceH }));

    /* ---------- real-terrain tiles (CGI Moon Kit ldem_64), streamed around the view ---------- */
    // Each tile keeps its full 321 x 321 heights for shading; its mesh uses every 4th sample normally (the
    // silhouette is all the mesh adds), every 2nd around a double-clicked point and every sample on that
    // point's own tile. Tiles load one or two at a time, nearest first, never during a camera flight, and at
    // most one mesh is (re)built per frame, so detail fills in progressively instead of in one burst.
    interface LiveTile { key: string; r: number; c: number; heights: TileHeights | null; mesh: THREE.Mesh | null; stride: number; want: number; loading: boolean; failed: boolean; used: number }
    const tiles = new Map<string, LiveTile>();
    let tIdx: TileIndex | null = null, inflight = 0, tilesShown = 0;
    const MAX_CACHED = 60, MAX_INFLIGHT = 2;
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    fetch(`${base}tiles/index.json`).then((r) => (r.ok ? r.json() : null)).then((j: TileIndex | null) => { tIdx = j; request(); }).catch(() => {});
    /** Height (m) from a drawn tile (full data, or as its mesh draws it), or NaN where no tile is drawn. */
    function tileH(lat: number, lon: number, drawn = false) {
      if (!tIdx) return NaN;
      const rc = tileAt(tIdx, lat, lon); if (!rc) return NaN;
      const t = tiles.get(tileKey(rc[0], rc[1]));
      if (!t?.heights || !t.mesh?.visible) return NaN;
      return tileHeight(tIdx, t.heights, lat, lon, drawn ? t.stride : 1);
    }
    function tileGeometry(idx: TileIndex, h: TileHeights, stride: number) {
      // skirts reach 6 km down so a ×3 relief step to the coarser globe beside a tile never opens a crack
      const md = buildTileMesh(idx, h, stride, 6);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(md.position, 3));
      geo.setAttribute('aUp', new THREE.BufferAttribute(md.up, 3));
      geo.setAttribute('aUV', new THREE.BufferAttribute(md.uv, 2));
      geo.setAttribute('aH', new THREE.BufferAttribute(md.h, 1));
      geo.setIndex(new THREE.BufferAttribute(md.index, 1));
      geo.computeBoundingSphere();
      return { geo, center: md.center };
    }
    function setMask(t: LiveTile, on: boolean) { maskData[t.r * 72 + t.c] = on ? 255 : 0; tileMask.needsUpdate = true; }
    function dropTile(t: LiveTile) {
      if (t.mesh) {
        scene.remove(t.mesh); t.mesh.geometry.dispose();
        const m = t.mesh.material as THREE.ShaderMaterial;
        (m.uniforms.uTH.value as THREE.Texture).dispose(); (m.uniforms.uTC.value as THREE.Texture).dispose(); m.dispose();
      }
      setMask(t, false); tiles.delete(t.key);
    }
    async function loadTile(t: LiveTile) {
      const idx = tIdx; if (!idx) return;
      t.loading = true; inflight++;
      try {
        const [dec, ctex] = await Promise.all([
          decodeHeights(`${base}tiles/h/${t.key}.png`, idx.hMinM[t.r][t.c], idx.quantumM),
          new Promise<THREE.Texture>((res, rej) => loader.load(`${base}tiles/c/${t.key}.jpg`, res, undefined, rej)),
        ]);
        if (S.current !== st) { ctex.dispose(); return; }
        ctex.colorSpace = THREE.SRGBColorSpace; ctex.anisotropy = maxAniso; ctex.flipY = false;
        t.heights = { r: t.r, c: t.c, n: idx.n, h: dec.data };
        t.stride = t.want;
        const { geo, center } = tileGeometry(idx, t.heights, t.stride);
        const [la0, lo0] = tileOrigin(idx, t.r, t.c), rad = Math.PI / 180;
        const mt = new THREE.ShaderMaterial({
          vertexShader: TILE_V, fragmentShader: TILE_F, side: THREE.DoubleSide,
          uniforms: { ...u, uTH: { value: floatTex(dec.data, dec.w, dec.h, linearFloat, false, dec.mips) }, uTC: { value: ctex },
            uTileLL: { value: new THREE.Vector3(la0 * rad, lo0 * rad, idx.deg * rad) }, uTileN: { value: idx.n } },
        });
        const mesh = new THREE.Mesh(geo, mt);
        mesh.position.set(center[0], center[1], center[2]);
        mesh.visible = false;
        scene.add(mesh); t.mesh = mesh;
      } catch { t.failed = true; }
      finally { t.loading = false; inflight--; request(); }
    }
    /** Pick the tiles around the centre of the view when the globe maps are coarser than the screen. */
    function updateTiles() {
      const idx = tIdx; if (!idx) return;
      const cam = camera.position, camR = cam.length(), now = performance.now();
      const dv = st.controls.target.clone().sub(cam).normalize();
      const b = cam.dot(dv), disc = b * b - (camR * camR - R_KM * R_KM);
      const tHit = disc > 0 ? -b - Math.sqrt(disc) : -1;
      const P = tHit > 0 ? cam.clone().addScaledVector(dv, tHit) : cam.clone().setLength(R_KM);
      const dist = cam.distanceTo(P), half = Math.tan((camera.fov * Math.PI) / 360);
      const mpp = (2 * dist * 1000 * half) / (renderer.domElement.clientHeight || 1);
      const want = new Set<LiveTile>();
      const need = (r: number, c: number, stride: number) => {
        const key = tileKey(r, c);
        let t = tiles.get(key);
        if (!t) { t = { key, r, c, heights: null, mesh: null, stride: 0, want: stride, loading: false, failed: false, used: 0 }; tiles.set(key, t); }
        t.used = now; t.want = stride; want.add(t);
      };
      // a double-clicked point: only its tile (every sample) and the eight around it (every 2nd)
      const f = st.focus;
      if (f && !st.flying && cam.distanceTo(f.P) > f.D * 8) st.focus = null;   // zoomed back out: leave the close-up
      const frc = st.focus ? tileAt(idx, st.focus.lat, st.focus.lon) : null;
      if (frc) {
        need(frc[0], frc[1], 1);
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const r = frc[0] + dr, c = (frc[1] + dc + idx.cols) % idx.cols;
          if ((dr || dc) && r >= 0 && r < idx.rows) need(r, c, 2);
        }
      } else if (!st.focus && mpp < 1500 && camR - R_KM < 3000) {
        const a = Math.min((dist * half * Math.max(camera.aspect, 1) * 1.5) / R_KM + (idx.deg * Math.PI) / 180 * 0.75, 1.2);
        const cosA = Math.cos(a), Pn = P.clone().normalize(), horizon = R_KM / camR;
        const cand: [number, number, number][] = [];
        for (let r = 0; r < idx.rows; r++) for (let c = 0; c < idx.cols; c++) {
          const [la0, lo0] = tileOrigin(idx, r, c);
          const d = dirOf(la0 - idx.deg / 2, lo0 + idx.deg / 2);
          const dp = d[0] * Pn.x + d[1] * Pn.y + d[2] * Pn.z;
          if (dp < cosA || (d[0] * cam.x + d[1] * cam.y + d[2] * cam.z) / camR < horizon - 0.08) continue;
          cand.push([r, c, dp]);
        }
        cand.sort((x, y) => y[2] - x[2]);
        for (const [r, c] of cand.slice(0, LEVELS[level].tiles)) need(r, c, 4);
      }
      tilesShown = 0;
      for (const t of tiles.values()) {
        const vis = want.has(t) && !!t.mesh;
        if (vis) tilesShown++;
        if (t.mesh && t.mesh.visible !== vis) { t.mesh.visible = vis; setMask(t, vis); }
      }
      // progressive: load nearest first, a couple at a time, and not while flying; rebuild at most one mesh a frame
      if (!st.flying) {
        for (const t of want) if (!t.mesh && !t.loading && !t.failed && inflight < MAX_INFLIGHT) void loadTile(t);
        const re = [...want].find((t) => t.mesh && t.heights && t.stride !== t.want);
        if (re && re.mesh && re.heights) {
          const old = re.mesh.geometry;
          re.mesh.geometry = tileGeometry(idx, re.heights, re.want).geo; old.dispose();
          re.stride = re.want; request();
        }
      }
      if (tiles.size > MAX_CACHED) {
        const old = [...tiles.values()].filter((t) => !want.has(t) && !t.loading).sort((x, y) => x.used - y.used);
        for (const t of old.slice(0, tiles.size - MAX_CACHED)) dropTile(t);
      }
    }
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
      const th = tileH(lat, lon);
      if (!isNaN(th)) return { h: th, resM: TILE_RES_M, src: 'LOLA 64 px/deg (CGI Moon Kit)' };
      if (st.eq) return { h: sampleEq(st.eq, lat, lon), resM: (Math.PI * R_KM * 1000) / st.eq.hgt, src: `LOLA global ${((Math.PI * R_KM) / st.eq.hgt).toFixed(1)} km` };
      return { h: 0, resM: 5000, src: 'reference sphere (heights still loading)' };
    }
    /** Radius (km) of the rendered ground under a point; every layer carries the relief exaggeration. */
    function groundKm(p: THREE.Vector3) {
      const r = p.length(), lat = Math.asin(p.z / r) * 180 / Math.PI, lon = Math.atan2(p.y, p.x) * 180 / Math.PI;
      const g = terrainM(lat, lon);
      return R_KM + (g.h * st.exag) / 1000;
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
      updateTiles();
      const still = !moving && !st.flying, wasFresh = fresh;
      fresh = false;
      taa.accumulate = still && !wasFresh;
      taa.sampleLevel = taa.accumulate ? 0 : LEVELS[level].motion;
      composer.render();
      // governor: average the interval between back-to-back frames (moving, flying or refining)
      {
        const now = performance.now(), dt = now - gov.last;
        gov.last = now;
        if (dt < 250) { gov.sum += dt; gov.n++; }
        if (gov.n >= 30) {
          const avg = gov.sum / gov.n; gov.sum = 0; gov.n = 0;
          if (avg > 32 && level > 0) { if (level === 2) gov.upLocked = true; gov.since = now; setLevel(level - 1); }
          else if (avg < 18 && level < 2 && !gov.upLocked && now - gov.since > 4000) { gov.since = now; setLevel(level + 1); }
        }
      }
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
        const show = tmp.z < 1 && facing > 0.02 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05 && toCam.length() > 3;
        // crowded labels fade out, but every point stays visible and clickable so any site can be picked
        const crowded = show && placed.some(([x, y]) => Math.abs(x - sx) < 90 && Math.abs(y - sy) < 18);
        if (show && !crowded) placed.push([sx, sy]);
        m.el.classList.toggle('crowded', crowded);
        m.el.style.opacity = show ? '1' : '0';
        m.el.style.pointerEvents = show ? 'auto' : 'none';
        m.el.style.transform = `translate(${sx}px, ${sy}px)`;
      }
      // Sun and Earth pointers: a ring on the body when it is on screen, otherwise an arrow at the edge
      // pointing the shortest way to turn toward it
      {
        // keep edge arrows inside the band between the HUD's top text and its bottom button rows
        const insX = 34, top = w < 760 ? 120 : 78, bottom = w < 760 ? 150 : 64;
        const cx = w / 2, cy = (top + h - bottom) / 2, halfY = (h - bottom - top) / 2;
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
            const k = Math.min((cx - insX) / Math.max(Math.abs(dx), 1e-9), halfY / Math.max(Math.abs(dy), 1e-9));
            x = cx + dx * k; y = cy - dy * k; ang = Math.atan2(-dy, dx);
          }
          el.style.transform = `translate(${x}px, ${y}px)`;
          el.style.setProperty('--ang', `${ang}rad`);
          el.classList.toggle('edge', !onScreen);
          el.classList.toggle('blocked', blocked);
          el.style.opacity = '1';
        }
      }
      // line to Earth: dot length follows the camera's distance to the probed point, so it reads as dotted at any zoom
      for (const l of [st.earthLine, st.sunLine]) {
        if (!l.visible || !st.probePos) continue;
        const m = l.material as THREE.LineDashedMaterial, dd = camera.position.distanceTo(st.probePos);
        m.dashSize = dd * 0.012; m.gapSize = dd * 0.012;
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
        ro.src.textContent = !near ? (tilesShown ? 'LOLA 64 px/deg (474 m) · LROC WAC 16k' : alt > 1500 ? 'LROC WAC 8k · LOLA 64 px/deg' : 'LOLA polar 148 m · LROC WAC')
          : mpp < hiRes / 3 && u.uDetail.value > 0 ? `LOLA ${hiRes} m + procedural below ${hiRes} m` : `LOLA ${hiRes} m/px`;
      }
      if (moving) request();
      else if (still && (wasFresh || (taa as unknown as { accumulateIndex: number }).accumulateIndex < TAA_SAMPLES)) request(false);
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
    // a double-click flies down to that point for a near-horizontal close-up
    const onDbl = (e: MouseEvent) => {
      if (st.flying) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const hit = pickGround(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      if (hit) zoomRef.current(hit);
    };
    // The scroll wheel and trackpad pinch (a wheel event with ctrlKey) over any part of the 3D panel belong to the
    // 3D view. OrbitControls only claims them on the bare canvas while it is enabled, so over the HUD, the markers
    // or during a camera flight they fell through and scrolled or zoomed the whole page.
    const box = el.parentElement ?? el;
    const onWheel = (e: WheelEvent) => {
      const tgt = e.target as HTMLElement;
      if (!e.ctrlKey && tgt.closest('.hud-probe, .hud-menu')) return; // these panels scroll their own content
      e.preventDefault();
      if (tgt !== renderer.domElement && st.controls.enabled) {
        renderer.domElement.dispatchEvent(new WheelEvent('wheel', { deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY, ctrlKey: e.ctrlKey, cancelable: true }));
      }
    };
    const noGesture = (e: Event) => e.preventDefault(); // Safari pinch
    box.addEventListener('wheel', onWheel, { passive: false });
    box.addEventListener('gesturestart', noGesture);
    box.addEventListener('gesturechange', noGesture);
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('dblclick', onDbl);
    if (import.meta.env.DEV) (window as unknown as { __moonFrame: () => void }).__moonFrame = frame;

    const ro = new ResizeObserver(() => { resizeTargets(); request(); });
    ro.observe(el);

    /* progressive data loading: small textures first, then the 8k mosaic and the height maps */
    const texture = (path: string, srgb: boolean) => new Promise<THREE.Texture>((res, rej) => loader.load(`${base}${path}`, (tx) => {
      tx.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      // the shaders put north at v = 0 (row 0 of the image), like the height maps; the loader's default
      // flipY would mirror colour and relief north-south against the heights and the lighting
      tx.flipY = false;
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
    // start drawing once the opening sting fades, if anything asked for a frame meanwhile
    const unhold = whenIntroDone(() => { if (held) { held = false; request(); } });
    return () => {
      alive = false; ro.disconnect(); io.disconnect(); cancelAnimationFrame(raf); unhold();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      box.removeEventListener('wheel', onWheel); box.removeEventListener('gesturestart', noGesture); box.removeEventListener('gesturechange', noGesture);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('dblclick', onDbl);
      st.flying?.kill(); st.controls.dispose();
      scene.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); const mm = m.material as THREE.Material | undefined; mm?.dispose?.(); });
      for (const t of [...tiles.values()]) dropTile(t);
      composer.dispose(); tileMask.dispose();
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
      b.setAttribute('aria-label', `Select ${s.name}; double-click to zoom in`);
      // click selects the site without moving the camera; double-click zooms in with the flattened view
      b.onclick = () => { if (s.id !== selectedId) { quietPick.current = true; onSelect(s.id); } };
      b.ondblclick = (e) => {
        e.preventDefault();
        const st2 = S.current;
        const polarWindow = s.lat < -80.5 && !s.id.startsWith('custom');
        if (s.id === selectedId && (!polarWindow || st2?.hi)) closeSite(s);
        else { pendingClose.current = s.id; if (s.id !== selectedId) { quietPick.current = true; onSelect(s.id); } }
      };
      layer.appendChild(b);
      return { id: s.id, el: b, pos: v3(posOf(s.lat, s.lon, (s.siteHeightM ?? 0) * relief + 30)) };
    });
    st.request();
  }, [siteList, selectedId, onSelect, relief]);

  /* ---------- camera flights ---------- */
  const fly = useCallback((toPos: THREE.Vector3, toTarget: THREE.Vector3, up: THREE.Vector3, mode: 'globe' | 'site', dur = 2.6, fov = SCALE_FOV) => {
    const st = S.current; if (!st) return;
    st.flying?.kill();
    const { camera, controls } = st;
    controls.enabled = false;
    const p0 = camera.position.clone(), t0 = controls.target.clone(), up0 = camera.up.clone(), fov0 = camera.fov;
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
        if (fov !== fov0) { camera.fov = fov0 + (fov - fov0) * gsap.parseEase('power2.inOut')(k); camera.updateProjectionMatrix(); }
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
    st.focus = null;
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
  const quietPick = useRef(false);
  /** Site whose close-up waits for its terrain window to load (set by a marker double-click). */
  const pendingClose = useRef<string | null>(null);
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
    const quiet = quietPick.current;
    quietPick.current = false;
    const picked = firstSite.current === '\u0000picked' && !quiet;
    const arrive = (fallback: Scale) => { if (picked) goTo(scale === 'moon' ? fallback : scale); };
    (async () => {
      let meta: HiMeta | null = null;
      if (sel.lat < -80.5 && !sel.id.startsWith('custom')) {
        meta = await fetch(`${base}hires/${sel.id}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      }
      if (!live) return;
      if (!meta) { if (pendingClose.current === sel.id) { pendingClose.current = null; closeSite(sel); } else arrive('region'); return; }
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
      const up = new Float32Array(m * m * 3), hv = new Float32Array(m * m);
      for (let r = 0, k = 0; r < m; r++) for (let c = 0; c < m; c++, k++) {
        const rr = r * step, cc = c * step;
        const x = x0 + cc * res, y = y0 - rr * res;
        const [la, lo] = stereoLatLon(x, y);
        const p = posOf(la, lo, dec.data[rr * n + cc]), dd = dirOf(la, lo);
        pos[k * 3] = p[0] - origin[0]; pos[k * 3 + 1] = p[1] - origin[1]; pos[k * 3 + 2] = p[2] - origin[2];
        up[k * 3] = dd[0]; up[k * 3 + 1] = dd[1]; up[k * 3 + 2] = dd[2]; hv[k] = dec.data[rr * n + cc];
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
      const UP = new Float32Array((nv + ns) * 3), HV = new Float32Array(nv + ns);
      P.set(pos); XY.set(xy); LOC.set(loc); UP.set(up); HV.set(hv);
      ring.forEach((v, i) => {
        const ax = pos[v * 3] + origin[0], ay = pos[v * 3 + 1] + origin[1], az = pos[v * 3 + 2] + origin[2];
        const k = 1 - SKIRT_KM / Math.hypot(ax, ay, az), j = nv + i;
        P[j * 3] = ax * k - origin[0]; P[j * 3 + 1] = ay * k - origin[1]; P[j * 3 + 2] = az * k - origin[2];
        XY[j * 2] = xy[v * 2]; XY[j * 2 + 1] = xy[v * 2 + 1]; LOC[j * 2] = loc[v * 2]; LOC[j * 2 + 1] = loc[v * 2 + 1];
        UP[j * 3] = up[v * 3]; UP[j * 3 + 1] = up[v * 3 + 1]; UP[j * 3 + 2] = up[v * 3 + 2]; HV[j] = hv[v];
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
      geo.setAttribute('aUp', new THREE.BufferAttribute(UP, 3));
      geo.setAttribute('aH', new THREE.BufferAttribute(HV, 1));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: PATCH_V, fragmentShader: PATCH_F, uniforms: u }));
      mesh.position.set(origin[0], origin[1], origin[2]);
      mesh.frustumCulled = false;
      st.scene.add(mesh);
      st.patch = mesh; st.patchOrigin = origin;
      setHiInfo(meta);
      st.request();
      if (pendingClose.current === sel.id) { pendingClose.current = null; closeSite(sel); }
      else arrive('site');
    })().catch(() => live && arrive('region'));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id]);

  // Esc closes the Display menu first, then the probe panel, then the rover range panel
  const escRef = useRef<() => void>(() => {});
  escRef.current = () => {
    if (menuOpen) setMenuOpen(false);
    else if (probe && !probeMin) setProbeMin(true);
    else if (rangeOpen) setRangeOpen(false);
  };
  // the Display menu closes on any click outside it
  useEffect(() => {
    if (!menuOpen) return;
    const k = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('pointerdown', k);
    return () => document.removeEventListener('pointerdown', k);
  }, [menuOpen]);
  // the canvas resizes itself (ResizeObserver) when the view is expanded
  useEffect(() => { if (expanded) S.current?.request(); }, [expanded]);

  // H or Home key: back to the home view (ignored while typing)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'h' || e.key === 'H' || e.key === 'Home') { e.preventDefault(); goToRef.current('moon'); }
      if (e.key === 'Escape') escRef.current();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  // the app logo asks for the home view by bumping homeSignal (0 on mount, so the opening drift-in is untouched)
  useEffect(() => { if (homeSignal > 0) goToRef.current('moon'); }, [homeSignal]);

  // first visit: drift in from deep space (runs once per mount; the ref keeps the latest goTo)
  const goToRef = useRef(goTo);
  goToRef.current = goTo;
  // it waits for the opening sting to fade so the drift-in is actually seen, and the GPU is free while it draws
  useEffect(() => {
    let tw: ReturnType<typeof gsap.from> | null = null;
    const cancel = whenIntroDone(() => {
      goToRef.current('moon', 3.4);
      tw = hud.current ? gsap.from(hud.current.querySelectorAll('.hud-anim'), { opacity: 0, y: 14, duration: 1.1, ease: 'power3.out', stagger: 0.08, delay: 0.6 }) : null;
    });
    return () => { cancel(); tw?.progress(1).kill(); };
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
      st.probePos = v3(posOf(lat, lon, g.h * st.exag));
      setPeriod(null);
      setProbeMin(false); setProbe({ lat, lon, groundM: g.h, hz, resM: g.resM, src: g.src, distKm });
      st.request();
      if (rangeOpen) {
        const next = { ...rangeIn, lat: lat.toFixed(4), lon: (((lon % 360) + 360) % 360).toFixed(4) };
        setRangeIn(next);
        applyRangeRef.current(next, false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, rangeOpen, rangeIn]);
  /**
   * Double-click: fly down to a point and look across it almost horizontally (8° above the ground), from a
   * distance set by the finest terrain there (60 samples: 300 m on a 5 m site window, about 28 km on the
   * 474 m global tiles). The point becomes the focus: its own tile is meshed at every sample and only its
   * neighbourhood is loaded in detail. The camera stands on the sunward side, so the lit faces point at you.
   */
  const zoomFlat = useCallback((P: THREE.Vector3) => {
    const st = S.current; if (!st) return;
    const U = P.clone().normalize();
    const lat = Math.asin(U.z) * 180 / Math.PI, lon = Math.atan2(U.y, U.x) * 180 / Math.PI;
    const { e, n } = enu(lat, lon);
    const E = v3(e), N = v3(n);
    const g = st.terrainM(lat, lon);
    const D = Math.min(Math.max((g.resM * 60) / 1000, 0.25), 40);
    const sunMF = st.u.uSun.value as THREE.Vector3;
    const sh = new THREE.Vector3(sunMF.dot(E), sunMF.dot(N), 0);
    if (sh.lengthSq() < 1e-8) sh.set(0, 1, 0);
    sh.normalize();
    const az = Math.atan2(sh.x, sh.y) + 0.35, el = (8 * Math.PI) / 180;
    const off = E.clone().multiplyScalar(Math.sin(az) * Math.cos(el)).add(N.clone().multiplyScalar(Math.cos(az) * Math.cos(el))).add(U.clone().multiplyScalar(Math.sin(el)));
    st.focus = { P: P.clone(), lat, lon, D };
    fly(P.clone().addScaledVector(off, D), P, U, 'site', 2.2);
  }, [fly]);
  const zoomRef = useRef(zoomFlat);
  zoomRef.current = zoomFlat;
  /** Close-up of a listed site, on the finest ground loaded under it. */
  function closeSite(s: { lat: number; lon: number; siteHeightM?: number }) {
    const st = S.current; if (!st) return;
    const P = v3(posOf(s.lat, s.lon, s.siteHeightM ?? 0));
    P.setLength(st.surfaceRadius(P));
    zoomRef.current(P);
  }

  /* ---------- rover range on battery ---------- */
  const groundAt = (lat: number, lon: number) => {
    const st = S.current!; const gg = st.terrainM(lat, lon);
    return { true: gg.h, drawn: gg.h * st.exag };
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
      ringLine(r.ring, 0xffffff, false);
      ringLine(r.returnRing, 0xffffff, true);
      st.rangePos = v3(posOf(rangeShown.lat, rangeShown.lon, groundAt(rangeShown.lat, rangeShown.lon).drawn));
      if (sunPlan && sunPlan !== 'busy' && sunPlan.kind === 'drive') {
        const a = { lat: rangeShown.lat, lon: rangeShown.lon }, b = sunPlan.target;
        const pts = Array.from({ length: 129 }, (_, i) => gcInterp(a, b, i / 128));
        const arr = new Float32Array(pts.length * 3);
        pts.forEach((p, i) => arr.set(posOf(p.lat, p.lon, groundAt(p.lat, p.lon).drawn + lift), i * 3));
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, toneMapped: false }));
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
  // lines of sight from the probed point to Earth and toward the Sun follow the point, the time and the relief setting
  useEffect(() => {
    const st = S.current; if (!st) return;
    const show = !!(probe && now);
    st.earthLine.visible = show && earthLineOn;
    st.sunLine.visible = show && sunLineOn;
    if (show && probe && now) {
      const gg = st.terrainM(probe.lat, probe.lon);
      const a = v3(posOf(probe.lat, probe.lon, gg.h * (gg.src.includes('site patch') ? 1 : st.exag) + 2));
      const set = (l: THREE.Line, end: THREE.Vector3, color: number) => {
        const pos = l.geometry.getAttribute('position') as THREE.BufferAttribute;
        pos.setXYZ(0, a.x, a.y, a.z); pos.setXYZ(1, end.x, end.y, end.z); pos.needsUpdate = true;
        l.computeLineDistances();
        (l.material as THREE.LineDashedMaterial).color.set(color);
      };
      set(st.earthLine, new THREE.Vector3().setFromMatrixPosition(st.earth.matrix), now.earthUp ? 0x0071bc : 0x6b6b72);
      set(st.sunLine, a.clone().addScaledVector(st.u.uSun.value as THREE.Vector3, 1e6), now.sunPct > 0.5 ? 0xffffff : 0x6b6b72);
    }
    st.request();
  }, [probe, now, earthLineOn, sunLineOn, relief, hiInfo]);

  if (fail) return <div className="moon-fail">{fail}</div>;
  return (
    <section className={`moon${expanded ? ' expanded' : ''}`} aria-label="3D Moon">
      <div ref={host} className="moon-canvas" role="img" aria-label="The Moon in 3D, lit by the Sun at the selected time. Drag to rotate, scroll to zoom, click the surface to probe a point, double-click to zoom in." />
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
          {!probe && <p className="hud-hint">Drag to rotate · scroll to zoom · click the surface for light and Earth contact · H home · Esc close</p>}
        </div>
        <div className="hud-panels">
        {probe && (
          <div className={`hud-probe${probeMin ? ' min' : ''}`} aria-live="polite">
            <div className="hud-probe-head">
              <button className="hud-collapse" aria-expanded={!probeMin} onClick={() => setProbeMin((x) => !x)}>
                <span className="chev" aria-hidden>▾</span>Probed point
                <span className="hud-probe-sum num">{probeMin ? fmtLatLon(probe.lat, probe.lon) : 'Hide'}</span>
              </button>
            </div>
            {/* collapses into its header bar instead of closing, so the result is always one click away */}
            <div className="hud-probe-body"><div>
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
            {sunLineOn && now && <p className="hud-probe-note"><span className={`los-swatch sun${now.sunPct >= 99.5 ? '' : now.sunPct > 0.5 ? ' partial' : ' blocked'}`} aria-hidden />Dotted line to the Sun: {now.sunPct >= 99.5 ? 'whole disc in view' : now.sunPct > 0.5 ? 'partly behind the skyline' : 'blocked by terrain or the Moon itself'}</p>}
            {earthLineOn && now && <p className="hud-probe-note"><span className={`los-swatch${now.earthUp ? '' : ' blocked'}`} aria-hidden />Dotted line to Earth: {now.earthUp ? 'clear line of sight' : 'blocked by terrain or the Moon itself'}</p>}
            {onPlanLaunch && <button className="hud-probe-launch" onClick={() => onPlanLaunch(probe.lat, probe.lon)}>Plan a launch to here</button>}
            <p className="hud-probe-note">Skyline from {probe.src} terrain, 2 m mast. Approximate.</p>
            </div></div>
          </div>
        )}
        {rangeOpen && (
          <form className={`hud-range${rangeMin ? ' min' : ''}`} onSubmit={(e) => { e.preventDefault(); applyRange(rangeIn, true); }}>
            <div className="hud-probe-head">
              <button type="button" className="hud-collapse" aria-expanded={!rangeMin} onClick={() => setRangeMin((x) => !x)}><span className="chev" aria-hidden>▾</span>Rover range on battery</button>
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
        </div>
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
        <div className="hud-br hud-anim">
          <button className={`hud-toggle${rangeOpen ? ' on' : ''}`} aria-pressed={rangeOpen} onClick={openRange} title="How far a rover can drive on battery alone, drawn as a ring on the Moon"><Icon name="rover" /> Rover range</button>
          {hiInfo && sel && <button className="hud-toggle" onClick={() => setViewer(sel.id)} title="Open the site mesh in a 3D viewport"><Icon name="mountain" /> Terrain 3D</button>}
          <div className="hud-menu-wrap" ref={menuRef}>
            <button className={`hud-toggle${menuOpen ? ' on' : ''}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((x) => !x)} title="Lighting, shadows, relief and pointers"><Icon name="sparkle" /> Display <span className="chev" aria-hidden>▾</span></button>
            {menuOpen && (
              <div className="hud-menu" role="menu" aria-label="Display">
                {([
                  ['lamp', 'Light dark areas', fill, () => setFill((x) => !x), 'Shine a floodlight from your viewpoint so the night side and shadowed craters are visible. Display only: the probe and verdicts still use real sunlight.'],
                  ['compass', 'Sun & Earth pointers', pointers, () => setPointers((x) => !x), 'Show where the Sun and Earth are, with arrows when they are off screen'],
                  ['shadow', 'Shadows', shadows, () => setShadows((x) => !x), 'Cast shadows, ray-traced on the LOLA heights'],
                  ['mountain', 'Relief ×3', relief > 1, () => setRelief((x) => (x > 1 ? 1 : 3)), 'Exaggerate the relief 3×'],
                  ['sparkle', 'Fine detail', detail, () => setDetail((x) => !x), 'Procedural craters and rocks below the resolution of the real data. Illustrative only.'],
                  ['compass', 'Line to Earth', earthLineOn, () => setEarthLineOn((x) => !x), 'Dotted line from the probed point to Earth: blue when Earth is in view, red when terrain blocks it'],
                  ['lamp', 'Line to Sun', sunLineOn, () => setSunLineOn((x) => !x), 'Dotted line from the probed point toward the Sun: yellow when the whole disc is visible, orange when partly blocked, red when blocked'],
                ] as const).map(([icon, label, on, toggle, title]) => (
                  <button key={label} role="menuitemcheckbox" aria-checked={on} className="hud-menu-item" onClick={toggle} title={title}>
                    <Icon name={icon} /><span>{label}</span><span className={`hud-switch${on ? ' on' : ''}`} aria-hidden />
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className={`hud-toggle${expanded ? ' on' : ''}`} aria-pressed={expanded} onClick={() => setExpanded((x) => !x)} title={expanded ? 'Back to the normal size' : 'Make the Moon fill the window'}><Icon name="expand" /> {expanded ? 'Shrink' : 'Expand'}</button>
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
