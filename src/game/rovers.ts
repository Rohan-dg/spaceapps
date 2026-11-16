/**
 * The rovers you can drive. Each is a NASA rover or one built for a NASA programme (flown, built or in development),
 * with a call sign of its own.
 *
 * What is real: the vehicle each one is based on, its layout (wheel count and placement, solar arrays, mast, tools)
 * and its proportions, taken from published dimensions and concept art. RASSOR uses NASA's own 3D model; the others
 * are drawn here. What is a game's: the power, heat and speed figures in `spec`. They keep each rover's character
 * (the Apollo buggy is fast and runs on batteries alone, the Lunar Terrain Vehicle carries the biggest array and
 * battery, MoonRanger sips power, VIPER sees ice from further away) but are scaled so a mission fits a short session.
 *
 * Every drawn model is baked (see bake()) into one mesh per material, so a rover costs a couple of dozen draw calls.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SPEC, type Spec } from './sim';

export type RoverId = 'badger' | 'frostbite' | 'dustdevil' | 'tortoise' | 'hare';

export interface RoverGeom {
  /** half wheelbase (front and rear contact from the centre), half track (left and right), wheel radius, all in metres */
  wb: number; tw: number; wr: number;
  /** chase camera distance and the height of the mast camera and antenna */
  cam: number; mastH: number;
}
export interface RoverDef {
  id: RoverId; callsign: string; basis: string; origin: string; blurb: string;
  perk: string; drawback: string;
  /** kid-friendly words for the picker: a nickname, one simple line, a super power and a watch-out */
  tag: string; kid: string; power: string; watch: string; color: string;
  facts: [string, string][];
  /** 0..5 for the picker's bars */
  bars: { speed: number; battery: number; solar: number; cold: number; science: number };
  spec: Spec; geom: RoverGeom;
  /** seconds to collect a sample, ice detector range in metres, and what the sampling tool is called */
  digS: number; detectM: number; tool: string;
}

const base = (o: Partial<Spec>): Spec => ({ ...SPEC, ...o });

export const ROVERS: RoverDef[] = [
  {
    id: 'badger', tag: 'The Digger', kid: 'A little robot with spinning buckets on both ends. It scoops up Moon dirt super fast!', power: 'Digs samples in a flash', watch: 'Its ice sensor only works up close', color: '#ff6363', callsign: 'Badger', basis: 'RASSOR', origin: 'NASA Kennedy Space Center · excavation robot prototype',
    blurb: 'A low, tough digger with a bucket drum at each end. It throws regolith in both directions at once, so it never pushes itself off its own footing.',
    perk: 'Fastest sampler: the bucket drums dig in half the time.', drawback: 'Short-range ice detector.',
    facts: [['Mass', 'about 66 kg'], ['Wheels', '4'], ['Tool', 'two counter-rotating bucket drums'], ['Status', 'tested on Earth']],
    bars: { speed: 3, battery: 2, solar: 3, cold: 2, science: 5 },
    spec: SPEC, geom: { wb: 0.249, tw: 0.263, wr: 0.224, cam: 7, mastH: 0.95 }, digS: 2.2, detectM: 30, tool: 'bucket drums',
  },
  {
    id: 'frostbite', tag: 'The Ice Hunter', kid: 'Built to sniff out frozen water hiding in the dark, with headlights to see where the Sun never shines.', power: 'Senses ice from far away', watch: 'Its long drill takes a while', color: '#63a1ff', callsign: 'Frostbite', basis: 'VIPER', origin: 'NASA · Volatiles Investigating Polar Exploration Rover',
    blurb: 'Built to hunt water ice at the south pole. Its neutron spectrometer senses hydrogen under the wheels, its headlights see into the dark, and its upright panels catch a Sun that never climbs high.',
    perk: 'Neutron spectrometer: senses ice from 50% further away.', drawback: 'A 1 m drill is slow to run.',
    facts: [['Mass', 'about 430 kg'], ['Size', '1.5 × 1.5 × 2.5 m'], ['Wheels', '4, each steered'], ['Status', 'built; mission cancelled in 2024']],
    bars: { speed: 3, battery: 4, solar: 4, cold: 3, science: 4 },
    spec: base({ batteryWh: 900, solarW: 300, driveW: 190, heaterMaxW: 120, vMax: 4.2, freezeC: -50, lampW: 30 }),
    geom: { wb: 0.55, tw: 0.62, wr: 0.25, cam: 9.5, mastH: 2.2 }, digS: 5, detectM: 45, tool: 'TRIDENT drill',
  },
  {
    id: 'dustdevil', tag: 'The Speedster', kid: "The real moon buggy astronauts drove! Zoom across the Moon, but there's no way to recharge.", power: 'Super fast with a giant battery', watch: 'No solar panels, so save your power', color: '#ffb547', callsign: 'Dust Devil', basis: 'Apollo Lunar Roving Vehicle', origin: 'NASA · driven on Apollo 15, 16 and 17 (1971 to 1972)',
    blurb: 'The moon buggy astronauts drove. Wire-mesh wheels, an umbrella antenna and two big silver-zinc batteries. No solar panels at all: when the battery is gone, the drive is over.',
    perk: 'By far the fastest, with the biggest battery.', drawback: 'No solar panels, so it can never recharge.',
    facts: [['Mass', '210 kg empty'], ['Length', '3.1 m'], ['Wheels', '4, 0.82 m wire mesh'], ['Top speed', 'about 13 km/h']],
    bars: { speed: 5, battery: 5, solar: 0, cold: 2, science: 2 },
    spec: base({ batteryWh: 2600, solarW: 0, driveW: 320, idleW: 40, heaterMaxW: 80, vMax: 9, digW: 120 }),
    geom: { wb: 1.145, tw: 0.915, wr: 0.409, cam: 12, mastH: 1.9 }, digS: 3, detectM: 30, tool: 'sample scoop',
  },
  {
    id: 'tortoise', tag: 'The Hauler', kid: 'The new moon car NASA is building for Artemis astronauts. A big solar wall on its back and a huge battery. It can even drive itself!', power: 'Biggest solar array and battery', watch: 'Heavy, so hills drain power fast', color: '#9b8cff', callsign: 'Trailblazer', basis: 'Artemis Lunar Terrain Vehicle', origin: 'NASA · Artemis Lunar Terrain Vehicle (in development)',
    blurb: 'NASA\'s next moon car for Artemis astronauts, designed to drive itself between crew visits. Modelled on the published concept: four large steered wheels on independent suspension, two crew seats, a rear power module and a tall Sun-tracking solar array that catches the low polar Sun.',
    perk: 'Huge battery and the largest solar array.', drawback: 'Heavy: climbing and the cold drain the battery fast.',
    facts: [['Seats', '2 astronauts, or none (driven from Earth)'], ['Wheels', '4, each steered'], ['Power', 'Sun-tracking solar array + batteries'], ['Status', 'in development for Artemis']],
    bars: { speed: 3, battery: 5, solar: 5, cold: 3, science: 3 },
    spec: base({ batteryWh: 1500, solarW: 380, driveW: 280, vMax: 4.2, heaterMaxW: 130 }),
    geom: { wb: 1.2, tw: 1.0, wr: 0.4, cam: 12.5, mastH: 1.5 }, digS: 4, detectM: 30, tool: 'robotic arm',
  },
  {
    id: 'hare', tag: 'The Scout', kid: 'A suitcase-sized robot that explores on its own, finding its way around rocks without waiting for Earth.', power: 'Uses very little power', watch: 'Small battery and the slowest rover', color: '#5fd4b5', callsign: 'Ranger', basis: 'MoonRanger', origin: 'Carnegie Mellon University and Astrobotic · built with NASA support for a polar mission',
    blurb: 'A small autonomous rover that plans its own drives. A solar array covers its top and a second one stands on its back for the low polar Sun, stereo cameras and a lidar look ahead, and a neutron spectrometer underneath looks for hidden hydrogen.',
    perk: 'Sips power and senses ice a little further away.', drawback: 'The slowest rover here, with a small battery.',
    facts: [['Mass', 'about 13 kg'], ['Wheels', '4, skid-steered'], ['Power', 'solar arrays + battery'], ['Drives', 'by itself, planning around rocks']],
    bars: { speed: 1, battery: 2, solar: 3, cold: 2, science: 3 },
    spec: base({ batteryWh: 420, solarW: 200, idleW: 14, driveW: 70, heaterMaxW: 60, vMax: 2.8, txW: 40 }),
    geom: { wb: 0.26, tw: 0.3, wr: 0.1, cam: 4.5, mastH: 0.4 }, digS: 4, detectM: 34, tool: 'spectrometer',
  },
];
export const roverById = (id: string) => ROVERS.find((r) => r.id === id) ?? ROVERS[0];

