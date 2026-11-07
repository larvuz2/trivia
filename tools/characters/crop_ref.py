"""Crop a character picture tight around the character (plus a small margin) so Meshy sees the face
at the highest resolution.  python3 tools/characters/crop_ref.py in.jpg out.png"""
import sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.float32)
# background = median of the border pixels
border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
bg = np.median(border, axis=0)
mask = np.linalg.norm(a - bg, axis=2) > 40
ys, xs = np.nonzero(mask)
y0, y1 = np.percentile(ys, [0.2, 99.8]).astype(int)
x0, x1 = np.percentile(xs, [0.2, 99.8]).astype(int)
m = int(0.06 * max(y1 - y0, x1 - x0))
y0, y1 = max(0, y0 - m), min(a.shape[0], y1 + m)
x0, x1 = max(0, x0 - m), min(a.shape[1], x1 + m)
# square-ish canvas filled with the background colour, character centred
h, w = y1 - y0, x1 - x0
side = max(h, w)
out = Image.new('RGB', (side, side), tuple(int(c) for c in bg))
out.paste(im.crop((x0, y0, x1, y1)), ((side - w) // 2, (side - h) // 2))
if side < 1024:
    out = out.resize((1024, 1024), Image.LANCZOS)
out.save(dst)
print('cropped', (x0, y0, x1, y1), 'of', im.size, '->', out.size)
