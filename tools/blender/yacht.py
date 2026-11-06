"""COMPITAS — the party yacht, modelled from scratch.

Everything is written in GAME space (three.js: x = port(+)/starboard(-), y = up, z = bow(+)/stern(-)).
G() converts to Blender space. Units: 1 ≈ 0.9 m (characters are ~2 units tall).

The aft party deck is the "stage": stage origin (STAGE) is the centre of the open aft deck.
Anything the game needs to find by name keeps its own node (start_pedestal, start_button, dance_floor,
disco_ball, hot_tub_water, flamingo, donut); everything else is merged into one mesh per material.
A layout file (yacht-layout.json) tells the game where people can hang out.
"""
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from common import select_only, apply_modifiers  # noqa: E402

TEX = os.path.join(os.path.dirname(__file__), 'tex')
DECK = 3.0                     # main deck height above the waterline
FLY = 5.95                     # flybridge floor
STAGE = (0.0, DECK, -15.0)     # centre of the aft party deck (world)
TRANSOM = -24.0
BOW = 25.0
BEAM = 7.0                     # half beam


def G(x, y, z):
    return (x, -z, y)


def S(x, y, z):
    """stage-local -> world (game space)."""
    return (STAGE[0] + x, STAGE[1] + y, STAGE[2] + z)


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ materials
MATS = {}


def _img(name):
    path = os.path.join(TEX, name)
    img = bpy.data.images.get(name) or bpy.data.images.load(path)
    return img


