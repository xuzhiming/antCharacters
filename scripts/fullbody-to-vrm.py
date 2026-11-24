"""Convert a rigged full-body GLB/GLTF/FBX model into a MToon VRM 1.0 file.

Run in background Blender (without --factory-startup so VRM Add-on remains enabled):
  Blender --background --disable-autoexec --python-exit-code 1 \
    --python scripts/fullbody-to-vrm.py -- \
    --input MODEL.glb --out-vrm OUTPUT.vrm [--out-blend OUTPUT.blend]
"""
import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


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

# Normalized alias candidates (lowercase, alphanumeric only) per VRM 1.0 humanoid bone.
HUMANOID_ALIASES = {
    'hips': ('hips', 'hip', 'pelvis', 'root', 'jbipchips', 'center', 'waist'),
    'spine': ('spine', 'spine0', 'spine01', 'jbipcspine', 'lowerback', 'torso'),
    'chest': ('chest', 'spine1', 'spine02', 'jbipcchest', 'ribcage'),
    'upperChest': ('upperchest', 'spine2', 'spine03', 'jbipcupperchest', 'upperback'),
    'neck': ('neck', 'neck01', 'jbipcneck'),
    'head': ('head', 'jbipchead'),
    'jaw': ('jaw', 'jbipcjaw'),
    'leftEye': ('lefteye', 'eyel', 'leye', 'jbipleye'),
    'rightEye': ('righteye', 'eyer', 'reye', 'jbipreye'),
    'leftShoulder': ('leftshoulder', 'shoulderl', 'lshoulder', 'leftclavicle', 'claviclel', 'lclavicle', 'jbiplshoulder'),
    'leftUpperArm': ('leftupperarm', 'leftarm', 'upperarml', 'lupperarm', 'arml', 'larm', 'jbiplupperarm'),
    'leftLowerArm': ('leftlowerarm', 'leftforearm', 'lowerarml', 'llowerarm', 'forearml', 'lforearm', 'jbipllowerarm'),
    'leftHand': ('lefthand', 'handl', 'lhand', 'wristl', 'lwrist', 'jbiplhand'),
    'rightShoulder': ('rightshoulder', 'shoulderr', 'rshoulder', 'rightclavicle', 'clavicler', 'rclavicle', 'jbiprshoulder'),
    'rightUpperArm': ('rightupperarm', 'rightarm', 'upperarmr', 'rupperarm', 'armr', 'rarm', 'jbiprupperarm'),
    'rightLowerArm': ('rightlowerarm', 'rightforearm', 'lowerarmr', 'rlowerarm', 'forearmr', 'rforearm', 'jbiprlowerarm'),
    'rightHand': ('righthand', 'handr', 'rhand', 'wristr', 'rwrist', 'jbiprhand'),
    'leftUpperLeg': ('leftupperleg', 'leftupleg', 'leftthigh', 'upperlegl', 'lupperleg', 'uplegl', 'lupleg', 'thighl', 'lthigh', 'jbiplupperleg'),
    'leftLowerLeg': ('leftlowerleg', 'leftleg', 'leftcalf', 'leftshin', 'lowerlegl', 'llowerleg', 'legl', 'lleg', 'calfl', 'lcalf', 'jbipllowerleg'),
    'leftFoot': ('leftfoot', 'footl', 'lfoot', 'anklel', 'lankle', 'jbiplfoot'),
    'leftToes': ('lefttoes', 'lefttoebase', 'lefttoe', 'toesl', 'ltoes', 'toel', 'ltoe', 'jbipltoebase'),
    'rightUpperLeg': ('rightupperleg', 'rightupleg', 'rightthigh', 'upperlegr', 'rupperleg', 'uplegr', 'rupleg', 'thighr', 'rthigh', 'jbiprupperleg'),
    'rightLowerLeg': ('rightlowerleg', 'rightleg', 'rightcalf', 'rightshin', 'lowerlegr', 'rlowerleg', 'legr', 'rleg', 'calfr', 'rcalf', 'jbiprlowerleg'),
    'rightFoot': ('rightfoot', 'footr', 'rfoot', 'ankler', 'rankle', 'jbiprfoot'),
    'rightToes': ('righttoes', 'righttoebase', 'righttoe', 'toesr', 'rtoes', 'toer', 'rtoe', 'jbiprtoebase'),
}

