"""Generate 23 eye/mouth/brow Shape Keys (EA_*) on staged body meshes from face landmarks.

Run in background Blender (opening staged.blend, without --factory-startup):
  Blender --background staged.blend --disable-autoexec --python-exit-code 1 \
    --python scripts/body-hair-expressions.py -- \
    --stage-json stage.json --landmarks-json landmarks.json \
    --out-blend staged_expr.blend --out-body-glb body_expr.glb \
    [--parts eyes,mouth,brows]
"""
import argparse
import heapq
import importlib.util
import json
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector


def load_sibling_module(name: str, filename: str):
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def basis_world(obj) -> np.ndarray:
    data = obj.data.shape_keys.key_blocks[0].data if obj.data.shape_keys else obj.data.vertices
    mat = obj.matrix_world
    return np.array([mat @ v.co for v in data], dtype=float)


def ensure_expression_key(obj, key_name: str):
    if not obj.data.shape_keys:
        obj.shape_key_add(name='Basis')
    sk = obj.data.shape_keys.key_blocks.get(key_name)
    if sk is None:
        sk = obj.shape_key_add(name=key_name, from_mix=False)
    sk.value = 0.0
    return sk


def write_world_delta(obj, expr_name: str, world_delta: np.ndarray):
    key = ensure_expression_key(obj, f'EA_{expr_name}')
    basis = np.array([v.co for v in obj.data.shape_keys.key_blocks[0].data], dtype=float)
    inv_3x3 = np.array(obj.matrix_world.inverted().to_3x3(), dtype=float)
    coords = basis + (world_delta @ inv_3x3.T)
    if not np.isfinite(coords).all():
        raise ValueError(f'Non-finite coordinates when writing EA_{expr_name} on {obj.name}')
    for v, co in zip(key.data, coords):
        v.co = co
    obj.data.update()


def smoothstep(x):
    t = np.clip(x, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def donor_eye_contour_anchors(donor):
    """Extract extra intermediate upper/lower eyelid XZ anchors from the donor blink mask opening loops."""
    pts = np.array(donor['neutral'], dtype=float)
    ec = {}
    for f in donor['faces']:
        for i in range(len(f)):
            a, b = f[i], f[(i + 1) % len(f)]
            e = (a, b) if a < b else (b, a)
            ec[e] = ec.get(e, 0) + 1
    adj = {}
    for (a, b), c in ec.items():
        if c == 1:
            adj.setdefault(a, set()).add(b)
            adj.setdefault(b, set()).add(a)
    seen = set()
    loops = []
    for v in adj:
        if v in seen:
            continue
        loop = []
        cur = v
        prev = None
        while cur not in seen:
            seen.add(cur)
            loop.append(cur)
            nxts = [u for u in adj[cur] if u != prev]
            prev = cur
            cur = nxts[0] if nxts else cur
        if len(loop) >= 6:
            loops.append(loop)

    dense_extra = {}
    legacy_extra = {}
    for side in ('L', 'R'):
        in_xz = np.array(donor['landmarks'][f'eyeInner{side}'], dtype=float)
        out_xz = np.array(donor['landmarks'][f'eyeOuter{side}'], dtype=float)
        best_loop = min(
            loops,
            key=lambda lp: float(np.linalg.norm(pts[lp][:, [0, 2]] - in_xz, axis=1).min()),
            default=None,
        )
        if not best_loop:
            continue
        lp_xz = pts[best_loop][:, [0, 2]]
        i_in = int(np.argmin(np.linalg.norm(lp_xz - in_xz, axis=1)))
        i_out = int(np.argmin(np.linalg.norm(lp_xz - out_xz, axis=1)))
        if i_in == i_out:
            continue
        n = len(best_loop)
        arc_a = [best_loop[(i_in + k) % n] for k in range(((i_out - i_in) % n) + 1)]
        arc_b = [best_loop[(i_in - k) % n] for k in range(((i_in - i_out) % n) + 1)]
        if pts[arc_a, 2].mean() >= pts[arc_b, 2].mean():
            upper_arc, lower_arc = arc_a, arc_b
        else:
            upper_arc, lower_arc = arc_b, arc_a
        for tag, arc in (('Upper', upper_arc), ('Lower', lower_arc)):
            xy = pts[arc][:, [0, 2]]
            d = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(xy, axis=0), axis=1))]
            if d[-1] < 1e-8:
                continue
            u = d / d[-1]
            for slot, frac in (('1', 1.0 / 6.0), ('2', 2.0 / 6.0), ('4', 4.0 / 6.0), ('5', 5.0 / 6.0)):
                dense_extra[f'eye{tag}{slot}{side}'] = [float(np.interp(frac, u, xy[:, 0])), float(np.interp(frac, u, xy[:, 1]))]
            legacy_extra[f'eye{tag}Inner{side}'] = [float(np.interp(0.28, u, xy[:, 0])), float(np.interp(0.28, u, xy[:, 1]))]
            legacy_extra[f'eye{tag}Outer{side}'] = [float(np.interp(0.72, u, xy[:, 0])), float(np.interp(0.72, u, xy[:, 1]))]
    return dense_extra, legacy_extra


def classify_skin_components(obj, landmarks_world, head_metrics):
    """Identify main skin shell, eye-area follower components (sculpted lashes/lid ridges), and internal mouth pocket shells."""
    n_verts = len(obj.data.vertices)
    if n_verts == 0 or not obj.data.polygons:
        return np.ones(n_verts, dtype=bool), np.zeros(n_verts, dtype=bool), np.zeros(n_verts, dtype=bool)

    adj = [set() for _ in range(n_verts)]
    for p in obj.data.polygons:
        vs = list(p.vertices)
        for i in range(len(vs)):
            a, b = vs[i], vs[(i + 1) % len(vs)]
            if a != b:
                adj[a].add(b)
                adj[b].add(a)

    visited = np.zeros(n_verts, dtype=bool)
    comps = []
    for start in range(n_verts):
        if visited[start]:
            continue
        q = [start]
        visited[start] = True
        comp = []
        while q:
            u = q.pop()
            comp.append(u)
            for nb in adj[u]:
                if not visited[nb]:
                    visited[nb] = True
                    q.append(nb)
        comps.append(comp)

    comps.sort(key=len, reverse=True)
    main_mask = np.zeros(n_verts, dtype=bool)
    follower_mask = np.zeros(n_verts, dtype=bool)
    mouth_shell_mask = np.zeros(n_verts, dtype=bool)
    main_mask[comps[0]] = True
    if len(comps) <= 1:
        return main_mask, follower_mask, mouth_shell_mask

    xyz = basis_world(obj)
    head_h = max(float(head_metrics.get('height', 0.2)), 1e-4)
    head_w = max(float(head_metrics.get('width', 0.16)), 1e-4)
    cx = float(head_metrics['center'][0])
    chin_z = float(head_metrics['min'][2])
    nose_z = float(head_metrics.get('noseZ', chin_z + 0.36 * head_h))

    eye_pts = np.array([
        landmarks_world[k] for k in (
            'eyeInnerL', 'eyeOuterL', 'eyeUpperL', 'eyeLowerL',
            'eyeInnerR', 'eyeOuterR', 'eyeUpperR', 'eyeLowerR',
        ) if k in landmarks_world
    ], dtype=float)
    mouth_pts = np.array([
        landmarks_world[k] for k in ('mouthCornerL', 'mouthCornerR', 'mouthUpper', 'mouthLower')
        if k in landmarks_world
    ], dtype=float)

    if len(eye_pts):
        eye_h = max(float(eye_pts[:, 2].max() - eye_pts[:, 2].min()), 0.04 * head_h)
        eye_z0 = float(eye_pts[:, 2].min()) - 0.55 * eye_h
        eye_z1 = float(eye_pts[:, 2].max()) + 0.55 * eye_h
        eye_y1 = float(eye_pts[:, 1].max()) + 0.55 * eye_h
        eye_x_span = max(float(eye_pts[:, 0].max() - eye_pts[:, 0].min()), 0.15 * head_w)
    else:
        eye_z0, eye_z1, eye_y1, eye_x_span = chin_z + 0.4 * head_h, chin_z + 0.7 * head_h, 0.0, 0.7 * head_w

    if len(mouth_pts):
        m_cx = float(mouth_pts[:, 0].mean())
        m_cy = float(mouth_pts[:, 1].mean())
        m_w = max(float(mouth_pts[:, 0].max() - mouth_pts[:, 0].min()), 0.12 * head_w)
    else:
        m_cx, m_cy, m_w = cx, float(head_metrics['center'][1]), 0.2 * head_w

    n_main = len(comps[0])
    for comp in comps[1:]:
        pts_c = xyz[comp]
        c_mean = pts_c.mean(axis=0)
        # Sculpted upper lid ridges & lower eyelash strands sit compactly in front eye region
        in_eye = (
            len(comp) <= 0.18 * n_main
            and abs(float(c_mean[0]) - cx) <= 0.65 * eye_x_span
            and eye_z0 <= float(c_mean[2]) <= eye_z1
            and float(c_mean[1]) <= eye_y1
        )
        if in_eye:
            follower_mask[comp] = True
            continue
        # Internal nose/mouth/chin pocket shells overlap lower face mouth/chin zone
        near_mouth = (
            (np.abs(pts_c[:, 0] - m_cx) <= 1.15 * m_w)
            & (pts_c[:, 2] <= nose_z + 0.02 * head_h)
            & (pts_c[:, 2] >= chin_z - 0.06 * head_h)
            & (pts_c[:, 1] <= m_cy + 0.80 * m_w)
        )
        if np.any(near_mouth):
            mouth_shell_mask[np.array(comp, dtype=int)[near_mouth]] = True

    return main_mask, follower_mask, mouth_shell_mask