def mat(name, color='#ffffff', metal=0.0, rough=0.5, tex=None, normal=None, emit=None, emit_strength=1.0,
        alpha=1.0, coat=0.0, emit_tex=None, normal_strength=0.8):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get('Principled BSDF')
    h = color.lstrip('#')
    rgb = [((int(h[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (0, 2, 4)]
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Metallic'].default_value = metal
    b.inputs['Roughness'].default_value = rough
    if tex:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = _img(tex)
        if color.lower() != '#ffffff':
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            nt.links.new(t.outputs['Color'], mix.inputs[6])
            mix.inputs[7].default_value = (*rgb, 1)
            nt.links.new(mix.outputs[2], b.inputs['Base Color'])
        else:
            nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if normal:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = _img(normal)
        t.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(t.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if emit:
        e = emit.lstrip('#')
        b.inputs['Emission Color'].default_value = (*[((int(e[i:i + 2], 16) / 255 + 0.055) / 1.055) ** 2.4 for i in (0, 2, 4)], 1)
        b.inputs['Emission Strength'].default_value = emit_strength
    if emit_tex:
        t = nt.nodes.new('ShaderNodeTexImage')
        t.image = _img(emit_tex)
        nt.links.new(t.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = emit_strength
    if coat:
        b.inputs['Coat Weight'].default_value = coat
        b.inputs['Coat Roughness'].default_value = 0.05
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        if hasattr(m, 'surface_render_method'):
            m.surface_render_method = 'BLENDED'
        if hasattr(m, 'blend_method'):
            m.blend_method = 'BLEND'
    MATS[name] = m
    return m


def materials():
    mat('hull_white', '#ffffff', rough=0.24, coat=0.7, tex='gelcoat.jpg', normal='gelcoat_n.jpg', normal_strength=0.45)
    mat('hull_navy', '#1d2b5a', rough=0.22, coat=0.7)
    mat('hull_coral', '#ff7a5c', rough=0.3, coat=0.5)
    mat('antifoul', '#c8423a', rough=0.65)
    mat('white', '#fbf8f2', rough=0.38, tex='gelcoat.jpg', normal='gelcoat_n.jpg', normal_strength=0.45)
    mat('cream', '#f2e6d2', rough=0.5, tex='gelcoat.jpg', normal='gelcoat_n.jpg', normal_strength=0.45)
    mat('wood', '#ffffff', rough=0.5, tex='wood.jpg', normal='wood_n.jpg')
    mat('fluted', '#ffffff', rough=0.42, tex='fluted.jpg', normal='fluted_n.jpg')
    mat('tolex', '#ffffff', rough=0.75, tex='tolex.jpg', normal='tolex_n.jpg')
    mat('grille', '#ffffff', rough=0.6, metal=0.3, tex='grille.jpg')
    mat('leaf', '#ffffff', rough=0.65, tex='leaf.jpg').use_backface_culling = False
    mat('bark', '#ffffff', rough=0.85, tex='bark.jpg', normal='bark_n.jpg')
    # bottle glass (tinted, see-through), liquids and closures
    mat('bglass_clear', '#eaf7ff', rough=0.04, metal=0.1, alpha=0.32)
    mat('bglass_green', '#1f6b3c', rough=0.05, metal=0.1, alpha=0.78)
    mat('bglass_dark', '#17301f', rough=0.05, metal=0.1, alpha=0.88)
    mat('bglass_blue', '#7cc4ec', rough=0.05, metal=0.1, alpha=0.45)
    mat('bglass_frost', '#eef3f6', rough=0.55, alpha=0.62)
    mat('bglass_pink', '#ffb3d1', rough=0.05, metal=0.1, alpha=0.45)
    mat('liq_clear', '#e7f2f2', rough=0.15)
    mat('liq_amber', '#c1691d', rough=0.12, emit='#5a2a05', emit_strength=0.4)
    mat('liq_gold', '#e8b545', rough=0.12)
    mat('liq_dark', '#6e3410', rough=0.12)
    mat('liq_red', '#6e0f1f', rough=0.15)
    mat('liq_purple', '#6d1f5e', rough=0.12)
    mat('liq_orange', '#ff6a1a', rough=0.12, emit='#ff4a00', emit_strength=0.3)
    mat('liq_pink', '#ff5c9a', rough=0.12, emit='#ff2a77', emit_strength=0.3)
    mat('labels', '#ffffff', rough=0.6, tex='labels.jpg')
    mat('cork', '#c9a06a', rough=0.9)
    mat('cap_black', '#1b1b20', rough=0.35)
    mat('cap_chrome', '#e4e7ec', metal=1.0, rough=0.18)
    mat('cap_gold', '#e2b450', metal=1.0, rough=0.22)
    mat('foil_red', '#9e1b2c', metal=0.6, rough=0.3)
    mat('foil_gold', '#d9a93f', metal=1.0, rough=0.25)
    mat('wax', '#d2402a', rough=0.35, coat=0.6)
    mat('teak', '#ffffff', rough=0.72, tex='teak.jpg', normal='teak_n.jpg')
    mat('walnut', '#ffffff', rough=0.45, tex='walnut.jpg')
    mat('marble', '#ffffff', rough=0.18, tex='marble.jpg')
    mat('chrome', '#eceef2', metal=1.0, rough=0.16)
    mat('gold', '#ffcb5c', metal=1.0, rough=0.25)
    mat('glass_dark', '#14213d', metal=0.4, rough=0.06)
    mat('glass_clear', '#bfeaf6', rough=0.03, alpha=0.28)
    mat('rubber', '#24242c', rough=0.6)
    mat('leather_navy', '#26336a', rough=0.45)
    mat('cushion_white', '#f8f2e6', rough=0.85, tex='fabric.jpg', normal='fabric_n.jpg', normal_strength=1.6)
    mat('cushion_coral', '#ff7a5c', rough=0.85, tex='fabric.jpg', normal='fabric_n.jpg', normal_strength=1.6)
    mat('cushion_teal', '#19b6c4', rough=0.85, tex='fabric.jpg', normal='fabric_n.jpg', normal_strength=1.6)
    mat('cushion_yellow', '#ffcd4a', rough=0.85, tex='fabric.jpg', normal='fabric_n.jpg', normal_strength=1.6)
    mat('cushion_pink', '#ff7eb6', rough=0.85, tex='fabric.jpg', normal='fabric_n.jpg', normal_strength=1.6)
    mat('towel_coral', '#ffffff', rough=0.9, tex='stripe_coral.jpg')
    mat('towel_teal', '#ffffff', rough=0.9, tex='stripe_teal.jpg')
    mat('lifering', '#ffffff', rough=0.5, tex='lifering.jpg')
    mat('name', '#ffffff', rough=0.3, tex='name.jpg')
    mat('neon', '#ffffff', rough=0.4, tex='neon.jpg', emit_tex='neon_e.jpg', emit_strength=2.5)
    mat('dance', '#ffffff', rough=0.2, tex='dance.jpg', emit_tex='dance.jpg', emit_strength=1.4)
    mat('tub_water', '#ffffff', rough=0.05, tex='tub.jpg', emit_tex='tub.jpg', emit_strength=0.9)
    mat('led_pink', '#ff4fb0', emit='#ff4fb0', emit_strength=3.0)
    mat('led_cyan', '#3ce6ff', emit='#3ce6ff', emit_strength=3.0)
    mat('bulb', '#ffe2a0', emit='#ffd27a', emit_strength=3.0)
    mat('button', '#ff3d5e', rough=0.2, emit='#ff2a55', emit_strength=1.5, coat=1.0)
    mat('plant', '#3fa55b', rough=0.7).use_backface_culling = False
    mat('plant_dark', '#2e8048', rough=0.7).use_backface_culling = False
    mat('pot', '#e8dcc8', rough=0.6)
    mat('bottle_green', '#2f9a62', rough=0.08, metal=0.1)
    mat('bottle_amber', '#d98a2f', rough=0.08, metal=0.1)
    mat('bottle_blue', '#3f8fe0', rough=0.08, metal=0.1)
    mat('lime', '#9be15d', rough=0.5)
    mat('float_pink', '#ff7eb6', rough=0.25, coat=0.8)
    mat('float_yellow', '#ffd23f', rough=0.25, coat=0.8)
    mat('float_sprinkle', '#ffffff', rough=0.4)
    mat('dark', '#1b1d26', rough=0.4)
    for n in ('white', 'towel_coral', 'towel_teal', 'dance', 'glass_clear', 'cushion_coral', 'cushion_yellow', 'cushion_teal', 'cushion_pink', 'cushion_white', 'name', 'neon', 'glass_dark'):
        MATS[n].use_backface_culling = False
    mat('screen', '#59d6ff', emit='#59d6ff', emit_strength=1.2)
    mat('disco', '#e8ecf5', metal=1.0, rough=0.08)


# ------------------------------------------------------------------ primitives
PARTS = []     # static parts to be merged
NAMED = {}     # parts that keep their own node


# materials that get world-space box UVs automatically (scale = texture repeats per unit)
AUTO_UV = {'white': 0.45, 'hull_white': 0.2, 'cream': 0.45, 'wood': 0.7, 'fluted': 0.8, 'tolex': 1.2, 'bark': 1.6,
           'cushion_white': 0.9, 'cushion_coral': 0.9, 'cushion_teal': 0.9, 'cushion_yellow': 0.9, 'cushion_pink': 0.9}


def _finish(o, m, bevel=0.0, seg=2, smooth_angle=35, keep=None, uv=None):
    o.data.materials.clear()
    o.data.materials.append(MATS[m] if isinstance(m, str) else m)
    if bevel > 0:
        md = o.modifiers.new('bv', 'BEVEL')
        md.width = bevel
        md.segments = seg
        md.limit_method = 'ANGLE'
        md.angle_limit = math.radians(40)
        apply_modifiers(o)
    name = m if isinstance(m, str) else m.name
    if uv:
        box_uv(o, uv)
    elif name in AUTO_UV and not o.data.uv_layers.get('UVMap_explicit'):
        box_uv(o, AUTO_UV[name])
    select_only([o])
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(smooth_angle))
    except Exception:
        pass
    if keep:
        o.name = keep
        NAMED[keep] = o
    else:
        PARTS.append(o)
    return o


def apply_tf(o):
    select_only([o])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def box(c, s, m, bevel=0.03, seg=2, keep=None, uv=None, rot_y=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=G(*c))
    o = bpy.context.view_layer.objects.active
    o.scale = (s[0], s[2], s[1])
    o.rotation_euler = (0, 0, rot_y)
    apply_tf(o)
    return _finish(o, m, bevel, seg, keep=keep, uv=uv)


def cushion(c, s, m, soft=0.12, keep=None):
    return box(c, s, m, bevel=min(soft, min(s) * 0.45), seg=4, keep=keep, uv=0.9)


def cyl(c, r, h, m, verts=24, r2=None, axis='y', bevel=0.0, keep=None, uv=None):
    rot = {'y': (0, 0, 0), 'x': (0, math.radians(90), 0), 'z': (math.radians(90), 0, 0)}[axis]
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=G(*c), rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=h, location=G(*c), rotation=rot)
    o = bpy.context.view_layer.objects.active
    apply_tf(o)
    return _finish(o, m, bevel, 2, keep=keep, uv=uv)


def sphere(c, r, m, scale=(1, 1, 1), seg=24, rings=14, keep=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=G(*c))
    o = bpy.context.view_layer.objects.active
    o.scale = (scale[0], scale[2], scale[1])
    apply_tf(o)
    return _finish(o, m, smooth_angle=80, keep=keep)


def torus(c, R, r, m, axis='y', keep=None, uv=None):
    rot = {'y': (0, 0, 0), 'x': (0, math.radians(90), 0), 'z': (math.radians(90), 0, 0)}[axis]
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=32, minor_segments=12, location=G(*c), rotation=rot)
    o = bpy.context.view_layer.objects.active
    apply_tf(o)
    if uv == 'ring':
        ring_uv(o)
    return _finish(o, m, smooth_angle=80, keep=keep)


def tube(points, r, m, res=2, keep=None):
    cu = bpy.data.curves.new('tube', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = res
    cu.use_fill_caps = True
    sp = cu.splines.new('POLY')
    sp.points.add(len(points) - 1)
    for i, p in enumerate(points):
        sp.points[i].co = (*G(*p), 1)
    o = bpy.data.objects.new('tube', cu)
    bpy.context.scene.collection.objects.link(o)
    select_only([o])
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.view_layer.objects.active
    return _finish(o, m, smooth_angle=70, keep=keep)


def poly_mesh(name, verts, faces, m, uvs=None, keep=None, smooth_angle=35, uv=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([G(*v) for v in verts], [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if uvs is not None:
        layer = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li, vi in zip(poly.loop_indices, poly.vertices):
                layer.data[li].uv = uvs[vi]
    return _finish(o, m, keep=keep, smooth_angle=smooth_angle, uv=uv)


def quad(corners, m, keep=None):
    """corners in game space: bottom-left, bottom-right, top-right, top-left (as seen by the viewer)."""
    return poly_mesh('quad', corners, [(0, 1, 2, 3)], m, uvs=[(0, 0), (1, 0), (1, 1), (0, 1)], keep=keep)


def prism(plan, y0, y1, m, bevel=0.05, uv=None, keep=None, seg=2):
    """Extrude a plan polygon [(x, z), ...] (counter-clockwise seen from above) between heights y0..y1."""
    n = len(plan)
    verts = [(x, y0, z) for x, z in plan] + [(x, y1, z) for x, z in plan]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    o = poly_mesh('prism', verts, faces, m, keep=None, uv=None)
    PARTS.remove(o)
    fix_normals(o)
    return _finish(o, m, bevel, seg, keep=keep, uv=uv)


def side_profile(profile, x0, x1, m, bevel=0.06, uv=None, keep=None):
    """Extrude a side profile [(z, y), ...] across x0..x1 (sleek superstructure shapes)."""
    n = len(profile)
    verts = [(x0, y, z) for z, y in profile] + [(x1, y, z) for z, y in profile]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, n + i, n + j, j))
    o = poly_mesh('profile', verts, faces, m)
    PARTS.remove(o)
    fix_normals(o)
    return _finish(o, m, bevel, 3, keep=keep, uv=uv)


def fix_normals(o):
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()


def box_uv(o, s):
    """Dominant-axis planar UVs in world units (teak planks follow the boat's length)."""
    me = o.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    layer = me.uv_layers.active
    mw = o.matrix_world
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li, vi in zip(poly.loop_indices, poly.vertices):
            co = mw @ me.vertices[vi].co
            if ax == 2:
                uv = (co.x * s, co.y * s)
            elif ax == 0:
                uv = (co.y * s, co.z * s)
            else:
                uv = (co.x * s, co.z * s)
            layer.data[li].uv = uv


def ring_uv(o):
    me = o.data
    layer = me.uv_layers.active or me.uv_layers.new(name='UVMap')
    c = Vector((0, 0, 0))
    for v in me.vertices:
        c += v.co
    c /= len(me.vertices)
    for poly in me.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            p = me.vertices[vi].co - c
            layer.data[li].uv = ((math.atan2(p.y, p.x) / math.tau) % 1.0, 0.5)


# ------------------------------------------------------------------ hull
def half_beam(z, y):
    """Hull half-breadth at length z and height y (raked, flared bow; slight transom taper)."""
    sheer = sheer_at(z)
    ze = z + max(0.0, sheer + 0.6 - y) * 0.55          # raked stem
    if ze < -20:
        b = BEAM * (0.95 + 0.05 * (ze + 24) / 4)
    elif ze <= 4:
        b = BEAM
    else:
        t = min(1.0, (ze - 4) / (BOW - 4))
        b = BEAM * max(0.0, 1 - t ** 2.2) ** 0.62
    flare = 0.86 + 0.14 * smooth((y + 1.6) / 4.8)
    return max(0.0, b * flare)


def sheer_at(z):
    return 3.35 + 1.05 * smooth((z - 2) / 23) ** 1.4


def keel_at(z):
    if z < -18:
        return -1.0 - 0.4 * (z + 24) / 6
    if z < 10:
        return -1.4
    return -1.4 + 2.2 * smooth((z - 10) / 15)


NS = 14  # points per half section from sheer to keel


def section(z):
    top = sheer_at(z)
    kl = keel_at(z)
    ring = []
    for k in range(NS + 1):
        t = k / NS
        if t < 0.62:  # topsides down to the chine
            y = top + (-0.35 - top) * (t / 0.62)
            x = half_beam(z, y)
        else:  # bottom with deadrise to the keel
            u = (t - 0.62) / 0.38
            y = -0.35 + (kl + 0.35) * (u ** 0.8)
            x = half_beam(z, -0.35) * (1 - u) ** 1.15
        ring.append((x, y, z))
    return ring


def build_hull():
    zs = [TRANSOM + i * 0.5 for i in range(int((BOW - 0.4 - TRANSOM) / 0.5) + 1)]
    rows = []
    verts = []
    for z in zs:
        ring = section(z)
        full = ring + [(-x, y, z) for x, y, z in reversed(ring[:-1])]
        rows.append(len(verts))
        verts += full
    per = 2 * NS + 1
    faces = []
    mats = []
    for r in range(len(zs) - 1):
        a = rows[r]
        b = rows[r + 1]
        for k in range(per - 1):
            faces.append((a + k, a + k + 1, b + k + 1, b + k))
    # bow cap
    tip = len(verts)
    verts.append((0, sheer_at(BOW) - 0.1, BOW + 0.3))
    last = rows[-1]
    for k in range(per - 1):
        faces.append((last + k, last + k + 1, tip))
    o = poly_mesh('hull', verts, faces, 'hull_white', smooth_angle=50)
    PARTS.remove(o)
    fix_normals(o)
    # paint bands by height
    for name in ['hull_navy', 'hull_coral', 'antifoul']:
        o.data.materials.append(MATS[name])
    for poly in o.data.polygons:
        y = (o.matrix_world @ poly.center).z
        if y < 0.05:
            poly.material_index = 3
        elif y < 1.25:
            poly.material_index = 1
        elif y < 1.42:
            poly.material_index = 2
    PARTS.append(o)
    select_only([o])
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))

    # transom
    tz = TRANSOM
    ring = section(tz)
    pts = ring + [(-x, y, z) for x, y, z in reversed(ring[:-1])]
    o = poly_mesh('transom', pts, [tuple(range(len(pts)))], 'hull_white')
    PARTS.remove(o)
    fix_normals(o)
    o.data.materials.append(MATS['hull_navy'])
    PARTS.append(o)
    # rub rail (chrome) along the sheer and a coral cap stripe
    for s in (1, -1):
        pts = [(s * (half_beam(z, sheer_at(z) - 0.05) + 0.03), sheer_at(z) - 0.12, z) for z in [TRANSOM + i * 0.8 for i in range(61) if TRANSOM + i * 0.8 < BOW - 0.6]]
        tube(pts, 0.07, 'chrome')
    # long dark hull windows + portholes (both sides)
    for s in (1, -1):
        for (z0, z1) in [(-12.0, -5.0), (-3.8, 3.2)]:
            y0, y1 = 1.75, 2.35
            xs = lambda z, y: s * (half_beam(z, y) + 0.04)  # noqa: E731
            quad_pts = [(xs(z0, y0), y0, z0), (xs(z1, y0), y0, z1), (xs(z1 - 0.6, y1), y1, z1 - 0.6), (xs(z0 + 0.4, y1), y1, z0 + 0.4)]
            if s > 0:
                quad_pts = [quad_pts[1], quad_pts[0], quad_pts[3], quad_pts[2]]
            quad(quad_pts, 'glass_dark')
        for z in [-19, -16.5, 9, 11, 13]:
            y = 2.05
            x = s * (half_beam(z, y) + 0.01)
            cyl((x, y, z), 0.24, 0.08, 'chrome', axis='x', verts=20)
            cyl((x + s * 0.03, y, z), 0.17, 0.08, 'glass_dark', axis='x', verts=20)
    # underwater LED glow strips (party at night!)
    for s in (1, -1):
        box((s * (half_beam(-12, 0.25) + 0.02), 0.22, -12), (0.06, 0.08, 18), 'led_cyan', bevel=0.02)


# ------------------------------------------------------------------ decks
def deck_outline(y, z0, z1, inset, step=1.0):
    pts = []
    z = z0
    while z < z1:
        pts.append((half_beam(z, y) - inset, z))
        z += step
    pts.append((half_beam(z1, y) - inset, z1))
    left = [(x, z) for x, z in pts]
    right = [(-x, z) for x, z in reversed(pts)]
    return left + right


def build_decks():
    # aft deck + side decks (one big teak plate at DECK)
    outline = deck_outline(DECK, TRANSOM + 0.2, 10.0, 0.42)
    outline = [(x, z) for x, z in outline]
    plan = list(reversed(outline))  # ccw from above
    prism(plan, DECK - 0.25, DECK, 'teak', bevel=0.0, uv=0.5)
    # foredeck (raised)
    fo = deck_outline(DECK + 0.6, 10.0, BOW - 1.6, 0.42, step=0.8)
    prism(list(reversed(fo)), DECK + 0.3, DECK + 0.6, 'teak', bevel=0.0, uv=0.5)
    for s in (1, -1):
        box((s * 5.75, DECK + 0.3, 10.2), (1.5, 0.6, 0.5), 'teak', bevel=0.04, uv=0.5)   # step up to the foredeck
    # bulwarks (inner white walls) + teak cap rail
    for s in (1, -1):
        zs = [TRANSOM + 0.3 + i * 0.8 for i in range(int((BOW - 2 - TRANSOM) / 0.8))]
        verts = []
        faces = []
        for i, z in enumerate(zs):
            top = sheer_at(z) + 0.05
            bot = DECK if z < 10 else DECK + 0.6
            x = s * (half_beam(z, top) - 0.32)
            verts += [(x, bot, z), (x, top, z)]
            if i:
                a = 2 * (i - 1)
                faces.append((a, a + 2, a + 3, a + 1) if s > 0 else (a, a + 1, a + 3, a + 2))
        o = poly_mesh('bulwark', verts, faces, 'white')
        cap = [(s * (half_beam(z, sheer_at(z)) - 0.17), sheer_at(z) + 0.08, z) for z in zs]
        tube(cap, 0.17, 'teak', res=1)
    # transom top cap
    box((0, sheer_at(TRANSOM) + 0.08, TRANSOM + 0.15), (9.2, 0.16, 0.34), 'teak', uv=0.5)


def build_stern():
    # swim platform
    box((0, 0.65, TRANSOM - 1.6), (12.2, 0.3, 3.2), 'teak', bevel=0.06, uv=0.5)
    box((0, 0.42, TRANSOM - 1.6), (12.0, 0.2, 3.0), 'white', bevel=0.05)
    box((0, 0.53, TRANSOM - 3.15), (12.0, 0.06, 0.08), 'led_cyan', bevel=0.02)
    # twin stairs from the aft deck down to the platform
    for s in (1, -1):
        for i in range(6):
            y = DECK - 0.36 * i
            z = TRANSOM - 0.1 - i * 0.42
            box((s * 5.6, y - 0.15, z), (1.6, 0.3, 0.46), 'teak', bevel=0.03, uv=0.5)
            box((s * 5.6, (y + 0.65) / 2 - 0.2, z), (1.55, max(0.1, y - 0.65), 0.42), 'white', bevel=0.02)
        tube([(s * 6.5, DECK + 1.0, TRANSOM + 0.2), (s * 6.5, DECK + 1.0 - 0.1, TRANSOM - 0.6), (s * 6.5, 1.8, TRANSOM - 2.6), (s * 6.5, 1.6, TRANSOM - 2.9)], 0.05, 'chrome')
    # name board on the transom
    nb_w, nb_h = 6.0, 1.5
    z = TRANSOM - 0.02
    quad([(nb_w / 2, 1.75, z), (-nb_w / 2, 1.75, z), (-nb_w / 2, 1.75 + nb_h, z), (nb_w / 2, 1.75 + nb_h, z)], 'name')
    # boarding ladder
    for s in (1, -1):
        tube([(s * 0.5, 0.8, TRANSOM - 3.1), (s * 0.5, -0.8, TRANSOM - 3.4)], 0.05, 'chrome')
    for i in range(3):
        tube([(0.5, 0.4 - i * 0.45, TRANSOM - 3.15 - i * 0.07), (-0.5, 0.4 - i * 0.45, TRANSOM - 3.15 - i * 0.07)], 0.04, 'chrome')
    # paddle boards
    for i, (c, x) in enumerate((('cushion_teal', 3.6), ('cushion_coral', 2.4))):
        sphere((x, 1.0, TRANSOM - 1.7), 0.5, c, scale=(0.55, 0.12, 3.0))


# ------------------------------------------------------------------ superstructure
def build_superstructure():
    # main salon (sleek swept profile) + dark window band
    salon = [(-7.0, DECK), (12.2, DECK), (12.6, DECK + 0.5), (9.6, DECK + 2.75), (-7.0, DECK + 2.75)]
    side_profile(salon, -4.95, 4.95, 'hull_white', bevel=0.12)
    band = [(-6.6, DECK + 1.0), (10.9, DECK + 1.0), (11.6, DECK + 1.4), (9.4, DECK + 2.35), (-6.6, DECK + 2.35)]
    side_profile(band, -5.0, 5.0, 'glass_dark', bevel=0.05)
    # aft wall: glass sliding doors framed in chrome
    z = -7.03
    quad([(1.7, DECK, z), (-1.7, DECK, z), (-1.7, DECK + 2.45, z), (1.7, DECK + 2.45, z)], 'glass_dark')
    for x in (-1.7, -0.57, 0.57, 1.7):
        box((x, DECK + 1.22, z - 0.03), (0.07, 2.45, 0.06), 'chrome', bevel=0.01)
    box((0, DECK + 2.48, z - 0.03), (3.5, 0.07, 0.06), 'chrome', bevel=0.01)
    # flybridge deck slab with a big overhang over the party deck
    plan = [(6.25, -13.0), (6.4, -6.0), (6.0, 2.0), (5.2, 6.0), (3.6, 9.4), (-3.6, 9.4), (-5.2, 6.0), (-6.0, 2.0), (-6.4, -6.0), (-6.25, -13.0)]
    plan = list(reversed(plan))
    prism(plan, FLY - 0.32, FLY - 0.02, 'hull_white', bevel=0.1)
    inner = [(x * 0.95, z if z > 0 else z + 0.25) for x, z in plan]
    prism(inner, FLY - 0.03, FLY, 'teak', bevel=0.0, uv=0.5)
    # LED strip under the overhang edge + ceiling downlights
    box((0, FLY - 0.34, -12.95), (12.2, 0.05, 0.08), 'led_pink', bevel=0.01)
    for s in (1, -1):
        box((s * 6.3, FLY - 0.34, -9.5), (0.08, 0.05, 7.0), 'led_pink', bevel=0.01)
    for x in (-4, -2, 0, 2, 4):
        for z in (-12, -10.2, -8.4):
            cyl((x, FLY - 0.33, z), 0.12, 0.03, 'bulb', verts=12)
    # overhang pillars
    for s in (1, -1):
        cyl((s * 5.75, (DECK + FLY) / 2, -12.4), 0.13, FLY - DECK, 'chrome', verts=16)
    # skylounge on the flybridge (dark wraparound glass)
    sky = [(0.6, FLY), (8.6, FLY), (7.0, FLY + 1.85), (1.4, FLY + 1.85)]
    side_profile(sky, -3.9, 3.9, 'hull_white', bevel=0.1)
    skyb = [(1.1, FLY + 0.5), (8.0, FLY + 0.5), (6.9, FLY + 1.55), (1.5, FLY + 1.55)]
    side_profile(skyb, -3.94, 3.94, 'glass_dark', bevel=0.04)
    # hardtop (roof) + swept radar arch legs
    hplan = list(reversed([(4.6, -6.5), (4.8, 1.0), (4.2, 6.6), (-4.2, 6.6), (-4.8, 1.0), (-4.6, -6.5)]))
    prism(hplan, FLY + 2.35, FLY + 2.6, 'hull_white', bevel=0.12)
    box((0, FLY + 2.33, -6.45), (9.0, 0.05, 0.08), 'led_cyan', bevel=0.01)
    for s in (1, -1):
        side_profile([(-5.6, FLY), (-4.3, FLY), (-3.7, FLY + 2.4), (-5.0, FLY + 2.4)], s * 4.25, s * 4.6, 'hull_white', bevel=0.06)
    # radar mast, domes, antennas
    side_profile([(-1.0, FLY + 2.6), (1.2, FLY + 2.6), (0.6, FLY + 4.2), (-0.4, FLY + 4.2)], -1.6, 1.6, 'hull_white', bevel=0.08)
    for x in (-0.9, 0.9):
        cyl((x, FLY + 4.4, 0.1), 0.18, 0.4, 'white', verts=16)
        sphere((x, FLY + 4.95, 0.1), 0.6, 'white', scale=(1, 0.85, 1))
    for x in (-1.4, 1.4):
        cyl((x, FLY + 5.1, -0.2), 0.03, 1.8, 'chrome', verts=8)
    box((0, FLY + 4.3, 0.1), (3.6, 0.08, 0.08), 'chrome', bevel=0.01)


# ------------------------------------------------------------------ rails
def rail_run(points, height, m='chrome', post_every=1.6, glass=False):
    top = [(x, y + height, z) for x, y, z in points]
    tube(top, 0.055, m)
    if not glass:
        tube([(x, y + height * 0.5, z) for x, y, z in points], 0.025, m)
    # posts
    dist = 0.0
    last = None
    for p in points:
        if last is None or dist >= post_every:
            cyl((p[0], p[1] + height / 2, p[2]), 0.04, height, m, verts=10)
            dist = 0.0
        if last is not None:
            dist += math.dist(p, last)
        last = p
    if glass:
        for a, b in zip(points, points[1:]):
            verts = [(a[0], a[1] + 0.05, a[2]), (b[0], b[1] + 0.05, b[2]), (b[0], b[1] + height - 0.08, b[2]), (a[0], a[1] + height - 0.08, a[2])]
            o = quad(verts, 'glass_clear')


def build_rails():
    for s in (1, -1):
        # glass balustrade around the party deck, classic rails forward
        aft = [(s * (half_beam(z, sheer_at(z)) - 0.17), sheer_at(z) + 0.16, z) for z in [TRANSOM + 0.6 + i * 1.2 for i in range(9)]]
        rail_run(aft, 0.85, glass=True, post_every=1.15)
        fwd = [(s * (half_beam(z, sheer_at(z)) - 0.17), sheer_at(z) + 0.16, z) for z in [-13.0 + i * 1.0 for i in range(int(BOW - 2.0 + 13.0))]]
        rail_run(fwd, 0.9)
    # bow pulpit closes the loop
    tube([(0.9, sheer_at(BOW - 1.6) + 1.05, BOW - 1.4), (0, sheer_at(BOW - 1.2) + 1.05, BOW - 0.9), (-0.9, sheer_at(BOW - 1.6) + 1.05, BOW - 1.4)], 0.055, 'chrome')
    # flybridge glass rail
    fb = [(6.15, -12.8), (6.3, -6.0), (5.9, 2.0)]
    for s in (1, -1):
        rail_run([(s * x, FLY, z) for x, z in fb], 1.0, glass=True, post_every=1.4)
    rail_run([(6.1, FLY, -12.85), (-6.1, FLY, -12.85)], 1.0, glass=True, post_every=1.4)


# ------------------------------------------------------------------ party deck (stage-local)
SPOTS = {}


def sofa(c, length, depth, facing, seat_mat='cushion_white', accent=('cushion_coral', 'cushion_teal'), keep_back=True):
    """A built-in lounge sofa; facing = direction people look (+z/-z/+x/-x)."""
    x, y, z = c
    horiz = facing in ('+z', '-z')
    w, d = (length, depth) if horiz else (depth, length)
    box((x, y + 0.2, z), (w, 0.4, d), 'white', bevel=0.06)
    cushion((x, y + 0.5, z), (w - 0.1, 0.22, d - 0.08), seat_mat, soft=0.1)
    if keep_back:
        off = {'+z': (0, -1), '-z': (0, 1), '+x': (-1, 0), '-x': (1, 0)}[facing]
        bx, bz = x + off[0] * (d / 2 - 0.15), z + off[1] * (d / 2 - 0.15)
        bw, bd = (w, 0.3) if horiz else (0.3, length)
        box((bx, y + 0.55, bz), (bw, 1.1, bd), 'white', bevel=0.08)
        cushion((bx - off[0] * 0.25, y + 0.85, bz - off[1] * 0.25), (bw - 0.2 if horiz else 0.25, 0.5, 0.25 if horiz else length - 0.2), seat_mat, soft=0.1)
        # throw pillows
        n = max(2, int(length / 1.2))
        for i in range(n):
            t = (i + 0.5) / n - 0.5
            px = x + (t * (length - 0.6) if horiz else -off[0] * 0.1 + off[0] * (d / 2 - 0.55))
            pz = z + (off[1] * (d / 2 - 0.55) if horiz else t * (length - 0.6))
            cushion((px, y + 0.85, pz), (0.55 if horiz else 0.18, 0.5, 0.18 if horiz else 0.55), accent[i % 2], soft=0.08)


def stool(c):
    x, y, z = c
    cyl((x, y + 0.42, z), 0.05, 0.84, 'chrome', verts=12)
    cyl((x, y + 0.02, z), 0.28, 0.04, 'chrome', verts=20)
    torus((x, y + 0.35, z), 0.18, 0.02, 'chrome')
    cyl((x, y + 0.9, z), 0.27, 0.12, 'leather_navy', verts=24, bevel=0.03)


def cocktail(c, liquid):
    x, y, z = c
    cyl((x, y + 0.03, z), 0.05, 0.04, 'glass_clear', verts=10)
    cyl((x, y + 0.13, z), 0.015, 0.18, 'glass_clear', verts=6)
    cyl((x, y + 0.29, z), 0.11, 0.14, 'glass_clear', verts=14, r2=0.04)
    cyl((x, y + 0.31, z), 0.085, 0.07, liquid, verts=14, r2=0.04)
    torus((x + 0.09, y + 0.35, z), 0.05, 0.018, 'lime', axis='z')


# ---------------------------------------------------------------- bottles (lathe-turned)
def lathe(c, profile, m, segs=18, rot=0.0, arc=None, uv_cell=None, cap_bottom=True, cap_top=True, smooth_angle=60, bevel=0.0, keep=None):
    """Spin a profile [(radius, height), ...] (bottom -> top, heights relative to c) around the vertical axis.
    arc=(a0, a1) makes a partial band (angle 0 faces the bar, i.e. game -z); uv_cell=(u0, v0, u1, v1) maps it into an atlas."""
    x0, y0, z0 = c
    full = arc is None
    a0, a1 = (0.0, math.tau) if full else arc
    cols = segs if full else segs + 1
    verts, faces, uvs = [], [], []
    for j, (r, h) in enumerate(profile):
        for i in range(cols):
            a = a0 + (a1 - a0) * i / segs + rot
            verts.append((x0 + r * math.sin(a), y0 + h, z0 - r * math.cos(a)))
            if uv_cell:
                u0, v0, u1, v1 = uv_cell
                uvs.append((u1 - (u1 - u0) * i / segs, v0 + (v1 - v0) * j / (len(profile) - 1)))
            else:
                uvs.append((i / segs, j / (len(profile) - 1)))
    for j in range(len(profile) - 1):
        for i in range(segs):
            a = j * cols + i
            b = j * cols + (i + 1) % cols
            faces.append((a, b, b + cols, a + cols))
    if full and cap_bottom and profile[0][0] > 0:
        verts.append((x0, y0 + profile[0][1], z0)); uvs.append((0.5, 0.5))
        cidx = len(verts) - 1
        faces += [(cidx, (i + 1) % cols, i) for i in range(segs)]
    if full and cap_top and profile[-1][0] > 0:
        verts.append((x0, y0 + profile[-1][1], z0)); uvs.append((0.5, 0.5))
        cidx = len(verts) - 1
        base = (len(profile) - 1) * cols
        faces += [(cidx, base + i, base + (i + 1) % cols) for i in range(segs)]
    o = poly_mesh('lathe', verts, faces, m, uvs=uvs, smooth_angle=smooth_angle)
    PARTS.remove(o)
    fix_normals(o)
    return _finish(o, m, bevel=bevel, seg=2, smooth_angle=smooth_angle, keep=keep)


def _curve(points, n=4):
    """Smooth a coarse profile with Catmull-Rom so bottles get soft shoulders."""
    out = []
    pts = [points[0]] + points + [points[-1]]
    for k in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[k - 1], pts[k], pts[k + 1], pts[k + 2]
        for t in [i / n for i in range(n)]:
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3) for d in range(2)))
    out.append(points[-1])
    return out


