"""Export both adopted candidates as triangulated GLBs for Tripo segmentation."""
import sys, json, tempfile, importlib.util
from pathlib import Path
import bpy
ROOT=Path(__file__).resolve().parents[1]
def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
def run(source,destination):
    out=Path(destination).resolve();out.mkdir(parents=True,exist_ok=True)
    unpacker=module('segment_unpack',ROOT/'skills/charakit-project/scripts/unpack.py')
    production=module('segment_production',ROOT/'scripts/production.py')
    with tempfile.TemporaryDirectory(prefix='charakit-segment-') as temp:
        base=Path(temp)/'source';unpacker.unpack(source,base);p=json.loads((base/'project.json').read_text(encoding='utf-8'))
        for part in ('head','body'):
            w=p['production'];candidate=next(c for c in w['candidates'][part] if c['id']==w['selected'][part])
            bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
            objects=production.imported(base/candidate['path'])
            bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:
                obj.select_set(True);bpy.context.view_layer.objects.active=obj
                mod=obj.modifiers.new('SegmentationTriangles','TRIANGULATE');bpy.ops.object.modifier_apply(modifier=mod.name)
            bpy.ops.export_scene.gltf(filepath=str(out/(part+'.glb')),export_format='GLB',use_selection=True,export_yup=True)
if __name__=='__main__':run(*sys.argv[sys.argv.index('--')+1:])
