"""Combine a T-pose body model (FBX/GLB) and a hair model (FBX/GLB) into a
MToon VRM 1.0 + Blend, auto-aligning and binding hair to the head bone.

Run in background Blender (without --factory-startup so VRM Add-on remains enabled):
  Blender --background --disable-autoexec --python-exit-code 1 \
    --python scripts/body-hair-to-vrm.py -- \
    --body BODY.fbx --hair HAIR.fbx --out-vrm OUTPUT.vrm [--out-blend OUTPUT.blend]
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


def import_model_with_textures(filepath: Path):
    ext = filepath.suffix.lower()
    before = set(bpy.data.objects)
    if ext in {'.glb', '.gltf'}:
        bpy.ops.import_scene.gltf(filepath=str(filepath))
    elif ext == '.fbx':
        bpy.ops.import_scene.fbx(
            filepath=str(filepath),
            use_image_search=True,
            automatic_bone_orientation=False,
        )
    else:
        raise ValueError(f'Unsupported model format "{ext}". Expected .fbx, .glb, or .gltf')
    bpy.context.view_layer.update()
    return [o for o in bpy.data.objects if o not in before]


def meshes_bounds(meshes):
    min_pt = Vector((float('inf'), float('inf'), float('inf')))
    max_pt = Vector((float('-inf'), float('-inf'), float('-inf')))
    for obj in meshes:
        mat = obj.matrix_world
        for v in obj.data.vertices:
            p = mat @ v.co
            min_pt.x = min(min_pt.x, p.x)
            min_pt.y = min(min_pt.y, p.y)
            min_pt.z = min(min_pt.z, p.z)
            max_pt.x = max(max_pt.x, p.x)
            max_pt.y = max(max_pt.y, p.y)
            max_pt.z = max(max_pt.z, p.z)
    return min_pt, max_pt


def bake_mesh_world_transform(obj):
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = Matrix.Identity(4)
    obj.data.transform(world)
    obj.data.update()


def detect_hair_cavity_rotation_z(hair_meshes, hair_min, hair_max):
    """Detect which side has the open face cavity in the lower half of the hair, and return Z rotation to face -Y."""
    size = hair_max - hair_min
    cx = 0.5 * (hair_min.x + hair_max.x)
    cy = 0.5 * (hair_min.y + hair_max.y)
    z_mid = hair_min.z + 0.52 * size.z
    rx = max(size.x * 0.25, 1e-4)
    ry = max(size.y * 0.25, 1e-4)
    thresh_x = max(size.x * 0.15, 1e-4)
    thresh_y = max(size.y * 0.15, 1e-4)

    counts = {'neg_y': 0, 'pos_y': 0, 'neg_x': 0, 'pos_x': 0}
    for obj in hair_meshes:
        mat = obj.matrix_world
        for v in obj.data.vertices:
            p = mat @ v.co
            if p.z >= z_mid:
                continue
            dx, dy = p.x - cx, p.y - cy
            if abs(dx) < rx:
                if dy < -thresh_y:
                    counts['neg_y'] += 1
                elif dy > thresh_y:
                    counts['pos_y'] += 1
            if abs(dy) < ry:
                if dx < -thresh_x:
                    counts['neg_x'] += 1
                elif dx > thresh_x:
                    counts['pos_x'] += 1

    open_side = min(counts, key=counts.get)
    rot_map = {
        'neg_y': 0.0,
        'pos_y': math.pi,
        'pos_x': -math.pi / 2.0,
        'neg_x': math.pi / 2.0,
    }
    return rot_map[open_side], open_side, counts


def collect_head_vertices(body_meshes, head_z_world: float, body_height: float):
    z_cutoff = head_z_world - 0.01 * body_height
    pts = []
    for obj in body_meshes:
        mat = obj.matrix_world
        for v in obj.data.vertices:
            p = mat @ v.co
            if p.z >= z_cutoff:
                pts.append((p.x, p.y, p.z))
    if len(pts) < 30:
        raise RuntimeError('Could not locate head vertices on body mesh.')
    return np.array(pts, dtype=np.float32)


def collect_meshes_points(meshes):
    pts = []
    for obj in meshes:
        mat = obj.matrix_world
        for v in obj.data.vertices:
            p = mat @ v.co
            pts.append((p.x, p.y, p.z))
    return np.array(pts, dtype=np.float32)


def build_hair_bvh(hair_meshes):
    verts = []
    polys = []
    offset = 0
    for obj in hair_meshes:
        mesh = obj.data
        mesh.calc_loop_triangles()
        for v in mesh.vertices:
            verts.append(v.co.copy())
        for tri in mesh.loop_triangles:
            polys.append((offset + tri.vertices[0], offset + tri.vertices[1], offset + tri.vertices[2]))
        offset += len(mesh.vertices)
    return BVHTree.FromPolygons(verts, polys)


def align_hair_to_head(hair_meshes, body_meshes, rig, head_bone_name, hair_scale_mult, hair_offset):
    body_min, body_max = meshes_bounds(body_meshes)
    body_height = max(body_max.z - body_min.z, 1e-4)

    head_bone = rig.data.bones[head_bone_name]
    head_bone_world = rig.matrix_world @ head_bone.head_local
    hpts = collect_head_vertices(body_meshes, head_bone_world.z, body_height)

    hair_min, hair_max = meshes_bounds(hair_meshes)
    hair_size = hair_max - hair_min

    # Extract head cranium center & dome metrics from body head vertices.
    head_min = hpts.min(axis=0)
    head_max = hpts.max(axis=0)
    head_h = float(max(head_max[2] - head_min[2], 1e-4))
    crown_pts = hpts[hpts[:, 2] >= head_min[2] + 0.45 * head_h]
    if len(crown_pts) < 20:
        crown_pts = hpts

    px5, px95 = np.percentile(crown_pts[:, 0], [5.0, 95.0])
    py5, py95 = np.percentile(crown_pts[:, 1], [5.0, 95.0])
    cranium_cx = float(0.5 * (px5 + px95))
    cranium_cy = float(0.5 * (py5 + py95))
    cranium_cz = float(head_min[2] + 0.55 * head_h)
    cranium_rx = float(max(0.5 * (px95 - px5), 1e-4))
    cranium_ry = float(max(0.5 * (py95 - py5), 1e-4))
    cranium_top_z = float(np.percentile(crown_pts[:, 2], 99.0))
    cranium_center = np.array([cranium_cx, cranium_cy, cranium_cz], dtype=np.float32)
    c_vec = Vector((cranium_cx, cranium_cy, cranium_cz))

    # Detect whether hair is already aligned near the head or normalized at world origin.
    already_aligned = hair_min.z >= 0.45 * body_height and hair_size.z <= 0.45 * body_height
    if already_aligned:
        for obj in hair_meshes:
            bake_mesh_world_transform(obj)
        bpy.context.view_layer.update()
        if abs(hair_scale_mult - 1.0) > 1e-6 or any(abs(v) > 1e-6 for v in hair_offset):
            shift = Vector(hair_offset) * body_height
            adj_mat = Matrix.Translation(c_vec + shift) @ Matrix.Scale(hair_scale_mult, 4) @ Matrix.Translation(-c_vec)
            for obj in hair_meshes:
                obj.data.transform(adj_mat)
                obj.data.update()
            hair_min, hair_max = meshes_bounds(hair_meshes)
        return dict(
            mode='already_near_head',
            aligned=False,
            craniumCenter=[round(float(v), 5) for v in c_vec],
            bodyHeight=round(float(body_height), 5),
            autoScale=1.0,
            autoOffset=[0.0, 0.0, 0.0],
            hairMin=[round(v, 4) for v in hair_min],
            hairMax=[round(v, 4) for v in hair_max],
        )

    for obj in hair_meshes:
        bake_mesh_world_transform(obj)
    bpy.context.view_layer.update()

    hair_min, hair_max = meshes_bounds(hair_meshes)
    rot_z, open_side, cavity_counts = detect_hair_cavity_rotation_z(hair_meshes, hair_min, hair_max)

    if abs(rot_z) > 1e-6:
        center_xy = Vector((0.5 * (hair_min.x + hair_max.x), 0.5 * (hair_min.y + hair_max.y), 0.0))
        rot_mat = Matrix.Translation(center_xy) @ Euler((0.0, 0.0, rot_z), 'XYZ').to_matrix().to_4x4() @ Matrix.Translation(-center_xy)
        for obj in hair_meshes:
            obj.data.transform(rot_mat)
            obj.data.update()

    hair_min_loc, hair_max_loc = meshes_bounds(hair_meshes)
    hair_size_loc = hair_max_loc - hair_min_loc
    far_r = 3.0 * float(max(hair_size_loc.x, hair_size_loc.y, hair_size_loc.z, 1e-3))
    hair_bvh = build_hair_bvh(hair_meshes)

    scalp_mask = (
        (hpts[:, 2] >= cranium_cz)
        & ~((hpts[:, 1] < cranium_cy - 0.20 * cranium_ry) & (hpts[:, 2] < cranium_top_z - 0.22 * head_h))
    ) | (
        (hpts[:, 1] > cranium_cy + 0.15 * cranium_ry)
        & (hpts[:, 2] >= head_min[2] + 0.34 * head_h)
    )
    scalp_pts = hpts[scalp_mask]
    if len(scalp_pts) > 300:
        scalp_pts = scalp_pts[np.linspace(0, len(scalp_pts) - 1, 300, dtype=int)]
    d_s = scalp_pts - cranium_center[None, :]
    r_s = np.linalg.norm(d_s, axis=1)
    valid_s = r_s > 1e-5
    d_s, r_s = d_s[valid_s], r_s[valid_s]
    u_s = d_s / r_s[:, None]
    scalp_rays = [(Vector(u_s[i].tolist()), float(r_s[i])) for i in range(len(r_s))]

    face_mask_pts = (
        (np.abs(hpts[:, 0] - cranium_cx) <= 0.52 * cranium_rx)
        & (hpts[:, 1] <= cranium_cy - 0.35 * cranium_ry)
        & (hpts[:, 2] >= head_min[2] + 0.20 * head_h)
        & (hpts[:, 2] <= head_min[2] + 0.58 * head_h)
    )
    face_pts = hpts[face_mask_pts]
    if len(face_pts) > 60:
        face_pts = face_pts[np.linspace(0, len(face_pts) - 1, 60, dtype=int)]
    face_rays = []
    if len(face_pts) > 0:
        d_f = face_pts - cranium_center[None, :]
        r_f = np.linalg.norm(d_f, axis=1)
        for i in range(len(r_f)):
            if r_f[i] > 1e-5:
                u_f = d_f[i] / r_f[i]
                face_rays.append((Vector(u_f.tolist()), float(r_f[i])))

    # 2. Phase 1: robust initial scale from upper-60% hair width + crown-band top alignment.
    raw_hair_pts = collect_meshes_points(hair_meshes)
    z40, z75 = np.percentile(raw_hair_pts[:, 2], [40.0, 75.0])
    upper_band = raw_hair_pts[raw_hair_pts[:, 2] >= z40]
    ux5, ux95 = np.percentile(upper_band[:, 0], [5.0, 95.0])
    uy5, uy95 = np.percentile(upper_band[:, 1], [5.0, 95.0])
    hair_upper_w = float(max(ux95 - ux5, 1e-4))
    hair_upper_d = float(max(uy95 - uy5, 1e-4))

    crown_band = raw_hair_pts[raw_hair_pts[:, 2] >= z75]
    hx10, hx90 = np.percentile(crown_band[:, 0], [10.0, 90.0])
    hy10, hy90 = np.percentile(crown_band[:, 1], [10.0, 90.0])
    hcx = float(0.5 * (hx10 + hx90))
    hcy = float(0.5 * (hy10 + hy90))
    hair_top_z = float(np.percentile(raw_hair_pts[:, 2], 98.0))

    s_w = 1.65 * (2.0 * cranium_rx) / hair_upper_w
    s_d = 1.50 * (2.0 * cranium_ry) / hair_upper_d
    s0 = min(s_w, s_d)
    t0 = Vector((
        cranium_cx - hcx * s0,
        cranium_cy - hcy * s0,
        (cranium_top_z + 0.08 * head_h) - hair_top_z * s0,
    ))

    min_margin = 0.015 * head_h
    max_snug_side = 0.12 * head_h
    max_snug_top = 0.35 * head_h
    cov_margin = 0.005 * head_h
    face_clearance = 0.005 * head_h

    def eval_fit(ds, dx, dy, dz, rx, ds_x, ds_ref=1.0):
        shift_vec = Vector((dx, dy, dz))
        R_inv = Euler((-rx, 0.0, 0.0), 'XYZ').to_matrix()
        inv_sx = 1.0 / (ds * ds_x)
        inv_s = 1.0 / ds
        neg_sh = R_inv @ (-shift_vec)
        c_loc = Vector((
            (c_vec.x - t0.x + neg_sh.x * inv_sx) / s0,
            (c_vec.y - t0.y + neg_sh.y * inv_s) / s0,
            (c_vec.z - t0.z + neg_sh.z * inv_s) / s0,
        ))

        poke_sq = 0.0
        poke_hits = 0
        loose_side_sq = 0.0
        loose_top_sq = 0.0
        inner_gap_sq = 0.0
        inner_ratios = []
        cov_hits = 0

        for u_dir, r_scalp in scalp_rays:
            r_u = R_inv @ u_dir
            dir_raw = Vector((r_u.x * inv_sx / s0, r_u.y * inv_s / s0, r_u.z * inv_s / s0))
            dir_len = dir_raw.length
            if dir_len <= 1e-8:
                continue
            u_loc = dir_raw / dir_len
            origin = c_loc + u_loc * far_r
            _loc, _norm, _idx, hit_dist = hair_bvh.ray_cast(origin, -u_loc, far_r)
            r_outer = (far_r - hit_dist) / dir_len if hit_dist is not None else 0.0
            if r_outer >= r_scalp + cov_margin:
                cov_hits += 1
            poke = (r_scalp + min_margin) - r_outer
            if poke > 0.0:
                poke_sq += (poke / head_h) ** 2
                poke_hits += 1
            if u_dir.z < 0.7:
                loose = r_outer - (r_scalp + max_snug_side)
                if loose > 0.0:
                    loose_side_sq += (loose / head_h) ** 2
            else:
                loose = r_outer - (r_scalp + max_snug_top)
                if loose > 0.0:
                    loose_top_sq += (loose / head_h) ** 2

            _in_loc, _in_norm, _in_idx, hit_in_dist = hair_bvh.ray_cast(c_loc, u_loc, far_r)
            if hit_in_dist is not None:
                r_inner = hit_in_dist / dir_len
                inner_ratios.append(r_inner / r_scalp)
                inner_gap = r_inner - r_scalp * 1.05
                if inner_gap > 0.0:
                    inner_gap_sq += (inner_gap / head_h) ** 2

        n_s = max(len(scalp_rays), 1)
        n_inner = max(len(inner_ratios), 1)
        inner_ratio_med = float(np.median(inner_ratios)) if inner_ratios else 0.0
        occluded = 0
        for u_dir, r_face in face_rays:
            r_u = R_inv @ u_dir
            dir_raw = Vector((r_u.x * inv_sx / s0, r_u.y * inv_s / s0, r_u.z * inv_s / s0))
            dir_len = dir_raw.length
            if dir_len <= 1e-8:
                continue
            u_loc = dir_raw / dir_len
            origin = c_loc + u_loc * far_r
            _loc, _norm, _idx, hit_dist = hair_bvh.ray_cast(origin, -u_loc, far_r)
            if hit_dist is not None:
                r_outer = (far_r - hit_dist) / dir_len
                if r_outer > r_face - face_clearance:
                    occluded += 1

        n_f = max(len(face_rays), 1)
        loss = (
            400.0 * (poke_sq / n_s)
            + 60.0 * (poke_hits / n_s)
            + 20.0 * (inner_gap_sq / n_inner)
            + 8.0 * (loose_side_sq / n_s)
            + 2.0 * (loose_top_sq / n_s)
            + 140.0 * (occluded / n_f)
            + 1.0 * ((ds - ds_ref) ** 2)
            + 0.8 * ((ds_x - 1.0) ** 2)
            + 2.0 * ((dx / head_h) ** 2)
            + 0.2 * ((dy / head_h) ** 2 + (dz / head_h) ** 2)
            + 0.4 * (rx ** 2)
        )
        return loss, cov_hits / n_s, occluded, inner_ratio_med

    # 3. Pass A: placement only (dx, dy, dz, rx) with ds = 1.0, ds_x = 1.0 locked.
    best_ds, best_dx, best_dy, best_dz, best_rx, best_ds_x = 1.0, 0.0, 0.0, 0.0, 0.0, 1.0
    best_loss, best_cov, best_occ, best_inner_med = eval_fit(
        best_ds, best_dx, best_dy, best_dz, best_rx, best_ds_x, ds_ref=1.0
    )

    pass_a_steps = (
        (0.08 * head_h, 0.10),
        (0.03 * head_h, 0.04),
        (0.01 * head_h, 0.015),
    )
    for d_step, rx_step in pass_a_steps:
        for _ in range(2):
            improved = False
            for axis, delta_vals in (
                (1, (-2 * d_step, -d_step, d_step, 2 * d_step)),
                (2, (-2 * d_step, -d_step, d_step, 2 * d_step)),
                (3, (-2 * d_step, -d_step, d_step, 2 * d_step)),
                (4, (-2 * rx_step, -rx_step, rx_step, 2 * rx_step)),
            ):
                cand_base = [best_ds, best_dx, best_dy, best_dz, best_rx, best_ds_x]
                for dv in delta_vals:
                    cand = list(cand_base)
                    cand[axis] += dv
                    if cand[4] < -0.32 or cand[4] > 0.32:
                        continue
                    loss, cov, occ, inner_med = eval_fit(*cand, ds_ref=1.0)
                    if loss + 1e-7 < best_loss:
                        best_loss, best_cov, best_occ, best_inner_med = loss, cov, occ, inner_med
                        best_ds, best_dx, best_dy, best_dz, best_rx, best_ds_x = cand
                        improved = True
            if not improved:
                break

    # 4. Cavity scale calibration at the true cavity center.
    if best_inner_med > 1.05:
        ds_cal = max(0.75, min(1.02, 1.02 / best_inner_med))
    elif 0.0 < best_inner_med < 0.88:
        ds_cal = min(1.05, 0.94 / best_inner_med)
    else:
        ds_cal = 1.0

    best_ds = ds_cal
    best_loss, best_cov, best_occ, best_inner_med = eval_fit(
        best_ds, best_dx, best_dy, best_dz, best_rx, best_ds_x, ds_ref=ds_cal
    )

    # 5. Pass B: final 6-DOF fine-tuning tightly bounded around ds_cal.
    ds_lo = max(0.75, ds_cal * 0.92)
    ds_hi = min(1.06, ds_cal * 1.05)
    pass_b_steps = (
        (0.025, 0.03 * head_h, 0.04),
        (0.01, 0.01 * head_h, 0.015),
        (0.004, 0.004 * head_h, 0.005),
    )
    for ds_step, d_step, rx_step in pass_b_steps:
        for _ in range(2):
            improved = False
            for axis, delta_vals in (
                (0, (-2 * ds_step, -ds_step, ds_step, 2 * ds_step)),
                (1, (-2 * d_step, -d_step, d_step, 2 * d_step)),
                (2, (-2 * d_step, -d_step, d_step, 2 * d_step)),
                (3, (-2 * d_step, -d_step, d_step, 2 * d_step)),
                (4, (-2 * rx_step, -rx_step, rx_step, 2 * rx_step)),
                (5, (-2 * ds_step, -ds_step, ds_step, 2 * ds_step)),
            ):
                cand_base = [best_ds, best_dx, best_dy, best_dz, best_rx, best_ds_x]
                for dv in delta_vals:
                    cand = list(cand_base)
                    cand[axis] += dv
                    if cand[0] < ds_lo or cand[0] > ds_hi:
                        continue
                    if cand[4] < -0.32 or cand[4] > 0.32:
                        continue
                    if cand[5] < 0.88 or cand[5] > 1.02:
                        continue
                    loss, cov, occ, inner_med = eval_fit(*cand, ds_ref=ds_cal)
                    if loss + 1e-7 < best_loss:
                        best_loss, best_cov, best_occ, best_inner_med = loss, cov, occ, inner_med
                        best_ds, best_dx, best_dy, best_dz, best_rx, best_ds_x = cand
                        improved = True
            if not improved:
                break

    # Apply Phase 1 + Phase 2 transform + optional manual fine-tuning around cranium center.
    auto_shift = Vector((best_dx, best_dy, best_dz))
    manual_shift = Vector(hair_offset) * body_height

    s_mult = best_ds * hair_scale_mult
    total_scale = s0 * s_mult
    S_mat = Matrix.Diagonal((s_mult * best_ds_x, s_mult, s_mult, 1.0))
    final_mat = (
        Matrix.Translation(c_vec + auto_shift + manual_shift)
        @ Euler((best_rx, 0.0, 0.0), 'XYZ').to_matrix().to_4x4()
        @ S_mat
        @ Matrix.Translation(t0 - c_vec)
        @ Matrix.Scale(s0, 4)
    )
    for obj in hair_meshes:
        obj.data.transform(final_mat)
        obj.data.update()

    final_min, final_max = meshes_bounds(hair_meshes)
    auto_offset_norm = [round(v / body_height, 5) for v in (best_dx, best_dy, best_dz)]
    return dict(
        mode='auto_cranium_fit',
        aligned=True,
        craniumCenter=[round(float(v), 5) for v in c_vec],
        bodyHeight=round(float(body_height), 5),
        openSide=open_side,
        cavityCounts=cavity_counts,
        rotationZDeg=round(math.degrees(rot_z), 2),
        autoPitchDeg=round(math.degrees(best_rx), 2),
        cavityBaseScale=round(float(s0), 5),
        autoScale=round(float(s0 * best_ds), 5),
        autoScaleX=round(float(s0 * best_ds * best_ds_x), 5),
        scale=round(float(total_scale), 5),
        autoOffset=auto_offset_norm,
        manualOffset=[round(v, 5) for v in hair_offset],
        scalpCoverage=round(best_cov, 4),
        innerRatioMedian=round(best_inner_med, 4),
        faceOccluded=best_occ,
        fitLoss=round(best_loss, 4),
        hairFinalMin=[round(v, 4) for v in final_min],
        hairFinalMax=[round(v, 4) for v in final_max],
    )


def bind_hair_to_head(hair_meshes, rig, head_bone_name):
    for obj in hair_meshes:
        for mod in list(obj.modifiers):
            if mod.type == 'ARMATURE':
                obj.modifiers.remove(mod)
        obj.vertex_groups.clear()
        vg = obj.vertex_groups.new(name=head_bone_name)
        vg.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
        obj.parent = rig
        obj.matrix_parent_inverse = rig.matrix_world.inverted()
        arm_mod = obj.modifiers.new('Armature', 'ARMATURE')
        arm_mod.object = rig


def repair_unweighted_vertices(meshes, rig):
    """Remove loose face-less vertices and fill zero-weight vertices from weighted neighbors or KDTree."""
    deform_bones = {b.name for b in rig.data.bones if b.use_deform}
    total_repaired = 0

    for obj in meshes:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context='VERTS')
            bm.to_mesh(obj.data)
            obj.data.update()
        bm.free()

        gnames = {g.index: g.name for g in obj.vertex_groups}
        vert_weights = []
        missing = []
        for v in obj.data.vertices:
            ws = {}
            for g in v.groups:
                bname = gnames.get(g.group)
                if bname in deform_bones and g.weight > 1e-6:
                    ws[bname] = ws.get(bname, 0.0) + g.weight
            tot = sum(ws.values())
            if tot < 1e-4:
                vert_weights.append(None)
                missing.append(v.index)
            else:
                vert_weights.append({k: val / tot for k, val in ws.items()})

        if not missing:
            continue

        # Build edge adjacency for local graph propagation.
        adj = [[] for _ in range(len(obj.data.vertices))]
        for e in obj.data.edges:
            a, b = e.vertices[0], e.vertices[1]
            adj[a].append(b)
            adj[b].append(a)

        remaining = list(missing)
        for _ in range(4):
            still = []
            updates = {}
            for vid in remaining:
                acc = {}
                cnt = 0
                for nb in adj[vid]:
                    nw = vert_weights[nb]
                    if nw:
                        cnt += 1
                        for k, val in nw.items():
                            acc[k] = acc.get(k, 0.0) + val
                if cnt > 0:
                    tot = sum(acc.values())
                    if tot > 1e-6:
                        updates[vid] = {k: val / tot for k, val in acc.items()}
                        continue
                still.append(vid)
            for vid, ws in updates.items():
                vert_weights[vid] = ws
            remaining = still
            if not remaining or not updates:
                break

        # Fallback to KDTree nearest weighted vertex for any isolated islands.
        if remaining:
            weighted_indices = [i for i, ws in enumerate(vert_weights) if ws]
            if weighted_indices:
                kd = KDTree(len(weighted_indices))
                for idx in weighted_indices:
                    kd.insert(obj.data.vertices[idx].co, idx)
                kd.balance()
                for vid in remaining:
                    _co, nearest_idx, _dist = kd.find(obj.data.vertices[vid].co)
                    vert_weights[vid] = dict(vert_weights[nearest_idx])

        for vid in missing:
            ws = vert_weights[vid]
            if not ws:
                continue
            for bname, weight in ws.items():
                vg = obj.vertex_groups.get(bname) or obj.vertex_groups.new(name=bname)
                vg.add([vid], weight, 'REPLACE')
            total_repaired += 1

    return total_repaired


def parse_offset(raw: str):
    parts = [p.strip() for p in raw.split(',')]
    if len(parts) != 3:
        raise ValueError('--hair-offset must be "x,y,z"')
    vals = [float(p) for p in parts]
    if any(not math.isfinite(v) for v in vals):
        raise ValueError('--hair-offset values must be finite numbers')
    return tuple(vals)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--body', required=True)
    parser.add_argument('--hair', required=True)
    parser.add_argument('--out-vrm', required=True)
    parser.add_argument('--out-blend')
    parser.add_argument('--name', default='Avatar')
    parser.add_argument('--author', default='Charakuru Local Blender')
    parser.add_argument('--target-height', type=float, default=1.6)
    parser.add_argument('--hair-scale-mult', type=float, default=1.0)
    parser.add_argument('--hair-offset', default='0,0,0')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])

    body_path = Path(args.body).resolve()
    hair_path = Path(args.hair).resolve()
    out_vrm = Path(args.out_vrm).resolve()
    out_blend = Path(args.out_blend).resolve() if args.out_blend else None
    hair_offset = parse_offset(args.hair_offset)

    mtoon_api = load_sibling_module('charakit_mtoon_export', 'mtoon-export.py')
    fullbody_api = load_sibling_module('charakit_fullbody_to_vrm', 'fullbody-to-vrm.py')

    mtoon_api.enable_vrm()
    fullbody_api.clear_scene()

    body_imported = import_model_with_textures(body_path)
    rig, body_meshes = fullbody_api.find_rig_and_meshes(body_imported)
    mapped_bones, missing_required = fullbody_api.configure_humanoid_bones(rig)
    repaired_verts = repair_unweighted_vertices(body_meshes, rig)
    head_bone_name = mapped_bones.get('head')
    if not head_bone_name:
        raise RuntimeError('Body rig has no mapped VRM head bone.')

    hair_imported = import_model_with_textures(hair_path)
    hair_meshes = [o for o in hair_imported if o.type == 'MESH' and not o.hide_render]
    if not hair_meshes:
        raise RuntimeError(f'No meshes found in hair model: {hair_path}')
    for extra in hair_imported:
        if extra not in hair_meshes:
            bpy.data.objects.remove(extra, do_unlink=True)

    align_info = align_hair_to_head(
        hair_meshes,
        body_meshes,
        rig,
        head_bone_name,
        args.hair_scale_mult,
        hair_offset,
    )
    bind_hair_to_head(hair_meshes, rig, head_bone_name)

    all_meshes = [*body_meshes, *hair_meshes]
    transform_info = fullbody_api.normalize_rig_and_meshes(rig, all_meshes, args.target_height)

    meta = rig.data.vrm_addon_extension.vrm1.meta
    meta.vrm_name = args.name
    if not meta.authors:
        meta.authors.add().value = args.author

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
            print(f'[body-hair-to-vrm] pack_all warning: {exc}')
        save_res = bpy.ops.wm.save_as_mainfile(filepath=str(out_blend), copy=True)
        if 'FINISHED' not in save_res:
            raise RuntimeError(f'Failed to save blend file: {save_res}')

    summary = {
        'body': str(body_path),
        'hair': str(hair_path),
        'outVrm': str(out_vrm),
        'outBlend': str(out_blend) if out_blend else None,
        'vrmBytes': out_vrm.stat().st_size,
        'rigName': rig.name,
        'headBone': head_bone_name,
        'bodyMeshes': [m.name for m in body_meshes],
        'hairMeshes': [m.name for m in hair_meshes],
        'mappedBoneCount': len(mapped_bones),
        'missingRequiredBones': missing_required,
        'repairedUnweightedVerts': repaired_verts,
        'hairAlignment': align_info,
        'transform': transform_info,
        'mtoon': mtoon_report,
        'inspect': vrm_report,
    }
    print('BODY_HAIR_VRM_OK ' + json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
