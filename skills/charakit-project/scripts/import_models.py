"""Import a validated v4 project into a new Blender collection, preserving FBX polygons.
Run with PROJECT_JSON set to the extracted project.json; never replaces existing objects.
"""
import json
from pathlib import Path
import bpy
from mathutils import Matrix, Vector, Euler
from math import radians


def import_models(project_path, roles=None):
    path = Path(project_path).resolve()
    p = json.loads(path.read_text(encoding='utf-8'))
    # Reuse the archive validator; callers must unpack with unpack.py first.
    import importlib.util
    spec = importlib.util.spec_from_file_location('charakit_unpack', Path(__file__).with_name('unpack.py'))
    validator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validator)
    validator.validate(p)
    import hashlib
    for a in p['assets']:
        for item in [a] + a.get('resources', []):
            target = path.parent / item['path']
            if not target.resolve().is_relative_to(path.parent) or hashlib.sha256(target.read_bytes()).hexdigest() != item['sha256']:
                raise ValueError('Missing or changed original: ' + item['path'])
    assets = ([a for a in p['assets'] if a['path'] == p['updatedModel']['path'] or (p.get('workflow', {}).get('attachHair') and a['role'] == 'hair')]
              if p['mode'] == 'assembled' else [a for a in p['assets'] if a['role'] in {'body', 'hair', 'head_neutral'}])
    if roles is not None:
        assets = [a for a in assets if a['role'] in roles]
    collection = bpy.data.collections.new('CharaKit_Models_' + p['id'] + '_r' + str(p['revision']))
    bpy.context.scene.collection.children.link(collection)
    collection['project_id'] = p['id']
    collection['revision'] = p['revision']
    report = []
    # FBX importer scales by the scene unit setting. Normalize to meters temporarily.
    unit_scale = bpy.context.scene.unit_settings.scale_length
    try:
        bpy.context.scene.unit_settings.scale_length = 1.0
        for a in assets:
            before = set(bpy.data.objects)
            bpy.ops.import_scene.fbx(filepath=str(path.parent / a['path']), use_image_search=False, use_anim=False)
            added = set(bpy.data.objects) - before
            roots = [o for o in added if o.parent not in added]
            t = p['placements'].get('head' if a['role'].startswith('head_') else a['role'],
                                    dict(position=[0, 0, 0], rotation=[0, 0, 0], scale=1))
            matrix = (Matrix.Translation(Vector(t['position'])) @
                      Euler([radians(v) for v in t['rotation']], 'XYZ').to_matrix().to_4x4() @
                      Matrix.Scale(t['scale'], 4))
            if p['mode'] == 'parts' or a['role'] == 'hair':
                n = a['normalization']
                x, y, z = n['offset']  # Three.js Y-up meters -> Blender Z-up meters.
                matrix = matrix @ Matrix.Translation((x, -z, y)) @ Matrix.Scale(n['scale'], 4)
            group = bpy.data.objects.new(a['role'], None)
            collection.objects.link(group)
            group['charakitRole'] = a['role']
            group['assetPath'] = a['path']
            group.matrix_world = matrix
            for obj in added:
                for old in list(obj.users_collection):
                    old.objects.unlink(obj)
                collection.objects.link(obj)
                obj['charakitRole'] = a['role']
                obj['assetPath'] = a['path']
            for obj in roots:
                original_world = obj.matrix_world.copy()
                obj.parent = group
                obj.matrix_parent_inverse = Matrix.Identity(4)
                obj.matrix_basis = original_world
            if a['role'].startswith('head_') and a['role'] != 'head_neutral':
                for obj in added:
                    obj.hide_set(True)
                    obj.hide_render = True
            meshes = [o for o in added if o.type == 'MESH']
            report.append(dict(role=a['role'], meshes=len(meshes),
                               faces=sum(len(o.data.polygons) for o in meshes),
                               quads=sum(len(f.vertices) == 4 for o in meshes for f in o.data.polygons)))
    finally:
        bpy.context.scene.unit_settings.scale_length = unit_scale
    bpy.context.view_layer.update()
    return dict(collection=collection.name, assets=report)


if 'PROJECT_JSON' in globals():
    print(json.dumps(import_models(PROJECT_JSON), ensure_ascii=False))
