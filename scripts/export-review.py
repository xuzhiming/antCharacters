"""Export the saved avatar for automatic motion review without saving the Blend."""
import argparse
import importlib.util
import sys
from pathlib import Path
import bpy

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
spec = importlib.util.spec_from_file_location('mtoon_export', Path(__file__).with_name('mtoon-export.py'))
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)
api.enable_vrm()
rigs = [o for o in bpy.data.objects if o.type == 'ARMATURE' and
        getattr(getattr(o.data, 'vrm_addon_extension', None), 'spec_version', None) == '1.0']
if len(rigs) != 1:
    raise RuntimeError('The review VRM must have exactly one Humanoid rig.')
rig = rigs[0]

def belongs(obj):
    if any(m.type == 'ARMATURE' and m.object == rig for m in obj.modifiers):
        return True
    parent = obj.parent
    while parent:
        if parent == rig:
            return True
        parent = parent.parent
    return False

meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not o.hide_render and belongs(o)]
if not meshes:
    raise RuntimeError('There are no meshes to review under the Humanoid rig.')
api.apply_mtoon(meshes)
meta = rig.data.vrm_addon_extension.vrm1.meta
if not meta.vrm_name:
    meta.vrm_name = 'Motion review'
if not meta.authors:
    meta.authors.add().value = '__CHARAKIT_REVIEW__'
bpy.ops.object.select_all(action='DESELECT')
for obj in [rig, *meshes]:
    obj.hide_set(False)
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
output = Path(args.output).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
result = bpy.ops.export_scene.vrm(filepath=str(output), armature_object_name=rig.name,
    export_only_selections=True, export_invisibles=False, use_addon_preferences=False)
if 'FINISHED' not in result:
    raise RuntimeError('Could not export the review VRM. Check the Humanoid settings.')
api.inspect_vrm(output)