def generate_eye_expressions(body_meshes, landmarks_world, center, scale, em, head_metrics=None, eye_meshes=None):
    donor = em.asset()
    neutral = np.array(donor['neutral'], dtype=float)
    dense_extra, legacy_extra = donor_eye_contour_anchors(donor)

    dense_eye_keys = []
    for side in ('L', 'R'):
        dense_eye_keys.extend([
            f'eyeInner{side}', f'eyeUpper1{side}', f'eyeUpper2{side}', f'eyeUpper{side}', f'eyeUpper4{side}', f'eyeUpper5{side}',
            f'eyeOuter{side}', f'eyeLower5{side}', f'eyeLower4{side}', f'eyeLower{side}', f'eyeLower2{side}', f'eyeLower1{side}',
        ])
    legacy16_keys = [
        'eyeInnerL', 'eyeUpperInnerL', 'eyeUpperL', 'eyeUpperOuterL', 'eyeOuterL', 'eyeLowerOuterL', 'eyeLowerL', 'eyeLowerInnerL',
        'eyeInnerR', 'eyeUpperInnerR', 'eyeUpperR', 'eyeUpperOuterR', 'eyeOuterR', 'eyeLowerOuterR', 'eyeLowerR', 'eyeLowerInnerR',
    ]
    uses_dense24 = any(k in landmarks_world for k in dense_extra)
    active_extra = dense_extra if uses_dense24 else legacy_extra
    all_donor_landmarks = {**donor['landmarks'], **{k: v for k, v in active_extra.items() if k in landmarks_world}}
    candidate_keys = dense_eye_keys if uses_dense24 else legacy16_keys
    eye_keys = [k for k in candidate_keys if k in landmarks_world and k in all_donor_landmarks]
    eye_canon = {k: ((np.array(landmarks_world[k], dtype=float) - center) / scale) for k in eye_keys}

    # Affine fit from all active eye contour XZ landmarks to remaining global mask XZ anchors + TPS warp
    source_eye = np.array([all_donor_landmarks[k] for k in eye_keys], dtype=float)
    target_eye = np.array([eye_canon[k][[0, 2]] for k in eye_keys], dtype=float)
    affine = np.linalg.lstsq(np.c_[source_eye, np.ones(len(source_eye))], target_eye, rcond=None)[0]
    fitted_anchors = {k: (np.r_[v, 1.0] @ affine).tolist() for k, v in all_donor_landmarks.items()}
    for k in eye_keys:
        fitted_anchors[k] = eye_canon[k][[0, 2]].tolist()
    for k in ('browInnerL', 'browMiddleL', 'browOuterL', 'browInnerR', 'browMiddleR', 'browOuterR', 'mouthCornerL', 'mouthCornerR'):
        if k in landmarks_world and k in fitted_anchors:
            p_c = (np.array(landmarks_world[k], dtype=float) - center) / scale
            fitted_anchors[k] = p_c[[0, 2]].tolist()
    for src_k, dst_k in (('mouthUpper', 'lipUpper'), ('mouthLower', 'lipLower')):
        if src_k in landmarks_world and dst_k in fitted_anchors:
            p_c = (np.array(landmarks_world[src_k], dtype=float) - center) / scale
            fitted_anchors[dst_k] = p_c[[0, 2]].tolist()

    eye_xz = source_eye
    source_y = np.array([neutral[np.argmin(np.linalg.norm(neutral[:, [0, 2]] - p, axis=1)), 1] for p in eye_xz], dtype=float)
    target_y = np.array([eye_canon[k][1] for k in eye_keys], dtype=float)
    if np.ptp(source_y) < 1e-10:
        depth_scale, depth_offset = 1.0, float(np.mean(target_y - source_y))
    else:
        depth_scale, depth_offset = np.linalg.lstsq(np.c_[source_y, np.ones(len(source_y))], target_y, rcond=None)[0]
    if depth_scale <= 0.05:
        depth_scale, depth_offset = 1.0, float(np.mean(target_y - source_y))

    names = list(all_donor_landmarks)
    warp = em.Warp([all_donor_landmarks[n] for n in names], [fitted_anchors[n] for n in names], depth_scale, depth_offset)

    # Subtle curved residual correction in depth while guarding against bulging behind protruding iris
    residual = target_y - (source_y * depth_scale + depth_offset)
    poly = np.c_[np.ones(len(eye_xz)), eye_xz]
    mat_res = np.block([[em.Warp.kernel(np.linalg.norm(eye_xz[:, None] - eye_xz[None, :], axis=2)) + np.eye(len(eye_xz)) * 1e-7, poly], [poly.T, np.zeros((3, 3))]])
    coeff_res = np.linalg.solve(mat_res, np.r_[residual, np.zeros(3)])

    def warp_to_world(pts_array):
        q = warp(pts_array)
        front = pts_array[:, [0, 2]]
        corr = np.c_[em.Warp.kernel(np.linalg.norm(front[:, None] - eye_xz[None, :], axis=2)), np.ones(len(pts_array)), front] @ coeff_res
        q[:, 1] += np.clip(corr, -0.06, 0.06) * 0.2
        return q * scale + center

    pose_names = list(donor['poses'].keys())
    rest_world = warp_to_world(neutral)
    posed_world = {pname: warp_to_world(np.array(donor['poses'][pname], dtype=float)) for pname in pose_names}

    # Build temporary triangulated mask object
    mask_mesh = bpy.data.meshes.new('EA_TempMaskSkin')
    mask_mesh.from_pydata(rest_world.tolist(), [], donor['faces'])
    mask_mesh.update()
    mask_mesh.calc_loop_triangles()
    tris = [list(t.vertices) for t in mask_mesh.loop_triangles]
    mask_mesh.clear_geometry()
    mask_mesh.from_pydata(rest_world.tolist(), [], tris)
    mask_mesh.update()
    mask_obj = bpy.data.objects.new('EA_TempMaskSkin', mask_mesh)
    bpy.context.scene.collection.objects.link(mask_obj)
    mask_obj.shape_key_add(name='Basis')
    for pname in pose_names:
        sk = mask_obj.shape_key_add(name=pname, from_mix=False)
        sk.value = 0.0
        for v, co in zip(sk.data, posed_world[pname]):
            v.co = co
    mask_obj.data.update()
    mask_obj.hide_set(False)
    bpy.context.view_layer.objects.active = mask_obj

    eyes_c = np.array(list(eye_canon.values()), dtype=float)
    xlo, xhi = float(eyes_c[:, 0].min()), float(eyes_c[:, 0].max())
    zlo, zhi = float(eyes_c[:, 2].min()), float(eyes_c[:, 2].max())
    eye_cx = 0.5 * (xlo + xhi)
    eye_half_span = max(0.5 * (xhi - xlo), 0.12)
    eye_h = max(zhi - zlo, 0.06)
    bottom = zlo - 0.75 * eye_h
    top = zhi + 0.95 * eye_h
    fade = max(0.50 * eye_h, 0.02)
    x_fade = max(0.25 * eye_half_span, 0.03)
    back = float(np.median(eyes_c[:, 1]) + 1.25 * eye_h)
    depth_fade = max(0.70 * eye_h, 0.03)

    has_separated_eyes = bool(eye_meshes)
    eye_pts_world_all = (
        np.concatenate([basis_world(eo) for eo in eye_meshes], axis=0)
        if eye_meshes else None
    )
    brow_pts = np.array([
        landmarks_world[k] for k in ('browInnerL', 'browMiddleL', 'browOuterL', 'browInnerR', 'browMiddleR', 'browOuterR')
        if k in landmarks_world
    ], dtype=float)
    brow_guard_z = float(brow_pts[:, 2].min()) if len(brow_pts) else None

    affected_verts = 0
    bound_meshes = []
    try:
        for obj in body_meshes:
            for pname in pose_names:
                ensure_expression_key(obj, f'EA_{pname}')
            xyz_w = basis_world(obj)
            pts_c = (xyz_w - center) / scale
            wz = np.minimum(np.clip((pts_c[:, 2] - bottom) / fade, 0.0, 1.0), np.clip((top - pts_c[:, 2]) / fade, 0.0, 1.0))
            wx = np.clip((eye_half_span * 1.45 - np.abs(pts_c[:, 0] - eye_cx)) / x_fade, 0.0, 1.0)
            wy = np.clip((back - pts_c[:, 1]) / depth_fade, 0.0, 1.0)
            weights = np.minimum(np.minimum(wz, wx), wy)
            main_mask, follower_mask, _mouth_shell_mask = classify_skin_components(obj, landmarks_world, head_metrics or {'height': scale / 1.25, 'width': scale / 1.4, 'center': center.tolist(), 'min': [0.0, 0.0, float(center[2] - 0.5 * scale)]})
            active_indices = np.flatnonzero(weights > 1e-4)
            if len(active_indices) == 0 or not obj.data.polygons:
                continue

            vg = obj.vertex_groups.new(name='EA_TempEyeMask')
            enabled_mods = [(m, m.show_viewport) for m in obj.modifiers]
            mod = None
            try:
                for m, _vis in enabled_mods:
                    m.show_viewport = False
                for idx in active_indices:
                    vg.add([int(idx)], float(weights[idx]), 'REPLACE')
                obj.hide_set(False)
                mod = obj.modifiers.new('EA_TempSurfaceDeform', 'SURFACE_DEFORM')
                mod.target = mask_obj
                mod.vertex_group = vg.name
                mod.falloff = 4.0
                bpy.context.view_layer.objects.active = obj
                for kb in mask_obj.data.shape_keys.key_blocks:
                    kb.value = 0.0
                mask_obj.data.update()
                bpy.context.view_layer.update()
                bpy.ops.object.surfacedeform_bind(modifier=mod.name)
                if not mod.is_bound:
                    print(f'[body-hair-expressions] WARNING: Surface Deform did not bind on {obj.name}, skipping.')
                    continue

                def eval_mask(pose_key=None):
                    for kb in mask_obj.data.shape_keys.key_blocks:
                        kb.value = 1.0 if kb.name == pose_key else 0.0
                    mask_obj.data.update()
                    bpy.context.view_layer.update()
                    ev = obj.evaluated_get(bpy.context.evaluated_depsgraph_get()).data
                    return np.array([obj.matrix_world @ v.co for v in ev.vertices], dtype=float)

                eye_bounds_lr = []
                eye_contours_lr = {}
                for side in ('L', 'R'):
                    s_keys = [k for k in (
                        f'eyeInner{side}', f'eyeUpper1{side}', f'eyeUpper2{side}', f'eyeUpper{side}', f'eyeUpper4{side}', f'eyeUpper5{side}',
                        f'eyeOuter{side}', f'eyeLower5{side}', f'eyeLower4{side}', f'eyeLower{side}', f'eyeLower2{side}', f'eyeLower1{side}',
                        f'eyeUpperInner{side}', f'eyeUpperOuter{side}', f'eyeLowerInner{side}', f'eyeLowerOuter{side}',
                    ) if k in landmarks_world]
                    s_pts = np.array([landmarks_world[k] for k in s_keys], dtype=float)
                    ex0, ex1 = float(s_pts[:, 0].min()), float(s_pts[:, 0].max())
                    ez0, ez1 = float(s_pts[:, 2].min()), float(s_pts[:, 2].max())
                    eye_bounds_lr.append((
                        0.5 * (ex0 + ex1),
                        0.5 * (ez0 + ez1),
                        max(0.5 * (ex1 - ex0), 1e-4),
                        max(0.5 * (ez1 - ez0), 1e-4),
                        float(s_pts[:, 1].max()),
                    ))
                    u_keys = [k for k in (
                        f'eyeInner{side}', f'eyeUpper1{side}', f'eyeUpper2{side}', f'eyeUpperInner{side}', f'eyeUpper{side}',
                        f'eyeUpperOuter{side}', f'eyeUpper4{side}', f'eyeUpper5{side}', f'eyeOuter{side}',
                    ) if k in landmarks_world]
                    l_keys = [k for k in (
                        f'eyeInner{side}', f'eyeLower1{side}', f'eyeLower2{side}', f'eyeLowerInner{side}', f'eyeLower{side}',
                        f'eyeLowerOuter{side}', f'eyeLower4{side}', f'eyeLower5{side}', f'eyeOuter{side}',
                    ) if k in landmarks_world]
                    u_pts = np.array([landmarks_world[k] for k in u_keys], dtype=float)
                    l_pts = np.array([landmarks_world[k] for k in l_keys], dtype=float)
                    u_pts = u_pts[np.argsort(u_pts[:, 0])]
                    l_pts = l_pts[np.argsort(l_pts[:, 0])]
                    eye_contours_lr[side] = {
                        'ux': u_pts[:, 0], 'uz': u_pts[:, 2], 'uy': u_pts[:, 1],
                        'lx': l_pts[:, 0], 'lz': l_pts[:, 2],
                        'ex0': ex0, 'ex1': ex1, 'ez1': ez1, 'eye_w': max(ex1 - ex0, 1e-4),
                        'y_socket': float(np.median(s_pts[:, 1])),
                    }
                eye_h_world = float(np.mean([2.0 * rz for _, _, _, rz, _ in eye_bounds_lr]))
                front_y_limit = max(ym for _, _, _, _, ym in eye_bounds_lr) + 0.8 * eye_h_world
                r_ell = np.full(len(xyz_w), 10.0, dtype=float)
                front_mask = xyz_w[:, 1] <= front_y_limit
                for ecx, ecz, erx, erz, _ym in eye_bounds_lr:
                    d_ell = np.hypot((xyz_w[:, 0] - ecx) / (0.85 * erx), (xyz_w[:, 2] - ecz) / (0.85 * erz))
                    r_ell = np.minimum(r_ell, np.where(front_mask, d_ell, 10.0))

                neutral_eval = eval_mask(None)
                for pname in pose_names:
                    posed_eval = eval_mask(pname)
                    delta_w = posed_eval - neutral_eval
                    if pname not in ('blink', 'blink_L', 'blink_R'):
                        if pname == 'surprised_eye':
                            delta_w *= 0.60
                            iris_keep = smoothstep((r_ell - 0.55) / 0.35)
                        else:
                            iris_keep = 0.25 + 0.75 * smoothstep((r_ell - 0.45) / 0.35)
                        if has_separated_eyes:
                            # Separated eyeballs exist on Eye_L/Eye_R, so don't pinch cornea vertices unnecessarily
                            iris_keep = np.maximum(iris_keep, 0.70)
                        delta_w *= iris_keep[:, None]
                        y_cap = max(0.12 * eye_h_world, 1e-5)
                        delta_w[:, 1] = y_cap * np.tanh(delta_w[:, 1] / y_cap)
                        disp_cap = max((0.24 if pname == 'surprised_eye' else 0.36) * eye_h_world, 1e-5)
                        norms = np.linalg.norm(delta_w, axis=1)
                        nonzero = norms > 1e-8
                        if np.any(nonzero):
                            capped = disp_cap * np.tanh(norms[nonzero] / disp_cap)
                            delta_w[nonzero] *= (capped / norms[nonzero])[:, None]
                    else:
                        sides_active = ('L', 'R') if pname == 'blink' else (('L',) if pname == 'blink_L' else ('R',))
                        for side_id in sides_active:
                            ec = eye_contours_lr[side_id]
                            ex0, ex1, eye_w = ec['ex0'], ec['ex1'], ec['eye_w']
                            y_socket = ec['y_socket']
                            lat_margin = max(0.30 * eye_w, 1e-4)
                            wx = np.where(
                                xyz_w[:, 0] < ex0,
                                smoothstep((xyz_w[:, 0] - (ex0 - lat_margin)) / lat_margin),
                                np.where(
                                    xyz_w[:, 0] > ex1,
                                    1.0 - smoothstep((xyz_w[:, 0] - ex1) / lat_margin),
                                    1.0,
                                ),
                            )
                            front_eye = (xyz_w[:, 1] <= y_socket + 0.85 * eye_h_world) & (wx > 1e-4) & main_mask
                            if not np.any(front_eye):
                                continue

                            z_top = np.interp(xyz_w[:, 0], ec['ux'], ec['uz'])
                            z_bot = np.interp(xyz_w[:, 0], ec['lx'], ec['lz'])
                            open_h = np.maximum(z_top - z_bot, 0.0)

                            bin_edges = np.linspace(ex0, ex1, 13)
                            bin_centers = 0.5 * (bin_edges[:-1] + bin_edges[1:])
                            bin_y = np.full(len(bin_centers), y_socket, dtype=float)
                            overhang_band = (
                                front_eye
                                & (xyz_w[:, 2] >= z_top - 0.15 * open_h)
                                & (xyz_w[:, 2] <= z_top + 0.35 * eye_h_world)
                                & (xyz_w[:, 1] <= y_socket + 0.5 * eye_h_world)
                            )
                            for bi in range(len(bin_centers)):
                                in_b = overhang_band & (xyz_w[:, 0] >= bin_edges[bi]) & (xyz_w[:, 0] <= bin_edges[bi + 1])
                                if np.any(in_b):
                                    bin_y[bi] = float(np.percentile(xyz_w[in_b, 1], 18.0))
                            y_lid_front = np.interp(xyz_w[:, 0], bin_centers, bin_y)

                            if has_separated_eyes and eye_pts_world_all is not None and len(eye_pts_world_all) > 0:
                                bin_eye_y = bin_y.copy()
                                bin_eye_z_min = np.interp(bin_centers, ec['lx'], ec['lz']).copy()
                                side_eye_pts = eye_pts_world_all[
                                    (eye_pts_world_all[:, 0] >= ex0 - 0.15 * eye_w)
                                    & (eye_pts_world_all[:, 0] <= ex1 + 0.15 * eye_w)
                                ]
                                for bi in range(len(bin_centers)):
                                    if len(side_eye_pts) == 0:
                                        continue
                                    in_e = (side_eye_pts[:, 0] >= bin_edges[bi]) & (side_eye_pts[:, 0] <= bin_edges[bi + 1])
                                    if np.any(in_e):
                                        # -Y is front: 3rd percentile captures real eyeball dome surface; 5th percentile Z captures outer-lower sclera curve
                                        bin_eye_y[bi] = min(bin_eye_y[bi], float(np.percentile(side_eye_pts[in_e, 1], 3.0)))
                                        bin_eye_z_min[bi] = min(bin_eye_z_min[bi], float(np.percentile(side_eye_pts[in_e, 2], 5.0)))
                                y_eye_front = np.interp(xyz_w[:, 0], bin_centers, bin_eye_y)
                                z_eye_bottom = np.interp(xyz_w[:, 0], bin_centers, bin_eye_z_min)
                            else:
                                y_eye_front = y_lid_front
                                z_eye_bottom = z_bot

                            z_seal = np.minimum(z_bot, z_eye_bottom) if has_separated_eyes else z_bot
                            z_meet = (z_seal - 0.02 * eye_h_world) if has_separated_eyes else (z_bot + 0.08 * open_h)

                            z_curtain_base = z_top - 0.14 * open_h
                            z_eyeliner_top = z_top + 0.14 * open_h
                            lower_thresh = (z_seal + 0.02 * eye_h_world) if has_separated_eyes else (z_bot - 0.04 * open_h)
                            upper_zone = front_eye & (xyz_w[:, 2] >= z_curtain_base)
                            lower_zone = front_eye & (xyz_w[:, 2] <= lower_thresh)
                            socket_zone = front_eye & (xyz_w[:, 2] > lower_thresh) & (xyz_w[:, 2] < z_curtain_base)

                            if np.any(upper_zone):
                                m = upper_zone
                                z_brow_limit = np.maximum(
                                    z_eyeliner_top[m] + 0.35 * eye_h_world,
                                    (brow_guard_z - 0.04 * eye_h_world) if brow_guard_z is not None else (z_eyeliner_top[m] + 0.85 * eye_h_world),
                                )
                                t_skin = np.where(
                                    xyz_w[m, 2] <= z_eyeliner_top[m],
                                    0.0,
                                    np.clip((xyz_w[m, 2] - z_eyeliner_top[m]) / np.maximum(z_brow_limit - z_eyeliner_top[m], 0.25 * eye_h_world), 0.0, 1.0),
                                )
                                w_up = (1.0 - smoothstep(t_skin)) * wx[m]
                                dz_close = ((z_seal[m] - 0.05 * eye_h_world) if has_separated_eyes else (z_meet[m] - 0.04 * open_h[m])) - z_top[m]
                                delta_w[m, 2] = (1.0 - w_up) * delta_w[m, 2] + w_up * dz_close

                                uy_interp = np.interp(xyz_w[m, 0], ec['ux'], ec['uy'])
                                if has_separated_eyes:
                                    target_y_up = np.minimum(np.minimum(y_lid_front[m], uy_interp), y_eye_front[m] - 0.085 * eye_h_world)
                                    dy_fold = np.clip(target_y_up - xyz_w[m, 1], -0.60 * eye_h_world, 0.15 * eye_h_world)
                                    delta_w[m, 1] = (1.0 - w_up) * delta_w[m, 1] + w_up * dy_fold
                                else:
                                    target_y_up = y_lid_front[m] - 0.04 * eye_h_world
                                    dy_fold = np.clip(target_y_up - xyz_w[m, 1], -0.65 * eye_h_world, 0.0)
                                    delta_w[m, 1] = (1.0 - w_up) * np.minimum(delta_w[m, 1], 0.0) + w_up * (dy_fold - 0.04 * eye_h_world)

                            if np.any(lower_zone):
                                t_dn = np.clip((lower_thresh - xyz_w[:, 2]) / max(0.48 * eye_h_world, 1e-4), 0.0, 1.0)
                                w_dn = (1.0 - smoothstep(t_dn)) * wx
                                target_dz_dn = (0.14 * eye_h_world) if has_separated_eyes else ((z_meet + 0.04 * open_h) - z_bot)
                                m = lower_zone
                                delta_w[m, 2] = (1.0 - w_dn[m]) * delta_w[m, 2] + w_dn[m] * (target_dz_dn[m] if isinstance(target_dz_dn, np.ndarray) else target_dz_dn)
                                if has_separated_eyes:
                                    target_y_dn = np.minimum(xyz_w[m, 1], y_eye_front[m] - 0.065 * eye_h_world)
                                    dy_dn = np.clip(target_y_dn - xyz_w[m, 1], -0.45 * eye_h_world, 0.0)
                                    delta_w[m, 1] = (1.0 - w_dn[m]) * delta_w[m, 1] + w_dn[m] * dy_dn
                                else:
                                    delta_w[m, 1] = np.minimum(delta_w[m, 1], 0.0) - w_dn[m] * (0.03 * eye_h_world)

                            if np.any(socket_zone):
                                m = socket_zone
                                delta_w[m, 2] = (1.0 - wx[m]) * delta_w[m, 2] + wx[m] * (z_meet[m] - xyz_w[m, 2])
                                if has_separated_eyes:
                                    uy_s = np.interp(xyz_w[m, 0], ec['ux'], ec['uy'])
                                    target_sock_y = np.minimum(np.minimum(y_lid_front[m], uy_s), y_eye_front[m]) - 0.025 * eye_h_world
                                    dy_sock = np.clip(target_sock_y - xyz_w[m, 1], -0.45 * eye_h_world, 0.25 * eye_h_world)
                                    delta_w[m, 1] = wx[m] * dy_sock + (1.0 - wx[m]) * delta_w[m, 1]
                                else:
                                    delta_w[m, 1] = wx[m] * (0.65 * eye_h_world) + (1.0 - wx[m]) * delta_w[m, 1]

                        # Calm brow guard: zero out residual movement at/above painted brows cleanly without clipping the upper lid
                        if brow_guard_z is not None:
                            fade_lo = brow_guard_z - 0.14 * eye_h_world
                            brow_rows = xyz_w[:, 2] >= fade_lo
                            if np.any(brow_rows):
                                brow_fade = 1.0 - smoothstep((xyz_w[brow_rows, 2] - fade_lo) / max(0.14 * eye_h_world, 1e-4))
                                delta_w[brow_rows] *= brow_fade[:, None]

                        y_cap = max((0.70 if has_separated_eyes else 0.80) * eye_h_world, 1e-5)
                        delta_w[:, 1] = y_cap * np.tanh(delta_w[:, 1] / y_cap)

                    # Propagate main_comp eyelid motion cleanly to sculpted eye-follower components (lash ridges / lower lash strands)
                    if np.any(follower_mask):
                        eye_cx_w = 0.5 * float(eye_contours_lr['L']['ex0'] + eye_contours_lr['R']['ex1'])
                        for s_cond in (xyz_w[:, 0] >= eye_cx_w, xyz_w[:, 0] < eye_cx_w):
                            f_ids = np.flatnonzero(follower_mask & s_cond)
                            s_ids = np.flatnonzero(main_mask & s_cond & (np.linalg.norm(delta_w, axis=1) > 1e-6))
                            if len(f_ids) == 0 or len(s_ids) < 4:
                                continue
                            dists = np.linalg.norm(xyz_w[f_ids, None, :] - xyz_w[None, s_ids, :], axis=2)
                            k_nn = min(4, len(s_ids))
                            near = np.argsort(dists, axis=1)[:, :k_nn]
                            d_near = np.take_along_axis(dists, near, axis=1)
                            eps_f = max(float(np.median(d_near[:, 0])) * 0.25, 1e-5)
                            wf = 1.0 / np.maximum(d_near, eps_f) ** 2
                            wf /= wf.sum(axis=1, keepdims=True)
                            delta_w[f_ids] = (delta_w[s_ids[near]] * wf[:, :, None]).sum(axis=1)

                    write_world_delta(obj, pname, delta_w)
                affected_verts += int(len(active_indices))
                bound_meshes.append(obj.name)
            finally:
                if mod is not None and mod.name in obj.modifiers:
                    obj.modifiers.remove(mod)
                if vg.name in obj.vertex_groups:
                    obj.vertex_groups.remove(vg)
                for m, vis in enabled_mods:
                    m.show_viewport = vis
    finally:
        for kb in mask_obj.data.shape_keys.key_blocks:
            kb.value = 0.0
        bpy.data.objects.remove(mask_obj, do_unlink=True)
        bpy.data.meshes.remove(mask_mesh)

    return pose_names, {'affectedVerts': affected_verts, 'meshes': bound_meshes}