# label atlas cells (4 x 2): tequila, mezcal, ron, gin / vodka, whisky, vino, compitas
def _cell(i):
    col, row = i % 4, i // 4
    return (col / 4 + 0.006, 1 - (row + 1) / 2 + 0.01, (col + 1) / 4 - 0.006, 1 - row / 2 - 0.01)


# name: (profile [(r, h)], glass, liquid, fill, closure, label cell, label band (h0, h1), square?)
BOTTLES = {
    'wine':      ([(0.058, 0), (0.06, 0.02), (0.06, 0.22), (0.05, 0.27), (0.022, 0.32), (0.019, 0.4)], 'bglass_green', 'liq_red', 0.7, 'foil_red', 6, (0.05, 0.17), False),
    'champagne': ([(0.064, 0), (0.066, 0.02), (0.066, 0.2), (0.055, 0.26), (0.025, 0.33), (0.022, 0.42)], 'bglass_dark', 'liq_gold', 0.75, 'foil_gold', 7, (0.05, 0.16), False),
    'tequila':   ([(0.07, 0), (0.078, 0.03), (0.078, 0.14), (0.062, 0.19), (0.028, 0.21), (0.026, 0.25)], 'bglass_clear', 'liq_clear', 0.8, 'cork_big', 0, (0.03, 0.15), False),
    'anejo':     ([(0.05, 0), (0.053, 0.02), (0.053, 0.27), (0.04, 0.31), (0.02, 0.33), (0.02, 0.38)], 'bglass_clear', 'liq_amber', 0.85, 'cork', 0, (0.06, 0.2), False),
    'mezcal':    ([(0.06, 0), (0.064, 0.02), (0.064, 0.16), (0.05, 0.2), (0.024, 0.23), (0.023, 0.29)], 'bglass_clear', 'liq_clear', 0.75, 'wax', 1, (0.04, 0.15), False),
    'rum':       ([(0.05, 0), (0.075, 0.05), (0.085, 0.11), (0.07, 0.18), (0.03, 0.22), (0.024, 0.28)], 'bglass_clear', 'liq_dark', 0.7, 'cap_black', 2, (0.05, 0.15), False),
    'gin':       ([(0.07, 0), (0.074, 0.02), (0.074, 0.22), (0.06, 0.26), (0.026, 0.28), (0.025, 0.33)], 'bglass_blue', 'liq_clear', 0.8, 'cap_chrome', 3, (0.05, 0.18), True),
    'vodka':     ([(0.046, 0), (0.048, 0.02), (0.05, 0.3), (0.035, 0.34), (0.018, 0.36), (0.018, 0.41)], 'bglass_frost', 'liq_clear', 0.85, 'cap_chrome', 4, (0.07, 0.22), False),
    'whisky':    ([(0.075, 0), (0.08, 0.02), (0.08, 0.17), (0.07, 0.2), (0.03, 0.22), (0.028, 0.25)], 'bglass_clear', 'liq_amber', 0.7, 'stopper', 5, (0.04, 0.14), True),
    'liqueur':   ([(0.03, 0), (0.07, 0.03), (0.09, 0.09), (0.07, 0.16), (0.025, 0.19), (0.02, 0.25)], 'bglass_clear', 'liq_purple', 0.65, 'cap_gold', 7, (0.05, 0.12), False),
    'aperitivo': ([(0.055, 0), (0.058, 0.02), (0.058, 0.2), (0.045, 0.25), (0.02, 0.29), (0.019, 0.34)], 'bglass_clear', 'liq_orange', 0.8, 'cap_black', 2, (0.05, 0.16), False),
    'compitas':  ([(0.06, 0), (0.066, 0.03), (0.07, 0.16), (0.055, 0.22), (0.026, 0.25), (0.024, 0.3)], 'bglass_pink', 'liq_pink', 0.75, 'cap_gold', 7, (0.05, 0.16), False),
}


