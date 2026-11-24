"""Inventory or separate Astra-selected loose components; never infer semantics or cut surfaces.
Run Blender --background --factory-startup --python this.py -- config.json.
"""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
import bpy
from mathutils import Matrix


def module(name, path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m


def run(config):
    root=Path(__file__).resolve().parents[1]
    guide=module('spring_components',root/'skills/avatar-weight-transfer/scripts/from_guide.py')
    project=Path(config['project']).resolve();p=json.loads(project.read_text(encoding='utf-8'))
    if p['mode']!='parts':raise ValueError('Use an unrigged parts kit')
    body=next(a for a in p['assets'] if a['role']=='body')
    out=Path(config['output_dir']).resolve();out.mkdir(parents=True,exist_ok=False)
    bpy.context.window.scene=bpy.data.scenes.new('SpringReview')
    loaded=guide.importer.import_models(project,{'body'})
    collection=bpy.data.collections[loaded['collection']]
    meshes=sorted((o for o in collection.objects if o.type=='MESH'),key=lambda o:o.name)
    if not meshes or any(o.find_armature() or o.data.shape_keys for o in meshes):raise ValueError('Use unrigged neutral body geometry')
    module('spring_mtoon',root/'scripts/mtoon-export.py').apply_mtoon(meshes)
    placement=next(o.matrix_world.copy() for o in collection.objects if o.type=='EMPTY' and o.name.startswith('body'))
    inventory=[];lookup={}
    for i,obj in enumerate(meshes):
        parts=[]
        for j,ids in enumerate(guide.components(obj)):
            key=f'body:{i}:{j}';parts.append((key,ids))
            inventory.append(dict(id=key,object=obj.name,vertices=len(ids),**guide.bounds([obj.matrix_world@obj.data.vertices[v].co for v in ids])))
        lookup[obj.name]=parts
    (out/'components.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2),encoding='utf-8')
    if config.get('inventory_only'):
        bpy.ops.wm.save_as_mainfile(filepath=str(out/'inventory.blend'),copy=True)
        return
    groups=config.get('groups')
    if not isinstance(groups,list):raise ValueError('Explicit groups required, including [] if reviewed and none')
    names=[g['name'] for g in groups];ids=[c for g in groups for c in g['components']]
    if len(names)!=len(set(names)) or any(not n or len(n.encode('utf-8'))>60 or n=='Body' or any(c in n for c in '/\\\n\r') for n in names):raise ValueError('Use unique descriptive names, excluding Body')
    if len(ids)!=len(set(ids)) or not set(ids)<={v['id'] for v in inventory}:raise ValueError('Unknown or duplicate component selection')
    if any(g.get('kind') not in ('skirt','ribbon','strap','other') or not g['components'] for g in groups):raise ValueError('Each group needs a kind and components')
    # Retain only whole connected components. No boundary cutting, remeshing or weight changes.
    parked={}
    for obj in meshes:
        for piece in guide.split_selected(obj,lookup[obj.name],set(ids),collection):parked[piece['springPart']]=piece
    def join(objects,name):
        if not objects:raise ValueError('Body cannot be empty')
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:bpy.ops.object.join()
        obj=objects[0];obj.name=name
        if obj.name!=name:raise ValueError('Object name conflicts: '+name)
        return obj
    # Free imported names before assigning the reviewed names.
    for i,obj in enumerate([*meshes,*parked.values()]):obj.name='__separation_'+str(i)
    result=[join([o for o in meshes if len(o.data.vertices)],'Body')]
    for group in groups:
        obj=join([parked[c] for c in group['components']],group['name']);obj['pendingSpringSetup']=True;result.append(obj)
    # Preserve the original asset coordinate frame so saved normalization/placement stays valid.
    for obj in result:
        obj.data.transform(placement.inverted()@obj.matrix_world);obj.parent=None;obj.matrix_world=Matrix.Identity(4)
    bpy.context.view_layer.update();bpy.ops.object.select_all(action='DESELECT')
    for obj in result:obj.select_set(True)
    target=out/'body.fbx'
    bpy.ops.export_scene.fbx(filepath=str(target),use_selection=True,object_types={'MESH'},use_mesh_modifiers=False,
        bake_anim=False,add_leaf_bones=False,path_mode='COPY',embed_textures=True,axis_forward='-Z',axis_up='Y',
        bake_space_transform=True,apply_scale_options='FBX_SCALE_ALL')
    report=dict(sourceHash=body['sha256'],outputHash=hashlib.sha256(target.read_bytes()).hexdigest(),bodyObject='Body',
        springObjects=[dict(name=g['name'],kind=g['kind'],separated=True) for g in groups])
    (out/'separation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    backup=out/'backups';backup.mkdir();bpy.ops.wm.save_as_mainfile(filepath=str(backup/'separated.blend'),copy=True)
    print(json.dumps(report,ensure_ascii=False))


if __name__=='__main__':run(json.loads(Path(sys.argv[sys.argv.index('--')+1]).read_text(encoding='utf-8')))
