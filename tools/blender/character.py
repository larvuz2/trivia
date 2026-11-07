"""Rig + animate a Meshy character for Compitas Trivia.

    python tools/blender/character.py tools/characters/joe_src.glb public/models/characters/joe.glb [--facing -y]

Every character goes through the same pipeline so they all share:
  * the same height (2.0 units, feet at y = 0, facing +z in game space),
  * the same skeleton (bone names, rest orientations and proportional joint heights),
so every animation clip works on every character.

Clips: idle, idle2, excited, dance, wave, walk, sit. The head is skinned rigidly to the head bone,
so the face/expression never deforms.

Coordinates: we think in GAME space (three.js Y-up, x = character's left, z = forward).
G() converts to Blender (Z-up).
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

HEIGHT = 2.0
FPS = 30


def G(x, y, z):
    return Vector((x, -z, y))


def GA(v):
    """game-space axis tuple -> Blender vector"""
    return G(*v).normalized()


# --------------------------------------------------------------------------- import + normalise
def load(path, facing):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    # bake the imported transform into the mesh, then turn so the character faces game +z (= Blender -y)
    mw = obj.matrix_world.copy()
    obj.parent = None
    obj.data.transform(mw)
    obj.matrix_world = Matrix.Identity(4)
    turn = {'+x': -math.pi / 2, '-x': math.pi / 2, '+y': math.pi, '-y': 0.0}[facing]
    obj.data.transform(Matrix.Rotation(turn, 4, 'Z'))
    ws = [v.co for v in obj.data.vertices]
    zmin, zmax = min(v.z for v in ws), max(v.z for v in ws)
    s = HEIGHT / (zmax - zmin)
    cx = sum(v.x for v in ws) / len(ws)
    cy = sum(v.y for v in ws) / len(ws)
    for v in obj.data.vertices:
        v.co = Vector(((v.co.x - cx) * s, (v.co.y - cy) * s, (v.co.z - zmin) * s))
    obj.data.update()
    obj.name = 'body'
    # Meshy ships an all-black emissive texture: drop it (22 MB of GPU memory for nothing)
    for mat in obj.data.materials:
        if not mat or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED':
                for name in ('Emission Color', 'Emission'):
                    inp = node.inputs.get(name)
                    if inp:
                        for link in list(inp.links):
                            mat.node_tree.links.remove(link)
                        inp.default_value = (0, 0, 0, 1)
                if node.inputs.get('Emission Strength'):
                    node.inputs['Emission Strength'].default_value = 0.0
    return obj


def measure(obj):
    """Find the T-pose arm height, hand reach and torso half-width (game space)."""
    pts = [(v.co.x, v.co.z, -v.co.y) for v in obj.data.vertices]  # game x, y, z
    bands = {}
    for x, y, z in pts:
        k = round(y / 0.02)
        bands[k] = max(bands.get(k, 0), abs(x))
    k_arm = max(bands, key=lambda k: bands[k])
    arm_y = k_arm * 0.02
    reach = bands[k_arm]
    # torso half width: lateral extent a bit below the armpits
    torso = [abs(x) for x, y, z in pts if abs(y - (arm_y - 0.16)) < 0.03]
    torso.sort()
    torso_w = torso[int(len(torso) * 0.97)] if torso else 0.3
    # neck: the narrowest slice between the shoulders and the head (front-to-back centre only,
    # so a collar or hair hanging behind doesn't count). Proportions differ per character.
    best = None
    for k in range(int((arm_y + 0.05) / 0.02), int((arm_y + 0.21) / 0.02) + 1):  # long hair hides higher necks
        y = k * 0.02
        xs = sorted(abs(x) for x, yy, z in pts if abs(yy - y) < 0.012)
        if len(xs) < 20:
            continue
        w = xs[int(len(xs) * 0.95)]
        if best is None or w < best[1]:
            best = (y, w)
    neck_y = best[0] if best else 0.52 * HEIGHT
    neck_y = max(arm_y + 0.06, neck_y)
    return {'arm_y': arm_y, 'reach': reach, 'torso_w': torso_w, 'neck_y': neck_y}


# --------------------------------------------------------------------------- skeleton
def joints(m):
    """The shared skeleton, proportional to HEIGHT; arms follow the measured T-pose."""
    H = HEIGHT
    ay = m['arm_y']
    sx = m['torso_w'] * 0.62
    rx = m['reach']
    j = {
        'hips': ((0, 0.27 * H, 0), (0, 0.33 * H, 0)),
        'spine': ((0, 0.33 * H, 0), (0, 0.40 * H, 0)),
        'chest': ((0, 0.40 * H, 0), (0, ay + 0.02, 0)),
        'neck': ((0, ay + 0.02, 0), (0, m['neck_y'], 0)),
        'head': ((0, m['neck_y'], 0), (0, 0.98 * H, 0)),
    }
    for side, s in (('L', 1), ('R', -1)):
        u0 = sx + (rx - sx) * 0.0
        e = sx + (rx - sx) * 0.42
        w = sx + (rx - sx) * 0.78
        j[f'shoulder.{side}'] = ((s * 0.04, ay, 0), (s * sx, ay, 0))
        j[f'upperarm.{side}'] = ((s * u0, ay, 0), (s * e, ay, 0))
        j[f'forearm.{side}'] = ((s * e, ay, 0), (s * w, ay, 0))
        j[f'hand.{side}'] = ((s * w, ay, 0), (s * rx, ay, 0))
        lx = 0.075 * H
        j[f'thigh.{side}'] = ((s * lx, 0.27 * H, 0), (s * lx, 0.15 * H, 0.01))
        j[f'shin.{side}'] = ((s * lx, 0.15 * H, 0.01), (s * lx, 0.04 * H, 0))
        j[f'foot.{side}'] = ((s * lx, 0.04 * H, 0), (s * lx, 0.01 * H, 0.09 * H))
    return j


PARENT = {
    'spine': 'hips', 'chest': 'spine', 'neck': 'chest', 'head': 'neck',
    'shoulder.L': 'chest', 'upperarm.L': 'shoulder.L', 'forearm.L': 'upperarm.L', 'hand.L': 'forearm.L',
    'shoulder.R': 'chest', 'upperarm.R': 'shoulder.R', 'forearm.R': 'upperarm.R', 'hand.R': 'forearm.R',
    'thigh.L': 'hips', 'shin.L': 'thigh.L', 'foot.L': 'shin.L',
    'thigh.R': 'hips', 'shin.R': 'thigh.R', 'foot.R': 'shin.R',
}


def build_armature(J):
    arm_data = bpy.data.armatures.new('rig')
    rig = bpy.data.objects.new('rig', arm_data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for name, (h, t) in J.items():
        b = arm_data.edit_bones.new(name)
        b.head = G(*h)
        b.tail = G(*t)
        # fixed roll so local axes are identical on every character
        b.align_roll(G(0, 0, 1) if not name.startswith(('upperarm', 'forearm', 'hand', 'shoulder')) else G(0, 1, 0))
        eb[name] = b
    for c, p in PARENT.items():
        eb[c].parent = eb[p]
        eb[c].use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return rig


# --------------------------------------------------------------------------- skin weights
def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.dot(ab))))
    return (p - (a + ab * t)).length


def vertex_colors(obj):
    """Base-color texture sampled at each vertex's UV (sRGB 0..1), or None."""
    import numpy as np
    img = None
    for mat in obj.data.materials:
        if mat and mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == 'BSDF_PRINCIPLED' and node.inputs['Base Color'].links:
                    src = node.inputs['Base Color'].links[0].from_node
                    if src.type == 'TEX_IMAGE' and src.image:
                        img = src.image
    uvl = obj.data.uv_layers.active
    if not img or not uvl:
        return None
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)[:, :, :3]
    uv = np.zeros((len(obj.data.vertices), 2), np.float32)
    loops = np.empty(len(obj.data.loops), np.int32)
    obj.data.loops.foreach_get('vertex_index', loops)
    luv = np.empty(len(obj.data.loops) * 2, np.float32)
    uvl.data.foreach_get('uv', luv)
    uv[loops] = luv.reshape(-1, 2)
    xs = np.clip((uv[:, 0] % 1.0) * (w - 1), 0, w - 1).astype(int)
    ys = np.clip((uv[:, 1] % 1.0) * (h - 1), 0, h - 1).astype(int)
    return px[ys, xs]


