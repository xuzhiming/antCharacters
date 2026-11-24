"""Staged donor fitting and weight transfer. Run in Blender on a working scene.

fit(config) saves a fitted donor and copied target before any transfer.
transfer(config) operates only on that named work collection and writes a new result.
No source .blend or original target objects are saved over or edited.
"""
import json
import math
import re
import sys
import uuid
from pathlib import Path
from collections import defaultdict
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


def clean(name):
    return re.sub('[^a-z0-9]', '', name.lower().split(':')[-1].removeprefix('mixamorig'))


def human_map(rig):
    aliases = {'root':['root'], 'leftEye':['eyel','lefteye','jadjlfaceeye'], 'rightEye':['eyer','righteye','jadjrfaceeye'], 'hips':['hips','pelvis','jbipchips'], 'spine':['spine','jbipcspine'],
               'chest':['chest','spine1','jbipcchest'], 'upperChest':['upperchest','spine2','jbipcupperchest'],
               'neck':['neck','jbipcneck'], 'head':['head','jbipchead']}
    parts = {'Shoulder':['shoulder'], 'UpperArm':['upperarm','arm'], 'LowerArm':['lowerarm','forearm'],
             'Hand':['hand'], 'UpperLeg':['upperleg','upleg','thigh'], 'LowerLeg':['lowerleg','leg','calf','shin'],
             'Foot':['foot'], 'Toes':['toes','toebase']}
    for side, short in [('left','l'),('right','r')]:
        for part, names in parts.items():
            aliases[side + part] = [n for a in names for n in (side+a,a+short,short+a,'jbip'+short+a)]
        for finger in ['thumb','index','middle','ring','little']:
            for i, seg in enumerate(['proximal','intermediate','distal'], 1):
                aliases[side+finger.title()+str(i)] = [finger+seg+short,side+'hand'+finger+str(i),'jbip'+short+finger+str(i)]
    result = {}
    for key, names in aliases.items():
        for name in names:
            matches = [b.name for b in rig.data.bones if clean(b.name) == name]
            if len(matches) == 1:
                result[key] = matches[0]
                break
    return result


def point(rig, name):
    return rig.matrix_world @ rig.data.bones[name].head_local


def frame(rig, landmarks):
    origin = point(rig, landmarks['hips'])
    up = point(rig, landmarks['head']) - origin
    height = up.length
    if height < 1e-5:
        raise ValueError('Hip and head landmarks coincide')
    up.normalize()
    if all(k in landmarks for k in ('leftUpperLeg','rightUpperLeg')):
        right = point(rig, landmarks['leftUpperLeg']) - point(rig, landmarks['rightUpperLeg'])
    else:
        right = rig.matrix_world.to_quaternion() @ Vector((1,0,0))
    right -= up * right.dot(up)
    if right.length < 1e-5:
        raise ValueError('Cannot infer a body frame')
    right.normalize()
    return origin, right, up, right.cross(up).normalized(), height


def monotone_height(y, src, dst):
    """Three monotonic landmarks with a shared chest tangent: no segment kink."""
    slopes = [(dst[i+1]-dst[i])/(src[i+1]-src[i]) for i in range(2)]
    if y <= src[0]:
        return dst[0]+(y-src[0])*slopes[0]
    if y >= src[2]:
        return dst[2]+(y-src[2])*slopes[1]
    middle = 2*slopes[0]*slopes[1]/(slopes[0]+slopes[1])
    tangents = [slopes[0], middle, slopes[1]]
    i = 0 if y < src[1] else 1
    span = src[i+1]-src[i]
    t = (y-src[i])/span
    return ((2*t**3-3*t*t+1)*dst[i]+(t**3-2*t*t+t)*span*tangents[i]
            +(-2*t**3+3*t*t)*dst[i+1]+(t**3-t*t)*span*tangents[i+1])


def output_directory(config, prefix):
    base = Path(config['output_dir']).resolve()
    base.mkdir(parents=True, exist_ok=True)
    out = base / (prefix + '-' + uuid.uuid4().hex[:10])
    out.mkdir()
    return out


