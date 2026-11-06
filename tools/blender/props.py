"""Hand-built stylized props for the Sea of Cortez. All exported into one props.glb,
one root node per prop (origin at its base / waterline), so the game can clone them by name.
Props are modelled in Blender space (Z-up); the glTF exporter converts to Y-up."""
import math
import os
import random
import sys

import bpy

sys.path.insert(0, os.path.dirname(__file__))
from common import (paint, hex_rgb, mix, scale_col, export_glb, flat, apply_modifiers, join, select_only,  # noqa: E402
                    vcol_material)

R = random.Random(9)


def ob():
    return bpy.context.view_layer.objects.active


def apply_tf(o):
    select_only([o])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def sphere(loc, scale, seg=12, rings=8, name='s'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=loc)
    o = ob()
    o.scale = scale
    o.name = name
    apply_tf(o)
    return o


def ico(loc, scale, sub=2, name='i'):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, location=loc)
    o = ob()
    o.scale = scale
    o.name = name
    apply_tf(o)
    return o


def cyl(loc, r, depth, verts=10, rot=(0, 0, 0), r2=None, name='c'):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = ob()
    o.name = name
    apply_tf(o)
    return o


def cube(loc, scale, rot=(0, 0, 0), name='b'):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o = ob()
    o.scale = scale
    o.name = name
    apply_tf(o)
    return o