def find_long_hair(obj, m):
    """Vertices of hair hanging below the neck (long hair over the shoulders / back).
    Hair colour = median colour of the back of the head; hair below the neck must match it."""
    import numpy as np
    cols = vertex_colors(obj)
    if cols is None:
        return set()
    P = np.array([(v.co.x, v.co.z, -v.co.y) for v in obj.data.vertices], np.float32)  # game x, y, z
    neck, ay = m['neck_y'], m['arm_y']
    head = P[:, 1] > neck + 0.12
    zc = np.median(P[head, 2])
    back = head & (P[:, 2] < zc - 0.12) & (np.abs(P[:, 0]) < 0.25)
    if back.sum() < 50:
        return set()
    hair = np.median(cols[back], axis=0)
    spread = np.median(np.linalg.norm(cols[back] - hair, axis=1))
    head_w = np.percentile(np.abs(P[head, 0]), 98)
    near = np.linalg.norm(cols - hair, axis=1) < max(0.1, min(0.16, spread * 2.2))
    zone = (P[:, 1] > ay - 0.6) & (np.abs(P[:, 0]) < head_w * 1.1)
    # flood from the hair on the head down through connected hair-coloured vertices, so a beard,
    # chest hair or dark shorts elsewhere on the body don't count
    ev = np.empty(len(obj.data.edges) * 2, np.int32)
    obj.data.edges.foreach_get('vertices', ev)
    ev = ev.reshape(-1, 2)
    ok = near & zone
    ev = ev[ok[ev[:, 0]] & ok[ev[:, 1]]]
    # the import splits vertices along UV seams: weld coincident vertices so the flood can cross seams
    key = np.round(P / 1e-4).astype(np.int64)
    _, rep = np.unique(key, axis=0, return_inverse=True)
    rep = rep.reshape(-1)
    ev = rep[ev]
    adj = {}
    for a_, b_ in ev:
        adj.setdefault(a_, []).append(b_)
        adj.setdefault(b_, []).append(a_)
    members = {}
    for i in np.nonzero(ok)[0]:
        members.setdefault(rep[i], []).append(i)
    seen = set(rep[np.nonzero(ok & (P[:, 1] > neck + 0.2))[0]].tolist())
    stack = list(seen)
    while stack:
        i = stack.pop()
        for j in adj.get(i, ()):
            if j not in seen:
                seen.add(j)
                stack.append(j)
    idx = [i for r in seen for i in members.get(r, ()) if P[i, 1] <= neck + 0.04]
    print('long hair: colour', hair.round(3), 'vertices below the neck:', len(idx))
    return set(idx) if len(idx) > 1500 else set()   # a beard, necklace or curls at the nape isn't long hair