def bottle(kind, c, scale=1.0, turn=0.0):
    prof, glass, liquid, fill, closure, cell, band, square = BOTTLES[kind]
    prof = [(r * scale, h * scale) for r, h in prof]
    segs, rot, sm = (4, math.pi / 4 + turn, 25) if square else (20, turn, 70)
    shape = prof if square else _curve(prof)
    if square:
        k = 1 / math.cos(math.pi / 4)  # square corners reach the radius
        shape = [(r * k, h) for r, h in prof]
    lathe(c, shape, glass, segs=segs, rot=rot, smooth_angle=sm, bevel=0.012 * scale if square else 0.0)
    # liquid: the body below the shoulder, filled to `fill`
    body_top = max(h for r, h in prof if r >= prof[2][0] * 0.95)
    liq = [(r * 0.86, h + 0.004) for r, h in shape if h <= body_top * fill] or [(shape[0][0] * 0.86, 0.004)]
    liq.append((liq[-1][0], body_top * fill))
    lathe(c, liq, liquid, segs=segs, rot=rot, smooth_angle=sm)
    # label wrapped around the front
    h0, h1 = band[0] * scale, band[1] * scale
    def r_at(h):
        for (ra, ha), (rb, hb) in zip(shape, shape[1:]):
            if ha <= h <= hb:
                return ra + (rb - ra) * (h - ha) / max(1e-6, hb - ha)
        return shape[-1][0]
    lab = [(r_at(h0 + (h1 - h0) * t / 4) * 1.012, h0 + (h1 - h0) * t / 4) for t in range(5)]
    if square:
        x, y, z = c
        hw = lab[0][0] * math.cos(math.pi / 4) * 0.96
        zf = z - hw / 1.0 - 0.004
        u0, v0, u1, v1 = _cell(cell)
        poly_mesh('label', [(x + hw, y + h0, zf), (x - hw, y + h0, zf), (x - hw, y + h1, zf), (x + hw, y + h1, zf)], [(0, 1, 2, 3)], 'labels', uvs=[(u0, v0), (u1, v0), (u1, v1), (u0, v1)])
    else:
        lathe(c, lab, 'labels', segs=10, arc=(-1.05, 1.05), uv_cell=_cell(cell), smooth_angle=80)
    # closure
    x, y, z = c
    top = prof[-1][1]
    nr = prof[-1][0]
    if closure == 'cork':
        cyl((x, y + top + 0.025 * scale, z), nr * 1.25, 0.05 * scale, 'cork', verts=14)
        cyl((x, y + top + 0.055 * scale, z), nr * 1.6, 0.02 * scale, 'cap_black', verts=14)
    elif closure == 'cork_big':
        cyl((x, y + top + 0.035 * scale, z), nr * 1.5, 0.07 * scale, 'cork', verts=16, bevel=0.006)
    elif closure in ('foil_red', 'foil_gold'):
        cyl((x, y + top - 0.04 * scale, z), nr * 1.12, 0.09 * scale, closure, verts=14)
    elif closure == 'wax':
        lathe((x, y + top - 0.05 * scale, z), [(nr * 1.15, 0), (nr * 1.25, 0.03 * scale), (nr * 1.15, 0.06 * scale), (nr * 0.8, 0.075 * scale)], 'wax', segs=14, smooth_angle=80)
    elif closure == 'stopper':
        cyl((x, y + top + 0.01 * scale, z), nr * 1.1, 0.02 * scale, 'bglass_clear', verts=14)
        sphere((x, y + top + 0.05 * scale, z), 0.034 * scale, 'bglass_clear', seg=14, rings=8)
    else:
        cyl((x, y + top + 0.018 * scale, z), nr * 1.18, 0.036 * scale, closure, verts=14, bevel=0.004)


