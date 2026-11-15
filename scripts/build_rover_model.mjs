// Builds public/models/rassor.glb for the rover game from NASA's RASSOR model.
//
// Source: "Regolith Advanced Surface Systems Operations Robot (RASSOR).glb" from NASA 3D Resources
// (https://github.com/nasa/NASA-3D-Resources, 3D Models; free and without copyright per that repository).
// NASA's file is one 2-million-triangle mesh. This script splits it into its moving parts (the mesh is 31
// separate shells, sorted here by where they sit), re-centres each part on its own axle or pivot so the game
// can spin the wheels and drums and swing the arms, simplifies everything to about 150k triangles and writes
// a meshopt-compressed GLB.
//
// The tools are not project dependencies; install them next to this script's working directory first:
//   npm i --no-save @gltf-transform/core@4 @gltf-transform/extensions@4 @gltf-transform/functions@4 draco3dgltf meshoptimizer
//   node scripts/build_rover_model.mjs <path to NASA's RASSOR .glb> public/models/rassor.glb
import { Document, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt, quantize } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error('usage: node scripts/build_rover_model.mjs <RASSOR.glb> <out.glb>'); process.exit(1); }
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.encoder': MeshoptEncoder,
});
const prim = (await io.read(src)).getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION').getArray(), I = prim.getIndices().getArray();
const nT = I.length / 3;

// ---- weld identical positions, then label connected shells (union-find over welded vertices) ----
const weld = new Map(), wid = new Uint32Array(P.length / 3);
for (let v = 0; v < wid.length; v++) {
  const k = `${Math.round(P[v * 3] * 2e4)},${Math.round(P[v * 3 + 1] * 2e4)},${Math.round(P[v * 3 + 2] * 2e4)}`;
  let w = weld.get(k); if (w === undefined) { w = weld.size; weld.set(k, w); } wid[v] = w;
}
const par = new Uint32Array(weld.size).map((_, i) => i);
const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
for (let t = 0; t < nT; t++) { const a = find(wid[I[t * 3]]); for (const j of [1, 2]) { const b = find(wid[I[t * 3 + j]]); if (a !== b) par[b] = a; } }
const shells = new Map();
for (let t = 0; t < nT; t++) {
  const r = find(wid[I[t * 3]]); let s = shells.get(r);
  if (!s) shells.set(r, s = { tris: [], c: [0, 0, 0], lo: [9, 9, 9], hi: [-9, -9, -9] });
  s.tris.push(t);
  for (const j of [0, 1, 2]) for (const k of [0, 1, 2]) { const x = P[I[t * 3 + j] * 3 + k]; s.c[k] += x / 3; if (x < s.lo[k]) s.lo[k] = x; if (x > s.hi[k]) s.hi[k] = x; }
}
for (const s of shells.values()) s.c = s.c.map((x) => x / s.tris.length);

// ---- sort shells into parts by position (x across, y up, z along the robot; figures in metres) ----
// wheels sit at x = +-0.26, z = +-0.25; each arm runs from the body to a drum pair that reaches x = +-0.42
const AXLE_Y = 0.014, AXLE_Z = 0.249;
const part = (s) => {
  const [cx, , cz] = s.c, n = s.tris.length, end = cz > 0 ? 'f' : 'r';
  const wide = s.hi[0] - s.lo[0];
  if (Math.abs(cx) > 0.2 && Math.abs(cx) < 0.3 && Math.abs(Math.abs(cz) - AXLE_Z) < 0.02 && n > 1000) return `wheel_${end}${cx > 0 ? 'l' : 'r'}`;
  if (Math.abs(cz) > 0.45 && (wide > 0.3 || Math.abs(cx) > 0.4)) return `drum_${end}`; // drum halves and their end caps
  if (Math.abs(cx) < 0.02 && n > 10000 && n < 100000) return `arm_${end}`;
  return 'body';
};
const parts = {};
for (const s of shells.values()) (parts[part(s)] ??= []).push(s);
const want = ['body', 'wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr', 'arm_f', 'arm_r', 'drum_f', 'drum_r'];
for (const k of want) if (!parts[k]) throw new Error(`no shells sorted into ${k}; NASA's model may have changed`);

