/**
 * Site terrain viewport: the LOLA high-resolution window for one site as a plain editable-style mesh,
 * in the manner of a 3D modelling viewport (solid shading, floor grid, axis gizmo, orbit/pan/zoom).
 * Nothing is photoreal: shading is either neutral studio light or the actual Sun direction at time t.
 *
 * Frame: Z up, X/Y = south polar stereographic metres relative to the site (X = +PS x, Y = +PS y).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type PolarGrid, sampleGrid, stereoXY } from '../lib/moon/frames';
import { decodeHeights } from './MoonView';

const base = import.meta.env.BASE_URL;
const MESH_SIDE = 640;
const RADII = [5, 10, 25, 50, 100];

/** The 148 m south polar grid, decoded once and shared by every viewport. */
let capP: Promise<PolarGrid> | null = null;
function southCap() {
  capP ??= fetch(`${base}moon/textures.json`).then((r) => r.json()).then(async (t: { south: { resM: number; halfM: number; hMinM: number; quantumM: number } }) => {
    const sm = t.south, d = await decodeHeights(`${base}moon/south_height.png`, sm.hMinM, sm.quantumM);
    return { h: d.data, n: d.w, resM: sm.resM, x0: -sm.halfM + sm.resM / 2, y0: sm.halfM - sm.resM / 2 };
  });
  capP.catch(() => { capP = null; });
  return capP;
}

interface HiMeta { id: string; dem: string; resM: number; n: number; lat: number; lon: number; row0: number; col0: number; projOffset: number; hMinM: number; quantumM: number }
type Shade = 'solid' | 'sun';
type Stats = { dem: string; res: number; km: number; hMin: number; hMax: number; tris: number; grid: number };

/** Sun unit vector in the viewport frame from local elevation/azimuth (deg, azimuth from north toward east). */
function sunVec(lat: number, lon: number, el: number, az: number) {
  const d = 1e-4, [x0, y0] = stereoXY(lat, lon);
  const [xn, yn] = stereoXY(lat + d, lon), [xe, ye] = stereoXY(lat, lon + d);
  const N = new THREE.Vector3(xn - x0, yn - y0, 0).normalize();
  const E = new THREE.Vector3(xe - x0, ye - y0, 0).normalize();
  const r = Math.PI / 180, ce = Math.cos(el * r);
  return E.multiplyScalar(ce * Math.sin(az * r)).add(N.multiplyScalar(ce * Math.cos(az * r))).add(new THREE.Vector3(0, 0, Math.sin(el * r))).normalize();
}

function axisLabel(text: string, color: string) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = color; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111'; g.font = '600 34px -apple-system, "SF Pro Text", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.setScalar(0.42);
  return s;
}

