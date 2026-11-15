import { describe, expect, it } from 'vitest';
import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { R_KM, type PolarGrid, posOf, sampleGrid, stereoLatLon } from '../moon/frames';
import { CAMERA_CLEARANCE_KM, type MoonSurface, constrainCamera, createSurfaceSampler } from '../moon/surface';

const state = (hi: PolarGrid | null = null): MoonSurface => ({ hi, cap: null, eq: null, exag: 1, capHalfM: 304000 });

describe('Moon surface collision', () => {
  it('keeps the camera above a rendered saddle triangle when bilinear DEM height lies below it', () => {
    const grid: PolarGrid = { h: new Float32Array([0, 100, 100, 0]), n: 2, resM: 20, x0: -10, y0: 10 };
    const scene = state(grid), radius = createSurfaceSampler(() => scene);
    const [lat, lon] = stereoLatLon(-2, 2), direction = new Vector3(...posOf(lat, lon, 0)).normalize();
    const positions = [[-10, 10, 0], [10, 10, 100], [-10, -10, 100], [10, -10, 0]].flatMap(([x, y, h]) => posOf(...stereoLatLon(x, y), h));
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.setIndex([0, 2, 1, 1, 2, 3]);
    const material = new MeshBasicMaterial({ side: DoubleSide }), mesh = new Mesh(geometry, material);
    mesh.updateMatrixWorld();
    const ray = new Raycaster(direction.clone().multiplyScalar(R_KM + 1), direction.clone().negate());
    const hit = ray.intersectObject(mesh)[0];
    expect(hit).toBeDefined();
    const actualRadius = hit.point.length();
    const oldRadius = R_KM + sampleGrid(grid, -2, 2) / 1000;
    expect(actualRadius - oldRadius).toBeGreaterThan(0.02);
    expect(Math.abs(radius(direction) - actualRadius)).toBeLessThan(0.0002);
    const position = direction.clone().multiplyScalar(oldRadius + 0.0006);
    constrainCamera(position, new Vector3(), radius, false);
    expect(position.length()).toBeGreaterThan(actualRadius + 0.0008);
    geometry.dispose(); material.dispose();
  });

  it('uses a solid fallback before heights load, including the poles and longitude seam', () => {
    const radius = createSurfaceSampler(() => state());
    for (const [lat, lon] of [[90, 0], [-90, 0], [0, 180], [0, -180], [23, 37]]) {
      const p = new Vector3(...posOf(lat, lon, -100));
      expect(radius(p)).toBeGreaterThan(R_KM - 0.1);
      constrainCamera(p, new Vector3(), radius, false);
      expect(p.length() - radius(p)).toBeGreaterThanOrEqual(CAMERA_CLEARANCE_KM - 1e-9);
    }
  });

  it('follows loaded and exaggerated terrain without treating crater floors as sea level', () => {
    const scene = state();
    scene.eq = { h: new Float32Array(8).fill(-3000), w: 4, hgt: 2 };
    const radius = createSurfaceSampler(() => scene), p = new Vector3(...posOf(0, 0, 0));
    expect(radius(p)).toBeCloseTo(R_KM - 3, 3);
    scene.exag = 3;
    expect(radius(p)).toBeCloseTo(R_KM - 9, 3);
    scene.eq.h.fill(4000);
    constrainCamera(p, new Vector3(), radius, false);
    expect(p.length()).toBeGreaterThan(R_KM + 12);
  });

  it('covers the full polar cap, including its centre and transition to the globe', () => {
    const scene = state();
    scene.cap = { h: new Float32Array(4).fill(2000), n: 2, resM: 304000, x0: -152000, y0: 152000 };
    scene.eq = { h: new Float32Array(8).fill(2000), w: 4, hgt: 2 };
    const radius = createSurfaceSampler(() => scene);
    for (const exag of [1, 3]) {
      scene.exag = exag;
      for (const [lat, lon] of [[-90, 0], [-89.45, 222.69], [-80.04, 45], [-80, -45]]) {
        const p = new Vector3(...posOf(lat, lon, 0));
        expect(radius(p)).toBeGreaterThan(R_KM + 2 * exag - 0.001);
        constrainCamera(p, new Vector3(), radius, false);
        expect(p.length() - radius(p)).toBeGreaterThan(CAMERA_CLEARANCE_KM - 1e-9);
      }
    }
  });

  it('reanchors a panned target and preserves the camera offset before clamping', () => {
    const target = new Vector3(R_KM - 20, 0, 0), position = target.clone().add(new Vector3(2, 5, 0));
    constrainCamera(position, target, () => R_KM + 4, true);
    expect(target.length()).toBeCloseTo(R_KM + 4, 6);
    expect(position.clone().sub(target).toArray()).toEqual([2, 5, 0]);
  });

  it('recovers safely from a camera at the centre', () => {
    const p = new Vector3();
    constrainCamera(p, new Vector3(), () => R_KM + 12, false);
    expect(p.toArray().every(Number.isFinite)).toBe(true);
    expect(p.length()).toBeCloseTo(R_KM + 12 + CAMERA_CLEARANCE_KM, 6);
  });
});
