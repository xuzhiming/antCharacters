"""Stage body + optional independent head + optional hair into staged.blend + preview GLBs.

Run in background Blender (without --factory-startup so VRM Add-on remains enabled):
  Blender --background --disable-autoexec --python-exit-code 1 \
    --python scripts/stage-body-hair.py -- \
    --body BODY.fbx [--head HEAD.glb] [--hair HAIR.fbx] --out-dir DIR [--name Avatar] [--trim-body-head]
"""
import argparse
import importlib.util
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree


def load_sibling_module(name: str, filename: str):
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def is_aux_head_part(name: str) -> bool:
    return any(name.startswith(p) for p in ('Eye_', 'Eyes', 'Eyelash', 'MouthBag', 'Teeth', 'Tongue', 'Head_Original'))


def transform_objects_with_shapekeys(objs, mat: Matrix):
    """Apply world-origin transform `mat` to object meshes, keeping any existing shape keys synchronized."""
    for obj in objs:
        if obj.data.shape_keys and obj.data.shape_keys.key_blocks:
            for kb in obj.data.shape_keys.key_blocks:
                for kv in kb.data:
                    kv.co = mat @ kv.co
            obj.data.update()
        else:
            obj.data.transform(mat)
            obj.data.update()


def trim_body_head_above_neck(body_meshes, rig, head_bone_name: str, neck_bone_name: str | None, est_height: float) -> int:
    """Remove built-in head vertices above the neck cleanly using bone weights (preserving shoulders/collar)."""
    head_bone = rig.data.bones[head_bone_name]
    head_pos = rig.matrix_world @ head_bone.head_local
    if neck_bone_name and neck_bone_name in rig.data.bones:
        neck_pos = rig.matrix_world @ rig.data.bones[neck_bone_name].head_local
    else:
        neck_pos = Vector((head_pos.x, head_pos.y, head_pos.z - 0.065 * est_height))

    cut_z = neck_pos.z + 0.35 * (head_pos.z - neck_pos.z)
    neck_r = 0.095 * est_height
    removed = 0

    for obj in body_meshes:
        head_vg = obj.vertex_groups.get(head_bone_name)
        neck_vg = obj.vertex_groups.get(neck_bone_name) if neck_bone_name else None
        h_idx = head_vg.index if head_vg else None
        n_idx = neck_vg.index if neck_vg else None
        mat = obj.matrix_world

        to_delete = set()
        for v in obj.data.vertices:
            p = mat @ v.co
            if p.z <= cut_z:
                continue
            if h_idx is not None:
                hw = 0.0
                nw = 0.0
                for g in v.groups:
                    if g.group == h_idx:
                        hw = g.weight
                    elif n_idx is not None and g.group == n_idx:
                        nw = g.weight
                if hw >= 0.42 or (hw + 0.5 * nw >= 0.48 and p.z > neck_pos.z + 0.55 * (head_pos.z - neck_pos.z)):
                    to_delete.add(v.index)
            else:
                if math.hypot(p.x - neck_pos.x, p.y - neck_pos.y) <= neck_r:
                    to_delete.add(v.index)

        if not to_delete:
            continue
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.verts.ensure_lookup_table()
        verts_del = [bm.verts[i] for i in to_delete if i < len(bm.verts)]
        if verts_del:
            bmesh.ops.delete(bm, geom=verts_del, context='VERTS')
            loose = [v for v in bm.verts if not v.link_faces]
            if loose:
                bmesh.ops.delete(bm, geom=loose, context='VERTS')
            bm.to_mesh(obj.data)
            obj.data.update()
            removed += len(verts_del)
        bm.free()

    return removed


def symmetry_error(pts: np.ndarray, axis: int) -> float:
    """Measure bilateral reflection error across the bounding-box midpoint of `axis`."""
    mid = 0.5 * float(pts[:, axis].min() + pts[:, axis].max())
    sample = pts[np.linspace(0, len(pts) - 1, min(len(pts), 600), dtype=int)]
    kd = KDTree(len(pts))
    for i, p in enumerate(pts):
        kd.insert(p, i)
    kd.balance()
    errs = []
    for p in sample:
        reflected = p.copy()
        reflected[axis] = 2.0 * mid - p[axis]
        _co, _idx, d = kd.find(reflected)
        errs.append(d)
    return float(np.mean(errs))


