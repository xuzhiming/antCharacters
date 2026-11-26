"""Non-destructive local Blender surgery for single-shell AI head models.

Keeps the original mesh untouched as a hidden backup (`Head_Original_Backup`),
creates `FaceSkin` with physical open eye sockets + inner eyelid folds, physical
ripped mouth seam + inner lip folds, and adds separate anatomical meshes:
  - `Eye_L`, `Eye_R` (recessed sculpted eye patches keeping original 4K iris/sclera UV)
  - `Eyelash_Upper_L`, `Eyelash_Upper_R` (curved 3D upper eyelash strips)
  - `MouthBag` (dark interior oral cavity pouch, normals inward)
  - `Teeth_Upper`, `Teeth_Lower`, `Tongue` (recessed behind closed lips)

Usage:
  Blender --background --python scripts/head-local-surgery.py -- \
    --input HEAD.fbx --out-dir OUT_DIR [--name head_surgery] \
    [--landmarks-json landmarks.json] [--render-preview]
"""
import argparse
import heapq
import importlib.util
import json
import math
import sys
import zipfile
from collections import deque
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree


def load_sibling_module(name: str, filename: str):
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def find_primary_texture(mesh_objs):
    for obj in mesh_objs:
        for mat in obj.data.materials:
            if mat and mat.node_tree:
                for node in mat.node_tree.nodes:
                    if node.type == 'TEX_IMAGE' and node.image is not None:
                        return node.image
    return None


def compute_face_frame(mesh_obj):
    """Find robust face bounds (chin, nose tip, crown, eye Z) ignoring lower neck/bust flare."""
    pts = np.array([v.co for v in mesh_obj.data.vertices], dtype=float)
    top_z = float(pts[:, 2].max())
    min_z = float(pts[:, 2].min())
    total_h = max(top_z - min_z, 1e-4)

    upper_pts = pts[pts[:, 2] >= top_z - 0.60 * total_h]
    px5, px95 = np.percentile(upper_pts[:, 0], [5.0, 95.0])
    py5, py95 = np.percentile(upper_pts[:, 1], [5.0, 95.0])
    cx = float(0.5 * (px5 + px95))
    cy = float(0.5 * (py5 + py95))
    head_w = float(max(px95 - px5, 1e-4))

    # Locate front nose protrusion in middle face
    nose_band = pts[
        (np.abs(pts[:, 0] - cx) <= 0.12 * head_w)
        & (pts[:, 2] >= top_z - 0.65 * total_h)
        & (pts[:, 2] <= top_z - 0.30 * total_h)
    ]
    if len(nose_band) >= 5:
        nose_pt = nose_band[int(np.argmin(nose_band[:, 1]))]
        z_nose = float(nose_pt[2])
        y_nose = float(nose_pt[1])
    else:
        z_nose = top_z - 0.50 * total_h
        y_nose = float(pts[:, 1].min())

    # Locate chin bottom by walking down centerline from nose until sharp +Y neck retreat
    z_samples = np.linspace(z_nose - 0.10 * total_h, min_z, 55)
    front_y_by_z = []
    for zs in z_samples:
        band = pts[
            (np.abs(pts[:, 0] - cx) <= 0.10 * head_w)
            & (np.abs(pts[:, 2] - zs) <= 0.015 * total_h)
            & (pts[:, 1] <= cy)
        ]
        if len(band) > 0:
            front_y_by_z.append((float(zs), float(band[:, 1].min())))
    chin_z = max(min_z, z_nose - 0.30 * total_h)
    running_min_y = float('inf')
    for idx, (zs, ys) in enumerate(front_y_by_z):
        running_min_y = min(running_min_y, ys)
        if zs < z_nose - 0.16 * total_h and (ys - running_min_y) > 0.10 * head_w:
            chin_z = front_y_by_z[max(0, idx - 1)][0]
            break

    face_h = max(top_z - chin_z, 1e-4)
    return {
        'cx': cx,
        'cy': cy,
        'head_w': head_w,
        'top_z': top_z,
        'chin_z': chin_z,
        'face_h': face_h,
        'z_nose': z_nose,
        'y_nose': y_nose,
        'total_h': total_h,
    }


