"""Finalize staged body + optional independent head + optional hair scene and export VRM 1.0 + Blend.

Run in background Blender (opening staged.blend or staged_expr.blend, without --factory-startup):
  Blender --background staged.blend --disable-autoexec --python-exit-code 1 \
    --python scripts/finalize-staged-vrm.py -- \
    --stage-json stage.json --out-vrm OUTPUT.vrm [--out-blend OUTPUT.blend] \
    [--scale-mult 1.0] [--offset-x 0.0] [--offset-fb 0.0] [--offset-z 0.0] \
    [--head-scale-mult 1.0] [--head-offset-x 0.0] [--head-offset-fb 0.0] [--head-offset-z 0.0] [--head-rot-z 0.0] \
    [--bind-expressions]
"""
import argparse
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector
from mathutils.kdtree import KDTree


VRM1_EXPRESSION_MAP = {
    'blink': [('EA_blink', 1.0)],
    'blink_left': [('EA_blink_L', 1.0)],
    'blink_right': [('EA_blink_R', 1.0)],
    'aa': [('EA_aa', 1.0)],
    'ih': [('EA_ih', 1.0)],
    'ou': [('EA_ou', 1.0)],
    'ee': [('EA_ee', 1.0)],
    'oh': [('EA_oh', 1.0)],
    'happy': [('EA_happy_eye', 1.0), ('EA_happy_mouth', 1.0), ('EA_brow_happy', 0.8)],
    'angry': [('EA_angry_eye', 1.0), ('EA_angry_mouth', 1.0), ('EA_brow_angry', 1.0)],
    'sad': [('EA_sad_eye', 1.0), ('EA_sad_mouth', 1.0), ('EA_brow_sad', 1.0)],
    'relaxed': [('EA_relaxed_eye', 1.0), ('EA_relaxed_mouth', 1.0), ('EA_brow_relaxed', 0.8)],
    'surprised': [('EA_surprised_eye', 1.0), ('EA_surprised_mouth', 1.0), ('EA_brow_surprised', 1.0)],
}


def load_sibling_module(name: str, filename: str):
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def transform_mesh_with_shapekeys(obj, world_mat: Matrix):
    """Apply a world-space transform cleanly into an object's vertices and all Shape Key blocks."""
    local_mat = obj.matrix_world.inverted() @ world_mat @ obj.matrix_world
    if obj.data.shape_keys and obj.data.shape_keys.key_blocks:
        for kb in obj.data.shape_keys.key_blocks:
            for kv in kb.data:
                kv.co = local_mat @ kv.co
        obj.data.update()
    else:
        obj.data.transform(local_mat)
        obj.data.update()


def _smoothstep(t: float) -> float:
    t = min(max(t, 0.0), 1.0)
    return t * t * (3.0 - 2.0 * t)


