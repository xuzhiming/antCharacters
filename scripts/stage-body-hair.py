"""Stage body + auto-fitted hair models into staged.blend + preview GLBs (body.glb & hair.glb).

Run in background Blender (without --factory-startup so VRM Add-on remains enabled):
  Blender --background --disable-autoexec --python-exit-code 1 \
    --python scripts/stage-body-hair.py -- \
    --body BODY.fbx --hair HAIR.fbx --out-dir DIR [--name Avatar]
"""
import argparse
import importlib.util
import json
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def load_sibling_module(name: str, filename: str):
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def export_selected_glb(objects, out_path: Path):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]
    res = bpy.ops.export_scene.gltf(
        filepath=str(out_path),
        export_format='GLB',
        use_selection=True,
        export_yup=True,
    )
    if 'FINISHED' not in res:
        raise RuntimeError(f'GLB export failed ({out_path.name}): {res}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--body', required=True)
    parser.add_argument('--hair', required=True)
    parser.add_argument('--out-dir', required=True)
    parser.add_argument('--name', default='Avatar')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])

    body_path = Path(args.body).resolve()
    hair_path = Path(args.hair).resolve()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    staged_blend = out_dir / 'staged.blend'
    body_glb = out_dir / 'body.glb'
    hair_glb = out_dir / 'hair.glb'
    stage_json = out_dir / 'stage.json'

    mtoon_api = load_sibling_module('charakit_mtoon_export', 'mtoon-export.py')
    fullbody_api = load_sibling_module('charakit_fullbody_to_vrm', 'fullbody-to-vrm.py')
    bh_api = load_sibling_module('charakit_body_hair_to_vrm', 'body-hair-to-vrm.py')

    mtoon_api.enable_vrm()
    fullbody_api.clear_scene()

    body_imported = bh_api.import_model_with_textures(body_path)
    rig, body_meshes = fullbody_api.find_rig_and_meshes(body_imported)
    mapped_bones, missing_required = fullbody_api.configure_humanoid_bones(rig)
    repaired_verts = bh_api.repair_unweighted_vertices(body_meshes, rig)
    head_bone_name = mapped_bones.get('head')
    if not head_bone_name:
        raise RuntimeError('Body rig has no mapped VRM head bone.')

    hair_imported = bh_api.import_model_with_textures(hair_path)
    hair_meshes = [o for o in hair_imported if o.type == 'MESH' and not o.hide_render]
    if not hair_meshes:
        raise RuntimeError(f'No meshes found in hair model: {hair_path}')
    for extra in hair_imported:
        if extra not in hair_meshes:
            bpy.data.objects.remove(extra, do_unlink=True)

    align_info = bh_api.align_hair_to_head(
        hair_meshes,
        body_meshes,
        rig,
        head_bone_name,
        1.0,
        (0.0, 0.0, 0.0),
    )

    all_meshes = [*body_meshes, *hair_meshes]
    fullbody_api.ensure_materials(all_meshes)

    try:
        bpy.ops.file.pack_all()
    except Exception as exc:
        print(f'[stage-body-hair] pack_all warning: {exc}')

    save_res = bpy.ops.wm.save_as_mainfile(filepath=str(staged_blend), copy=True)
    if 'FINISHED' not in save_res:
        raise RuntimeError(f'Failed to save staged blend: {save_res}')

    export_selected_glb([rig, *body_meshes], body_glb)

    c_vec = Vector(align_info['craniumCenter'])
    body_height = float(align_info['bodyHeight'])
    body_min, body_max = bh_api.meshes_bounds(body_meshes)

    shift_to_origin = Matrix.Translation(-c_vec)
    for obj in hair_meshes:
        obj.data.transform(shift_to_origin)
        obj.data.update()
    export_selected_glb(hair_meshes, hair_glb)

    payload = {
        'name': args.name,
        'rigName': rig.name,
        'headBone': head_bone_name,
        'bodyMeshes': [m.name for m in body_meshes],
        'hairMeshes': [m.name for m in hair_meshes],
        'mappedBoneCount': len(mapped_bones),
        'missingRequiredBones': missing_required,
        'repairedUnweightedVerts': repaired_verts,
        'craniumCenter': [round(float(v), 5) for v in c_vec],
        'bodyHeight': round(body_height, 5),
        'bodyBounds': {
            'min': [round(float(v), 5) for v in body_min],
            'max': [round(float(v), 5) for v in body_max],
        },
        'hairAlignment': align_info,
        'stagedBlend': str(staged_blend),
        'bodyGlb': str(body_glb),
        'hairGlb': str(hair_glb),
    }
    stage_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print('STAGE_BODY_HAIR_OK ' + json.dumps(payload, ensure_ascii=False))


if __name__ == '__main__':
    main()