def export_fbx(objects, output):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.hide_set(False)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.export_scene.fbx(filepath=str(output), use_selection=True, object_types={'MESH','ARMATURE'},
                            add_leaf_bones=False, bake_anim=False, use_mesh_modifiers=False,
                            path_mode='COPY', embed_textures=True, use_triangles=False)


def fit(config):
    if bpy.context.mode != 'OBJECT':
        raise ValueError('Use Object Mode')
    target_rig = bpy.data.objects[config['target_armature']]
    targets = [bpy.data.objects[n] for n in config['target_meshes']]
    if target_rig.type != 'ARMATURE' or not targets or any(o.type != 'MESH' for o in targets):
        raise ValueError('Specify one target armature and explicit target mesh names')
    if any(o.data.shape_keys for o in targets):
        raise ValueError('The MVP transfer targets neutral meshes without shape keys')
    if any(o.find_armature() != target_rig for o in targets):
        raise ValueError('Every target mesh must be bound to the supplied target rig')
    if any(abs(b.matrix_basis[i][j] - float(i == j)) > 1e-5
           for b in target_rig.pose.bones for i in range(4) for j in range(4)):
        raise ValueError('Return the target rig to its rest pose before fitting')
    out = output_directory(config, 'fit')
    donor_path = Path(config['donor_blend']).resolve()
    names = [config['donor_armature'], *config['donor_meshes']]
    with bpy.data.libraries.load(str(donor_path), link=False) as (source, loaded):
        if any(n not in source.objects for n in names):
            raise ValueError('Named donor objects are not in the supplied blend')
        loaded.objects = names
    donor_rig, *donors = loaded.objects
    if donor_rig.type != 'ARMATURE' or any(o.type != 'MESH' for o in donors):
        raise ValueError('Invalid donor object types')
    collection = bpy.data.collections.new('CharaKit_Weights_' + uuid.uuid4().hex[:8])
    bpy.context.scene.collection.children.link(collection)
    for obj in loaded.objects:
        collection.objects.link(obj)
        obj.hide_set(True)
        obj.hide_render = True
    # Appended objects have unevaluated matrix_world until the dependency graph
    # updates. Their local mesh coordinates may have a different up axis/scale.
    bpy.context.view_layer.update()
    source_human = {**human_map(donor_rig), **config.get('source_landmarks', {})}
    target_human = {**human_map(target_rig), **config.get('target_landmarks', {})}
    if any(k not in source_human or k not in target_human for k in ['hips','chest','head']):
        raise ValueError('Map hips, chest and head explicitly before fitting')
    mapping = {name:target_human[key] for key,name in source_human.items() if key in target_human}
    mapping.update(config.get('bone_map', {}))
    if any(a not in donor_rig.data.bones or b not in target_rig.data.bones for a,b in mapping.items()):
        raise ValueError('Bone mapping references missing bones')
    sf, tf = frame(donor_rig, source_human), frame(target_rig, target_human)
    so,sx,sy,sz,sh=sf;to,tx,ty,tz,th=tf
    scale = th/sh
    # Spine subdivision differs between rigs (Chest vs Chest+UpperChest).
    # Neck is a consistent surface landmark; fitting each spine segment can
    # pull the bust down/up and elongate the head even when joints are correct.
    torso_anchor='neck' if 'neck' in source_human and 'neck' in target_human else 'chest'
    src_y=[0,(point(donor_rig,source_human[torso_anchor])-so).dot(sy),sh]
    dst_y=[0,(point(target_rig,target_human[torso_anchor])-to).dot(ty),th]
    if not 0 < src_y[1] < sh or not 0 < dst_y[1] < th:
        raise ValueError('Chest landmark must lie between hips and head')
    ratios=[(dst_y[i+1]-dst_y[i])/(src_y[i+1]-src_y[i])/scale for i in range(2)]
    if any(not .5 <= r <= 2 for r in ratios):
        raise ValueError('Extreme torso proportions: inspect landmark mapping before proceeding')
    width,depth=config.get('torso_width',1.0),config.get('torso_depth',1.0)
    if not .8 <= width <= 1.2 or not .8 <= depth <= 1.2:
        raise ValueError('MVP torso width/depth correction is limited to 0.8–1.2')
    torso={source_human[k] for k in ['hips','spine','chest','upperChest','neck','head'] if k in source_human}
    transforms={}
    for a,b in mapping.items():
        ab,bb=donor_rig.data.bones[a],target_rig.data.bones[b]
        ah=point(donor_rig,a);bh=point(target_rig,b)
        av=donor_rig.matrix_world@ab.tail_local-ah;bv=target_rig.matrix_world@bb.tail_local-bh
        if min(av.length,bv.length)<1e-6:
            raise ValueError('Zero-length bone: '+a)
        transforms[a]=(ah,bh,av.normalized(),av.rotation_difference(bv),bv.length/av.length)
    coords,faces,weights=[],[],[]
    for donor in donors:
        groups={g.index:g.name for g in donor.vertex_groups};offset=len(coords)
        for v in donor.data.vertices:
            raw={groups[g.group]:g.weight for g in v.groups if g.weight>1e-8 and groups[g.group] in donor_rig.data.bones}
            missing=set(raw)-set(mapping)
            if missing:
                raise ValueError('Unmapped weighted donor bones: '+', '.join(sorted(missing)))
            total=sum(raw.values())
            if total<1e-8:
                raise ValueError('Unweighted donor vertex')
            raw={n:w/total for n,w in raw.items()}
            co=donor.matrix_world@v.co;delta=co-so
            height=delta.dot(sy)
            fitted_height=monotone_height(height,src_y,dst_y) if height<=sh else th+(height-sh)*scale
            torso_co=to+tx*delta.dot(sx)*scale*width+tz*delta.dot(sz)*scale*depth+ty*fitted_height
            fitted=Vector((0,0,0));remapped=defaultdict(float)
            for name,w in raw.items():
                if name in torso:
                    fitted+=torso_co*w
                else:
                    ah,bh,axis,rot,length_scale=transforms[name];d=co-ah
                    # Uniform baseline scale preserves limb thickness; axial length is fitted separately.
                    fitted+=(bh+rot@(d*scale+axis*d.dot(axis)*(length_scale-scale)))*w
                remapped[mapping[name]]+=w
            coords.append(fitted);weights.append(dict(remapped))
        faces.extend(tuple(offset+i for i in face.vertices) for face in donor.data.polygons)
    rig=target_rig.copy();rig.data=target_rig.data.copy();collection.objects.link(rig);rig.name=collection.name+'_Rig'
    copies=[];transfer_names=[]
    bound=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.find_armature()==target_rig]
    for original in bound:
        # Keep reviewed semantic names in the exported result; originals stay as backups.
        saved_name=original.name
        original.name='Backup_'+saved_name
        obj=original.copy();obj.data=original.data.copy();collection.objects.link(obj);world=original.matrix_world.copy()
        obj.name=saved_name
        obj.parent=rig;obj.matrix_world=world
        for mod in obj.modifiers:
            if mod.type=='ARMATURE' and mod.object==target_rig:mod.object=rig
        copies.append(obj)
        if original in targets:transfer_names.append(obj.name)
    for original in [target_rig,*bound]:
        original.hide_set(True)
        original.hide_render=True
    mesh=bpy.data.meshes.new(collection.name+'_DonorMesh');mesh.from_pydata(coords,[],faces);mesh.update()
    proxy=bpy.data.objects.new(collection.name+'_FittedDonor',mesh);collection.objects.link(proxy)
    for name in sorted(set(n for w in weights for n in w)):proxy.vertex_groups.new(name=name)
    for i,w in enumerate(weights):
        for name,value in w.items():proxy.vertex_groups[name].add([i],value,'REPLACE')
    proxy.modifiers.new('ReviewRig','ARMATURE').object=rig
    collection['weight_state']=json.dumps({'rig':rig.name,'proxy':proxy.name,'copies':[o.name for o in copies],'targets':transfer_names,'transferred':False})
    report={'stage':'fit','collection':collection.name,'source':donor_path.name,'mapping':mapping,'torso_anchor':torso_anchor,'torso_ratio':ratios,'torso_width':width,'torso_depth':depth,'vertices':len(coords),'output':str(out),'review':'Inspect chest/torso and limb alignment before transfer.'}
    export_fbx([rig,proxy],out/'fitted-donor.fbx')
    proxy.hide_set(True);proxy.hide_render=True
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'fitted.blend'),copy=True)
    (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({**report,'output':str(out)},ensure_ascii=False));return report