def bind_head_to_rig(head_meshes, rig, head_bone_name: str, neck_bone_name: str | None, bh_api, body_meshes=None):
    """Bind head meshes cleanly: 100% rigid Head on chin/face/aux parts; center-line spine/neck lock on inserted neck base."""
    if not head_meshes:
        return
    h_min, h_max = bh_api.meshes_bounds(head_meshes)
    z_min = float(h_min.z)
    h_span = max(float(h_max.z - h_min.z), 1e-4)

    head_bone = rig.data.bones.get(head_bone_name)
    head_pos = (rig.matrix_world @ head_bone.head_local) if head_bone else Vector((0.0, 0.0, z_min + 0.30 * h_span))
    neck_bone = rig.data.bones.get(neck_bone_name) if neck_bone_name else (head_bone.parent if head_bone else None)
    if neck_bone is not None:
        neck_pos = rig.matrix_world @ neck_bone.head_local
        neck_ref_name = neck_bone.name
    else:
        neck_pos = Vector((head_pos.x, head_pos.y, head_pos.z - 0.25 * h_span))
        neck_ref_name = None
    chest_bone = neck_bone.parent if neck_bone else None
    neck_len = max(float(head_pos.z - neck_pos.z), 0.04 * h_span)

    # Walk ancestor spine chain from neck_bone so shoulders/arms NEVER pull the neck or chin sideways during walking
    spine_chain_bones = set()
    cur_b = neck_bone
    while cur_b is not None:
        if cur_b.name != head_bone_name:
            spine_chain_bones.add(cur_b.name)
        cur_b = cur_b.parent

    skin_meshes = [o for o in head_meshes if not o.name.startswith(('Eye_', 'Eyes', 'Eyelash', 'MouthBag', 'Teeth', 'Tongue'))]
    skin_pts_list = []
    for obj in skin_meshes:
        mat = obj.matrix_world
        if obj.data.shape_keys and obj.data.shape_keys.key_blocks:
            src_verts = obj.data.shape_keys.key_blocks[0].data
        else:
            src_verts = obj.data.vertices
        if len(src_verts):
            skin_pts_list.append(np.array([mat @ v.co for v in src_verts], dtype=float))
    skin_pts = np.concatenate(skin_pts_list, axis=0) if skin_pts_list else np.zeros((0, 3), dtype=float)

    if len(skin_pts) >= 20:
        s_z_min = float(skin_pts[:, 2].min())
        low_z_hi = s_z_min + max(0.18 * neck_len, 0.08 * h_span)
        low_pts = skin_pts[skin_pts[:, 2] <= low_z_hi]
        if len(low_pts) < 12:
            low_pts = skin_pts[np.argsort(skin_pts[:, 2])[:min(40, len(skin_pts))]]
        nx5, nx95 = np.percentile(low_pts[:, 0], [5.0, 95.0])
        neck_cx = float(0.5 * (nx5 + nx95))
        neck_rx = max(float(0.5 * (nx95 - nx5)), 0.015)
        neck_y_front = float(np.percentile(low_pts[:, 1], 5.0))

        chin_cands = skin_pts[
            (skin_pts[:, 1] <= neck_y_front - 0.18 * neck_rx)
            & (np.abs(skin_pts[:, 0] - neck_cx) <= 1.6 * neck_rx)
            & (skin_pts[:, 2] <= float(head_pos.z) + 0.15 * h_span)
        ]
        if len(chin_cands) >= 12:
            chin_z = float(np.percentile(chin_cands[:, 2], 2.0))
            chin_z_min = float(chin_cands[:, 2].min())
        else:
            chin_z = min(float(head_pos.z), s_z_min + 0.25 * h_span)
            chin_z_min = chin_z
    else:
        neck_rx = 0.025
        neck_y_front = float(neck_pos.y - neck_rx)
        chin_z = min(float(head_pos.z), z_min + 0.25 * h_span)
        chin_z_min = chin_z

    z_head_full = min(float(head_pos.z), float(chin_z + 0.05 * neck_len))
    z_collar_lock = min(float(neck_pos.z + 0.08 * neck_len), z_head_full - max(0.18 * neck_len, 0.005))

    # Sample body collar/torso vertices strictly restricted to center-line spine chain bones
    collar_pts = []
    collar_weights = []
    if body_meshes and spine_chain_bones:
        z_lo = float(neck_pos.z - 2.4 * neck_len)
        z_hi = float(head_pos.z + 0.5 * neck_len)
        xy_lim = 3.2 * neck_len
        for b_obj in body_meshes:
            b_mat = b_obj.matrix_world
            idx_to_name = {
                vg.index: vg.name
                for vg in b_obj.vertex_groups
                if vg.name in spine_chain_bones
            }
            if not idx_to_name:
                continue
            for bv in b_obj.data.vertices:
                wp = b_mat @ bv.co
                if not (z_lo <= wp.z <= z_hi):
                    continue
                if math.hypot(wp.x - neck_pos.x, wp.y - neck_pos.y) > xy_lim:
                    continue
                w_dict = {}
                for g in bv.groups:
                    bname = idx_to_name.get(g.group)
                    if bname and g.weight > 1e-4:
                        w_dict[bname] = w_dict.get(bname, 0.0) + float(g.weight)
                tot = sum(w_dict.values())
                if tot > 1e-4:
                    collar_pts.append(wp)
                    collar_weights.append({k: val / tot for k, val in w_dict.items()})

    kd = None
    if collar_pts:
        kd = KDTree(len(collar_pts))
        for i, p in enumerate(collar_pts):
            kd.insert(p, i)
        kd.balance()

    fallback_collar = (
        {neck_ref_name: 0.75, chest_bone.name: 0.25} if (neck_ref_name and chest_bone)
        else ({neck_ref_name: 1.0} if neck_ref_name else ({chest_bone.name: 1.0} if chest_bone else {head_bone_name: 1.0}))
    )

    for obj in head_meshes:
        for mod in list(obj.modifiers):
            if mod.type == 'ARMATURE':
                obj.modifiers.remove(mod)
        obj.vertex_groups.clear()
        is_aux_rigid = obj.name.startswith(('Eye_', 'Eyes', 'Eyelash', 'MouthBag', 'Teeth', 'Tongue'))
        if is_aux_rigid:
            vg_head = obj.vertex_groups.new(name=head_bone_name)
            all_ids = [v.index for v in obj.data.vertices]
            if all_ids:
                vg_head.add(all_ids, 1.0, 'REPLACE')
        else:
            vgs = {}

            def get_vg(bname: str):
                vg = vgs.get(bname)
                if vg is None:
                    vg = obj.vertex_groups.new(name=bname)
                    vgs[bname] = vg
                return vg

            mat = obj.matrix_world
            k_nn = min(8, len(collar_pts)) if kd is not None else 0
            chin_y_thresh = neck_y_front
            chin_y_fade = max(0.25 * neck_rx, 1e-4)
            chin_z_guard = chin_z_min - 0.10 * neck_len

            for v in obj.data.vertices:
                wp = mat @ v.co
                wz = float(wp.z)
                wy = float(wp.y)

                t_z = _smoothstep((wz - z_collar_lock) / max(z_head_full - z_collar_lock, 1e-5))
                if wz >= chin_z_guard and wy < chin_y_thresh:
                    t_chin = _smoothstep((chin_y_thresh - wy) / chin_y_fade)
                else:
                    t_chin = 0.0
                t_head = max(t_z, t_chin)

                if t_head >= 0.999:
                    final_w = {head_bone_name: 1.0}
                else:
                    if kd is not None and k_nn > 0:
                        accum = {}
                        w_sum = 0.0
                        for _co, c_idx, dist in kd.find_n(wp, k_nn):
                            iw = 1.0 / (max(float(dist), 1e-4) ** 2)
                            w_sum += iw
                            for bname, bw in collar_weights[c_idx].items():
                                accum[bname] = accum.get(bname, 0.0) + iw * bw
                        collar_w = {k: val / w_sum for k, val in accum.items()} if w_sum > 0 else dict(fallback_collar)
                    else:
                        collar_w = dict(fallback_collar)

                    if t_head <= 0.001:
                        final_w = collar_w
                    else:
                        final_w = {k: (1.0 - t_head) * val for k, val in collar_w.items()}
                        final_w[head_bone_name] = final_w.get(head_bone_name, 0.0) + t_head

                # VRM 1.0 / glTF requires <= 4 bone influences per vertex normalized to 1.0
                top4 = sorted(((k, val) for k, val in final_w.items() if val > 1e-4), key=lambda kv: kv[1], reverse=True)[:4]
                if not top4:
                    top4 = [(head_bone_name, 1.0)]
                tot = sum(val for _k, val in top4)
                for bname, bw in top4:
                    get_vg(bname).add([v.index], bw / tot, 'REPLACE')

        obj.parent = rig
        obj.matrix_parent_inverse = rig.matrix_world.inverted()
        arm_mod = obj.modifiers.new('Armature', 'ARMATURE')
        arm_mod.object = rig