def make_xz_sampler(mesh_obj, tex_img):
    """Build BVH raycast + UV pixel sampler on `mesh_obj` facing -Y."""
    mesh = mesh_obj.data
    mesh.calc_loop_triangles()
    uv_layer = mesh.uv_layers.active.data if mesh.uv_layers.active else None
    verts = [v.co.copy() for v in mesh.vertices]
    tris = [tuple(t.vertices) for t in mesh.loop_triangles]
    tri_loops = [tuple(t.loops) for t in mesh.loop_triangles]
    bvh = BVHTree.FromPolygons(verts, tris)
    min_y = min(v.y for v in verts) - 1.0

    if tex_img is not None:
        w, h = int(tex_img.size[0]), int(tex_img.size[1])
        px = np.array(tex_img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    else:
        w = h = 0
        px = None

    def sample(x: float, z: float):
        loc, norm, fidx, _dist = bvh.ray_cast(Vector((x, min_y, z)), Vector((0.0, 1.0, 0.0)), 4.0)
        if loc is None:
            return None
        i0, i1, i2 = tris[fidx]
        p0, p1, p2 = verts[i0], verts[i1], verts[i2]
        v0 = p1 - p0
        v1 = p2 - p0
        v2 = loc - p0
        d00 = v0.dot(v0)
        d01 = v0.dot(v1)
        d11 = v1.dot(v1)
        d20 = v2.dot(v0)
        d21 = v2.dot(v1)
        denom = d00 * d11 - d01 * d01
        if abs(denom) < 1e-12:
            return loc, norm, Vector((0.5, 0.5)), np.array([0.85, 0.70, 0.65], dtype=np.float32)
        vb = (d11 * d20 - d01 * d21) / denom
        wb = (d00 * d21 - d01 * d20) / denom
        ub = 1.0 - vb - wb
        if uv_layer is not None:
            l0, l1, l2 = tri_loops[fidx]
            uv = ub * uv_layer[l0].uv + vb * uv_layer[l1].uv + wb * uv_layer[l2].uv
        else:
            uv = Vector((0.5, 0.5))
        if px is not None:
            iu = int(np.clip(round((uv.x % 1.0) * (w - 1)), 0, w - 1))
            iv = int(np.clip(round((uv.y % 1.0) * (h - 1)), 0, h - 1))
            rgb = px[iv, iu, :3]
        else:
            rgb = np.array([0.85, 0.70, 0.65], dtype=np.float32)
        return loc, norm, uv, rgb

    return sample, bvh, min_y


def smooth_1d(arr: np.ndarray, passes: int = 3) -> np.ndarray:
    out = arr.astype(float).copy()
    n = len(out)
    if n < 3:
        return out
    for _ in range(passes):
        nxt = out.copy()
        nxt[1:-1] = 0.25 * out[:-2] + 0.5 * out[1:-1] + 0.25 * out[2:]
        out = nxt
    return out


def detect_eye_contour(sample_fn, frame, side: str, lm_override=None):
    """Detect smooth 64-pt closed eye boundary loop (x, z) inside skin/eyelid rim."""
    sgn = 1.0 if side == 'L' else -1.0
    cx = frame['cx']
    hw = frame['head_w']
    fh = frame['face_h']
    z_nose = frame['z_nose']

    if lm_override and f'eyeInner{side}' in lm_override and f'eyeOuter{side}' in lm_override:
        p_in = lm_override[f'eyeInner{side}']
        p_out = lm_override[f'eyeOuter{side}']
        p_up = lm_override[f'eyeUpper{side}']
        p_lo = lm_override[f'eyeLower{side}']
        x0 = min(p_in[0], p_out[0]) - 0.04 * hw
        x1 = max(p_in[0], p_out[0]) + 0.04 * hw
        z0 = p_lo[2] - 0.04 * fh
        z1 = p_up[2] + 0.04 * fh
    else:
        x_a = cx + sgn * 0.12 * hw
        x_b = cx + sgn * 0.45 * hw
        x0, x1 = min(x_a, x_b), max(x_a, x_b)
        z_eye_est = z_nose + 0.16 * fh
        z0 = z_eye_est - 0.095 * fh
        z1 = z_eye_est + 0.095 * fh

    nx, nz = 68, 60
    xs = np.linspace(x0, x1, nx)
    zs = np.linspace(z0, z1, nz)
    y_grid = np.full((nz, nx), np.nan, dtype=float)
    r_grid = np.zeros((nz, nx), dtype=float)
    g_grid = np.zeros((nz, nx), dtype=float)
    b_grid = np.zeros((nz, nx), dtype=float)

    for iz, z in enumerate(zs):
        for ix, x in enumerate(xs):
            res = sample_fn(float(x), float(z))
            if res is None:
                continue
            loc, _norm, _uv, rgb = res
            y_grid[iz, ix] = float(loc.y)
            r_grid[iz, ix] = float(rgb[0])
            g_grid[iz, ix] = float(rgb[1])
            b_grid[iz, ix] = float(rgb[2])

    valid = np.isfinite(y_grid)
    if np.sum(valid) < 50:
        raise RuntimeError(f'Insufficient raycast samples around eye {side}.')

    # Eyeball surface sits recessed relative to surrounding eyelids AND has low redness (r - g)
    # while still allowing colored iris/pupil inside socket.
    redness = r_grid - g_grid
    lum = 0.299 * r_grid + 0.587 * g_grid + 0.114 * b_grid

    # Reference protruding eyelid depth from outer skin percentiles in the ROI
    skin_cand = valid & (redness > 0.13) & (lum > 0.52)
    y_skin = float(np.percentile(y_grid[skin_cand], 30)) if np.sum(skin_cand) >= 20 else float(np.percentile(y_grid[valid], 30))

    # Candidate eyeball interior: neutral sclera/iris OR clearly recessed socket below eyelid rim
    socket_mask = valid & (
        ((redness < 0.115) & (lum > 0.30) & (y_grid > y_skin + 0.008 * fh))
        | ((redness < 0.125) & (lum > 0.58) & (y_grid > y_skin + 0.002 * fh))
    )

    # Pick largest 4-connected component in (iz, ix) near eye ROI center
    visited = np.zeros_like(socket_mask, dtype=bool)
    best_comp = []
    mid_ix = nx * 0.5
    mid_iz = nz * 0.5
    for r0 in range(nz):
        for c0 in range(nx):
            if not socket_mask[r0, c0] or visited[r0, c0]:
                continue
            q = deque([(r0, c0)])
            visited[r0, c0] = True
            comp = []
            while q:
                rr, cc = q.popleft()
                comp.append((rr, cc))
                for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                    nr, nc = rr + dr, cc + dc
                    if 0 <= nr < nz and 0 <= nc < nx and socket_mask[nr, nc] and not visited[nr, nc]:
                        visited[nr, nc] = True
                        q.append((nr, nc))
            if len(comp) > len(best_comp):
                # Prefer big central component rather than thin nose bridge rim
                ys = [p[0] for p in comp]
                xs_c = [p[1] for p in comp]
                if min(ys) > 1 or max(ys) < nz - 2:
                    best_comp = comp

    if len(best_comp) < 25:
        raise RuntimeError(f'Failed to isolate connected eye socket region for eye {side}.')

    comp_mask = np.zeros_like(socket_mask, dtype=bool)
    for rr, cc in best_comp:
        comp_mask[rr, cc] = True

    col_spans = []
    for ix in range(nx):
        rows = np.flatnonzero(comp_mask[:, ix])
        if len(rows) >= 2:
            zlo_c = float(zs[rows.min()])
            zhi_c = float(zs[rows.max()])
            if zhi_c - zlo_c >= 0.006 * fh:
                col_spans.append((float(xs[ix]), zlo_c, zhi_c))

    if len(col_spans) < 5:
        raise RuntimeError(f'Eye {side} detected span too narrow ({len(col_spans)} cols).')

    col_x = np.array([c[0] for c in col_spans], dtype=float)
    col_lo = smooth_1d(np.array([c[1] for c in col_spans], dtype=float), passes=2)
    col_hi = smooth_1d(np.array([c[2] for c in col_spans], dtype=float), passes=2)

    # Subtle outward trim (0.0005*fh) so cut runs right inside the eyelid crease
    x_min_e = float(col_x[0])
    x_max_e = float(col_x[-1])
    pad_x = 0.0015 * fh
    x_min_e -= pad_x
    x_max_e += pad_x

    # Build smooth 64-pt almond polygon ordered counter-clockwise in (x, z)
    n_arc = 32
    t = np.linspace(0.0, 1.0, n_arc)
    # Cosine spacing clusters points smoothly near sharper inner/outer corners
    s_arc = 0.5 * (1.0 - np.cos(math.pi * t))
    x_sample = x_min_e + s_arc * (x_max_e - x_min_e)

    # Interpolate upper & lower curves and pinch gently to exact corner midpoints
    z_up = np.interp(x_sample, col_x, col_hi)
    z_dn = np.interp(x_sample, col_x, col_lo)
    corner_l_z = float(0.5 * (col_hi[0] + col_lo[0]))
    corner_r_z = float(0.5 * (col_hi[-1] + col_lo[-1]))
    # Smooth end pinch over outermost 10%
    edge_blend = np.clip(np.sin(math.pi * s_arc) / math.sin(math.pi * 0.10), 0.0, 1.0)
    z_mid_line = corner_l_z * (1.0 - s_arc) + corner_r_z * s_arc
    z_up = z_mid_line + edge_blend * np.maximum(z_up - z_mid_line, 0.0)
    z_dn = z_mid_line - edge_blend * np.maximum(z_mid_line - z_dn, 0.0)

    # Guarantee minimum almond taper and smooth curvature
    z_up = smooth_1d(z_up, passes=2)
    z_dn = smooth_1d(z_dn, passes=2)
    z_up[0] = z_dn[0] = corner_l_z
    z_up[-1] = z_dn[-1] = corner_r_z

    # Lower arc left-to-right (x_min -> x_max), upper arc right-to-left (x_max -> x_min) => CCW in XZ
    poly_pts = []
    for i in range(n_arc - 1):
        poly_pts.append((float(x_sample[i]), float(z_dn[i])))
    for i in range(n_arc - 1, 0, -1):
        poly_pts.append((float(x_sample[i]), float(z_up[i])))

    # Measure dark lash color around top eyelid band
    lash_cols = []
    for ix, x in enumerate(xs):
        if x < x_min_e or x > x_max_e:
            continue
        zt = float(np.interp(x, x_sample, z_up))
        for dz in (0.002 * fh, 0.005 * fh, 0.008 * fh):
            res = sample_fn(float(x), zt + dz)
            if res is not None:
                _loc, _norm, _uv, rgb = res
                if float(rgb.max()) < 0.58:
                    lash_cols.append(rgb.tolist())
    lash_rgb = tuple(np.median(lash_cols, axis=0).tolist()) if lash_cols else (0.14, 0.09, 0.09)

    return {
        'poly_xz': np.array(poly_pts, dtype=float),
        'upper_xz': np.column_stack([x_sample, z_up]),
        'lower_xz': np.column_stack([x_sample, z_dn]),
        'x_range': (x_min_e, x_max_e),
        'center_xz': (0.5 * (x_min_e + x_max_e), float(0.5 * (z_up.max() + z_dn.min()))),
        'height': float(z_up.max() - z_dn.min()),
        'width': float(x_max_e - x_min_e),
        'y_socket_med': float(np.median(y_grid[comp_mask])),
        'y_skin': y_skin,
        'lash_rgb': lash_rgb,
    }


def symmetrize_eye_contours(eye_l, eye_r, cx: float):
    """Average L/R eye contours cleanly across `x = cx` when symmetric."""
    poly_r_mir = eye_r['poly_xz'].copy()
    poly_r_mir[:, 0] = 2.0 * cx - poly_r_mir[:, 0]
    # Reorder upper/lower of R mirrored to match L X direction (smaller X -> larger X)
    up_l = eye_l['upper_xz']
    dn_l = eye_l['lower_xz']
    up_r = eye_r['upper_xz'][::-1].copy()
    dn_r = eye_r['lower_xz'][::-1].copy()
    up_r[:, 0] = 2.0 * cx - up_r[:, 0]
    dn_r[:, 0] = 2.0 * cx - dn_r[:, 0]

    x_s = 0.5 * (up_l[:, 0] + up_r[:, 0])
    z_u = 0.5 * (up_l[:, 1] + np.interp(x_s, up_r[:, 0], up_r[:, 1]))
    z_d = 0.5 * (dn_l[:, 1] + np.interp(x_s, dn_r[:, 0], dn_r[:, 1]))

    def build_info(x_arr, zu, zd, base):
        n = len(x_arr)
        pts = [(float(x_arr[i]), float(zd[i])) for i in range(n - 1)]
        pts += [(float(x_arr[i]), float(zu[i])) for i in range(n - 1, 0, -1)]
        info = dict(base)
        info['poly_xz'] = np.array(pts, dtype=float)
        info['upper_xz'] = np.column_stack([x_arr, zu])
        info['lower_xz'] = np.column_stack([x_arr, zd])
        info['x_range'] = (float(min(x_arr[0], x_arr[-1])), float(max(x_arr[0], x_arr[-1])))
        info['center_xz'] = (float(0.5 * (x_arr[0] + x_arr[-1])), float(0.5 * (zu.max() + zd.min())))
        info['height'] = float(zu.max() - zd.min())
        info['width'] = float(abs(x_arr[-1] - x_arr[0]))
        return info

    new_l = build_info(x_s, z_u, z_d, eye_l)
    # For R, mirror X back around cx
    x_sr = 2.0 * cx - x_s[::-1]
    new_r = build_info(x_sr, z_u[::-1], z_d[::-1], eye_r)
    return new_l, new_r


def detect_mouth_seam(sample_fn, frame, lm_override=None):
    """Detect exact smooth lip seam z_seam(x) and corner X extent from Y-depth recess + RGB."""
    cx = frame['cx']
    hw = frame['head_w']
    fh = frame['face_h']
    z_nose = frame['z_nose']
    chin_z = frame['chin_z']

    if lm_override and 'mouthCornerL' in lm_override and 'mouthCornerR' in lm_override:
        x_r_est = min(lm_override['mouthCornerL'][0], lm_override['mouthCornerR'][0])
        x_l_est = max(lm_override['mouthCornerL'][0], lm_override['mouthCornerR'][0])
        z_m_est = 0.5 * (lm_override['mouthUpper'][2] + lm_override['mouthLower'][2])
        x0 = x_r_est - 0.04 * hw
        x1 = x_l_est + 0.04 * hw
    else:
        z_m_est = chin_z + 0.49 * (z_nose - chin_z)
        x0 = cx - 0.22 * hw
        x1 = cx + 0.22 * hw

    z0 = z_m_est - 0.032 * fh
    z1 = z_m_est + 0.032 * fh
    xs = np.linspace(x0, x1, 41)
    zs = np.linspace(z0, z1, 45)

    seam_z_arr = []
    lip_red_arr = []
    seam_y_arr = []
    valid_xs = []

    for x in xs:
        best_score = float('inf')
        best_z = z_m_est
        best_y = frame['cy']
        max_red = -1.0
        for z in zs:
            res = sample_fn(float(x), float(z))
            if res is None:
                continue
            loc, _norm, _uv, rgb = res
            r, g, b = float(rgb[0]), float(rgb[1]), float(rgb[2])
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            red = r - g
            if red > max_red:
                max_red = red
            # Seam crease sits at maximum depth recess (largest Y toward head center) AND darker red shadow
            score = lum - 1.8 * float(loc.y)
            if score < best_score:
                best_score = score
                best_z = float(z)
                best_y = float(loc.y)
        valid_xs.append(float(x))
        seam_z_arr.append(best_z)
        lip_red_arr.append(max_red)
        seam_y_arr.append(best_y)

    valid_xs = np.array(valid_xs, dtype=float)
    seam_z_arr = smooth_1d(np.array(seam_z_arr, dtype=float), passes=2)
    lip_red_arr = np.array(lip_red_arr, dtype=float)
    seam_y_arr = np.array(seam_y_arr, dtype=float)

    # Lip extent: where redness clearly exceeds outer cheek skin redness
    baseline_red = float(min(lip_red_arr[0], lip_red_arr[-1]))
    peak_red = float(lip_red_arr.max())
    thresh = baseline_red + 0.30 * max(peak_red - baseline_red, 0.04)
    lip_cols = np.flatnonzero(lip_red_arr >= thresh)
    if len(lip_cols) >= 5:
        x_corner_r = float(valid_xs[lip_cols[0]])
        x_corner_l = float(valid_xs[lip_cols[-1]])
    else:
        x_corner_r = float(cx - 0.15 * hw)
        x_corner_l = float(cx + 0.15 * hw)

    # Symmetrize corners & seam around cx
    half_w = 0.5 * (abs(x_corner_l - cx) + abs(cx - x_corner_r))
    x_corner_r = cx - half_w
    x_corner_l = cx + half_w
    mirror_z = np.interp(2.0 * cx - valid_xs, valid_xs, seam_z_arr)
    seam_z_sym = smooth_1d(0.5 * (seam_z_arr + mirror_z), passes=3)

    in_range = (valid_xs >= x_corner_r) & (valid_xs <= x_corner_l)
    curve_x = np.linspace(x_corner_r, x_corner_l, 33)
    curve_z = np.interp(curve_x, valid_xs, seam_z_sym)
    curve_y = np.interp(curve_x, valid_xs, seam_y_arr)

    return {
        'curve_x': curve_x,
        'curve_z': curve_z,
        'curve_y': curve_y,
        'x_corner_r': float(x_corner_r),
        'x_corner_l': float(x_corner_l),
        'z_center': float(np.interp(cx, curve_x, curve_z)),
        'y_center': float(np.interp(cx, curve_x, curve_y)),
        'width': float(x_corner_l - x_corner_r),
        'lip_samples': valid_xs[in_range].tolist(),
    }


def signed_distance_closed_poly_xz(points_xz: np.ndarray, poly_xz: np.ndarray) -> np.ndarray:
    """Signed distance to closed 2D polygon: < 0 inside, > 0 outside."""
    n = len(poly_xz)
    a = poly_xz
    b = np.roll(poly_xz, -1, axis=0)
    ab = b - a
    ab_len2 = np.maximum((ab ** 2).sum(axis=1), 1e-16)

    # Vectorized segment distance: points_xz (M, 2), a (N, 2)
    diff = points_xz[:, None, :] - a[None, :, :]
    t = np.clip((diff * ab[None, :, :]).sum(axis=2) / ab_len2[None, :], 0.0, 1.0)
    proj = a[None, :, :] + t[:, :, None] * ab[None, :, :]
    dist = np.linalg.norm(points_xz[:, None, :] - proj, axis=2).min(axis=1)

    # Even-odd ray test in XZ
    px = points_xz[:, 0:1]
    pz = points_xz[:, 1:2]
    ax = a[None, :, 0]
    az = a[None, :, 1]
    bx = b[None, :, 0]
    bz = b[None, :, 1]
    cond = ((az > pz) != (bz > pz)) & (px < (bx - ax) * (pz - az) / np.where(np.abs(bz - az) > 1e-16, bz - az, 1e-16) + ax)
    inside = (np.sum(cond, axis=1) % 2) == 1
    return np.where(inside, -dist, dist)


def slice_closed_loop_xz(mesh_obj, poly_xz: np.ndarray, cy: float, head_w: float, pad: float):
    """Exact triangle + UV cut along closed 2D XZ curve; returns inside face indices (in updated mesh)."""
    bm = bmesh.new()
    bm.from_mesh(mesh_obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    uv_lay = bm.loops.layers.uv.verify()
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    x0, z0 = poly_xz.min(axis=0) - pad
    x1, z1 = poly_xz.max(axis=0) + pad
    roi_verts = [
        v for v in bm.verts
        if v.co.y <= cy + 0.04 * head_w and x0 <= v.co.x <= x1 and z0 <= v.co.z <= z1
    ]
    phi = {v: 1.0 for v in bm.verts}
    if roi_verts:
        coords = np.array([(v.co.x, v.co.z) for v in roi_verts], dtype=float)
        dists = signed_distance_closed_poly_xz(coords, poly_xz)
        eps_snap = max(pad * 1e-3, 1e-6)
        for v, d in zip(roi_verts, dists):
            # Force > 0 at ROI boundary so no edge outside ROI crosses zero
            if v.co.x <= x0 + eps_snap or v.co.x >= x1 - eps_snap or v.co.z <= z0 + eps_snap or v.co.z >= z1 - eps_snap:
                phi[v] = max(float(d), eps_snap)
            else:
                phi[v] = 0.0 if abs(float(d)) < eps_snap else float(d)

    # Split edges strictly crossing phi == 0
    edge_cross = []
    for e in bm.edges:
        v0, v1 = e.verts[0], e.verts[1]
        p0, p1 = phi[v0], phi[v1]
        if (p0 < 0.0 < p1) or (p1 < 0.0 < p0):
            edge_cross.append((e, v0, v1, p0, p1))

    split_verts = {}
    for e, v0, v1, p0, p1 in edge_cross:
        fac = float(np.clip(p0 / (p0 - p1), 0.08, 0.92))
        new_e, new_v = bmesh.utils.edge_split(e, v0, fac)
        phi[new_v] = 0.0
        # Interpolate UV on both loops adjacent to split
        for f in new_v.link_faces:
            # Find adjacent loops along the split edge direction inside this triangle/quad
            pass
        split_verts[new_v] = (v0, v1, fac)

    # Interpolate UVs manually on newly split edges BEFORE connecting verts across faces,
    # Wait: bmesh.utils.edge_split automatically linearly interpolates customdata (UVs)!
    # Now connect any pair of phi == 0 vertices within the same face (which splits quad/ngon into clean tris).
    bm.faces.ensure_lookup_table()
    # A face touched by 1 split edge has 4 verts; touched by 2 split edges has 5 verts.
    for f in list(bm.faces):
        if not f.is_valid or len(f.verts) <= 3:
            continue
        zeros = [v for v in f.verts if phi.get(v, 1.0) == 0.0]
        if len(zeros) == 2:
            v_a, v_b = zeros[0], zeros[1]
            # Check they are not already adjacent in f
            if not any(v_b in e.verts for e in v_a.link_edges):
                try:
                    bmesh.ops.connect_verts(bm, verts=[v_a, v_b])
                except Exception:
                    pass

    # Final triangulation on any remaining >3 vertex faces created by single-edge splits
    bm.faces.ensure_lookup_table()
    rem = [f for f in bm.faces if len(f.verts) > 3]
    if rem:
        bmesh.ops.triangulate(bm, faces=rem)

    bm.normal_update()
    bm.to_mesh(mesh_obj.data)
    mesh_obj.data.update()
    bm.free()

    return collect_inside_faces_xz(mesh_obj, poly_xz, cy, head_w, pad)


def collect_inside_faces_xz(mesh_obj, poly_xz: np.ndarray, cy: float, head_w: float, pad: float):
    """Return polygon indices whose centroids fall inside closed XZ curve on the front face."""
    x0, z0 = poly_xz.min(axis=0) - pad
    x1, z1 = poly_xz.max(axis=0) + pad
    poly_centroids_idx = []
    mesh = mesh_obj.data
    vco = np.array([v.co for v in mesh.vertices], dtype=float)
    tri_cent_xz = []
    tri_idx = []
    for f in mesh.polygons:
        c = vco[list(f.vertices)].mean(axis=0)
        if c[1] <= cy + 0.04 * head_w and x0 <= c[0] <= x1 and z0 <= c[2] <= z1:
            tri_cent_xz.append((c[0], c[2]))
            tri_idx.append(f.index)
    if tri_cent_xz:
        sd = signed_distance_closed_poly_xz(np.array(tri_cent_xz, dtype=float), poly_xz)
        for fi, d in zip(tri_idx, sd):
            if d < 0.0:
                poly_centroids_idx.append(fi)
    return poly_centroids_idx


def slice_and_rip_mouth_seam(mesh_obj, seam_info, frame):
    """Slice smooth mouth seam into FaceSkin and rip upper/lower lips cleanly without T-junctions."""
    curve_x = seam_info['curve_x']
    curve_z = seam_info['curve_z']
    cx = frame['cx']
    cy = frame['cy']
    hw = frame['head_w']
    fh = frame['face_h']

    bm = bmesh.new()
    bm.from_mesh(mesh_obj.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    uv_lay = bm.loops.layers.uv.verify()
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    front_verts = [v for v in bm.verts if v.co.y <= cy + 0.02 * hw and abs(v.co.z - seam_info['z_center']) <= 0.09 * fh]
    # Snap corner endpoints to nearest front face vertices at corner X/Z
    target_r = np.array([seam_info['x_corner_r'], seam_info['curve_y'][0], seam_info['curve_z'][0]])
    target_l = np.array([seam_info['x_corner_l'], seam_info['curve_y'][-1], seam_info['curve_z'][-1]])
    v_r = min(front_verts, key=lambda v: (Vector(target_r) - v.co).length)
    v_l = min(front_verts, key=lambda v: (Vector(target_l) - v.co).length)

    x_lo = min(v_r.co.x, v_l.co.x)
    x_hi = max(v_r.co.x, v_l.co.x)
    span_x = max(x_hi - x_lo, 1e-5)

    def eval_seam_z(x: float) -> float:
        z_base = float(np.interp(x, curve_x, curve_z))
        # Blend outer 18% smoothly so endpoints pass strictly through v_r and v_l Z
        u = (x - x_lo) / span_x
        if u < 0.18:
            t = 1.0 - smoothstep_scalar(u / 0.18)
            z_corner_base = float(np.interp(v_r.co.x, curve_x, curve_z))
            z_base += t * (v_r.co.z - z_corner_base)
        elif u > 0.82:
            t = smoothstep_scalar((u - 0.82) / 0.18)
            z_corner_base = float(np.interp(v_l.co.x, curve_x, curve_z))
            z_base += t * (v_l.co.z - z_corner_base)
        return z_base

    def is_mouth_roi_vert(v):
        return (
            v.co.y <= cy + 0.02 * hw
            and (x_lo - 1e-6) <= v.co.x <= (x_hi + 1e-6)
            and abs(v.co.z - eval_seam_z(v.co.x)) <= 0.045 * fh
        )

    psi = {}
    eps_snap = max(fh * 1e-4, 1e-6)
    for v in bm.verts:
        if v == v_r or v == v_l:
            psi[v] = 0.0
        elif is_mouth_roi_vert(v):
            d = v.co.z - eval_seam_z(v.co.x)
            psi[v] = 0.0 if abs(d) < eps_snap else float(d)
        else:
            psi[v] = None

    edge_cross = []
    for e in bm.edges:
        a, b = e.verts[0], e.verts[1]
        pa, pb = psi.get(a), psi.get(b)
        if pa is None or pb is None:
            continue
        mid_x = 0.5 * (a.co.x + b.co.x)
        if mid_x <= x_lo or mid_x >= x_hi:
            continue
        if (pa < 0.0 < pb) or (pb < 0.0 < pa):
            edge_cross.append((e, a, b, pa, pb))

    for e, a, b, pa, pb in edge_cross:
        fac = float(np.clip(pa / (pa - pb), 0.08, 0.92))
        _ne, nv = bmesh.utils.edge_split(e, a, fac)
        psi[nv] = 0.0

    # Connect pairs of psi==0 vertices inside each multi-vert face
    bm.faces.ensure_lookup_table()
    for f in list(bm.faces):
        if not f.is_valid or len(f.verts) <= 3:
            continue
        zeros = [v for v in f.verts if psi.get(v) == 0.0]
        if len(zeros) == 2:
            va, vb = zeros[0], zeros[1]
            if not any(vb in e.verts for e in va.link_edges):
                try:
                    bmesh.ops.connect_verts(bm, verts=[va, vb])
                except Exception:
                    pass

    bm.faces.ensure_lookup_table()
    rem = [f for f in bm.faces if f.is_valid and len(f.verts) > 3]
    if rem:
        bmesh.ops.triangulate(bm, faces=rem)

    # Extract ordered seam chain from v_r to v_l along edges whose both verts have psi==0
    zero_verts = {v for v, val in psi.items() if val == 0.0 and v.is_valid}
    zero_adj = {v: set() for v in zero_verts}
    for e in bm.edges:
        if not e.is_valid:
            continue
        a, b = e.verts[0], e.verts[1]
        if a in zero_verts and b in zero_verts:
            if (x_lo - 1e-5) <= 0.5 * (a.co.x + b.co.x) <= (x_hi + 1e-5):
                zero_adj[a].add(b)
                zero_adj[b].add(a)

    # Shortest path along zero_adj (fallback allows bridging small front triangle edge if needed)
    def find_seam_chain():
        dist = {v_r: 0.0}
        prev = {v_r: None}
        pq = [(0.0, id(v_r), v_r)]
        while pq:
            d, _tid, u = heapq.heappop(pq)
            if u == v_l:
                chain = [v_l]
                while prev[chain[-1]] is not None:
                    chain.append(prev[chain[-1]])
                return chain[::-1]
            if d > dist[u]:
                continue
            for nxt in zero_adj.get(u, ()):
                # Monotonic-friendly weighting in +X
                dx = nxt.co.x - u.co.x
                pen = 1.0 if dx >= -0.002 * fh else 4.0
                nd = d + (nxt.co - u.co).length * pen
                if nd < dist.get(nxt, float('inf')):
                    dist[nxt] = nd
                    prev[nxt] = u
                    heapq.heappush(pq, (nd, id(nxt), nxt))
        return None

    chain = find_seam_chain()
    if not chain or len(chain) < 4:
        raise RuntimeError(f'Failed to extract continuous mouth seam chain ({len(chain) if chain else 0} verts).')

    # Rip interior seam vertices by duplicating them onto lower-side faces
    chain_set = set(chain)
    interior = chain[1:-1]
    upper_chain = list(chain)
    lower_chain = [chain[0]]

    # Classify every face adjacent to `interior` as upper or lower relative to seam curve
    dup_map = {}
    for v in interior:
        nv = bm.verts.new(v.co.copy())
        dup_map[v] = nv
        lower_chain.append(nv)
    lower_chain.append(chain[-1])

    touched_faces = {f for v in interior for f in v.link_faces}
    mat_w_faces = []
    for f in touched_faces:
        cent = f.calc_center_median()
        non_chain_vs = [v for v in f.verts if v not in chain_set]
        if non_chain_vs:
            # Determine side strictly from non-seam vertex Z relative to seam curve
            avg_non_chain = sum(v.co.z - eval_seam_z(v.co.x) for v in non_chain_vs) / len(non_chain_vs)
            if avg_non_chain < 0.0:
                mat_w_faces.append(f)
        elif cent.z < eval_seam_z(cent.x):
            mat_w_faces.append(f)

    # Rebuild lower-side faces using duplicated lower vertices, preserving UVs and material_index
    lower_specs = []
    for f in mat_w_faces:
        new_vs = [dup_map.get(l.vert, l.vert) for l in f.loops]
        new_uvs = [l[uv_lay].uv.copy() for l in f.loops]
        lower_specs.append((new_vs, new_uvs, f.material_index, f.smooth))

    for f in mat_w_faces:
        bm.faces.remove(f)

    for new_vs, new_uvs, mat_idx, sm in lower_specs:
        nf = bm.faces.new(new_vs)
        nf.material_index = mat_idx
        nf.smooth = sm
        for lp, uv_val in zip(nf.loops, new_uvs):
            lp[uv_lay].uv = uv_val

    # Slight clean micro-separation (0.00032 * fh) so lip seam NEVER welds on export/reimport
    # while keeping outer slit hairline tight visually; fade smoothly to 0 at corners.
    n_c = len(chain)
    lip_offset = 0.00032 * fh
    for idx in range(1, n_c - 1):
        t = idx / (n_c - 1)
        env = math.sin(math.pi * t) ** 0.7
        dz = lip_offset * env
        upper_chain[idx].co.z += dz
        lower_chain[idx].co.z -= dz

    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    # Extrude 2 inner rolled lip rings backward (+Y) on FaceSkin while keeping the innermost ring OPEN
    closed_loop_verts = upper_chain + lower_chain[-2:0:-1]  # CCW/CW cycle around mouth opening
    # Find boundary edges connecting consecutive vertices in closed_loop_verts
    loop_edges = []
    for i in range(len(closed_loop_verts)):
        a = closed_loop_verts[i]
        b = closed_loop_verts[(i + 1) % len(closed_loop_verts)]
        e = bm.edges.get((a, b))
        if e is not None:
            loop_edges.append(e)

    # Compute lip center & sample interior lip UVs from the upper/lower rim before extruding
    mouth_center = sum((v.co for v in closed_loop_verts), Vector((0.0, 0.0, 0.0))) / len(closed_loop_verts)
    orig_uv_by_vert = {}
    for f in bm.faces:
        for lp in f.loops:
            if lp.vert not in orig_uv_by_vert:
                orig_uv_by_vert[lp.vert] = lp[uv_lay].uv.copy()

    # Extrude ring 1 and ring 2 inward
    ring_steps = [
        (0.004 * fh, 0.97, 0.0008 * fh),
        (0.008 * fh, 0.93, 0.0018 * fh),
    ]
    cur_edges = loop_edges
    upper_set = set(upper_chain[1:-1])
    lower_set = set(lower_chain[1:-1])
    vert_side = {}
    for v in closed_loop_verts:
        if v in upper_set:
            vert_side[v] = 1.0
        elif v in lower_set:
            vert_side[v] = -1.0
        else:
            vert_side[v] = 0.0

    for step_idx, (dy_val, xz_scale, dz_open) in enumerate(ring_steps):
        res_ext = bmesh.ops.extrude_edge_only(bm, edges=cur_edges)
        geom = res_ext['geom']
        new_verts = [g for g in geom if isinstance(g, bmesh.types.BMVert)]
        new_edges = [g for g in geom if isinstance(g, bmesh.types.BMEdge)]
        new_faces = [g for g in geom if isinstance(g, bmesh.types.BMFace)]

        # Map each new vert back to its source vert along connecting bridge edges
        src_of_new = {}
        new_set = set(new_verts)
        for nf in new_faces:
            for e in nf.edges:
                a, b = e.verts[0], e.verts[1]
                if a in new_set and b not in new_set:
                    src_of_new[a] = b
                elif b in new_set and a not in new_set:
                    src_of_new[b] = a

        # Move new vertices inward (+Y), gently scale XZ, slightly widen interior opening
        dy_prev = ring_steps[step_idx - 1][0] if step_idx > 0 else 0.0
        sc_prev = ring_steps[step_idx - 1][1] if step_idx > 0 else 1.0
        dz_prev = ring_steps[step_idx - 1][2] if step_idx > 0 else 0.0
        for nv in new_verts:
            sv = src_of_new.get(nv)
            side_sgn = vert_side.get(sv, 0.0) if sv else 0.0
            vert_side[nv] = side_sgn
            orig_uv_by_vert[nv] = orig_uv_by_vert.get(sv, Vector((0.5, 0.5))) if sv else Vector((0.5, 0.5))
            rel_x = (nv.co.x - mouth_center.x) * (xz_scale / sc_prev)
            nv.co.x = mouth_center.x + rel_x
            nv.co.y += (dy_val - dy_prev)
            nv.co.z += side_sgn * (dz_open - dz_prev)

        for nf in new_faces:
            nf.smooth = True
            for lp in nf.loops:
                if lp.vert in orig_uv_by_vert:
                    lp[uv_lay].uv = orig_uv_by_vert[lp.vert]

        cur_edges = [e for e in new_edges if e.verts[0] in new_set and e.verts[1] in new_set]

    # Collect final inner open lip rim loop coords for MouthBag attachment
    inner_loop_verts = list({v for e in cur_edges for v in e.verts})
    inner_ring_ordered = order_boundary_loop(cur_edges)
    inner_coords = [v.co.copy() for v in inner_ring_ordered]

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    bm.to_mesh(mesh_obj.data)
    mesh_obj.data.update()
    bm.free()

    return {
        'chain_count': len(chain),
        'inner_ring_coords': inner_coords,
        'mouth_center': mouth_center.copy(),
    }


def smoothstep_scalar(x: float) -> float:
    t = max(0.0, min(1.0, x))
    return t * t * (3.0 - 2.0 * t)


def order_boundary_loop(edges):
    """Order connected boundary edges into a single ring list of BMVerts."""
    adj = {}
    for e in edges:
        a, b = e.verts[0], e.verts[1]
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    if not adj:
        return []
    start = next(iter(adj))
    ring = [start]
    prev = None
    cur = start
    while True:
        nxts = [u for u in adj[cur] if u != prev]
        if not nxts:
            break
        nxt = nxts[0]
        if nxt == start:
            break
        ring.append(nxt)
        prev, cur = cur, nxt
        if len(ring) > len(adj) + 2:
            break
    return ring


def create_material(name: str, rgba, roughness: float = 0.75, metallic: float = 0.0, backface_cull: bool = False):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    mat.use_backface_culling = backface_cull
    bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is not None:
        bsdf.inputs['Base Color'].default_value = (rgba[0], rgba[1], rgba[2], 1.0)
        if 'Roughness' in bsdf.inputs:
            bsdf.inputs['Roughness'].default_value = roughness
        if 'Metallic' in bsdf.inputs:
            bsdf.inputs['Metallic'].default_value = metallic
        if 'Specular IOR Level' in bsdf.inputs:
            bsdf.inputs['Specular IOR Level'].default_value = 0.15
    return mat


def separate_eyes_and_fold_sockets(face_obj, eye_L, eye_R, faces_L, faces_R, frame, sample_fn):
    """Separate Eye_L / Eye_R meshes, weld internal cracks/holes, push back with sclera skirt, and fold sockets."""
    fh = frame['face_h']
    eye_depth = 0.0048 * fh

    def extract_eye_obj(name: str, face_indices, eye_info):
        mesh = face_obj.data
        src_bm = bmesh.new()
        src_bm.from_mesh(mesh)
        src_bm.faces.ensure_lookup_table()
        uv_src = src_bm.loops.layers.uv.verify()

        keep_set = set(face_indices)
        del_faces = [f for f in src_bm.faces if f.index not in keep_set]
        bmesh.ops.delete(src_bm, geom=del_faces, context='FACES')
        src_bm.verts.ensure_lookup_table()
        src_bm.edges.ensure_lookup_table()
        src_bm.faces.ensure_lookup_table()

        # Weld internal coincident UV-seam vertices & dissolve degenerate faces BEFORE finding outer boundary
        bmesh.ops.remove_doubles(src_bm, verts=src_bm.verts, dist=max(8e-5 * fh, 1e-5))
        bmesh.ops.dissolve_degenerate(src_bm, dist=max(2e-5 * fh, 1e-6))
        src_bm.verts.ensure_lookup_table()
        src_bm.edges.ensure_lookup_table()
        src_bm.faces.ensure_lookup_table()

        # Deduplicate faces sharing identical sorted vertex sets (clean up overlapping pupil triangles)
        seen_face_keys = set()
        dup_faces = []
        for f in src_bm.faces:
            key = tuple(sorted(v.index for v in f.verts))
            if key in seen_face_keys or len(set(key)) < 3:
                dup_faces.append(f)
            else:
                seen_face_keys.add(key)
        if dup_faces:
            bmesh.ops.delete(src_bm, geom=dup_faces, context='FACES')
            src_bm.verts.ensure_lookup_table()
            src_bm.edges.ensure_lookup_table()
            src_bm.faces.ensure_lookup_table()

        # Separate outer eye boundary from any tiny internal hole loops, and fill internal micro-holes cleanly
        bnd_all = [e for e in src_bm.edges if e.is_boundary]
        edge_adj = {}
        for e in bnd_all:
            v0, v1 = e.verts[0], e.verts[1]
            edge_adj.setdefault(v0, []).append(e)
            edge_adj.setdefault(v1, []).append(e)
        seen_e = set()
        bnd_loops = []
        for e_start in bnd_all:
            if e_start in seen_e:
                continue
            loop_e = []
            cur_e = e_start
            cur_v = e_start.verts[0]
            while cur_e is not None and cur_e not in seen_e:
                seen_e.add(cur_e)
                loop_e.append(cur_e)
                nxt_v = cur_e.other_vert(cur_v)
                nxts = [ne for ne in edge_adj.get(nxt_v, ()) if ne not in seen_e]
                cur_v = nxt_v
                cur_e = nxts[0] if nxts else None
            bnd_loops.append(loop_e)

        bnd_loops.sort(key=len, reverse=True)
        outer_bnd = bnd_loops[0] if bnd_loops else []
        for inner_loop in bnd_loops[1:]:
            if len(inner_loop) <= 12:
                try:
                    loop_vs = list({v for e in inner_loop for v in e.verts})
                    res_fill = bmesh.ops.contextual_create(src_bm, geom=loop_vs)
                    for nf in res_fill.get('faces', ()):
                        nf.smooth = True
                        # Copy UV from neighboring face sharing an edge
                        for lp in nf.loops:
                            copied = False
                            for lf in lp.vert.link_faces:
                                if lf != nf:
                                    for llp in lf.loops:
                                        if llp.vert == lp.vert:
                                            lp[uv_src].uv = llp[uv_src].uv.copy()
                                            copied = True
                                            break
                                if copied:
                                    break
                except Exception:
                    pass

        src_bm.verts.ensure_lookup_table()
        src_bm.edges.ensure_lookup_table()
        src_bm.faces.ensure_lookup_table()

        ecx, ecz = eye_info['center_xz']
        # Slightly expand main eye patch in XZ so it tucks cleanly under eyelid margin, then step backward (+Y)
        for v in src_bm.verts:
            v.co.x = ecx + (v.co.x - ecx) * 1.07
            v.co.z = ecz + (v.co.z - ecz) * 1.09
            v.co.y += eye_depth

        # Extrude 2 curved protective white sclera backing rings ONLY on the single outer eye boundary loop
        orig_uv = {}
        for f in src_bm.faces:
            for lp in f.loops:
                if lp.vert not in orig_uv:
                    orig_uv[lp.vert] = lp[uv_src].uv.copy()

        best_sclera_uv = None
        best_score = -1.0
        for v in src_bm.verts:
            res = sample_fn(v.co.x, v.co.z)
            if res is not None:
                _, _, uv_s, rgb_s = res
                sc = float(min(rgb_s[0], rgb_s[1], rgb_s[2])) - 1.5 * float(max(rgb_s[0] - rgb_s[2], 0.0))
                if sc > best_score:
                    best_score = sc
                    best_sclera_uv = uv_s.copy()

        cur_bnd = [e for e in outer_bnd if e.is_valid and e.is_boundary]
        skirt_steps = (
            (1.18 / 1.07, 1.20 / 1.09, 0.0018 * fh),
            (1.34 / 1.18, 1.36 / 1.20, 0.0032 * fh),
        )
        for sx_mul, sz_mul, dy_step in skirt_steps:
            if not cur_bnd:
                break
            res_ext = bmesh.ops.extrude_edge_only(src_bm, edges=cur_bnd)
            geom = res_ext['geom']
            new_vs = [g for g in geom if isinstance(g, bmesh.types.BMVert)]
            new_es = [g for g in geom if isinstance(g, bmesh.types.BMEdge)]
            new_fs = [g for g in geom if isinstance(g, bmesh.types.BMFace)]
            new_set = set(new_vs)
            for nv in new_vs:
                nv.co.x = ecx + (nv.co.x - ecx) * sx_mul
                nv.co.z = ecz + (nv.co.z - ecz) * sz_mul
                nv.co.y += dy_step
            for nf in new_fs:
                nf.smooth = True
                for lp in nf.loops:
                    if best_sclera_uv is not None and lp.vert in new_set:
                        lp[uv_src].uv = best_sclera_uv
                    elif lp.vert in orig_uv:
                        lp[uv_src].uv = orig_uv[lp.vert]
            cur_bnd = [e for e in new_es if e.verts[0] in new_set and e.verts[1] in new_set]

        # Enforce front-facing normals explicitly
        src_bm.normal_update()
        for f in src_bm.faces:
            if f.normal.y > 0.0:
                f.normal_flip()
        src_bm.normal_update()

        eye_mesh = bpy.data.meshes.new(name)
        src_bm.to_mesh(eye_mesh)
        src_bm.free()
        eye_mesh.validate(verbose=False)
        for mat in face_obj.data.materials:
            eye_mesh.materials.append(mat)
        eye_obj = bpy.data.objects.new(name, eye_mesh)
        bpy.context.scene.collection.objects.link(eye_obj)
        return eye_obj

    obj_eye_l = extract_eye_obj('Eye_L', faces_L, eye_L)
    obj_eye_r = extract_eye_obj('Eye_R', faces_R, eye_R)

    # Now delete eye faces from FaceSkin and extrude eyelid socket thickness backward (+Y)
    bm = bmesh.new()
    bm.from_mesh(face_obj.data)
    bm.faces.ensure_lookup_table()
    uv_lay = bm.loops.layers.uv.verify()

    all_eye_faces = set(faces_L) | set(faces_R)
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in all_eye_faces], context='FACES')
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    # Identify left & right eye socket boundary loops separately near eye centers
    cx = frame['cx']
    bnd_edges_all = [e for e in bm.edges if e.is_boundary and e.verts[0].co.y <= frame['cy'] + 0.04 * frame['head_w']]
    left_bnd = [e for e in bnd_edges_all if 0.5 * (e.verts[0].co.x + e.verts[1].co.x) > cx and abs(e.verts[0].co.z - eye_L['center_xz'][1]) < 0.09 * fh]
    right_bnd = [e for e in bnd_edges_all if 0.5 * (e.verts[0].co.x + e.verts[1].co.x) < cx and abs(e.verts[0].co.z - eye_R['center_xz'][1]) < 0.09 * fh]

    def fold_socket_rim(bnd_edges, eye_info):
        if not bnd_edges:
            return []
        ring_verts = order_boundary_loop(bnd_edges)
        outer_rim_pts = [v.co.copy() for v in ring_verts]
        ecx, ecz = eye_info['center_xz']

        # Sample clean eyelid skin UV 0.005 * fh outward from each socket vertex
        rim_uv = {}
        for v in ring_verts:
            d = Vector((v.co.x - ecx, 0.0, v.co.z - ecz))
            if d.length > 1e-6:
                d.normalize()
            res = sample_fn(v.co.x + d.x * 0.005 * fh, v.co.z + d.z * 0.005 * fh)
            rim_uv[v] = res[2].copy() if res is not None else Vector((0.5, 0.5))

        cur_edges = bnd_edges
        fold_steps = ((0.0045 * fh, 0.992), (0.0090 * fh, 0.985))
        prev_dy = 0.0
        prev_sc = 1.0
        for step_dy, shrink in fold_steps:
            ext = bmesh.ops.extrude_edge_only(bm, edges=cur_edges)
            geom = ext['geom']
            new_vs = [g for g in geom if isinstance(g, bmesh.types.BMVert)]
            new_es = [g for g in geom if isinstance(g, bmesh.types.BMEdge)]
            new_fs = [g for g in geom if isinstance(g, bmesh.types.BMFace)]
            new_set = set(new_vs)
            src_map = {}
            for nf in new_fs:
                for e in nf.edges:
                    a, b = e.verts[0], e.verts[1]
                    if a in new_set and b not in new_set:
                        src_map[a] = b
                    elif b in new_set and a not in new_set:
                        src_map[b] = a
            for nv in new_vs:
                sv = src_map.get(nv)
                rim_uv[nv] = rim_uv.get(sv, Vector((0.5, 0.5))) if sv else Vector((0.5, 0.5))
                nv.co.x = ecx + (nv.co.x - ecx) * (shrink / prev_sc)
                nv.co.z = ecz + (nv.co.z - ecz) * (shrink / prev_sc)
                nv.co.y += (step_dy - prev_dy)
            prev_dy = step_dy
            prev_sc = shrink
            for nf in new_fs:
                nf.smooth = True
                for lp in nf.loops:
                    if lp.vert in rim_uv:
                        lp[uv_lay].uv = rim_uv[lp.vert]
            cur_edges = [e for e in new_es if e.verts[0] in new_set and e.verts[1] in new_set]
        return outer_rim_pts

    rim_l = fold_socket_rim(left_bnd, eye_L)
    rim_r = fold_socket_rim(right_bnd, eye_R)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    bm.to_mesh(face_obj.data)
    face_obj.data.update()
    bm.free()

    return obj_eye_l, obj_eye_r, rim_l, rim_r


def build_eyelash_mesh(name: str, eye_info, sample_fn, frame, mat, side: str):
    """Build curved 3D upper eyelash strip anchored directly along the sliced upper eyelid edge."""
    fh = frame['face_h']
    up_xz = eye_info['upper_xz']  # Ordered smaller-X -> larger-X
    # Orient from inner corner -> outer corner so taper profile matches inner/outer anatomy
    if side == 'L':
        pts_xz = up_xz  # L: inner (+0.07) -> outer (+0.17)
    else:
        pts_xz = up_xz[::-1]  # R: inner (-0.07) -> outer (-0.17)

    # Keep central 88% of upper curve and pull root directly onto the eyelid mesh surface
    n_pts = 28
    u = np.linspace(0.04, 0.98, n_pts)
    t_orig = np.linspace(0.0, 1.0, len(pts_xz))
    rx = np.interp(u, t_orig, pts_xz[:, 0])
    rz = np.interp(u, t_orig, pts_xz[:, 1])

    root_pts = []
    for x, z in zip(rx, rz):
        # Anchor directly along the sliced upper eyelid margin (zero floating gap)
        res = sample_fn(float(x), float(z - 0.0004 * fh))
        if res is not None:
            loc = res[0]
            root_pts.append(Vector((float(x), float(loc.y) + 0.0005 * fh, float(z - 0.0005 * fh))))
        else:
            root_pts.append(Vector((float(x), eye_info['y_skin'], float(z - 0.0005 * fh))))

    # Extend outer corner wing slightly for crisp anime/3D lash silhouette
    outer_dir_x = 1.0 if side == 'L' else -1.0
    p_last = root_pts[-1].copy()
    p_wing = Vector((p_last.x + outer_dir_x * 0.010 * fh, p_last.y + 0.003 * fh, p_last.z + 0.003 * fh))
    root_pts.append(p_wing)
    u = np.append(u, 1.04)

    n = len(root_pts)
    verts_list = []
    faces_list = []
    # Build sleek curved lash strip anchored cleanly on the upper eyelid margin
    for j in range(n):
        t = min(max((u[j] - 0.04) / 1.0, 0.0), 1.0)
        len_env = math.sin(math.pi * min(t / 0.85, 1.0)) ** 0.75 if t < 0.85 else max(0.25, 1.0 - (t - 0.85) / 0.20)
        lash_fwd = (0.004 + 0.011 * len_env) * fh
        lash_up = (0.002 + 0.009 * len_env) * fh
        thick_z = (0.0007 + 0.0009 * len_env) * fh
        p0 = root_pts[j]
        out_tilt = outer_dir_x * 0.004 * fh * (t ** 1.4)

        row_top_0 = p0 + Vector((0.0, 0.0012 * fh, 0.5 * thick_z))
        row_top_1 = p0 + Vector((0.35 * out_tilt, -0.45 * lash_fwd, 0.35 * lash_up + 0.35 * thick_z))
        row_top_2 = p0 + Vector((out_tilt, -lash_fwd, lash_up))
        row_bot_1 = p0 + Vector((0.35 * out_tilt, -0.42 * lash_fwd, 0.25 * lash_up - 0.45 * thick_z))
        row_bot_0 = p0 + Vector((0.0, 0.0012 * fh, -0.5 * thick_z))

        verts_list.extend([row_top_0, row_top_1, row_top_2, row_bot_1, row_bot_0])

    stride = 5
    for j in range(n - 1):
        b0 = j * stride
        b1 = (j + 1) * stride
        for k in range(stride):
            kn = (k + 1) % stride
            faces_list.append((b0 + k, b1 + k, b1 + kn, b0 + kn))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts_list], [], faces_list)
    mesh.update()
    for p in mesh.polygons:
        p.use_smooth = True
    mesh.materials.append(mat)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_mouth_bag(inner_ring_coords, mouth_center, frame, mat):
    """Build enclosed dark interior oral pouch (`MouthBag`) from FaceSkin's inner lip ring."""
    fh = frame['face_h']
    bm = bmesh.new()
    ring0 = [bm.verts.new(c.copy()) for c in inner_ring_coords]
    n = len(ring0)
    rings = [ring0]

    # Extrude 4 rings backward into skull, expanding XZ slightly for interior dental clearance, then dome-cap
    depth_steps = [
        (0.018 * fh, 1.15, 1.50),
        (0.055 * fh, 1.38, 2.20),
        (0.105 * fh, 1.30, 1.95),
        (0.140 * fh, 0.65, 1.00),
    ]
    for dy, sx, sz in depth_steps:
        r_new = []
        for p0 in inner_ring_coords:
            v = bm.verts.new(Vector((
                mouth_center.x + (p0.x - mouth_center.x) * sx,
                p0.y + dy,
                mouth_center.z + (p0.z - mouth_center.z) * sz,
            )))
            r_new.append(v)
        rings.append(r_new)

    for r_idx in range(len(rings) - 1):
        ra = rings[r_idx]
        rb = rings[r_idx + 1]
        for i in range(n):
            inext = (i + 1) % n
            f = bm.faces.new((ra[i], ra[inext], rb[inext], rb[i]))
            f.smooth = True

    # Cap back end of MouthBag cleanly
    back = rings[-1]
    c_back = sum((v.co for v in back), Vector((0.0, 0.0, 0.0))) / len(back)
    v_cap = bm.verts.new(c_back + Vector((0.0, 0.012 * fh, 0.0)))
    for i in range(n):
        inext = (i + 1) % n
        f = bm.faces.new((back[i], back[inext], v_cap))
        f.smooth = True

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # Flip normals to point INSIDE the mouth cavity (visible from -Y looking into open lips)
    for f in bm.faces:
        f.normal_flip()

    mesh = bpy.data.meshes.new('MouthBag')
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new('MouthBag', mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_dental_arc(name: str, seam_info, frame, mat, is_upper: bool):
    """Build smooth curved low-poly tooth row safely recessed behind closed lips."""
    fh = frame['face_h']
    mw = seam_info['width']
    cx = frame['cx']
    cy_lip = seam_info['y_center']
    cz = seam_info['z_center']

    n_u = 16
    half_w = 0.34 * mw
    tooth_h = (0.015 if is_upper else 0.012) * fh
    thick_y = 0.008 * fh
    # Recess safely behind FaceSkin lip thickness (+0.028*fh)
    y_front = cy_lip + 0.028 * fh
    arch_y = 0.028 * fh
    z_top = (cz + tooth_h + 0.0045 * fh) if is_upper else (cz - 0.009 * fh)
    z_bot = (cz + 0.0045 * fh) if is_upper else (cz - tooth_h - 0.009 * fh)

    front_top = []
    front_bot = []
    back_top = []
    back_bot = []
    bm = bmesh.new()
    for i in range(n_u):
        t = (i / (n_u - 1)) * 2.0 - 1.0  # -1..+1
        x = cx + t * half_w
        y_f = y_front + arch_y * (t ** 2)
        z_curve = 0.002 * fh * (1.0 - t ** 2)
        # Subtle anime/clean dental edge curve
        zt = z_top + (0.0 if is_upper else -z_curve)
        zb = z_bot + (z_curve * 0.4 if is_upper else 0.0)
        front_top.append(bm.verts.new(Vector((x, y_f, zt))))
        front_bot.append(bm.verts.new(Vector((x, y_f, zb))))
        back_top.append(bm.verts.new(Vector((x, y_f + thick_y, zt))))
        back_bot.append(bm.verts.new(Vector((x, y_f + thick_y, zb))))

    for i in range(n_u - 1):
        # Front, bottom/top biting face, back
        for quad in (
            (front_top[i], front_bot[i], front_bot[i + 1], front_top[i + 1]),
            (back_bot[i], back_top[i], back_top[i + 1], back_bot[i + 1]),
            (front_bot[i], back_bot[i], back_bot[i + 1], front_bot[i + 1]),
            (back_top[i], front_top[i], front_top[i + 1], back_top[i + 1]),
        ):
            f = bm.faces.new(quad)
            f.smooth = True
    bm.faces.new((front_top[0], back_top[0], back_bot[0], front_bot[0])).smooth = True
    bm.faces.new((front_bot[-1], back_bot[-1], back_top[-1], front_top[-1])).smooth = True
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def build_tongue_mesh(seam_info, frame, mat):
    """Build smooth low-poly tongue resting safely inside the oral cavity."""
    fh = frame['face_h']
    mw = seam_info['width']
    cx = frame['cx']
    cy_lip = seam_info['y_center']
    cz = seam_info['z_center']

    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1.0, location=(0.0, 0.0, 0.0))
    obj = bpy.context.active_object
    obj.name = 'Tongue'
    sx = 0.26 * mw
    sy = 0.038 * fh
    sz = 0.010 * fh
    ty = cy_lip + 0.072 * fh
    tz = cz - 0.015 * fh
    for v in obj.data.vertices:
        t_fwd = max(0.0, -v.co.y)
        v.co.x *= sx * (1.0 - 0.25 * (t_fwd ** 2))
        v.co.y = ty + v.co.y * sy
        v.co.z = tz + v.co.z * sz - 0.004 * fh * t_fwd
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.data.materials.append(mat)
    obj.data.update()
    return obj