def bottles(x0, x1, y, z, max_h=0.42, seed=0, kinds=None):
    """A lively row of different bottles that fits under max_h."""
    import random as _r
    rnd = _r.Random(seed)
    kinds = kinds or list(BOTTLES.keys())
    order = kinds[:]
    rnd.shuffle(order)
    x = x0
    i = 0
    while True:
        kind = order[i % len(order)]
        prof = BOTTLES[kind][0]
        h = prof[-1][1] + 0.07
        sc = min(1.15, max_h / h) * rnd.uniform(0.92, 1.0)
        rmax = max(r for r, _ in prof) * sc
        if x + rmax * 2 > x1:
            break
        bottle(kind, (x + rmax, y, z + rnd.uniform(-0.03, 0.03)), sc, turn=rnd.uniform(-0.25, 0.25))
        x += rmax * 2 + rnd.uniform(0.02, 0.06)
        i += 1


def palm_pot(c, scale=1.0):
    x, y, z = c
    cyl((x, y + 0.45 * scale, z), 0.45 * scale, 0.9 * scale, 'pot', verts=20, r2=0.35 * scale, bevel=0.03)
    cyl((x, y + 0.88 * scale, z), 0.4 * scale, 0.04, 'dark', verts=20)
    trunk = [(x + 0.04 * i * i * scale, y + 0.9 * scale + i * 0.42 * scale, z) for i in range(6)]
    tube(trunk, 0.09 * scale, 'bark', res=1)
    tx, ty, tz = trunk[-1]
    for k in range(9):
        a = k / 9 * math.tau + 0.3
        verts = []
        faces = []
        uvs = []
        n = 7
        for j in range(n + 1):
            t = j / n
            r = t * 1.7 * scale
            cx, cy, cz = tx + math.cos(a) * r, ty + (0.5 * t - 0.95 * t * t) * scale, tz + math.sin(a) * r
            w = 0.36 * scale * math.sin(math.pi * min(1, t * 1.15)) + 0.02
            px, pz = -math.sin(a) * w, math.cos(a) * w
            verts += [(cx + px, cy - 0.08 * scale, cz + pz), (cx, cy + 0.04, cz), (cx - px, cy - 0.08 * scale, cz - pz)]
            uvs += [(0.0, t), (0.5, t), (1.0, t)]
            if j:
                b = 3 * (j - 1)
                faces += [(b, b + 3, b + 4, b + 1), (b + 1, b + 4, b + 5, b + 2)]
        o = poly_mesh('frond', verts, faces, 'leaf', uvs=uvs, smooth_angle=20)