def skin(obj, rig, J, m):
    long_hair = find_long_hair(obj, m)
    groups = {n: obj.vertex_groups.new(name=n) for n in J}
    segs = {n: (Vector(h), Vector(t)) for n, (h, t) in J.items()}  # game space
    ay = m['arm_y']
    sx = m['torso_w'] * 0.62
    neck_y = m['neck_y']
    hip_y = 0.27 * HEIGHT
    for v in obj.data.vertices:
        p = Vector((v.co.x, v.co.z, -v.co.y))
        side = 'L' if p.x >= 0 else 'R'
        ax = abs(p.x)
        if v.index in long_hair:
            # hair hanging over the shoulders: follows the head near the neck, the chest lower down,
            # never the arms (so it doesn't tear when the arms move)
            f = max(0.0, min(1.0, (p.y - (ay - 0.45)) / max(0.05, neck_y - (ay - 0.45))))
            f = f * f
            groups['head'].add([v.index], 0.15 + 0.6 * f, 'REPLACE')
            groups['chest'].add([v.index], 0.85 - 0.6 * f, 'REPLACE')
            continue
        on_shoulder = ax > sx * 0.95 and p.y < ay + 0.15   # sleeve tops belong to the arm, even on high shoulders
        if p.y > neck_y + 0.04 and (ax < sx * 1.6 or p.y > ay + 0.25) and not on_shoulder:  # wide hair/ears too
            cands = ['head']                                   # rigid head: the face never deforms
        elif p.y > neck_y - 0.04 and ax < sx * 1.4 and not on_shoulder:
            cands = ['head', 'neck']
        elif ax > sx * 0.95 and ay - 0.12 - max(0.0, ax - sx) * 0.6 < p.y < ay + 0.25:
            # the arm/sleeve: a cone that widens away from the armpit, so the shirt's side
            # below the armpit stays on the torso (no flaps when the arms move)
            cands = [f'shoulder.{side}', f'upperarm.{side}', f'forearm.{side}', f'hand.{side}']
            if ax < sx * 1.35:
                cands.append('chest')
        elif p.y < hip_y + 0.02:
            cands = [f'thigh.{side}', f'shin.{side}', f'foot.{side}']
            if p.y > hip_y - 0.1:
                cands.append('hips')
        else:
            cands = ['hips', 'spine', 'chest', 'neck', f'shoulder.{side}']
        ws = []
        for n in cands:
            d = seg_dist(p, *segs[n])
            ws.append((n, 1.0 / (d + 0.02) ** 4))
        ws.sort(key=lambda x: -x[1])
        ws = ws[:3]
        tot = sum(w for _, w in ws)
        for n, w in ws:
            if w / tot > 0.01:
                groups[n].add([v.index], w / tot, 'REPLACE')
    obj.parent = rig
    mod = obj.modifiers.new('rig', 'ARMATURE')
    mod.object = rig