def tube(points, radii, verts=8, name='tube'):
    """Smooth tube through a polyline (Blender coords) with per-point radius."""
    import bmesh
    from mathutils import Vector
    bm = bmesh.new()
    rings = []
    pts = [Vector(p) for p in points]
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        side = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.95 else Vector((1, 0, 0))).normalized()
        up = side.cross(d).normalized()
        ring = []
        for k in range(verts):
            a = k / verts * math.tau
            ring.append(bm.verts.new(p + (side * math.cos(a) + up * math.sin(a)) * radii[i]))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for k in range(verts):
            bm.faces.new((a[k], a[(k + 1) % verts], b[(k + 1) % verts], b[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    return o


def noise_tex(name, kind='CLOUDS', size=0.6, depth=2):
    t = bpy.data.textures.get(name) or bpy.data.textures.new(name, kind)
    t.noise_scale = size
    if hasattr(t, 'noise_depth'):
        t.noise_depth = depth
    return t


def rockify(o, voxel=0.5, disp=1.0, size=2.0, ratio=0.12, seed=0):
    """Fuse, roughen and facet a blocky shape into a stylized low-poly rock."""
    m = o.modifiers.new('rm', 'REMESH')
    m.mode = 'VOXEL'
    m.voxel_size = voxel
    d = o.modifiers.new('dp', 'DISPLACE')
    d.texture = noise_tex(f'n{seed}', size=size)
    d.strength = disp
    d.mid_level = 0.5
    dec = o.modifiers.new('dc', 'DECIMATE')
    dec.ratio = ratio
    apply_modifiers(o)
    flat(o)
    return o


def boolean(o, cutter, op='DIFFERENCE'):
    m = o.modifiers.new('bool', 'BOOLEAN')
    m.object = cutter
    m.operation = op
    apply_modifiers(o)
    bpy.data.objects.remove(cutter, do_unlink=True)


def jitter(seed):
    r = random.Random(seed)
    return lambda: 0.93 + r.random() * 0.12


def finish(o, name):
    o.name = name
    o.data.name = name
    if not o.data.materials:
        o.data.materials.append(vcol_material())
    return o


# ---------------------------------------------------------------- rocks
def make_arch():
    # El Arco style: a tall, thin granite fin with a big opening at the waterline,
    # crowned by pointy peaks, with a few sea stacks beside it.
    body = ico((0, 0, 12), (13, 4.2, 13), sub=3)
    crown = ico((-4, 0, 22), (6, 3.6, 9), sub=2)
    crown2 = ico((6, 0.5, 20), (4.5, 3.2, 7), sub=2)
    body = join([body, crown, crown2], 'arch_body')
    cut = cyl((1.0, 0, 4.5), 6.2, 30, verts=28, rot=(math.radians(90), 0, 0))
    cut.scale = (0.95, 1.0, 1)
    apply_tf(cut)
    for v in cut.data.vertices:  # gothic-ish pointed top on the opening
        if v.co.z > 4.5:
            v.co.z = 4.5 + (v.co.z - 4.5) * 1.55
    boolean(body, cut)
    rockify(body, voxel=0.6, disp=1.6, size=2.5, ratio=0.12, seed=1)
    pin = ico((16, 2.5, 9), (3.0, 2.8, 10), sub=2)
    rockify(pin, voxel=0.45, disp=1.1, size=1.5, ratio=0.25, seed=2)
    pin2 = ico((21, -1.5, 5.5), (2.2, 2, 6.5), sub=2)
    rockify(pin2, voxel=0.45, disp=0.9, size=1.2, ratio=0.3, seed=3)
    pin3 = ico((-15, 2, 4), (2.6, 2.4, 5), sub=2)
    rockify(pin3, voxel=0.45, disp=0.9, size=1.2, ratio=0.3, seed=5)
    o = join([body, pin, pin2, pin3], 'arch')
    G = [hex_rgb('#f2e4cc'), hex_rgb('#e2cfae'), hex_rgb('#d4bd98')]
    j = jitter(1)

    def fn(c, n, p):
        y = c[1]
        base = G[int((y + 2) / 3.5) % 3]
        if y < 1.2:
            base = mix(hex_rgb('#8f8a6e'), base, max(0, y) / 1.2)  # wet / algae line
        return scale_col(base, j() * (0.78 + 0.22 * max(0, n[1] + 0.3)))
    paint(o, fn=fn)
    return finish(o, 'arch')


def make_hongo():
    stem = cyl((0, 0, 3.4), 1.9, 6.8, verts=12, r2=0.95)
    cap = sphere((0, 0, 7.1), (4.4, 3.9, 1.3), seg=16, rings=8)
    base = ico((0, 0, 0.3), (3.4, 3, 1.4), sub=2)
    o = join([stem, cap, base], 'hongo')
    rockify(o, voxel=0.28, disp=0.55, size=0.8, ratio=0.12, seed=4)
    bands = [hex_rgb(c) for c in ['#c45f3c', '#d9825a', '#b04f36', '#e39a6c']]
    j = jitter(2)
    paint(o, fn=lambda c, n, p: scale_col(bands[int(c[1] / 0.9) % 4], j() * (0.85 + 0.15 * max(0, n[1]))))
    return finish(o, 'hongo')


def make_boulder(name, palette, seed):
    o = ico((0, 0, 0.8), (2.2, 1.8, 1.5), sub=2)
    rockify(o, voxel=0.25, disp=0.8, size=0.9, ratio=0.15, seed=seed)
    j = jitter(seed)
    pal = [hex_rgb(c) for c in palette]
    paint(o, fn=lambda c, n, p: scale_col(pal[int(c[1] * 2 + c[0]) % len(pal)], j() * (0.8 + 0.2 * max(0, n[1]))))
    return finish(o, name)


# ---------------------------------------------------------------- plants
def ribbed(loc, r, h, verts=14, name='rib'):
    """Ribbed column (cactus): alternate vertex radius, rounded top."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=(loc[0], loc[1], loc[2] + h / 2))
    o = ob()
    apply_tf(o)
    for v in o.data.vertices:
        ang = math.atan2(v.co.y - loc[1], v.co.x - loc[0])
        k = 0.8 if (round((ang + math.pi) / (2 * math.pi) * verts) % 2) else 1.0
        v.co.x = loc[0] + (v.co.x - loc[0]) * k
        v.co.y = loc[1] + (v.co.y - loc[1]) * k
    top = sphere((loc[0], loc[1], loc[2] + h), (r * 0.95, r * 0.95, r * 0.85), seg=verts, rings=5)
    return join([o, top], name)


def make_cardon(name, arms, seed):
    r = random.Random(seed)
    trunk_h = r.uniform(7, 9.5)
    parts = [ribbed((0, 0, 0), 0.55, trunk_h)]
    for i in range(arms):
        a = (i / max(1, arms)) * math.tau + r.uniform(-0.4, 0.4)
        z0 = r.uniform(2.2, 4.2)
        out = r.uniform(0.9, 1.4)
        dx, dy = math.cos(a), math.sin(a)
        # elbow going out, then up
        elbow = sphere((dx * out * 0.5, dy * out * 0.5, z0), (out * 0.55, 0.42, 0.42), seg=10, rings=6)
        elbow.rotation_euler = (0, 0, a)
        apply_tf(elbow)
        up_h = r.uniform(2.5, trunk_h - z0 - 0.5)
        parts += [elbow, ribbed((dx * out, dy * out, z0), 0.42, up_h)]
    o = join(parts, name)
    flat(o)
    G1, G2, TIP = hex_rgb('#5d9a52'), hex_rgb('#4a8446'), hex_rgb('#8fbf6a')
    j = jitter(seed)

    def fn(c, n, p):
        col = G1 if (p.index % 2) else G2
        if n[1] > 0.6:
            col = TIP
        return scale_col(col, j())
    paint(o, fn=fn)
    return finish(o, name)


def make_shrub(name, seed):
    r = random.Random(seed)
    parts = [ico((r.uniform(-0.6, 0.6), r.uniform(-0.6, 0.6), 0.6), (r.uniform(0.7, 1.2),) * 2 + (0.7,), sub=1) for _ in range(3)]
    o = join(parts, name)
    flat(o)
    pal = [hex_rgb('#8f9a52'), hex_rgb('#a3a35e'), hex_rgb('#76884a')]
    j = jitter(seed)
    paint(o, fn=lambda c, n, p: scale_col(pal[p.index % 3], j()))
    return finish(o, name)


def make_palm():
    h = 10.5
    pts = [(0.06 * ((i * h / 8) ** 1.3), 0, i * h / 8) for i in range(9)]
    parts = [tube(pts, [0.5 - i * 0.025 for i in range(9)], verts=9, name='trunk')]
    topx = 0.06 * (h ** 1.3)
    skirt = cyl((topx, 0, h - 1.2), 0.75, 2.0, verts=10, r2=0.5)
    parts.append(skirt)
    leaves = []
    for k in range(11):
        a = k / 11 * math.tau
        tilt = math.radians(R.uniform(15, 55))
        # fan leaf = flattened half disc
        bpy.ops.mesh.primitive_circle_add(vertices=12, radius=3.1, fill_type='TRIFAN', location=(0, 0, 0))
        leaf = ob()
        for v in leaf.data.vertices:
            if v.co.y < 0:
                v.co.y = 0
            v.co.z = 0.25 * math.sin(v.co.x * 2.2)  # pleats
        leaf.location = (topx + math.cos(a) * 0.5, math.sin(a) * 0.5, h + 0.1)
        leaf.rotation_euler = (tilt, 0, a - math.pi / 2)
        apply_tf(leaf)
        leaves.append(leaf)
    trunk = join(parts, 'palm_trunk')
    crown = join(leaves, 'palm_crown')
    paint(trunk, fn=lambda c, n, p: scale_col(hex_rgb('#8a6a4a') if c[1] < h - 2.2 else hex_rgb('#a7865a'), 0.92 + (p.index % 3) * 0.05))
    paint(crown, fn=lambda c, n, p: scale_col(hex_rgb('#4f9a4f') if p.index % 2 else hex_rgb('#62ad58'), 1.0))
    o = join([trunk, crown], 'palm')
    flat(o)
    return finish(o, 'palm')


# ---------------------------------------------------------------- beach
def make_palapa():
    post = cyl((0, 0, 1.4), 0.12, 2.8, verts=6)
    roof = cyl((0, 0, 2.95), 2.7, 1.5, verts=9, r2=0.05)
    fringe = cyl((0, 0, 2.15), 2.75, 0.3, verts=9, r2=2.6)
    towel = cube((1.4, 0.6, 0.03), (0.55, 0.9, 0.02), rot=(0, 0, 0.3))
    chair = cube((-1.3, 0.4, 0.3), (0.35, 0.8, 0.06), rot=(0.35, 0, -0.2))
    o = join([post, roof, fringe, towel, chair], 'palapa')
    flat(o)
    STRAW, STRAW2 = hex_rgb('#d9b56c'), hex_rgb('#c49a52')

    def fn(c, n, p):
        if c[1] < 0.1 and abs(c[0] - 1.4) < 1 and abs(c[2] + 0.6) < 1.2:
            return hex_rgb('#ff6b8b')
        if c[1] < 0.8:
            return hex_rgb('#3fb6c9')
        if c[1] < 2.4 and c[1] > 1.95:
            return STRAW2
        return STRAW if c[1] > 2.0 else hex_rgb('#8a6a4a')
    paint(o, fn=fn)
    return finish(o, 'palapa')


def make_panga():
    """Classic Baja fishing panga: white hull, blue sheer stripe, outboard."""
    L, W, D = 7.2, 1.9, 0.95
    import bmesh
    bm = bmesh.new()
    sections = []
    n = 12
    for i in range(n + 1):
        t = i / n
        y = -L / 2 + t * L
        bow = max(0.0, (t - 0.62) / 0.38)
        w = W / 2 * (1 - bow ** 1.6) * (0.9 + 0.1 * (1 - t)) + 0.02
        top = D * (1 + 0.35 * bow ** 2)
        keel = -0.15 * (1 - abs(t - 0.45) * 1.4)
        ring = [bm.verts.new((-w, y, top)), bm.verts.new((-w * 0.85, y, top * 0.35)), bm.verts.new((0, y, keel)),
                bm.verts.new((w * 0.85, y, top * 0.35)), bm.verts.new((w, y, top))]
        sections.append(ring)
    for a, b in zip(sections, sections[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
    bm.faces.new(list(reversed(sections[0])))  # transom
    me = bpy.data.meshes.new('panga')
    bm.to_mesh(me)
    hull = bpy.data.objects.new('panga_hull', me)
    bpy.context.scene.collection.objects.link(hull)
    solid = hull.modifiers.new('s', 'SOLIDIFY')
    solid.thickness = 0.08
    apply_modifiers(hull)
    seat = cube((0, 0.3, 0.55), (0.85, 0.18, 0.05))
    seat2 = cube((0, -1.8, 0.55), (0.85, 0.18, 0.05))
    motor = cube((0, -L / 2 - 0.2, 0.95), (0.16, 0.2, 0.32))
    shaft = cube((0, -L / 2 - 0.3, 0.1), (0.07, 0.07, 0.5))
    o = join([hull, seat, seat2, motor, shaft], 'panga')
    flat(o)
    WHITE, BLUE, RED, IN = hex_rgb('#f7f4ee'), hex_rgb('#2f7fd0'), hex_rgb('#e2553f'), hex_rgb('#d9e2e8')

    def fn(c, n, p):
        x, y, z = c
        if z > L / 2 + 0.05:
            return hex_rgb('#2a2d38')
        if abs(y - 0.55) < 0.08 and n[1] > 0.7:
            return hex_rgb('#c08550')  # seats
        outward = (x * n[0]) > 0 or n[1] < -0.3
        if not outward:
            return IN
        if y < 0.28:
            return RED
        if y > 0.72:
            return BLUE
        return WHITE
    paint(o, fn=fn)
    return finish(o, 'panga')


def make_kayak():
    hull = sphere((0, 0, 0.12), (0.42, 2.0, 0.22), seg=12, rings=8)
    pit = cyl((0, 0.05, 0.3), 0.27, 0.06, verts=10)
    body = cyl((0, 0.05, 0.62), 0.2, 0.62, verts=8, r2=0.17)
    head = sphere((0, 0.05, 1.08), (0.17, 0.17, 0.18), seg=10, rings=6)
    hat = cyl((0, 0.05, 1.22), 0.26, 0.05, verts=10)
    paddle = cube((0, 0.15, 0.78), (1.15, 0.03, 0.03), rot=(0, 0.3, 0))
    blades = [cube((s * 1.15, 0.15, 0.78 + s * 0.35), (0.06, 0.12, 0.22), rot=(0, 0.3, 0)) for s in (-1, 1)]
    o = join([hull, pit, body, head, hat, paddle] + blades, 'kayak')
    flat(o)

    def fn(c, n, p):
        x, y, z = c
        if y < 0.36:
            return hex_rgb('#ffb020') if y > 0.12 or n[1] > -0.2 else hex_rgb('#e8901a')
        if y > 1.18:
            return hex_rgb('#f2e6c8')
        if y > 0.92:
            return hex_rgb('#e0ac85')
        if abs(x) > 0.5:
            return hex_rgb('#ff5a5a')
        return hex_rgb('#3d8bfd')
    paint(o, fn=fn)
    return finish(o, 'kayak')


# ---------------------------------------------------------------- animals
def make_pelican():
    body = sphere((0, 0, 0), (0.5, 1.05, 0.45), seg=12, rings=8)
    neck = sphere((0, 0.95, 0.35), (0.18, 0.25, 0.35), seg=8, rings=6)
    head = sphere((0, 1.15, 0.62), (0.22, 0.3, 0.2), seg=10, rings=6)
    beak = cyl((0, 1.85, 0.52), 0.11, 1.3, verts=6, r2=0.03, rot=(math.radians(-96), 0, 0))
    pouch = sphere((0, 1.65, 0.38), (0.11, 0.5, 0.12), seg=8, rings=5)
    tail = cyl((0, -1.15, 0.05), 0.3, 0.5, verts=6, r2=0.05, rot=(math.radians(95), 0, 0))
    b = join([body, neck, head, beak, pouch, tail], 'pelican')
    flat(b)

    def fn(c, n, p):
        x, y, z = c
        if z < -1.3:
            return hex_rgb('#f0a24a')
        if y > 0.45 and z < -0.9:
            return hex_rgb('#f6efd8')
        return hex_rgb('#7d7f8c') if n[1] > -0.2 else hex_rgb('#5f6170')
    paint(b, fn=fn)
    finish(b, 'pelican')
    wings = []
    for s, nm in ((1, 'pelican_wingL'), (-1, 'pelican_wingR')):
        w = cube((s * 1.45, 0.05, 0.05), (1.3, 0.45, 0.05))
        for v in w.data.vertices:  # taper, sweep back and droop toward the tip
            k = abs(v.co.x) / 2.75
            v.co.y = v.co.y * (1 - 0.7 * k) - 0.55 * k * k
            v.co.z -= 0.25 * k * k
        flat(w)
        paint(w, fn=lambda c, n, p: hex_rgb('#6b6d7a') if abs(c[0]) < 2.0 else hex_rgb('#3c3e4a'))
        w = finish(w, nm)
        w.parent = b
        wings.append(w)
    # origins of wings at the shoulder so they can flap
    for w, s in zip(wings, (1, -1)):
        select_only([w])
        bpy.context.scene.cursor.location = (s * 0.3, 0, 0.1)
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = (0, 0, 0)
    return b, wings


def make_seagull():
    """Yellow-footed gull (the Sea of Cortez gull): white body, slate wings with black tips."""
    body = sphere((0, 0, 0), (0.32, 0.75, 0.3), seg=12, rings=8)
    head = sphere((0, 0.72, 0.22), (0.22, 0.24, 0.21), seg=10, rings=7)
    beak = cyl((0, 1.02, 0.18), 0.06, 0.32, verts=6, r2=0.015, rot=(math.radians(-95), 0, 0))
    tail = cyl((0, -0.85, 0.02), 0.22, 0.4, verts=6, r2=0.04, rot=(math.radians(95), 0, 0))
    eyes = [sphere((s * 0.13, 0.82, 0.3), (0.035, 0.035, 0.035), seg=6, rings=4) for s in (-1, 1)]
    b = join([body, head, beak, tail] + eyes, 'seagull')
    flat(b)

    def fn(c, n, p):
        x, y, z = c
        if z < -0.92:
            return hex_rgb('#ffcc33')
        if abs(x) > 0.1 and y > 0.24 and z < -0.75 and abs(x) < 0.17:
            return hex_rgb('#1d1d24')
        if z > 1.0:
            return hex_rgb('#c9ced6')
        return hex_rgb('#fbfbf7') if n[1] > -0.5 else hex_rgb('#e9ecef')
    paint(b, fn=fn)
    finish(b, 'seagull')
    wings = []
    for s, nm in ((1, 'seagull_wingL'), (-1, 'seagull_wingR')):
        w = cube((s * 1.0, -0.05, 0.08), (0.9, 0.34, 0.04))
        for v in w.data.vertices:
            k = abs(v.co.x) / 2.0
            v.co.y = v.co.y * (1 - 0.6 * k) - 0.45 * k * k
            v.co.z += 0.1 * math.sin(k * math.pi)
        flat(w)
        paint(w, fn=lambda c, n, p: hex_rgb('#1d1d24') if abs(c[0]) > 1.55 else hex_rgb('#8a93a3') if n[1] > 0 else hex_rgb('#f2f2ee'))
        w = finish(w, nm)
        w.parent = b
        wings.append(w)
    for w, s in zip(wings, (1, -1)):
        select_only([w])
        bpy.context.scene.cursor.location = (s * 0.2, 0, 0.1)
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = (0, 0, 0)
    return b, wings


def make_sealion():
    body = sphere((0, 0, 0.55), (0.65, 1.2, 0.5), seg=12, rings=8)
    chest = sphere((0, 0.75, 0.9), (0.5, 0.5, 0.6), seg=12, rings=8)
    neck = sphere((0, 0.95, 1.35), (0.33, 0.33, 0.45), seg=10, rings=6)
    head = sphere((0, 1.1, 1.8), (0.3, 0.38, 0.28), seg=10, rings=6)
    snout = sphere((0, 1.45, 1.75), (0.15, 0.2, 0.13), seg=8, rings=5)
    tail = cyl((0, -1.35, 0.25), 0.35, 0.7, verts=6, r2=0.08, rot=(math.radians(90), 0, 0))
    fl = [cube((s * 0.75, 0.85, 0.15), (0.45, 0.25, 0.04), rot=(0, 0, s * 0.4)) for s in (-1, 1)]
    o = join([body, chest, neck, head, snout, tail] + fl, 'sealion')
    flat(o)

    def fn(c, n, p):
        x, y, z = c
        if z < -1.55:
            return hex_rgb('#2d211a')
        return hex_rgb('#8a6448') if n[1] > -0.1 else hex_rgb('#6e4d38')
    paint(o, fn=fn)
    return finish(o, 'sealion')


def make_dolphin():
    body = sphere((0, 0, 0), (0.55, 2.0, 0.6), seg=14, rings=9)
    # taper the tail end
    for v in body.data.vertices:
        if v.co.y < 0:
            k = 1 + v.co.y / 2.0 * 0.75
            v.co.x *= k
            v.co.z *= k
    beak = cyl((0, 2.15, -0.1), 0.16, 0.6, verts=8, r2=0.06, rot=(math.radians(-90), 0, 0))
    fin = cube((0, -0.1, 0.65), (0.05, 0.35, 0.35), rot=(math.radians(-35), 0, 0))
    fluke = cube((0, -2.05, 0), (0.8, 0.2, 0.04))
    for v in fluke.data.vertices:  # swept-back V
        v.co.y -= abs(v.co.x) * 0.45
        if abs(v.co.x) > 0.5:
            v.co.y += 0.12 if v.co.y > -2.2 else 0
    flips = [cube((s * 0.55, 0.7, -0.35), (0.35, 0.18, 0.03), rot=(0, s * 0.5, s * 0.6)) for s in (-1, 1)]
    o = join([body, beak, fin, fluke] + flips, 'dolphin')
    flat(o)
    paint(o, fn=lambda c, n, p: hex_rgb('#6f8fae') if n[1] > -0.25 else hex_rgb('#dfe9f0'))
    return finish(o, 'dolphin')


def build(out_dir):
    objs = [
        make_arch(),
        make_hongo(),
        make_boulder('boulder_red', ['#c8653d', '#d98a5a', '#b5523a'], 31),
        make_boulder('boulder_gray', ['#d8cdbb', '#c4b49c', '#e6dccb'], 32),
        make_cardon('cardon_a', 2, 41),
        make_cardon('cardon_b', 4, 42),
        make_cardon('cardon_c', 0, 43),
        make_shrub('shrub', 44),
        make_palm(),
        make_palapa(),
        make_panga(),
        make_kayak(),
        make_sealion(),
        make_dolphin(),
    ]
    pel, wings = make_pelican()
    gull, gwings = make_seagull()
    # spread the props out in the file so they're easy to inspect in Blender (game re-positions them)
    for i, o in enumerate(objs + [pel, gull]):
        o.location = (i * 30, 0, 0)
    export_glb(os.path.join(out_dir, 'props.glb'), objs + [pel, gull] + wings + gwings)
    for o in objs + [pel, gull]:
        print(o.name, len(o.data.polygons))