def setup_render_scene(center_xyz, distance: float):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 16
    scene.render.resolution_x = 800
    scene.render.resolution_y = 800
    scene.render.image_settings.file_format = 'PNG'

    world = bpy.data.worlds.get('SurgeryPreviewWorld') or bpy.data.worlds.new('SurgeryPreviewWorld')
    scene.world = world
    world.use_nodes = True
    bg = next((n for n in world.node_tree.nodes if n.type == 'BACKGROUND'), None)
    if bg:
        bg.inputs['Color'].default_value = (0.12, 0.13, 0.16, 1.0)
        bg.inputs['Strength'].default_value = 0.65

    # Soft studio 3-point lighting
    for lname, loc, energy, size in (
        ('SurgeryKeyLight', (center_xyz[0] - 0.5, center_xyz[1] - 1.6, center_xyz[2] + 0.6), 90.0, 1.2),
        ('SurgeryFillLight', (center_xyz[0] + 0.8, center_xyz[1] - 1.4, center_xyz[2] + 0.1), 50.0, 1.4),
        ('SurgeryRimLight', (center_xyz[0], center_xyz[1] + 1.2, center_xyz[2] + 0.8), 45.0, 1.0),
    ):
        ld = bpy.data.lights.new(lname, type='AREA')
        ld.energy = energy
        ld.size = size
        lo = bpy.data.objects.new(lname, ld)
        lo.location = loc
        direction = Vector(center_xyz) - Vector(loc)
        lo.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
        scene.collection.objects.link(lo)

    cam_data = bpy.data.cameras.new('SurgeryPreviewCam')
    cam_data.lens = 58
    cam_obj = bpy.data.objects.new('SurgeryPreviewCam', cam_data)
    scene.collection.objects.link(cam_obj)
    scene.camera = cam_obj
    return cam_obj