export default function TerrainViewport({ siteId, siteName, lat, lon, sunEl, sunAz, onClose }: {
  siteId: string; siteName: string; lat: number; lon: number; sunEl: number | null; sunAz: number | null; onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [shade, setShade] = useState<Shade>('solid');
  const [wire, setWire] = useState(false);
  const [grid, setGrid] = useState(true);
  const [exag, setExag] = useState(1);
  const [radiusKm, setRadiusKm] = useState(10);
  const [stats, setStats] = useState<Stats | null>(null);
  const [cursor, setCursor] = useState<string>('-');
  const [err, setErr] = useState<string | null>(null);
  const api = useRef<{ apply: (o: { shade: Shade; wire: boolean; grid: boolean; exag: number; sun: THREE.Vector3 | null }) => void; frame: (v: 'top' | 'front' | 'right' | 'persp') => void } | null>(null);

  useEffect(() => {
    const el = host.current; if (!el) return;
    let live = true, raf = 0;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.autoClear = false;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x3d3d3d);
    const camera = new THREE.PerspectiveCamera(40, 1, 10, 2e5);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.15; controls.screenSpacePanning = true;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x505050, 1.6); hemi.position.set(0, 0, 1);
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    const sun = new THREE.DirectionalLight(0xffffff, 3.2);
    sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 2;
    scene.add(hemi, key, sun, sun.target, camera);
    camera.add(key); key.position.set(0.4, 0.6, 1); key.target.position.set(0, 0, -1); camera.add(key.target);

    const mat = new THREE.MeshStandardMaterial({ color: 0xb4b4b4, roughness: 0.92, metalness: 0, flatShading: false });
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x111111, wireframe: true, transparent: true, opacity: 0.35 });
    let mesh: THREE.Mesh | null = null, wireMesh: THREE.Mesh | null = null, gridObj: THREE.Object3D | null = null;
    let ext = 1e4, hRange = 1;

    // axis gizmo, drawn into the corner with its own camera
    const gScene = new THREE.Scene(), gCam = new THREE.OrthographicCamera(-1.6, 1.6, 1.6, -1.6, 0, 10);
    const axes: [THREE.Vector3, string, string][] = [[new THREE.Vector3(1, 0, 0), 'X', '#e8565a'], [new THREE.Vector3(0, 1, 0), 'Y', '#8cc63f'], [new THREE.Vector3(0, 0, 1), 'Z', '#4f8fe6']];
    for (const [d, t, c] of axes) {
      gScene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), d]), new THREE.LineBasicMaterial({ color: c })));
      const s = axisLabel(t, c); s.position.copy(d).multiplyScalar(1.15); gScene.add(s);
    }

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();

    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setViewport(0, 0, w, h); renderer.setScissorTest(false); renderer.clear();
      renderer.render(scene, camera);
      const g = 96;
      gCam.position.copy(camera.position).sub(controls.target).normalize().multiplyScalar(5);
      gCam.up.copy(camera.up); gCam.lookAt(0, 0, 0);
      renderer.setViewport(w - g - 8, h - g - 8, g, g); renderer.setScissor(w - g - 8, h - g - 8, g, g); renderer.setScissorTest(true);
      renderer.clearDepth(); renderer.render(gScene, gCam);
    };

    const frame = (v: 'top' | 'front' | 'right' | 'persp') => {
      const D = ext * 2.4;
      const dir = v === 'top' ? new THREE.Vector3(0, -0.0001, 1) : v === 'front' ? new THREE.Vector3(0, -1, 0.08) : v === 'right' ? new THREE.Vector3(1, 0, 0.08) : new THREE.Vector3(0.55, -0.7, 0.75);
      controls.target.set(0, 0, 0);
      camera.position.copy(dir.normalize().multiplyScalar(D));
      controls.update();
    };

    let opts: Parameters<NonNullable<typeof api.current>['apply']>[0] | null = null;
    const apply: NonNullable<typeof api.current>['apply'] = (o) => {
      opts = o;
      if (!mesh) return;
      mesh.scale.z = o.exag; if (wireMesh) { wireMesh.scale.z = o.exag; wireMesh.visible = o.wire; }
      if (gridObj) gridObj.visible = o.grid;
      const useSun = o.shade === 'sun' && o.sun;
      hemi.intensity = useSun ? 0.06 : 1.6; key.intensity = useSun ? 0 : 1.4;
      sun.visible = !!useSun; mesh.castShadow = mesh.receiveShadow = !!useSun;
      if (useSun) {
        sun.position.copy(o.sun!).multiplyScalar(ext * 3); sun.target.position.set(0, 0, 0);
        const c = sun.shadow.camera; c.left = c.bottom = -ext * 0.75; c.right = c.top = ext * 0.75; c.near = 1; c.far = ext * 6 + hRange * o.exag; c.updateProjectionMatrix();
      }
    };
    api.current = { apply, frame };

    (async () => {
      const [meta, cap] = await Promise.all([
        lat < -80.5 ? fetch(`${base}hires/${siteId}.json`).then((r) => (r.ok ? r.json() as Promise<HiMeta> : null)).catch(() => null) : null,
        southCap(),
      ]);
      if (!live) return;
      const dec = meta ? await decodeHeights(`${base}hires/${siteId}.png`, meta.hMinM, meta.quantumM) : null;
      if (!live) return;
      const hiG: PolarGrid | null = meta && dec ? { h: dec.data, n: meta.n, resM: meta.resM, x0: (meta.col0 - meta.projOffset) * meta.resM, y0: (meta.projOffset - meta.row0) * meta.resM } : null;
      const at = (x: number, y: number) => { const h = hiG ? sampleGrid(hiG, x, y) : NaN; return isNaN(h) ? sampleGrid(cap, x, y) : h; };
      const [xs, ys] = stereoXY(lat, lon);
      const hSite = at(xs, ys);
      if (isNaN(hSite)) { setErr('Site is outside the south polar terrain grid.'); return; }
      const R = radiusKm * 1000, m = MESH_SIDE, step = (2 * R) / (m - 1);
      const pos = new Float32Array(m * m * 3), inside = new Uint8Array(m * m);
      let lo = Infinity, hi = -Infinity, nHi = 0, nIn = 0;
      for (let r = 0, k = 0; r < m; r++) for (let c = 0; c < m; c++, k++) {
        const dx = -R + c * step, dy = R - r * step;
        let h = at(xs + dx, ys + dy);
        if (isNaN(h)) h = hSite;
        pos[k * 3] = dx; pos[k * 3 + 1] = dy; pos[k * 3 + 2] = h - hSite;
        if (Math.hypot(dx, dy) <= R + step) {
          inside[k] = 1; nIn++;
          if (h < lo) lo = h; if (h > hi) hi = h;
          if (hiG && !isNaN(sampleGrid(hiG, xs + dx, ys + dy))) nHi++;
        }
      }
      const tri: number[] = [];
      for (let r = 0; r < m - 1; r++) for (let c = 0; c < m - 1; c++) {
        const a = r * m + c, b = a + 1, d = a + m, e = d + 1;
        if (inside[a] && inside[b] && inside[d] && inside[e]) tri.push(a, d, b, b, d, e);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(new Uint32Array(tri), 1));
      geo.computeVertexNormals(); geo.computeBoundingSphere();
      mesh = new THREE.Mesh(geo, mat); scene.add(mesh);
      wireMesh = new THREE.Mesh(geo, wireMat); wireMesh.visible = false; scene.add(wireMesh);
      ext = R; hRange = hi - lo;
      const srcRes = hiG && nHi ? meta!.resM : cap.resM;
      const dem = hiG && nHi ? `${meta!.dem} ${Math.round((100 * nHi) / nIn)}% + LOLA 148 m` : 'LOLA polar 148 m';

      // floor grid at the lowest point: 1 km major, 200 m minor
      const raw = (ext * 2) / 12, p10 = 10 ** Math.floor(Math.log10(raw)), maj = [1, 2, 5, 10].map((f) => f * p10).find((v) => v >= raw)!;
      const size = Math.ceil((ext * 2) / maj) * maj;
      const g = new THREE.Group();
      const minor = new THREE.GridHelper(size, (size / maj) * 5, 0x4a4a4a, 0x4a4a4a), major = new THREE.GridHelper(size, size / maj, 0x6a6a6a, 0x6a6a6a);
      for (const gh of [minor, major]) { gh.rotation.x = Math.PI / 2; g.add(gh); }
      const ax = (a: THREE.Vector3, c: number) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([a.clone().multiplyScalar(-size / 2), a.clone().multiplyScalar(size / 2)]), new THREE.LineBasicMaterial({ color: c }));
      g.add(ax(new THREE.Vector3(1, 0, 0), 0xb04a4d), ax(new THREE.Vector3(0, 1, 0), 0x6f9a35));
      g.position.z = lo - hSite - 1; gridObj = g; scene.add(g);

      // site origin: a short vertical post
      const post = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, Math.max(150, hRange * 0.08))]), new THREE.LineBasicMaterial({ color: 0xf2a33a, depthTest: false }));
      post.renderOrder = 2; scene.add(post);

      setStats({ dem, res: Math.max(step, srcRes), km: (2 * R) / 1000, hMin: lo, hMax: hi, tris: tri.length / 3, grid: maj });
      frame('persp');
      if (opts) apply(opts);
    })().catch((e) => live && setErr(String(e)));

    // cursor readout: ray-pick on the mesh, at most once per frame
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let pend = false, last: PointerEvent | null = null;
    const onMove = (e: PointerEvent) => {
      last = e; if (pend) return; pend = true;
      requestAnimationFrame(() => {
        pend = false; if (!mesh || !last || last.buttons) return;
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((last.clientX - r.left) / r.width) * 2 - 1, -((last.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObject(mesh, false)[0];
        if (!hit) { setCursor('-'); return; }
        const p = hit.point, z = p.z / (mesh.scale.z || 1);
        const slope = hit.face ? Math.acos(Math.min(1, Math.abs(hit.face.normal.z))) * 180 / Math.PI : NaN;
        setCursor(`x ${(p.x / 1000).toFixed(3)} km  y ${(p.y / 1000).toFixed(3)} km  dz ${z >= 0 ? '+' : ''}${z.toFixed(1)} m  slope ${exag === 1 ? slope.toFixed(1) + '°' : '-'}`);
      });
    };
    renderer.domElement.addEventListener('pointermove', onMove);
    loop();
    return () => {
      live = false; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointermove', onMove);
      mesh?.geometry.dispose(); mat.dispose(); wireMat.dispose(); renderer.dispose(); renderer.domElement.remove();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, radiusKm]);

  const sun = sunEl == null || sunAz == null ? null : sunVec(lat, lon, sunEl, sunAz);
  useEffect(() => { api.current?.apply({ shade, wire, grid, exag, sun }); }, [shade, wire, grid, exag, sunEl, sunAz, stats]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '7') api.current?.frame('top');
      else if (e.key === '1') api.current?.frame('front');
      else if (e.key === '3') api.current?.frame('right');
      else if (e.key === '0' || e.key === 'Home') api.current?.frame('persp');
      else if (e.key === 'z' && !e.metaKey && !e.ctrlKey) setWire((w) => !w);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return createPortal(
    <div className="tv" role="dialog" aria-label={`${siteName} terrain`}>
      <div className="tv-bar">
        <strong>{siteName}</strong>
        <div className="tv-seg" role="radiogroup" aria-label="Shading">
          <button role="radio" aria-checked={shade === 'solid'} onClick={() => setShade('solid')}>Solid</button>
          <button role="radio" aria-checked={shade === 'sun'} disabled={!sun} onClick={() => setShade('sun')}>Sun</button>
        </div>
        <div className="tv-seg" role="radiogroup" aria-label="Radius">
          {RADII.map((r) => <button key={r} role="radio" aria-checked={radiusKm === r} onClick={() => { setStats(null); setRadiusKm(r); }}>r {r} km</button>)}
        </div>
        <button className="tv-tg" aria-pressed={wire} onClick={() => setWire((w) => !w)} title="Wireframe (Z)">Wire</button>
        <button className="tv-tg" aria-pressed={grid} onClick={() => setGrid((g) => !g)}>Grid</button>
        <div className="tv-seg" role="radiogroup" aria-label="Vertical exaggeration">
          {[1, 2, 5].map((x) => <button key={x} role="radio" aria-checked={exag === x} onClick={() => setExag(x)}>Z×{x}</button>)}
        </div>
        <div className="tv-seg" aria-label="View">
          <button onClick={() => api.current?.frame('top')} title="Top (7)">Top</button>
          <button onClick={() => api.current?.frame('front')} title="Front (1)">Front</button>
          <button onClick={() => api.current?.frame('right')} title="Right (3)">Right</button>
          <button onClick={() => api.current?.frame('persp')} title="Reset (0)">Perspective</button>
        </div>
        <button className="tv-close" onClick={onClose} aria-label="Close terrain viewport">Close</button>
      </div>
      <div ref={host} className="tv-canvas">{err && <p className="tv-err">{err}</p>}</div>
      <div className="tv-foot num">
        {stats ? <>
          <span>{stats.dem}</span><span>{stats.res.toFixed(0)} m mesh</span><span>⌀ {stats.km.toFixed(0)} km</span><span>grid {stats.grid >= 1000 ? `${stats.grid / 1000} km` : `${stats.grid} m`}</span>
          <span>h {stats.hMin.toFixed(0)}…{stats.hMax.toFixed(0)} m</span><span>{(stats.tris / 1e3).toFixed(0)}k tris</span>
          {sunEl != null && <span>sun {sunEl.toFixed(2)}° el {sunAz!.toFixed(0)}° az</span>}
          <span className="tv-cur">{cursor}</span>
        </> : !err && <span>Loading heights</span>}
      </div>
    </div>,
    document.body,
  );
}
