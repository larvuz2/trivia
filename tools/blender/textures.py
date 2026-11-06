"""Procedural textures for the party yacht (numpy + Pillow). Written to tools/blender/tex/."""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.join(os.path.dirname(__file__), 'tex')
FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
rng = np.random.default_rng(3)


def value_noise(w, h, cell, seed=0):
    r = np.random.default_rng(seed)
    gw, gh = w // cell + 2, h // cell + 2
    g = r.random((gh, gw))
    img = Image.fromarray((g * 255).astype(np.uint8)).resize((gw * cell, gh * cell), Image.BICUBIC)
    return np.asarray(img, dtype=np.float32)[:h, :w] / 255


def save(arr, name, q=88):
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    Image.fromarray(arr).save(os.path.join(OUT, name), quality=q)


def normal_from_height(h, strength=2.0):
    dx = np.roll(h, -1, 1) - np.roll(h, 1, 1)
    dy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
    n = np.stack([-dx * strength, -dy * strength, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return (n * 0.5 + 0.5) * 255


def teak(size=1024, planks=8):
    """Teak decking: planks run along V (the boat's length), black caulking between them."""
    w = h = size
    pw = w // planks
    col = np.zeros((h, w, 3), np.float32)
    height = np.ones((h, w), np.float32)
    base = [np.array(c, np.float32) for c in ([186, 128, 74], [198, 140, 82], [172, 116, 66], [205, 150, 92], [180, 124, 70])]
    grain_hi = value_noise(w * 1, h // 16, 4, 1)
    grain_hi = np.asarray(Image.fromarray((grain_hi * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
    grain_lo = value_noise(w, h, 64, 2)
    for i in range(planks):
        x0 = i * pw
        # butt joints at random lengths
        joints = sorted(rng.integers(0, h, 2))
        segs = [0] + list(joints) + [h]
        for a, b in zip(segs, segs[1:]):
            c = base[rng.integers(0, len(base))] * rng.uniform(0.92, 1.06)
            col[a:b, x0:x0 + pw] = c
            height[a:a + 3, x0:x0 + pw] = 0.4
    streak = (grain_hi[:, :, None] - 0.5) * 38 + (grain_lo[:, :, None] - 0.5) * 22
    col += streak
    # caulking
    for i in range(planks + 1):
        x = i * pw
        col[:, max(0, x - 3):x + 3] = [38, 30, 26]
        height[:, max(0, x - 3):x + 3] = 0.0
    save(col, 'teak.jpg')
    hb = np.asarray(Image.fromarray((height * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
    hb += (grain_hi - 0.5) * 0.08
    save(normal_from_height(hb, 3.0), 'teak_n.jpg')


def walnut(size=512):
    w = h = size
    g = value_noise(w, h // 12, 3, 5)
    g = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
    lo = value_noise(w, h, 48, 6)
    rings = np.sin((np.arange(w)[None, :] * 0.08 + lo * 9 + g * 3)) * 0.5 + 0.5
    base = np.array([92, 58, 36], np.float32)
    col = base[None, None, :] * (0.78 + 0.35 * rings[:, :, None] * 0.6 + (g[:, :, None] - 0.5) * 0.3)
    save(col, 'walnut.jpg')


def marble(size=512):
    w = h = size
    n1 = value_noise(w, h, 64, 7)
    n2 = value_noise(w, h, 16, 8)
    x = np.linspace(0, 6, w)[None, :] + np.linspace(0, 3, h)[:, None]
    v = np.abs(np.sin(x * 2.2 + n1 * 7 + n2 * 2))
    vein = (1 - np.clip(v * 6, 0, 1)) ** 2
    col = np.ones((h, w, 3), np.float32) * np.array([246, 243, 238], np.float32)
    col -= vein[:, :, None] * np.array([70, 66, 64], np.float32)
    col -= (n2[:, :, None] - 0.5) * 10
    save(col, 'marble.jpg')


def fabric(size=256):
    """White woven canvas, tinted per material in the game."""
    w = h = size
    yy, xx = np.mgrid[0:h, 0:w]
    weave = (np.sin(xx * 1.6) * np.sin(yy * 1.6)) * 0.5 + 0.5
    n = value_noise(w, h, 8, 9)
    lum = 228 + weave * 18 + (n - 0.5) * 14
    save(np.stack([lum, lum, lum], -1), 'fabric.jpg')
    save(normal_from_height(weave * 0.6, 1.2), 'fabric_n.jpg')


def stripes(name, c1, c2, n=8, size=256):
    w = h = size
    xx = np.arange(w)
    m = ((xx * n // w) % 2)[None, :, None]
    col = np.where(m == 0, np.array(c1, np.float32), np.array(c2, np.float32)) * np.ones((h, w, 3), np.float32)
    save(col, name)


def neon_sign(text='YACHT CLUB', sub='LA PAZ · BAJA', w=1024, h=384):
    img = Image.new('RGB', (w, h), (18, 12, 40))
    glow = Image.new('RGB', (w, h), (0, 0, 0))
    d = ImageDraw.Draw(glow)
    f1 = ImageFont.truetype(FONT_BOLD, 128)
    f2 = ImageFont.truetype(FONT_BOLD, 54)
    tw = d.textlength(text, font=f1)
    d.text(((w - tw) / 2, 64), text, font=f1, fill=(255, 70, 170))
    sw = d.textlength(sub, font=f2)
    d.text(((w - sw) / 2, 250), sub, font=f2, fill=(60, 230, 255))
    d.rounded_rectangle((16, 16, w - 16, h - 16), 40, outline=(255, 210, 90), width=8)
    blur = glow.filter(ImageFilter.GaussianBlur(14))
    out = Image.eval(Image.blend(img, blur, 0.85), lambda v: v)
    arr = np.asarray(out, np.float32) * 1.6 + np.asarray(glow, np.float32)
    save(arr, 'neon.jpg')
    # emissive is the same image (dark background emits nothing)
    save(arr, 'neon_e.jpg')


def name_board(w=1024, h=256):
    img = Image.new('RGB', (w, h), (250, 247, 240))
    d = ImageDraw.Draw(img)
    f1 = ImageFont.truetype(FONT_BOLD, 120)
    f2 = ImageFont.truetype(FONT_BOLD, 48)
    t = 'YACHT CLUB'
    tw = d.textlength(t, font=f1)
    d.text(((w - tw) / 2, 20), t, font=f1, fill=(35, 48, 94))
    s = 'LA PAZ  ·  B.C.S.'
    sw = d.textlength(s, font=f2)
    d.text(((w - sw) / 2, 168), s, font=f2, fill=(200, 150, 70))
    save(np.asarray(img), 'name.jpg', 92)


def mexican_flag(w=480, h=288):
    img = Image.new('RGB', (w, h), (255, 255, 255))
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, w // 3, h), fill=(0, 104, 71))
    d.rectangle((2 * w // 3, 0, w, h), fill=(206, 17, 38))
    cx, cy = w // 2, h // 2
    d.ellipse((cx - 34, cy - 34, cx + 34, cy + 34), outline=(120, 80, 40), width=8)
    d.ellipse((cx - 14, cy - 22, cx + 14, cy + 10), fill=(110, 70, 35))
    save(np.asarray(img), 'flag_mx.jpg', 92)


def dance_floor(size=512, n=6):
    img = Image.new('RGB', (size, size), (20, 18, 40))
    d = ImageDraw.Draw(img)
    cols = [(255, 70, 170), (60, 230, 255), (255, 210, 70), (140, 90, 255), (60, 255, 160), (255, 120, 60)]
    c = size // n
    for i in range(n):
        for j in range(n):
            d.rounded_rectangle((i * c + 6, j * c + 6, (i + 1) * c - 6, (j + 1) * c - 6), 10, fill=cols[(i * 2 + j * 3) % len(cols)])
    save(np.asarray(img), 'dance.jpg', 92)


def hot_tub(size=256):
    n = value_noise(size, size, 24, 11)
    n2 = value_noise(size, size, 8, 12)
    caus = 1 - np.clip(np.abs(np.sin(n * 18 + n2 * 4)) * 4, 0, 1)
    col = np.stack([40 + caus * 160, 200 + caus * 55, 220 + caus * 35], -1)
    save(col, 'tub.jpg')


def build(out_dir=None):
    os.makedirs(OUT, exist_ok=True)
    teak()
    walnut()
    marble()
    fabric()
    stripes('stripe_coral.jpg', (255, 122, 92), (255, 248, 236))
    stripes('stripe_teal.jpg', (22, 184, 196), (255, 248, 236))
    stripes('lifering.jpg', (230, 60, 50), (255, 255, 255), n=8)
    neon_sign()
    name_board()
    mexican_flag()
    dance_floor()
    hot_tub()
    print('textures ->', OUT, sorted(os.listdir(OUT)))


if __name__ == '__main__':
    build()
