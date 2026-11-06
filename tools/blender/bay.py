"""The bay around the yacht: islands, headlands, beaches, lagoon + a baked water-depth map.

Layout (game space, yacht at origin, bow toward +z, the board camera looks toward +z):
  - Balandra headland (screen right, -x) with a white beach and a very shallow lagoon + El Hongo
  - Espíritu Santo-style terraced red mesa island (screen left, +x)
  - Los Arcos granite islet with a golden sand spit (left, nearer)
  - Los Islotes sea-lion rocks behind the stern
  - Mainland desert coast far on the -x side
"""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from common import (Noise2, smoothstep, grid_mesh, paint, hex_rgb, mix, scale_col, export_glb, flat)  # noqa: E402

DOMAIN = 800.0  # heightfield covers x,z in [-DOMAIN, DOMAIN]
RES = 2.5       # grid spacing (units)
DEPTH_MAX = 40.0

noise = Noise2(11)
noise2 = Noise2(23)


def ellipse_d(X, Z, cx, cz, rx, rz, rot):
    c, s = math.cos(rot), math.sin(rot)
    dx, dz = X - cx, Z - cz
    u = (dx * c - dz * s) / rx
    v = (dx * s + dz * c) / rz
    return np.sqrt(u * u + v * v), np.arctan2(v, u)


def landmass(X, Z, cx, cz, rx, rz, rot, height, *, warp=0.22, beach_dirs=(), beach_w=0.16,
             shelf=0.3, terraces=0.0, seed=0.0, rough=0.35):
    """Island profile: shallow sandy shelf -> beach band -> cliff -> rolling top."""
    d, ang = ellipse_d(X, Z, cx, cz, rx, rz, rot)
    d = d * (1 + warp * noise.fbm(X / 90 + seed, Z / 90 - seed, 4)) + 0.06 * noise2(X / 25, Z / 25)
    t = 1 - d
    # beaches only in some directions (coves)
    bmask = np.zeros_like(t)
    for a0, width in beach_dirs:
        da = np.angle(np.exp(1j * (ang - a0)))
        bmask = np.maximum(bmask, smoothstep(width, width * 0.4, np.abs(da)))
    tb = 0.006 + beach_w * bmask
    h = np.empty_like(t)
    under = t <= 0
    # underwater skirt: shallow shelf first, then dropping off
    h[under] = -0.7 + t[under] / shelf * 7.0 - np.clip(-t[under] - shelf, 0, None) * 40
    beach = (t > 0) & (t <= tb)
    h[beach] = -0.7 + (t[beach] / tb[beach]) * 2.4
    rock = t > tb
    u = (t[rock] - tb[rock]) / (1 - tb[rock])
    hill = 0.72 + rough * noise.fbm(X[rock] / 70 + seed, Z[rock] / 70, 5) + 0.25 * noise2.ridged(X[rock] / 120, Z[rock] / 120, 3)
    hh = height * smoothstep(0, 0.16, u) * np.clip(hill, 0.25, 1.4) * (0.7 + 0.3 * smoothstep(0, 0.6, u))
    if terraces > 0:
        q = np.floor(hh / terraces)
        f = hh / terraces - q
        hh = (q + smoothstep(0.75, 1.0, f)) * terraces
    h[rock] = 1.7 + hh
    return h