def detect_head_rotation_z(pts: np.ndarray) -> tuple[float, str]:
    """Detect face forward axis on an independent head mesh and return Z rotation to face -Y."""
    err_x = symmetry_error(pts, 0)
    err_y = symmetry_error(pts, 1)
    lr_axis, fb_axis = (0, 1) if err_x <= err_y * 1.15 else (1, 0)
    lr_mid = 0.5 * float(pts[:, lr_axis].min() + pts[:, lr_axis].max())
    fb_mid = 0.5 * float(pts[:, fb_axis].min() + pts[:, fb_axis].max())
    lr_span = max(float(np.ptp(pts[:, lr_axis])), 1e-4)
    fb_span = max(float(np.ptp(pts[:, fb_axis])), 1e-4)

    pos_cnt = int(np.sum(pts[:, fb_axis] > fb_mid + 0.05 * fb_span))
    neg_cnt = int(np.sum(pts[:, fb_axis] < fb_mid - 0.05 * fb_span))
    if pos_cnt > neg_cnt * 1.12:
        front_positive = True
    elif neg_cnt > pos_cnt * 1.12:
        front_positive = False
    else:
        z_min = float(pts[:, 2].min())
        z_span = max(float(np.ptp(pts[:, 2])), 1e-4)
        mid = pts[
            (np.abs(pts[:, lr_axis] - lr_mid) <= 0.14 * lr_span)
            & (pts[:, 2] >= z_min + 0.25 * z_span)
            & (pts[:, 2] <= z_min + 0.75 * z_span)
        ]
        if len(mid) < 10:
            mid = pts
        neg_protrude = abs(float(mid[:, fb_axis].min()) - fb_mid)
        pos_protrude = abs(float(mid[:, fb_axis].max()) - fb_mid)
        front_positive = pos_protrude > neg_protrude

    if fb_axis == 1:
        return (math.pi, 'pos_y') if front_positive else (0.0, 'neg_y')
    return (-math.pi / 2.0, 'pos_x') if front_positive else (math.pi / 2.0, 'neg_x')


def align_head_to_body(head_meshes, rig, head_bone_name: str, neck_bone_name: str | None, est_full_height: float, bh_api, backup_objs=None):
    """Orient, scale, and seat an independent head mesh onto the body's neck joint."""
    extra_objs = list(backup_objs or [])
    for obj in [*head_meshes, *extra_objs]:
        bh_api.bake_mesh_world_transform(obj)
    bpy.context.view_layer.update()

    pts = bh_api.collect_meshes_points(head_meshes)
    rot_z, detected_front = detect_head_rotation_z(pts)
    rot_mat = Matrix.Identity(4)
    if abs(rot_z) > 1e-6:
        c_xy = Vector((float(pts[:, 0].mean()), float(pts[:, 1].mean()), 0.0))
        rot_mat = Matrix.Translation(c_xy) @ Euler((0.0, 0.0, rot_z), 'XYZ').to_matrix().to_4x4() @ Matrix.Translation(-c_xy)
        transform_objects_with_shapekeys([*head_meshes, *extra_objs], rot_mat)
        pts = bh_api.collect_meshes_points(head_meshes)

    bot_z = float(pts[:, 2].min())
    top_z = float(pts[:, 2].max())
    total_h = max(top_z - bot_z, 1e-4)

    upper = pts[pts[:, 2] >= bot_z + 0.45 * total_h]
    if len(upper) < 20:
        upper = pts
    ux2, ux98 = np.percentile(upper[:, 0], [2.0, 98.0])
    uy2, uy98 = np.percentile(upper[:, 1], [2.0, 98.0])
    head_w = max(float(ux98 - ux2), 1e-4)
    ucx = 0.5 * float(ux2 + ux98)
    ucy = 0.5 * float(uy2 + uy98)

    chin_band = pts[
        (np.abs(pts[:, 0] - ucx) <= 0.35 * head_w)
        & (pts[:, 1] <= ucy - 0.18 * head_w)
    ]
    chin_z = float(np.percentile(chin_band[:, 2], 1.5)) if len(chin_band) >= 15 else bot_z
    chin_z = max(bot_z, min(chin_z, top_z - 0.45 * total_h))
    chin_to_top_h = max(top_z - chin_z, 1e-4)

    trimmed_bust_verts = 0
    if not extra_objs and chin_z - bot_z > 0.12 * chin_to_top_h:
        scan_hi = min(top_z - 0.10 * chin_to_top_h, chin_z + 0.04 * chin_to_top_h)
        edges = np.linspace(bot_z, scan_hi, 13)
        best_waist_z = None
        w_min = float('inf')
        for k in range(len(edges) - 1):
            sl = pts[(pts[:, 2] >= edges[k]) & (pts[:, 2] <= edges[k + 1])]
            if len(sl) < 6:
                continue
            w = float(sl[:, 0].max() - sl[:, 0].min())
            if w < w_min:
                w_min = w
                best_waist_z = 0.5 * float(edges[k] + edges[k + 1])
        if best_waist_z is not None and w_min > 1e-4:
            below = pts[pts[:, 2] < best_waist_z - 0.03 * chin_to_top_h]
            if len(below) >= 6:
                below_w = float(below[:, 0].max() - below[:, 0].min())
                if below_w > 1.20 * w_min:
                    z_cut = max(bot_z, best_waist_z - 0.09 * chin_to_top_h)
                    for obj in head_meshes:
                        me = obj.data
                        to_del = {v.index for v in me.vertices if (obj.matrix_world @ v.co).z < z_cut}
                        if not to_del:
                            continue
                        bm = bmesh.new()
                        bm.from_mesh(me)
                        bm.verts.ensure_lookup_table()
                        verts_del = [bm.verts[i] for i in to_del if i < len(bm.verts)]
                        if verts_del:
                            bmesh.ops.delete(bm, geom=verts_del, context='VERTS')
                            loose = [v for v in bm.verts if not v.link_faces]
                            if loose:
                                bmesh.ops.delete(bm, geom=loose, context='VERTS')
                            bm.to_mesh(me)
                            me.update()
                            trimmed_bust_verts += len(verts_del)
                    if trimmed_bust_verts > 0:
                        pts = bh_api.collect_meshes_points(head_meshes)

    target_head_h = 0.138 * est_full_height
    scale = target_head_h / chin_to_top_h

    head_only = pts[pts[:, 2] >= chin_z]
    if len(head_only) < 12:
        head_only = pts
    src_cx = 0.5 * float(head_only[:, 0].min() + head_only[:, 0].max())
    src_cy = 0.5 * float(head_only[:, 1].min() + head_only[:, 1].max())
    neck_base_src = Vector((src_cx, src_cy, chin_z))

    head_bone = rig.data.bones[head_bone_name]
    head_pos = rig.matrix_world @ head_bone.head_local
    if neck_bone_name and neck_bone_name in rig.data.bones:
        neck_pos = rig.matrix_world @ rig.data.bones[neck_bone_name].head_local
    else:
        neck_pos = Vector((head_pos.x, head_pos.y, head_pos.z - 0.065 * est_full_height))

    join_z = neck_pos.z + 0.52 * (head_pos.z - neck_pos.z)
    head_pivot = Vector((float(head_pos.x), float(0.5 * (neck_pos.y + head_pos.y)), float(join_z)))

    align_mat = Matrix.Translation(head_pivot) @ Matrix.Scale(scale, 4) @ Matrix.Translation(-neck_base_src)
    transform_objects_with_shapekeys([*head_meshes, *extra_objs], align_mat)

    final_min, final_max = bh_api.meshes_bounds(head_meshes)
    return head_pivot, (align_mat @ rot_mat), {
        'detectedFront': detected_front,
        'autoRotZDeg': round(math.degrees(rot_z), 1),
        'scale': round(scale, 5),
        'chinZ': round(float(chin_z), 5),
        'trimmedBustVerts': trimmed_bust_verts,
        'headMin': [round(float(v), 5) for v in final_min],
        'headMax': [round(float(v), 5) for v in final_max],
        'headPivot': [round(float(v), 5) for v in head_pivot],
    }