def transfer_eye_keys_to_lashes(skin_meshes, lash_meshes, eye_pose_names, landmarks_world=None, head_metrics=None):
    """Interpolate EA_* eye shape key deltas from FaceSkin onto separate 3D eyelash strips with downward blink curl."""
    if not skin_meshes or not lash_meshes or not eye_pose_names:
        return 0
    src_obj_map = []
    for obj in skin_meshes:
        if not obj.data.shape_keys:
            continue
        xyz = basis_world(obj)
        src_obj_map.append((obj, xyz))
    if not src_obj_map:
        return 0

    src_all = np.concatenate([xyz for _, xyz in src_obj_map], axis=0)
    cx_mid = float(head_metrics['center'][0]) if head_metrics else float(np.median(src_all[:, 0]))
    eye_z_pts = [landmarks_world[k][2] for k in ('eyeUpperL', 'eyeLowerL', 'eyeUpperR', 'eyeLowerR') if landmarks_world and k in landmarks_world]
    eye_h = max(float(max(eye_z_pts) - min(eye_z_pts)), 0.02) if len(eye_z_pts) >= 2 else 0.03

    pose_src_deltas = {}
    for pname in eye_pose_names:
        kname = f'EA_{pname}'
        chunks = []
        for obj, xyz in src_obj_map:
            kb = obj.data.shape_keys.key_blocks.get(kname)
            if kb is not None:
                pos = np.array([obj.matrix_world @ v.co for v in kb.data], dtype=float)
                chunks.append(pos - xyz)
            else:
                chunks.append(np.zeros_like(xyz))
        pose_src_deltas[pname] = np.concatenate(chunks, axis=0)

    count = 0
    for lash_obj in lash_meshes:
        l_xyz = basis_world(lash_obj)
        if len(l_xyz) == 0:
            continue
        lash_cx = float(l_xyz[:, 0].mean())
        is_left_lash = lash_cx >= cx_mid

        l_min = l_xyz.min(axis=0) - 0.08
        l_max = l_xyz.max(axis=0) + 0.08
        side_ok = (src_all[:, 0] >= cx_mid - 0.01) if is_left_lash else (src_all[:, 0] <= cx_mid + 0.01)
        in_box = (
            side_ok
            & (src_all[:, 0] >= l_min[0]) & (src_all[:, 0] <= l_max[0])
            & (src_all[:, 1] >= l_min[1]) & (src_all[:, 1] <= l_max[1])
            & (src_all[:, 2] >= l_min[2]) & (src_all[:, 2] <= l_max[2])
        )
        cand_idx = np.flatnonzero(in_box)
        if len(cand_idx) < 6:
            cand_idx = np.flatnonzero(side_ok)
        if len(cand_idx) < 6:
            cand_idx = np.arange(len(src_all))
        cand_pts = src_all[cand_idx]
        blink_d = np.linalg.norm(pose_src_deltas.get('blink', np.zeros_like(src_all))[cand_idx], axis=1)
        moving = blink_d > 1e-6
        if np.sum(moving) >= 6:
            cand_idx = cand_idx[moving]
            cand_pts = src_all[cand_idx]

        dists = np.linalg.norm(l_xyz[:, None, :] - cand_pts[None, :, :], axis=2)
        k = min(6, len(cand_idx))
        near = np.argsort(dists, axis=1)[:, :k]
        d_near = np.take_along_axis(dists, near, axis=1)
        eps = max(float(np.median(d_near[:, 0])) * 0.2, 1e-5)
        w = 1.0 / np.maximum(d_near, eps) ** 2
        w /= w.sum(axis=1, keepdims=True)
        src_indices = cand_idx[near]

        y_root = float(np.percentile(l_xyz[:, 1], 80.0))
        y_tip = float(l_xyz[:, 1].min())
        tip_t = np.clip((y_root - l_xyz[:, 1]) / max(y_root - y_tip, 1e-5), 0.0, 1.0)

        for pname in eye_pose_names:
            d_all = pose_src_deltas[pname]
            lash_delta = (d_all[src_indices] * w[:, :, None]).sum(axis=1)
            active_curl = (
                pname == 'blink'
                or (pname == 'blink_L' and is_left_lash)
                or (pname == 'blink_R' and not is_left_lash)
            )
            if active_curl:
                lash_delta[:, 2] -= 0.22 * eye_h * (tip_t ** 1.4)
                lash_delta[:, 1] += 0.16 * eye_h * (tip_t ** 1.4)
            write_world_delta(lash_obj, pname, lash_delta)
        count += 1
    return count