def string_lights(a, b, sag, n):
    pts = []
    for i in range(21):
        t = i / 20
        pts.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - math.sin(math.pi * t) * sag, a[2] + (b[2] - a[2]) * t))
    tube(pts, 0.01, 'dark', res=0)
    for i in range(1, n):
        t = i / n
        p = (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - math.sin(math.pi * t) * sag - 0.14, a[2] + (b[2] - a[2]) * t)
        sphere(p, 0.1, 'bulb', seg=10, rings=6)


def bunting(a, b, sag, n):
    cols = ['cushion_coral', 'cushion_yellow', 'cushion_teal', 'cushion_pink', 'cushion_white']
    for i in range(1, n):
        t = i / n
        x = a[0] + (b[0] - a[0]) * t
        y = a[1] + (b[1] - a[1]) * t - math.sin(math.pi * t) * sag
        z = a[2] + (b[2] - a[2]) * t
        dx, dz = b[0] - a[0], b[2] - a[2]
        L = math.hypot(dx, dz)
        ux, uz = dx / L * 0.22, dz / L * 0.22
        o = poly_mesh('flagt', [(x - ux, y, z - uz), (x + ux, y, z + uz), (x, y - 0.5, z)], [(0, 1, 2)], cols[i % len(cols)], smooth_angle=10)
        o.data.materials[0].use_backface_culling = False


