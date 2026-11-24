"""Immutable loose parts -> independent texture/spring groups -> UV restoration.
Blender --background --factory-startup --disable-autoexec --python-exit-code 1
  --python scripts/production.py -- analyze|prepare|assemble INPUT.charakit OUTPUT_DIR
Or: -- measure INPUT.fbx head|body OUTPUT.json
All outputs go to a fresh job directory; source files are never overwritten.
"""
import importlib.util
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector, Euler, kdtree

ROOT=Path(__file__).resolve().parents[1]


def module(name, path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


def bounds(points):
    points=list(points)
    if not points:raise ValueError('Empty geometry')
    return [min(v[i] for v in points) for i in range(3)], [max(v[i] for v in points) for i in range(3)]


def imported(path):
    before=set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(path),use_image_search=False,use_anim=False)
    bpy.context.view_layer.update()
    added=set(bpy.data.objects)-before
    meshes=sorted((o for o in added if o.type=='MESH'),key=lambda o:o.name)
    if not meshes or any(o.find_armature() or o.data.shape_keys for o in meshes):
        raise ValueError('Use unrigged geometry without shape keys')
    for o in meshes:
        world=o.matrix_world.copy();o.parent=None;o.matrix_world=Matrix.Identity(4);o.data.transform(world)
    for o in added-set(meshes):bpy.data.objects.remove(o,do_unlink=True)
    return meshes


def export(objects, path):
    if not objects:raise ValueError('No mesh to export')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.export_scene.fbx(filepath=str(path),use_selection=True,object_types={'MESH'},use_mesh_modifiers=False,
        bake_anim=False,add_leaf_bones=False,path_mode='COPY',embed_textures=True,
        axis_forward='-Z',axis_up='Y',bake_space_transform=True,apply_scale_options='FBX_SCALE_ALL')


def piece(obj, indices, name):
    """Copy whole polygons and loop UVs without touching vertex coordinates or winding."""
    index={v:i for i,v in enumerate(indices)}
    faces=[f for f in obj.data.polygons if f.vertices[0] in index]
    if not faces or any(any(v not in index for v in f.vertices) for f in faces):
        raise ValueError('Loose edges or an invalid component boundary: '+name)
    mesh=bpy.data.meshes.new(name)
    mesh.from_pydata([obj.data.vertices[i].co for i in indices],[],[[index[v] for v in f.vertices] for f in faces])
    for mat in obj.data.materials:mesh.materials.append(mat)
    for dst,src in zip(mesh.polygons,faces):dst.material_index=src.material_index;dst.use_smooth=src.use_smooth
    for layer in obj.data.uv_layers:
        uv=mesh.uv_layers.new(name=layer.name)
        for dst,src in zip(mesh.polygons,faces):
            for di,si in zip(dst.loop_indices,src.loop_indices):uv.data[di].uv=layer.data[si].uv
    result=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(result);return result


def analyze(p, base, out):
    guide=module('loose_components',ROOT/'skills/avatar-weight-transfer/scripts/from_guide.py')
    w=p['production'];inventory=[];objects=[]
    for source in ('head','body'):
        candidate=w.get('segmented',{}).get(source) or next(c for c in w['candidates'][source] if c['id']==w['selected'][source])
        imported_meshes=imported(base/candidate['path'])
        counter=0
        for obj in imported_meshes:
            for indices in guide.components(obj):
                counter+=1;name=f'{source}_{counter:05}'
                part=piece(obj,indices,name);objects.append(part)
                lo,hi=bounds(v.co for v in part.data.vertices)
                inventory.append(dict(id=name,source=source,role=source,vertices=len(part.data.vertices),
                    faces=len(part.data.polygons),quads=sum(len(f.vertices)==4 for f in part.data.polygons),min=lo,max=hi))
        for obj in imported_meshes:bpy.data.objects.remove(obj,do_unlink=True)
    if len(inventory)>4096:raise ValueError('Too many loose components; choose a cleaner candidate')
    export(objects,out/'components.fbx')
    return dict(operation='analyze',components=inventory)