def transfer_oral_cavity_keys(oral_meshes, mouth_pose_names, landmarks, head_metrics):
    """Synchronize MouthBag, Teeth_Upper, Teeth_Lower, and Tongue during open/smile poses (keeping Basis intact)."""
    if not oral_meshes or not mouth_pose_names:
        return
    fh = max(float(head_metrics.get('height', 0.2)), 1e-4)
    chin_z = float(head_metrics['min'][2])
    mouth_lo_z = float(landmarks['mouthLower'][2]) if 'mouthLower' in landmarks else (chin_z + 0.06 * fh)
    chin_clearance = max(mouth_lo_z - chin_z, 0.04 * fh)
    max_jaw_drop = 0.52 * chin_clearance
    open_weights = {
        'aa': 1.00,
        'oh': 0.85,
        'surprised_mouth': 0.90,
        'ou': 0.65,
        'ih': 0.60,
        'ee': 0.55,
        'happy_mouth': 0.70,
        'angry_mouth': 0.45,
        'sad_mouth': 0.45,
        'relaxed_mouth': 0.45,
    }
    jaw_drops = {
        'aa': min(0.024 * fh, max_jaw_drop),
        'oh': min(0.017 * fh, 0.82 * max_jaw_drop),
        'surprised_mouth': min(0.020 * fh, 0.90 * max_jaw_drop),
        'ou': min(0.008 * fh, 0.45 * max_jaw_drop),
        'ih': min(0.008 * fh, 0.45 * max_jaw_drop),
        'ee': min(0.006 * fh, 0.35 * max_jaw_drop),
        'happy_mouth': min(0.009 * fh, 0.50 * max_jaw_drop),
    }
    for obj in oral_meshes:
        xyz = basis_world(obj)
        name = obj.name
        for pname in mouth_pose_names:
            w_open = open_weights.get(pname, 0.35)
            drop = jaw_drops.get(pname, 0.0)
            delta = np.zeros_like(xyz)
            if name.startswith('MouthBag'):
                # Pull mouth bag well inside oral pocket so it never pokes through chin/lips
                delta[:, 1] = 0.042 * fh * w_open
                delta[:, 2] = -0.25 * drop
            elif name.startswith('Tongue'):
                delta[:, 1] = 0.045 * fh * w_open
                delta[:, 2] = -0.75 * drop
            elif name.startswith('Teeth_Lower'):
                delta[:, 1] = 0.014 * fh * w_open
                delta[:, 2] = -drop
            elif name.startswith('Teeth_Upper'):
                delta[:, 1] = 0.010 * fh * w_open
            write_world_delta(obj, pname, delta)


