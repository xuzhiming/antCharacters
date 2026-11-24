"""Export the placed neutral head and body for Tripo in an isolated Blender process."""
import argparse
import importlib.util
import json
import sys
from pathlib import Path
import bpy
from mathutils import Matrix


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run(source, output):
    root = Path(__file__).resolve().parents[1]
    source, output = Path(source).resolve(), Path(output).resolve()
    if output.exists():
        raise ValueError('Output already exists')
    scripts = root / 'skills/charakit-project/scripts'
    extracted = output.parent / 'project'
    load_module('kit_unpack', scripts / 'unpack.py').unpack(source, extracted)
    project_path = extracted / 'project.json'
    project = json.loads(project_path.read_text(encoding='utf-8'))
    if project['mode'] != 'parts':
        raise ValueError('Export the original placed parts before importing a rigged model')
    if not {'body', 'head_neutral'} <= {a['role'] for a in project['assets']}:
        raise ValueError('Both body and neutral head are required')
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1.0
    report = load_module('kit_import', scripts / 'import_models.py').import_models(project_path, {'body', 'head_neutral'})
    collection = bpy.data.collections[report['collection']]
    meshes = [o for o in collection.all_objects if o.type == 'MESH']
    if not meshes or any(o.find_armature() for o in meshes):
        raise ValueError('Use unrigged head and body parts for Tripo export')
    load_module('rig_mtoon',root/'scripts/mtoon-export.py').apply_mtoon(meshes)
    # Bake the placed, unrigged meshes into world coordinates. No parent/rotation/
    # scale interpretation is required of Tripo; original FBX bytes are untouched.
    for obj in meshes:
        world = obj.matrix_world.copy()
        obj.data = obj.data.copy()
        obj.data.transform(world)
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.update()
    # Selection is explicit: no hair, reference objects, markers or hidden expressions.
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    missing = [img.name for img in bpy.data.images if img.source == 'FILE' and not img.packed_file
               and not Path(bpy.path.abspath(img.filepath)).is_file()]
    if missing:
        raise ValueError('Missing textures: ' + ', '.join(missing))
    bpy.ops.export_scene.fbx(filepath=str(output), use_selection=True, object_types={'MESH'},
                             use_mesh_modifiers=False, use_triangles=False, bake_anim=False,
                             add_leaf_bones=False, path_mode='COPY', embed_textures=True,
                             axis_forward='-Z', axis_up='Y', bake_space_transform=True,
                             apply_scale_options='FBX_SCALE_ALL')
    if not output.is_file() or output.stat().st_size < 27:
        raise RuntimeError('FBX export failed')
    report.update(output=output.name, meshes=len(meshes), excluded=['hair', 'expressions', 'markers'],
                  coordinateProfile='baked-y-up-meters-v1')
    output.with_suffix('.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print('CHARAKIT_EXPORT_OK ' + json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:]
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('output')
    config = parser.parse_args(args)
    run(config.source, config.output)
