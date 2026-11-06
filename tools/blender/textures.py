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


FONTS = os.path.join(os.path.dirname(__file__), 'fonts')
LILITA = os.path.join(FONTS, 'LilitaOne.ttf')
PACIFICO = os.path.join(FONTS, 'Pacifico.ttf')


def neon_sign(text='Compitas', sub='LA PAZ 2026', w=1024, h=384):
    """Pink script neon tube lettering with a cyan sub line, on a dark backing board."""
    img = Image.new('RGB', (w, h), (16, 10, 34))
    glow = Image.new('RGB', (w, h), (0, 0, 0))
    tubes = Image.new('RGB', (w, h), (0, 0, 0))
    f1 = ImageFont.truetype(PACIFICO, 150)
    f2 = ImageFont.truetype(LILITA, 52)
    for layer, col, wid in ((glow, (255, 60, 170), 10), (tubes, (255, 200, 235), 0)):
        d = ImageDraw.Draw(layer)
        tw = d.textlength(text, font=f1)
        d.text(((w - tw) / 2, 18), text, font=f1, fill=col, stroke_width=wid, stroke_fill=col)
        sub_s = '  '.join(sub)  # letter-spaced
        f2w = d.textlength(sub_s, font=f2)
        d.text(((w - f2w) / 2, 272), sub_s, font=f2, fill=(60, 230, 255) if layer is glow else (210, 250, 255), stroke_width=wid // 2, stroke_fill=(60, 230, 255))
    d = ImageDraw.Draw(glow)
    d.rounded_rectangle((18, 18, w - 18, h - 18), 44, outline=(255, 205, 90), width=10)
    blur = glow.filter(ImageFilter.GaussianBlur(16))
    arr = np.asarray(img, np.float32) + np.asarray(blur, np.float32) * 1.4 + np.asarray(glow, np.float32) * 0.5
    arr = np.maximum(arr, np.asarray(tubes, np.float32))
    # screws in the corners
    save(arr, 'neon.jpg')
    save(arr, 'neon_e.jpg')


def name_board(w=1024, h=256):
    """Transom name board: navy display lettering with gold outline + drop shadow, letter-spaced home port."""
    img = Image.new('RGB', (w, h), (0, 0, 0))
    base = gelcoat_rgb(w, h)
    img = Image.fromarray(base.astype(np.uint8))
    d = ImageDraw.Draw(img)
    f1 = ImageFont.truetype(LILITA, 150)
    f2 = ImageFont.truetype(LILITA, 40)
    t = 'COMPITAS'
    tw = d.textlength(t, font=f1)
    x = (w - tw) / 2
    shadow = Image.new('L', (w, h), 0)
    ImageDraw.Draw(shadow).text((x + 6, 14 + 8), t, font=f1, fill=150)
    shadow = shadow.filter(ImageFilter.GaussianBlur(5))
    img = Image.composite(Image.new('RGB', (w, h), (120, 110, 100)), img, shadow)
    d = ImageDraw.Draw(img)
    d.text((x, 14), t, font=f1, fill=(31, 45, 92), stroke_width=7, stroke_fill=(214, 168, 76))
    d.text((x, 14), t, font=f1, fill=(31, 45, 92))
    sub = '  '.join('LA PAZ  ·  2026')
    sw = d.textlength(sub, font=f2)
    d.line((60, 202, (w - sw) / 2 - 24, 202), fill=(214, 168, 76), width=4)
    d.line(((w + sw) / 2 + 24, 202, w - 60, 202), fill=(214, 168, 76), width=4)
    d.text(((w - sw) / 2, 180), sub, font=f2, fill=(196, 146, 60))
    save(np.asarray(img), 'name.jpg', 92)


def gelcoat_rgb(w, h, tint=(246, 243, 236)):
    n = value_noise(w, h, 6, 21)
    n2 = value_noise(w, h, 48, 22)
    v = (n - 0.5) * 4 + (n2 - 0.5) * 6
    return np.clip(np.array(tint, np.float32)[None, None, :] + v[:, :, None], 0, 255)


def gelcoat(size=512):
    """Glossy fibreglass: very subtle orange-peel + soft tonal drift (keeps the white clean but alive)."""
    save(gelcoat_rgb(size, size), 'gelcoat.jpg')
    n = value_noise(size, size, 5, 23) * 0.6 + value_noise(size, size, 2, 24) * 0.4
    save(normal_from_height(n, 0.9), 'gelcoat_n.jpg')


def upholstery(size=512):
    """Tufted outdoor cushion fabric: visible canvas weave, stitched seams and button tufts (tinted per colour)."""
    w = h = size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    weave = (np.sin(xx * 0.9) * 0.5 + 0.5) * (np.sin(yy * 0.9 + 1.0) * 0.5 + 0.5)
    slub = value_noise(w, h // 4, 3, 25)
    slub = np.asarray(Image.fromarray((slub * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
    cell = size / 2
    # pillowy tufts: soft dome per cell, dimple at the button
    cx = (xx % cell) / cell - 0.5
    cy = (yy % cell) / cell - 0.5
    r = np.sqrt(cx * cx + cy * cy)
    dome = np.clip(1 - r * 1.4, 0, 1) ** 0.7
    button = np.clip(1 - r / 0.05, 0, 1)
    seam = np.exp(-((np.minimum(np.abs(cx + 0.5), np.abs(cx - 0.5))) * cell / 2.2) ** 2) + np.exp(-((np.minimum(np.abs(cy + 0.5), np.abs(cy - 0.5))) * cell / 2.2) ** 2)
    stitch = seam * ((np.floor((xx + yy) / 7) % 2) * 0.6 + 0.4)
    lum = 214 + weave * 26 + (slub - 0.5) * 18 + dome * 18 - stitch * 40 - button * 110
    save(np.stack([lum, lum, lum], -1), 'fabric.jpg')
    height = weave * 0.25 + dome * 1.2 - seam * 0.6 - button * 1.5
    save(normal_from_height(height, 1.6), 'fabric_n.jpg')


def woodgrain(size=512, base=(176, 116, 64), name='wood'):
    """Furniture teak: long continuous grain + subtle knots (no deck caulking)."""
    w = h = size
    lo = value_noise(w, h, 64, 30)
    hi = value_noise(w // 8, h, 3, 31)
    hi = np.asarray(Image.fromarray((hi * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
    x = np.linspace(0, 1, w)[None, :]
    lines = np.sin((x * 16 + lo * 3 + hi * 0.8) * np.pi) * 0.5 + 0.5
    col = np.array(base, np.float32)[None, None, :] * (0.82 + 0.22 * lines[:, :, None] + (hi[:, :, None] - 0.5) * 0.15)
    save(col, f'{name}.jpg')
    save(normal_from_height(lines * 0.4 + hi * 0.2, 1.2), f'{name}_n.jpg')


def fluted(size=512):
    """Bar front: vertical fluted walnut panels with a brass reveal."""
    w = h = size
    g = value_noise(w // 10, h, 4, 32)
    g = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
    x = np.arange(w)[None, :].repeat(h, 0).astype(np.float32)
    flute = np.abs(np.sin(x / w * np.pi * 16))  # 16 flutes per tile
    base = np.array([104, 64, 38], np.float32)
    col = base[None, None, :] * (0.6 + 0.55 * flute[:, :, None] + (g[:, :, None] - 0.5) * 0.25)
    save(col, 'fluted.jpg')
    save(normal_from_height(flute * 1.0 + g * 0.1, 2.5), 'fluted_n.jpg')


def tolex(size=256):
    """Speaker cabinet covering: pebbled black vinyl."""
    n = value_noise(size, size, 3, 33) * 0.7 + value_noise(size, size, 9, 34) * 0.3
    lum = 30 + n * 22
    save(np.stack([lum, lum, lum * 1.08], -1), 'tolex.jpg')
    save(normal_from_height(n, 2.0), 'tolex_n.jpg')


def grille(size=256):
    """Perforated speaker grille."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    p = 16
    dx = (xx % p) - p / 2
    dy = ((yy + (np.floor(xx / p) % 2) * p / 2) % p) - p / 2
    hole = np.clip(1 - np.sqrt(dx * dx + dy * dy) / 5.0, 0, 1)
    lum = 62 - hole * 55
    save(np.stack([lum, lum, lum + 4], -1), 'grille.jpg')


def palm_leaf(w=256, h=512):
    """Frond: bright midrib, angled leaflet stripes, lighter tips (u = across the frond, v = along it)."""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = xx / w - 0.5
    v = yy / h
    leaflets = np.sin((v * 34 + np.abs(u) * 6) * np.pi) * 0.5 + 0.5
    rib = np.exp(-(u / 0.035) ** 2)
    edge = np.clip((np.abs(u) - 0.3) / 0.2, 0, 1)
    base = np.array([58, 150, 78], np.float32)
    col = base[None, None, :] * (0.75 + 0.32 * leaflets[:, :, None]) + rib[:, :, None] * np.array([90, 70, 20], np.float32)
    col = col * (1 - edge[:, :, None] * 0.25) + (v[:, :, None] ** 3) * np.array([40, 30, -10], np.float32)
    save(col, 'leaf.jpg')


def bark(size=256):
    """Palm trunk: stacked fibrous rings."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    n = value_noise(size, size, 6, 35)
    rings = np.abs(np.sin((yy / size * 8 + np.sin(xx / size * np.pi * 2) * 0.15) * np.pi))
    lum = 0.55 + 0.45 * rings
    base = np.array([138, 104, 70], np.float32)
    col = base[None, None, :] * (lum[:, :, None] + (n[:, :, None] - 0.5) * 0.25)
    save(col, 'bark.jpg')
    save(normal_from_height(rings * 0.8 + n * 0.3, 2.0), 'bark_n.jpg')


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
    stripes('stripe_coral.jpg', (255, 122, 92), (255, 248, 236))
    stripes('stripe_teal.jpg', (22, 184, 196), (255, 248, 236))
    stripes('lifering.jpg', (230, 60, 50), (255, 255, 255), n=8)
    gelcoat()
    upholstery()
    woodgrain()
    fluted()
    tolex()
    grille()
    palm_leaf()
    bark()
    neon_sign()
    name_board()
    dance_floor()
    hot_tub()
    print('textures ->', OUT, sorted(os.listdir(OUT)))


if __name__ == '__main__':
    build()