for _side_vrm, _side_mixamo, _side_short in (('left', 'Left', 'L'), ('right', 'Right', 'R')):
    for _finger_vrm, _finger_mixamo in (
        ('Thumb', 'HandThumb'),
        ('Index', 'HandIndex'),
        ('Middle', 'HandMiddle'),
        ('Ring', 'HandRing'),
        ('Little', 'HandPinky'),
    ):
        _joints = ('Metacarpal', 'Proximal', 'Distal') if _finger_vrm == 'Thumb' else ('Proximal', 'Intermediate', 'Distal')
        for _idx, _joint in enumerate(_joints, start=1):
            _vrm_name = f'{_side_vrm}{_finger_vrm}{_joint}'
            _f_low = _finger_vrm.lower()
            _s_low = _side_vrm
            _j_low = _joint.lower()
            _mix_num = f'{_side_mixamo}{_finger_mixamo}{_idx}'.lower()
            _short_low = _side_short.lower()
            _alt_pinky = 'pinky' if _finger_vrm == 'Little' else _f_low
            HUMANOID_ALIASES[_vrm_name] = (
                f'{_s_low}{_f_low}{_j_low}',
                _mix_num,
                f'{_s_low}{_alt_pinky}{_idx}',
                f'{_f_low}{_idx}{_short_low}',
                f'{_short_low}{_f_low}{_idx}',
                f'{_alt_pinky}{_idx}{_short_low}',
                f'{_short_low}{_alt_pinky}{_idx}',
                f'jsec{_short_low}{_f_low}{_idx}',
            )


def load_mtoon_module():
    path = Path(__file__).with_name('mtoon-export.py')
    spec = importlib.util.spec_from_file_location('charakit_mtoon_export', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def clear_scene():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)


def import_model(filepath: Path):
    ext = filepath.suffix.lower()
    before = set(bpy.data.objects)
    if ext in {'.glb', '.gltf'}:
        bpy.ops.import_scene.gltf(filepath=str(filepath))
    elif ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=str(filepath), use_image_search=False, automatic_bone_orientation=False)
    else:
        raise ValueError(f'Unsupported model format "{ext}". Expected .glb, .gltf, or .fbx')
    bpy.context.view_layer.update()
    return [o for o in bpy.data.objects if o not in before]


def belongs_to_rig(obj, rig):
    if any(m.type == 'ARMATURE' and m.object == rig for m in obj.modifiers):
        return True
    parent = obj.parent
    while parent:
        if parent == rig:
            return True
        parent = parent.parent
    return False


def find_rig_and_meshes(imported):
    rigs = [o for o in imported if o.type == 'ARMATURE']
    if not rigs:
        rigs = [o for o in bpy.data.objects if o.type == 'ARMATURE']
    if len(rigs) != 1:
        raise RuntimeError(f'Expected exactly 1 armature, found {len(rigs)}: {[r.name for r in rigs]}')
    rig = rigs[0]
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not o.hide_render and belongs_to_rig(o, rig)]
    if not meshes:
        raise RuntimeError(f'No bound meshes found under armature "{rig.name}".')
    return rig, meshes


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


def normalize_rig_and_meshes(rig, meshes, target_height):
    min_pt, max_pt = world_bounds(meshes)
    height = max_pt.z - min_pt.z
    if height <= 1e-5:
        raise RuntimeError('Imported meshes have near-zero height.')

    needs_scale = target_height > 0 and (height < 0.8 or height > 2.4)
    needs_ground = abs(min_pt.z) > 0.01
    if not needs_scale and not needs_ground:
        return dict(scaled=False, grounded=False, height=height, min_z=min_pt.z)

    scale_factor = (target_height / height) if needs_scale else 1.0

    # Detach OBJECT-parented meshes cleanly before scaling/applying so transforms do not double-apply.
    object_children = [m for m in meshes if m.parent == rig and m.parent_type == 'OBJECT']
    for m in object_children:
        world = m.matrix_world.copy()
        m.parent = None
        m.matrix_world = world

    targets = [rig, *meshes]
    for obj in targets:
        if needs_scale:
            obj.scale = tuple(v * scale_factor for v in obj.scale)
            obj.location = tuple(v * scale_factor for v in obj.location)

    bpy.context.view_layer.update()
    new_min, new_max = world_bounds(meshes)
    z_shift = -new_min.z if abs(new_min.z) > 0.01 else 0.0
    if z_shift:
        for obj in targets:
            if obj.parent is None:
                obj.location.z += z_shift
        bpy.context.view_layer.update()

    # Apply transforms cleanly on unparented objects.
    for obj in [rig, *[m for m in meshes if m.parent is None]]:
        bpy.ops.object.select_all(action='DESELECT')
        obj.hide_set(False)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    for m in object_children:
        world = m.matrix_world.copy()
        m.parent = rig
        m.matrix_parent_inverse = rig.matrix_world.inverted()
        m.matrix_world = world

    bpy.context.view_layer.update()
    final_min, final_max = world_bounds(meshes)
    return dict(
        scaled=needs_scale,
        grounded=bool(z_shift),
        scale_factor=scale_factor,
        height=final_max.z - final_min.z,
        min_z=final_min.z,
    )