def build_party_deck():
    sx, sy, sz = STAGE
    W = lambda x, y, z: S(x, y, z)  # noqa: E731

    # --- LED dance floor with the START pedestal in the middle ---
    df = [W(2.2, 0.1, -4.2), W(-2.2, 0.1, -4.2), W(-2.2, 0.1, 0.2), W(2.2, 0.1, 0.2)]
    poly_mesh('dance_floor', df, [(0, 3, 2, 1)], 'dance', uvs=[(0, 0), (1, 0), (1, 1), (0, 1)], keep='dance_floor')
    box(W(0, 0.045, -2.0), (4.7, 0.09, 4.7), 'chrome', bevel=0.02)
    start = (0, -2.0)
    SPOTS['start'] = start
    # pedestal: chrome column, glossy red button, glowing ring
    px, py, pz = W(start[0], 0, start[1])
    parts = []
    for o in [
        cyl((px, py + 0.15, pz), 0.62, 0.3, 'white', verts=32, bevel=0.06),
        cyl((px, py + 0.7, pz), 0.24, 0.9, 'chrome', verts=24, r2=0.18),
        cyl((px, py + 1.2, pz), 0.55, 0.16, 'white', verts=32, bevel=0.05),
        torus((px, py + 1.29, pz), 0.48, 0.045, 'led_cyan'),
        torus((px, py + 0.33, pz), 0.6, 0.035, 'led_pink'),
    ]:
        PARTS.remove(o)
        parts.append(o)
    select_only(parts)
    bpy.ops.object.join()
    ped = bpy.context.view_layer.objects.active
    ped.name = 'start_pedestal'
    NAMED['start_pedestal'] = ped
    btn = sphere((px, py + 1.33, pz), 0.38, 'button', scale=(1, 0.42, 1), keep='start_button')

    # --- stern lounge (U sofa against the transom) + coffee tables ---
    sofa(W(0, 0, -8.0), 8.0, 1.2, '+z')
    for x in (-1.9, 1.9):
        cyl(W(x, 0.22, -6.4), 0.62, 0.44, 'wood', verts=32, bevel=0.04)
        cyl(W(x, 0.45, -6.4), 0.66, 0.04, 'marble', verts=32, uv=0.8)
    # champagne bucket + glasses on the tables
    cx, cy, cz = W(-1.9, 0.47, -6.4)
    cyl((cx, cy + 0.2, cz), 0.16, 0.4, 'chrome', verts=18, r2=0.19)
    cyl((cx + 0.05, cy + 0.5, cz), 0.06, 0.5, 'bottle_green', verts=10)
    for i, liq in enumerate(['cushion_coral', 'cushion_yellow', 'cushion_pink']):
        cocktail((cx + 0.35 * math.cos(i * 2.1), cy, cz + 0.35 * math.sin(i * 2.1)), liq)
    cx, cy, cz = W(1.9, 0.47, -6.4)
    sphere((cx, cy + 0.12, cz), 0.3, 'white', scale=(1, 0.4, 1))
    for i in range(5):
        sphere((cx + 0.12 * math.cos(i), cy + 0.22, cz + 0.12 * math.sin(i)), 0.09, ['lime', 'cushion_coral', 'cushion_yellow'][i % 3], seg=10, rings=6)

    # --- side lounges along the glass balustrade ---
    for s in (1, -1):
        sofa(W(s * 5.85, 0, -3.4), 4.4, 1.0, '-x' if s > 0 else '+x', accent=('cushion_teal', 'cushion_yellow'))
    SPOTS['sofa'] = [[5.5, -4.3, -1, 0.5], [5.5, -2.6, -1, 0.5], [-5.5, -2.4, 1, 0.5], [-5.5, -4.0, 1, 0.5]]

    # --- the bar (port side, under the flybridge overhang) ---
    bx0, bx1, bz = 1.7, 5.9, 4.6
    box(W((bx0 + bx1) / 2, 0.55, bz), (bx1 - bx0, 1.1, 0.7), 'fluted', bevel=0.04)
    box(W((bx0 + bx1) / 2, 1.13, bz - 0.05), (bx1 - bx0 + 0.2, 0.08, 0.95), 'marble', bevel=0.03, uv=0.7)
    box(W((bx0 + bx1) / 2, 0.08, bz - 0.36), (bx1 - bx0, 0.05, 0.04), 'led_pink', bevel=0.01)
    box(W((bx0 + bx1) / 2, 0.98, bz - 0.38), (bx1 - bx0, 0.04, 0.04), 'gold', bevel=0.01)
    # rounded bar end
    cyl(W(bx0 - 0.1, 0.55, bz), 0.36, 1.1, 'fluted', verts=32)
    cyl(W(bx0 - 0.1, 1.13, bz - 0.05), 0.45, 0.08, 'marble', verts=24)
    for i, x in enumerate((2.4, 3.6, 4.8)):
        stool(W(x, 0, bz - 0.9))
        cocktail(W(x + 0.1, 1.17, bz - 0.2), ['liq_orange', 'liq_pink', 'liq_gold'][i])
    SPOTS['stools'] = [[2.4, bz - 0.9, 0.95], [3.6, bz - 0.9, 0.95], [4.8, bz - 0.9, 0.95]]
    SPOTS['bar_lean'] = [[5.6, bz - 0.95]]
    # back bar with shelves, bottles and the neon sign on the salon wall
    wz = 7.85
    box(W((bx0 + bx1) / 2, 0.5, wz), (bx1 - bx0, 1.0, 0.5), 'fluted', bevel=0.03)
    box(W((bx0 + bx1) / 2, 1.02, wz), (bx1 - bx0, 0.05, 0.55), 'marble', uv=0.7)
    shelf_y = 1.5
    box(W((bx0 + bx1) / 2, shelf_y, wz + 0.05), (bx1 - bx0, 0.05, 0.35), 'glass_clear', bevel=0.01)
    box(W((bx0 + bx1) / 2, shelf_y - 0.035, wz + 0.22), (bx1 - bx0, 0.02, 0.02), 'led_pink', bevel=0.005)
    for xs in (bx0 + 0.05, bx1 - 0.05):  # shelf brackets
        box(W(xs, (1.05 + shelf_y) / 2 + 0.25, wz + 0.05), (0.04, 0.9, 0.3), 'gold', bevel=0.01)
    lo, hi = W(bx0 + 0.12, 0, 0)[0], W(bx1 - 0.12, 0, 0)[0]
    bottles(lo, hi, S(0, 1.045, 0)[1], S(0, 0, wz - 0.08)[2], max_h=0.4, seed=3)
    bottles(lo, hi, S(0, shelf_y + 0.025, 0)[1], S(0, 0, wz + 0.05)[2], max_h=0.44, seed=7)
    # neon sign above the shelf (fits under the flybridge overhang)
    nz = S(0, 0, 8.0)[2] - 0.08
    ncx = S((bx0 + bx1) / 2, 0, 0)[0]
    nh = 0.6
    nw = nh * 1024 / 300
    ny0 = DECK + 2.0
    quad([(ncx + nw / 2, ny0, nz), (ncx - nw / 2, ny0, nz), (ncx - nw / 2, ny0 + nh, nz), (ncx + nw / 2, ny0 + nh, nz)], 'neon')

    # --- DJ booth (starboard, under the overhang) ---
    dx0, dx1, dz = -5.6, -2.0, 4.8
    box(W((dx0 + dx1) / 2, 0.55, dz), (dx1 - dx0, 1.1, 0.8), 'tolex', bevel=0.04)
    quad([W(dx1, 0.15, dz - 0.41), W(dx0, 0.15, dz - 0.41), W(dx0, 1.0, dz - 0.41), W(dx1, 1.0, dz - 0.41)], 'dance')
    box(W((dx0 + dx1) / 2, 1.12, dz), (dx1 - dx0 + 0.1, 0.06, 0.9), 'chrome', bevel=0.02)
    for x in (dx0 + 0.8, dx1 - 0.8):
        cyl(W(x, 1.18, dz), 0.32, 0.05, 'rubber', verts=28)
        cyl(W(x, 1.21, dz), 0.1, 0.02, 'led_cyan', verts=16)
    box(W((dx0 + dx1) / 2, 1.2, dz), (0.7, 0.08, 0.45), 'rubber', bevel=0.02)
    box(W((dx0 + dx1) / 2 + 0.6, 1.4, dz + 0.25), (0.6, 0.4, 0.04), 'screen', bevel=0.01)
    SPOTS['dj'] = [[(dx0 + dx1) / 2, dz + 0.85]]
    # speaker stacks
    for x in (dx0 - 0.5, dx1 + 0.45):
        for k, (h, w) in enumerate(((1.0, 0.8), (0.8, 0.7))):
            yb = 0.5 if k == 0 else 1.4
            box(W(x, yb, dz + 0.2), (w, h, 0.7), 'tolex', bevel=0.05)
            gz = S(0, 0, dz + 0.2 - 0.36)[2]
            gx0, gx1 = S(x - w / 2 + 0.07, 0, 0)[0], S(x + w / 2 - 0.07, 0, 0)[0]
            gy0, gy1 = S(0, yb - h / 2 + 0.07, 0)[1], S(0, yb + h / 2 - 0.07, 0)[1]
            quad([(gx1, gy0, gz), (gx0, gy0, gz), (gx0, gy1, gz), (gx1, gy1, gz)], 'grille')
            cyl(W(x, yb, dz - 0.17), w * 0.3, 0.04, 'rubber', axis='z', verts=28)
            cyl(W(x, yb, dz - 0.2), w * 0.09, 0.04, 'chrome', axis='z', verts=16)
            torus(W(x, yb, dz - 0.19), w * 0.32, 0.025, 'led_cyan', axis='z')
    # disco ball under the overhang
    dbx, dby, dbz = W(0, 2.15, 4.6)
    cyl((dbx, dby + 0.45, dbz), 0.01, 0.5, 'chrome', verts=6)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=0.38, location=G(dbx, dby, dbz))
    ball = bpy.context.view_layer.objects.active
    _finish(ball, 'disco', smooth_angle=1, keep='disco_ball')

    SPOTS['dance'] = [[-1.2, -3.2], [1.2, -3.4], [-1.4, -0.9], [1.3, -0.8]]

    # --- planters, life rings, cleats and string lights ---
    palm_pot(W(6.0, 0, 1.3))
    palm_pot(W(-6.0, 0, -6.9), 0.9)
    palm_pot(W(6.0, 0, -6.9), 0.9)
    for s in (1, -1):
        torus(W(s * 6.45, 1.05, -0.5), 0.36, 0.1, 'lifering', axis='x', uv='ring')
        for z in (-7.5, 1.5):
            box(W(s * 6.3, 0.1, z), (0.12, 0.12, 0.5), 'chrome', bevel=0.03)
    # posts at the stern corners for the string lights
    posts = []
    for s in (1, -1):
        p = W(s * 6.35, 0, -8.6)
        cyl((p[0], p[1] + 1.9, p[2]), 0.07, 3.8, 'chrome', verts=12)
        sphere((p[0], p[1] + 3.85, p[2]), 0.12, 'gold')
        posts.append((p[0], p[1] + 3.75, p[2]))
    over = [W(s * 5.9, FLY - DECK - 0.4, 2.2) for s in (1, -1)]
    string_lights(posts[0], over[0], 0.35, 10)
    string_lights(posts[1], over[1], 0.35, 10)
    string_lights(posts[0], over[1], 0.9, 14)
    string_lights(posts[1], over[0], 0.9, 14)
    string_lights(posts[0], posts[1], 0.8, 12)
    bunting(over[0], over[1], 0.4, 18)

    # spots where the four teams' couples gather after the shuffle
    SPOTS['team'] = [
        [[2.9, -5.0], [4.4, -5.0], [3.2, -3.9], [4.7, -3.9]],     # team 0 (screen-left = +x): girl, girl, boy, boy
        [[-2.9, -5.0], [-4.4, -5.0], [-3.2, -3.9], [-4.7, -3.9]],
    ]
    SPOTS['turn'] = [-2.6, -5.2]
    SPOTS['center'] = [[1.1, -5.2], [-1.1, -5.2], [3.3, -5.2], [-3.3, -5.2], [1.1, -4.5], [-1.1, -4.5], [3.3, -4.5], [-3.3, -4.5]]


