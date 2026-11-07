"""Remove a flat pure-green background (chroma key) and trim: python3 chroma.py in.png out.png [size]"""
import sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
size = int(sys.argv[3]) if len(sys.argv) > 3 else 512
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255
r, g, b = a[..., 0], a[..., 1], a[..., 2]
greenness = g - np.maximum(r, b)                 # ~1 on the backdrop, <=0 on the sticker
alpha = np.clip(1 - (greenness - 0.12) / 0.25, 0, 1)
# de-spill: pull leftover green out of semi-transparent edge pixels
g2 = np.minimum(g, np.maximum(r, b) + 0.02)
rgb = np.stack([r, np.where(alpha < 1, g2, g), b], -1)
out = np.dstack([rgb, alpha])
im = Image.fromarray((out * 255).astype(np.uint8), 'RGBA')
bbox = im.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox()
if bbox:
    x0, y0, x1, y1 = bbox
    side = max(x1 - x0, y1 - y0)
    pad = int(side * 0.03)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    half = side // 2 + pad
    canvas = Image.new('RGBA', (half * 2, half * 2), (0, 0, 0, 0))
    canvas.paste(im.crop((cx - half, cy - half, cx + half, cy + half)), (0, 0))
    im = canvas
im = im.resize((size, size), Image.LANCZOS)
im.save(dst, optimize=True)
print('keyed', dst)