def normalize_rig_and_meshes_with_shapekeys(rig, meshes, target_height: float, fullbody_api):
    """Shape-key safe normalization: scales rig & meshes to target_height and grounds min_z to 0."""
    has_shape_keys = any(m.data.shape_keys and len(m.data.shape_keys.key_blocks) > 0 for m in meshes)
    if not has_shape_keys:
        return fullbody_api.normalize_rig_and_meshes(rig, meshes, target_height)

    min_pt, max_pt = fullbody_api.world_bounds(meshes)
    height = max_pt.z - min_pt.z
    if height <= 1e-5:
        raise RuntimeError('Imported meshes have near-zero height.')

    needs_scale = target_height > 0 and (height < 0.8 or height > 2.4)
    needs_ground = abs(min_pt.z) > 0.01
    if not needs_scale and not needs_ground:
        return dict(scaled=False, grounded=False, height=height, min_z=min_pt.z)

    scale_factor = (target_height / height) if needs_scale else 1.0

    saved_worlds = {}
    for m in meshes:
        saved_worlds[m.name] = m.matrix_world.copy()
        if m.parent is not None:
            m.parent = None
            m.matrix_world = saved_worlds[m.name]

    if needs_scale:
        rig.scale = tuple(v * scale_factor for v in rig.scale)
        rig.location = tuple(v * scale_factor for v in rig.location)
    bpy.context.view_layer.update()

    scaled_min_z = min((Matrix.Scale(scale_factor, 4) @ saved_worlds[m.name] @ v.co).z for m in meshes for v in m.data.vertices)
    z_shift = -scaled_min_z if abs(scaled_min_z) > 0.01 else 0.0
    if z_shift:
        rig.location.z += z_shift
    bpy.context.view_layer.update()

    bpy.ops.object.select_all(action='DESELECT')
    rig.hide_set(False)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    norm_mat = Matrix.Translation((0.0, 0.0, z_shift)) @ Matrix.Scale(scale_factor, 4)
    for m in meshes:
        total_mat = norm_mat @ saved_worlds[m.name]
        if m.data.shape_keys and m.data.shape_keys.key_blocks:
            for kb in m.data.shape_keys.key_blocks:
                for kv in kb.data:
                    kv.co = total_mat @ kv.co
            m.data.update()
        else:
            m.data.transform(total_mat)
            m.data.update()
        m.matrix_world = Matrix.Identity(4)
        m.parent = rig
        m.matrix_parent_inverse = rig.matrix_world.inverted()

    bpy.context.view_layer.update()
    final_min, final_max = fullbody_api.world_bounds(meshes)
    return dict(
        scaled=needs_scale,
        grounded=bool(z_shift),
        scale_factor=scale_factor,
        height=final_max.z - final_min.z,
        min_z=final_min.z,
    )