# --------------------------------------------------------------------------- animation helpers
REST = {}


def rest_rot(rig, name):
    if name not in REST:
        REST[name] = rig.data.bones[name].matrix_local.to_3x3().to_quaternion()
    return REST[name]


def local_q(rig, name, rots):
    """rots: list of (game axis, angle) applied in order, expressed in armature space at rest."""
    q = Quaternion()
    for axis, ang in rots:
        q = Quaternion(GA(axis), ang) @ q
    r = rest_rot(rig, name)
    return r.inverted() @ q @ r


def key_pose(rig, frame, pose):
    """pose: {bone: [(axis, angle), ...], '_hips_offset': (x, y, z) game}"""
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = local_q(rig, pb.name, pose.get(pb.name, []))
        pb.keyframe_insert('rotation_quaternion', frame=frame)
    hb = rig.pose.bones['hips']
    off = pose.get('_hips_offset', (0, 0, 0))
    r = rest_rot(rig, 'hips')
    hb.location = r.inverted() @ G(*off)
    hb.keyframe_insert('location', frame=frame)


X, Y, Z = (1, 0, 0), (0, 1, 0), (0, 0, 1)
S = math.sin
C = math.cos


def arms_down(pose, l=1.2, r=1.2, bend=0.18):
    """Relax both arms from the T-pose (positive = down)."""
    pose.setdefault('upperarm.L', []).append((Z, -l))
    pose.setdefault('upperarm.R', []).append((Z, r))
    pose.setdefault('forearm.L', []).append((Z, -bend))
    pose.setdefault('forearm.R', []).append((Z, bend))
    return pose


def anim_idle(t, T):
    w = 2 * math.pi * t / T
    p = arms_down({}, 1.22 + 0.03 * S(w), 1.22 + 0.03 * S(w))
    p['chest'] = [(X, -0.03 * S(w))]
    p['spine'] = [(X, -0.015 * S(w))]
    p['head'] = [(Z, 0.035 * S(w * 0.5)), (X, 0.02 * S(w))]
    p['_hips_offset'] = (0, 0.008 * S(w), 0)
    return p


