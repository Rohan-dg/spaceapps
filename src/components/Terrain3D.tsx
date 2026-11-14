import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SiteData } from '../lib/data';
import { skyAt } from '../lib/ephemeris';
import { siteOf } from '../lib/useScenario';

interface Tile { n: number; halfKm: number; z: Int16Array }

/** Unit vector in three.js axes (x = east, y = up, z = −north) for an azimuth/elevation. */
function dirVec(az: number, el: number) {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a));
}

export default function Terrain3D({ data, t }: { data: SiteData; t: number }) {
  const mount = useRef<HTMLDivElement>(null);
  const [tile, setTile] = useState<Tile | null>(null);
  const [missing, setMissing] = useState(false);
  const [exag, setExag] = useState(2);
  const ctx = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; sun: THREE.DirectionalLight; sunDisk: THREE.Mesh; earth: THREE.Mesh; mesh: THREE.Mesh; controls: OrbitControls; render: () => void } | null>(null);
  const site = useMemo(() => siteOf(data), [data]);
  const id = data.info.id;

  useEffect(() => {
    setTile(null); setMissing(false);
    if (data.info.approximate || data.info.demResolutionM === null || data.info.demResolutionM > 100) { setMissing(true); return; }
    const base = import.meta.env.BASE_URL;
    Promise.all([fetch(`${base}terrain/${id}.json`).then((r) => r.json()), fetch(`${base}terrain/${id}.bin`).then((r) => r.arrayBuffer())])
      .then(([m, b]) => setTile({ n: m.n, halfKm: m.halfKm, z: new Int16Array(b) }))
      .catch(() => setMissing(true));
  }, [id, data.info]);

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
    scene.background = new THREE.Color('#03050b');
    const half = tile.halfKm * 1000;
    const camera = new THREE.PerspectiveCamera(50, w / h, 10, 200000);
    camera.position.set(half * 0.9, half * 0.6, half * 0.9);
    const geo = new THREE.PlaneGeometry(2 * half, 2 * half, tile.n - 1, tile.n - 1);
    geo.rotateX(-Math.PI / 2); // plane in x/z, row 0 at −z (north)
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, tile.z[i] * exag);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#9aa1ad', roughness: 0.95, metalness: 0 }));
    mesh.receiveShadow = true; mesh.castShadow = true;
    scene.add(mesh);
    scene.add(new THREE.HemisphereLight('#5a6f99', '#20242c', 0.55)); // dim fill light (stand-in for earthshine) so unlit terrain stays readable
    const sun = new THREE.DirectionalLight('#fff4dc', 2.6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -half * 1.5, right: half * 1.5, top: half * 1.5, bottom: -half * 1.5, near: 1, far: half * 8 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 40;
    scene.add(sun); scene.add(sun.target);
    const sunDisk = new THREE.Mesh(new THREE.SphereGeometry(half * 0.05, 16, 16), new THREE.MeshBasicMaterial({ color: '#ffc94d' }));
    const earth = new THREE.Mesh(new THREE.SphereGeometry(half * 0.08, 24, 24), new THREE.MeshBasicMaterial({ color: '#5cc8ff' }));
    scene.add(sunDisk); scene.add(earth);
    // site marker: mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 600, 8), new THREE.MeshBasicMaterial({ color: '#ff6b4a' }));
    mast.position.set(0, 300, 0); scene.add(mast);
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
  }, [tile, exag]);

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
  }, [t, site, tile, exag]);

  if (missing) return <div className="terrain3d muted">The 3D view is available for the curated south-polar sites only, which have 40 m terrain tiles.</div>;
  return (
    <div className="terrain3d">
      <div ref={mount} className="three-mount" aria-label="3D terrain view; drag to orbit, scroll to zoom" role="img" />
      <div className="three-bar">
        <span className="pano-note">The 24 × 24 km of terrain around the site (red mast), lit from the true Sun direction with real shadows (a dim blue fill keeps unlit ground readable). Drag to orbit, scroll to zoom. Terrain beyond the tile also shades the site; the panorama is the authoritative view.</span>
        <label className="speed">Vertical ×
          <select value={exag} onChange={(e) => setExag(Number(e.target.value))}>{[1, 2, 4].map((x) => <option key={x} value={x}>{x}</option>)}</select>
        </label>
      </div>
    </div>
  );
}
