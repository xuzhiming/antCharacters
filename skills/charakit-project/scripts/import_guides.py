"""Run inside Blender after setting PROJECT_JSON to the unpacked project.json."""
import json
from pathlib import Path
import bpy

if 'PROJECT_JSON' not in globals():
    raise RuntimeError('Set PROJECT_JSON to the absolute project.json path before running')
p = json.loads(Path(PROJECT_JSON).read_text(encoding='utf-8'))
if p.get('format') != 'charakit' or p.get('version') != 4:
    raise ValueError('Unpack and validate the .charakit first')
collection = bpy.data.collections.new('CharaKit_Guides')
bpy.context.scene.collection.children.link(collection)
collection['project_id'] = p['id']
collection['revision'] = p['revision']
collection['coordinate_system'] = 'meter / Blender world Z-up front -Y'
for name, marker in p['markers'].items():
    obj = bpy.data.objects.new('Guide_' + name, None)
    obj.empty_display_type = 'SPHERE'
    obj.empty_display_size = .012
    obj.location = marker['position']
    obj.show_in_front = True
    obj['marker_id'] = name
    collection.objects.link(obj)
for spring in p['springs']:
    curve = bpy.data.curves.new('Path_' + spring['name'], 'CURVE')
    curve.dimensions = '3D'
    spline = curve.splines.new('POLY')
    spline.points.add(len(spring['points']) - 1)
    for point, co in zip(spline.points, spring['points']):
        point.co = (*co, 1)
    obj = bpy.data.objects.new('SpringGuide_' + spring['name'], curve)
    obj['spring_id'] = spring['id']
    obj['kind'] = spring['kind']
    obj.show_in_front = True
    collection.objects.link(obj)
print('Imported guides only:', len(p['markers']), 'joints,', len(p['springs']), 'spring paths')
