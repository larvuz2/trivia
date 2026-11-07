"""Props for the movie mode (main menu → 🎬): fishing rod, DJ headphones, drinks, phone, dorado, beach ball.

    python tools/blender/movie_props.py        -> public/models/movie_props.glb

Sizes are in game units (a character is 2.0 tall). Built Z-up in Blender; the glTF export turns Z into +Y.
Each prop is one named node with its origin where the game holds it:
  rod        – origin at the grip, rod along +Y (tip at ~+2.3)
  headphones – origin at the centre of the head, band over the top (+Y), cups at ±X
  cup / margarita / beer – origin at the bottom centre
  phone      – origin at the centre, screen facing +Z
  fish       – origin at the centre, nose along +X
  beach_ball – origin at the centre
"""
import math
import os

import bpy
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'models', 'movie_props.glb')
MATS = {}


def mat(name, color, rough=0.5, metal=0.0, emit=None):
    if name in MATS:
        return MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    c = tuple(int(color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    b.inputs['Base Color'].default_value = (*[x ** 2.2 for x in c], 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*[x ** 2.2 for x in c], 1)
        b.inputs['Emission Strength'].default_value = emit
    MATS[name] = m
    return m


def _set(o, material, smooth=True):
    o.data.materials.clear()
    o.data.materials.append(material)
    if smooth:
        for p in o.data.polygons:
            p.use_smooth = True
    return o


def cyl(loc, r1, r2, depth, material, verts=24, rot=(0, 0, 0), smooth=True):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    return _set(bpy.context.object, material, smooth)


def sphere(loc, r, material, scale=(1, 1, 1), seg=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=loc)
    o = bpy.context.object
    o.scale = scale
    return _set(o, material)


def box(loc, size, material, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    o = bpy.context.object
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    if bevel:
        mod = o.modifiers.new('b', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
    return _set(o, material, smooth=bool(bevel))


def torus(loc, R, r, material, rot=(0, 0, 0), major_seg=32, minor_seg=10):
    bpy.ops.mesh.primitive_torus_add(location=loc, rotation=rot, major_radius=R, minor_radius=r,
                                     major_segments=major_seg, minor_segments=minor_seg)
    return _set(bpy.context.object, material)


def poly(name, verts, faces, material):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return _set(o, material, smooth=False)


def group(name, parts):
    """Join parts into one object named `name` with transforms applied (origin stays at world 0)."""
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    return o


def place(o, x):
    """Spread props out along X so the file is easy to inspect (the game reads only the shapes)."""
    o.location.x += x
    return o


# ---------------------------------------------------------------- props (Blender Z = game up)
def rod():
    cork = mat('cork', '#c9a46a', 0.9)
    blank = mat('rod_blank', '#1c2b4a', 0.25, 0.3)
    chrome = mat('chrome', '#d9dde4', 0.15, 1.0)
    red = mat('reel_red', '#d8343c', 0.35, 0.2)
    parts = [
        cyl((0, 0, -0.32), 0.03, 0.03, 0.06, mat('rubber', '#222222', 0.8)),          # butt cap
        cyl((0, 0, -0.05), 0.026, 0.024, 0.5, cork),                                   # cork grip
        cyl((0, 0, 0.26), 0.021, 0.019, 0.12, chrome),                                 # reel seat
        cyl((0, 0, 1.25), 0.017, 0.004, 1.9, blank, verts=12),                         # blank (tapers to the tip)
        cyl((0, 0, 2.21), 0.006, 0.004, 0.04, mat('tip', '#ffd34d', 0.4), verts=8),    # tip top
    ]
    # spinning reel hanging below the seat
    parts += [
        cyl((0, -0.06, 0.24), 0.008, 0.008, 0.07, chrome, rot=(math.pi / 2, 0, 0), verts=10),
        cyl((0, -0.13, 0.27), 0.045, 0.045, 0.06, red, rot=(0, 0, 0), verts=24),
        cyl((0, -0.13, 0.31), 0.04, 0.03, 0.03, chrome, verts=24),
        cyl((0.06, -0.13, 0.25), 0.006, 0.006, 0.08, chrome, rot=(0, math.pi / 2, 0), verts=8),
        sphere((0.1, -0.13, 0.25), 0.014, mat('knob', '#111111', 0.6)),
    ]
    # line guides along the blank
    for i, z in enumerate((0.55, 0.9, 1.25, 1.6, 1.9, 2.1)):
        r = 0.03 - i * 0.004
        parts.append(torus((0, -r - 0.012, z), r, 0.003, chrome, rot=(0, math.pi / 2, 0), major_seg=16, minor_seg=6))
    return group('rod', parts)


def headphones():
    black = mat('hp_black', '#1b1d26', 0.35)
    teal = mat('hp_teal', '#14d0c8', 0.3, emit=0.6)
    cushion = mat('hp_cushion', '#3a3d4a', 0.9)
    R = 0.46
    bpy.ops.mesh.primitive_torus_add(location=(0, 0, 0), rotation=(math.pi / 2, 0, 0), major_radius=R, minor_radius=0.035,
                                     major_segments=40, minor_segments=10)
    band = _set(bpy.context.object, black)
    # keep only the top half of the band (z > -0.05)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for v in band.data.vertices:
        v.select = (band.matrix_world @ v.co).z < -0.05
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')
    parts = [band]
    for s in (1, -1):
        parts.append(cyl((s * R, 0, -0.05), 0.15, 0.15, 0.1, black, rot=(0, math.pi / 2, 0), verts=28))
        parts.append(cyl((s * (R - 0.06), 0, -0.05), 0.13, 0.12, 0.05, cushion, rot=(0, math.pi / 2, 0), verts=28))
        parts.append(torus((s * (R + 0.051), 0, -0.05), 0.1, 0.012, teal, rot=(0, math.pi / 2, 0)))
    return group('headphones', parts)


def cup():
    red = mat('cup_red', '#e2333c', 0.35)
    white = mat('cup_white', '#f4f1ea', 0.5)
    parts = [cyl((0, 0, 0.075), 0.045, 0.062, 0.15, red, verts=24)]
    parts.append(torus((0, 0, 0.15), 0.062, 0.006, white, major_seg=24, minor_seg=6))
    parts.append(cyl((0, 0, 0.138), 0.058, 0.058, 0.004, mat('beer_foam', '#f3e2a9', 0.6), verts=24))
    return group('cup', parts)


def margarita():
    glass = mat('glass', '#d8f3f0', 0.05)
    lime = mat('lime', '#7bc043', 0.5)
    parts = [
        cyl((0, 0, 0.004), 0.05, 0.05, 0.008, glass, verts=24),            # foot
        cyl((0, 0, 0.06), 0.006, 0.006, 0.11, glass, verts=12),            # stem
        cyl((0, 0, 0.135), 0.012, 0.08, 0.05, glass, verts=28),            # bowl
        cyl((0, 0, 0.152), 0.06, 0.06, 0.006, mat('margarita', '#c8f06a', 0.3, emit=0.15), verts=28),
        torus((0, 0, 0.16), 0.08, 0.006, mat('salt', '#ffffff', 0.9), major_seg=28, minor_seg=6),
        sphere((0.07, 0, 0.16), 0.028, lime, scale=(0.5, 1, 1)),
    ]
    return group('margarita', parts)


def beer():
    brown = mat('bottle_brown', '#6b3a12', 0.15)
    label = mat('beer_label', '#f5c542', 0.6)
    parts = [
        cyl((0, 0, 0.07), 0.033, 0.033, 0.14, brown, verts=20),
        cyl((0, 0, 0.165), 0.033, 0.012, 0.05, brown, verts=20),
        cyl((0, 0, 0.21), 0.012, 0.012, 0.04, brown, verts=12),
        cyl((0, 0, 0.07), 0.034, 0.034, 0.06, label, verts=20),
        cyl((0, 0, 0.233), 0.013, 0.013, 0.008, mat('cap_gold', '#d4a72c', 0.3, 0.8), verts=12),
        sphere((0.02, 0, 0.235), 0.018, mat('lime', '#7bc043', 0.5), scale=(0.6, 1, 1)),
    ]
    return group('beer', parts)


def phone():
    case = mat('phone_case', '#ff5fa2', 0.4)
    screen = mat('phone_screen', '#7fd6ff', 0.1, emit=1.2)
    parts = [box((0, 0, 0), (0.085, 0.012, 0.165), case, bevel=0.006)]
    parts.append(box((0, -0.0065, 0.004), (0.072, 0.002, 0.145), screen))
    parts.append(cyl((0.025, 0.0075, 0.06), 0.008, 0.008, 0.004, mat('lens', '#111111', 0.1), rot=(math.pi / 2, 0, 0), verts=12))
    o = group('phone', parts)
    return o


def fish():
    """A dorado (mahi-mahi), the classic Sea of Cortez catch: green-gold, blunt head, long dorsal fin."""
    body = mat('dorado', '#3fbf6a', 0.3, 0.2)
    belly = mat('dorado_belly', '#f2d23c', 0.35, 0.1)
    fin = mat('dorado_fin', '#2a8fd8', 0.4)
    parts = [
        sphere((0, 0, 0), 0.26, body, scale=(1.0, 0.32, 0.42)),
        sphere((0.02, 0, -0.045), 0.24, belly, scale=(0.95, 0.3, 0.32)),
        sphere((0.2, 0, 0.02), 0.11, body, scale=(0.9, 0.55, 0.95)),    # blunt head
        sphere((0.25, 0.045, 0.04), 0.022, mat('eye', '#101010', 0.2)),
        sphere((0.25, -0.045, 0.04), 0.022, mat('eye', '#101010', 0.2)),
    ]
    parts.append(poly('tail', [(-0.24, 0, 0), (-0.4, 0, 0.16), (-0.34, 0, 0), (-0.4, 0, -0.16)], [(0, 1, 2), (0, 2, 3)], fin))
    parts.append(poly('dorsal', [(0.18, 0, 0.1), (-0.2, 0, 0.08), (0.1, 0, 0.2), (-0.15, 0, 0.14)], [(0, 2, 3, 1)], fin))
    o = group('fish', parts)
    o.modifiers.new('solid', 'SOLIDIFY').thickness = 0.01
    return o


def beach_ball():
    cols = ['#ff4d5e', '#ffffff', '#ffd34d', '#ffffff', '#2fa8ff', '#ffffff']
    bpy.ops.mesh.primitive_uv_sphere_add(segments=36, ring_count=18, radius=0.24, location=(0, 0, 0))
    o = bpy.context.object
    o.data.materials.clear()
    for i, c in enumerate(cols):
        o.data.materials.append(mat(f'ball_{i}', c, 0.35))
    for p in o.data.polygons:
        a = math.atan2(p.center.y, p.center.x) % math.tau
        p.material_index = int(a / math.tau * 6) % 6
        p.use_smooth = True
    o.name = 'beach_ball'
    return o


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = [rod(), headphones(), cup(), margarita(), beer(), phone(), fish(), beach_ball()]
    for i, o in enumerate(objs):
        place(o, i * 0.8)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=True)
    print('exported', OUT, [o.name for o in objs])


if __name__ == '__main__':
    main()
