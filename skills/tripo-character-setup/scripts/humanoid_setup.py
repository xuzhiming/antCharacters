"""Staged VRM Humanoid setup inside Blender. See references/humanoid-setup.md.

Run via run(config), CONFIG_PATH in Blender's Text Editor, or --python ... -- config.json.
Only explicitly named meshes are copied. Production originals are never edited.
"""
import hashlib
import importlib
import json
import math
from pathlib import Path
import sys
import uuid
from datetime import datetime, timezone

import bpy
from mathutils import Matrix, Vector

TAG = 'charakit_humanoid_setup'
VERSION = 1


def require(condition, message):
    if not condition:
        raise ValueError(message)


def object_mode():
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')


def activate(obj):
    object_mode()
    bpy.ops.object.select_all(action='DESELECT')
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def vrm_mapping(rig):
    ext = rig.data.vrm_addon_extension
    return {k.value: v.node.bone_name for k, v in
            ext.vrm1.humanoid.human_bones.human_bone_name_to_human_bone().items()
            if v.node.bone_name}


def enable_vrm():
    # Enable the installed official extension only; never install/download an add-on.
    module = 'bl_ext.blender_org.vrm'
    if module not in bpy.context.preferences.addons:
        try:
            bpy.ops.preferences.addon_enable(module=module)
        except Exception as exc:
            raise RuntimeError('Install/enable the official VRM Add-on before setup') from exc
    return module


def load_project(filename):
    path = Path(filename).expanduser().resolve()
    raw = path.read_bytes()
    p = json.loads(raw)
    validator_path = Path(__file__).resolve().parents[2] / 'charakit-project/scripts/unpack.py'
    spec = importlib.util.spec_from_file_location('charakit_rig_validator', validator_path)
    validator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validator)
    validator.validate(p)
    markers = {k: Vector(v['position']) for k, v in p['markers'].items()}
    for side in ('L', 'R'):
        for a, b in [('shoulder', 'elbow'), ('elbow', 'wrist'), ('wrist', 'hand'),
                     ('hip', 'knee'), ('knee', 'ankle'), ('ankle', 'toes')]:
            require((markers[f'{a}.{side}']-markers[f'{b}.{side}']).length > 1e-5,
                    f'Coincident markers: {a}.{side}, {b}.{side}')
    for a, b in [('hips', 'spine'), ('spine', 'chest'), ('chest', 'neck'), ('neck', 'head')]:
        require((markers[a]-markers[b]).length > 1e-5, f'Coincident markers: {a}, {b}')
    return p, markers, hashlib.sha256(raw).hexdigest()


def state(rig):
    require(rig and rig.type == 'ARMATURE' and TAG in rig, 'Select a rig created by this script')
    s = json.loads(rig[TAG])
    require(s['version'] == VERSION, 'Unsupported setup state')
    return s


def targets(s):
    result = []
    for entry in s['objects']:
        obj = bpy.data.objects.get(entry['copy'])
        require(obj and obj.type == 'MESH' and obj.get('charakit_setup_id') == s['id'],
                'Setup mesh missing or replaced: '+entry['copy'])
        result.append((obj, entry))
    return result


