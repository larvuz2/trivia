"""Far mountain ranges: the jagged Sierra de la Giganta behind the bay, plus hazy ranges all around."""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from common import Noise2, smoothstep, grid_mesh, paint, hex_rgb, mix, scale_col, export_glb, flat, apply_modifiers, join  # noqa: E402

noise = Noise2(77)

# angle measured from +z (the direction the board camera looks), in degrees; positive toward -x (screen right)
RANGES = [
    # angle, dist, width, depth, height, seed, jagged
    (0, 640, 620, 170, 125, 1.0, 1.0),
    (-38, 600, 460, 150, 105, 2.0, 0.9),
    (36, 680, 520, 160, 135, 3.0, 1.0),
    (68, 760, 480, 150, 115, 4.0, 0.8),
    (-72, 780, 520, 150, 95, 5.0, 0.7),
    (14, 900, 700, 180, 170, 6.0, 1.0),     # tallest, farthest layer peeking over
    (-20, 880, 600, 170, 150, 7.0, 0.9),
    (110, 820, 520, 140, 80, 8.0, 0.6),
    (-115, 840, 560, 140, 70, 9.0, 0.6),
    (160, 980, 700, 150, 60, 10.0, 0.5),
    (-160, 960, 600, 150, 55, 11.0, 0.5),
]

LOW = hex_rgb('#c99a72')
MID = hex_rgb('#a8725d')
HIGH = hex_rgb('#8e6f78')
PEAK = hex_rgb('#b49aa0')
SCRUB = hex_rgb('#949059')


def build(out_dir):
    pieces = []
    for idx, (adeg, dist, width, depth, height, seed, jag) in enumerate(RANGES):
        nu, nv = 150, 34
        u = np.linspace(-0.5, 0.5, nu)
        v = np.linspace(0, 1, nv)
        U, V = np.meshgrid(u, v)
        x = U * width
        # ridge line wanders
        ridge = 0.45 + 0.12 * noise.fbm(U * 3 + seed, seed, 3)
        prof = smoothstep(0, ridge, V) * (1 - smoothstep(ridge, 1.0, V) * 0.85)
        peaks = noise.ridged(U * 3.6 + seed * 3, V * 1.3 + seed, 5)
        blocky = 0.5 + 0.5 * noise.fbm(U * 9 + seed, V * 3, 3)
        spires = np.clip(noise(U * 16 + seed, V * 4), 0, None) ** 2 * 0.25 * jag
        ends = smoothstep(0.5, 0.34, np.abs(U))
        h = 0.82 * height * prof * (0.4 + 0.6 * peaks ** 1.3 + 0.2 * blocky + spires) * ends
        h = h - 3 + 3 * smoothstep(0, 0.05, V)
        # local -> game space: piece faces the bay (front edge v=0 toward origin)
        a = math.radians(adeg)
        dirx, dirz = -math.sin(a), math.cos(a)        # outward direction
        tx, tz = math.cos(a), math.sin(a)             # tangent
        X = dirx * (dist + V * depth) + tx * x
        Z = dirz * (dist + V * depth) + tz * x
        obj = grid_mesh(f'sierra_{idx}', X, Z, h)
        if sum(p.normal.z for p in obj.data.polygons[:300]) < 0:
            obj.data.flip_normals()
        m = obj.modifiers.new('dec', 'DECIMATE')
        m.ratio = 0.45
        apply_modifiers(obj)
        flat(obj)
        hmax = float(h.max())

        def fn(c, n, poly, hmax=hmax):
            y = c[1] / max(hmax, 1)
            ny = n[1]
            j = 0.93 + 0.12 * ((hash((round(c[0], 1), round(c[2], 1))) % 997) / 997)
            if y < 0.22:
                col = mix(LOW, MID, y / 0.22)
                if ny > 0.8:
                    col = mix(col, SCRUB, 0.5)
            elif y < 0.6:
                col = mix(MID, HIGH, (y - 0.22) / 0.38)
            else:
                col = mix(HIGH, PEAK, min(1, (y - 0.6) / 0.4))
            return scale_col(col, j * (0.8 + 0.2 * ny))
        paint(obj, fn=fn)
        pieces.append(obj)
    sierra = join(pieces, 'sierra')
    print('sierra faces', len(sierra.data.polygons))
    export_glb(os.path.join(out_dir, 'sierra.glb'), [sierra])