def inventory(p, base):
    objects=imported(base/p['production']['inventory']['path']);lookup={o.name:o for o in objects}
    expected={c['id'] for c in p['production']['components']}
    if set(lookup)!=expected:raise ValueError('Component identities changed during FBX import')
    return lookup


def guides(objects, out, prefix):
    """Orthographic front/back clay + wire guides share one framing and scale."""
    scene=bpy.context.scene
    scene.render.engine='BLENDER_WORKBENCH';scene.render.resolution_x=1024;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.film_transparent=True
    scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL'
    scene.display.shading.show_shadows=False;scene.display.shading.show_cavity=True
    scene.world.color=(1,1,1)
    all_meshes=[o for o in scene.objects if o.type=='MESH']
    hidden={o:o.hide_render for o in all_meshes}
    for o in all_meshes:o.hide_render=True
    clay=bpy.data.materials.new('GuideClay');clay.diffuse_color=(.7,.7,.7,1)
    black=bpy.data.materials.new('GuideWire');black.diffuse_color=(.05,.05,.05,1)
    lo,hi=map(Vector,bounds(v.co for o in objects for v in o.data.vertices));center=(lo+hi)*.5;size=hi-lo
    copies=[]
    for source in objects:
        obj=source.copy();obj.data=source.data.copy();scene.collection.objects.link(obj);obj.hide_render=False;obj.data.materials.clear();obj.data.materials.append(clay);copies.append(obj)
        wire=obj.copy();wire.data=obj.data.copy();scene.collection.objects.link(wire);wire.data.materials.clear();wire.data.materials.append(black)
        mod=wire.modifiers.new('Guide edges','WIREFRAME');mod.thickness=max(size)*.0006;mod.use_replace=True;copies.append(wire)
    camera=bpy.data.objects.new('GuideCamera',bpy.data.cameras.new('GuideCamera'));scene.collection.objects.link(camera);scene.camera=camera
    camera.data.type='ORTHO';camera.data.ortho_scale=max(size.x,size.z,1e-5)*1.12;camera.data.clip_start=.00001;camera.data.clip_end=max(size)*20+10
    for view,sign in [('front',-1),('back',1)]:
        camera.location=center+Vector((0,sign*(max(size)*3+1),0));camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler()
        scene.render.filepath=str(out/f'{prefix}-{view}.png');bpy.ops.render.render(write_still=True)
    for o in copies+[camera]:bpy.data.objects.remove(o,do_unlink=True)
    for o,value in hidden.items():o.hide_render=value


def prepare(p, base, out):
    lookup=inventory(p,base);report=[]
    for group in p['production']['textureGroups']:
        objects=[lookup[c] for c in group['components']];name=group['id']
        faces=[f for o in objects for f in o.data.polygons]
        if sum(len(f.vertices)-2 for f in faces)>80000 or all(len(f.vertices)==4 for f in faces) and len(faces)>40000:
            raise ValueError('Smart UV polygon limit exceeded: '+name)
        export_texture_group(objects,name,out/f'{name}.fbx');guides(objects,out,name)
        if (out/f'{name}.fbx').stat().st_size>150*1024**2:raise ValueError('Tripo upload exceeds 150 MB: '+name)
        report.append(dict(id=name,file=f'{name}.fbx',front=f'{name}-front.png',back=f'{name}-back.png'))
    return dict(operation='prepare',groups=report)


def export_texture_group(objects, name, path):
    """One mesh object per texture upload; retain disconnected parts and source data."""
    before=set(bpy.data.objects);before_meshes=set(bpy.data.meshes)
    try:
        copies=[]
        for source in objects:
            obj=source.copy();obj.data=source.data.copy()
            bpy.context.scene.collection.objects.link(obj);copies.append(obj)
        export([join(copies,name)],path)
    finally:
        for obj in set(bpy.data.objects)-before:bpy.data.objects.remove(obj,do_unlink=True)
        for mesh in set(bpy.data.meshes)-before_meshes:
            if mesh.users==0:bpy.data.meshes.remove(mesh)