def estimate_initial_face_landmarks(
    target_meshes,
    rig,
    head_bone_name: str | None,
    bh_api,
    mapped_bones=None,
    independent_head=False,
    surgery_meta=None,
    post_surgery_mat: Matrix | None = None,
):
    """Project 42 default face landmarks (24 eyes, 12 mouth, 6 brows) onto the front skin surface."""
    skin_targets = [o for o in target_meshes if not is_aux_head_part(o.name)] or list(target_meshes)
    body_min, body_max = bh_api.meshes_bounds(skin_targets)
    body_height = max(body_max.z - body_min.z, 1e-4)

    if independent_head or rig is None or not head_bone_name:
        hpts = bh_api.collect_meshes_points(skin_targets)
    else:
        head_bone = rig.data.bones[head_bone_name]
        head_z = (rig.matrix_world @ head_bone.head_local).z
        neck_name = (mapped_bones or {}).get('neck')
        if neck_name and neck_name in rig.data.bones:
            neck_z = (rig.matrix_world @ rig.data.bones[neck_name].head_local).z
        else:
            neck_z = head_z - 0.065 * body_height

        z_low = neck_z + 0.015 * body_height
        raw_pts = []
        for obj in skin_targets:
            mat = obj.matrix_world
            for v in obj.data.vertices:
                p = mat @ v.co
                if p.z >= z_low:
                    raw_pts.append((p.x, p.y, p.z))
        hpts = np.array(raw_pts, dtype=float) if len(raw_pts) >= 30 else bh_api.collect_head_vertices(skin_targets, head_z, body_height)

    head_max = hpts.max(axis=0)
    top_z = float(head_max[2])
    span_z = max(top_z - float(hpts[:, 2].min()), 1e-4)
    crown_pts = hpts[hpts[:, 2] >= top_z - (0.65 * span_z if independent_head else 0.09 * body_height)]
    if len(crown_pts) < 20:
        crown_pts = hpts
    px5, px95 = np.percentile(crown_pts[:, 0], [5.0, 95.0])
    py5, py95 = np.percentile(crown_pts[:, 1], [5.0, 95.0])
    cx = float(0.5 * (px5 + px95))
    cy = float(0.5 * (py5 + py95))
    head_w = float(max(px95 - px5, 1e-4))

    chin_band = hpts[(np.abs(hpts[:, 0] - cx) <= 0.35 * head_w) & (hpts[:, 1] <= cy - 0.18 * head_w)]
    chin_z = float(np.percentile(chin_band[:, 2], 1.5)) if len(chin_band) >= 15 else float(hpts[:, 2].min())
    face_h = float(max(top_z - chin_z, 1e-4))

    nose_band = hpts[
        (np.abs(hpts[:, 0] - cx) <= 0.14 * head_w)
        & (hpts[:, 2] >= chin_z + 0.22 * face_h)
        & (hpts[:, 2] <= chin_z + 0.65 * face_h)
    ]
    z_nose = float(nose_band[int(np.argmin(nose_band[:, 1])), 2]) if len(nose_band) >= 5 else float(chin_z + 0.36 * face_h)
    upper_h = float(max(top_z - z_nose, 1e-4))

    z_cutoff = float(chin_z - 0.15 * face_h)
    verts = []
    polys = []
    front_pts = []
    offset = 0
    for obj in skin_targets:
        mat = obj.matrix_world
        mesh = obj.data
        mesh.calc_loop_triangles()
        local_map = {}
        for v in mesh.vertices:
            p = mat @ v.co
            if p.z >= z_cutoff:
                local_map[v.index] = offset + len(verts)
                verts.append(p)
                if p.y <= cy - 0.02 * head_w:
                    front_pts.append((p.x, p.y, p.z))
        for tri in mesh.loop_triangles:
            i0, i1, i2 = tri.vertices[0], tri.vertices[1], tri.vertices[2]
            if i0 in local_map and i1 in local_map and i2 in local_map:
                polys.append((local_map[i0], local_map[i1], local_map[i2]))

    bvh = BVHTree.FromPolygons(verts, polys) if polys else None
    front_arr = np.array(front_pts, dtype=float) if front_pts else hpts
    face_band = front_arr[
        (np.abs(front_arr[:, 0] - cx) <= 0.45 * head_w)
        & (front_arr[:, 2] >= chin_z + 0.10 * face_h)
        & (front_arr[:, 2] <= top_z - 0.15 * face_h)
    ]
    if len(face_band) < 20:
        face_band = front_arr
    face_front_y = float(np.percentile(face_band[:, 1], 35.0)) if len(face_band) else cy

    z_eye = float(z_nose + 0.23 * upper_h)
    z_mouth = float(chin_z + 0.46 * (z_nose - chin_z))
    z_brow = float(z_nose + 0.39 * upper_h)

    plan_xz = {}
    if surgery_meta is not None:
        ps_mat = post_surgery_mat if post_surgery_mat is not None else Matrix.Identity(4)

        def map_xz(x_val: float, y_val: float, z_val: float) -> tuple[float, float]:
            p = ps_mat @ Vector((float(x_val), float(y_val), float(z_val)))
            return (float(p.x), float(p.z))

        for side in ('L', 'R'):
            ec = surgery_meta['eyeL' if side == 'L' else 'eyeR']
            up = ec['upper_xz']
            dn = ec['lower_xz']
            y_ref = float(ec.get('y_skin', 0.0))
            if side == 'L':
                # X runs inner -> outer (small X -> large X)
                x_in, x_out = float(up[0, 0]), float(up[-1, 0])
                order_u = up
                order_l = dn
            else:
                # For R, inner X > outer X (larger X -> smaller X)
                x_in, x_out = float(up[-1, 0]), float(up[0, 0])
                order_u = up
                order_l = dn
            ux_s, uz_s = order_u[:, 0], order_u[:, 1]
            lx_s, lz_s = order_l[:, 0], order_l[:, 1]

            def sample_eye_pt(frac: float, is_upper: bool) -> tuple[float, float]:
                xq = x_in + (x_out - x_in) * frac
                zq = float(np.interp(xq, ux_s if is_upper else lx_s, uz_s if is_upper else lz_s))
                return map_xz(xq, y_ref, zq)

            plan_xz[f'eyeInner{side}'] = sample_eye_pt(0.0, True)
            plan_xz[f'eyeUpper1{side}'] = sample_eye_pt(1.0 / 6.0, True)
            plan_xz[f'eyeUpper2{side}'] = sample_eye_pt(2.0 / 6.0, True)
            plan_xz[f'eyeUpper{side}'] = sample_eye_pt(0.5, True)
            plan_xz[f'eyeUpper4{side}'] = sample_eye_pt(4.0 / 6.0, True)
            plan_xz[f'eyeUpper5{side}'] = sample_eye_pt(5.0 / 6.0, True)
            plan_xz[f'eyeOuter{side}'] = sample_eye_pt(1.0, True)
            plan_xz[f'eyeLower5{side}'] = sample_eye_pt(5.0 / 6.0, False)
            plan_xz[f'eyeLower4{side}'] = sample_eye_pt(4.0 / 6.0, False)
            plan_xz[f'eyeLower{side}'] = sample_eye_pt(0.5, False)
            plan_xz[f'eyeLower2{side}'] = sample_eye_pt(2.0 / 6.0, False)
            plan_xz[f'eyeLower1{side}'] = sample_eye_pt(1.0 / 6.0, False)

        si = surgery_meta['seamInfo']
        cx_arr = si['curve_x']
        cz_arr = si['curve_z']
        cy_arr = si['curve_y']
        x_cr = float(si['x_corner_r'])
        x_cl = float(si['x_corner_l'])
        x_cm = 0.5 * (x_cr + x_cl)
        hw_m = max(0.5 * (x_cl - x_cr), 1e-4)

        def sample_mouth_pt(frac_x: float, lip_dz: float) -> tuple[float, float]:
            xq = x_cm + frac_x * hw_m
            zq = float(np.interp(xq, cx_arr, cz_arr)) + lip_dz
            yq = float(np.interp(xq, cx_arr, cy_arr))
            return map_xz(xq, yq, zq)

        # Slight lip-vermilion rim offset matches outer lip edge cleanly
        fh_pre = max(float(surgery_meta['frame']['face_h']), 1e-4)
        dz_up = 0.008 * fh_pre
        dz_dn = -0.010 * fh_pre
        plan_xz.update({
            'mouthCornerL': sample_mouth_pt(1.0, 0.0),
            'mouthUpperL2': sample_mouth_pt(0.68, 0.7 * dz_up),
            'mouthUpperL1': sample_mouth_pt(0.32, dz_up),
            'mouthUpper': sample_mouth_pt(0.0, 0.85 * dz_up),
            'mouthUpperR1': sample_mouth_pt(-0.32, dz_up),
            'mouthUpperR2': sample_mouth_pt(-0.68, 0.7 * dz_up),
            'mouthCornerR': sample_mouth_pt(-1.0, 0.0),
            'mouthLowerR2': sample_mouth_pt(-0.68, 0.7 * dz_dn),
            'mouthLowerR1': sample_mouth_pt(-0.32, dz_dn),
            'mouthLower': sample_mouth_pt(0.0, 1.05 * dz_dn),
            'mouthLowerL1': sample_mouth_pt(0.32, dz_dn),
            'mouthLowerL2': sample_mouth_pt(0.68, 0.7 * dz_dn),
        })

        for side in ('L', 'R'):
            ec = surgery_meta['eyeL' if side == 'L' else 'eyeR']
            ez_top = float(ec['upper_xz'][:, 1].max())
            eb_z = ez_top + max(0.35 * ec['height'], 0.032 * fh_pre)
            x_in_b = ec['x_range'][0] if side == 'L' else ec['x_range'][1]
            x_out_b = ec['x_range'][1] if side == 'L' else ec['x_range'][0]
            y_ref = float(ec.get('y_skin', 0.0))
            plan_xz[f'browInner{side}'] = map_xz(x_in_b, y_ref, eb_z)
            plan_xz[f'browMiddle{side}'] = map_xz(0.5 * (x_in_b + x_out_b), y_ref, eb_z + 0.012 * fh_pre)
            plan_xz[f'browOuter{side}'] = map_xz(x_out_b + (0.04 if side == 'L' else -0.04) * ec['width'], y_ref, eb_z + 0.004 * fh_pre)
    else:
        for side, sgn in (('L', 1.0), ('R', -1.0)):
            plan_xz[f'eyeInner{side}'] = (cx + sgn * 0.120 * head_w, z_eye)
            plan_xz[f'eyeUpper1{side}'] = (cx + sgn * 0.152 * head_w, z_eye + 0.022 * face_h)
            plan_xz[f'eyeUpper2{side}'] = (cx + sgn * 0.190 * head_w, z_eye + 0.034 * face_h)
            plan_xz[f'eyeUpper{side}'] = (cx + sgn * 0.230 * head_w, z_eye + 0.038 * face_h)
            plan_xz[f'eyeUpper4{side}'] = (cx + sgn * 0.270 * head_w, z_eye + 0.033 * face_h)
            plan_xz[f'eyeUpper5{side}'] = (cx + sgn * 0.308 * head_w, z_eye + 0.020 * face_h)
            plan_xz[f'eyeOuter{side}'] = (cx + sgn * 0.340 * head_w, z_eye)
            plan_xz[f'eyeLower5{side}'] = (cx + sgn * 0.308 * head_w, z_eye - 0.030 * face_h)
            plan_xz[f'eyeLower4{side}'] = (cx + sgn * 0.270 * head_w, z_eye - 0.048 * face_h)
            plan_xz[f'eyeLower{side}'] = (cx + sgn * 0.230 * head_w, z_eye - 0.056 * face_h)
            plan_xz[f'eyeLower2{side}'] = (cx + sgn * 0.190 * head_w, z_eye - 0.048 * face_h)
            plan_xz[f'eyeLower1{side}'] = (cx + sgn * 0.152 * head_w, z_eye - 0.030 * face_h)

        plan_xz.update({
            'mouthCornerL': (cx + 0.098 * head_w, z_mouth),
            'mouthUpperL2': (cx + 0.068 * head_w, z_mouth + 0.010 * face_h),
            'mouthUpperL1': (cx + 0.032 * head_w, z_mouth + 0.015 * face_h),
            'mouthUpper': (cx, z_mouth + 0.011 * face_h),
            'mouthUpperR1': (cx - 0.032 * head_w, z_mouth + 0.015 * face_h),
            'mouthUpperR2': (cx - 0.068 * head_w, z_mouth + 0.010 * face_h),
            'mouthCornerR': (cx - 0.098 * head_w, z_mouth),
            'mouthLowerR2': (cx - 0.066 * head_w, z_mouth - 0.010 * face_h),
            'mouthLowerR1': (cx - 0.032 * head_w, z_mouth - 0.015 * face_h),
            'mouthLower': (cx, z_mouth - 0.016 * face_h),
            'mouthLowerL1': (cx + 0.032 * head_w, z_mouth - 0.015 * face_h),
            'mouthLowerL2': (cx + 0.066 * head_w, z_mouth - 0.010 * face_h),
            'browInnerL': (cx + 0.11 * head_w, z_brow),
            'browMiddleL': (cx + 0.23 * head_w, z_brow + 0.016 * face_h),
            'browOuterL': (cx + 0.35 * head_w, z_brow + 0.006 * face_h),
            'browInnerR': (cx - 0.11 * head_w, z_brow),
            'browMiddleR': (cx - 0.23 * head_w, z_brow + 0.016 * face_h),
            'browOuterR': (cx - 0.35 * head_w, z_brow + 0.006 * face_h),
        })

    landmarks = {}
    ray_y = float(hpts[:, 1].min() - face_h)
    ray_dir = Vector((0.0, 1.0, 0.0))
    deep_y_limit = face_front_y + 0.11 * head_w
    snap_front_arr = front_arr[front_arr[:, 1] <= deep_y_limit]
    if len(snap_front_arr) < 10:
        snap_front_arr = front_arr
    for key, (px, pz) in plan_xz.items():
        hit = None
        if bvh is not None:
            loc, _norm, _idx, _dist = bvh.ray_cast(Vector((px, ray_y, pz)), ray_dir, 3.0 * face_h)
            if loc is not None and float(loc.y) <= deep_y_limit:
                hit = loc
        if hit is None:
            xz_dist = (snap_front_arr[:, 0] - px) ** 2 + (snap_front_arr[:, 2] - pz) ** 2
            nearest = snap_front_arr[int(np.argmin(xz_dist))]
            hit = Vector((float(nearest[0]), float(nearest[1]), float(nearest[2])))
        landmarks[key] = [round(float(hit.x), 5), round(float(hit.y), 5), round(float(hit.z), 5)]

    head_min_x = float(hpts[:, 0].min())
    head_min_y = float(hpts[:, 1].min())
    head_metrics = {
        'min': [round(head_min_x, 5), round(head_min_y, 5), round(chin_z, 5)],
        'max': [round(float(v), 5) for v in head_max],
        'height': round(face_h, 5),
        'width': round(head_w, 5),
        'noseZ': round(z_nose, 5),
        'center': [round(cx, 5), round(cy, 5), round(float(chin_z + 0.5 * face_h), 5)],
    }
    return landmarks, head_metrics


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
    parser.add_argument('--body')
    parser.add_argument('--head')
    parser.add_argument('--hair')
    parser.add_argument('--out-dir', required=True)
    parser.add_argument('--name', default='Avatar')
    parser.add_argument('--trim-body-head', action='store_true')
    parser.add_argument('--auto-surgery', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])

    if not args.body and not args.head:
        raise ValueError('At least --body or --head must be provided.')
    if args.body and not args.head and not args.hair:
        raise ValueError('When --body is provided, at least one of --head or --hair must be provided.')

    head_only = not bool(args.body)
    body_path = Path(args.body).resolve() if args.body else None
    head_path = Path(args.head).resolve() if args.head else None
    hair_path = Path(args.hair).resolve() if args.hair else None
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    staged_blend = out_dir / 'staged.blend'
    body_glb = out_dir / 'body.glb'
    head_glb = out_dir / 'head.glb'
    hair_glb = out_dir / 'hair.glb'
    stage_json = out_dir / 'stage.json'

    mtoon_api = load_sibling_module('charakit_mtoon_export', 'mtoon-export.py')
    fullbody_api = load_sibling_module('charakit_fullbody_to_vrm', 'fullbody-to-vrm.py')
    bh_api = load_sibling_module('charakit_body_hair_to_vrm', 'body-hair-to-vrm.py')

    mtoon_api.enable_vrm()
    fullbody_api.clear_scene()

    rig = None
    body_meshes = []
    mapped_bones = {}
    missing_required = []
    repaired_verts = 0
    head_bone_name = None
    neck_bone_name = None
    trimmed_body_verts = 0
    est_full_height = 1.6

    if body_path:
        body_imported = bh_api.import_model_with_textures(body_path)
        rig, body_meshes = fullbody_api.find_rig_and_meshes(body_imported)
        mapped_bones, missing_required = fullbody_api.configure_humanoid_bones(rig)
        repaired_verts = bh_api.repair_unweighted_vertices(body_meshes, rig)
        head_bone_name = mapped_bones.get('head')
        neck_bone_name = mapped_bones.get('neck')
        if not head_bone_name:
            raise RuntimeError('Body rig has no mapped VRM head bone.')

        pre_min, pre_max = bh_api.meshes_bounds(body_meshes)
        if neck_bone_name and neck_bone_name in rig.data.bones:
            neck_z = (rig.matrix_world @ rig.data.bones[neck_bone_name].head_local).z
            est_full_height = max(pre_max.z - pre_min.z, (neck_z - pre_min.z) / 0.83, 1e-4)
        else:
            est_full_height = max(pre_max.z - pre_min.z, 1e-4)

    head_meshes = []
    backup_objs = []
    head_pivot = None
    head_align_info = None
    surgery_meta = None
    auto_surgery_applied = False
    post_surgery_mat = Matrix.Identity(4)

    if head_path:
        if body_meshes and args.trim_body_head:
            trimmed_body_verts = trim_body_head_above_neck(body_meshes, rig, head_bone_name, neck_bone_name, est_full_height)
        head_imported = bh_api.import_model_with_textures(head_path)
        head_meshes = [o for o in head_imported if o.type == 'MESH' and not o.hide_render]
        if not head_meshes:
            raise RuntimeError(f'No meshes found in head model: {head_path}')
        for extra in head_imported:
            if extra not in head_meshes:
                bpy.data.objects.remove(extra, do_unlink=True)

        already_surgical = any(o.name.startswith('Eye_') or o.name == 'MouthBag' for o in head_meshes)
        if args.auto_surgery and not already_surgical:
            surgery_api = load_sibling_module('charakit_head_local_surgery', 'head-local-surgery.py')
            head_meshes, backup_obj, surgery_meta = surgery_api.perform_head_surgery_on_meshes(
                head_meshes, bh_api, sys.modules[__name__],
            )
            backup_objs = [backup_obj]
            auto_surgery_applied = True
            print(f'[stage-body-hair] Auto-surgery produced {len(head_meshes)} parts.')

        if head_only:
            for obj in [*head_meshes, *backup_objs]:
                bh_api.bake_mesh_world_transform(obj)
            bpy.context.view_layer.update()
            if not auto_surgery_applied:
                pts = bh_api.collect_meshes_points(head_meshes)
                rot_z, detected_front = detect_head_rotation_z(pts)
                if abs(rot_z) > 1e-6:
                    c_xy = Vector((float(pts[:, 0].mean()), float(pts[:, 1].mean()), 0.0))
                    rot_mat = Matrix.Translation(c_xy) @ Euler((0.0, 0.0, rot_z), 'XYZ').to_matrix().to_4x4() @ Matrix.Translation(-c_xy)
                    transform_objects_with_shapekeys([*head_meshes, *backup_objs], rot_mat)
                    post_surgery_mat = rot_mat
            h_min_raw, h_max_raw = bh_api.meshes_bounds(head_meshes)
            center_shift = Vector((
                -0.5 * float(h_min_raw.x + h_max_raw.x),
                -0.5 * float(h_min_raw.y + h_max_raw.y),
                -float(h_min_raw.z),
            ))
            shift_center_mat = Matrix.Translation(center_shift)
            transform_objects_with_shapekeys([*head_meshes, *backup_objs], shift_center_mat)
            post_surgery_mat = shift_center_mat @ post_surgery_mat
            h_min, h_max = bh_api.meshes_bounds(head_meshes)
            head_pivot = Vector((0.5 * float(h_min.x + h_max.x), 0.5 * float(h_min.y + h_max.y), float(h_min.z)))
            head_align_info = {
                'headOnly': True,
                'autoSurgeryApplied': auto_surgery_applied,
                'headMin': [round(float(v), 5) for v in h_min],
                'headMax': [round(float(v), 5) for v in h_max],
                'headPivot': [round(float(v), 5) for v in head_pivot],
            }
        else:
            head_pivot, align_total_mat, head_align_info = align_head_to_body(
                head_meshes, rig, head_bone_name, neck_bone_name, est_full_height, bh_api, backup_objs=backup_objs,
            )
            # In body+head mode with auto-surgery, align_total_mat maps pre-alignment surgical frame -> final body neck frame
            post_surgery_mat = align_total_mat

    hair_meshes = []
    align_info = None
    if hair_path and body_meshes:
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
            head_meshes=head_meshes or None,
        )
        c_vec = Vector(align_info['craniumCenter'])
        body_height = float(align_info['bodyHeight'])
    elif body_meshes:
        all_ref_min, all_ref_max = bh_api.meshes_bounds([*body_meshes, *head_meshes])
        body_height = max(float(all_ref_max.z - all_ref_min.z), est_full_height)
        h_min, h_max = bh_api.meshes_bounds(head_meshes)
        c_vec = Vector((0.5 * (h_min.x + h_max.x), 0.5 * (h_min.y + h_max.y), h_min.z + 0.55 * (h_max.z - h_min.z)))
    else:
        h_min, h_max = bh_api.meshes_bounds(head_meshes)
        body_height = max(float(h_max.z - h_min.z), 1e-4)
        c_vec = Vector((0.5 * (h_min.x + h_max.x), 0.5 * (h_min.y + h_max.y), h_min.z + 0.55 * (h_max.z - h_min.z)))

    all_meshes = [*body_meshes, *head_meshes, *hair_meshes]
    fullbody_api.ensure_materials(all_meshes)

    try:
        bpy.ops.file.pack_all()
    except Exception as exc:
        print(f'[stage-body-hair] pack_all warning: {exc}')

    save_res = bpy.ops.wm.save_as_mainfile(filepath=str(staged_blend), copy=True)
    if 'FINISHED' not in save_res:
        raise RuntimeError(f'Failed to save staged blend: {save_res}')

    if body_meshes and rig is not None:
        export_selected_glb([rig, *body_meshes], body_glb)

    body_min, body_max = bh_api.meshes_bounds([*body_meshes, *head_meshes])
    expr_targets = head_meshes if head_meshes else body_meshes
    skin_targets = [o for o in expr_targets if not is_aux_head_part(o.name)] or expr_targets
    face_landmarks, head_metrics = estimate_initial_face_landmarks(
        skin_targets,
        rig,
        head_bone_name,
        bh_api,
        mapped_bones,
        independent_head=bool(head_meshes),
        surgery_meta=surgery_meta,
        post_surgery_mat=post_surgery_mat if surgery_meta is not None else None,
    )
    face_vert_count = sum(len(o.data.vertices) for o in skin_targets)

    if head_meshes and head_pivot is not None:
        shift_head = Matrix.Translation(-head_pivot)
        transform_objects_with_shapekeys(head_meshes, shift_head)
        export_selected_glb(head_meshes, head_glb)

    if hair_meshes:
        shift_to_origin = Matrix.Translation(-c_vec)
        transform_objects_with_shapekeys(hair_meshes, shift_to_origin)
        export_selected_glb(hair_meshes, hair_glb)

    payload = {
        'name': args.name,
        'headOnly': head_only,
        'hasBody': bool(body_meshes),
        'rigName': rig.name if rig else None,
        'headBone': head_bone_name,
        'neckBone': neck_bone_name,
        'hasHead': bool(head_meshes),
        'hasHair': bool(hair_meshes),
        'autoSurgeryApplied': auto_surgery_applied,
        'surgeryParts': [m.name for m in head_meshes] if (auto_surgery_applied or any(m.name.startswith('Eye_') for m in head_meshes)) else [],
        'bodyMeshes': [m.name for m in body_meshes],
        'headMeshes': [m.name for m in head_meshes],
        'hairMeshes': [m.name for m in hair_meshes],
        'mappedBoneCount': len(mapped_bones),
        'missingRequiredBones': missing_required,
        'repairedUnweightedVerts': repaired_verts,
        'trimmedBodyVerts': trimmed_body_verts,
        'faceVertCount': face_vert_count,
        'headPivot': [round(float(v), 5) for v in head_pivot] if head_pivot is not None else None,
        'craniumCenter': [round(float(v), 5) for v in c_vec],
        'bodyHeight': round(body_height, 5),
        'bodyBounds': {
            'min': [round(float(v), 5) for v in body_min],
            'max': [round(float(v), 5) for v in body_max],
        },
        'headMetrics': head_metrics,
        'faceLandmarks': face_landmarks,
        'headAlignment': head_align_info,
        'hairAlignment': align_info,
        'stagedBlend': str(staged_blend),
        'bodyGlb': str(body_glb) if body_meshes else None,
        'headGlb': str(head_glb) if head_meshes else None,
        'hairGlb': str(hair_glb) if hair_meshes else None,
    }
    stage_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print('STAGE_BODY_HAIR_OK ' + json.dumps(payload, ensure_ascii=False))


if __name__ == '__main__':
    main()
