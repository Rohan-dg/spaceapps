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
    id: 'badger', callsign: 'Badger', basis: 'RASSOR', origin: 'NASA Kennedy Space Center · excavation robot prototype',
    blurb: 'A low, tough digger with a bucket drum at each end. It throws regolith in both directions at once, so it never pushes itself off its own footing.',
    perk: 'Fastest sampler: the bucket drums dig in half the time.', drawback: 'Short-range ice detector.',
    facts: [['Mass', 'about 66 kg'], ['Wheels', '4'], ['Tool', 'two counter-rotating bucket drums'], ['Status', 'tested on Earth']],
    bars: { speed: 3, battery: 2, solar: 3, cold: 2, science: 5 },
    spec: SPEC, geom: { wb: 0.249, tw: 0.263, wr: 0.224, cam: 7, mastH: 0.95 }, digS: 2.2, detectM: 30, tool: 'bucket drums',
  },
  {
    id: 'frostbite', callsign: 'Frostbite', basis: 'VIPER', origin: 'NASA · Volatiles Investigating Polar Exploration Rover',
    blurb: 'Built to hunt water ice at the south pole. Its neutron spectrometer senses hydrogen under the wheels, its headlights see into the dark, and its upright panels catch a Sun that never climbs high.',
    perk: 'Neutron spectrometer: senses ice from 50% further away.', drawback: 'A 1 m drill is slow to run.',
    facts: [['Mass', 'about 430 kg'], ['Size', '1.5 × 1.5 × 2.5 m'], ['Wheels', '4, each steered'], ['Status', 'built; mission cancelled in 2024']],
    bars: { speed: 3, battery: 4, solar: 4, cold: 3, science: 4 },
    spec: base({ batteryWh: 900, solarW: 300, driveW: 190, heaterMaxW: 120, vMax: 4.2, freezeC: -50, lampW: 30 }),
    geom: { wb: 0.55, tw: 0.62, wr: 0.25, cam: 9.5, mastH: 2.2 }, digS: 5, detectM: 45, tool: 'TRIDENT drill',
  },
  {
    id: 'dustdevil', callsign: 'Dust Devil', basis: 'Apollo Lunar Roving Vehicle', origin: 'NASA · driven on Apollo 15, 16 and 17 (1971 to 1972)',
    blurb: 'The moon buggy astronauts drove. Wire-mesh wheels, an umbrella antenna and two big silver-zinc batteries. No solar panels at all: when the battery is gone, the drive is over.',
    perk: 'By far the fastest, with the biggest battery.', drawback: 'No solar panels, so it can never recharge.',
    facts: [['Mass', '210 kg empty'], ['Length', '3.1 m'], ['Wheels', '4, 0.82 m wire mesh'], ['Top speed', 'about 13 km/h']],
    bars: { speed: 5, battery: 5, solar: 0, cold: 2, science: 2 },
    spec: base({ batteryWh: 2600, solarW: 0, driveW: 320, idleW: 40, heaterMaxW: 80, vMax: 9, digW: 120 }),
    geom: { wb: 1.145, tw: 0.915, wr: 0.409, cam: 12, mastH: 1.9 }, digS: 3, detectM: 30, tool: 'sample scoop',
  },
  {
    id: 'tortoise', callsign: 'Iron Tortoise', basis: 'Lunokhod 1', origin: 'Soviet Union · first robot rover on another world (1970 to 1971)',
    blurb: 'A pressurised tub on eight wheels with a solar lid that folds open like a clam. A radioisotope heater kept it warm through two-week lunar nights. It drove 10.5 km.',
    perk: 'Radioisotope heater: warmth in the shadow without touching the battery.', drawback: 'Slow and heavy.',
    facts: [['Mass', '756 kg'], ['Wheels', '8'], ['Power', 'solar lid + polonium-210 heater'], ['Distance driven', '10.5 km']],
    bars: { speed: 2, battery: 3, solar: 4, cold: 5, science: 3 },
    spec: base({ batteryWh: 800, solarW: 270, driveW: 200, vMax: 3.3, isotopeW: 95, heaterMaxW: 80 }),
    geom: { wb: 0.85, tw: 0.8, wr: 0.255, cam: 10, mastH: 1.5 }, digS: 4, detectM: 30, tool: 'penetrometer',
  },
  {
    id: 'hare', callsign: 'Jade Hare', basis: 'Yutu-2', origin: 'China (CNSA) · Chang\'e 4, first rover on the far side (2019 onward)',
    blurb: 'Light and frugal, on six wheels with two solar wings and a radioisotope heater. It has outlived every other lunar rover, creeping across the far side a few metres at a time.',
    perk: 'Sips power, and a radioisotope heater keeps it warm.', drawback: 'The slowest rover here, with a small battery.',
    facts: [['Mass', 'about 140 kg'], ['Wheels', '6, rocker-bogie'], ['Top speed', '200 m per hour'], ['Status', 'longest-working lunar rover']],
    bars: { speed: 1, battery: 2, solar: 3, cold: 4, science: 3 },
    spec: base({ batteryWh: 520, solarW: 210, idleW: 18, driveW: 90, heaterMaxW: 70, vMax: 2.8, isotopeW: 60, txW: 50 }),
    geom: { wb: 0.45, tw: 0.55, wr: 0.15, cam: 7.5, mastH: 1.45 }, digS: 4, detectM: 34, tool: 'sampling arm',
  },
];
export const roverById = (id: string) => ROVERS.find((r) => r.id === id) ?? ROVERS[0];