def checkpoint(rig, s, label):
    rig[TAG] = json.dumps(s)
    directory = Path(s['output_dir'])
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+uuid.uuid4().hex[:8]
    stem = directory / (label+'-'+stamp)
    blend = str(stem)+'.blend'
    require(not Path(blend).exists(), 'Checkpoint already exists')
    bpy.ops.wm.save_as_mainfile(filepath=blend, copy=True)
    report = dict(s, checkpoint=blend)
    Path(str(stem)+'.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report


def create(config):
    p, markers, digest = load_project(config['project_json'])
    require(abs(bpy.context.scene.unit_settings.scale_length-1) < 1e-8,
            'Use meter scene units (scale_length=1), matching charakit coordinates')
    names = config.get('deform_objects', [])
    rigid = config.get('rigid_objects', {})
    require(isinstance(names, list) and names, 'Explicit deform_objects (body/clothing) are required')
    require(isinstance(rigid, dict), 'rigid_objects must map object names to VRM human bone names')
    requested = names + list(rigid)
    require(len(set(requested)) == len(requested), 'Duplicate target object')
    originals = []
    for name in requested:
        obj = bpy.data.objects.get(name)
        require(obj and obj.type == 'MESH', 'Mesh not found: '+name)
        require(not obj.get('charakit_setup_id'), 'Do not create a second rig from setup copies')
        require(not any(m.type == 'ARMATURE' for m in obj.modifiers),
                'Existing rig must be handled separately: '+name)
        require(not obj.constraints, 'Constrained mesh needs separate preparation: '+name)
        require(not obj.animation_data, 'Object animation needs separate preparation: '+name)
        require(not any(m.show_viewport for m in obj.modifiers),
                'Disable or resolve existing mesh modifiers before this experimental workflow: '+name)
        require(not obj.data.shape_keys or not obj.data.shape_keys.animation_data or
                not obj.data.shape_keys.animation_data.action, 'Animated shape keys need separate preparation: '+name)
        originals.append(obj)
    enable_vrm()
    activate(originals[0])
    result = bpy.ops.icyp.make_basic_armature()
    require('FINISHED' in result, 'VRM Humanoid creation failed')
    rig = bpy.context.object
    rig.name = 'CharaKit_Humanoid'
    rig.matrix_world = Matrix.Identity(4)
    rig.data.vrm_addon_extension.spec_version = '1.0'
    bpy.ops.vrm.assign_vrm1_humanoid_human_bones_automatically(armature_object_name=rig.name)
    mapping = vrm_mapping(rig)
    require(all(n in mapping for n in ['hips','spine','chest','neck','head',
                                      'leftUpperArm','rightUpperArm']), 'VRM human bone mapping missing')
    for bone in rigid.values():
        require(bone in mapping, 'Unknown VRM rigid attachment: '+bone)
    # Preserve the add-on's hierarchy/roll; map joint centers, not marker names to bone names.
    activate(rig)
    bpy.ops.object.mode_set(mode='EDIT')
    bones = rig.data.edit_bones
    old = {b.name: (b.head.copy(), b.tail.copy(), b.matrix.copy()) for b in bones}
    for b in bones:
        b.use_connect = False
    placed = set()
    def place(human, head, tail):
        name = mapping.get(human)
        require(name in bones, 'Missing human bone: '+human)
        require((tail-head).length > 1e-5, 'Zero length bone: '+human)
        b = bones[name]
        b.head, b.tail = head, tail
        # Roll is provisional; preserve template Z direction projected to the new axis.
        b.align_roll(old[name][2].to_3x3().col[2])
        placed.add(name)
    for human, a, b in [('hips','hips','spine'),('spine','spine','chest'),
                         ('chest','chest','neck'),('neck','neck','head')]:
        place(human, markers[a], markers[b])
    body_scale = (markers['head']-markers['hips']).length / max((old[mapping['head']][0]-old[mapping['hips']][0]).length,1e-5)
    place('head', markers['head'], markers['head']+Vector((0,0,(old[mapping['head']][1]-old[mapping['head']][0]).length*body_scale)))
    warnings = ['Bone roll, clavicle origins, eyes and unmarked finger positions are estimates; inspect in UI.',
                'Provisional weights are for A-to-T conversion, not production-ready deformation.']
    for side, human in [('L','left'),('R','right')]:
        m = lambda part: markers[part+'.'+side]
        # Shoulder marker is the upper-arm head, NOT the clavicle head.
        clavicle = markers['chest'].lerp(markers['neck'], .7)
        place(human+'Shoulder',clavicle,m('shoulder'))
        for suffix,a,b in [('UpperArm','shoulder','elbow'),('LowerArm','elbow','wrist'),
                           ('Hand','wrist','hand'),('UpperLeg','hip','knee'),
                           ('LowerLeg','knee','ankle'),('Foot','ankle','toes')]:
            place(human+suffix,m(a),m(b))
        foot_direction=(m('toes')-m('ankle')).normalized()
        place(human+'Toes',m('toes'),m('toes')+foot_direction*.03*body_scale)
        for finger in ('thumb','index','middle','ring','little'):
            joints = ('Metacarpal','Proximal','Distal','Tip') if finger=='thumb' else ('Proximal','Intermediate','Distal','Tip')
            ids=[finger+j+'.'+side for j in joints]
            if all(k in markers for k in ids):
                for index, joint in enumerate(joints[:-1]):
                    place(human+finger.title()+joint,markers[ids[index]],markers[ids[index+1]])
    # Reposition unspecified descendants (eyes/fingers etc.) relative to fitted parents.
    pending=[b for b in bones if b.name not in placed]
    while pending:
        progress=False
        for b in pending[:]:
            if b.parent and b.parent.name not in placed:
                continue
            if b.parent:
                parent=b.parent
                transform=parent.matrix @ old[parent.name][2].inverted()
                scale=parent.length/max((old[parent.name][1]-old[parent.name][0]).length,1e-5)
                b.head=parent.head+(transform @ old[b.name][0]-parent.head)*scale
                b.tail=parent.head+(transform @ old[b.name][1]-parent.head)*scale
            placed.add(b.name);pending.remove(b);progress=True
        require(progress, 'Cannot resolve bone hierarchy')
    bpy.ops.object.mode_set(mode='OBJECT')
    collection=bpy.data.collections.new('CharaKit_Rig_Work')
    bpy.context.scene.collection.children.link(collection)
    for c in list(rig.users_collection):c.objects.unlink(rig)
    collection.objects.link(rig)
    setup_id=uuid.uuid4().hex
    entries=[]
    for obj in originals:
        clone=obj.copy();clone.data=obj.data.copy();clone.name=obj.name+'_RigWork'
        world=obj.matrix_world.copy();clone.parent=None;collection.objects.link(clone);clone.matrix_world=world
        clone.hide_set(False);clone.hide_viewport=False;clone.hide_render=False
        clone['charakit_setup_id']=setup_id
        entries.append(dict(source=obj.name,copy=clone.name,rigid=rigid.get(obj.name)))
    s=dict(version=VERSION,id=setup_id,stage='created',rig=rig.name,project_id=p['id'],
           project_sha256=digest,source_markers={k:list(v) for k,v in markers.items()},
           output_dir=str(Path(config['output_dir']).expanduser().resolve()),objects=entries,warnings=warnings)
    activate(rig)
    return checkpoint(rig,s,'01-created')


def bind(rig, s):
    require(s['stage']=='created','Bind requires created stage; it cannot overwrite existing weights')
    mapping=vrm_mapping(rig)
    objects=targets(s)
    checkpoint(rig,s,'before-bind')
    for obj,entry in objects:
        require(not any(m.type=='ARMATURE' for m in obj.modifiers),'Already bound: '+obj.name)
    # Heat weights for body/clothing; deterministic rigid attachment for specified head/hair parts.
    for obj,entry in objects:
        if entry['rigid']:
            name=mapping[entry['rigid']]
            for group in list(obj.vertex_groups):
                if group.name in rig.data.bones:obj.vertex_groups.remove(group)
            group=obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
            group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
            modifier=obj.modifiers.new('CharaKit Armature','ARMATURE');modifier.object=rig
        else:
            activate(rig);obj.select_set(True)
            result=bpy.ops.object.parent_set(type='ARMATURE_AUTO')
            require('FINISHED' in result,'Automatic weights failed: '+obj.name)
        for modifier in obj.modifiers:
            if modifier.type=='ARMATURE' and modifier.object==rig:
                modifier.use_deform_preserve_volume=False
                modifier.use_vertex_groups=True
                modifier.use_bone_envelopes=False
        missing=[]
        groups={g.index:g.name for g in obj.vertex_groups}
        for v in obj.data.vertices:
            total=sum(g.weight for g in v.groups if groups[g.group] in rig.data.bones and rig.data.bones[groups[g.group]].use_deform)
            if total<1e-6:missing.append(v.index)
        require(not missing, f'Unweighted vertices in {obj.name}: {len(missing)}. Reopen before-bind checkpoint; do not bake.')
    s['stage']='weighted'
    activate(rig)
    return checkpoint(rig,s,'02-weighted')


def preview(rig,s):
    require(s['stage'] in ('weighted','preview'),'Preview requires provisional weights')
    require(not rig.animation_data or not rig.animation_data.action,'Active rig animation is not supported')
    require(not any(b.constraints for b in rig.pose.bones),'Constrained rigs need separate preparation')
    require(all(abs(rig.matrix_world[i][j]-(1 if i==j else 0))<1e-6 for i in range(4) for j in range(4)),
            'Keep setup armature in the original charakit coordinate space')
    mapping=vrm_mapping(rig)
    adjustments={}
    # Recompute arm rotations from rest to make preview repeatable; no legs/eyes/head reset.
    for side, sign in [('left',1),('right',-1)]:
        for suffix in ('UpperArm','LowerArm','Hand'):
            bone=rig.pose.bones[mapping[side+suffix]]
            bone.matrix_basis=Matrix.Identity(4)
        bpy.context.view_layer.update()
        for suffix in ('UpperArm','LowerArm','Hand'):
            bone=rig.pose.bones[mapping[side+suffix]]
            direction=(bone.tail-bone.head).normalized()
            desired=Vector((sign,0,0))
            delta=direction.rotation_difference(desired)
            matrix=bone.matrix.copy();center=bone.head.copy()
            bone.matrix=Matrix.Translation(center) @ delta.to_matrix().to_4x4() @ Matrix.Translation(-center) @ matrix
            bpy.context.view_layer.update()
            adjustments[side+suffix]=math.degrees(delta.angle)
    s['stage']='preview';s['arm_adjustment_degrees']=adjustments
    return checkpoint(rig,s,'03-tpose-preview')


def key_coordinates(obj):
    if obj.data.shape_keys:
        return [(k.name,[v.co.copy() for v in k.data]) for k in obj.data.shape_keys.key_blocks]
    return [(None,[v.co.copy() for v in obj.data.vertices])]


def evaluated_skin(obj,rig,coords):
    """Evaluate only this armature at fixed coordinates without touching original shape keys/drivers."""
    scratch=obj.copy();scratch.data=obj.data.copy()
    bpy.context.scene.collection.objects.link(scratch)
    mesh=scratch.data
    try:
        scratch.animation_data_clear()
        scratch.shape_key_clear()
        for v,co in zip(mesh.vertices,coords):v.co=co
        for modifier in list(scratch.modifiers):
            if modifier.type!='ARMATURE' or modifier.object!=rig:scratch.modifiers.remove(modifier)
        scratch.hide_set(False);scratch.hide_viewport=False
        mesh.update();bpy.context.view_layer.update()
        depsgraph=bpy.context.evaluated_depsgraph_get();evaluated=scratch.evaluated_get(depsgraph)
        result=evaluated.to_mesh()
        try:
            require(len(result.vertices)==len(coords),'Vertex count changed during bake')
            return [v.co.copy() for v in result.vertices]
        finally:evaluated.to_mesh_clear()
    finally:
        bpy.data.objects.remove(scratch,do_unlink=True)
        if mesh.users==0:bpy.data.meshes.remove(mesh)


def commit(rig,s):
    require(s['stage']=='preview','Commit requires a reviewed T-pose preview and cannot run twice')
    require(not rig.constraints and not rig.animation_data,'Rig constraints/animation are unsupported at rest commit')
    require(not any(b.constraints for b in rig.pose.bones),'Bone constraints are unsupported at rest commit')
    for bone in rig.pose.bones:
        require(all(abs(v-1)<1e-5 for v in bone.scale),'Non-unit bone scaling is unsupported at rest commit')
    objects=targets(s)
    linked={o.name for o in bpy.data.objects if any(m.type=='ARMATURE' and m.object==rig for m in o.modifiers)}
    require(linked=={o.name for o,_ in objects},'Rig has unlisted or missing bound meshes; refusing partial rest bake')
    require(not any(o.parent==rig and o.name not in linked for o in bpy.data.objects),
            'Unlisted rig children must be handled before rest bake')
    mapping=vrm_mapping(rig)
    for side,sign in [('left',1),('right',-1)]:
        for suffix in ('UpperArm','LowerArm','Hand'):
            b=rig.pose.bones[mapping[side+suffix]]
            require((b.tail-b.head).normalized().dot(Vector((sign,0,0)))>.999,
                    'Arms are not in T-pose: '+side+suffix)
    for obj,_ in objects:
        mods=[m for m in obj.modifiers if m.type=='ARMATURE']
        require(len(mods)==1 and mods[0].object==rig and mods[0].show_viewport and
                not mods[0].use_deform_preserve_volume and not mods[0].vertex_group,
                'Use one unmasked linear Armature modifier for rest bake: '+obj.name)
        require(not any(m.show_viewport and m.type!='ARMATURE' for m in obj.modifiers),
                'Other enabled modifiers must be resolved before rest bake: '+obj.name)
        require(obj.data.users==1,'Shared mesh data needs separate handling: '+obj.name)
    backup=checkpoint(rig,s,'before-rest-commit')
    baked={obj.name:[(name,evaluated_skin(obj,rig,coords)) for name,coords in key_coordinates(obj)] for obj,_ in objects}
    # All samples exist before mutation. Modify every key in place, preserving drivers and key relationships.
    for obj,_ in objects:
        for name,coords in baked[obj.name]:
            data=obj.data.shape_keys.key_blocks[name].data if name is not None else obj.data.vertices
            for v,co in zip(data,coords):v.co=co
        obj.data.update()
    activate(rig);bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT');bpy.context.view_layer.update()
    maximum=0
    for obj,_ in objects:
        for name,coords in baked[obj.name]:
            after=evaluated_skin(obj,rig,coords)
            maximum=max(maximum,max(((a-b).length for a,b in zip(after,coords)),default=0))
    require(maximum<1e-5,'Rest bake changed appearance; restore '+backup['checkpoint'])
    s['stage']='rest';s['rest_bake_max_local_error']=maximum
    s['source_markers_are_pre_correction']=True
    return checkpoint(rig,s,'04-tpose-rest')


def run(config):
    stage=config['stage'].lower()
    if stage=='create':return create(config)
    rig=bpy.data.objects.get(config['rig'])
    s=state(rig)
    require(stage in ('bind','preview','commit'),'Expected create, bind, preview or commit')
    return {'bind':bind,'preview':preview,'commit':commit}[stage](rig,s)


if __name__=='__main__':
    config_path=globals().get('CONFIG_PATH')
    if config_path is None and '--' in sys.argv:
        args=sys.argv[sys.argv.index('--')+1:]
        if len(args)==1:config_path=args[0]
    if not config_path:
        raise RuntimeError('Set CONFIG_PATH or pass -- config.json. See references/humanoid-setup.md')
    print(json.dumps(run(json.loads(Path(config_path).read_text(encoding='utf-8'))),ensure_ascii=False,indent=2))