/* ---------------- models ---------------- */

/**
 * A built rover: body parts on `body`, wheels in left/right order (even index = left, the +x side), `pose(d)` moves
 * the sampling tool from stowed (0) to working (1), and `spin(dt)` turns whatever spins while sampling.
 * Frame: x left, y up, z forward, metres; the wheel axles sit at y = 0.
 */
export interface Built { body: THREE.Group; wheels: THREE.Group[]; pose: (dig: number) => void; spin: (dt: number) => void }

type Mat = THREE.Material;
const M = (color: number, metal = 0.4, rough = 0.55, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...extra });
const mesh = (g: THREE.BufferGeometry, m: Mat | Mat[], x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };
/** a box with softly bevelled edges, so its corners catch highlights like machined or folded metal (tiny parts stay sharp) */
const box = (w: number, h: number, d: number, m: Mat | Mat[], x = 0, y = 0, z = 0) => {
  const lo = Math.min(w, h, d);
  return mesh(lo >= 0.03 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(0.03, lo * 0.18)) : new THREE.BoxGeometry(w, h, d), m, x, y, z);
};
const cyl = (r0: number, r1: number, h: number, m: Mat | Mat[], seg = 20) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m);
/** a round bar from a to b (suspension links, frame tubes, antenna struts) */
function tube(a: [number, number, number], b: [number, number, number], r: number, m: Mat, seg = 8) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), o = cyl(r, r, d.length(), m, seg);
  o.position.copy(A).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return o;
}
/** a camera lens looking forward (+z) */
function lens(r: number, m: Mat, glass: Mat, x: number, y: number, z: number) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const b = cyl(r, r, r * 1.6, m, 14); b.rotation.x = Math.PI / 2; g.add(b);
  const l = cyl(r * 0.7, r * 0.7, 0.01, glass, 14); l.rotation.x = Math.PI / 2; l.position.z = r * 0.82; g.add(l); return g;
}
const canvasTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
};
/** a height map for surface relief (white = raised), drawn in greyscale */
const bumpTex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
};
/** crinkled gold or silver multi-layer insulation */
const foilMat = (base = '#c9a24a', hi = '255,240,190', lo = '90,60,10') => new THREE.MeshStandardMaterial({ metalness: 0.9, roughness: 0.26, bumpScale: 2.2,
  bumpMap: bumpTex(128, 128, (g) => { g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 220; i++) { const v = Math.random() < 0.5 ? 255 : 0; g.strokeStyle = `rgba(${v},${v},${v},0.35)`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const x = Math.random() * 128, y = Math.random() * 128; g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30); g.stroke(); } }),
  map: canvasTex(128, 128, (g) => {
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? hi : lo},${0.07 + Math.random() * 0.13})`; g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 12, 1 + Math.random() * 3, Math.random() * 3, 0, 6.3); g.fill(); }
}) });
/** painted metal panels with seams and small rivets */
const plateMat = (base = '#e7e5e0', seam = '#a9a69f') => new THREE.MeshStandardMaterial({ metalness: 0.3, roughness: 0.48, bumpScale: 0.8,
  bumpMap: bumpTex(128, 128, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#000'; g.lineWidth = 2; g.strokeRect(4, 4, 120, 120); g.beginPath(); g.moveTo(64, 4); g.lineTo(64, 124); g.stroke(); g.fillStyle = '#000'; for (let i = 10; i < 124; i += 14) { g.fillRect(i, 7, 2, 2); g.fillRect(i, 119, 2, 2); } }),
  map: canvasTex(128, 128, (g) => {
  g.fillStyle = base; g.fillRect(0, 0, 128, 128); g.strokeStyle = seam; g.lineWidth = 1.5; g.strokeRect(4, 4, 120, 120); g.beginPath(); g.moveTo(64, 4); g.lineTo(64, 124); g.stroke();
  g.fillStyle = seam; for (let i = 10; i < 124; i += 14) { g.fillRect(i, 7, 2, 2); g.fillRect(i, 119, 2, 2); }
}) });

/** A wheel on the x axle: tyre, rims, grousers, hub and optional spokes. */
function wheel(r: number, w: number, o: { tyre: Mat; trim: Mat; hub?: Mat; spokes?: number; grousers?: number; mesh?: boolean }): THREE.Group {
  const g = new THREE.Group();
  // a lathed tyre: rounded shoulders and a slightly crowned tread instead of a flat drum
  const hw = w / 2, prof = [[r * 0.55, -hw], [r * 0.9, -hw], [r * 0.975, -hw * 0.82], [r, -hw * 0.5], [r * 1.005, 0], [r, hw * 0.5], [r * 0.975, hw * 0.82], [r * 0.9, hw], [r * 0.55, hw]].map(([a, b]) => new THREE.Vector2(a, b));
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(prof, 40), o.tyre); tyre.rotation.z = Math.PI / 2; g.add(tyre);
  if (o.mesh) { const drum = cyl(r * 0.82, r * 0.82, w * 0.9, new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.2, roughness: 0.9 }), 28); drum.rotation.z = Math.PI / 2; g.add(drum); }
  if (!o.spokes) { const disc = cyl(r * 0.56, r * 0.56, w * 0.98, o.hub ?? o.trim, 24); disc.rotation.z = Math.PI / 2; g.add(disc); }
  for (const sx of [1, -1]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.96, r * 0.035, 6, 32), o.trim); rim.rotation.y = Math.PI / 2; rim.position.x = sx * w / 2; g.add(rim); }
  const n = o.grousers ?? 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, b = box(w * 1.02, r * 0.06, r * 0.1, o.trim);
    b.position.set(0, Math.sin(a) * r, Math.cos(a) * r); b.rotation.x = -a; if (o.mesh) b.rotation.y = (i % 2 ? 1 : -1) * 0.5; g.add(b);
  }
  const hub = cyl(r * 0.28, r * 0.28, w * 1.15, o.hub ?? o.trim, 16); hub.rotation.z = Math.PI / 2; g.add(hub);
  for (let i = 0; i < (o.spokes ?? 0); i++) for (const sx of [1, -1]) {
    const a = (i / (o.spokes ?? 1)) * Math.PI * 2;
    g.add(tube([sx * w * 0.42, Math.sin(a) * r * 0.26, Math.cos(a) * r * 0.26], [sx * w * 0.48, Math.sin(a) * r * 0.92, Math.cos(a) * r * 0.92], r * 0.022, o.hub ?? o.trim, 5));
  }
  return g;
}

/* ---------------- shared hardware ---------------- */

/**
 * Space-grade solar cells under cover glass. One texture tile is 0.32 m square: 4 x 4 cells of 8 cm with
 * clipped corners, fine silver fingers and two busbars per cell, as on a flight array. The glass is a glossy
 * clear coat, so the array catches the Sun and the sky instead of reading as flat blue plastic.
 */
const cellsMat = () => {
  const S = 512, C = 128;
  const map = canvasTex(S, S, (g) => {
    g.fillStyle = '#04060a'; g.fillRect(0, 0, S, S);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const x = c * C + 3, y = r * C + 3, w = C - 6, h = C - 6, k = 10;
      const grd = g.createLinearGradient(x, y, x + w, y + h); grd.addColorStop(0, '#18213b'); grd.addColorStop(0.55, '#0f1629'); grd.addColorStop(1, '#151e36');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + w - k, y); g.lineTo(x + w, y + k); g.lineTo(x + w, y + h - k); g.lineTo(x + w - k, y + h); g.lineTo(x + k, y + h); g.lineTo(x, y + h - k); g.lineTo(x, y + k); g.closePath(); g.fill();
      g.fillStyle = 'rgba(140,155,185,0.2)'; for (let f = 5; f < h; f += 5) g.fillRect(x + 2, y + f, w - 4, 1);
      g.fillStyle = 'rgba(210,216,228,0.8)'; g.fillRect(x + Math.round(w / 3), y + 2, 2, h - 4); g.fillRect(x + Math.round((2 * w) / 3), y + 2, 2, h - 4);
    }
  });
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshPhysicalMaterial({ map, metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 });
};
const CELL_TILE = 0.32;

/**
 * A rigid solar array, w x h metres, cells facing +z: cell face, composite substrate, a machined edge frame and
 * stiffening ribs across the back. Mount it with the group's position and rotation.
 */
function solarArray(w: number, h: number, cells: Mat, frame: Mat, back: Mat, t = 0.035) {
  const g = new THREE.Group(), fw = w - 0.03, fh = h - 0.03;
  const face = new THREE.PlaneGeometry(fw, fh), uv = face.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * fw) / CELL_TILE, (uv.getY(i) * fh) / CELL_TILE);
  g.add(mesh(face, cells, 0, 0, t / 2 + 0.002));
  g.add(box(w - 0.01, h - 0.01, t, back));
  g.add(box(w, 0.022, t + 0.012, frame, 0, h / 2, 0), box(w, 0.022, t + 0.012, frame, 0, -h / 2, 0));
  g.add(box(0.022, h, t + 0.012, frame, w / 2, 0, 0), box(0.022, h, t + 0.012, frame, -w / 2, 0, 0));
  for (const f of [-0.25, 0.25]) g.add(box(w * 0.94, 0.03, 0.03, frame, 0, f * h, -t / 2 - 0.015));
  g.add(box(0.03, h * 0.9, 0.03, frame, 0, 0, -t / 2 - 0.015));
  return g;
}

/** A parabolic dish antenna of radius R opening toward +y, with a feed on three struts. */
function dish(R: number, skin: Mat, strut: Mat) {
  const g = new THREE.Group(), f = R * 0.55, pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) { const r = (R * i) / 10; pts.push(new THREE.Vector2(r, (r * r) / (4 * f))); }
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 32), skin));
  const rimY = (R * R) / (4 * f);
  g.add(new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.025, 6, 32), strut).rotateX(Math.PI / 2).translateZ(-rimY));
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; g.add(tube([Math.cos(a) * R * 0.92, rimY, Math.sin(a) * R * 0.92], [0, f * 0.95, 0], R * 0.018, strut, 4)); }
  g.add(mesh(new THREE.CylinderGeometry(R * 0.07, R * 0.1, R * 0.16, 12), strut, 0, f, 0));
  return g;
}

/** An LED lamp facing +z. */
const lamp = (r: number, housing: Mat, glow: Mat, x: number, y: number, z: number) => {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const h = cyl(r * 1.25, r * 1.25, r * 0.9, housing, 14); h.rotation.x = Math.PI / 2; g.add(h);
  const l = cyl(r, r, 0.01, glow, 14); l.rotation.x = Math.PI / 2; l.position.z = r * 0.46; g.add(l); return g;
};

/**
 * Merge every static mesh under `root` into one mesh per material (moving parts listed in `keep` stay separate).
 * The models are built from a few hundred small parts for clarity; drawn as is, each part is its own draw call
 * every frame. Baked, a rover is a dozen or two draw calls and renders as cheaply as a single prop.
 */
function bake(root: THREE.Object3D, keep: THREE.Object3D[] = []) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert(), held = new Set(keep), byMat = new Map<Mat, THREE.BufferGeometry[]>(), drop: THREE.Mesh[] = [], mx = new THREE.Matrix4();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    for (let a: THREE.Object3D | null = m; a && a !== root; a = a.parent) if (held.has(a)) return;
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    g.applyMatrix4(mx.multiplyMatrices(inv, m.matrixWorld));
    const list = byMat.get(m.material) ?? []; list.push(g); byMat.set(m.material, list); drop.push(m);
  });
  for (const m of drop) { m.parent?.remove(m); m.geometry.dispose(); }
  for (const [mat, gs] of byMat) {
    const merged = mergeGeometries(gs, false); gs.forEach((g) => g.dispose());
    if (merged) root.add(new THREE.Mesh(merged, mat));
  }
}

/** Double-wishbone corner: upper and lower arms from the chassis side to the wheel knuckle, a coil-over damper and a steering motor. */
function corner(g: THREE.Group, s: number, x0: number, xw: number, z: number, yTop: number, alu: Mat, dark: Mat, spring: Mat) {
  for (const dz of [0.09, -0.09]) {
    g.add(tube([s * x0, yTop, z + dz], [s * (xw - 0.06), 0.08, z], 0.02, alu));
    g.add(tube([s * x0, yTop - 0.16, z + dz], [s * (xw - 0.06), -0.06, z], 0.02, alu));
  }
  g.add(box(0.07, 0.2, 0.09, dark, s * (xw - 0.07), 0.01, z));
  g.add(tube([s * (x0 - 0.02), yTop + 0.12, z], [s * (xw - 0.12), 0.06, z], 0.032, spring), tube([s * (x0 - 0.02), yTop + 0.12, z], [s * ((x0 + xw) / 2 - 0.04), yTop - 0.02, z], 0.018, alu));
  const m = cyl(0.045, 0.045, 0.1, dark, 12); m.position.set(s * (xw - 0.07), 0.17, z); g.add(m);
}

/* ---------------- the rovers ---------------- */

/**
 * VIPER, as built: a 1.5 m tall white body on four independently steered, actively suspended wheels. Solar arrays
 * sit flush on its left, right and rear faces (the polar Sun is never high, so the panels stand upright); the front
 * carries the mast with its stereo cameras and lights, the headlights and the TRIDENT drill.
 */
function viper(): Built {
  const body = new THREE.Group(), white = plateMat(), alu = M(0xb9bdc3, 0.8, 0.3), dark = M(0x2a2d32, 0.5, 0.55), carbon = M(0x1d1f23, 0.3, 0.6);
  const glass = M(0x0a0c10, 0.9, 0.06), cells = cellsMat(), gold = foilMat(), silver = foilMat('#cfd2d6', '255,255,255', '60,64,70'), spring = M(0x8a6a3a, 0.7, 0.4);
  const glow = M(0xffffff, 0, 0.2, { emissive: 0xfff2d8, emissiveIntensity: 1.6 });
  // chassis tub and the body above it, a white radiator deck on top
  body.add(box(1.0, 0.3, 1.02, dark, 0, 0.33, 0), box(1.02, 0.95, 1.02, white, 0, 0.95, 0));
  body.add(box(1.06, 0.05, 1.06, white, 0, 1.45, 0), box(0.86, 0.012, 0.86, silver, 0, 1.48, 0));
  for (let i = -3; i <= 3; i++) body.add(box(0.012, 0.012, 0.82, alu, i * 0.12, 1.49, 0)); // radiator louvre rails
  // three upright arrays flush on the sides and the back
  const sideA = solarArray(1.0, 0.98, cells, alu, carbon); sideA.position.set(0.535, 0.97, 0); sideA.rotation.y = Math.PI / 2; body.add(sideA);
  const sideB = solarArray(1.0, 0.98, cells, alu, carbon); sideB.position.set(-0.535, 0.97, 0); sideB.rotation.y = -Math.PI / 2; body.add(sideB);
  const rear = solarArray(1.02, 0.98, cells, alu, carbon); rear.position.set(0, 0.97, -0.535); rear.rotation.y = Math.PI; body.add(rear);
  // the front: gold insulation, avionics access plate, two pairs of headlights and the hazard cameras
  body.add(box(0.94, 0.86, 0.02, gold, 0, 0.98, 0.515), box(0.5, 0.3, 0.02, white, 0.18, 1.18, 0.53));
  for (const x of [-0.36, -0.22, 0.22, 0.36]) body.add(lamp(0.035, dark, glow, x, 0.62, 0.53));
  body.add(lens(0.03, dark, glass, -0.08, 0.42, 0.52), lens(0.03, dark, glass, 0.08, 0.42, 0.52));
  // mast at the front right: pan-tilt head with stereo navigation cameras and a light bar
  body.add(tube([0.32, 1.47, 0.36], [0.32, 2.12, 0.36], 0.035, alu), box(0.12, 0.08, 0.12, dark, 0.32, 2.14, 0.36));
  body.add(box(0.46, 0.13, 0.15, white, 0.32, 2.24, 0.4), box(0.46, 0.02, 0.15, dark, 0.32, 2.17, 0.4));
  body.add(lens(0.036, dark, glass, 0.17, 2.24, 0.48), lens(0.036, dark, glass, 0.47, 2.24, 0.48), lamp(0.025, dark, glow, 0.32, 2.24, 0.48));
  // high-gain dish on a two-axis gimbal at the back left, a low-gain helix at the back right
  body.add(tube([-0.3, 1.47, -0.3], [-0.3, 1.8, -0.3], 0.03, alu), box(0.1, 0.1, 0.1, dark, -0.3, 1.82, -0.3));
  const hga = dish(0.22, M(0xeceae5, 0.25, 0.4, { side: THREE.DoubleSide }), alu); hga.position.set(-0.3, 1.86, -0.3); hga.rotation.x = -0.7; body.add(hga);
  body.add(cyl(0.025, 0.025, 0.35, M(0xe8e6e1, 0.2, 0.5), 10).translateX(0.38).translateY(1.65).translateZ(-0.38));
  // neutron spectrometer under the nose
  body.add(box(0.3, 0.12, 0.22, silver, -0.25, 0.12, 0.38));
  // TRIDENT drill tower on the front left
  const tool = new THREE.Group(); tool.position.set(-0.3, 0.72, 0.6); body.add(tool);
  tool.add(box(0.13, 0.8, 0.12, alu), box(0.19, 0.12, 0.16, dark, 0, 0.42, 0), box(0.15, 0.3, 0.03, gold, 0, 0.1, 0.07));
  const bit = new THREE.Group(); bit.position.y = -0.4; tool.add(bit);
  bit.add(mesh(new THREE.CylinderGeometry(0.026, 0.008, 0.55, 10), dark, 0, -0.27, 0));
  for (let i = 0; i < 7; i++) { const f = box(0.07, 0.012, 0.02, alu, 0, -0.06 - i * 0.07, 0); f.rotation.y = i * 0.9; bit.add(f); }
  // four steered corners
  const wheels: THREE.Group[] = [];
  for (const z of [0.55, -0.55]) for (const x of [0.62, -0.62]) {
    const s = Math.sign(x), w = wheel(0.25, 0.2, { tyre: M(0x80858c, 0.85, 0.38), trim: alu, hub: dark, spokes: 6, grousers: 22 }); w.position.set(x, 0, z); wheels.push(w);
    corner(body, s, 0.5, 0.62, z, 0.4, alu, dark, spring);
  }
  bake(body, [tool]); wheels.forEach((w) => bake(w));
  return { body, wheels, pose: (d) => { tool.position.y = 0.72 - 0.45 * d; }, spin: (dt) => { bit.rotation.y += 16 * dt; } };
}

/**
 * NASA's Artemis Lunar Terrain Vehicle, after the published concept: an open, low chassis on four large steered
 * wheels with independent suspension and fenders, two crew seats behind a control pedestal (it can also be driven
 * from Earth), a rear power module, and a tall Sun-tracking solar array above it with a high-gain dish beside it.
 */
function ltv(): Built {
  const body = new THREE.Group(), white = plateMat('#ecebe7', '#b9b6af'), alu = M(0xbfc3c8, 0.8, 0.3), dark = M(0x2b2e33, 0.5, 0.5), carbon = M(0x1c1e22, 0.35, 0.55);
  const glass = M(0x0a0c10, 0.9, 0.06), cells = cellsMat(), gold = foilMat(), silver = foilMat('#cfd2d6', '255,255,255', '60,64,70'), seat = M(0x4a4f57, 0.1, 0.85), spring = M(0x8a6a3a, 0.7, 0.4);
  const glow = M(0xffffff, 0, 0.2, { emissive: 0xfff2d8, emissiveIntensity: 1.6 }), screen = M(0x0b1a2a, 0.2, 0.3, { emissive: 0x3d7bd9, emissiveIntensity: 0.5 });
  // chassis: a flat composite floor between two white side beams, a nose fairing and a rear deck
  body.add(box(1.36, 0.1, 2.7, carbon, 0, 0.3, 0));
  for (const s of [1, -1]) body.add(box(0.12, 0.24, 2.8, white, s * 0.68, 0.32, 0));
  body.add(box(1.36, 0.34, 0.45, white, 0, 0.45, 1.25), box(1.2, 0.03, 0.4, silver, 0, 0.635, 1.25));
  for (const x of [-0.5, -0.36, 0.36, 0.5]) body.add(lamp(0.04, dark, glow, x, 0.48, 1.48));
  // camera and lidar mast on the nose
  body.add(tube([0, 0.62, 1.3], [0, 1.45, 1.32], 0.03, alu), box(0.36, 0.12, 0.14, white, 0, 1.5, 1.34));
  body.add(lens(0.032, dark, glass, -0.11, 1.5, 1.42), lens(0.032, dark, glass, 0.11, 1.5, 1.42), cyl(0.05, 0.05, 0.08, dark, 14).translateY(1.6).translateZ(1.34));
  // crew station: two seats with side bolsters, a control pedestal with a display and hand controller, a roll hoop
  for (const x of [0.34, -0.34]) {
    body.add(box(0.44, 0.1, 0.46, seat, x, 0.48, 0.3), box(0.07, 0.16, 0.42, seat, x + 0.2, 0.56, 0.3), box(0.07, 0.16, 0.42, seat, x - 0.2, 0.56, 0.3));
    const back = box(0.44, 0.62, 0.08, seat, x, 0.82, 0.04); back.rotation.x = -0.2; body.add(back);
    body.add(tube([x - 0.18, 0.35, 0.3], [x - 0.18, 0.44, 0.3], 0.02, alu), tube([x + 0.18, 0.35, 0.3], [x + 0.18, 0.44, 0.3], 0.02, alu), box(0.34, 0.02, 0.22, alu, x, 0.37, 0.82));
  }
  body.add(box(0.2, 0.5, 0.18, white, 0, 0.6, 0.72), box(0.38, 0.24, 0.04, dark, 0, 0.92, 0.78), box(0.32, 0.18, 0.01, screen, 0, 0.93, 0.80));
  body.add(tube([0, 0.86, 0.6], [0, 0.98, 0.58], 0.015, alu), box(0.05, 0.08, 0.05, dark, 0, 1.02, 0.58));
  body.add(tube([0.72, 0.42, -0.14], [0.72, 1.4, -0.2], 0.03, alu), tube([-0.72, 0.42, -0.14], [-0.72, 1.4, -0.2], 0.03, alu), tube([0.72, 1.4, -0.2], [-0.72, 1.4, -0.2], 0.03, alu));
  // rear power module: batteries and avionics under gold insulation, a radiator on top, the array mast behind it
  body.add(box(1.24, 0.62, 0.9, gold, 0, 0.66, -0.88), box(1.28, 0.04, 0.94, white, 0, 0.99, -0.88), box(1.1, 0.012, 0.8, silver, 0, 1.015, -0.88));
  body.add(box(1.26, 0.5, 0.03, white, 0, 0.66, -0.42));
  body.add(cyl(0.06, 0.07, 1.0, alu, 16).translateY(1.5).translateZ(-1.0), box(0.16, 0.14, 0.16, dark, 0, 2.0, -1.0));
  // Sun-tracking array: two wings on a yoke, tilted back to the low polar Sun
  const array = new THREE.Group(); array.position.set(0, 2.05, -1.0); array.rotation.x = -0.18; body.add(array);
  array.add(tube([-0.95, 0, -0.05], [0.95, 0, -0.05], 0.025, alu));
  for (const s of [1, -1]) { const p = solarArray(0.92, 1.18, cells, alu, carbon); p.position.set(s * 0.48, 0.12, 0); array.add(p); }
  // high-gain dish on its own gimbal at the back right
  body.add(tube([0.48, 1.02, -1.18], [0.48, 1.36, -1.2], 0.025, alu), box(0.08, 0.08, 0.08, dark, 0.48, 1.38, -1.2));
  const hga = dish(0.26, M(0xeceae5, 0.25, 0.4, { side: THREE.DoubleSide }), alu); hga.position.set(0.48, 1.42, -1.2); hga.rotation.set(-0.5, 0, -0.5); body.add(hga);
  // robotic arm stowed along the right side, its tool head forward
  const tool = new THREE.Group(); tool.position.set(-0.76, 0.6, -0.3); body.add(tool);
  tool.add(box(0.14, 0.14, 0.14, dark), tube([0, 0, 0], [0, 0.02, 0.8], 0.032, white, 10), box(0.1, 0.1, 0.1, dark, 0, 0.02, 0.82));
  const head = new THREE.Group(); head.position.set(0, 0.02, 0.9); tool.add(head);
  head.add(mesh(new THREE.CylinderGeometry(0.035, 0.012, 0.18, 10), alu, 0, 0, 0.06).rotateX(Math.PI / 2), lens(0.02, dark, glass, 0.05, 0.04, 0.02));
  // four large wheels with fenders on double wishbones
  const wheels: THREE.Group[] = [];
  for (const z of [1.2, -1.2]) for (const x of [1.0, -1.0]) {
    const s = Math.sign(x), w = wheel(0.4, 0.26, { tyre: M(0x8c9198, 0.85, 0.36), trim: alu, hub: dark, spokes: 10, grousers: 26 }); w.position.set(x, 0, z); wheels.push(w);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.34, 24, 1, true, -Math.PI * 0.42, Math.PI * 0.84), M(0xeceae7, 0.2, 0.5, { side: THREE.DoubleSide }));
    f.rotation.z = Math.PI / 2; f.position.set(x, 0.02, z); body.add(f);
    corner(body, s, 0.74, 1.0, z, 0.42, alu, dark, spring);
  }
  bake(body, [tool]); wheels.forEach((w) => bake(w));
  return { body, wheels, pose: (d) => { tool.rotation.x = 0.75 * d; tool.rotation.y = -0.35 * d; }, spin: (dt) => { head.rotation.z += 7 * dt; } };
}

/**
 * MoonRanger: a suitcase-sized autonomous rover on four wheels. A solar array covers its top and a second one its
 * back for the low polar Sun; stereo cameras and a lidar look ahead, a neutron spectrometer hangs underneath.
 */
function moonRanger(): Built {
  const body = new THREE.Group(), white = plateMat('#e9e8e4', '#b4b1aa'), alu = M(0xbfc3c8, 0.8, 0.3), dark = M(0x26292e, 0.5, 0.5), carbon = M(0x1c1e22, 0.35, 0.55);
  const glass = M(0x0a0c10, 0.9, 0.06), cells = cellsMat(), gold = foilMat(), silver = foilMat('#cfd2d6', '255,255,255', '60,64,70');
  body.add(box(0.4, 0.16, 0.56, white, 0, 0.14, 0), box(0.36, 0.05, 0.5, gold, 0, 0.04, 0));
  // top array, tilted slightly back; a smaller upright array on the back
  const top = solarArray(0.46, 0.6, cells, alu, carbon, 0.02); top.position.set(0, 0.25, -0.01); top.rotation.x = -Math.PI / 2 + 0.06; body.add(top);
  const rear = solarArray(0.44, 0.24, cells, alu, carbon, 0.02); rear.position.set(0, 0.36, -0.3); rear.rotation.y = Math.PI; rear.rotation.x = 0.12; body.add(rear);
  body.add(tube([0.2, 0.22, -0.28], [0.2, 0.48, -0.31], 0.008, alu), tube([-0.2, 0.22, -0.28], [-0.2, 0.48, -0.31], 0.008, alu));
  // sensor head: stereo cameras either side of a lidar window, in a dark bezel
  body.add(box(0.3, 0.09, 0.05, dark, 0, 0.19, 0.29), lens(0.022, dark, glass, -0.1, 0.19, 0.31), lens(0.022, dark, glass, 0.1, 0.19, 0.31), box(0.07, 0.04, 0.01, glass, 0, 0.19, 0.317));
  // neutron spectrometer under the belly, radio patch antenna and a short whip
  body.add(box(0.16, 0.06, 0.16, silver, 0, 0.0, 0.08), box(0.08, 0.012, 0.08, white, 0.12, 0.27, 0.18), tube([-0.15, 0.22, 0.2], [-0.15, 0.45, 0.2], 0.004, alu, 5));
  const tool = new THREE.Group(); tool.position.set(0, 0.0, 0.08); body.add(tool);
  const head = new THREE.Group(); tool.add(head); head.add(cyl(0.03, 0.03, 0.02, dark, 12).translateY(-0.04));
  // four wheels on short trailing arms
  const wheels: THREE.Group[] = [];
  for (const z of [0.26, -0.26]) for (const x of [0.3, -0.3]) {
    const s = Math.sign(x), w = wheel(0.1, 0.08, { tyre: M(0x8c9198, 0.85, 0.36), trim: alu, hub: dark, spokes: 5, grousers: 14 }); w.position.set(x, 0, z); wheels.push(w);
    body.add(tube([s * 0.19, 0.12, z * 0.6], [s * 0.25, 0, z], 0.012, alu), box(0.04, 0.05, 0.05, dark, s * 0.24, 0, z));
  }
  bake(body, [tool]); wheels.forEach((w) => bake(w));
  return { body, wheels, pose: (d) => { tool.position.y = -0.03 * d; }, spin: (dt) => { head.rotation.y += 6 * dt; } };
}

/** Apollo LRV: an open aluminium frame, wire-mesh wheels under fenders, two seats, a console, an umbrella antenna and a TV camera. */
function lrv(): Built {
  const body = new THREE.Group(), alu = M(0xc8cacd, 0.75, 0.32), dark = M(0x2f3237, 0.5, 0.5), wire = M(0x7d8187, 0.9, 0.3, { wireframe: true }), ti = M(0x9aa0a8, 0.85, 0.35);
  const fabric = M(0x6b7558, 0.05, 0.92), gold = foilMat('#b99748'), white = M(0xe8e6e1, 0.15, 0.6, { side: THREE.DoubleSide }), glass = M(0x0a0c10, 0.9, 0.08), console = M(0x3a3e45, 0.4, 0.5);
  // the frame: two side rails and cross tubes, a floor of panels between the wheels
  for (const x of [0.6, -0.6]) body.add(tube([x, 0.1, 1.45], [x, 0.1, -1.45], 0.03, alu));
  for (const z of [1.45, 0.75, 0, -0.75, -1.45]) body.add(tube([0.6, 0.1, z], [-0.6, 0.1, z], 0.025, alu));
  body.add(box(1.16, 0.02, 1.4, M(0x8f949a, 0.6, 0.45), 0, 0.12, -0.1));
  // forward chassis: batteries and electronics in gold foil, the communications relay box and its antennas
  body.add(box(1.0, 0.26, 0.5, gold, 0, 0.26, 1.15), box(0.42, 0.22, 0.3, gold, 0.25, 0.5, 1.2));
  // two seats with tube frames, seat belts and footrests
  for (const x of [0.33, -0.33]) {
    body.add(box(0.46, 0.05, 0.48, fabric, x, 0.36, -0.12));
    const back = box(0.46, 0.5, 0.04, fabric, x, 0.62, -0.38); back.rotation.x = -0.22; body.add(back);
    body.add(tube([x - 0.23, 0.36, 0.12], [x - 0.23, 0.36, -0.36], 0.015, alu), tube([x + 0.23, 0.36, 0.12], [x + 0.23, 0.36, -0.36], 0.015, alu));
    body.add(tube([x - 0.23, 0.36, -0.36], [x - 0.23, 0.86, -0.48], 0.015, alu), tube([x + 0.23, 0.36, -0.36], [x + 0.23, 0.86, -0.48], 0.015, alu));
    body.add(tube([x, 0.12, 0.12], [x, 0.36, 0.12], 0.015, alu), box(0.3, 0.02, 0.18, alu, x, 0.16, 0.42));
  }
  // control console between the seats: instrument panel with gauges and the T-handle hand controller
  body.add(tube([0, 0.12, 0.42], [0, 0.72, 0.36], 0.03, alu), box(0.4, 0.26, 0.05, console, 0, 0.82, 0.36));
  for (const [x, y] of [[-0.12, 0.86], [0, 0.86], [0.12, 0.86], [-0.06, 0.77], [0.06, 0.77]]) { const gge = cyl(0.03, 0.03, 0.012, M(0xd9d6cf, 0.2, 0.5), 12); gge.rotation.x = Math.PI / 2; gge.position.set(x, y, 0.39); body.add(gge); }
  body.add(tube([0, 0.36, 0.1], [0, 0.52, 0.12], 0.012, alu), box(0.12, 0.025, 0.025, dark, 0, 0.53, 0.12));
  // umbrella high-gain antenna with ribs, low-gain helix and the colour TV camera (GCTA)
  body.add(tube([0.42, 0.62, 1.25], [0.42, 1.5, 1.25], 0.02, alu));
  // the umbrella high-gain antenna: a mesh parabola that opened like an umbrella, aimed at Earth
  const hga = dish(0.47, white, alu); hga.position.set(0.42, 1.52, 1.25); hga.rotation.set(-0.55, 0, 0.25); body.add(hga);
  body.add(tube([-0.42, 0.6, 1.3], [-0.42, 1.45, 1.3], 0.012, alu), mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.35, 10), dark, -0.42, 1.25, 1.3));
  body.add(tube([-0.1, 0.4, 1.35], [-0.1, 0.78, 1.38], 0.018, alu), box(0.16, 0.13, 0.22, white, -0.1, 0.84, 1.4), lens(0.04, dark, glass, -0.1, 0.84, 1.52));
  // aft tool pallet with the scoop, tongs and rake on the gate
  body.add(box(0.95, 0.04, 0.42, alu, 0, 0.3, -1.2), box(0.95, 0.4, 0.03, alu, 0, 0.5, -1.4));
  body.add(tube([0.25, 0.3, -1.42], [0.25, 1.05, -1.42], 0.012, alu), tube([0.05, 0.3, -1.42], [0.05, 1.0, -1.42], 0.012, alu));
  const tool = new THREE.Group(); tool.position.set(-0.4, 0.34, -1.3); body.add(tool);
  tool.add(tube([0, 0, 0], [0, 0, -0.9], 0.014, alu, 6));
  const scoop = new THREE.Group(); scoop.position.z = -0.92; tool.add(scoop); scoop.add(box(0.14, 0.04, 0.12, alu));
  // wheels: woven-wire tyres with titanium chevron treads, under fibreglass fenders
  const wheels: THREE.Group[] = [];
  for (const z of [1.145, -1.145]) for (const x of [0.915, -0.915]) {
    const s = Math.sign(x), w = wheel(0.409, 0.23, { tyre: wire, trim: ti, hub: dark, spokes: 8, grousers: 18, mesh: true }); w.position.set(x, 0, z); wheels.push(w);
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.3, 20, 1, true, -Math.PI * 0.4, Math.PI * 0.8), white); f.rotation.z = Math.PI / 2; f.position.set(x, 0, z); body.add(f);
    body.add(tube([s * 0.6, 0.1, z + 0.15], [s * 0.86, 0.02, z], 0.025, alu), tube([s * 0.6, 0.1, z - 0.15], [s * 0.86, 0.02, z], 0.025, alu));
    body.add(tube([s * 0.6, 0.26, z], [s * 0.82, 0.08, z], 0.03, dark));
  }
  bake(body, [tool]); wheels.forEach((w) => bake(w));
  return { body, wheels, pose: (d) => { tool.rotation.x = 0.9 * d; }, spin: (dt) => { scoop.rotation.z = Math.sin(performance.now() * 0.02) * 0.4; void dt; } };
}

/** RASSOR from NASA's model: the parts are re-centred on their pivots so the arms and drums can move. */
export async function buildRassor(baseUrl: string): Promise<Built> {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(`${baseUrl}models/rassor.gltf.json`);
  gltf.scene.updateMatrixWorld(true);
  let ex: { pivots: Record<string, number[]>; armDroopFront: number; armDroopRear: number } | null = null;
  gltf.scene.traverse((x) => { if (x.userData?.pivots) ex = x.userData as typeof ex; });
  if (!ex) throw new Error('rover model has no pivot data');
  const meta = ex as { pivots: Record<string, number[]>; armDroopFront: number; armDroopRear: number };
  const mats = {
    body: plateMat('#d7d3ca', '#a29d93'), wheel: M(0x8f949b, 0.5, 0.5), arm: M(0xbdb7aa, 0.4, 0.5), drum: M(0xa3a7ad, 0.55, 0.42),
  };
  const part: Record<string, THREE.Mesh> = {}, v = new THREE.Vector3();
  gltf.scene.traverse((x) => {
    const m = x as THREE.Mesh; if (!m.isMesh) return;
    let nm = ''; for (let a: THREE.Object3D | null = m; a && !nm; a = a.parent) if (meta.pivots[a.name]) nm = a.name;
    if (!nm) return;
    const src = m.geometry, p = src.getAttribute('position'), ix = src.index, cnt = ix ? ix.count : p.count, out = new Float32Array(cnt * 3), pv = meta.pivots[nm];
    for (let i = 0; i < cnt; i++) { v.fromBufferAttribute(p, ix ? ix.getX(i) : i).applyMatrix4(m.matrixWorld); out[i * 3] = v.x - pv[0]; out[i * 3 + 1] = v.y - pv[1]; out[i * 3 + 2] = v.z - pv[2]; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(out, 3));
    part[nm] = new THREE.Mesh(toCreasedNormals(g, Math.PI / 5), mats[nm.split('_')[0] as keyof typeof mats]);
  });
  gltf.scene.traverse((x) => { const m = x as THREE.Mesh; m.geometry?.dispose(); for (const mt of ([] as THREE.Material[]).concat(m.material ?? [])) mt.dispose(); });
  const P = meta.pivots, at = (g: THREE.Group, nm: string, rel?: number[]) => { g.position.set(P[nm][0] - (rel?.[0] ?? 0), P[nm][1] - (rel?.[1] ?? 0), P[nm][2] - (rel?.[2] ?? 0)); g.add(part[nm]); return g; };
  const body = new THREE.Group(); body.add(part.body);
  const wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map((nm) => at(new THREE.Group(), nm));
  const armF = at(new THREE.Group(), 'arm_f'), armR = at(new THREE.Group(), 'arm_r'), drumF = new THREE.Group(), drumR = new THREE.Group();
  armF.add(at(drumF, 'drum_f', P.arm_f)); armR.add(at(drumR, 'drum_r', P.arm_r)); body.add(armF, armR);
  const D = Math.PI / 180;
  const pose = (d: number) => { const a = -28 + 37 * d; armF.rotation.x = (a - meta.armDroopFront) * D; armR.rotation.x = -(a - meta.armDroopRear) * D; };
  pose(0);
  return { body, wheels, pose, spin: (dt) => { drumF.rotation.x += 9 * dt; drumR.rotation.x -= 9 * dt; } };
}

const PROCEDURAL: Partial<Record<RoverId, () => Built>> = { frostbite: viper, dustdevil: lrv, tortoise: ltv, hare: moonRanger };
/** Build any rover. RASSOR's model is fetched; the rest are drawn at once. */
export const buildRover = (id: RoverId, baseUrl: string): Promise<Built> => (PROCEDURAL[id] ? Promise.resolve(PROCEDURAL[id]!()) : buildRassor(baseUrl));
/** Free a built rover's GPU memory. */
export function disposeBuilt(root: THREE.Object3D) {
  root.traverse((x) => { const m = x as THREE.Mesh; m.geometry?.dispose(); for (const mt of ([] as THREE.Material[]).concat(m.material ?? [])) { (mt as THREE.MeshStandardMaterial).map?.dispose(); mt.dispose(); } });
}

/**
 * Soft reflections for the rovers' metal, foil and panels: a neutral studio environment pre-filtered for this
 * renderer. Without it, metallic surfaces have nothing to reflect and read as flat grey.
 */
export function roverEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pm = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
  const tex = pm.fromScene(room, 0.04).texture;
  room.traverse((x) => { const m = x as THREE.Mesh; m.geometry?.dispose(); for (const mt of ([] as THREE.Material[]).concat(m.material ?? [])) mt.dispose(); });
  pm.dispose();
  return tex;
}

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 4 commits), under the team's direction. Attribution from the commit history.
