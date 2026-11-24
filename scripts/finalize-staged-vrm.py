"""Finalize staged body + hair scene with user scale/offset adjustments and export VRM 1.0 + Blend.

Run in background Blender (opening staged.blend, without --factory-startup):
  Blender --background staged.blend --disable-autoexec --python-exit-code 1 \
    --python scripts/finalize-staged-vrm.py -- \
    --stage-json stage.json --out-vrm OUTPUT.vrm [--out-blend OUTPUT.blend] \
    [--scale-mult 1.0] [--offset-x 0.0] [--offset-fb 0.0] [--offset-z 0.0]
"""
import argparse
import importlib.util
import json
import math
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage-json', required=True)
    parser.add_argument('--out-vrm', required=True)
    parser.add_argument('--out-blend')
    parser.add_argument('--scale-mult', type=float, default=1.0)
    parser.add_argument('--offset-x', type=float, default=0.0)
    parser.add_argument('--offset-fb', type=float, default=0.0)
    parser.add_argument('--offset-z', type=float, default=0.0)
    parser.add_argument('--name', default='Avatar')
    parser.add_argument('--author', default='Charakuru Local Blender')
    parser.add_argument('--target-height', type=float, default=1.6)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])

    for label, val in (
        ('--scale-mult', args.scale_mult),
        ('--offset-x', args.offset_x),
        ('--offset-fb', args.offset_fb),
        ('--offset-z', args.offset_z),
        ('--target-height', args.target_height),
    ):
        if not math.isfinite(val):
            raise ValueError(f'{label} must be finite')
    if args.scale_mult <= 0:
        raise ValueError('--scale-mult must be positive')

    stage = json.loads(Path(args.stage_json).resolve().read_text(encoding='utf-8'))
    out_vrm = Path(args.out_vrm).resolve()
    out_blend = Path(args.out_blend).resolve() if args.out_blend else None

    mtoon_api = load_sibling_module('charakit_mtoon_export', 'mtoon-export.py')
    fullbody_api = load_sibling_module('charakit_fullbody_to_vrm', 'fullbody-to-vrm.py')
    bh_api = load_sibling_module('charakit_body_hair_to_vrm', 'body-hair-to-vrm.py')

    mtoon_api.enable_vrm()

    rig = bpy.data.objects[stage['rigName']]
    body_meshes = [bpy.data.objects[n] for n in stage['bodyMeshes']]
    hair_meshes = [bpy.data.objects[n] for n in stage['hairMeshes']]
    head_bone_name = stage['headBone']

    c_vec = Vector(stage['craniumCenter'])
    body_height = float(stage['bodyHeight'])
    shift = Vector((args.offset_x * body_height, -args.offset_fb * body_height, args.offset_z * body_height))
    adj_mat = Matrix.Translation(c_vec + shift) @ Matrix.Scale(args.scale_mult, 4) @ Matrix.Translation(-c_vec)
    for obj in hair_meshes:
        obj.data.transform(adj_mat)
        obj.data.update()

    bh_api.bind_hair_to_head(hair_meshes, rig, head_bone_name)

    all_meshes = [*body_meshes, *hair_meshes]
    transform_info = fullbody_api.normalize_rig_and_meshes(rig, all_meshes, args.target_height)

    meta = rig.data.vrm_addon_extension.vrm1.meta
    meta.vrm_name = args.name
    if not meta.authors:
        meta.authors.add().value = args.author
    else:
        meta.authors[0].value = args.author

    fullbody_api.ensure_materials(all_meshes)
    mtoon_report = mtoon_api.apply_mtoon(all_meshes)

    bpy.ops.object.select_all(action='DESELECT')
    for obj in [rig, *all_meshes]:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig

    out_vrm.parent.mkdir(parents=True, exist_ok=True)
    result = bpy.ops.export_scene.vrm(
        filepath=str(out_vrm),
        armature_object_name=rig.name,
        export_only_selections=True,
        export_invisibles=False,
        use_addon_preferences=False,
    )
    if 'FINISHED' not in result:
        raise RuntimeError(f'VRM export failed: {result}')

    vrm_report = mtoon_api.inspect_vrm(out_vrm)

    if out_blend:
        out_blend.parent.mkdir(parents=True, exist_ok=True)
        try:
            bpy.ops.file.pack_all()
        except Exception as exc:
            print(f'[finalize-staged-vrm] pack_all warning: {exc}')
        save_res = bpy.ops.wm.save_as_mainfile(filepath=str(out_blend), copy=True)
        if 'FINISHED' not in save_res:
            raise RuntimeError(f'Failed to save blend file: {save_res}')

    align_info = dict(stage.get('hairAlignment', {}))
    align_info['userScaleMult'] = round(args.scale_mult, 4)
    align_info['userOffset'] = [round(args.offset_x, 4), round(args.offset_fb, 4), round(args.offset_z, 4)]

    summary = {
        'outVrm': str(out_vrm),
        'outBlend': str(out_blend) if out_blend else None,
        'vrmBytes': out_vrm.stat().st_size,
        'rigName': rig.name,
        'headBone': head_bone_name,
        'bodyMeshes': stage['bodyMeshes'],
        'hairMeshes': stage['hairMeshes'],
        'mappedBoneCount': stage.get('mappedBoneCount'),
        'missingRequiredBones': stage.get('missingRequiredBones', []),
        'repairedUnweightedVerts': stage.get('repairedUnweightedVerts', 0),
        'hairAlignment': align_info,
        'transform': transform_info,
        'mtoon': mtoon_report,
        'inspect': vrm_report,
    }
    print('BODY_HAIR_VRM_OK ' + json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
