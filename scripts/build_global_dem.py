"""Tile NASA's LOLA global elevation model (LDEM_128, 128 px/deg, ~237 m/px at the equator) for the web.

Source (NASA PDS Geosciences Node, LRO LOLA GDR):
  https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_128.img
  23040 x 46080 int16 LSB, height = DN * 0.5 m above the 1737.4 km sphere, row 0 = 90 N, col 0 = 0 E, pixel-centred.

Output: public/dem/{i}_{j}.png, 5 x 5 degree tiles of 640 x 640 samples, no resampling (exact LOLA samples).
  i = 0..35 from 90 N southward, j = 0..71 from 0 E eastward. Heights packed as R = q >> 8, G = q & 255 with
  h = hMin + q * 0.5 m, so the source's 0.5 m quantisation is kept losslessly. public/dem/index.json holds hMin per tile.

  python scripts/build_global_dem.py   (expects data/lola/ldem_128.img)
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data/lola/ldem_128.img"
OUT = ROOT / "public/dem"
PPD, T = 128, 5
N = PPD * T  # 640 samples per tile side


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    img = np.memmap(SRC, dtype="<i2", mode="r", shape=(180 * PPD, 360 * PPD))
    hmin = []
    for i in range(180 // T):
        band = np.asarray(img[i * N:(i + 1) * N]).astype(np.int32)  # DN, 0.5 m units
        row = []
        for j in range(360 // T):
            q = band[:, j * N:(j + 1) * N]
            q0 = int(q.min())
            d = q - q0
            assert d.max() <= 65535
            rgb = np.zeros((N, N, 3), np.uint8)
            rgb[..., 0] = d >> 8
            rgb[..., 1] = d & 255
            Image.fromarray(rgb).save(OUT / f"{i}_{j}.png", optimize=True)
            row.append(q0 * 0.5)
        hmin.append(row)
        print(f"band {i + 1}/36", flush=True)
    (OUT / "index.json").write_text(json.dumps({
        "source": "LRO LOLA LDEM_128 (NASA PDS), 128 px/deg, height above 1737.4 km sphere",
        "ppd": PPD, "tileDeg": T, "n": N, "quantumM": 0.5, "hMin": hmin,
    }))


if __name__ == "__main__":
    main()