def build_welded_head_graph(obj, head_min_z: float, head_h: float):
    xyz = basis_world(obj)
    z_cut = head_min_z - 0.08 * head_h
    head_mask = xyz[:, 2] >= z_cut
    head_ids = np.flatnonzero(head_mask)
    if len(head_ids) < 20:
        raise RuntimeError(f'Not enough head vertices found on {obj.name} for mouth transfer.')

    tol = max(head_h * 2e-4, 1e-5)
    grid = {}
    vert_to_weld = {}
    weld_to_verts = []
    points_weld = []

    for vid in head_ids:
        p = xyz[vid]
        cell = (int(round(p[0] / tol)), int(round(p[1] / tol)), int(round(p[2] / tol)))
        found = None
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for cand in grid.get((cell[0] + dx, cell[1] + dy, cell[2] + dz), ()):
                        if np.linalg.norm(points_weld[cand] - p) <= tol:
                            found = cand
                            break
                    if found is not None:
                        break
                if found is not None:
                    break
            if found is not None:
                break
        if found is None:
            found = len(points_weld)
            points_weld.append(p.copy())
            weld_to_verts.append([int(vid)])
            grid.setdefault(cell, []).append(found)
        else:
            weld_to_verts[found].append(int(vid))
        vert_to_weld[int(vid)] = found

    points_weld = np.array(points_weld, dtype=float)
    edge_set = set()
    edge_counts = {}
    for poly in obj.data.polygons:
        if not all(int(v) in vert_to_weld for v in poly.vertices):
            continue
        wverts = [vert_to_weld[int(v)] for v in poly.vertices]
        for a_i in range(len(wverts)):
            wa = wverts[a_i]
            wb = wverts[(a_i + 1) % len(wverts)]
            if wa == wb:
                continue
            ek = (wa, wb) if wa < wb else (wb, wa)
            edge_set.add(ek)
            edge_counts[ek] = edge_counts.get(ek, 0) + 1

    adj = [set() for _ in range(len(points_weld))]
    for a, b in edge_set:
        adj[a].add(b)
        adj[b].add(a)
    bnd_adj = {}
    for (a, b), count in edge_counts.items():
        if count == 1:
            bnd_adj.setdefault(a, set()).add(b)
            bnd_adj.setdefault(b, set()).add(a)

    return points_weld, list(edge_set), adj, bnd_adj, weld_to_verts


def multi_waypoint_surface_path(points_weld, adj, waypoints, z_sep, want_upper: bool, forbidden: set):
    """Chain surface Dijkstra segments across ordered lip contour waypoints."""
    def dijkstra(src, dst, extra_forbid):
        if src == dst:
            return [src]
        dist = {src: 0.0}
        prev = {src: None}
        pq = [(0.0, src)]
        while pq:
            d, u = heapq.heappop(pq)
            if u == dst:
                path = [dst]
                while prev[path[-1]] is not None:
                    path.append(prev[path[-1]])
                return path[::-1]
            if d > dist[u]:
                continue
            for v in adj[u]:
                if v != dst and (v in forbidden or v in extra_forbid):
                    continue
                seg = float(np.linalg.norm(points_weld[u] - points_weld[v]))
                mid_z = 0.5 * (points_weld[u, 2] + points_weld[v, 2])
                penalty = 1.0
                if want_upper and mid_z < z_sep:
                    penalty = 4.0
                elif not want_upper and mid_z > z_sep:
                    penalty = 4.0
                nd = d + seg * penalty
                if nd < dist.get(v, float('inf')):
                    dist[v] = nd
                    prev[v] = u
                    heapq.heappush(pq, (nd, v))
        return None

    clean_wps = []
    for w in waypoints:
        if not clean_wps or clean_wps[-1] != w:
            clean_wps.append(w)
    if len(clean_wps) < 2:
        return None

    full = [clean_wps[0]]
    used = set()
    for i in range(len(clean_wps) - 1):
        seg = dijkstra(clean_wps[i], clean_wps[i + 1], used | set(clean_wps[i + 2:]))
        if seg is None:
            return None
        full.extend(seg[1:])
        used.update(seg[:-1])
    return full


def extract_mouth_arcs(points_weld, adj, bnd_adj, landmarks_world, head_w: float):
    cy = float(np.median(points_weld[:, 1]))
    front_ids = np.flatnonzero(points_weld[:, 1] <= cy + 0.08 * head_w)
    if len(front_ids) < 10:
        front_ids = np.arange(len(points_weld))

    def nearest_weld(target_xyz, candidate_ids=front_ids):
        d = np.linalg.norm(points_weld[candidate_ids] - np.array(target_xyz, dtype=float), axis=1)
        return int(candidate_ids[int(np.argmin(d))])

    cL = nearest_weld(landmarks_world['mouthCornerL'])
    cR = nearest_weld(landmarks_world['mouthCornerR'])
    u_mid = nearest_weld(landmarks_world['mouthUpper'])
    l_mid = nearest_weld(landmarks_world['mouthLower'])
    swapped = points_weld[cR, 0] > points_weld[cL, 0]
    if swapped:
        cR, cL = cL, cR

    # Prefer open boundary edges if all 4 primary landmarks sit near an actual lip opening
    if bnd_adj:
        mouth_cx = 0.5 * float(points_weld[cL, 0] + points_weld[cR, 0])
        mouth_cz = 0.5 * float(landmarks_world['mouthUpper'][2] + landmarks_world['mouthLower'][2])
        mouth_cy = 0.5 * float(points_weld[cL, 1] + points_weld[cR, 1])
        mouth_w_est = max(float(np.linalg.norm(points_weld[cL] - points_weld[cR])), 1e-4)
        # Filter boundary vertices strictly to the mouth neighborhood so open eye sockets are never matched
        local_bnd = [
            int(bid) for bid in sorted(bnd_adj.keys())
            if abs(points_weld[bid, 0] - mouth_cx) <= 0.72 * mouth_w_est
            and abs(points_weld[bid, 2] - mouth_cz) <= 0.45 * mouth_w_est
            and points_weld[bid, 1] <= mouth_cy + 0.35 * mouth_w_est
        ]
        if len(local_bnd) >= 6:
            # Group local boundary vertices into connected components along bnd_adj and pick the primary mouth loop
            lb_set = set(local_bnd)
            seen_bnd = set()
            comps = []
            for s_id in local_bnd:
                if s_id in seen_bnd:
                    continue
                q = [s_id]
                seen_bnd.add(s_id)
                comp = []
                while q:
                    u = q.pop()
                    comp.append(u)
                    for nb in bnd_adj.get(u, ()):
                        if nb in lb_set and nb not in seen_bnd:
                            seen_bnd.add(nb)
                            q.append(nb)
                comps.append(comp)

            def comp_score(c):
                xs = points_weld[c, 0]
                return (float(xs.max() - xs.min()), len(c))

            best_comp = max((c for c in comps if len(c) >= 8), key=comp_score, default=local_bnd)
            bnd_ids = np.array(best_comp, dtype=int)
            snap_thresh = 0.28 * mouth_w_est

            def snap_bnd(pt, cand_ids=bnd_ids):
                if len(cand_ids) == 0:
                    return None
                d = np.linalg.norm(points_weld[cand_ids] - np.array(pt, dtype=float), axis=1)
                idx = int(np.argmin(d))
                return int(cand_ids[idx]) if d[idx] <= snap_thresh else None

            bcR = snap_bnd(landmarks_world['mouthCornerR'])
            bcL = snap_bnd(landmarks_world['mouthCornerL'])
            up_cands = bnd_ids[points_weld[bnd_ids, 2] >= mouth_cz]
            dn_cands = bnd_ids[points_weld[bnd_ids, 2] <= mouth_cz]
            bu = snap_bnd(landmarks_world['mouthUpper'], up_cands if len(up_cands) else bnd_ids)
            bl = snap_bnd(landmarks_world['mouthLower'], dn_cands if len(dn_cands) else bnd_ids)
            if (
                bcR is not None and bcL is not None and bu is not None and bl is not None
                and len({bcR, bcL, bu, bl}) == 4
                and points_weld[bu, 2] > points_weld[bl, 2]
            ):
                def bfs(a, b, excl):
                    q = [a]
                    prev = {a: None}
                    for u in q:
                        if u == b:
                            res = [b]
                            while prev[res[-1]] is not None:
                                res.append(prev[res[-1]])
                            return res[::-1]
                        for v in sorted(bnd_adj.get(u, ())):
                            if v in lb_set and v not in prev and v not in excl:
                                prev[v] = u
                                q.append(v)
                    return None

                u1 = bfs(bcR, bu, {bl, bcL})
                u2 = bfs(bu, bcL, {bl, *(u1[:-1] if u1 else [])}) if u1 else None
                upper_bnd = (u1 + u2[1:]) if (u1 and u2) else None
                excl_l = set(upper_bnd[1:-1]) if upper_bnd else set()
                l1 = bfs(bcR, bl, {bu, bcL} | excl_l) if upper_bnd else None
                l2 = bfs(bl, bcL, {bu, *(l1[:-1] if l1 else [])} | excl_l) if l1 else None
                lower_bnd = (l1 + l2[1:]) if (l1 and l2) else None
                if upper_bnd and lower_bnd and len(upper_bnd) >= 3 and len(lower_bnd) >= 3:
                    if points_weld[upper_bnd[0], 0] > points_weld[upper_bnd[-1], 0]:
                        upper_bnd.reverse()
                        lower_bnd.reverse()
                    return upper_bnd, lower_bnd, 'open_rim'

    # Multi-waypoint surface Dijkstra fallback for closed / watertight lips
    if u_mid == l_mid or len({cR, cL, u_mid, l_mid}) < 4:
        for idx in front_ids[np.argsort(np.linalg.norm(points_weld[front_ids] - np.array(landmarks_world['mouthLower']), axis=1))]:
            if int(idx) not in {cR, cL, u_mid}:
                l_mid = int(idx)
                break
    upper_order = ('mouthUpperR2', 'mouthUpperR1', 'mouthUpperR', 'mouthUpper', 'mouthUpperL', 'mouthUpperL1', 'mouthUpperL2')
    lower_order = ('mouthLowerR2', 'mouthLowerR1', 'mouthLowerR', 'mouthLower', 'mouthLowerL', 'mouthLowerL1', 'mouthLowerL2')
    if swapped:
        upper_order = tuple(reversed(upper_order))
        lower_order = tuple(reversed(lower_order))

    upper_wps = [cR] + [nearest_weld(landmarks_world[k]) for k in upper_order if k in landmarks_world] + [cL]
    lower_wps = [cR] + [nearest_weld(landmarks_world[k]) for k in lower_order if k in landmarks_world] + [cL]

    z_sep = 0.5 * (points_weld[u_mid, 2] + points_weld[l_mid, 2])
    upper_arc = multi_waypoint_surface_path(points_weld, adj, upper_wps, z_sep, True, {l_mid})
    lower_arc = multi_waypoint_surface_path(
        points_weld, adj, lower_wps, z_sep, False,
        set(upper_arc[1:-1]) if upper_arc else {u_mid},
    )
    if not upper_arc or not lower_arc or len(upper_arc) < 3 or len(lower_arc) < 3:
        upper_arc = multi_waypoint_surface_path(points_weld, adj, [cR, u_mid, cL], z_sep, True, {l_mid}) or [cR, u_mid, cL]
        lower_arc = multi_waypoint_surface_path(points_weld, adj, [cR, l_mid, cL], z_sep, False, {u_mid}) or [cR, l_mid, cL]
    if points_weld[upper_arc[0], 0] > points_weld[upper_arc[-1], 0]:
        upper_arc.reverse()
        lower_arc.reverse()
    return upper_arc, lower_arc, 'surface_path'