def point_camera(cam_obj, cam_pos, look_target):
    cam_obj.location = cam_pos
    direction = Vector(look_target) - Vector(cam_pos)
    cam_obj.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()


def render_preview_suite(out_preview_dir: Path, surgery_objs, frame, eye_l, eye_r, seam_info, bh_api):
    out_preview_dir.mkdir(parents=True, exist_ok=True)
    fh = frame['face_h']
    face_center = (frame['cx'], seam_info['y_center'], 0.5 * (eye_l['center_xz'][1] + seam_info['z_center']))
    cam = setup_render_scene(face_center, 0.72 * fh)

    # 1. Front closeup
    point_camera(cam, (frame['cx'], face_center[1] - 0.82 * fh, face_center[2] + 0.02 * fh), face_center)
    bpy.context.scene.render.filepath = str(out_preview_dir / '01_front_neutral.png')
    bpy.ops.render.render(write_still=True)

    # 2. Left 3/4 closeup focused around eye socket depth & lashes
    eye_target = (eye_l['center_xz'][0] * 0.65, eye_l['y_socket_med'], eye_l['center_xz'][1] - 0.04 * fh)
    point_camera(cam, (frame['cx'] + 0.42 * fh, face_center[1] - 0.65 * fh, face_center[2] + 0.05 * fh), eye_target)
    bpy.context.scene.render.filepath = str(out_preview_dir / '02_three_quarter.png')
    bpy.ops.render.render(write_still=True)

    # 3. Temporary exploded view showing all 8 separated parts cleanly
    saved_locs = {o.name: o.location.copy() for o in surgery_objs}
    offsets = {
        'FaceSkin': Vector((0.0, 0.0, 0.0)),
        'Eye_L': Vector((0.18 * fh, -0.22 * fh, 0.03 * fh)),
        'Eye_R': Vector((-0.18 * fh, -0.22 * fh, 0.03 * fh)),
        'Eyelash_Upper_L': Vector((0.20 * fh, -0.34 * fh, 0.08 * fh)),
        'Eyelash_Upper_R': Vector((-0.20 * fh, -0.34 * fh, 0.08 * fh)),
        'MouthBag': Vector((0.0, -0.26 * fh, -0.16 * fh)),
        'Teeth_Upper': Vector((0.0, -0.38 * fh, -0.05 * fh)),
        'Teeth_Lower': Vector((0.0, -0.38 * fh, -0.14 * fh)),
        'Tongue': Vector((0.0, -0.44 * fh, -0.20 * fh)),
    }
    for o in surgery_objs:
        if o.name in offsets:
            o.location = saved_locs[o.name] + offsets[o.name]
    point_camera(cam, (frame['cx'] + 0.55 * fh, face_center[1] - 1.05 * fh, face_center[2] - 0.02 * fh),
                 (frame['cx'], face_center[1] - 0.15 * fh, face_center[2] - 0.04 * fh))
    bpy.context.scene.render.filepath = str(out_preview_dir / '03_parts_exploded.png')
    bpy.ops.render.render(write_still=True)
    for o in surgery_objs:
        o.location = saved_locs[o.name]

    # 4. Temporary expression test: open mouth + single-eye blink using actual FaceSkin + Eyelash_Upper_L
    exp_api = load_sibling_module('charakit_body_hair_expressions', 'body-hair-expressions.py')
    em = load_sibling_module('charakit_expression_mask', 'expression-mask.py')
    et = load_sibling_module('charakit_expression_transfer', 'expression-transfer.py')

    face_obj = bpy.data.objects['FaceSkin']
    lash_l = bpy.data.objects['Eyelash_Upper_L']
    # Save original vertex positions
    orig_face_co = [v.co.copy() for v in face_obj.data.vertices]
    orig_lash_co = [v.co.copy() for v in lash_l.data.vertices]

    # Build lightweight landmarks matching exact cut bounds for temporary preview expression
    landmarks_temp = {}
    for side, einfo in (('L', eye_l), ('R', eye_r)):
        up = einfo['upper_xz']
        dn = einfo['lower_xz']
        if side == 'R':
            up = up[::-1]
            dn = dn[::-1]
        ts = np.linspace(0.0, 1.0, 7)
        for idx, k in enumerate((f'eyeInner{side}', f'eyeUpper1{side}', f'eyeUpper2{side}', f'eyeUpper{side}', f'eyeUpper4{side}', f'eyeUpper5{side}', f'eyeOuter{side}')):
            t_v = ts[idx]
            x = float(up[0, 0] + t_v * (up[-1, 0] - up[0, 0]))
            z = float(np.interp(x, sorted(up[:, 0]), up[:, 1] if up[0, 0] < up[-1, 0] else up[::-1, 1]))
            landmarks_temp[k] = [x, einfo['y_skin'], z]
        for idx, k in enumerate((f'eyeLower1{side}', f'eyeLower2{side}', f'eyeLower{side}', f'eyeLower4{side}', f'eyeLower5{side}')):
            t_v = ts[idx + 1]
            x = float(dn[0, 0] + t_v * (dn[-1, 0] - dn[0, 0]))
            z = float(np.interp(x, sorted(dn[:, 0]), dn[:, 1] if dn[0, 0] < dn[-1, 0] else dn[::-1, 1]))
            landmarks_temp[k] = [x, einfo['y_skin'], z - 0.0065 * fh]
    landmarks_temp['mouthCornerR'] = [seam_info['x_corner_r'], seam_info['curve_y'][0], seam_info['curve_z'][0]]
    landmarks_temp['mouthCornerL'] = [seam_info['x_corner_l'], seam_info['curve_y'][-1], seam_info['curve_z'][-1]]
    landmarks_temp['mouthUpper'] = [frame['cx'], seam_info['y_center'], seam_info['z_center'] + 0.008 * fh]
    landmarks_temp['mouthLower'] = [frame['cx'], seam_info['y_center'], seam_info['z_center'] - 0.008 * fh]
    for side, einfo in (('L', eye_l), ('R', eye_r)):
        sgn = 1.0 if side == 'L' else -1.0
        landmarks_temp[f'browInner{side}'] = [frame['cx'] + sgn * 0.10 * frame['head_w'], einfo['y_skin'], einfo['center_xz'][1] + 0.075 * fh]
        landmarks_temp[f'browMiddle{side}'] = [einfo['center_xz'][0], einfo['y_skin'], einfo['center_xz'][1] + 0.088 * fh]
        landmarks_temp[f'browOuter{side}'] = [einfo['center_xz'][0] + sgn * 0.55 * einfo['width'], einfo['y_skin'], einfo['center_xz'][1] + 0.080 * fh]

    head_metrics = {
        'min': [frame['cx'] - 0.5 * frame['head_w'], face_center[1] - 0.1 * fh, frame['chin_z']],
        'max': [frame['cx'] + 0.5 * frame['head_w'], frame['cy'] + 0.5 * frame['head_w'], frame['top_z']],
        'height': fh,
        'width': frame['head_w'],
        'center': [frame['cx'], frame['cy'], frame['chin_z'] + 0.5 * fh],
    }
    center_np = np.array(head_metrics['center'], dtype=float)
    scale = fh * 1.25

    face_obj.shape_key_add(name='Basis')
    eye_names, _ = exp_api.generate_eye_expressions([face_obj], landmarks_temp, center_np, scale, em)
    mouth_names, m_info = exp_api.generate_mouth_expressions([face_obj], landmarks_temp, head_metrics, et)
    exp_api.transfer_eye_keys_to_lashes([face_obj], [lash_l], eye_names)
    print(f'[head-local-surgery] Preview expression check: mouthMode={m_info.get("mouthMode")}')

    # Activate EA_aa + EA_blink_L for screenshot 04
    for obj in (face_obj, lash_l):
        if obj.data.shape_keys:
            for kb in obj.data.shape_keys.key_blocks:
                kb.value = 0.0
            for kname in ('EA_aa', 'EA_blink_L'):
                if kname in obj.data.shape_keys.key_blocks:
                    obj.data.shape_keys.key_blocks[kname].value = 1.0
    # Slightly drop lower teeth & tongue when EA_aa is active
    teeth_lo = bpy.data.objects.get('Teeth_Lower')
    tongue = bpy.data.objects.get('Tongue')
    if teeth_lo:
        teeth_lo.location.z -= 0.022 * fh
    if tongue:
        tongue.location.z -= 0.015 * fh
    bpy.context.view_layer.update()

    point_camera(cam, (frame['cx'] + 0.22 * fh, face_center[1] - 0.80 * fh, face_center[2] + 0.01 * fh), face_center)
    bpy.context.scene.render.filepath = str(out_preview_dir / '04_open_mouth_and_blink.png')
    bpy.ops.render.render(write_still=True)

    # Restore rest geometry cleanly (remove temporary preview shape keys / offsets)
    if teeth_lo:
        teeth_lo.location.z += 0.022 * fh
    if tongue:
        tongue.location.z += 0.015 * fh
    for obj, orig in ((face_obj, orig_face_co), (lash_l, orig_lash_co)):
        if obj.data.shape_keys:
            obj.shape_key_clear()
        for v, co in zip(obj.data.vertices, orig):
            v.co = co
        obj.data.update()


