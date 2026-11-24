"""Build a donor-based rig on original meshes using only saved Tripo joints.

Run in a factory-startup background Blender. prepare never transfers weights;
inspect components/fitted donor, then run transfer.py on the saved fit scene.
"""
import bpy
import bmesh
import json
import sys
import importlib.util
from pathlib import Path
from mathutils import Vector, Matrix


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


HERE = Path(__file__).resolve().parent
KIT = HERE.parents[2]
transfer = module('guide_weight_transfer', HERE / 'transfer.py')
importer = module('guide_models', KIT / 'skills/charakit-project/scripts/import_models.py')


def components(obj):
    parents = list(range(len(obj.data.vertices)))
    def root(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i
    for e in obj.data.edges:
        a, b = [root(i) for i in e.vertices]
        parents[max(a,b)] = min(a,b)
    parts = {}
    for i in range(len(parents)):
        parts.setdefault(root(i), []).append(i)
    return sorted(parts.values(), key=lambda ids: ids[0])


def bounds(points):
    return dict(min=[min(v[i] for v in points) for i in range(3)], max=[max(v[i] for v in points) for i in range(3)])


def split_selected(obj, parts, excluded, collection):
    # Removing whole loose components preserves polygon loops, UVs and materials.
    removed = set()
    parked = []
    for part_id, ids in parts:
        if part_id not in excluded:
            continue
        copy = obj.copy();copy.data = obj.data.copy();collection.objects.link(copy)
        copy.name = 'Spring_' + part_id.replace(':','_');copy['springPart'] = part_id
        keep = set(ids);mesh = bmesh.new();mesh.from_mesh(copy.data)
        mesh.verts.ensure_lookup_table()
        bmesh.ops.delete(mesh, geom=[v for v in mesh.verts if v.index not in keep], context='VERTS')
        mesh.to_mesh(copy.data);mesh.free();copy.data.update()
        removed.update(ids);parked.append(copy)
    if removed:
        mesh=bmesh.new();mesh.from_mesh(obj.data);mesh.verts.ensure_lookup_table()
        bmesh.ops.delete(mesh,geom=[v for v in mesh.verts if v.index in removed],context='VERTS')
        mesh.to_mesh(obj.data);mesh.free();obj.data.update()
    return parked


def make_guide(guide, collection):
    data=bpy.data.armatures.new('TripoJointReference');obj=bpy.data.objects.new('TripoJointReference',data);collection.objects.link(obj)
    bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    made=[]
    for joint in guide['bones']:
        bone=data.edit_bones.new(joint['name']);bone.head=joint['head'];bone.tail=joint['tail'];bone.align_roll(Vector(joint['rollAxis']))
        if joint['parent'] is not None:bone.parent=made[joint['parent']]
        made.append(bone)
    bpy.ops.object.mode_set(mode='OBJECT');obj.select_set(False)
    return obj


def fit_template(source, guide, collection):
    sm,gm=transfer.human_map(source),transfer.human_map(guide)
    required=['hips','chest','head','leftHand','rightHand','leftFoot','rightFoot','leftLowerArm','rightLowerArm','leftLowerLeg','rightLowerLeg']
    if any(k not in sm or k not in gm for k in required):
        raise ValueError('Required donor/guide joints could not be matched')
    sf,tf=transfer.frame(source,sm),transfer.frame(guide,gm)
    so,sx,sy,sz,sh=sf;to,tx,ty,tz,th=tf;scale=th/sh
    rotation=Matrix((tx,ty,tz)).transposed() @ Matrix((sx,sy,sz))
    direct={sm[k]:transfer.point(guide,gm[k]) for k in sm.keys() & gm.keys()}
    def transform(point):return to+rotation@(point-so)*scale
    heads={b.name:direct.get(b.name,transform(source.matrix_world@b.head_local)) for b in source.data.bones}
    target=source.copy();target.data=source.data.copy();target.animation_data_clear();target.name='OriginalMeshRig';collection.objects.link(target);target.parent=None;target.matrix_world=Matrix.Identity(4);target.hide_set(False);target.hide_render=False
    # Donors can have mirror editing enabled. Tripo joints can be asymmetric;
    # editing the opposite side must not overwrite a previously fitted joint.
    target.data.use_mirror_x=False
    tails={};rolls={}
    for b in source.data.bones:
        # Use the child's true joint for connected chains, not arbitrary FBX leaf lengths.
        connected=[c for c in b.children if (c.head_local-b.tail_local).length<1e-4 and c.name in direct]
        av=source.matrix_world.to_3x3()@(b.tail_local-b.head_local)
        tails[b.name]=heads[connected[0].name] if connected else heads[b.name]+rotation@av*scale
        direction=tails[b.name]-heads[b.name]
        if direction.length<1e-6:raise ValueError('Coincident template joints: '+b.name)
        rolls[b.name]=(rotation@av).rotation_difference(direction) @ (rotation@(source.matrix_world.to_3x3()@b.z_axis))
    bpy.context.view_layer.objects.active=target;target.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
    for b in target.data.edit_bones:b.use_connect=False
    for b in target.data.edit_bones:b.head=heads[b.name];b.tail=tails[b.name];b.align_roll(rolls[b.name])
    bpy.ops.object.mode_set(mode='OBJECT')
    for b in target.pose.bones:
        b.matrix_basis=Matrix.Identity(4)
        for c in list(b.constraints):b.constraints.remove(c)
    bpy.context.view_layer.update()
    error=max((transfer.point(target,sm[k])-transfer.point(guide,gm[k])).length for k in sm.keys() & gm.keys())
    if error>1e-5:raise ValueError('Template joints did not match the guide')
    return target,dict(mapped_joints=len(direct),max_joint_error_m=error,donor_scale=scale)


def prepare(config):
    path=Path(config['project']).resolve();p=json.loads(path.read_text(encoding='utf-8'))
    if p['mode']!='parts' or not p.get('rigGuide'):raise ValueError('Use the original-parts project with a bone guide')
    stamp=[[role,a['sha256'],a['normalization'],p['placements']['head' if role=='head_neutral' else role]]
           for role in ('body','head_neutral') for a in p['assets'] if a['role']==role]
    if json.loads(p['rigGuide']['sourceStamp'])!=stamp:raise ValueError('Original parts changed after bone import')
    out=transfer.output_directory(config,'prepare')
    # Keep factory-startup cube/camera and any caller scene out of the work file.
    # Existing datablocks remain intact in their original scene.
    bpy.context.window.scene=bpy.data.scenes.new('CharaKit_BoneTransfer')
    result=importer.import_models(path,{'body','head_neutral'})
    collection=bpy.data.collections[result['collection']]
    originals=sorted((o for o in collection.objects if o.type=='MESH'),key=lambda o:(o['charakitRole']!='body',o.name))
    if any(o.find_armature() for o in originals):raise ValueError('Original parts must be unrigged')
    # FBX imports retain textures; restore the workflow's MToon shader before
    # saving prepared, fitted and weighted scenes.
    module('guide_mtoon',KIT/'scripts/mtoon-export.py').apply_mtoon(originals)
    inventory=[];part_lookup={};excluded=set(config.get('exclude_components',[]));all_ids=set()
    for index,obj in enumerate(originals):
        parts=[]
        for c,ids in enumerate(components(obj)):
            part_id=f"{obj['charakitRole']}:{index}:{c}"
            parts.append((part_id,ids))
            if obj['charakitRole']=='body':all_ids.add(part_id)
            verts=[obj.matrix_world@obj.data.vertices[i].co for i in ids]
            inventory.append(dict(id=part_id,object=obj.name,vertices=len(ids),**bounds(verts)))
        part_lookup[obj.name]=parts
    if not excluded<=all_ids:raise ValueError('Unknown excluded component')
    (out/'components.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2),encoding='utf-8')
    if config.get('inventory_only'):
        bpy.ops.wm.save_as_mainfile(filepath=str(out/'inventory.blend'),copy=True)
        print('GUIDE_INVENTORY '+str(out));return dict(output=str(out),components=inventory)
    guide=make_guide(p['rigGuide'],collection)
    with bpy.data.libraries.load(str(Path(config['donor_blend']).resolve()),link=False) as (available,loaded):
        if config['donor_armature'] not in available.objects:raise ValueError('Donor armature not found')
        loaded.objects=[config['donor_armature']]
    source=loaded.objects[0];collection.objects.link(source);bpy.context.view_layer.update()
    rig,rig_report=fit_template(source,guide,collection)
    target_meshes=[];parked=[]
    plan=p.get('weightTransferPlan',{})
    named={o['name'] for o in plan.get('springObjects',[])} if plan.get('version')==2 else None
    if named is not None:
        body=next(a for a in p['assets'] if a['role']=='body')
        actual={o.name for o in originals if o['charakitRole']=='body'}
        if plan['bodyHash']!=body['sha256'] or actual!={'Body',*named}:raise ValueError('Separated spring objects do not match the reviewed kit')
    for obj in originals:
        if named is not None and obj['charakitRole']=='body' and obj.name in named:
            parked.append(obj);continue
        if named is None and obj['charakitRole']=='body':parked+=split_selected(obj,part_lookup[obj.name],excluded,collection)
        world=obj.matrix_world.copy();obj.parent=rig;obj.matrix_world=world
        obj.vertex_groups.clear();obj.modifiers.new('DonorWeights','ARMATURE').object=rig
        if obj['charakitRole']=='head_neutral':
            group=obj.vertex_groups.new(name=transfer.human_map(rig)['head']);group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
        elif len(obj.data.vertices):target_meshes.append(obj.name)
    for obj in parked:
        world=obj.matrix_world.copy();obj.parent=rig;obj.matrix_world=world;obj.vertex_groups.clear()
        obj.modifiers.new('TemporaryRootAttachment','ARMATURE').object=rig
        group=obj.vertex_groups.new(name=transfer.human_map(rig)['hips']);group.add(list(range(len(obj.data.vertices))),1,'REPLACE')
        obj['pendingSpringSetup']=True
    guide.hide_set(True);guide.hide_render=True;source.hide_set(True);source.hide_render=True
    fit_config={**config,'target_armature':rig.name,'target_meshes':target_meshes,'bone_map':{b.name:b.name for b in source.data.bones}}
    fit=transfer.fit(fit_config)
    report=dict(stage='prepared-from-bone-guide',rig=rig_report,excluded_components=sorted(excluded),pending_spring_objects=[o.name for o in parked],fit_collection=fit['collection'],fit=fit,output=str(out))
    (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'prepared.blend'),copy=True)
    print('GUIDE_PREPARE '+json.dumps(report,ensure_ascii=False));return report


if __name__=='__main__':
    config=json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text(encoding='utf-8'))
    prepare(config)