def anim_idle2(t, T):
    """Relaxed weight shift from foot to foot, arms loose, looking around the party."""
    w = 2 * math.pi * t / T
    shift = S(w)
    p = arms_down({}, 1.3 + 0.04 * shift, 1.3 - 0.04 * shift, 0.25)
    p['upperarm.L'].append((X, -0.12 + 0.06 * shift))   # one hand a little forward, the other back
    p['upperarm.R'].append((X, 0.1 + 0.06 * shift))
    p['_hips_offset'] = (0.035 * shift, -0.01 * abs(shift), 0)
    p['hips'] = [(Z, -0.05 * shift)]
    p['spine'] = [(Z, 0.04 * shift)]
    p['chest'] = [(Y, 0.06 * S(w * 0.5))]
    p['head'] = [(Y, 0.35 * S(w * 0.5)), (Z, 0.05 * shift)]
    p['thigh.L'] = [(Z, 0.04 * shift)]
    p['thigh.R'] = [(Z, 0.04 * shift)]
    return p


def anim_excited(t, T):
    ph = (t / T) % 1.0
    hop = abs(S(math.pi * ph * 2))
    w = 2 * math.pi * ph
    p = {}
    # arms thrown up in a V, pumping with each hop
    p['upperarm.L'] = [(Z, 0.85 + 0.3 * S(w * 2)), (X, -0.15)]
    p['upperarm.R'] = [(Z, -0.85 - 0.3 * S(w * 2)), (X, -0.15)]
    p['forearm.L'] = [(Z, 0.2)]
    p['forearm.R'] = [(Z, -0.2)]
    p['hand.L'] = [(Z, 0.2)]
    p['hand.R'] = [(Z, -0.2)]
    p['_hips_offset'] = (0, 0.22 * hop, 0)
    squat = max(0.0, 0.25 - hop) * 1.6
    p['thigh.L'] = [(X, -0.6 * squat)]
    p['thigh.R'] = [(X, -0.6 * squat)]
    p['shin.L'] = [(X, 1.1 * squat)]
    p['shin.R'] = [(X, 1.1 * squat)]
    p['chest'] = [(X, -0.08 * hop)]
    p['head'] = [(X, -0.1 * hop), (Z, 0.08 * S(w))]
    return p


def anim_dance(t, T):
    w = 2 * math.pi * t / T
    b = S(w * 2)
    p = {}
    p['_hips_offset'] = (0.07 * S(w), -0.04 * abs(b), 0)
    p['hips'] = [(Y, 0.3 * S(w)), (Z, 0.08 * S(w))]
    p['chest'] = [(Y, -0.2 * S(w)), (Z, -0.06 * S(w))]
    p['upperarm.L'] = [(Z, -0.3 + 0.9 * S(w)), (X, -0.4)]
    p['upperarm.R'] = [(Z, 0.3 + 0.9 * S(w)), (X, -0.4)]
    p['forearm.L'] = [(Y, 1.2 + 0.4 * b)]
    p['forearm.R'] = [(Y, -1.2 - 0.4 * b)]
    p['head'] = [(X, 0.12 * b), (Z, 0.1 * S(w))]
    p['thigh.L'] = [(X, -0.25 * max(0, S(w)))]
    p['thigh.R'] = [(X, -0.25 * max(0, -S(w)))]
    p['shin.L'] = [(X, 0.5 * max(0, S(w)))]
    p['shin.R'] = [(X, 0.5 * max(0, -S(w)))]
    return p