def smooth_mouth_displacements(points: np.ndarray, edges, constraints: dict, radius: float, protected) -> np.ndarray:
    """Fast localized biharmonic solve on the mouth ROI subgraph with Jacobi PCG."""
    n_total = len(points)
    adj_all = [[] for _ in range(n_total)]
    for a, b in edges:
        d = float(np.linalg.norm(points[a] - points[b]))
        adj_all[a].append((b, d))
        adj_all[b].append((a, d))

    # Geodesic distance from constrained lip rim vertices up to `radius`
    dist = np.full(n_total, np.inf)
    pq = []
    for v in constraints:
        dist[v] = 0.0
        heapq.heappush(pq, (0.0, int(v)))
    while pq:
        d, u = heapq.heappop(pq)
        if d > dist[u] or d > radius:
            continue
        for nxt, elen in adj_all[u]:
            nd = d + elen
            if nd < dist[nxt]:
                dist[nxt] = nd
                heapq.heappush(pq, (nd, nxt))

    # Extract compact subgraph (active vertices + 2-hop boundary cushion for biharmonic stencil)
    core = set(int(i) for i in np.flatnonzero(dist <= radius)) | set(int(k) for k in constraints)
    sub_set = set(core)
    frontier = set(core)
    for _ in range(2):
        nxt_f = set()
        for u in frontier:
            for nb, _ in adj_all[u]:
                if nb not in sub_set:
                    sub_set.add(nb)
                    nxt_f.add(nb)
        frontier = nxt_f

    sub_ids = np.array(sorted(sub_set), dtype=int)
    sub_idx = {int(v): i for i, v in enumerate(sub_ids)}
    n_sub = len(sub_ids)

    pairs_a = []
    pairs_b = []
    pairs_d = []
    for ga, gb in edges:
        if ga in sub_idx and gb in sub_idx:
            ia, ib = sub_idx[ga], sub_idx[gb]
            d = float(np.linalg.norm(points[ga] - points[gb]))
            pairs_a.extend((ia, ib))
            pairs_b.extend((ib, ia))
            pairs_d.extend((d, d))

    count = next(iter(constraints.values())).shape[-1]
    result = np.zeros((n_total, count), dtype=float)
    if not pairs_a:
        for v, val in constraints.items():
            result[v] = val
        return result

    a = np.array(pairs_a, dtype=int)
    b = np.array(pairs_b, dtype=int)
    d_arr = np.array(pairs_d, dtype=float)
    med_d = max(float(np.median(d_arr)), radius * 1e-4)
    # Clamp tiny surgical edge slivers to keep Laplacian condition number low and convergence crisp
    w = 1.0 / np.maximum(d_arr, 0.25 * med_d)
    totals = np.bincount(a, weights=w, minlength=n_sub)
    w /= np.maximum(totals[a], 1e-12)

    fixed = np.array([dist[v] > radius for v in sub_ids], dtype=bool)
    protected_set = set(int(p) for p in protected)
    for i, gv in enumerate(sub_ids):
        if gv in constraints or gv in protected_set or totals[i] <= 1e-12:
            fixed[i] = True
    free = np.flatnonzero(~fixed)

    pinned = np.zeros((n_sub, count), dtype=float)
    for gv, vec in constraints.items():
        pinned[sub_idx[int(gv)]] = vec

    if len(free) == 0:
        result[sub_ids] = pinned
        return result

    def lap(x: np.ndarray, transpose: bool = False) -> np.ndarray:
        out = x.copy()
        np.add.at(out, b if transpose else a, -w[:, None] * x[a if transpose else b])
        return out

    rhs = -lap(lap(pinned), True)[free]
    reg = 1e-8

    def matvec(x: np.ndarray) -> np.ndarray:
        all_x = np.zeros_like(pinned)
        all_x[free] = x
        return lap(lap(all_x), True)[free] + x * reg

    # Exact diagonal of (I - W)^T (I - W) + reg*I for Jacobi preconditioning
    diag_full = np.ones(n_sub, dtype=float)
    np.add.at(diag_full, b, w * w)
    diag_inv = (1.0 / np.maximum(diag_full[free] + reg, 1e-8))[:, None]

    sol = np.zeros_like(rhs)
    r = rhs.copy()
    z = diag_inv * r
    p = z.copy()
    rz = np.sum(r * z, axis=0)
    r0 = np.sum(r * r, axis=0)

    max_iters = min(1500, max(200, len(free) * 2))
    for _ in range(max_iters):
        ap = matvec(p)
        pap = np.maximum(np.sum(p * ap, axis=0), 1e-30)
        alpha = rz / pap
        sol += p * alpha
        r -= ap * alpha
        rr = np.sum(r * r, axis=0)
        if np.all(rr <= np.maximum(r0 * 1e-10, 1e-20)):
            break
        z = diag_inv * r
        rz_new = np.sum(r * z, axis=0)
        beta = rz_new / np.maximum(rz, 1e-30)
        p = z + p * beta
        rz = rz_new

    pinned[free] = sol
    result[sub_ids] = pinned
    return result


def detect_surgical_lip_rings(points_weld, adj, upper_arc, lower_arc):
    """For an open surgical lip rim (ring2 = boundary loop), extract outer lip ring0 -> ring1 -> ring2 columns."""
    ring2_set = set(upper_arc) | set(lower_arc)
    cR = upper_arc[0]
    cL = upper_arc[-1]

    def resolve_side(arc, is_upper: bool):
        mapped = []
        for idx_in_arc, v2 in enumerate(arc):
            if v2 == cR or v2 == cL:
                mapped.append((v2, None, None))
                continue
            cand1 = [nb for nb in adj[v2] if nb not in ring2_set]
            if not cand1:
                return None
            # Prefer ring1 neighbor in deeper front-lip direction (+Z for upper, -Z for lower, -Y forward)
            v1 = max(cand1, key=lambda u: ((points_weld[u, 2] - points_weld[v2, 2]) * (1.0 if is_upper else -1.0) - 0.5 * (points_weld[u, 1] - points_weld[v2, 1])))
            cand0 = [nb for nb in adj[v1] if nb not in ring2_set and nb != v1]
            if not cand0:
                return None
            v0 = min(cand0, key=lambda u: points_weld[u, 1] - (0.35 if is_upper else -0.35) * (points_weld[u, 2] - points_weld[v1, 2]))
            mapped.append((v0, v1, v2))
        return mapped

    up_cols = resolve_side(upper_arc, True)
    dn_cols = resolve_side(lower_arc, False)
    if not up_cols or not dn_cols:
        return None
    return {
        'upper_solve': [c[0] for c in up_cols],
        'lower_solve': [c[0] for c in dn_cols],
        'columns': [(c[0], c[1], c[2], True) for c in up_cols[1:-1]] + [(c[0], c[1], c[2], False) for c in dn_cols[1:-1]],
    }


