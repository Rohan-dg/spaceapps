import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SiteData } from '../lib/data';
import { skyAt } from '../lib/ephemeris';
import { terrainTile, type PolarDem, type TerrainTile } from '../lib/raymarch';
import { decodeI16 } from '../lib/series';
import { useTheme } from '../lib/theme';
import { siteOf } from '../lib/useScenario';

interface Tile extends TerrainTile { source: string }

const base = import.meta.env.BASE_URL;
let demP: Promise<PolarDem> | null = null;
/** The 400 m south-polar DEM (same file the custom-site worker uses), fetched once on demand. */
const loadPolarDem = () => (demP ??= fetch(`${base}dem/south_polar_400m.json`)
  .then((r) => { if (!r.ok) throw new Error(`DEM: HTTP ${r.status}`); return r.json(); })
  .then((m) => ({ data: decodeI16(m.data), size: m.size, resM: m.resM, scaleFactor: m.scaleFactor }))
  .catch((e) => { demP = null; throw e; }));

/** Precomputed tile from public/terrain if there is one, else one built here from the 400 m DEM. */
async function loadTile(id: string, lat: number, lon: number): Promise<Tile> {
  if (!id.startsWith('custom_')) {
    const r = await fetch(`${base}terrain/${id}.json`).catch(() => null);
    if (r?.ok) {
      const m = await r.json();
      return { n: m.n, halfKm: m.halfKm, z: decodeI16(m.data), source: m.dem ?? 'LOLA' };
    }
  }
  if (lat > -80.5) throw new Error('no terrain');
  const dem = await loadPolarDem();
  return { ...terrainTile(dem, lat, lon), source: 'LDEM_80S_40M, 400 m downsample (built in your browser)' };
}

/** Unit vector in three.js axes (x = east, y = up, z = −north) for an azimuth/elevation. */
function dirVec(az: number, el: number) {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a));
}

export default function Terrain3D({ data, t }: { data: SiteData; t: number }) {
  const mount = useRef<HTMLDivElement>(null);
  const [tile, setTile] = useState<Tile | null>(null);
  const [missing, setMissing] = useState(false);
  const [building, setBuilding] = useState(false);
  const [exag, setExag] = useState(2);
  const { c: k } = useTheme();
  const ctx = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; sun: THREE.DirectionalLight; sunDisk: THREE.Mesh; earth: THREE.Mesh; mesh: THREE.Mesh; controls: OrbitControls; render: () => void } | null>(null);
  const site = useMemo(() => siteOf(data), [data]);
  const id = data.info.id;

  useEffect(() => {
    let live = true;
    setTile(null); setMissing(false); setBuilding(true);
    loadTile(id, data.horizon.lat, data.horizon.lon)
      .then((tl) => live && setTile(tl))
      .catch(() => live && setMissing(true))
      .finally(() => live && setBuilding(false));
    return () => { live = false; };
  }, [id, data.horizon.lat, data.horizon.lon]);

  // build scene when tile/exaggeration changes
  useEffect(() => {
    const el = mount.current;
    if (!el || !tile) return;
    const w = el.clientWidth, h = Math.min(460, Math.max(300, w * 0.55));
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(k.sky);
    const half = tile.halfKm * 1000;
    const camera = new THREE.PerspectiveCamera(50, w / h, 10, 200000);
    camera.position.set(half * 0.9, half * 0.6, half * 0.9);
    const geo = new THREE.PlaneGeometry(2 * half, 2 * half, tile.n - 1, tile.n - 1);
    geo.rotateX(-Math.PI / 2); // plane in x/z, row 0 at −z (north)
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, tile.z[i] * exag);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#a19d96', roughness: 0.95, metalness: 0 }));
    mesh.receiveShadow = true; mesh.castShadow = true;
    scene.add(mesh);
    scene.add(new THREE.HemisphereLight('#8f8a82', '#2a2826', 0.5)); // dim fill light (stand-in for earthshine) so unlit terrain stays readable
    const sun = new THREE.DirectionalLight('#fff4dc', 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -half * 1.5, right: half * 1.5, top: half * 1.5, bottom: -half * 1.5, near: 1, far: half * 8 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = half / 300;
    scene.add(sun); scene.add(sun.target);
    const sunDisk = new THREE.Mesh(new THREE.SphereGeometry(half * 0.05, 16, 16), new THREE.MeshBasicMaterial({ color: k.sunDisk }));
    const earth = new THREE.Mesh(new THREE.SphereGeometry(half * 0.08, 24, 24), new THREE.MeshBasicMaterial({ color: k.earth }));
    scene.add(sunDisk); scene.add(earth);
    // site marker: mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(half / 300, half / 300, half / 20, 8), new THREE.MeshBasicMaterial({ color: k.accent }));
    mast.position.set(0, half / 40, 0); scene.add(mast);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);
    ctx.current = { renderer, scene, camera, sun, sunDisk, earth, mesh, controls, render };
    const ro = new ResizeObserver(() => { const ww = el.clientWidth, hh = Math.min(460, Math.max(300, ww * 0.55)); renderer.setSize(ww, hh); camera.aspect = ww / hh; camera.updateProjectionMatrix(); render(); });
    ro.observe(el);
    return () => {
      ro.disconnect(); controls.dispose(); renderer.dispose(); geo.dispose();
      el.removeChild(renderer.domElement); ctx.current = null;
    };
  }, [tile, exag, k]);

  // update Sun/Earth for time
  useEffect(() => {
    const c = ctx.current;
    if (!c || !tile) return;
    const k = skyAt(site, new Date(t));
    const half = tile.halfKm * 1000;
    const sd = dirVec(k.sun.az, k.sun.el), ed = dirVec(k.earth.az, k.earth.el);
    c.sun.position.copy(sd.clone().multiplyScalar(half * 4));
    c.sun.intensity = k.sun.el > -1 ? 2.6 : 0;
    c.sunDisk.position.copy(sd.clone().multiplyScalar(half * 1.6));
    c.earth.position.copy(ed.clone().multiplyScalar(half * 1.6));
    c.render();
  }, [t, site, tile, exag, k]);

  if (missing) return <div className="terrain3d empty">No terrain model covers this point, so there is no 3D landscape. Switch to the Horizon view or Sky from above for this site.</div>;
  const size = tile ? `${tile.halfKm * 2} × ${tile.halfKm * 2} km` : '';
  return (
    <>
      <div className="terrain3d">
        {building && <div className="loading">Building the 3D terrain…</div>}
        <div ref={mount} className="three-mount" aria-label="3D terrain around the site. Drag to orbit, scroll to zoom." role="img" />
      </div>
      <div className="three-bar">
        <p className="note">A {size} patch of real terrain around the site (orange mast), from {tile?.source ?? 'LOLA'}, lit from where the Sun actually is at this moment. <b>Drag to rotate, scroll to zoom.</b> Mountains outside this patch can also cast shadows, so the ratings come from the Horizon view.</p>
        <label className="speed">Height ×
          <select id="exag" value={exag} onChange={(e) => setExag(Number(e.target.value))}>{[1, 2, 4].map((x) => <option key={x} value={x}>{x}</option>)}</select>
        </label>
      </div>
    </>
  );
}
