/// <reference lib="webworker" />
import { cellHorizons, litFraction, type SunDir, type Tile } from '../lib/shadowMap';

export type ShadowRequest =
  | { id: number; kind: 'horizons'; tile: Tile }
  | { id: number; kind: 'fraction'; tile: Tile; hz: Int16Array; suns: (SunDir & { far: number })[] };

self.onmessage = (e: MessageEvent<ShadowRequest>) => {
  const q = e.data;
  try {
    if (q.kind === 'horizons') {
      const hz = cellHorizons(q.tile);
      self.postMessage({ id: q.id, hz }, [hz.buffer]);
    } else {
      const frac = litFraction(q.tile, q.hz, q.suns);
      self.postMessage({ id: q.id, frac }, [frac.buffer]);
    }
  } catch (err) {
    self.postMessage({ id: q.id, error: String((err as Error).message ?? err) });
  }
};

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 1 commit), under the team's direction. Attribution from the commit history.