def heightfield():
    n = int(DOMAIN * 2 / RES) + 1
    xs = np.linspace(-DOMAIN, DOMAIN, n)
    X, Z = np.meshgrid(xs, xs)  # rows = z
    r = np.sqrt(X * X + Z * Z)
    # open sea: bright shallow sandy bay near the yacht, deep blue toward the horizon
    sea = -(7.0 + 34.0 * smoothstep(70, 460, r)) + 1.6 * noise.fbm(X / 60, Z / 60, 3)
    H = sea.copy()

    # Balandra headland (screen right) + mainland arm
    H = np.maximum(H, landmass(X, Z, -235, 185, 120, 78, 0.5, 38, beach_dirs=[(-2.4, 1.1), (-1.2, 0.6)], beach_w=0.2,
                               shelf=0.55, seed=3.1))
    # Balandra lagoon: huge, ankle-deep sandy flat with a sandbar
    d, _ = ellipse_d(X, Z, -150, 118, 85, 52, 0.4)
    d = d * (1 + 0.15 * noise.fbm(X / 50, Z / 50, 3))
    lagoon = -0.5 - 2.6 * smoothstep(0.35, 1.15, d) - 6 * smoothstep(1.1, 1.6, d) - 60 * smoothstep(1.6, 2.6, d)
    H = np.maximum(H, lagoon)
    bar, _ = ellipse_d(X, Z, -112, 72, 70, 9, 0.55)
    H = np.maximum(H, 0.5 - 2.8 * smoothstep(0.3, 1.0, bar) - 3 * smoothstep(1.0, 1.4, bar) - 60 * smoothstep(1.4, 2.5, bar))

    # Espíritu Santo (screen left): big terraced red mesa
    H = np.maximum(H, landmass(X, Z, 300, 300, 185, 115, -0.45, 64, beach_dirs=[(-2.2, 0.35), (-2.9, 0.3), (3.0, 0.25)],
                               beach_w=0.08, shelf=0.22, terraces=7.0, seed=7.7, rough=0.25))
    H = np.maximum(H, landmass(X, Z, 165, 395, 70, 45, 0.2, 40, beach_dirs=[(-1.6, 0.5)], beach_w=0.1, shelf=0.25,
                               terraces=6.0, seed=1.3))

    # Los Arcos granite islet + golden spit
    H = np.maximum(H, landmass(X, Z, 128, 168, 26, 16, 0.6, 20, warp=0.15, beach_dirs=[(2.6, 0.7)], beach_w=0.3,
                               shelf=0.6, seed=5.5, rough=0.5))
    spit, _ = ellipse_d(X, Z, 100, 182, 34, 7, -0.25)
    H = np.maximum(H, 1.4 - 3.5 * smoothstep(0.4, 1.0, spit) - 4 * smoothstep(1.0, 1.5, spit) - 60 * smoothstep(1.5, 2.6, spit))

    # Los Islotes (behind the stern) + far rocks
    for cx, cz, rx, rz, h, s in [(-95, -240, 20, 13, 13, 9.0), (175, -290, 28, 16, 17, 2.2), (-360, -470, 95, 52, 42, 4.4),
                                 (430, -330, 60, 40, 30, 6.6), (60, 520, 50, 30, 26, 8.8)]:
        H = np.maximum(H, landmass(X, Z, cx, cz, rx, rz, 0.3, h, beach_dirs=[(-1.0, 0.5)], beach_w=0.1, shelf=0.35,
                                   seed=s, terraces=4.0))

    # Mainland desert coast along the far -x side with long beaches
    t = (-X - 520 + 55 * noise.fbm(Z / 160, 3.3, 4)) / 260
    main = np.where(t > 0, 1.7 + 70 * smoothstep(0.06, 0.8, t) * (0.6 + 0.4 * noise.fbm(X / 110, Z / 110, 5)), 0)
    main = np.where((t > 0) & (t < 0.06), -0.7 + t / 0.06 * 2.4, main)
    main = np.where(t <= 0, -0.7 + t * 70, main)
    H = np.maximum(H, main)
    return X, Z, H


ROCK_BANDS = [hex_rgb(c) for c in ['#c8653d', '#da8a58', '#ecb582', '#b5523a', '#d47a4e', '#e9a06a']]
SAND = hex_rgb('#f6ecd6')
WET_SAND = hex_rgb('#e9d6ae')
SCRUB = [hex_rgb('#8f9150'), hex_rgb('#a7a061'), hex_rgb('#7c8a4b')]
GRANITE = [hex_rgb('#e3dacb'), hex_rgb('#d2c5b1'), hex_rgb('#c4b49c')]