/* ---------------- procedural models ---------------- */

/** A built model: body parts on `body`, wheels in left/right pairs (even index = left), and a tool that moves while sampling. */
export interface Built { body: THREE.Group; wheels: THREE.Group[]; tool: THREE.Group; spinner: THREE.Group; pose: (dig: number) => void }

const M = (color: number, metal = 0.4, rough = 0.55, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...extra });
const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); return o; };
const cyl = (r0: number, r1: number, h: number, m: THREE.Material, seg = 20) => new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m);

/** A solar panel texture: dark cells on a fine grid. */
function panelMat(): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!; g.fillStyle = '#0c1a3a'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#3a5a9a'; g.lineWidth = 1.5;
  for (let i = 0; i <= 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, metalness: 0.6, roughness: 0.3 });
}
/** Gold multi-layer insulation, crinkled. */
function foilMat(color = '#c9a24a'): THREE.MeshStandardMaterial {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; g.fillStyle = color; g.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,240,190' : '90,60,10'},${0.08 + Math.random() * 0.12})`; g.fillRect(Math.random() * 64, Math.random() * 64, 3 + Math.random() * 10, 1 + Math.random() * 3); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, metalness: 0.85, roughness: 0.35 });
}
/** A wheel lying on its axle (x axis), as a group so it can spin. */
function wheel(r: number, w: number, m: THREE.Material, spokes = 0, hub?: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const tyre = cyl(r, r, w, m, 28); tyre.rotation.z = Math.PI / 2; g.add(tyre);
  // grousers / chevrons so the spin reads
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, b = box(w * 1.02, r * 0.08, r * 0.14, hub ?? m); b.position.set(0, Math.sin(a) * r, Math.cos(a) * r); b.rotation.x = -a; g.add(b); }
  if (spokes) for (let i = 0; i < spokes; i++) { const s = box(0.02, r * 1.8, 0.03, hub ?? m); s.rotation.x = (i / spokes) * Math.PI; s.position.x = w * 0.52; g.add(s); }
  return g;
}

function viper(): Built {
  const body = new THREE.Group(), white = M(0xe9e7e2, 0.25, 0.55), grey = M(0x8d9198, 0.5, 0.5), dark = M(0x2a2d33, 0.4, 0.6), panel = panelMat();
  body.add(box(1.25, 0.42, 1.25, white, 0, 0.42, 0));
  body.add(box(1.1, 0.12, 1.1, grey, 0, 0.18, 0));
  // upright solar panels on left, right and rear: VIPER's answer to a Sun that skims the horizon
  body.add(box(0.04, 0.95, 1.2, panel, 0.66, 0.92, 0), box(0.04, 0.95, 1.2, panel, -0.66, 0.92, 0), box(1.25, 0.95, 0.04, panel, 0, 0.92, -0.64));
  // mast with cameras and twin headlights
  const mast = cyl(0.045, 0.045, 1.25, grey); mast.position.set(0.32, 1.15, 0.45); body.add(mast);
  const head = box(0.42, 0.16, 0.2, white, 0.32, 1.82, 0.47); body.add(head);
  const lampM = M(0xffffff, 0, 0.2, { emissive: 0xfff2d0, emissiveIntensity: 1.2 });
  for (const x of [0.18, 0.46]) { const l = cyl(0.045, 0.045, 0.04, lampM, 14); l.rotation.x = Math.PI / 2; l.position.set(x, 1.82, 0.58); body.add(l); }
  const dish = cyl(0.16, 0.04, 0.06, white, 18); dish.position.set(-0.35, 1.48, 0.1); dish.rotation.x = -0.6; body.add(dish);
  // drill tower at the front
  const tool = new THREE.Group(); tool.position.set(-0.2, 0.55, 0.66); body.add(tool);
  tool.add(box(0.16, 0.7, 0.14, grey, 0, 0, 0));
  const spinner = new THREE.Group(); spinner.position.y = -0.35; tool.add(spinner);
  const bit = cyl(0.03, 0.012, 0.6, dark, 10); bit.position.y = -0.3; spinner.add(bit);
  for (let i = 0; i < 5; i++) { const fl = box(0.08, 0.015, 0.02, grey); fl.position.y = -0.1 - i * 0.1; fl.rotation.y = i; spinner.add(fl); }
  const wheels: THREE.Group[] = [];
  for (const z of [0.55, -0.55]) for (const x of [0.62, -0.62]) {
    const g = wheel(0.25, 0.2, dark, 0, grey); g.position.set(x, 0, z); wheels.push(g);
    body.add(box(0.06, 0.32, 0.06, grey, x * 0.85, 0.18, z));
  }
  return { body, wheels, tool, spinner, pose: (d) => { tool.position.y = 0.55 - 0.42 * d; } };
}