// drum axis: the end-cap shell is a small disc centred on it
const drumAxis = (k) => { const cap = parts[k].reduce((a, b) => (a.tris.length < b.tris.length ? a : b)); return [cap.c[1], cap.c[2]]; };
const dF = drumAxis('drum_f'), dR = drumAxis('drum_r');
// Arm pivot: the rear arm is the front arm turned half a turn about the vertical axis and then swung about its
// pivot. So, mirrored to the front, the two poses differ by a rotation in the y-z plane, and the fixed point of
// that rotation is the pivot. The swing angle comes from the direction arm-centroid -> drum axis in each pose.
const dRm = [dR[0], -dR[1]]; // rear drum axis mirrored to the front, as (y, z)
const aF = [parts.arm_f[0].c[1], parts.arm_f[0].c[2]], aRm = [parts.arm_r[0].c[1], -parts.arm_r[0].c[2]];
const dirOf = (a, d) => Math.atan2(d[1] - a[1], d[0] - a[0]);
const swing = dirOf(aF, dF) - dirOf(aRm, dRm), c = Math.cos(swing), s = Math.sin(swing);
// x = R x0 + t with t = dF - R dRm; fixed point = (I - R)^-1 t
const t = [dF[0] - (c * dRm[0] - s * dRm[1]), dF[1] - (s * dRm[0] + c * dRm[1])], den = (1 - c) ** 2 + s ** 2;
const pivot = [((1 - c) * t[0] - s * t[1]) / den, (s * t[0] + (1 - c) * t[1]) / den]; // (y, z) of the front pivot
const armLen = Math.hypot(dF[0] - pivot[0], dF[1] - pivot[1]);
console.log('swing between the two arm poses', ((swing * 180) / Math.PI).toFixed(1), 'deg; arm centroid radius front',
  Math.hypot(aF[0] - pivot[0], aF[1] - pivot[1]).toFixed(3), 'rear', Math.hypot(aRm[0] - pivot[0], aRm[1] - pivot[1]).toFixed(3));
const droop = (d, p) => (Math.atan2(p[0] - d[0], Math.abs(d[1]) - Math.abs(p[1])) * 180) / Math.PI; // degrees the arm points below level
console.log('arm pivot (y, z):', pivot.map((x) => x.toFixed(3)), 'arm length', armLen.toFixed(3),
  'droop front', droop(dF, pivot).toFixed(1), 'rear', droop(dR, [pivot[0], -pivot[1]]).toFixed(1));

// ---- build each part: gather, shift to its own origin, simplify ----
const BUDGET = { body: 46000, wheel: 15000, arm: 5000, drum: 24000 };
function build(shellList, origin, budget) {
  const map = new Map(), pos = [], idx = [];
  for (const s of shellList) for (const t of s.tris) for (const j of [0, 1, 2]) {
    const w = wid[I[t * 3 + j]]; let v = map.get(w);
    if (v === undefined) { v = pos.length / 3; map.set(w, v); const o = I[t * 3 + j] * 3; pos.push(P[o] - origin[0], P[o + 1] - origin[1], P[o + 2] - origin[2]); }
    idx.push(v);
  }
  const p = new Float32Array(pos), i = new Uint32Array(idx);
  const [si] = MeshoptSimplifier.simplify(i, p, 3, Math.min(i.length, budget * 3), 0.004);
  // keep only the vertices the simplified index still uses
  const remap = new Int32Array(p.length / 3).fill(-1), np = [], ni = new Uint32Array(si.length);
  for (let k = 0; k < si.length; k++) { let v = remap[si[k]]; if (v < 0) { v = np.length / 3; remap[si[k]] = v; np.push(p[si[k] * 3], p[si[k] * 3 + 1], p[si[k] * 3 + 2]); } ni[k] = v; }
  return { pos: new Float32Array(np), idx: ni, from: i.length / 3 };
}

const doc = new Document(); doc.createBuffer();
const scene = doc.createScene('rassor');
const root = doc.createNode('rassor').setExtras({
  source: 'NASA 3D Resources: Regolith Advanced Surface Systems Operations Robot (RASSOR)',
  // degrees each arm points below level in NASA's pose; the game swings the arms from here
  armDroopFront: +droop(dF, pivot).toFixed(2), armDroopRear: +droop(dR, [pivot[0], -pivot[1]]).toFixed(2),
  wheelRadius: 0.224, groundY: +(AXLE_Y - 0.224).toFixed(3),
  // where each moving part's axle or pivot sits in the robot's own frame (metres); the compression step below
  // folds its de-quantisation into the node transforms, so the game reads the pivots from here instead
  pivots: {},
});
const pivots = {};
scene.addChild(root);
let total = 0;
const add = (name, shellList, origin, budget, parent = root, parentOrigin = [0, 0, 0]) => {
  const g = build(shellList, origin, budget); total += g.idx.length / 3;
  const mesh = doc.createMesh(name).addPrimitive(doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(g.pos))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(g.idx)));
  const node = doc.createNode(name).setMesh(mesh).setTranslation(origin.map((x, k) => x - parentOrigin[k]));
  parent.addChild(node); pivots[name] = origin.map((x) => +x.toFixed(4));
  console.log(name.padEnd(9), String(g.from).padStart(7), '->', String(g.idx.length / 3).padStart(6), 'triangles');
  return node;
};
add('body', parts.body, [0, 0, 0], BUDGET.body);
for (const k of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) add(k, parts[k], [0, AXLE_Y, k[6] === 'f' ? AXLE_Z : -AXLE_Z], BUDGET.wheel);
for (const [end, d, sign] of [['f', dF, 1], ['r', dR, -1]]) {
  const po = [0, pivot[0], sign * pivot[1]];
  const arm = add(`arm_${end}`, parts[`arm_${end}`], po, BUDGET.arm);
  add(`drum_${end}`, parts[`drum_${end}`], [0, d[0], d[1]], BUDGET.drum, arm, po);
}
root.setExtras({ ...root.getExtras(), pivots });
await doc.transform(quantize({ quantizePosition: 14 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
console.log('total', total, 'triangles ->', out);
