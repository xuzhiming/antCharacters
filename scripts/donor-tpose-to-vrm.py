"""Option C demo: project a T-pose illustration onto Charakuru's bundled rigged
donor (assets/donor/weighted-body.blend), generate stylized procedural bob hair
and flared coat tails, apply MToon materials, and export a VRM 1.0 + Blend.

Run in background Blender:
  Blender --background assets/donor/weighted-body.blend --disable-autoexec \
    --python-exit-code 1 --python scripts/donor-tpose-to-vrm.py -- \
    --image INPUT.png --out-vrm OUTPUT.vrm [--out-blend OUTPUT.blend]
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
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree


REQUIRED_HUMANOID_BONES = (
    'hips',
    'spine',
    'head',
    'leftUpperArm',
    'leftLowerArm',
    'leftHand',
    'rightUpperArm',
    'rightLowerArm',
    'rightHand',
    'leftUpperLeg',
    'leftLowerLeg',
    'leftFoot',
    'rightUpperLeg',
    'rightLowerLeg',
    'rightFoot',
)


def load_mtoon_module():
    path = Path(__file__).with_name('mtoon-export.py')
    spec = importlib.util.spec_from_file_location('charakit_mtoon_export', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def world_bounds(meshes):
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


def analyze_and_bleed_image(image_path: Path, bled_out_path: Path):
    """Load T-pose image, detect character UV bounds, and dilate colors into white background."""
    src_img = bpy.data.images.load(str(image_path), check_existing=False)
    w, h = src_img.size[0], src_img.size[1]
    if w <= 0 or h <= 0:
        raise RuntimeError(f'Failed to load valid image dimensions from {image_path}')

    pixels = np.array(src_img.pixels[:], dtype=np.float32).reshape((h, w, 4))
    rgb = pixels[:, :, :3]
    alpha = pixels[:, :, 3]

    # Foreground = visible and not near-pure white background (pixels are scene-linear in Blender).
    fg = (alpha > 0.1) & (rgb.min(axis=-1) < 0.94)
    ys, xs = np.where(fg)
    if len(xs) < 100:
        raise RuntimeError('Could not detect foreground character silhouette on white background.')

    x_min = float(xs.min()) / w
    x_max = float(xs.max() + 1) / w
    y_min = float(ys.min()) / h
    y_max = float(ys.max() + 1) / h
    u_center = 0.5 * (x_min + x_max)
    u_span = max(x_max - x_min, 1e-4)
    v_span = max(y_max - y_min, 1e-4)

    # Locate the arm span row in the upper torso half.
    row_widths = fg.sum(axis=1)
    upper_start = int(ys.min() + 0.5 * (ys.max() - ys.min()))
    arm_row = int(upper_start + np.argmax(row_widths[upper_start:]))
    v_arm = (arm_row + 0.5) / h

    # Pick a clean hair crown UV point near the top of the character.
    u_hair = u_center
    v_hair = min(0.995, y_max - 0.045 * v_span)

    # 48-iteration 4-neighbor dilation so grazing UV edges sample clean garment/hair tones.
    bled = pixels.copy()
    bled[~fg, 3] = 1.0
    filled = fg.copy()
    for _ in range(48):
        if filled.all():
            break
        acc = np.zeros_like(bled[:, :, :3])
        cnt = np.zeros((h, w), dtype=np.float32)

        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            sy0, sy1 = max(0, -dy), min(h, h - dy)
            sx0, sx1 = max(0, -dx), min(w, w - dx)
            ty0, ty1 = max(0, dy), min(h, h + dy)
            tx0, tx1 = max(0, dx), min(w, w + dx)
            mask_slice = filled[sy0:sy1, sx0:sx1]
            acc[ty0:ty1, tx0:tx1] += np.where(mask_slice[:, :, None], bled[sy0:sy1, sx0:sx1, :3], 0.0)
            cnt[ty0:ty1, tx0:tx1] += mask_slice.astype(np.float32)

        update_mask = (~filled) & (cnt > 0)
        if not update_mask.any():
            break
        bled[update_mask, :3] = acc[update_mask] / cnt[update_mask, None]
        filled |= update_mask

    bled_out_path.parent.mkdir(parents=True, exist_ok=True)
    bled_img = bpy.data.images.new(
        name=f'{image_path.stem}_bled',
        width=w,
        height=h,
        alpha=True,
        float_buffer=False,
    )
    bled_img.colorspace_settings.name = src_img.colorspace_settings.name
    bled_img.pixels.foreach_set(bled.ravel())
    bled_img.filepath_raw = str(bled_out_path)
    bled_img.file_format = 'PNG'
    bled_img.save()
    bpy.data.images.remove(src_img)

    reloaded = bpy.data.images.load(str(bled_out_path), check_existing=False)
    reloaded.pack()
    bpy.data.images.remove(bled_img)

    return reloaded, dict(
        width=w,
        height=h,
        x_min=x_min,
        x_max=x_max,
        y_min=y_min,
        y_max=y_max,
        u_center=u_center,
        u_span=u_span,
        v_span=v_span,
        v_arm=v_arm,
        u_hair=u_hair,
        v_hair=v_hair,
    )


def ensure_uv_layer(obj, name='ProjUV'):
    uv_layers = obj.data.uv_layers
    for existing in list(uv_layers):
        if existing.name != name:
            uv_layers.remove(existing)
    uv = uv_layers.get(name) or uv_layers.new(name=name)
    uv.active = True
    uv.active_render = True
    return uv


def clamp_uv(u, v):
    return max(0.002, min(0.998, u)), max(0.002, min(0.998, v))


def project_donor_uvs(body_obj, head_obj, rig, img_stats):
    b_min, b_max = world_bounds([body_obj])
    all_min, all_max = world_bounds([body_obj, head_obj])

    donor_min_z = all_min.z
    donor_max_z = all_max.z
    donor_z_span = max(donor_max_z - donor_min_z, 1e-4)
    donor_half_x = max(abs(b_min.x), abs(b_max.x), 1e-4)

    # Verify which way DonorRig left (+X vs -X) points.
    left_bone = rig.data.bones.get('upper_arm.L')
    u_sign = 1.0 if (left_bone is None or left_bone.head.x >= 0.0) else -1.0

    # Find torso/head junction Z to align head crown cleanly with top of illustration.
    u_center = img_stats['u_center']
    u_span = img_stats['u_span']
    v_span = img_stats['v_span']
    y_min = img_stats['y_min']
    y_max = img_stats['y_max']

    def map_point(wx, wz):
        u = u_center + u_sign * (wx / donor_half_x) * (0.5 * u_span)
        v = y_min + ((wz - donor_min_z) / donor_z_span) * v_span
        return clamp_uv(u, v)

    # Body mesh: direct front/back orthographic projection so outfit front & limbs align cleanly.
    uv_body = ensure_uv_layer(body_obj)
    mat_b = body_obj.matrix_world
    verts_b = body_obj.data.vertices
    for poly in body_obj.data.polygons:
        for loop_idx in poly.loop_indices:
            v_idx = body_obj.data.loops[loop_idx].vertex_index
            wp = mat_b @ verts_b[v_idx].co
            uv_body.data[loop_idx].uv = map_point(wp.x, wp.z)

    # Head mesh: front side maps directly to face/chin/neck; back of skull maps to hair crown so no face appears behind head.
    uv_head = ensure_uv_layer(head_obj)
    mat_h = head_obj.matrix_world
    verts_h = head_obj.data.vertices
    for poly in head_obj.data.polygons:
        for loop_idx in poly.loop_indices:
            v_idx = head_obj.data.loops[loop_idx].vertex_index
            wp = mat_h @ verts_h[v_idx].co
            if wp.y > 0.015:
                u_back = u_center + u_sign * (wp.x / 0.14) * 0.06
                v_back = y_max - 0.03 * v_span - max(0.0, donor_max_z - wp.z) * 0.07
                uv_head.data[loop_idx].uv = clamp_uv(u_back, v_back)
            else:
                uv_head.data[loop_idx].uv = map_point(wp.x, wp.z)

    return dict(
        donor_min_z=donor_min_z,
        donor_max_z=donor_max_z,
        donor_z_span=donor_z_span,
        donor_half_x=donor_half_x,
        u_sign=u_sign,
    )


def build_procedural_bob_hair(rig, head_obj, img_stats, proj_info):
    """Create stylized bob hair + side temple wing accents parented rigidly to head bone."""
    h_min, h_max = world_bounds([head_obj])
    cx = 0.5 * (h_min.x + h_max.x)
    cy = 0.030
    cz = 1.635

    bm = bmesh.new()
    # Base UV-sphere shell sculpted mathematically into a layered bob framing the face.
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=1.0)
    to_delete = []
    for v in bm.verts:
        nx, ny, nz = v.co.x, v.co.y, v.co.z
        # Stretch into bob silhouette around donor head.
        rx = 0.118 + 0.022 * max(0.0, -nz)  # flare slightly toward lower bob tips
        ry = 0.128 + 0.015 * max(0.0, -nz)
        rz_up = 0.122
        rz_down = 0.175

        x = cx + nx * rx
        y = cy + ny * ry
        z = cz + (nz * rz_up if nz >= 0 else nz * rz_down)

        # Wavy cheek-framing curl flares at the bottom bob edge.
        if nz < -0.15:
            wave = 0.012 * math.sin(math.atan2(ny, nx) * 5.0)
            x += nx * wave
            y += ny * wave

        # Bangs & face cutout opening in front (-Y).
        angle_front = math.atan2(abs(nx), max(1e-5, -ny))
        if ny < -0.15 and angle_front < 1.05:
            # Arch bangs downward slightly at temples, higher over brow center.
            bang_z = 1.662 - 0.030 * (angle_front / 1.05) ** 2 + 0.008 * math.cos(nx * 35.0)
            if z < bang_z and abs(nx) < 0.72:
                to_delete.append(v)
                continue
        v.co = Vector((x, y, z))

    if to_delete:
        bmesh.ops.delete(bm, geom=to_delete, context='VERTS')

    # Add two delicate side temple wing/ear ornaments matching character silhouette.
    for side in (-1.0, 1.0):
        wing = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
        for v in wing['verts']:
            lx, ly, lz = v.co.x, v.co.y, v.co.z
            # Flatten and angle outward-back-up like feathered ear fins.
            px = side * (0.114 + abs(lx) * 0.026 + max(0.0, lz) * 0.020)
            py = 0.020 + ly * 0.032 + max(0.0, lz) * 0.018
            pz = 1.635 + lz * 0.048 + abs(lx) * 0.015
            v.co = Vector((px, py, pz))

    mesh = bpy.data.meshes.new('AutoHairMesh')
    bm.to_mesh(mesh)
    bm.free()

    hair_obj = bpy.data.objects.new('AutoHair', mesh)
    bpy.context.scene.collection.objects.link(hair_obj)
    for poly in hair_obj.data.polygons:
        poly.use_smooth = True

    # Subtle solidify + subdivision for organic volume.
    sol = hair_obj.modifiers.new('HairThickness', 'SOLIDIFY')
    sol.thickness = 0.008
    sol.offset = 0.0
    sub = hair_obj.modifiers.new('HairSmooth', 'SUBSURF')
    sub.levels = 1
    sub.render_levels = 1

    bpy.ops.object.select_all(action='DESELECT')
    hair_obj.select_set(True)
    bpy.context.view_layer.objects.active = hair_obj
    bpy.ops.object.modifier_apply(modifier=sol.name)
    bpy.ops.object.modifier_apply(modifier=sub.name)

    # Project UVs into the hair region of the T-pose illustration.
    uv_layer = ensure_uv_layer(hair_obj)
    u_center = img_stats['u_center']
    u_span = img_stats['u_span']
    v_span = img_stats['v_span']
    y_max = img_stats['y_max']
    u_sign = proj_info['u_sign']
    donor_half_x = proj_info['donor_half_x']
    donor_min_z = proj_info['donor_min_z']
    donor_z_span = proj_info['donor_z_span']

    verts = hair_obj.data.vertices
    for poly in hair_obj.data.polygons:
        for loop_idx in poly.loop_indices:
            v_idx = hair_obj.data.loops[loop_idx].vertex_index
            wp = verts[v_idx].co
            if wp.y < 0.01 and wp.z < 1.70:
                # Front-side hair locks & temple wings sample exact front illustration hair/ornaments.
                u = u_center + u_sign * (wp.x / donor_half_x) * (0.5 * u_span)
                v = img_stats['y_min'] + ((wp.z - donor_min_z) / donor_z_span) * v_span
            else:
                # Crown & back of bob sample cleanly inside the pastel iridescent hair region.
                u = u_center + u_sign * (wp.x / 0.14) * 0.055
                v = y_max - 0.032 * v_span - max(0.0, 1.74 - wp.z) * 0.065
            uv_layer.data[loop_idx].uv = clamp_uv(u, v)

    hair_obj.parent = rig
    hair_obj.matrix_parent_inverse = rig.matrix_world.inverted()
    vg = hair_obj.vertex_groups.new(name='head')
    vg.add(list(range(len(hair_obj.data.vertices))), 1.0, 'REPLACE')
    arm_mod = hair_obj.modifiers.new('Armature', 'ARMATURE')
    arm_mod.object = rig
    return hair_obj


def build_procedural_coat_tail(rig, body_obj, img_stats, proj_info):
    """Build split-front flared peplum/coat tails and transfer weights from DonorBody_1."""
    bm = bmesh.new()
    rings = 14
    cols = 40
    z_top = 1.035
    z_bot_base = 0.625

    # Open front V-slit from -Y (angle = 0 at front center, +/-pi at back).
    grid = []
    for r_idx in range(rings):
        t = r_idx / (rings - 1)
        z_base = z_top + (z_bot_base - z_top) * t
        # Taper waist -> flare strongly at hem.
        rx = 0.128 + 0.145 * (t ** 1.15)
        ry = 0.105 + 0.095 * (t ** 1.15)

        row_verts = []
        # Sweep from front-right slit edge around back to front-left slit edge.
        slit_half_angle = 0.08 + 0.56 * (t ** 0.85)  # opens progressively downward in front
        start_ang = slit_half_angle
        end_ang = 2.0 * math.pi - slit_half_angle
        for c_idx in range(cols):
            s = c_idx / (cols - 1)
            ang = start_ang + (end_ang - start_ang) * s
            # In Blender front = -Y, right = -X, left = +X:
            # angle 0 = (0, -1), +pi/2 = (+1, 0), pi = (0, +1), 3pi/2 = (-1, 0)
            sin_a = math.sin(ang)
            cos_a = math.cos(ang)
            x = rx * sin_a
            y = -ry * cos_a
            # Subtle side hem dip matching the character's pointed coat-tail panels.
            side_dip = 0.045 * (abs(sin_a) ** 1.6) * t
            z = z_base - side_dip + 0.015 * (cos_a < 0) * t
            row_verts.append(bm.verts.new((x, y, z)))
        grid.append(row_verts)

    bm.verts.ensure_lookup_table()
    for r_idx in range(rings - 1):
        for c_idx in range(cols - 1):
            v0 = grid[r_idx][c_idx]
            v1 = grid[r_idx][c_idx + 1]
            v2 = grid[r_idx + 1][c_idx + 1]
            v3 = grid[r_idx + 1][c_idx]
            bm.faces.new((v0, v3, v2, v1))

    mesh = bpy.data.meshes.new('AutoCoatTailMesh')
    bm.to_mesh(mesh)
    bm.free()

    coat_obj = bpy.data.objects.new('AutoCoatTail', mesh)
    bpy.context.scene.collection.objects.link(coat_obj)
    for poly in coat_obj.data.polygons:
        poly.use_smooth = True

    sol = coat_obj.modifiers.new('CoatThickness', 'SOLIDIFY')
    sol.thickness = 0.007
    sol.offset = 0.5
    bpy.ops.object.select_all(action='DESELECT')
    coat_obj.select_set(True)
    bpy.context.view_layer.objects.active = coat_obj
    bpy.ops.object.modifier_apply(modifier=sol.name)

    # Project UVs directly from the T-pose illustration's flared coat tails.
    uv_layer = ensure_uv_layer(coat_obj)
    u_center = img_stats['u_center']
    u_span = img_stats['u_span']
    v_span = img_stats['v_span']
    y_min = img_stats['y_min']
    u_sign = proj_info['u_sign']
    donor_half_x = proj_info['donor_half_x']
    donor_min_z = proj_info['donor_min_z']
    donor_z_span = proj_info['donor_z_span']

    verts = coat_obj.data.vertices
    for poly in coat_obj.data.polygons:
        for loop_idx in poly.loop_indices:
            v_idx = coat_obj.data.loops[loop_idx].vertex_index
            wp = verts[v_idx].co
            # Slightly compress X projection on outer flared hem so it captures the coat-tail fabric cleanly.
            u = u_center + u_sign * ((wp.x * 0.88) / donor_half_x) * (0.5 * u_span)
            v = y_min + ((wp.z - donor_min_z) / donor_z_span) * v_span
            uv_layer.data[loop_idx].uv = clamp_uv(u, v)

    # Transfer smooth deformation weights from DonorBody_1 via DATA_TRANSFER modifier.
    dt = coat_obj.modifiers.new('WeightTransfer', 'DATA_TRANSFER')
    dt.object = body_obj
    dt.use_vert_data = True
    dt.data_types_verts = {'VGROUP_WEIGHTS'}
    dt.vert_mapping = 'POLYINTERP_NEAREST'

    bpy.ops.object.select_all(action='DESELECT')
    coat_obj.select_set(True)
    bpy.context.view_layer.objects.active = coat_obj
    bpy.ops.object.datalayout_transfer(modifier=dt.name)
    bpy.ops.object.modifier_apply(modifier=dt.name)

    # Verify every vertex has non-zero deform weight; fall back via KDTree or hips if needed.
    deform_bones = {b.name for b in rig.data.bones if b.use_deform}
    groups_by_idx = {g.index: g.name for g in coat_obj.vertex_groups}
    unweighted = []
    for v in coat_obj.data.vertices:
        total = sum(g.weight for g in v.groups if groups_by_idx.get(g.group) in deform_bones)
        if total < 1e-4:
            unweighted.append(v.index)

    if unweighted:
        src_groups = {g.index: g.name for g in body_obj.vertex_groups}
        mat_b = body_obj.matrix_world
        kd = KDTree(len(body_obj.data.vertices))
        for i, bv in enumerate(body_obj.data.vertices):
            kd.insert(mat_b @ bv.co, i)
        kd.balance()
        hips_vg = coat_obj.vertex_groups.get('hips') or coat_obj.vertex_groups.new(name='hips')
        for vid in unweighted:
            co, idx, _dist = kd.find(coat_obj.data.vertices[vid].co)
            copied = False
            for g in body_obj.data.vertices[idx].groups:
                bname = src_groups.get(g.group)
                if bname in deform_bones and g.weight > 1e-5:
                    dst = coat_obj.vertex_groups.get(bname) or coat_obj.vertex_groups.new(name=bname)
                    dst.add([vid], g.weight, 'REPLACE')
                    copied = True
            if not copied:
                hips_vg.add([vid], 1.0, 'REPLACE')

    coat_obj.parent = rig
    coat_obj.matrix_parent_inverse = rig.matrix_world.inverted()
    arm_mod = coat_obj.modifiers.new('Armature', 'ARMATURE')
    arm_mod.object = rig
    return coat_obj


def assign_projected_material(meshes, image):
    mat = bpy.data.materials.new('DonorTposeProjected')
    mat.use_nodes = True
    mat.use_backface_culling = False
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = image
    tex.extension = 'EXTEND'
    tex.location = (-320, 300)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if 'Roughness' in bsdf.inputs:
        bsdf.inputs['Roughness'].default_value = 0.85

    for obj in meshes:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    return mat


def verify_humanoid(rig):
    ext = rig.data.vrm_addon_extension
    ext.spec_version = '1.0'
    human_bones = ext.vrm1.humanoid.human_bones.human_bone_name_to_human_bone()
    mapped = {k.value: v.node.bone_name for k, v in human_bones.items() if v.node.bone_name}
    if any(req not in mapped for req in REQUIRED_HUMANOID_BONES):
        bpy.ops.vrm.assign_vrm1_humanoid_human_bones_automatically(armature_object_name=rig.name)
        mapped = {k.value: v.node.bone_name for k, v in human_bones.items() if v.node.bone_name}
    missing = [req for req in REQUIRED_HUMANOID_BONES if req not in mapped]
    if missing:
        raise RuntimeError(f'DonorRig missing required VRM 1.0 humanoid bones: {missing}')
    return mapped


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', required=True)
    parser.add_argument('--out-vrm', required=True)
    parser.add_argument('--out-blend')
    parser.add_argument('--name', default='Donor T-Pose Demo')
    parser.add_argument('--author', default='Charakuru Local Blender')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])

    image_path = Path(args.image).resolve()
    out_vrm = Path(args.out_vrm).resolve()
    out_blend = Path(args.out_blend).resolve() if args.out_blend else None
    bled_path = (out_blend.parent if out_blend else out_vrm.parent) / f'{out_vrm.stem}_bled.png'

    api = load_mtoon_module()
    api.enable_vrm()

    rig = bpy.data.objects['DonorRig']
    body_obj = bpy.data.objects['DonorBody_1']
    head_obj = bpy.data.objects['DonorBody_2']

    mapped_bones = verify_humanoid(rig)
    bled_img, img_stats = analyze_and_bleed_image(image_path, bled_path)
    proj_info = project_donor_uvs(body_obj, head_obj, rig, img_stats)
    hair_obj = build_procedural_bob_hair(rig, head_obj, img_stats, proj_info)
    coat_obj = build_procedural_coat_tail(rig, body_obj, img_stats, proj_info)

    meshes = [body_obj, head_obj, hair_obj, coat_obj]
    assign_projected_material(meshes, bled_img)
    mtoon_report = api.apply_mtoon(meshes)

    meta = rig.data.vrm_addon_extension.vrm1.meta
    meta.vrm_name = args.name
    if not meta.authors:
        meta.authors.add().value = args.author

    bpy.ops.object.select_all(action='DESELECT')
    for obj in [rig, *meshes]:
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

    vrm_report = api.inspect_vrm(out_vrm)

    if out_blend:
        out_blend.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.file.pack_all()
        save_res = bpy.ops.wm.save_as_mainfile(filepath=str(out_blend), copy=True)
        if 'FINISHED' not in save_res:
            raise RuntimeError(f'Blend save failed: {save_res}')

    summary = {
        'image': str(image_path),
        'bledTexture': str(bled_path),
        'outVrm': str(out_vrm),
        'outBlend': str(out_blend) if out_blend else None,
        'vrmBytes': out_vrm.stat().st_size,
        'mappedBoneCount': len(mapped_bones),
        'meshes': [m.name for m in meshes],
        'imageStats': img_stats,
        'mtoon': mtoon_report,
        'inspect': vrm_report,
    }
    print('DONOR_VRM_OK ' + json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