function lrv(): Built {
  const body = new THREE.Group(), alu = M(0xc7c9cc, 0.7, 0.35), dark = M(0x34373c, 0.5, 0.5), mesh = M(0x6d7177, 0.85, 0.35, { wireframe: false }), fabric = M(0x5d6a52, 0.1, 0.9), gold = foilMat('#b99748'), white = M(0xe6e4df, 0.2, 0.6);
  // chassis: a flat frame in three parts, low between the wheels
  body.add(box(1.25, 0.06, 2.9, alu, 0, 0.08, 0));
  body.add(box(1.1, 0.24, 0.55, gold, 0, 0.22, 1.12)); // forward chassis: batteries and electronics under foil
  body.add(box(1.0, 0.16, 0.5, alu, 0, 0.16, -1.15)); // aft pallet for tools
  // two folding seats and the T-handle hand controller between them
  for (const x of [0.32, -0.32]) { body.add(box(0.48, 0.05, 0.5, fabric, x, 0.32, -0.15)); const back = box(0.48, 0.5, 0.05, fabric, x, 0.58, -0.42); back.rotation.x = -0.2; body.add(back); }
  body.add(box(0.06, 0.45, 0.06, alu, 0, 0.45, 0.32), box(0.32, 0.22, 0.04, dark, 0, 0.72, 0.36));
  // fenders over each wheel
  const fender = (x: number, z: number) => { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.28, 18, 1, true, -Math.PI * 0.42, Math.PI * 0.84), white); f.material.side = THREE.DoubleSide; f.rotation.z = Math.PI / 2; f.position.set(x, 0, z); return f; };
  // umbrella high-gain antenna and the TV camera on the front
  const mast = cyl(0.025, 0.025, 1.3, alu); mast.position.set(0.42, 0.85, 1.25); body.add(mast);
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 8, 0, Math.PI * 2, 0, 0.75), M(0xdedad2, 0.5, 0.35, { side: THREE.DoubleSide })); dish.position.set(0.42, 1.55, 1.25); dish.rotation.x = Math.PI * 0.62; body.add(dish);
  const whip = cyl(0.01, 0.01, 1.0, alu, 6); whip.position.set(-0.45, 0.9, 1.25); body.add(whip);
  body.add(box(0.14, 0.12, 0.2, dark, -0.15, 0.62, 1.4));
  // sample scoop on the aft pallet
  const tool = new THREE.Group(); tool.position.set(-0.4, 0.3, -1.25); body.add(tool);
  const pole = cyl(0.015, 0.015, 1.0, alu, 6); pole.rotation.x = Math.PI / 2; pole.position.z = -0.45; tool.add(pole);
  const spinner = new THREE.Group(); spinner.position.z = -0.95; tool.add(spinner); spinner.add(box(0.14, 0.04, 0.12, alu));
  const wheels: THREE.Group[] = [];
  for (const z of [1.145, -1.145]) for (const x of [0.915, -0.915]) {
    const g = wheel(0.409, 0.23, mesh, 16, dark); g.position.set(x, 0, z); wheels.push(g); body.add(fender(x, z));
    body.add(box(Math.abs(x) - 0.55, 0.05, 0.08, alu, Math.sign(x) * (0.55 + (Math.abs(x) - 0.55) / 2), 0.08, z));
  }
  return { body, wheels, tool, spinner, pose: (d) => { tool.rotation.x = 0.9 * d; } };
}