def normalize_bone_key(name: str) -> str:
    cleaned = name.strip()
    cleaned = re.sub(r'^(mixamorig[:_]?|bip0*1[_:\s-]*|cc_base_|def-|valvebiped_)', '', cleaned, flags=re.IGNORECASE)
    # Handle trailing .L / .R / _L / _R consistently by leaving characters intact, just strip separators.
    return re.sub(r'[^a-z0-9]+', '', cleaned.lower())


def configure_humanoid_bones(rig):
    ext = rig.data.vrm_addon_extension
    ext.spec_version = '1.0'

    try:
        bpy.ops.vrm.assign_vrm1_humanoid_human_bones_automatically(armature_object_name=rig.name)
    except Exception as exc:
        print(f'[fullbody-to-vrm] Auto bone assignment warning: {exc}')

    bone_names = {b.name for b in rig.data.bones}
    by_norm = {}
    for b in rig.data.bones:
        norm = normalize_bone_key(b.name)
        by_norm.setdefault(norm, []).append(b.name)

    human_bones = ext.vrm1.humanoid.human_bones.human_bone_name_to_human_bone()

    # Track already-assigned armature bones so we never double-map one bone.
    used_bones = set()
    for key_enum, hb in human_bones.items():
        if hb.node.bone_name in bone_names:
            used_bones.add(hb.node.bone_name)
        else:
            hb.node.bone_name = ''

    for vrm_name, aliases in HUMANOID_ALIASES.items():
        matching_enum = next((k for k in human_bones if k.value == vrm_name), None)
        if matching_enum is None:
            continue
        hb = human_bones[matching_enum]
        if hb.node.bone_name and hb.node.bone_name in bone_names:
            continue
        for alias in aliases:
            candidates = by_norm.get(alias, [])
            pick = next((c for c in candidates if c not in used_bones), None)
            if pick:
                hb.node.bone_name = pick
                used_bones.add(pick)
                break

    mapped = {k.value: hb.node.bone_name for k, hb in human_bones.items() if hb.node.bone_name}
    missing_required = [name for name in REQUIRED_HUMANOID_BONES if name not in mapped]
    if missing_required:
        print(f'[fullbody-to-vrm] WARNING: missing required humanoid bones: {missing_required}')
    return mapped, missing_required


def ensure_materials(meshes):
    for obj in meshes:
        if not obj.data.materials:
            mat = bpy.data.materials.new(obj.name + ' Material')
            mat.use_nodes = True
            obj.data.materials.append(mat)
        for slot in obj.material_slots:
            if slot.material is None:
                mat = bpy.data.materials.new(obj.name + ' Material')
                mat.use_nodes = True
                slot.material = mat


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--out-vrm', required=True)
    parser.add_argument('--out-blend')
    parser.add_argument('--name')
    parser.add_argument('--author', default='Charakuru Auto')
    parser.add_argument('--target-height', type=float, default=1.6)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])

    input_path = Path(args.input).resolve()
    out_vrm = Path(args.out_vrm).resolve()
    out_blend = Path(args.out_blend).resolve() if args.out_blend else None
    model_name = args.name or input_path.stem

    api = load_mtoon_module()
    api.enable_vrm()
    clear_scene()

    imported = import_model(input_path)
    rig, meshes = find_rig_and_meshes(imported)
    transform_info = normalize_rig_and_meshes(rig, meshes, args.target_height)
    mapped_bones, missing_required = configure_humanoid_bones(rig)

    meta = rig.data.vrm_addon_extension.vrm1.meta
    meta.vrm_name = model_name
    if not meta.authors:
        meta.authors.add().value = args.author

    ensure_materials(meshes)
    mtoon_report = api.apply_mtoon(meshes)

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
        try:
            bpy.ops.file.pack_all()
        except Exception as exc:
            print(f'[fullbody-to-vrm] pack_all warning: {exc}')
        save_res = bpy.ops.wm.save_as_mainfile(filepath=str(out_blend), copy=True)
        if 'FINISHED' not in save_res:
            raise RuntimeError(f'Failed to save blend file: {save_res}')

    summary = {
        'input': str(input_path),
        'outVrm': str(out_vrm),
        'outBlend': str(out_blend) if out_blend else None,
        'vrmBytes': out_vrm.stat().st_size,
        'rigName': rig.name,
        'meshCount': len(meshes),
        'mappedBoneCount': len(mapped_bones),
        'missingRequiredBones': missing_required,
        'transform': transform_info,
        'mtoon': mtoon_report,
        'inspect': vrm_report,
    }
    print('FULLBODY_VRM_OK ' + json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()
