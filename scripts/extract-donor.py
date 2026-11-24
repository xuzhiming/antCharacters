"""Extract only the weighted high-poly body and its armature into a clean Blend.

Run with Blender --background --factory-startup --python-exit-code 1
  --python scripts/extract-donor.py -- SOURCE.blend OUTPUT.blend
The source file is not modified or packaged.
"""
import json
import sys
from pathlib import Path

import bpy


def extract(source, output):
    source, output = Path(source).resolve(), Path(output).resolve()
    if not source.is_file() or source == output or output.exists():
        raise ValueError('Source must exist and output must be a new file')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    wanted = ['アーマチュア.001', 'body_high', 'body_high.001']
    with bpy.data.libraries.load(str(source), link=False) as (available, loaded):
        if any(name not in available.objects for name in wanted):
            raise ValueError('The expected high-poly body or armature is missing')
        loaded.objects = wanted
    objects = dict(zip(wanted, loaded.objects))
    rig = objects[wanted[0]]
    if rig.type != 'ARMATURE' or len(rig.data.bones) < 20:
        raise ValueError('The weighted donor armature is invalid')
    for obj in objects.values():
        bpy.context.scene.collection.objects.link(obj)
        obj.hide_set(False)
        obj.hide_render = False
        if obj.animation_data:
            obj.animation_data_clear()
        for key in list(obj.keys()):
            del obj[key]
    rig.name = 'DonorRig'
    for bone in rig.pose.bones:
        bone.custom_shape = None
        for constraint in list(bone.constraints):
            bone.constraints.remove(constraint)
    meshes = [objects[name] for name in wanted[1:]]
    for index, obj in enumerate(meshes, 1):
        if obj.type != 'MESH' or obj.parent != rig or not obj.vertex_groups:
            raise ValueError('The high-poly mesh must have parented weights')
        obj.name = f'DonorBody_{index}'
        obj.data.materials.clear()
        for key in list(obj.data.keys()):
            del obj.data[key]
        for mod in list(obj.modifiers):
            if mod.type != 'ARMATURE':
                obj.modifiers.remove(mod)
            else:
                mod.object = rig
        if obj.data.shape_keys:
            for block in reversed(list(obj.data.shape_keys.key_blocks)):
                obj.shape_key_remove(block)
    bpy.data.orphans_purge(do_recursive=True)
    for material in list(bpy.data.materials):
        bpy.data.materials.remove(material, do_unlink=True)
    for image in list(bpy.data.images):
        if image.source == 'FILE':
            bpy.data.images.remove(image, do_unlink=True)
    for library in list(bpy.data.libraries):
        bpy.data.libraries.remove(library, do_unlink=True)
    for obj in list(bpy.data.objects):
        if obj not in (rig, *meshes):
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.orphans_purge(do_recursive=True)
    if bpy.data.materials or bpy.data.libraries or any(i.source == 'FILE' for i in bpy.data.images):
        raise ValueError('The extracted donor still contains other media or libraries')
    if set(bpy.data.objects.keys()) != {rig.name, *(obj.name for obj in meshes)}:
        raise ValueError('Unexpected objects remain in the extracted donor: ' + str(list(bpy.data.objects.keys())))
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output), compress=True)
    print('DONOR_EXTRACTED ' + json.dumps({
        'output': str(output), 'armature': rig.name, 'bones': len(rig.data.bones),
        'meshes': {obj.name: {'vertices': len(obj.data.vertices), 'polygons': len(obj.data.polygons)} for obj in meshes},
        'images': len(bpy.data.images), 'materials': len(bpy.data.materials),
    }, ensure_ascii=False))


if __name__ == '__main__':
    arguments = sys.argv[sys.argv.index('--') + 1:]
    if len(arguments) != 2:
        raise SystemExit('Usage: extract-donor.py -- SOURCE.blend OUTPUT.blend')
    extract(*arguments)