def generate_mouth_expressions(body_meshes, landmarks_world, head_metrics, et):
    # Pick primary mesh holding the face (largest vertex count in head region)
    head_min_z = float(head_metrics['min'][2])
    head_h = float(head_metrics['height'])
    head_w = float(head_metrics['width'])

    def head_vert_count(obj):
        xyz = basis_world(obj)
        return int(np.sum(xyz[:, 2] >= head_min_z))

    main_obj = max(body_meshes, key=head_vert_count)
    points_weld, edges_weld, adj, bnd_adj, weld_to_verts = build_welded_head_graph(main_obj, head_min_z, head_h)
    upper_arc, lower_arc, mouth_mode = extract_mouth_arcs(points_weld, adj, bnd_adj, landmarks_world, head_w)

    mouth_w = max(float(np.linalg.norm(points_weld[upper_arc[-1]] - points_weld[upper_arc[0]])), 1e-5)
    donor = et.library()['mouth']
    scale = mouth_w / float(donor['width'])
    pose_names = list(donor['poses'].keys())

    eye_pts = np.array([landmarks_world[k] for k in ('eyeInnerL', 'eyeOuterL', 'eyeUpperL', 'eyeLowerL', 'eyeInnerR', 'eyeOuterR', 'eyeUpperR', 'eyeLowerR')], dtype=float)
    eye_z_min = float(eye_pts[:, 2].min()) - 0.03 * head_h
    nose_z = head_metrics.get('noseZ')

    is_watertight = (mouth_mode == 'surface_path')
    surgical_rings = None if is_watertight else detect_surgical_lip_rings(points_weld, adj, upper_arc, lower_arc)
    solve_upper = surgical_rings['upper_solve'] if surgical_rings else upper_arc
    solve_lower = surgical_rings['lower_solve'] if surgical_rings else lower_arc
    mouth_top_z = max(float(points_weld[solve_upper, 2].max()), float(points_weld[solve_lower, 2].max()))

    lip_set = set(solve_upper) | set(solve_lower) | set(upper_arc) | set(lower_arc)
    if surgical_rings:
        lip_set |= {v1 for _v0, v1, _v2, _u in surgical_rings['columns']}
        ring_guard = {v1 for _v0, v1, _v2, _u in surgical_rings['columns']} | (set(upper_arc[1:-1]) | set(lower_arc[1:-1]))
        # Exclude ring1/ring2 from the solve graph so ring0 has a free-slope boundary with zero biharmonic catapult!
        solve_edges = [(a, b) for (a, b) in edges_weld if a not in ring_guard and b not in ring_guard]
    else:
        ring_guard = set()
        solve_edges = edges_weld

    chin_z = head_min_z
    mouth_lo_z = float(points_weld[solve_lower, 2].min())
    chin_clearance = max(mouth_lo_z - chin_z, 0.22 * mouth_w)
    lower_drop_cap = min(0.75 * chin_clearance, 0.30 * mouth_w)
    neck_guard_z = chin_z - 0.045 * head_h

    if is_watertight:
        protected = [i for i in range(len(points_weld)) if i not in lip_set and points_weld[i, 2] >= eye_z_min]
        support = 2.1
    else:
        nose_guard = (float(nose_z) - 0.030 * head_h) if nose_z is not None else eye_z_min
        guard_z = max(mouth_top_z + 0.18 * mouth_w, min(eye_z_min, nose_guard, mouth_top_z + 0.48 * mouth_w))
        protected = [
            i for i in range(len(points_weld))
            if i not in lip_set and (points_weld[i, 2] >= guard_z or points_weld[i, 2] <= neck_guard_z)
        ]
        support = min(1.65, max(1.15, (2.0 * chin_clearance + 0.30 * mouth_w) / mouth_w))

    src_u = np.array(donor['upper'], dtype=float)
    src_l = np.array(donor['lower'], dtype=float)
    u_param_src = et.arc_parameter(src_u)
    l_param_src = et.arc_parameter(src_l)
    m_cx = 0.5 * float(points_weld[solve_upper[0], 0] + points_weld[solve_upper[-1], 0])
    philtrum_h = max((float(nose_z) - mouth_top_z) if nose_z is not None else 0.60 * mouth_w, 0.22 * mouth_w)
    upper_lift_cap = min(0.32 * philtrum_h, 0.22 * mouth_w)

    constraints = {}
    for side, dst in (('upper', solve_upper), ('lower', solve_lower)):
        arc_u = et.arc_parameter(points_weld[dst])
        values = []
        for pname in pose_names:
            d_u_raw = np.array(donor['poses'][pname]['upper'], dtype=float) - src_u
            d_l_raw = np.array(donor['poses'][pname]['lower'], dtype=float) - src_l
            if is_watertight:
                u_delta = np.array([np.interp(arc_u, u_param_src, d_u_raw[:, j]) for j in range(3)]).T * scale
                l_delta = np.array([np.interp(arc_u, l_param_src, d_l_raw[:, j]) for j in range(3)]).T * scale
                common = 0.5 * (u_delta + l_delta)
                half_sep = 0.5 * (u_delta - l_delta) if side == 'upper' else 0.5 * (l_delta - u_delta)
                if pname in ('happy_mouth', 'sad_mouth', 'angry_mouth', 'relaxed_mouth'):
                    interp = common * 0.72 + half_sep * 0.12
                else:
                    interp = common * 0.65 + half_sep * 0.30
                norms = np.linalg.norm(interp, axis=1, keepdims=True)
                max_disp = 0.18 * mouth_w
                too_large = norms > max_disp
                if np.any(too_large):
                    interp = np.where(too_large, interp * (max_disp / np.maximum(norms, 1e-8)), interp)
            elif pname == 'happy_mouth':
                # Skill-verified gentle anime smile for short philtrums (zero red moustache lip flip)
                s_signed = 2.0 * arc_u - 1.0  # -1 (R corner) .. +1 (L corner)
                s_abs = np.abs(s_signed)
                corner_w = smoothstep((s_abs - 0.15) / 0.85)
                center_w = 1.0 - smoothstep(s_abs / 0.75)
                interp = np.zeros((len(arc_u), 3), dtype=float)
                interp[:, 0] = s_signed * (0.075 * mouth_w * corner_w)
                interp[:, 1] = 0.045 * mouth_w * (corner_w ** 1.3)
                if side == 'upper':
                    interp[:, 2] = 0.032 * mouth_w * center_w + 0.145 * mouth_w * (corner_w ** 1.6)
                else:
                    interp[:, 2] = -0.055 * mouth_w * center_w + 0.145 * mouth_w * (corner_w ** 1.6)
            else:
                delta = d_u_raw if side == 'upper' else d_l_raw
                p_src = u_param_src if side == 'upper' else l_param_src
                interp = np.array([np.interp(arc_u, p_src, delta[:, j]) for j in range(3)]).T * scale
                if side == 'upper':
                    # Prevent lip vermilion from folding upside down onto short philtrums
                    interp[:, 2] = np.minimum(interp[:, 2], upper_lift_cap)
                # Cap downward drop within chin_clearance so mouth never pierces chin/neck
                over_dn = interp[:, 2] < -lower_drop_cap
                if np.any(over_dn):
                    frac_dn = np.where(over_dn, lower_drop_cap / np.maximum(-interp[:, 2], 1e-8), 1.0)
                    interp[:, 2] = np.maximum(interp[:, 2], -lower_drop_cap)
                    interp[:, 1] *= np.where(over_dn, 0.5 + 0.5 * frac_dn, 1.0)
            values.append(interp)
        for idx, vec in zip(dst, np.concatenate(values, axis=1)):
            constraints[idx] = vec

    delta_weld = smooth_mouth_displacements(points_weld, solve_edges, constraints, mouth_w * support, protected)

    # Safety overshoot clamp: prevent any free vertex from exceeding 1.15x the max constrained pose displacement
    c_keys = np.array(sorted(constraints.keys()), dtype=int)
    c_vals = np.array([constraints[int(k)] for k in c_keys], dtype=float)
    c_mask = np.zeros(len(points_weld), dtype=bool)
    c_mask[c_keys] = True
    free_mask = ~c_mask
    for n in range(len(pose_names)):
        s = n * 3
        max_c_norm = max(float(np.linalg.norm(c_vals[:, s:s + 3], axis=1).max()), 1e-6)
        lim = 1.15 * max_c_norm
        f_slice = delta_weld[free_mask, s:s + 3]
        f_norm = np.linalg.norm(f_slice, axis=1)
        over = f_norm > lim
        if np.any(over):
            f_slice[over] *= (lim / f_norm[over])[:, None]
            delta_weld[free_mask, s:s + 3] = f_slice

    # Enforce strict ring0 -> ring1 -> ring2 inward curl for surgical lips (zero inner quad inversion / chin red patches)
    if surgical_rings:
        for n, _pname in enumerate(pose_names):
            s = n * 3
            for v0, v1, v2, _is_up in surgical_rings['columns']:
                p0_new = points_weld[v0] + delta_weld[v0, s:s + 3]
                dz0 = float(p0_new[2] - points_weld[v0, 2])
                x_rel = float(p0_new[0] - m_cx)
                p1_new = np.array([
                    m_cx + 0.97 * x_rel,
                    max(float(points_weld[v1, 1]), float(p0_new[1]) + 0.011 * head_h),
                    float(points_weld[v1, 2]) + 0.85 * dz0,
                ], dtype=float)
                p2_new = np.array([
                    m_cx + 0.93 * x_rel,
                    max(float(points_weld[v2, 1]), float(p0_new[1]) + 0.024 * head_h),
                    float(points_weld[v2, 2]) + 0.72 * dz0,
                ], dtype=float)
                delta_weld[v1, s:s + 3] = p1_new - points_weld[v1]
                delta_weld[v2, s:s + 3] = p2_new - points_weld[v2]

    if is_watertight:
        m_cz = 0.5 * float(points_weld[upper_arc, 2].mean() + points_weld[lower_arc, 2].mean())
        m_cy = float(np.mean(points_weld[list(lip_set), 1]))
        half_x = 0.62 * mouth_w
        margin_x = max(0.55 * mouth_w, 1e-4)
        up_lim = (float(nose_z) - m_cz - 0.012 * head_h) if nose_z is not None else 0.42 * mouth_w
        up_lim = max(up_lim, 0.22 * mouth_w)
        dn_lim = max(0.52 * mouth_w, 1e-4)
        wx = 1.0 - smoothstep((np.abs(points_weld[:, 0] - m_cx) - half_x) / margin_x)
        wz_up = 1.0 - smoothstep((points_weld[:, 2] - m_cz - 0.45 * up_lim) / max(0.55 * up_lim, 1e-4))
        wz_dn = 1.0 - smoothstep((m_cz - points_weld[:, 2] - 0.50 * dn_lim) / max(0.50 * dn_lim, 1e-4))
        wy = 1.0 - smoothstep((points_weld[:, 1] - (m_cy + 0.15 * mouth_w)) / max(0.40 * mouth_w, 1e-4))
        env = wx * np.where(points_weld[:, 2] >= m_cz, wz_up, wz_dn) * wy
        delta_weld *= env[:, None]

    # Retract any non-main internal mouth/chin shell on primary mesh during open/smile poses
    _main_m, _fol_m, mouth_shell_m = classify_skin_components(main_obj, landmarks_world, head_metrics)
    mouth_open_weights = {
        'aa': 1.0, 'oh': 0.85, 'surprised_mouth': 0.9, 'ou': 0.65,
        'ih': 0.60, 'ee': 0.55, 'happy_mouth': 0.70, 'angry_mouth': 0.45,
        'sad_mouth': 0.45, 'relaxed_mouth': 0.45,
    }

    # Scatter welded deltas back to all original (UV-seam) vertices identically
    n_orig = len(main_obj.data.vertices)
    for n, pname in enumerate(pose_names):
        d_pose_w = np.zeros((n_orig, 3), dtype=float)
        slice_w = delta_weld[:, n * 3:n * 3 + 3]
        for w_idx, orig_ids in enumerate(weld_to_verts):
            d_pose_w[orig_ids] = slice_w[w_idx]
        if np.any(mouth_shell_m):
            d_pose_w[mouth_shell_m, 1] = np.maximum(
                d_pose_w[mouth_shell_m, 1],
                0.028 * head_h * mouth_open_weights.get(pname, 0.35),
            )
        for obj in body_meshes:
            if obj == main_obj:
                write_world_delta(obj, pname, d_pose_w)
            else:
                ensure_expression_key(obj, f'EA_{pname}')

    return pose_names, {
        'mouthMode': mouth_mode,
        'mesh': main_obj.name,
        'upperLen': len(solve_upper),
        'lowerLen': len(solve_lower),
        'surgicalRings': len(surgical_rings['columns']) if surgical_rings else 0,
        'weldedVerts': int(len(points_weld)),
    }