def restore_uv(originals, returned, rotation=(0,0,0)):
    """Match surfaces, not vertex order. Keep the exact original polygon topology.
    UV seam vertex duplication is supported. Ambiguous coincident faces are rejected.
    Returned positions allow twice the original coordinate-cluster tolerance.
    The caller explicitly supplies any export-axis correction; symmetric geometry
    cannot establish which side is front, so rotations are never guessed.
    """
    matrix=Euler([math.radians(x) for x in rotation],'XYZ').to_matrix()
    refs=[(o,v) for o in originals for v in o.data.vertices]
    points=[v.co.copy() for _,v in refs]
    lo,hi=map(Vector,bounds(points));rlo,rhi=map(Vector,bounds(matrix@v.co for o in returned for v in o.data.vertices))
    span=hi-lo;rspan=rhi-rlo;tolerance=max(span.length*1e-5,1e-7)
    # Relax return matching only; merging more original coordinates can collapse distinct faces.
    match_tolerance=tolerance*2
    if any(span[i]>tolerance and rspan[i]<1e-10 for i in range(3)):raise ValueError('Returned geometry collapsed')
    scale=Vector([span[i]/rspan[i] if rspan[i]>1e-10 else 1 for i in range(3)])
    kd=kdtree.KDTree(len(points))
    for i,v in enumerate(points):kd.insert(v,i)
    kd.balance()
    # Faces are keyed by coordinate clusters, allowing duplicate vertices on UV seams.
    clusters=[]
    for point in points:
        near=kd.find_range(point,tolerance);clusters.append(min(index for _,index,_ in near))
    ids={(o.name,v.index):clusters[i] for i,(o,v) in enumerate(refs)}
    faces={}
    for o in originals:
        for f in o.data.polygons:
            key=tuple(sorted(ids[o.name,i] for i in f.vertices))
            if key in faces:raise ValueError('Coincident faces are ambiguous; separate this texture group')
            faces[key]=(o,f)
    uv_values={};materials={};max_error=0
    for o in returned:
        layer=o.data.uv_layers.active
        if not layer:raise ValueError('Returned FBX has no UV map')
        mapped={}
        for v in o.data.vertices:
            transformed=matrix@v.co;point=Vector([(transformed[i]-rlo[i])*scale[i]+lo[i] for i in range(3)])
            _,index,error=kd.find(point);max_error=max(max_error,error)
            if error>match_tolerance:raise ValueError(f'Returned shape does not match the original ({error:g} > {match_tolerance:g}); check upload/export rotation')
            mapped[v.index]=clusters[index]
        for f in o.data.polygons:
            order=tuple(mapped[i] for i in f.vertices);key=tuple(sorted(order))
            if key not in faces or key in uv_values:raise ValueError('Returned topology changed or contains duplicate faces; export quads without remeshing')
            original,face=faces[key];original_order=tuple(ids[original.name,i] for i in face.vertices)
            if not any(order==original_order[i:]+original_order[:i] for i in range(len(original_order))):
                raise ValueError('Returned face winding or vertex order changed')
            if f.material_index>=len(o.data.materials) or not o.data.materials[f.material_index]:raise ValueError('Missing texture material')
            values=[layer.data[li].uv.copy() for li in f.loop_indices]
            if any(not math.isfinite(value) for uv in values for value in uv):raise ValueError('Returned UV contains non-finite values')
            uv_values[key]={mapped[o.data.loops[li].vertex_index]:uv for li,uv in zip(f.loop_indices,values)}
            materials[key]=o.data.materials[f.material_index]
    if set(uv_values)!=set(faces):raise ValueError('Returned mesh is missing surfaces')
    used=set(materials.values());base_images=set()
    for mat in used:
        if not mat.use_nodes:raise ValueError('Returned material has no texture')
        shaders=[n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED']
        links=[l.from_node for n in shaders for l in n.inputs['Base Color'].links]
        images=[n.image for n in links if n.type=='TEX_IMAGE' and n.image]
        if len(images)!=1 or tuple(images[0].size)!=(4096,4096):raise ValueError('Each group must have one 4K base-color texture')
        base_images.update(images)
    if len(base_images)!=1:raise ValueError('One texture group must use one base-color image')
    for o in originals:
        o.data.materials.clear()
        for mat in used:o.data.materials.append(mat)
        while o.data.uv_layers:o.data.uv_layers.remove(o.data.uv_layers[0])
        layer=o.data.uv_layers.new(name='UVMap')
        for f in o.data.polygons:
            key=tuple(sorted(ids[o.name,i] for i in f.vertices));f.material_index=list(o.data.materials).index(materials[key])
            for li in f.loop_indices:layer.data[li].uv=uv_values[key][ids[o.name,o.data.loops[li].vertex_index]]
    return dict(maxError=max_error,tolerance=match_tolerance,clusterTolerance=tolerance,faces=len(faces),scale=list(scale),rotation=list(rotation))


def join(objects, name):
    if not objects:raise ValueError('Missing required anatomical group: '+name)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    if len(objects)>1:bpy.ops.object.join()
    objects[0].name=name;return objects[0]


def assemble(p, base, out):
    w=p['production'];lookup=inventory(p,base);restoration=[]
    for g in w['textureGroups']:
        returned=imported(base/g['returned']['path'])
        result=restore_uv([lookup[c] for c in g['components']],returned,g['returned'].get('rotation',[0,0,0]))
        restoration.append(dict(id=g['id'],**result))
        for o in returned:bpy.data.objects.remove(o,do_unlink=True)
    grouped={'body':[],'head_neutral':[],'hair':[]};spring_objects=[];reserved=set()
    by_id={c['id']:c for c in w['components']}
    for i,g in enumerate(w['springGroups']):
        role='hair' if by_id[g['components'][0]]['source']=='head' else 'body'
        name=f'Spring_{i+1:02}_{g["id"][:40]}'
        grouped[role].append(join([lookup[c] for c in g['components']],name));reserved.update(g['components'])
        if role=='body':spring_objects.append(dict(name=name,kind=g['kind'],separated=True))
    for role,name in [('body','Body'),('head','Head'),('hair','Hair')]:
        objects=[lookup[c['id']] for c in w['components'] if c['role']==role and c['id'] not in reserved]
        if objects:grouped['head_neutral' if role=='head' else role].append(join(objects,name))
    if not any(o.name=='Body' for o in grouped['body']) or not grouped['head_neutral']:raise ValueError('Classify a head and a non-spring body before assembly')
    meshes=[obj for objects in grouped.values() for obj in objects]
    materials=module('production_mtoon',ROOT/'scripts/mtoon-export.py').apply_mtoon(meshes)
    models=[]
    for role,objects in grouped.items():
        if not objects:continue
        source='body' if role=='body' else 'head';candidate=w.get('segmented',{}).get(source) or next(c for c in w['candidates'][source] if c['id']==w['selected'][source])
        export(objects,out/f'{role}.fbx');models.append(dict(role=role,file=f'{role}.fbx',normalization=candidate['normalization']))
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'assembly.blend'),copy=True)
    return dict(operation='assemble',models=models,springObjects=spring_objects,restoration=restoration,materials=materials)


def run(args):
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    if args[0]=='measure':
        objects=imported(Path(args[1]));lo,hi=map(Vector,bounds(v.co for o in objects for v in o.data.vertices))
        height=1.45 if args[2]=='body' else .30
        if hi.z-lo.z<1e-8:raise ValueError('Model has no height')
        scale=height/(hi.z-lo.z);c=(lo+hi)*.5
        Path(args[3]).write_text(json.dumps(dict(scale=scale,offset=[-c.x*scale,-c.z*scale,c.y*scale],height=height)),encoding='utf-8');return
    operation,source,destination=args;out=Path(destination).resolve();out.mkdir(parents=True,exist_ok=True)
    unpacker=module('production_unpack',ROOT/'skills/charakit-project/scripts/unpack.py')
    base=out/'source';unpacker.unpack(source,base);p=json.loads((base/'project.json').read_text(encoding='utf-8'))
    # Entry points validate the complete production contract with the shared JS validator.
    result={'analyze':analyze,'prepare':prepare,'assemble':assemble}[operation](p,base,out)
    (out/'result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')


if __name__=='__main__':run(sys.argv[sys.argv.index('--')+1:])
