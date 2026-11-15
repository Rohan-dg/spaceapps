/**
 * The rovers you can drive. Each is a real lunar rover, flown or built, with a call sign of its own.
 *
 * What is real: the vehicle each one is based on, its layout (wheel count and placement, panels, mast, tools) and
 * its proportions, taken from the published dimensions listed in `facts`. RASSOR uses NASA's own 3D model; the
 * others are drawn here from those dimensions.
 * What is a game's: the power, heat and speed figures in `spec`. They keep each rover's real character (the Apollo
 * buggy is fast and runs on batteries alone, Lunokhod and Yutu-2 carry radioisotope heaters, VIPER sees ice from
 * further away) but are scaled so every mission fits a ten-minute session.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
    id: 'tortoise', tag: 'The Tank', kid: 'The very first robot to drive on another world. Eight wheels, a flip-top solar lid and a built-in heater.', power: 'Stays toasty warm in the dark', watch: 'Slow and heavy', color: '#9b8cff', callsign: 'Iron Tortoise', basis: 'Lunokhod 1', origin: 'Soviet Union · first robot rover on another world (1970 to 1971)',
    blurb: 'A pressurised tub on eight wheels with a solar lid that folds open like a clam. A radioisotope heater kept it warm through two-week lunar nights. It drove 10.5 km.',
    perk: 'Radioisotope heater: warmth in the shadow without touching the battery.', drawback: 'Slow and heavy.',
    facts: [['Mass', '756 kg'], ['Wheels', '8'], ['Power', 'solar lid + polonium-210 heater'], ['Distance driven', '10.5 km']],
    bars: { speed: 2, battery: 3, solar: 4, cold: 5, science: 3 },
    spec: base({ batteryWh: 800, solarW: 270, driveW: 200, vMax: 3.3, isotopeW: 95, heaterMaxW: 80 }),
    geom: { wb: 0.85, tw: 0.8, wr: 0.255, cam: 10, mastH: 1.5 }, digS: 4, detectM: 30, tool: 'penetrometer',
  },
  {
    id: 'hare', tag: 'The Tiny Explorer', kid: 'A small, clever rover still exploring the far side of the Moon. It uses hardly any power.', power: 'Uses very little power', watch: 'The slowest rover of all', color: '#5fd4b5', callsign: 'Jade Hare', basis: 'Yutu-2', origin: 'China (CNSA) · Chang\'e 4, first rover on the far side (2019 onward)',
    blurb: 'Light and frugal, on six wheels with two solar wings and a radioisotope heater. It has outlived every other lunar rover, creeping across the far side a few metres at a time.',
    perk: 'Sips power, and a radioisotope heater keeps it warm.', drawback: 'The slowest rover here, with a small battery.',
    facts: [['Mass', 'about 140 kg'], ['Wheels', '6, rocker-bogie'], ['Top speed', '200 m per hour'], ['Status', 'longest-working lunar rover']],
    bars: { speed: 1, battery: 2, solar: 3, cold: 4, science: 3 },
    spec: base({ batteryWh: 520, solarW: 210, idleW: 18, driveW: 90, heaterMaxW: 70, vMax: 2.8, isotopeW: 60, txW: 50 }),
    geom: { wb: 0.45, tw: 0.55, wr: 0.15, cam: 7.5, mastH: 1.45 }, digS: 4, detectM: 34, tool: 'sampling arm',
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
const box = (w: number, h: number, d: number, m: Mat | Mat[], x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z);
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
/** solar cells: dark blue tiles with silver busbars */
const panelMat = () => new THREE.MeshStandardMaterial({ metalness: 0.65, roughness: 0.28, map: canvasTex(256, 256, (g) => {
  g.fillStyle = '#0b1736'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) {
    const grd = g.createLinearGradient(x, y, x + 32, y + 32); grd.addColorStop(0, '#1b3a7a'); grd.addColorStop(1, '#0d1f4a');
    g.fillStyle = grd; g.fillRect(x + 2, y + 2, 28, 28);
    g.fillStyle = '#9aa7c055'; g.fillRect(x + 2, y + 15, 28, 1);
  }
}) });
/** crinkled gold or silver multi-layer insulation */
const foilMat = (base = '#c9a24a', hi = '255,240,190', lo = '90,60,10') => new THREE.MeshStandardMaterial({ metalness: 0.85, roughness: 0.32, map: canvasTex(128, 128, (g) => {
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? hi : lo},${0.07 + Math.random() * 0.13})`; g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 12, 1 + Math.random() * 3, Math.random() * 3, 0, 6.3); g.fill(); }
}) });
/** painted metal panels with seams and small rivets */
const plateMat = (base = '#e7e5e0', seam = '#a9a69f') => new THREE.MeshStandardMaterial({ metalness: 0.25, roughness: 0.55, map: canvasTex(128, 128, (g) => {
  g.fillStyle = base; g.fillRect(0, 0, 128, 128); g.strokeStyle = seam; g.lineWidth = 1.5; g.strokeRect(4, 4, 120, 120); g.beginPath(); g.moveTo(64, 4); g.lineTo(64, 124); g.stroke();
  g.fillStyle = seam; for (let i = 10; i < 124; i += 14) { g.fillRect(i, 7, 2, 2); g.fillRect(i, 119, 2, 2); }
}) });

/** A wheel on the x axle: tyre, rims, grousers, hub and optional spokes. */
function wheel(r: number, w: number, o: { tyre: Mat; trim: Mat; hub?: Mat; spokes?: number; grousers?: number; mesh?: boolean }): THREE.Group {
  const g = new THREE.Group();
  const tyre = cyl(r * 0.97, r * 0.97, w, o.tyre, 32); tyre.rotation.z = Math.PI / 2; g.add(tyre);
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

/** VIPER: a 1.5 m cube on four independently steered, actively suspended wheels, panels on three sides, a tall mast. */
function viper(): Built {
  const body = new THREE.Group(), white = plateMat(), alu = M(0xb9bdc3, 0.75, 0.32), dark = M(0x23262b, 0.45, 0.6), black = M(0x111214, 0.3, 0.7);
  const glass = M(0x0a0c10, 0.9, 0.08), panel = panelMat(), foil = foilMat('#cfd2d6', '255,255,255', '60,64,70');
  // chassis: white body on a black belly pan, with a silver radiator deck
  body.add(box(1.18, 0.5, 1.18, white, 0, 0.5, 0), box(1.04, 0.1, 1.04, black, 0, 0.2, 0), box(1.0, 0.03, 0.9, foil, 0, 0.765, -0.05));
  for (const [x, z] of [[0.59, 0.59], [-0.59, 0.59], [0.59, -0.59], [-0.59, -0.59]]) body.add(box(0.04, 0.52, 0.04, alu, x, 0.5, z));
  // upright solar arrays on the left, right and back, framed in aluminium
  const array = (w: number, x: number, z: number, ry: number) => {
    const g = new THREE.Group(); g.position.set(x, 1.0, z); g.rotation.y = ry;
    g.add(box(w, 0.92, 0.03, panel), box(w + 0.04, 0.03, 0.05, alu, 0, 0.475, 0), box(w + 0.04, 0.03, 0.05, alu, 0, -0.475, 0));
    for (const sx of [1, -1]) g.add(box(0.03, 0.95, 0.05, alu, sx * (w / 2 + 0.01), 0, 0));
    return g;
  };
  body.add(array(1.18, 0.62, 0, Math.PI / 2), array(1.18, -0.62, 0, Math.PI / 2), array(1.22, 0, -0.62, 0));
  // mast: tall pole, pan-tilt head with twin navigation cameras, and four headlights below it
  const mast = cyl(0.04, 0.05, 1.3, alu, 12); mast.position.set(0.3, 1.42, 0.42); body.add(mast);
  body.add(box(0.46, 0.15, 0.17, white, 0.3, 2.12, 0.46), box(0.12, 0.08, 0.1, dark, 0.3, 2.0, 0.42));
  body.add(lens(0.04, dark, glass, 0.17, 2.12, 0.55), lens(0.04, dark, glass, 0.43, 2.12, 0.55));
  const lampM = M(0xffffff, 0, 0.2, { emissive: 0xfff2d0, emissiveIntensity: 1.4 });
  for (const [x, y] of [[0.1, 0.62], [0.32, 0.62], [-0.1, 0.62], [-0.32, 0.62]]) { const l = cyl(0.04, 0.045, 0.04, lampM, 14); l.rotation.x = Math.PI / 2; l.position.set(x, y, 0.6); body.add(l); }
  // high-gain dish on a short boom, and a low-gain whip
  body.add(tube([-0.35, 0.78, 0.1], [-0.35, 1.45, 0.1], 0.025, alu));
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 6, 0, Math.PI * 2, 0, 0.9), M(0xe9e7e2, 0.3, 0.45, { side: THREE.DoubleSide })); dish.position.set(-0.35, 1.5, 0.1); dish.rotation.x = -2.2; body.add(dish);
  body.add(tube([0.45, 0.78, -0.4], [0.45, 1.5, -0.4], 0.008, alu, 5));
  // neutron spectrometer and the TRIDENT drill tower on the front
  body.add(box(0.3, 0.12, 0.25, foil, -0.3, 0.12, 0.35));
  const tool = new THREE.Group(); tool.position.set(-0.22, 0.6, 0.66); body.add(tool);
  tool.add(box(0.14, 0.75, 0.12, alu), box(0.2, 0.08, 0.16, dark, 0, 0.38, 0));
  const bit = new THREE.Group(); bit.position.y = -0.38; tool.add(bit);
  bit.add(mesh(new THREE.CylinderGeometry(0.028, 0.01, 0.55, 10), dark, 0, -0.27, 0));
  for (let i = 0; i < 7; i++) { const f = box(0.075, 0.012, 0.02, alu, 0, -0.06 - i * 0.07, 0); f.rotation.y = i * 0.9; bit.add(f); }
  // wheels on double wishbones with a damper and a steering motor at each corner
  const wheels: THREE.Group[] = [];
  for (const z of [0.55, -0.55]) for (const x of [0.62, -0.62]) {
    const s = Math.sign(x), w = wheel(0.25, 0.2, { tyre: black, trim: alu, hub: dark, spokes: 6, grousers: 20 }); w.position.set(x, 0, z); wheels.push(w);
    body.add(tube([s * 0.42, 0.28, z + 0.08], [s * 0.6, 0.06, z], 0.022, alu), tube([s * 0.42, 0.28, z - 0.08], [s * 0.6, 0.06, z], 0.022, alu));
    body.add(tube([s * 0.42, 0.12, z], [s * 0.56, -0.04, z], 0.02, alu), tube([s * 0.45, 0.36, z], [s * 0.58, 0.08, z], 0.03, dark));
    const motor = cyl(0.06, 0.06, 0.1, dark, 12); motor.position.set(s * 0.56, 0.2, z); body.add(motor);
  }
  return { body, wheels, pose: (d) => { tool.position.y = 0.6 - 0.45 * d; }, spin: (dt) => { bit.rotation.y += 16 * dt; } };
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
  const dish = new THREE.Group(); dish.position.set(0.42, 1.58, 1.25); dish.rotation.x = -0.55; body.add(dish);
  dish.add(new THREE.Mesh(new THREE.SphereGeometry(0.47, 24, 6, 0, Math.PI * 2, 0, 0.72), white));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; dish.add(tube([0, 0.47, 0], [Math.cos(a) * 0.31, 0.47 - 0.34, Math.sin(a) * 0.31].map((v, j) => (j === 1 ? v - 0.47 + 0.47 : v)) as [number, number, number], 0.006, alu, 4)); }
  dish.add(tube([0, 0.47, 0], [0, 0.2, 0], 0.01, alu));
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
  return { body, wheels, pose: (d) => { tool.rotation.x = 0.9 * d; }, spin: (dt) => { scoop.rotation.z = Math.sin(performance.now() * 0.02) * 0.4; void dt; } };
}

/** Lunokhod 1: a pressurised, ribbed tub on eight spoked wheels, a clam-shell solar lid, cameras, antennas and a ninth odometer wheel. */
function lunokhod(): Built {
  const body = new THREE.Group(), tub = M(0xb8bcc2, 0.6, 0.42), rib = M(0x9aa0a7, 0.7, 0.38), dark = M(0x2c2f34, 0.5, 0.55), glass = M(0x0a0c10, 0.9, 0.08);
  const panel = panelMat(), alu = M(0xaeb2b8, 0.75, 0.35), radiator = M(0xe8e8e4, 0.3, 0.4), gold = foilMat('#a88b47');
  const sz = 1.32;
  const t = cyl(0.95, 0.72, 0.62, tub, 40); t.scale.set(1, 1, sz); t.position.y = 0.55; body.add(t);
  for (let i = 0; i < 24; i++) { // vertical stiffening ribs round the tub
    const a = (i / 24) * Math.PI * 2, r = 0.84, rb = box(0.03, 0.6, 0.05, rib, Math.cos(a) * r, 0.55, Math.sin(a) * r * sz); rb.rotation.y = -a; rb.rotation.z = Math.cos(a) * 0.36; rb.rotation.x = -Math.sin(a) * 0.36; body.add(rb);
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.04, 8, 48), alu); rim.rotation.x = Math.PI / 2; rim.scale.set(1, sz, 1); rim.position.y = 0.86; body.add(rim);
  const deck = cyl(0.93, 0.93, 0.03, radiator, 40); deck.scale.set(1, 1, sz); deck.position.y = 0.87; body.add(deck);
  // the clam-shell lid, hinged at the back, propped open: bare metal outside, solar cells inside
  const lid = new THREE.Group(); lid.position.set(0, 0.9, -1.2); body.add(lid);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.05, 40), [alu, tub, panel]); top.scale.set(1, 1, sz); top.position.set(0, 0, 1.25); lid.add(top);
  lid.add(tube([0.3, 0, 0], [0.3, -0.03, 0.5], 0.03, alu), tube([-0.3, 0, 0], [-0.3, -0.03, 0.5], 0.03, alu));
  lid.rotation.x = -1.75; // swung back past upright, cells tilted up toward a low Sun
  body.add(tube([0.6, 0.9, -1.0], [0.55, 1.45, -1.55], 0.015, alu)); // lid prop
  // front: two TV camera ports in a gold-insulated box, a laser retroreflector and the antennas
  body.add(box(0.75, 0.24, 0.12, gold, 0, 0.62, 1.22));
  body.add(lens(0.07, dark, glass, 0.22, 0.64, 1.3), lens(0.07, dark, glass, -0.22, 0.64, 1.3));
  const refl = box(0.32, 0.18, 0.03, M(0xd6dde6, 0.95, 0.12), 0, 0.98, 1.05); refl.rotation.x = -0.5; body.add(refl);
  for (let i = 0; i < 4; i++) body.add(box(0.025, 0.025, 0.25, dark, -0.1 + i * 0.065, 0.98, 1.05)); // retroreflector corner-cube rows
  const helix = cyl(0.02, 0.13, 0.4, alu, 14); helix.position.set(0.55, 1.1, 0.75); helix.rotation.x = 0.5; body.add(helix);
  for (let i = 0; i < 6; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03 + i * 0.016, 0.006, 4, 16), alu); ring.position.set(0.55, 0.95 + i * 0.05, 0.67 + i * 0.03); ring.rotation.x = Math.PI / 2 + 0.5; body.add(ring); }
  body.add(tube([-0.6, 0.86, 0.5], [-0.66, 2.0, 0.42], 0.008, alu, 5));
  // panoramic telephotometers on the sides (tall cylinders with slit windows)
  for (const [x, z] of [[0.92, 0.5], [-0.92, 0.5], [0.92, -0.5], [-0.92, -0.5]]) { const p = cyl(0.05, 0.05, 0.42, dark, 12); p.position.set(x, 0.72, z * sz); body.add(p, box(0.012, 0.3, 0.035, glass, x + Math.sign(x) * 0.05, 0.72, z * sz)); }
  // radioisotope heater with cooling fins on the back
  const rtg = new THREE.Group(); rtg.position.set(0, 0.42, -1.2); body.add(rtg);
  const core = cyl(0.11, 0.11, 0.36, dark, 16); core.rotation.z = Math.PI / 2; rtg.add(core);
  for (let i = 0; i < 8; i++) { const f = box(0.36, 0.01, 0.12, alu); f.rotation.x = (i / 8) * Math.PI; rtg.add(f); }
  // the ninth wheel: a light trailing odometer that measured how far it drove
  const ninth = wheel(0.12, 0.04, { tyre: alu, trim: dark, spokes: 6, grousers: 8 }); ninth.position.set(0, -0.13, -1.45); body.add(ninth, tube([0, 0.3, -1.15], [0, -0.13, -1.45], 0.015, alu));
  // PrOP penetrometer at the rear
  const tool = new THREE.Group(); tool.position.set(0.45, 0.48, -1.08); body.add(tool);
  tool.add(box(0.07, 0.32, 0.07, alu));
  const cone = new THREE.Group(); cone.position.y = -0.16; tool.add(cone); cone.add(mesh(new THREE.CylinderGeometry(0.04, 0.004, 0.18, 10), dark, 0, -0.09, 0));
  // eight wire-spoked wheels, each with its own motor housing
  const wheels: THREE.Group[] = [];
  for (const z of [0.85, 0.28, -0.28, -0.85]) for (const x of [0.8, -0.8]) {
    const s = Math.sign(x), w = wheel(0.255, 0.2, { tyre: alu, trim: rib, hub: dark, spokes: 8, grousers: 14 }); w.position.set(x, 0, z); wheels.push(w);
    body.add(tube([s * 0.56, 0.3, z], [s * 0.68, 0, z], 0.035, alu));
    const m = cyl(0.07, 0.07, 0.12, dark, 12); m.rotation.z = Math.PI / 2; m.position.set(s * 0.64, 0, z); body.add(m);
  }
  return { body, wheels, pose: (d) => { tool.position.y = 0.48 - 0.3 * d; }, spin: (dt) => { cone.rotation.y += 10 * dt; } };
}

/** Yutu-2: a gold-foil box on a six-wheel rocker-bogie, two solar wings, a camera mast, a dish and hazard cameras. */
function yutu(): Built {
  const body = new THREE.Group(), gold = foilMat(), panel = panelMat(), alu = M(0xb4b8be, 0.75, 0.35), dark = M(0x2a2d32, 0.5, 0.55), white = plateMat('#e6e4df', '#b5b2ab'), glass = M(0x0a0c10, 0.9, 0.08), silver = foilMat('#cfd2d6', '255,255,255', '60,64,70');
  body.add(box(0.8, 0.4, 1.0, gold, 0, 0.44, 0), box(0.78, 0.03, 0.98, silver, 0, 0.655, 0), box(0.7, 0.06, 0.9, dark, 0, 0.22, 0));
  // two solar wings on hinges, tilted up, with frames
  for (const s of [1, -1]) {
    const w = new THREE.Group(); w.position.set(0.4 * s, 0.66, 0); w.rotation.z = s * 0.38; body.add(w);
    w.add(box(0.78, 0.022, 0.96, panel, 0.39 * s, 0, 0), box(0.8, 0.03, 0.025, alu, 0.39 * s, 0, 0.49), box(0.8, 0.03, 0.025, alu, 0.39 * s, 0, -0.49), box(0.025, 0.03, 1.0, alu, 0.79 * s, 0, 0));
    for (const z of [0.3, -0.3]) { const h = cyl(0.02, 0.02, 0.08, dark, 8); h.rotation.x = Math.PI / 2; h.position.set(0.02 * s, 0, z); w.add(h); }
  }
  // camera mast: pan-tilt head with two panoramic cameras and two navigation cameras
  body.add(tube([0, 0.66, 0.38], [0, 1.25, 0.4], 0.022, alu));
  body.add(box(0.4, 0.12, 0.13, white, 0, 1.3, 0.42), lens(0.035, dark, glass, 0.12, 1.31, 0.49), lens(0.035, dark, glass, -0.12, 1.31, 0.49), lens(0.022, dark, glass, 0.05, 1.27, 0.49), lens(0.022, dark, glass, -0.05, 1.27, 0.49));
  // directional antenna on a two-joint arm at the back
  body.add(tube([-0.2, 0.66, -0.35], [-0.2, 0.92, -0.38], 0.018, alu), tube([-0.2, 0.92, -0.38], [-0.1, 1.02, -0.32], 0.015, alu));
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 5, 0, Math.PI * 2, 0, 0.9), M(0xe9e7e2, 0.3, 0.45, { side: THREE.DoubleSide })); dish.position.set(-0.1, 1.06, -0.3); dish.rotation.x = -2.4; body.add(dish);
  // hazard cameras and the infrared spectrometer on the nose; the radar antennas underneath
  body.add(lens(0.025, dark, glass, 0.18, 0.33, 0.51), lens(0.025, dark, glass, -0.18, 0.33, 0.51), box(0.16, 0.12, 0.1, silver, 0, 0.5, 0.53));
  body.add(box(0.5, 0.02, 0.1, dark, 0, 0.18, 0.35), box(0.5, 0.02, 0.1, dark, 0, 0.18, -0.35));
  // sampling arm folded under the nose
  const tool = new THREE.Group(); tool.position.set(0.25, 0.28, 0.52); body.add(tool);
  tool.add(tube([0, 0, 0], [0, 0, 0.38], 0.018, alu, 6));
  const head = new THREE.Group(); head.position.z = 0.4; tool.add(head); head.add(box(0.07, 0.07, 0.07, dark), lens(0.02, dark, glass, 0, 0, 0.04));
  // rocker-bogie: a rocker per side, a bogie under the middle and back wheels, six spoked wheels
  const wheels: THREE.Group[] = [];
  for (const z of [0.45, 0, -0.45]) for (const x of [0.55, -0.55]) { const w = wheel(0.15, 0.13, { tyre: alu, trim: dark, hub: dark, spokes: 6, grousers: 14 }); w.position.set(x, 0, z); wheels.push(w); }
  for (const s of [1, -1]) {
    const x = 0.46 * s;
    body.add(tube([x, 0.3, 0.05], [x, 0.03, 0.45], 0.02, alu), tube([x, 0.3, 0.05], [x, 0.12, -0.22], 0.02, alu));
    body.add(tube([x, 0.12, -0.22], [x, 0.03, 0], 0.018, alu), tube([x, 0.12, -0.22], [x, 0.03, -0.45], 0.018, alu));
    const pivot = cyl(0.035, 0.035, 0.06, dark, 10); pivot.rotation.z = Math.PI / 2; pivot.position.set(x, 0.3, 0.05); body.add(pivot);
  }
  return { body, wheels, pose: (d) => { tool.rotation.x = 0.85 * d; }, spin: (dt) => { head.rotation.z += 6 * dt; } };
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

const PROCEDURAL: Partial<Record<RoverId, () => Built>> = { frostbite: viper, dustdevil: lrv, tortoise: lunokhod, hare: yutu };
/** Build any rover. RASSOR's model is fetched; the rest are drawn at once. */
export const buildRover = (id: RoverId, baseUrl: string): Promise<Built> => (PROCEDURAL[id] ? Promise.resolve(PROCEDURAL[id]!()) : buildRassor(baseUrl));
/** Free a built rover's GPU memory. */
export function disposeBuilt(root: THREE.Object3D) {
  root.traverse((x) => { const m = x as THREE.Mesh; m.geometry?.dispose(); for (const mt of ([] as THREE.Material[]).concat(m.material ?? [])) { (mt as THREE.MeshStandardMaterial).map?.dispose(); mt.dispose(); } });
}