def transfer(config):
    collection=bpy.data.collections[config['collection']]
    state=json.loads(collection['weight_state'])
    if state['transferred']:
        raise ValueError('Already transferred; reopen fitted.blend to retry')
    out=output_directory(config,'transfer')
    proxy=bpy.data.objects[state['proxy']];rig=bpy.data.objects[state['rig']]
    proxy.data.calc_loop_triangles()
    coords=[proxy.matrix_world@v.co for v in proxy.data.vertices]
    triangles=[tuple(t.vertices) for t in proxy.data.loop_triangles]
    tree=BVHTree.FromPolygons(coords,triangles,all_triangles=True)
    names={g.index:g.name for g in proxy.vertex_groups}
    weights=[{names[g.group]:g.weight for g in v.groups} for v in proxy.data.vertices]
    reports=[]
    for name in state['targets']:
        obj=bpy.data.objects[name];obj.vertex_groups.clear()
        groups={n:obj.vertex_groups.new(name=n) for n in sorted(set(names.values()))}
        gaps=[];max_influences=0
        for vertex in obj.data.vertices:
            hit,normal,idx,distance=tree.find_nearest(obj.matrix_world@vertex.co)
            if idx is None:raise ValueError('No donor surface')
            ids=triangles[idx];a,b,c=[coords[i] for i in ids]
            v0,v1,v2=b-a,c-a,hit-a;d00,d01,d11=v0.dot(v0),v0.dot(v1),v1.dot(v1)
            den=d00*d11-d01*d01
            if abs(den)<1e-20:
                best=min(range(3),key=lambda j:(hit-coords[ids[j]]).length);blend=[float(j==best) for j in range(3)]
            else:
                v=(d11*v2.dot(v0)-d01*v2.dot(v1))/den;w=(d00*v2.dot(v1)-d01*v2.dot(v0))/den
                blend=[max(0,min(1,x)) for x in [1-v-w,v,w]];total=sum(blend);blend=[x/total for x in blend]
            result=defaultdict(float)
            for i,factor in zip(ids,blend):
                for n,value in weights[i].items():result[n]+=factor*value
            # Match the common four-influence preview/export path explicitly, with renormalization.
            result=dict(sorted(result.items(),key=lambda item:item[1],reverse=True)[:4]);total=sum(result.values())
            if total<1e-8 or not math.isfinite(total):raise ValueError('Invalid transferred weight')
            for n,w in result.items():groups[n].add([vertex.index],w/total,'REPLACE')
            gaps.append(distance);max_influences=max(max_influences,len(result))
        reports.append({'mesh':name,'vertices':len(gaps),'max_gap_m':max(gaps,default=0),'over_5cm':sum(x>.05 for x in gaps),'max_influences':max_influences})
    state['transferred']=True;collection['weight_state']=json.dumps(state)
    copies=[bpy.data.objects[n] for n in state['copies']]
    export_fbx([rig,*copies],out/'weighted-review.fbx')
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'weighted.blend'),copy=True)
    report={'stage':'transfer','meshes':reports,'visual_check_required':True,'output':str(out)}
    (out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False));return report


def run(config):
    stage=config.get('stage','fit')
    if stage=='fit':return fit(config)
    if stage=='transfer':return transfer(config)
    raise ValueError('stage must be fit or transfer')


if __name__=='__main__':
    config_path=sys.argv[sys.argv.index('--')+1]
    run(json.loads(Path(config_path).read_text(encoding='utf-8')))