def colour_fn(granite_centers):
    def fn(c, n, poly):
        x, y, z = c
        ny = n[1]
        j = 0.94 + 0.12 * ((hash((round(x, 1), round(z, 1))) % 1000) / 1000)
        if y < 2.3 and ny > 0.55:
            return scale_col(mix(WET_SAND, SAND, min(1, max(0, (y + 0.3) / 1.6))), j)
        for gx, gz, gr in granite_centers:
            if (x - gx) ** 2 + (z - gz) ** 2 < gr * gr:
                return scale_col(GRANITE[int(y * 0.5) % 3], j * (0.85 + 0.15 * ny))
        if ny > 0.86 and y > 6:
            k = (hash((round(x), round(z))) % 7)
            if k < 4:
                return scale_col(SCRUB[k % 3], j)
        band = int((y + 3 * math.sin(x * 0.02) + 2 * math.cos(z * 0.03)) / 3.2) % len(ROCK_BANDS)
        col = ROCK_BANDS[band]
        if ny < 0.5:  # cliff faces a bit deeper
            col = scale_col(col, 0.88)
        return scale_col(col, j)
    return fn


def build(out_dir):
    import bpy
    X, Z, H = heightfield()

    # ---- depth map for the water shader (512 px, rows = z ascending) ----
    from PIL import Image
    depth = np.clip(-H, 0, DEPTH_MAX) / DEPTH_MAX
    img = Image.fromarray((depth * 255).astype(np.uint8), 'L').resize((512, 512), Image.BILINEAR)
    img.save(os.path.join(out_dir, 'bay-depth.png'))

    # ---- land mesh (only quads that reach close to the surface) ----
    mx = np.maximum.reduce([H[:-1, :-1], H[:-1, 1:], H[1:, :-1], H[1:, 1:]])
    keep = mx > -1.2
    obj = grid_mesh('bay_land', X, Z, H, keep)
    # normals up?
    if sum(p.normal.z for p in obj.data.polygons[:200]) < 0:
        obj.data.flip_normals()
    mod = obj.modifiers.new('dec', 'DECIMATE')
    mod.ratio = 0.32
    from common import apply_modifiers
    apply_modifiers(obj)
    flat(obj)
    paint(obj, fn=colour_fn([(128, 168, 34)]))
    print('bay faces', len(obj.data.polygons))
    export_glb(os.path.join(out_dir, 'bay.glb'), [obj])

    # ---- scatter points (game space) ----
    rng = np.random.default_rng(5)
    n = H.shape[0]

    def sample(count, cond, jitter=1.0):
        pts = []
        tries = 0
        while len(pts) < count and tries < count * 400:
            tries += 1
            i, k = rng.integers(1, n - 1, 2)
            h = H[i, k]
            gx = abs(H[i, k + 1] - H[i, k - 1]) / (2 * RES)
            gz = abs(H[i + 1, k] - H[i - 1, k]) / (2 * RES)
            slope = math.hypot(gx, gz)
            x, z = X[i, k], Z[i, k]
            if cond(h, slope, x, z):
                pts.append([round(float(x + rng.uniform(-jitter, jitter)), 2), round(float(h) - 0.15, 2),
                            round(float(z + rng.uniform(-jitter, jitter)), 2), round(float(rng.uniform(0, 6.28)), 2),
                            round(float(rng.uniform(0.75, 1.35)), 2)])
        return pts

    near = lambda x, z, r: x * x + z * z < r * r  # noqa: E731
    places = {
        'cardon': sample(420, lambda h, s, x, z: 4 < h < 45 and s < 0.9 and near(x, z, 760)),
        'palm': sample(70, lambda h, s, x, z: 1.6 < h < 3.2 and s < 0.25 and near(x, z, 600)),
        'palapa': sample(14, lambda h, s, x, z: 0.7 < h < 1.8 and s < 0.22 and near(x, z, 450), 0.5),
        'boulder': sample(120, lambda h, s, x, z: -0.5 < h < 2.5 and s > 0.35 and near(x, z, 600)),
    }
    with open(os.path.join(out_dir, 'bay-places.json'), 'w') as f:
        json.dump({'domain': DOMAIN, 'depthMax': DEPTH_MAX, **places}, f)
    print({k: len(v) for k, v in places.items()})
