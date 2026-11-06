"""Shared helpers for the Compitas Trivia Blender asset scripts.

Coordinates: we think in *game* space (three.js, Y-up: x right, y up, z toward the bow).
Blender is Z-up, and the glTF exporter maps Blender (x, y, z) -> glTF (x, z, -y),
so a game point (x, y, z) is created in Blender at (x, -z, y).
"""
import math
import random

import bpy
import numpy as np


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def srgb_to_linear(c):
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def scale_col(c, k):
    return tuple(max(0.0, min(1.0, v * k)) for v in c)


_vcol_mat = None


def vcol_material(rough=0.9):
    """One shared material: base color = active color attribute."""
    global _vcol_mat
    if _vcol_mat is not None:
        return _vcol_mat
    m = bpy.data.materials.new('vcol')
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = rough
    _vcol_mat = m
    return m


def make_mesh(name, verts, faces, face_colors=None, corner_colors=None):
    """verts are in GAME space; converted to Blender space here."""
    me = bpy.data.meshes.new(name)
    bverts = [(v[0], -v[2], v[1]) for v in verts]
    me.from_pydata(bverts, [], faces)
    me.update()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    if face_colors is not None or corner_colors is not None:
        paint(obj, face_colors=face_colors, corner_colors=corner_colors)
    obj.data.materials.append(vcol_material())
    return obj


def paint(obj, face_colors=None, corner_colors=None, fn=None):
    """Colour per face (flat, crisp low-poly look). fn(center_game, normal_game, face) -> rgb (sRGB)."""
    me = obj.data
    if 'Col' in me.color_attributes:
        me.color_attributes.remove(me.color_attributes['Col'])
    attr = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    me.color_attributes.active_color = attr
    cols = np.zeros((len(me.loops), 4), dtype=np.float32)
    cols[:, 3] = 1
    for i, poly in enumerate(me.polygons):
        if fn is not None:
            c = poly.center
            n = poly.normal
            col = fn((c.x, c.z, -c.y), (n.x, n.z, -n.y), poly)
        elif face_colors is not None:
            col = face_colors[i]
        else:
            col = None
        for li in poly.loop_indices:
            cc = corner_colors[li] if corner_colors is not None else col
            cols[li, :3] = srgb_to_linear(cc)
    attr.data.foreach_set('color', cols.ravel())


def to_game(v):
    return (v.x, v.z, -v.y)


def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


def apply_modifiers(obj):
    select_only([obj])
    for m in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def join(objs, name):
    select_only(objs)
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o


def flat(obj):
    for p in obj.data.polygons:
        p.use_smooth = False


def export_glb(path, objs):
    select_only(objs)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_vertex_color='ACTIVE',
        export_materials='EXPORT',
        export_yup=True,
    )


# ---------------- numpy gradient noise ----------------
class Noise2:
    def __init__(self, seed=0):
        rng = np.random.default_rng(seed)
        self.perm = np.concatenate([rng.permutation(256)] * 2)
        ang = rng.random(256) * 2 * np.pi
        self.grad = np.stack([np.cos(ang), np.sin(ang)], -1)

    def __call__(self, x, y):
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        xi = np.floor(x).astype(np.int64)
        yi = np.floor(y).astype(np.int64)
        xf = x - xi
        yf = y - yi
        xi &= 255
        yi &= 255
        p = self.perm

        def g(ix, iy, dx, dy):
            h = p[p[ix] + iy] & 255
            gr = self.grad[h]
            return gr[..., 0] * dx + gr[..., 1] * dy

        u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
        v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
        n00 = g(xi, yi, xf, yf)
        n10 = g(xi + 1, yi, xf - 1, yf)
        n01 = g(xi, yi + 1, xf, yf - 1)
        n11 = g(xi + 1, yi + 1, xf - 1, yf - 1)
        a = n00 + u * (n10 - n00)
        b = n01 + u * (n11 - n01)
        return (a + v * (b - a)) * 1.4

    def fbm(self, x, y, octaves=4, lac=2.0, gain=0.5):
        total = 0
        amp = 1.0
        f = 1.0
        norm = 0
        for i in range(octaves):
            total = total + amp * self(x * f + i * 17.3, y * f - i * 9.1)
            norm += amp
            amp *= gain
            f *= lac
        return total / norm

    def ridged(self, x, y, octaves=5):
        total = 0
        amp = 1.0
        f = 1.0
        norm = 0
        for i in range(octaves):
            n = 1 - np.abs(self(x * f + i * 31.7, y * f + i * 5.3))
            total = total + amp * n * n
            norm += amp
            amp *= 0.5
            f *= 2.1
        return total / norm


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def grid_mesh(name, X, Z, H, keep=None):
    """Build a triangulated grid (game space) from 2D arrays; optional keep mask per quad."""
    rows, cols = H.shape
    verts = np.stack([X.ravel(), H.ravel(), Z.ravel()], -1)
    idx = np.arange(rows * cols).reshape(rows, cols)
    a = idx[:-1, :-1].ravel()
    b = idx[:-1, 1:].ravel()
    c = idx[1:, 1:].ravel()
    d = idx[1:, :-1].ravel()
    if keep is not None:
        k = keep.ravel()
        a, b, c, d = a[k], b[k], c[k], d[k]
    faces = np.concatenate([np.stack([a, d, c], -1), np.stack([a, c, b], -1)])
    used = np.unique(faces)
    remap = -np.ones(len(verts), dtype=np.int64)
    remap[used] = np.arange(len(used))
    verts = verts[used]
    faces = remap[faces]
    return make_mesh(name, verts.tolist(), faces.tolist())


def rng(seed):
    return random.Random(seed)


def deg(a):
    return math.radians(a)
