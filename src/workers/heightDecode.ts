/// <reference lib="webworker" />
/**
 * Decodes a 16-bit height PNG (high byte in R, low byte in G) into metres, off the main thread,
 * and builds its box-filtered mip chain (2x2 averages, halving down to 1x1).
 * height = hMin + (R * 256 + G) * quantum
 *
 * The mips matter: the shaders ray-march shadows and take finite-difference normals on these heights,
 * and without a prefiltered level to match the screen footprint those terms alias (shimmer while zooming).
 */
export interface DecodeRequest { id: number; url: string; hMin: number; quantum: number }
export interface HeightMip { data: Float32Array; w: number; h: number }

function buildMips(base: Float32Array, w: number, h: number): HeightMip[] {
  const out: HeightMip[] = [];
  let src = base, sw = w, sh = h;
  while (sw > 1 || sh > 1) {
    const dw = Math.max(1, sw >> 1), dh = Math.max(1, sh >> 1);
    const dst = new Float32Array(dw * dh);
    for (let y = 0; y < dh; y++) {
      const r0 = Math.min(2 * y, sh - 1) * sw, r1 = Math.min(2 * y + 1, sh - 1) * sw;
      for (let x = 0; x < dw; x++) {
        const c0 = Math.min(2 * x, sw - 1), c1 = Math.min(2 * x + 1, sw - 1);
        dst[y * dw + x] = 0.25 * (src[r0 + c0] + src[r0 + c1] + src[r1 + c0] + src[r1 + c1]);
      }
    }
    out.push({ data: dst, w: dw, h: dh });
    src = dst; sw = dw; sh = dh;
  }
  return out;
}

self.onmessage = async (e: MessageEvent<DecodeRequest>) => {
  const { id, url, hMin, quantum } = e.data;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    const { width: w, height: h } = bmp;
    const c = new OffscreenCanvas(w, h);
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(bmp, 0, 0);
    bmp.close();
    const px = g.getImageData(0, 0, w, h).data;
    const out = new Float32Array(w * h);
    for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = hMin + (px[j] * 256 + px[j + 1]) * quantum;
    const mips = buildMips(out, w, h);
    (self as unknown as Worker).postMessage({ id, w, h, data: out, mips }, [out.buffer, ...mips.map((m) => m.data.buffer)]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};

// SI disclosure (NASA Space Apps): written with SI assistance by Claude Opus 5.5 (Anthropic, 2 commits), under the team's direction. Attribution from the commit history.
