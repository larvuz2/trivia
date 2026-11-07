#!/usr/bin/env bash
# Rig, animate and compress a generated character:  tools/characters/build.sh joe [facing] [source.glb]
#   in:  tools/characters/<name>_src.glb   (raw Meshy v6 output from generate.mjs, T-pose) or the given source
#   facing: the direction the raw model faces in Blender (Meshy: -y, the default)
#   out: public/models/characters/<name>.glb (2.0 tall, shared skeleton + clips, 2K color / 1K normal+ORM webp)
# Needs Blender's Python module (pip install bpy) — set BLENDER_PY to that python.
set -euo pipefail
name="$1"; facing="${2:--y}"; src="${3:-tools/characters/${name}_src.glb}"
py="${BLENDER_PY:-python3}"
tmp="$(mktemp -d)"
out="public/models/characters/$name.glb"
"$py" tools/blender/character.py "$src" "$tmp/rig.glb" --facing "$facing"
T="npx -y @gltf-transform/cli@4.1.1"
$T resize "$tmp/rig.glb" "$tmp/a.glb" --width 2048 --height 2048
$T resize "$tmp/a.glb" "$tmp/b.glb" --width 1024 --height 1024 --pattern "{Normal*,ORM*,normal*,Image_1*}"
$T webp "$tmp/b.glb" "$out" --quality 90
rm -rf "$tmp"
ls -la "$out"
