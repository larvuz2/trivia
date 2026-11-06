"""Build the Sea of Cortez environment assets.

Usage (with Blender's Python module, `pip install bpy`, or inside Blender):
    python tools/blender/build.py [bay|sierra|props|all]
Outputs go to public/models/env/.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import common  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'models', 'env')


def run(name):
    common.reset_scene()
    common._vcol_mat = None
    mod = __import__(name)
    mod.build(os.path.abspath(OUT))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    for name in (['textures', 'yacht', 'bay', 'sierra', 'props'] if what == 'all' else [what]):
        print('== building', name)
        run(name)
