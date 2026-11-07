"""Sea creatures generated with fal (GPT Image 2 concept art -> Meshy v6 image-to-3D), prepared for the game.

    python tools/blender/creatures.py      -> public/models/creatures.glb   (then compress, see build step below)

In:  tools/creatures/<name>_src.glb  (raw Meshy output; see tools/creatures/concept.mjs + tools/characters/generate.mjs)
Out: one GLB with these nodes, all facing Blender +Y (= game -Z, the convention of props.glb):
  seagull (+ children seagull_wingL / seagull_wingR, pivots at the shoulders, so the cinematic can flap them)
  gull     – the quirky big-eyed gull that perches on the railings (origin between the feet)
  dorado, marlin, dolphin – origin at the centre of the body
"""
import math
import os
import sys

import bpy  # noqa: I001  (bpy must come first: it registers bmesh)
import bmesh
from mathutils import Matrix, Vector

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
SRC = os.path.join(ROOT, 'tools', 'creatures')
OUT = os.path.join(ROOT, 'public', 'models', 'creatures.glb')

# name: (turn about Z to face +Y, size, which dimension the size applies to, origin)
#   Meshy puts the front of the picture at -Y — and it turns side-profile fish to face the camera too (head at -Y).
SPEC = {
    'seagull': (math.pi, 3.9, 'x', 'center'),      # wingspan
    'gull': (math.pi, 0.8, 'z', 'feet'),           # standing height (characters are 2.0)
    'dorado': (math.pi, 1.1, 'y', 'center'),  # length
    'marlin': (math.pi, 4.6, 'y', 'center'),
    'dolphin': (math.pi, 4.2, 'y', 'center'),
}


def load(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, f'{name}_src.glb'))
    meshes = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    mw = obj.matrix_world.copy()
    obj.parent = None
    obj.data.transform(mw)
    obj.matrix_world = Matrix.Identity(4)
    for o in [o for o in bpy.data.objects if o not in before and o != obj]:
        bpy.data.objects.remove(o, do_unlink=True)
    # drop Meshy's all-black emissive map
    for mat in obj.data.materials:
        if mat and mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    for k in ('Emission Color', 'Emission'):
                        inp = node.inputs.get(k)
                        if inp:
                            for link in list(inp.links):
                                mat.node_tree.links.remove(link)
                            inp.default_value = (0, 0, 0, 1)
    turn, size, axis, origin = SPEC[name]
    obj.data.transform(Matrix.Rotation(turn, 4, 'Z'))
    vs = [v.co for v in obj.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    ext = {'x': hi.x - lo.x, 'y': hi.y - lo.y, 'z': hi.z - lo.z}[axis]
    s = size / ext
    c = (lo + hi) / 2
    if origin == 'feet':
        c.z = lo.z
    obj.data.transform(Matrix.Translation(-c))
    obj.data.transform(Matrix.Scale(s, 4))
    obj.data.update()
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.name = name
    print(name, 'size', {k: round(v * s, 2) for k, v in ext.items()} if False else round(size, 2), 'verts', len(obj.data.vertices))
    return obj


def cut(obj, plane_x, keep, name):
    """Copy of obj keeping only the side of the plane x = plane_x given by keep ('in' = toward 0, '+' or '-'), holes filled."""
    o = obj.copy()
    o.data = obj.data.copy()
    o.name = name
    bpy.context.scene.collection.objects.link(o)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    if keep == '+':
        res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(plane_x, 0, 0), plane_no=(1, 0, 0), clear_inner=True)
    elif keep == '-':
        res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(-plane_x, 0, 0), plane_no=(-1, 0, 0), clear_inner=True)
    else:
        res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(plane_x, 0, 0), plane_no=(1, 0, 0), clear_outer=True)
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        res2 = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(-plane_x, 0, 0), plane_no=(-1, 0, 0), clear_outer=True)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=0)
    bm.to_mesh(o.data)
    bm.free()
    return o


def split_wings(body):
    """Cut the flying gull's wings off at the shoulders so they can flap."""
    xs = [abs(v.co.x) for v in body.data.vertices]
    span = max(xs)
    # shoulder: where the body ends — the narrowest |x| at which the mesh gets very thin vertically
    w = span * 0.2
    wl = cut(body, w, '+', 'seagull_wingL')
    wr = cut(body, w, '-', 'seagull_wingR')
    core = cut(body, w, 'in', 'seagull_body')
    bpy.data.objects.remove(body, do_unlink=True)
    core.name = 'seagull'
    # wing pivots at the shoulders, at the height of the wing root
    for o, s in ((wl, 1), (wr, -1)):
        root = [v.co for v in o.data.vertices if abs(v.co.x - s * w) < 0.05] or [v.co for v in o.data.vertices]
        piv = Vector((s * w, sum(v.y for v in root) / len(root), sum(v.z for v in root) / len(root)))
        o.data.transform(Matrix.Translation(-piv))
        o.location = piv
        o.parent = core
    return core, wl, wr


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    names = [n for n in SPEC if os.path.exists(os.path.join(SRC, f'{n}_src.glb'))]
    objs = []
    for i, n in enumerate(names):
        o = load(n)
        if n == 'seagull':
            core, wl, wr = split_wings(o)
            core.location.x = i * 6
            objs += [core, wl, wr]
        else:
            o.location.x = i * 6
            objs.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True,
                              export_image_format='JPEG', export_jpeg_quality=90)
    print('exported', OUT, [o.name for o in objs])


if __name__ == '__main__':
    main()
