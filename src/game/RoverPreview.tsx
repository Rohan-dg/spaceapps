import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildRover, disposeBuilt, roverEnvironment, type RoverId } from './rovers';

/** A rover on a slowly spinning turntable, for the picker. Drag to spin it yourself. */
export default function RoverPreview({ id, base }: { id: RoverId; base: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    const el = host.current; if (!el) return;
    let live = true, raf = 0, drag: number | null = null, vel = 0.5, yaw = -0.6;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
    const env = roverEnvironment(renderer); scene.environment = env; scene.environmentIntensity = 0.45;
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a2a2a, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(3, 4, 2.5); scene.add(key);
    const rim = new THREE.DirectionalLight(0xff8a7a, 1.4); rim.position.set(-3, 2, -3); scene.add(rim);
    // a soft coral glow under the rover and a turntable ring
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, map: (() => {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
      const r = g.createRadialGradient(64, 64, 4, 64, 64, 64); r.addColorStop(0, 'rgba(255,99,99,0.55)'); r.addColorStop(0.6, 'rgba(255,99,99,0.14)'); r.addColorStop(1, 'rgba(255,99,99,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
    })() }));
    glow.rotation.x = -Math.PI / 2; scene.add(glow);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: 0xff6363, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; scene.add(ring);
    const turn = new THREE.Group(); scene.add(turn);
    const size = () => { const w = el.clientWidth, h = el.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(size); ro.observe(el); size();
    let model: THREE.Group | null = null;
    setBusy(true);
    buildRover(id, base).then((b) => {
      if (!live) { disposeBuilt(b.body); b.wheels.forEach(disposeBuilt); return; }
      const g = new THREE.Group(); g.add(b.body, ...b.wheels);
      const bb = new THREE.Box3().setFromObject(g), c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
      g.position.set(-c.x, -bb.min.y, -c.z); turn.add(g); model = g;
      const r = Math.max(s.x, s.z) * 0.62 + 0.1; glow.scale.setScalar(r * 1.25); ring.scale.setScalar(r * 1.05);
      const d = Math.max(s.x * 1.05, s.y * 1.75, s.z) * 1.75 + 0.45; cam.position.set(0, s.y * 0.5 + d * 0.3, d); cam.lookAt(0, s.y * 0.4, 0);
      setBusy(false);
    }).catch(() => setBusy(false));
    let last = performance.now();
    const frame = (now: number) => {
      if (!live) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (drag === null) { vel += ((reduce ? 0 : 0.5) - vel) * Math.min(1, dt * 1.5); yaw += vel * dt; }
      turn.rotation.y = yaw;
      renderer.render(scene, cam);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const down = (e: PointerEvent) => { drag = e.clientX; el.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (drag === null) return; const dx = (e.clientX - drag) * 0.012; yaw += dx; vel = dx / 0.016; drag = e.clientX; };
    const up = () => { drag = null; };
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    return () => {
      live = false; cancelAnimationFrame(raf); ro.disconnect();
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      if (model) disposeBuilt(model);
      scene.traverse((x) => { const m = x as THREE.Mesh; m.geometry?.dispose(); for (const mt of ([] as THREE.Material[]).concat(m.material ?? [])) { (mt as THREE.MeshBasicMaterial).map?.dispose(); mt.dispose(); } });
      env.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [id, base]);
  return <div className="rg-preview" ref={host} role="img" aria-label="The chosen rover, spinning. Drag to turn it.">{busy && <span className="rg-preview-wait" aria-hidden="true" />}</div>;
}