function lunokhod(): Built {
  const body = new THREE.Group(), tub = M(0xb9bcc1, 0.55, 0.45), dark = M(0x2e3136, 0.5, 0.55), panel = panelMat(), alu = M(0xa9adb3, 0.7, 0.4), gold = foilMat('#a88b47');
  // the pressurised tub: a truncated cone, wider at the top, stretched front to back
  const t = cyl(0.95, 0.72, 0.62, tub, 32); t.scale.set(1, 1, 1.32); t.position.y = 0.55; body.add(t);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.035, 8, 40), alu); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.32, 1); rim.position.y = 0.86; body.add(rim);
  // the clam-shell lid, hinged at the back and propped open with its solar cells facing the Sun
  const lid = new THREE.Group(); lid.position.set(0, 0.88, -1.2); body.add(lid);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.05, 32), [alu, tub, panel]); // outside bare metal, solar cells on the inside
  top.scale.set(1, 1, 1.32); top.position.set(0, 0, 1.25); lid.add(top);
  lid.rotation.x = -1.05;
  body.add(box(1.25, 0.06, 1.7, gold, 0, 0.87, 0));
  // camera ports and antennas on the front
  for (const x of [0.28, -0.28]) { const p = cyl(0.07, 0.07, 0.08, dark, 14); p.rotation.x = Math.PI / 2; p.position.set(x, 0.6, 1.2); body.add(p); }
  const cone = cyl(0.02, 0.12, 0.35, alu, 12); cone.position.set(0.55, 1.05, 0.7); cone.rotation.x = 0.5; body.add(cone);
  const whip = cyl(0.008, 0.008, 1.1, alu, 6); whip.position.set(-0.6, 1.3, 0.55); body.add(whip);
  // the radioisotope heater on the back
  const rtg = cyl(0.11, 0.11, 0.32, dark, 14); rtg.rotation.z = Math.PI / 2; rtg.position.set(0, 0.42, -1.18); body.add(rtg);
  // penetrometer at the rear
  const tool = new THREE.Group(); tool.position.set(0.45, 0.5, -1.05); body.add(tool);
  tool.add(box(0.06, 0.3, 0.06, alu, 0, 0, 0));
  const spinner = new THREE.Group(); spinner.position.y = -0.15; tool.add(spinner); const cone2 = cyl(0.04, 0.005, 0.18, dark, 10); cone2.position.y = -0.09; spinner.add(cone2);
  const wheels: THREE.Group[] = [];
  for (const z of [0.85, 0.28, -0.28, -0.85]) for (const x of [0.8, -0.8]) {
    const g = wheel(0.255, 0.2, alu, 8, dark); g.position.set(x, 0, z); wheels.push(g);
    body.add(box(0.2, 0.06, 0.06, alu, x * 0.82, 0.16, z));
  }
  return { body, wheels, tool, spinner, pose: (d) => { tool.position.y = 0.5 - 0.3 * d; } };
}

function yutu(): Built {
  const body = new THREE.Group(), gold = foilMat(), panel = panelMat(), alu = M(0xb4b8be, 0.7, 0.4), dark = M(0x2b2e33, 0.5, 0.55), white = M(0xe3e1dc, 0.2, 0.6);
  body.add(box(0.8, 0.42, 1.0, gold, 0, 0.42, 0));
  // two solar wings, tilted up at the sides
  for (const s of [1, -1]) { const w = new THREE.Group(); w.position.set(0.4 * s, 0.64, 0); w.rotation.z = s * 0.35; w.add(box(0.75, 0.025, 0.95, panel, 0.38 * s, 0, 0)); body.add(w); }
  // mast with the panoramic camera head and the directional antenna
  const mast = cyl(0.025, 0.025, 0.65, alu); mast.position.set(0, 0.95, 0.4); body.add(mast);
  body.add(box(0.36, 0.12, 0.12, white, 0, 1.3, 0.42));
  const dish = cyl(0.13, 0.03, 0.05, white, 18); dish.position.set(0, 0.95, -0.35); dish.rotation.x = 0.7; body.add(dish);
  // sampling arm folded under the nose
  const tool = new THREE.Group(); tool.position.set(0.2, 0.3, 0.52); body.add(tool);
  const arm = box(0.04, 0.04, 0.4, alu, 0, 0, 0.18); tool.add(arm);
  const spinner = new THREE.Group(); spinner.position.z = 0.4; tool.add(spinner); spinner.add(box(0.07, 0.07, 0.07, dark));
  // six wheels on rocker-bogie links
  const wheels: THREE.Group[] = [];
  for (const z of [0.45, 0, -0.45]) for (const x of [0.55, -0.55]) { const g = wheel(0.15, 0.13, alu, 6, dark); g.position.set(x, 0, z); wheels.push(g); }
  for (const s of [1, -1]) { const rock = box(0.04, 0.04, 1.0, alu, 0.47 * s, 0.17, 0); body.add(rock); body.add(box(0.04, 0.24, 0.04, alu, 0.47 * s, 0.26, 0.05)); }
  return { body, wheels, tool, spinner, pose: (d) => { tool.rotation.x = 0.85 * d; } };
}

export const BUILDERS: Partial<Record<RoverId, () => Built>> = { frostbite: viper, dustdevil: lrv, tortoise: lunokhod, hare: yutu };
