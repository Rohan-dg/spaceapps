/// <reference lib="webworker" />
/**
 * Decodes a 16-bit height PNG (high byte in R, low byte in G) into metres, off the main thread.
 * height = hMin + (R * 256 + G) * quantum
 */
export interface DecodeRequest { id: number; url: string; hMin: number; quantum: number }

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
    (self as unknown as Worker).postMessage({ id, w, h, data: out }, [out.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