def perform_head_surgery_on_meshes(meshes, bh_api, sb_api, lm_override=None):
    """Perform non-destructive eye/lash/mouth/oral surgery on imported head meshes in the active Blender scene."""
    if not meshes:
        raise RuntimeError('perform_head_surgery_on_meshes received empty meshes list.')

    for obj in meshes:
        bh_api.bake_mesh_world_transform(obj)
    bpy.context.view_layer.update()

    pts = bh_api.collect_meshes_points(meshes)
    rot_z, front_axis = sb_api.detect_head_rotation_z(pts)
    if abs(rot_z) > 1e-6:
        c_xy = Vector((float(pts[:, 0].mean()), float(pts[:, 1].mean()), 0.0))
        rot_mat = Matrix.Translation(c_xy) @ Euler((0.0, 0.0, rot_z), 'XYZ').to_matrix().to_4x4() @ Matrix.Translation(-c_xy)
        for obj in meshes:
            obj.data.transform(rot_mat)
            obj.data.update()

    # Merge into one FaceSkin object if multiple meshes exist, and clone original backup
    if len(meshes) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        face_obj = bpy.context.view_layer.objects.active
    else:
        face_obj = meshes[0]

    face_obj.name = 'FaceSkin'
    backup_mesh = face_obj.data.copy()
    backup_mesh.name = 'Head_Original_Backup'
    backup_obj = bpy.data.objects.new('Head_Original_Backup', backup_mesh)
    bpy.context.scene.collection.objects.link(backup_obj)
    backup_obj.hide_set(True)
    backup_obj.hide_render = True

    tex_img = find_primary_texture([face_obj])
    frame = compute_face_frame(face_obj)
    sample_fn, _bvh, _min_y = make_xz_sampler(backup_obj, tex_img)

    # Weld coincident UV-seam vertices on FaceSkin BEFORE slicing (preserves loop UVs while preventing island cracks)
    bm_clean = bmesh.new()
    bm_clean.from_mesh(face_obj.data)
    bmesh.ops.remove_doubles(bm_clean, verts=bm_clean.verts, dist=max(5e-5 * frame['face_h'], 1e-5))
    bm_clean.normal_update()
    bm_clean.to_mesh(face_obj.data)
    face_obj.data.update()
    bm_clean.free()

    print(f'[head-local-surgery] Oriented front={front_axis}, face_h={frame["face_h"]:.4f}, chin_z={frame["chin_z"]:.4f}, z_nose={frame["z_nose"]:.4f}')

    eye_l = detect_eye_contour(sample_fn, frame, 'L', lm_override=lm_override)
    eye_r = detect_eye_contour(sample_fn, frame, 'R', lm_override=lm_override)
    if abs(eye_l['center_xz'][1] - eye_r['center_xz'][1]) < 0.015 * frame['face_h']:
        eye_l, eye_r = symmetrize_eye_contours(eye_l, eye_r, frame['cx'])

    seam_info = detect_mouth_seam(sample_fn, frame, lm_override=lm_override)
    print(f'[head-local-surgery] eyeL={eye_l["center_xz"]} ({eye_l["width"]:.4f}x{eye_l["height"]:.4f}), mouth={seam_info["x_corner_r"]:.4f}..{seam_info["x_corner_l"]:.4f} z={seam_info["z_center"]:.4f}')

    # Slice both eye socket loops cleanly into FaceSkin, then collect each eye's final face indices
    pad_eye = 0.03 * frame['head_w']
    slice_closed_loop_xz(face_obj, eye_l['poly_xz'], frame['cy'], frame['head_w'], pad_eye)
    slice_closed_loop_xz(face_obj, eye_r['poly_xz'], frame['cy'], frame['head_w'], pad_eye)
    faces_l = collect_inside_faces_xz(face_obj, eye_l['poly_xz'], frame['cy'], frame['head_w'], pad_eye)
    faces_r = collect_inside_faces_xz(face_obj, eye_r['poly_xz'], frame['cy'], frame['head_w'], pad_eye)

    # Separate Eye_L / Eye_R + extrude socket folds on FaceSkin
    obj_eye_l, obj_eye_r, _rim_l, _rim_r = separate_eyes_and_fold_sockets(
        face_obj, eye_l, eye_r, faces_l, faces_r, frame, sample_fn,
    )

    # Slice & rip open mouth seam + extrude inner lip thickness
    mouth_res = slice_and_rip_mouth_seam(face_obj, seam_info, frame)

    # Create anatomical materials
    lash_mat = create_material('EyelashMat', (0.075, 0.045, 0.045), roughness=0.68)
    mouth_mat = create_material('MouthInteriorMat', (0.28, 0.06, 0.07), roughness=0.88)
    teeth_mat = create_material('TeethMat', (0.93, 0.90, 0.85), roughness=0.38)
    tongue_mat = create_material('TongueMat', (0.76, 0.34, 0.36), roughness=0.58)

    obj_lash_l = build_eyelash_mesh('Eyelash_Upper_L', eye_l, sample_fn, frame, lash_mat, 'L')
    obj_lash_r = build_eyelash_mesh('Eyelash_Upper_R', eye_r, sample_fn, frame, lash_mat, 'R')
    obj_mouth_bag = build_mouth_bag(mouth_res['inner_ring_coords'], mouth_res['mouth_center'], frame, mouth_mat)
    obj_teeth_up = build_dental_arc('Teeth_Upper', seam_info, frame, teeth_mat, is_upper=True)
    obj_teeth_lo = build_dental_arc('Teeth_Lower', seam_info, frame, teeth_mat, is_upper=False)
    obj_tongue = build_tongue_mesh(seam_info, frame, tongue_mat)

    surgery_objs = [
        face_obj, obj_eye_l, obj_eye_r,
        obj_lash_l, obj_lash_r,
        obj_mouth_bag, obj_teeth_up, obj_teeth_lo, obj_tongue,
    ]
    surgery_meta = {
        'frontAxis': front_axis,
        'autoRotZDeg': round(math.degrees(rot_z), 1),
        'frame': frame,
        'eyeL': eye_l,
        'eyeR': eye_r,
        'seamInfo': seam_info,
        'mouthRes': mouth_res,
        'parts': {
            o.name: {'verts': len(o.data.vertices), 'polys': len(o.data.polygons)}
            for o in surgery_objs
        },
        'backup': {'name': backup_obj.name, 'verts': len(backup_obj.data.vertices)},
    }
    return surgery_objs, backup_obj, surgery_meta


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--out-dir', required=True)
    parser.add_argument('--name', default='head_surgery')
    parser.add_argument('--landmarks-json')
    parser.add_argument('--render-preview', action='store_true')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])

    in_path = Path(args.input).resolve()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    lm_override = json.loads(Path(args.landmarks_json).resolve().read_text(encoding='utf-8')) if args.landmarks_json else None

    mtoon_api = load_sibling_module('charakit_mtoon_export', 'mtoon-export.py')
    fullbody_api = load_sibling_module('charakit_fullbody_to_vrm', 'fullbody-to-vrm.py')
    bh_api = load_sibling_module('charakit_body_hair_to_vrm', 'body-hair-to-vrm.py')
    sb_api = load_sibling_module('charakit_stage_body_hair', 'stage-body-hair.py')

    mtoon_api.enable_vrm()
    fullbody_api.clear_scene()

    if in_path.suffix.lower() == '.blend':
        bpy.ops.wm.open_mainfile(filepath=str(in_path))
        meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not o.hide_render]
    else:
        imported = bh_api.import_model_with_textures(in_path)
        meshes = [o for o in imported if o.type == 'MESH' and not o.hide_render]
        for extra in imported:
            if extra not in meshes:
                bpy.data.objects.remove(extra, do_unlink=True)

    if not meshes:
        raise RuntimeError(f'No visible mesh found in {in_path}')

    surgery_objs, backup_obj, surgery_meta = perform_head_surgery_on_meshes(
        meshes, bh_api, sb_api, lm_override=lm_override,
    )
    face_obj = surgery_objs[0]
    frame = surgery_meta['frame']
    eye_l = surgery_meta['eyeL']
    eye_r = surgery_meta['eyeR']
    seam_info = surgery_meta['seamInfo']
    mouth_res = surgery_meta['mouthRes']

    try:
        bpy.ops.file.pack_all()
    except Exception as exc:
        print(f'[head-local-surgery] pack_all warning: {exc}')

    out_blend = out_dir / f'{args.name}.blend'
    out_fbx = out_dir / f'{args.name}.fbx'
    out_glb = out_dir / f'{args.name}.glb'
    out_zip = out_dir / f'{args.name}.zip'
    out_summary = out_dir / f'{args.name}_summary.json'

    save_res = bpy.ops.wm.save_as_mainfile(filepath=str(out_blend), copy=True)
    if 'FINISHED' not in save_res:
        raise RuntimeError(f'Failed to save blend: {save_res}')

    # Export surgery parts only (excluding hidden backup)
    bpy.ops.object.select_all(action='DESELECT')
    for o in surgery_objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = face_obj

    fbx_res = bpy.ops.export_scene.fbx(
        filepath=str(out_fbx),
        use_selection=True,
        path_mode='COPY',
        embed_textures=True,
        mesh_smooth_type='FACE',
        use_mesh_modifiers=False,
    )
    if 'FINISHED' not in fbx_res:
        raise RuntimeError(f'Failed to export FBX: {fbx_res}')

    glb_res = bpy.ops.export_scene.gltf(
        filepath=str(out_glb),
        export_format='GLB',
        use_selection=True,
        export_yup=True,
    )
    if 'FINISHED' not in glb_res:
        raise RuntimeError(f'Failed to export GLB: {glb_res}')

    with zipfile.ZipFile(out_zip, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(out_fbx, arcname=out_fbx.name)

    if args.render_preview:
        render_preview_suite(out_dir / 'preview', surgery_objs, frame, eye_l, eye_r, seam_info, bh_api)

    summary = {
        'input': str(in_path),
        'outBlend': str(out_blend),
        'outFbx': str(out_fbx),
        'outGlb': str(out_glb),
        'outZip': str(out_zip),
        'previewDir': str(out_dir / 'preview') if args.render_preview else None,
        'parts': {
            o.name: {'verts': len(o.data.vertices), 'polys': len(o.data.polygons)}
            for o in surgery_objs
        },
        'backup': {'name': backup_obj.name, 'verts': len(backup_obj.data.vertices)},
        'detected': {
            'eyeL': {'centerXZ': [round(v, 5) for v in eye_l['center_xz']], 'width': round(eye_l['width'], 5), 'height': round(eye_l['height'], 5)},
            'eyeR': {'centerXZ': [round(v, 5) for v in eye_r['center_xz']], 'width': round(eye_r['width'], 5), 'height': round(eye_r['height'], 5)},
            'mouth': {'xRange': [round(seam_info['x_corner_r'], 5), round(seam_info['x_corner_l'], 5)], 'zCenter': round(seam_info['z_center'], 5), 'seamVerts': mouth_res['chain_count']},
        },
    }
    out_summary.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print('HEAD_SURGERY_OK ' + json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
