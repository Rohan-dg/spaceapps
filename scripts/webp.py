#!/usr/bin/env python3
"""Convert the raw onboarding screenshots (PNG) to WebP for the site: python3 scripts/webp.py <in_dir> <out_dir>"""
import sys
from pathlib import Path

from PIL import Image

src, dst = Path(sys.argv[1]), Path(sys.argv[2])
dst.mkdir(parents=True, exist_ok=True)
total = 0
for p in sorted(src.glob("*.png")):
    out = dst / (p.stem + ".webp")
    Image.open(p).convert("RGB").save(out, "WEBP", quality=74, method=6)
    total += out.stat().st_size
print(f"webp: {len(list(src.glob('*.png')))} images, {total / 1e6:.1f} MB")