def generate_brow_expressions(body_meshes, landmarks_world, head_metrics, et):
    donor = et.library()['brows']
    pose_names = list(donor['poses'].keys())
    head_min_z = float(head_metrics['min'][2])
    head_h = float(head_metrics['height'])
    head_w = float(head_metrics['width'])
    cx = float(head_metrics['center'][0])
    cy = float(head_metrics['center'][1])

    src_list = []
    pose_deltas = {p: [] for p in pose_names}
    brow_widths = []

    for side in ('L', 'R'):
        inner_xyz = np.array(landmarks_world[f'browInner{side}'], dtype=float)
        outer_xyz = np.array(landmarks_world[f'browOuter{side}'], dtype=float)
        target_min_x = min(inner_xyz[0], outer_xyz[0])
        target_max_x = max(inner_xyz[0], outer_xyz[0])
        width = max(target_max_x - target_min_x, 1e-4)
        brow_widths.append(width)

        source = np.array(donor[side]['neutral'], dtype=float)
        sw = max(float(np.ptp(source[:, 0])), 1e-5)
        scale = width / sw
        su = (source[:, 0] - source[:, 0].min()) / sw

        # Interpolate Y, Z smoothly across (inner, middle, outer) brow contour points
        if inner_xyz[0] <= outer_xyz[0]:
            yz_start, yz_end = inner_xyz[1:], outer_xyz[1:]
        else:
            yz_start, yz_end = outer_xyz[1:], inner_xyz[1:]
        mid_key = f'browMiddle{side}'
        if mid_key in landmarks_world:
            mid_xyz = np.array(landmarks_world[mid_key], dtype=float)
            um = float(np.clip((mid_xyz[0] - target_min_x) / width, 0.15, 0.85))
            yz_mid = mid_xyz[1:]
            w0 = ((su - um) * (su - 1.0)) / (um * 1.0)
            w1 = (su * (su - 1.0)) / (um * (um - 1.0))
            w2 = (su * (su - um)) / (1.0 * (1.0 - um))
            target_yz = w0[:, None] * yz_start[None, :] + w1[:, None] * yz_mid[None, :] + w2[:, None] * yz_end[None, :]
        else:
            target_yz = yz_start[None, :] * (1.0 - su[:, None]) + yz_end[None, :] * su[:, None]

        # Match source centerline height/depth onto target brow curve
        center_yz = et.centerline(source, su)(su)
        fitted_neutral = np.empty_like(source)
        fitted_neutral[:, 0] = target_min_x + su * width
        fitted_neutral[:, 1:] = (source[:, 1:] - center_yz) * scale + target_yz
        src_list.append(fitted_neutral)

        for pname in pose_names:
            d = (np.array(donor['poses'][pname][side], dtype=float) - source) * scale
            pose_deltas[pname].append(d)

    src_pts = np.concatenate(src_list, axis=0)
    brow_w = float(np.mean(brow_widths))

    eye_guard_keys = [k for k in (
        'eyeInnerL', 'eyeUpper1L', 'eyeUpper2L', 'eyeUpperL', 'eyeUpper4L', 'eyeUpper5L', 'eyeUpperInnerL', 'eyeUpperOuterL', 'eyeOuterL',
        'eyeInnerR', 'eyeUpper1R', 'eyeUpper2R', 'eyeUpperR', 'eyeUpper4R', 'eyeUpper5R', 'eyeUpperInnerR', 'eyeUpperOuterR', 'eyeOuterR',
    ) if k in landmarks_world]
    eye_guard_pts = np.array([landmarks_world[k] for k in eye_guard_keys], dtype=float)
    eye_upper_z = float(eye_guard_pts[:, 2].max())
    brow_min_z = float(src_pts[:, 2].min())
    lid_to_brow_gap = max(brow_min_z - eye_upper_z, 0.04 * head_h)
    full_r = 0.22 * brow_w
    support_r = 0.56 * brow_w
    eye_fade_r = max(0.35 * brow_w, 0.55 * lid_to_brow_gap)
    brow_cap = max(0.42 * lid_to_brow_gap, 1e-5)

    total_affected = 0
    for obj in body_meshes:
        xyz = basis_world(obj)
        mask = (
            (xyz[:, 2] >= eye_upper_z + 0.05 * lid_to_brow_gap)
            & (xyz[:, 2] <= head_min_z + 1.05 * head_h)
            & (xyz[:, 1] <= cy + 0.05 * head_h)
            & (np.abs(xyz[:, 0] - cx) <= 0.55 * head_w)
        )
        ids = np.flatnonzero(mask)
        if len(ids) == 0:
            for pname in pose_names:
                ensure_expression_key(obj, f'EA_{pname}')
            continue

        pts = xyz[ids]
        dists = np.linalg.norm(pts[:, None, :] - src_pts[None, :, :], axis=2)
        k = min(6, len(src_pts))
        near = np.argsort(dists, axis=1)[:, :k]
        d_near = np.take_along_axis(dists, near, axis=1)
        w = 1.0 / np.maximum(d_near, brow_w * 0.01) ** 2
        w /= w.sum(axis=1, keepdims=True)

        fade = 1.0 - smoothstep((dists.min(axis=1) - full_r) / max(support_r - full_r, 1e-5))
        eye_dist = np.linalg.norm(pts[:, None, :] - eye_guard_pts[None, :, :], axis=2).min(axis=1)
        z_guard = smoothstep((pts[:, 2] - (eye_upper_z + 0.12 * lid_to_brow_gap)) / max(0.60 * lid_to_brow_gap, 1e-4))
        fade *= smoothstep(eye_dist / eye_fade_r) * z_guard
        active = fade > 1e-4
        total_affected += int(np.sum(active))

        for pname in pose_names:
            d_src = np.concatenate(pose_deltas[pname], axis=0)
            follow = (d_src[near] * w[:, :, None]).sum(axis=1) * fade[:, None]
            fnorm = np.linalg.norm(follow, axis=1)
            nz = fnorm > 1e-8
            if np.any(nz):
                follow[nz] *= ((brow_cap * np.tanh(fnorm[nz] / brow_cap)) / fnorm[nz])[:, None]
            full_delta = np.zeros_like(xyz)
            full_delta[ids] = follow
            write_world_delta(obj, pname, full_delta)

    return pose_names, {'affectedVerts': total_affected, 'browWidth': round(brow_w, 5)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stage-json', required=True)
    parser.add_argument('--landmarks-json', required=True)
    parser.add_argument('--out-blend', required=True)
    parser.add_argument('--out-expr-glb')
    parser.add_argument('--out-body-glb')
    parser.add_argument('--parts', default='eyes,mouth,brows')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])

    out_glb_arg = args.out_expr_glb or args.out_body_glb
    if not out_glb_arg:
        raise ValueError('Either --out-expr-glb or --out-body-glb must be specified.')

    stage = json.loads(Path(args.stage_json).resolve().read_text(encoding='utf-8'))
    landmarks = json.loads(Path(args.landmarks_json).resolve().read_text(encoding='utf-8'))
    out_blend = Path(args.out_blend).resolve()
    out_glb = Path(out_glb_arg).resolve()
    parts = {p.strip().lower() for p in args.parts.split(',') if p.strip()}

    mtoon_api = load_sibling_module('charakit_mtoon_export', 'mtoon-export.py')
    em = load_sibling_module('charakit_expression_mask', 'expression-mask.py')
    et = load_sibling_module('charakit_expression_transfer', 'expression-transfer.py')
    mtoon_api.enable_vrm()

    rig_name = stage.get('rigName')
    rig = bpy.data.objects[rig_name] if (rig_name and rig_name in bpy.data.objects) else None
    body_meshes = [bpy.data.objects[n] for n in stage.get('bodyMeshes', []) if n in bpy.data.objects]
    has_head = bool(stage.get('hasHead') and stage.get('headMeshes'))
    head_meshes = [bpy.data.objects[n] for n in stage.get('headMeshes', []) if n in bpy.data.objects] if has_head else []
    target_meshes = head_meshes if has_head else body_meshes

    # Classify multi-part surgical meshes cleanly while preserving 100% single-shell compatibility
    def is_aux_part(name: str) -> bool:
        return any(name.startswith(p) for p in ('Eye_', 'Eyes', 'Eyelash', 'MouthBag', 'Teeth', 'Tongue', 'Head_Original'))

    filtered_skin = [o for o in target_meshes if not is_aux_part(o.name)]
    skin_meshes = filtered_skin if filtered_skin else target_meshes
    eye_meshes = [o for o in target_meshes if o.name.startswith('Eye_')]
    lash_meshes = [o for o in target_meshes if o.name.startswith('Eyelash')]
    oral_meshes = [o for o in target_meshes if o.name.startswith(('MouthBag', 'Teeth', 'Tongue'))]

    head_metrics = stage.get('headMetrics') or {
        'min': [stage['craniumCenter'][0] - 0.1, stage['craniumCenter'][1] - 0.1, stage['craniumCenter'][2] - 0.1],
        'max': [stage['craniumCenter'][0] + 0.1, stage['craniumCenter'][1] + 0.1, stage['craniumCenter'][2] + 0.1],
        'height': float(stage['bodyHeight']) * 0.18,
        'width': float(stage['bodyHeight']) * 0.15,
        'center': stage['craniumCenter'],
    }
    center = np.array(head_metrics.get('center') or stage['craniumCenter'], dtype=float)
    scale = max(float(head_metrics['height']) * 1.25, float(stage['bodyHeight']) * 0.18, 1e-4)

    for obj in [*skin_meshes, *lash_meshes, *oral_meshes]:
        if not obj.data.shape_keys:
            obj.shape_key_add(name='Basis')

    generated = []
    report = {}
    eye_names = []
    mouth_names = []
    if 'eyes' in parts:
        eye_names, eye_info = generate_eye_expressions(
            skin_meshes, landmarks, center, scale, em,
            head_metrics=head_metrics, eye_meshes=eye_meshes,
        )
        if lash_meshes:
            lash_bound = transfer_eye_keys_to_lashes(skin_meshes, lash_meshes, eye_names, landmarks_world=landmarks, head_metrics=head_metrics)
            eye_info['lashMeshes'] = lash_bound
        generated.extend(eye_names)
        report['eyes'] = eye_info
    if 'mouth' in parts:
        mouth_names, mouth_info = generate_mouth_expressions(skin_meshes, landmarks, head_metrics, et)
        if oral_meshes:
            transfer_oral_cavity_keys(oral_meshes, mouth_names, landmarks, head_metrics)
            mouth_info['oralMeshes'] = [o.name for o in oral_meshes]
        generated.extend(mouth_names)
        report['mouth'] = mouth_info
    if 'brows' in parts:
        brow_names, brow_info = generate_brow_expressions(skin_meshes, landmarks, head_metrics, et)
        generated.extend(brow_names)
        report['brows'] = brow_info

    # Zero all shape keys cleanly before saving / exporting GLB
    for obj in [*skin_meshes, *lash_meshes, *oral_meshes]:
        if obj.data.shape_keys:
            for kb in obj.data.shape_keys.key_blocks:
                kb.value = 0.0
    bpy.context.view_layer.update()

    out_blend.parent.mkdir(parents=True, exist_ok=True)
    try:
        bpy.ops.file.pack_all()
    except Exception as exc:
        print(f'[body-hair-expressions] pack_all warning: {exc}')
    save_res = bpy.ops.wm.save_as_mainfile(filepath=str(out_blend), copy=True)
    if 'FINISHED' not in save_res:
        raise RuntimeError(f'Failed to save {out_blend}: {save_res}')

    if has_head and stage.get('headPivot'):
        hp = Vector(stage['headPivot'])
        shift_mat = Matrix.Translation(-hp)
        for obj in head_meshes:
            inv_w = obj.matrix_world.inverted()
            local_shift = inv_w @ shift_mat @ obj.matrix_world
            if obj.data.shape_keys and obj.data.shape_keys.key_blocks:
                for kb in obj.data.shape_keys.key_blocks:
                    for kv in kb.data:
                        kv.co = local_shift @ kv.co
                obj.data.update()
            else:
                obj.data.transform(local_shift)
                obj.data.update()

    bpy.ops.object.select_all(action='DESELECT')
    export_objs = head_meshes if has_head else ([rig, *body_meshes] if rig else body_meshes)
    for obj in export_objs:
        obj.hide_set(False)
        obj.select_set(True)
    if export_objs:
        bpy.context.view_layer.objects.active = rig if (not has_head and rig) else export_objs[0]
    out_glb.parent.mkdir(parents=True, exist_ok=True)
    glb_res = bpy.ops.export_scene.gltf(
        filepath=str(out_glb),
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_morph=True,
        export_morph_normal=False,
        export_animations=False,
    )
    if 'FINISHED' not in glb_res:
        raise RuntimeError(f'GLB export failed: {glb_res}')

    face_vert_count = sum(len(o.data.vertices) for o in skin_meshes)
    summary = {
        'exprTarget': 'head' if has_head else 'body',
        'faceVertCount': face_vert_count,
        'expressions': generated,
        'count': len(generated),
        'mouthMode': report.get('mouth', {}).get('mouthMode'),
        'report': report,
        'exprBlend': str(out_blend),
        'exprGlb': str(out_glb),
        'bodyExprGlb': str(out_glb),
    }
    print('BODY_HAIR_EXPR_OK ' + json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