def anim_wave(t, T):
    w = 2 * math.pi * t / T
    p = arms_down({}, 1.25, 0)
    # right upper arm out to the side, forearm straight up, hand swinging side to side ("hello!")
    p['upperarm.R'] = [(Z, -0.15), (X, -0.3)]
    p['forearm.R'] = [(Z, -1.35 + 0.35 * S(w * 3))]
    p['hand.R'] = [(Z, 0.2 * S(w * 3 - 0.6))]
    p['chest'] = [(Z, 0.05), (Y, -0.1)]
    p['head'] = [(Z, 0.08 + 0.04 * S(w)), (Y, -0.12)]
    p['_hips_offset'] = (0, 0.02 * abs(S(w * 1.5)), 0)
    return p


def anim_walk(t, T):
    w = 2 * math.pi * t / T
    s = S(w)
    p = arms_down({}, 1.25, 1.25)
    p['upperarm.L'].append((X, 0.5 * s))
    p['upperarm.R'].append((X, -0.5 * s))
    p['thigh.L'] = [(X, -0.55 * s)]
    p['thigh.R'] = [(X, 0.55 * s)]
    p['shin.L'] = [(X, 0.7 * max(0, -C(w)))]
    p['shin.R'] = [(X, 0.7 * max(0, C(w)))]
    p['hips'] = [(Y, 0.12 * s)]
    p['chest'] = [(Y, -0.15 * s), (X, 0.05)]
    p['_hips_offset'] = (0, 0.035 * abs(C(w)), 0)
    return p


def anim_sit(t, T):
    """Seated on a stool/sofa: thighs forward, shins hanging, hands on the lap, gentle sway.
    The game lifts the whole character to the seat height."""
    w = 2 * math.pi * t / T
    p = arms_down({}, 1.15, 1.15, 0.1)
    p['upperarm.L'].append((X, -0.45))
    p['upperarm.R'].append((X, -0.45))
    p['forearm.L'] = [(X, -0.5)]
    p['forearm.R'] = [(X, -0.5)]
    p['thigh.L'] = [(X, -1.5), (Y, 0.12)]
    p['thigh.R'] = [(X, -1.5), (Y, -0.12)]
    p['shin.L'] = [(X, 1.45 + 0.12 * S(w))]
    p['shin.R'] = [(X, 1.45 - 0.12 * S(w))]
    p['chest'] = [(X, -0.04 * S(w))]
    p['head'] = [(Y, 0.3 * S(w * 0.5)), (X, 0.03 * S(w))]
    return p


ANIMS = [
    ('idle', anim_idle, 2.4),
    ('idle2', anim_idle2, 4.0),
    ('excited', anim_excited, 1.0),
    ('dance', anim_dance, 1.6),
    ('wave', anim_wave, 1.6),
    ('walk', anim_walk, 0.8),
    ('sit', anim_sit, 4.0),
]


def bake(rig):
    rig.animation_data_create()
    scene = bpy.context.scene
    scene.render.fps = FPS
    for name, fn, T in ANIMS:
        act = bpy.data.actions.new(name)
        rig.animation_data.action = act
        n = int(round(T * FPS))
        for f in range(0, n + 1, 2):
            key_pose(rig, f, fn(f / FPS, T))
        act.use_fake_user = True
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 0, act)
        strip.name = name
        track.mute = True
        rig.animation_data.action = None
    # rest pose for the bind
    for pb in rig.pose.bones:
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()


def export(path, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_animations=True,
        export_animation_mode='NLA_TRACKS',
        export_skins=True,
        export_def_bones=True,
        export_image_format='JPEG',
        export_jpeg_quality=88,
    )


def main(argv):
    src, dst = argv[0], argv[1]
    facing = '-y'  # Meshy v6 output faces -y in Blender
    if '--facing' in argv:
        facing = argv[argv.index('--facing') + 1]
    obj = load(src, facing)
    m = measure(obj)
    print('measured', {k: round(v, 3) for k, v in m.items()})
    J = joints(m)
    rig = build_armature(J)
    skin(obj, rig, J, m)
    bake(rig)
    export(dst, [rig, obj])
    print('exported', dst, 'clips', [a[0] for a in ANIMS])


if __name__ == '__main__':
    main(sys.argv[1:])