def bind_vrm1_expressions(rig, expr_meshes):
    """Map EA_* shape keys on target face meshes to VRM 1.0 preset expressions."""
    presets = rig.data.vrm_addon_extension.vrm1.expressions.preset
    bound_names = []
    for preset_name, bindings in VRM1_EXPRESSION_MAP.items():
        preset_obj = getattr(presets, preset_name, None)
        if preset_obj is None:
            continue
        preset_obj.morph_target_binds.clear()
        added = 0
        for key_name, weight in bindings:
            for obj in expr_meshes:
                sk = obj.data.shape_keys.key_blocks.get(key_name) if obj.data.shape_keys else None
                if sk is None:
                    continue
                bind = preset_obj.morph_target_binds.add()
                bind.node.mesh_object_name = obj.name
                bind.index = key_name
                bind.weight = float(weight)
                added += 1
        if added > 0:
            bound_names.append(preset_name)
    return bound_names


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage-json', required=True)
    parser.add_argument('--out-vrm', required=True)
    parser.add_argument('--out-blend')
    parser.add_argument('--scale-mult', type=float, default=1.0)
    parser.add_argument('--offset-x', type=float, default=0.0)
    parser.add_argument('--offset-fb', type=float, default=0.0)
    parser.add_argument('--offset-z', type=float, default=0.0)
    parser.add_argument('--head-scale-mult', type=float, default=1.0)
    parser.add_argument('--head-offset-x', type=float, default=0.0)
    parser.add_argument('--head-offset-fb', type=float, default=0.0)
    parser.add_argument('--head-offset-z', type=float, default=0.0)
    parser.add_argument('--head-rot-z', type=float, default=0.0)
    parser.add_argument('--name', default='Avatar')
    parser.add_argument('--author', default='Charakuru Local Blender')
    parser.add_argument('--target-height', type=float, default=1.6)
    parser.add_argument('--bind-expressions', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])

    for label, val in (
        ('--scale-mult', args.scale_mult),
        ('--offset-x', args.offset_x),
        ('--offset-fb', args.offset_fb),
        ('--offset-z', args.offset_z),
        ('--head-scale-mult', args.head_scale_mult),
        ('--head-offset-x', args.head_offset_x),
        ('--head-offset-fb', args.head_offset_fb),
        ('--head-offset-z', args.head_offset_z),
        ('--head-rot-z', args.head_rot_z),
        ('--target-height', args.target_height),
    ):
        if not math.isfinite(val):
            raise ValueError(f'{label} must be finite')
    if args.scale_mult <= 0 or args.head_scale_mult <= 0:
        raise ValueError('Scale multipliers must be positive')

    stage = json.loads(Path(args.stage_json).resolve().read_text(encoding='utf-8'))
    out_vrm = Path(args.out_vrm).resolve()
    out_blend = Path(args.out_blend).resolve() if args.out_blend else None

    mtoon_api = load_sibling_module('charakit_mtoon_export', 'mtoon-export.py')
    fullbody_api = load_sibling_module('charakit_fullbody_to_vrm', 'fullbody-to-vrm.py')
    bh_api = load_sibling_module('charakit_body_hair_to_vrm', 'body-hair-to-vrm.py')

    mtoon_api.enable_vrm()

    rig = bpy.data.objects[stage['rigName']]
    body_meshes = [bpy.data.objects[n] for n in stage['bodyMeshes']]
    has_head = bool(stage.get('hasHead') and stage.get('headMeshes'))
    head_meshes = [bpy.data.objects[n] for n in stage.get('headMeshes', [])] if has_head else []
    hair_meshes = [bpy.data.objects[n] for n in stage.get('hairMeshes', [])]
    head_bone_name = stage['headBone']
    neck_bone_name = stage.get('neckBone')

    body_height = float(stage['bodyHeight'])
    c_vec = Vector(stage['craniumCenter'])
    hair_shift = Vector((args.offset_x * body_height, -args.offset_fb * body_height, args.offset_z * body_height))
    hair_local_mat = Matrix.Translation(c_vec + hair_shift) @ Matrix.Scale(args.scale_mult, 4) @ Matrix.Translation(-c_vec)

    if has_head:
        h_pivot = Vector(stage['headPivot'])
        head_shift = Vector((args.head_offset_x * body_height, -args.head_offset_fb * body_height, args.head_offset_z * body_height))
        head_mat = (
            Matrix.Translation(h_pivot + head_shift)
            @ Euler((0.0, 0.0, math.radians(args.head_rot_z)), 'XYZ').to_matrix().to_4x4()
            @ Matrix.Scale(args.head_scale_mult, 4)
            @ Matrix.Translation(-h_pivot)
        )
        for obj in head_meshes:
            transform_mesh_with_shapekeys(obj, head_mat)
        bind_head_to_rig(head_meshes, rig, head_bone_name, neck_bone_name, bh_api, body_meshes=body_meshes)

        hair_total_mat = head_mat @ hair_local_mat
        for obj in hair_meshes:
            obj.data.transform(hair_total_mat)
            obj.data.update()
    else:
        for obj in hair_meshes:
            obj.data.transform(hair_local_mat)
            obj.data.update()

    if hair_meshes:
        bh_api.bind_hair_to_head(hair_meshes, rig, head_bone_name)

    all_meshes = [*body_meshes, *head_meshes, *hair_meshes]
    expr_meshes = head_meshes if has_head else body_meshes
    transform_info = normalize_rig_and_meshes_with_shapekeys(rig, all_meshes, args.target_height, fullbody_api)

    bound_expressions = []
    if args.bind_expressions:
        bound_expressions = bind_vrm1_expressions(rig, expr_meshes)

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

    align_info = dict(stage.get('hairAlignment') or {})
    align_info['userScaleMult'] = round(args.scale_mult, 4)
    align_info['userOffset'] = [round(args.offset_x, 4), round(args.offset_fb, 4), round(args.offset_z, 4)]

    summary = {
        'outVrm': str(out_vrm),
        'outBlend': str(out_blend) if out_blend else None,
        'vrmBytes': out_vrm.stat().st_size,
        'rigName': rig.name,
        'headBone': head_bone_name,
        'hasHead': has_head,
        'hasHair': bool(hair_meshes),
        'bodyMeshes': stage['bodyMeshes'],
        'headMeshes': stage.get('headMeshes', []),
        'hairMeshes': stage.get('hairMeshes', []),
        'mappedBoneCount': stage.get('mappedBoneCount'),
        'missingRequiredBones': stage.get('missingRequiredBones', []),
        'repairedUnweightedVerts': stage.get('repairedUnweightedVerts', 0),
        'trimmedBodyVerts': stage.get('trimmedBodyVerts', 0),
        'expressions': bound_expressions,
        'headUserAdjustment': {
            'scaleMult': round(args.head_scale_mult, 4),
            'offset': [round(args.head_offset_x, 4), round(args.head_offset_fb, 4), round(args.head_offset_z, 4)],
            'rotZDeg': round(args.head_rot_z, 2),
        } if has_head else None,
        'hairAlignment': align_info,
        'transform': transform_info,
        'mtoon': mtoon_report,
        'inspect': vrm_report,
    }
    print('BODY_HAIR_VRM_OK ' + json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