def build_flybridge():
    y = FLY
    # hot tub
    tx, tz = 0.0, -10.2
    cyl((tx, y + 0.27, tz), 2.15, 0.54, 'hull_white', verts=48, bevel=0.06)
    cyl((tx, y + 0.05, tz), 2.45, 0.1, 'teak', verts=48, bevel=0.03, uv=0.5)
    cyl((tx, y + 0.66, tz), 1.92, 0.05, 'tub_water', verts=48, keep='hot_tub_water')
    torus((tx, y + 0.66, tz), 2.02, 0.2, 'hull_white')
    torus((tx, y + 0.6, tz), 1.86, 0.035, 'led_cyan')
    for i in range(8):
        a = i / 8 * math.tau
        sphere((tx + math.cos(a) * 1.25, y + 0.72, tz + math.sin(a) * 1.25), 0.07, 'float_sprinkle', seg=8, rings=5)
    # sun pads around the tub
    for s in (1, -1):
        box((s * 4.4, y + 0.22, -10.0), (2.6, 0.44, 4.6), 'white', bevel=0.06)
        cushion((s * 4.4, y + 0.55, -10.0), (2.45, 0.25, 4.4), 'cushion_white', soft=0.12)
        cushion((s * 4.4, y + 0.82, -8.1), (2.3, 0.35, 0.7), 'cushion_teal' if s > 0 else 'cushion_coral', soft=0.12)
        quad([(s * 4.4 - 0.6, y + 0.69, -11.6), (s * 4.4 + 0.3, y + 0.69, -11.6), (s * 4.4 + 0.3, y + 0.69, -9.4), (s * 4.4 - 0.6, y + 0.69, -9.4)][::(1 if s > 0 else -1)], 'towel_coral' if s > 0 else 'towel_teal')
    # flybridge bar (under the hardtop) with stools
    box((-2.0, y + 0.55, -3.6), (4.0, 1.1, 0.75), 'fluted', bevel=0.04)
    box((-2.0, y + 1.13, -3.65), (4.2, 0.08, 1.0), 'marble', bevel=0.03, uv=0.7)
    box((-2.0, y + 0.08, -3.98), (4.0, 0.05, 0.04), 'led_cyan', bevel=0.01)
    for x in (-3.4, -2.0, -0.6):
        stool((x, y, -4.6))
    bottles(-3.6, -0.6, y + 1.17, -3.35, max_h=0.42, seed=11, kinds=['wine', 'champagne', 'tequila', 'rum', 'aperitivo', 'compitas', 'liqueur'])
    # lounge + table under the hardtop
    sofa((3.7, y, -2.0), 4.0, 1.1, '-x', accent=('cushion_yellow', 'cushion_coral'))
    cyl((2.3, y + 0.3, -2.0), 0.7, 0.6, 'wood', verts=28, bevel=0.03)
    # helm console with the wheel
    box((-2.6, y + 0.6, 0.2), (2.2, 1.2, 0.9), 'hull_white', bevel=0.08)
    box((-2.6, y + 1.25, 0.5), (1.9, 0.08, 0.5), 'screen', bevel=0.02)
    torus((-2.6, y + 1.45, -0.35), 0.38, 0.04, 'walnut', axis='z')
    cyl((-2.6, y + 1.45, -0.3), 0.06, 0.2, 'chrome', axis='z', verts=10)
    for x in (-3.2, -2.0):
        stool((x, y, -0.9))
    # plants
    palm_pot((5.3, y, -4.6), 0.8)
    palm_pot((-5.3, y, -6.4), 0.8)


def build_bow():
    y = DECK + 0.6
    # big bow sun pads (V shaped)
    for s in (1, -1):
        box((s * 1.7, y + 0.25, 15.5), (3.2, 0.5, 5.0), 'white', bevel=0.08)
        cushion((s * 1.7, y + 0.62, 15.5), (3.0, 0.28, 4.8), 'cushion_white', soft=0.13)
        for k, c in enumerate(('cushion_coral', 'cushion_teal')):
            cushion((s * (0.9 + k * 1.5), y + 0.95, 13.4), (1.2, 0.5, 0.35), c, soft=0.12)
        quad([(s * 1.7 - 0.6 * s, y + 0.77, 14.0), (s * 1.7 + 0.6 * s, y + 0.77, 14.0), (s * 1.7 + 0.6 * s, y + 0.77, 17.5), (s * 1.7 - 0.6 * s, y + 0.77, 17.5)][::(1 if s > 0 else -1)], 'towel_teal' if s > 0 else 'towel_coral')
    # bean bags
    for i, (x, z, c) in enumerate(((-2.5, 19.5, 'cushion_yellow'), (2.5, 19.5, 'cushion_pink'), (0, 20.4, 'cushion_teal'))):
        sphere((x, y + 0.42, z), 0.75, c, scale=(1, 0.6, 1))
    # anchor windlass, cleats
    cyl((0, y + 0.3, 22.0), 0.35, 0.6, 'chrome', verts=20)
    box((0, y + 0.1, 22.8), (0.4, 0.2, 1.2), 'chrome', bevel=0.05)
    for s in (1, -1):
        box((s * 2.2, y + 0.1, 21.2), (0.12, 0.12, 0.5), 'chrome', bevel=0.03)
    # anchor on the stem
    cyl((0, 2.6, BOW - 0.2), 0.08, 1.4, 'chrome', axis='y', verts=10)
    box((0, 1.95, BOW - 0.1), (0.9, 0.12, 0.12), 'chrome', bevel=0.03)
    # side fenders
    for s in (1, -1):
        for z in (-6, 0, 6):
            cyl((s * (BEAM + 0.15), 2.3, z), 0.22, 1.0, 'white', verts=16, bevel=0.1)


def build_floats():
    # pink flamingo float behind the yacht
    fx, fz = 3.0, TRANSOM - 9.0
    parts = [
        torus((fx, 0.25, fz), 1.15, 0.45, 'float_pink'),
        tube([(fx, 0.4, fz + 0.9), (fx, 1.4, fz + 1.1), (fx, 2.2, fz + 0.6), (fx, 2.4, fz + 0.0)], 0.2, 'float_pink'),
        sphere((fx, 2.45, fz - 0.05), 0.32, 'float_pink'),
        cyl((fx, 2.35, fz - 0.4), 0.12, 0.4, 'float_yellow', axis='z', verts=12, r2=0.05),
        sphere((fx + 0.2, 2.55, fz - 0.15), 0.05, 'dark'),
        sphere((fx - 0.2, 2.55, fz - 0.15), 0.05, 'dark'),
    ]
    for o in parts:
        PARTS.remove(o)
    select_only(parts)
    bpy.ops.object.join()
    fl = bpy.context.view_layer.objects.active
    fl.name = 'flamingo'
    NAMED['flamingo'] = fl
    # sprinkled donut float
    dx, dz = -4.0, TRANSOM - 6.5
    parts = [torus((dx, 0.22, dz), 0.95, 0.4, 'float_yellow')]
    for i in range(14):
        a = i / 14 * math.tau
        parts.append(box((dx + math.cos(a) * 0.95, 0.62, dz + math.sin(a) * 0.95), (0.18, 0.05, 0.06), ['cushion_pink', 'cushion_teal', 'float_sprinkle'][i % 3], bevel=0.02, rot_y=a))
    for o in parts:
        PARTS.remove(o)
    select_only(parts)
    bpy.ops.object.join()
    dn = bpy.context.view_layer.objects.active
    dn.name = 'donut'
    NAMED['donut'] = dn


def merge_static():
    """One mesh for everything static (exporter splits it into one primitive per material)."""
    objs = [o for o in PARTS if o.name in bpy.data.objects]
    select_only(objs)
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = 'yacht_body'
    return body


def build(out_dir):
    materials()
    build_hull()
    build_decks()
    build_stern()
    build_superstructure()
    build_rails()
    build_party_deck()
    build_flybridge()
    build_bow()
    build_floats()
    body = merge_static()
    print('yacht body polys', len(body.data.polygons), 'materials', len(body.data.materials))
    objs = [body] + list(NAMED.values())
    from common import export_glb
    export_glb(os.path.join(out_dir, '..', 'yacht.glb'), objs)
    layout = {
        'stage': STAGE,
        'deck': DECK,
        'flybridge': FLY,
        'spots': SPOTS,
    }
    with open(os.path.join(out_dir, '..', 'yacht-layout.json'), 'w') as f:
        json.dump(layout, f, indent=1)
