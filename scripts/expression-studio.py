"""Blender expression helpers: skin-mask blink foundation and visual mesh finishing."""
import contextlib
import datetime
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys
import uuid

import bpy
from mathutils import Matrix, Vector

EXPRESSIONS = {'aa': 'Aa', 'blink': 'Blink', 'happy': 'Smile'}
ANGLES = {'Front': 0, 'Oblique45': 45, 'Profile90': 90, 'Other45': -45}
LIVE = None


def write(path, value):
    temp = Path(path).with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf8')
    temp.replace(path)


def signature(obj, existing):
    mesh = obj.data
    keys = mesh.shape_keys.key_blocks if mesh.shape_keys else []
    basis = keys[0].data if keys else mesh.vertices
    value = [list(map(list, obj.matrix_world)), [list(v.co) for v in basis],
             [list(p.vertices) for p in mesh.polygons], [p.material_index for p in mesh.polygons],
             [[list(v.uv) for v in layer.data] for layer in mesh.uv_layers],
             [(s.link, s.material.name if s.material else None) for s in obj.material_slots],
             {k.name: [list(v.co) for v in k.data] for k in keys if k.name in existing}]
    return hashlib.sha256(json.dumps(value).encode()).hexdigest()


def mtoon():
    spec = importlib.util.spec_from_file_location('expression_mtoon', Path(__file__).with_name('mtoon-export.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.enable_vrm()
    return module


class Studio:
    def __init__(self, directory):
        self.root = Path(directory).resolve()
        self.state = json.loads((self.root/'session.json').read_text(encoding='utf8'))
        self.preview_slots = None

    @property
    def objects(self):
        return [bpy.data.objects[n] for n in self.state['objects']]

    def record(self, event, **values):
        # Targets may be added from the image-generation side while Blender stays open.
        disk = json.loads((self.root/'session.json').read_text(encoding='utf8'))
        targets = self.root/'targets.json'
        self.state['targets'] = json.loads(targets.read_text(encoding='utf8')) if targets.exists() else disk.get('targets', self.state['targets'])
        with (self.root/'events.jsonl').open('a', encoding='utf8') as out:
            out.write(json.dumps(dict(at=datetime.datetime.now(datetime.timezone.utc).isoformat(), event=event, **values), ensure_ascii=False)+'\n')
        write(self.root/'session.json', self.state)

    def preview(self, enabled=True):
        if not enabled:
            if self.preview_slots is None:
                return
            data_slots, object_slots, created = self.preview_slots
            # Undo replaces datablocks. Keep names rather than stale RNA references.
            for name, materials in data_slots.items():
                mesh = bpy.data.meshes.get(name)
                if mesh is None:
                    continue
                assignments = [p.material_index for p in mesh.polygons]
                mesh.materials.clear()
                for mat in materials:
                    mesh.materials.append(bpy.data.materials.get(mat) if mat else None)
                for poly, index in zip(mesh.polygons, assignments):
                    poly.material_index = index
            for name, slots in object_slots.items():
                obj = bpy.data.objects.get(name)
                if obj is None:
                    continue
                for slot, (link, mat) in zip(obj.material_slots, slots):
                    slot.link, slot.material = link, bpy.data.materials.get(mat) if mat else None
            for name in created:
                mat = bpy.data.materials.get(name)
                if mat and mat.users == 0:
                    bpy.data.materials.remove(mat)
            self.preview_slots = None
            return
        if self.preview_slots is not None:
            return
        objects = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        data_slots = {o.data.name: [m.name if m else None for m in o.data.materials] for o in objects}
        object_slots = {o.name: [(s.link, s.material.name if s.material else None) for s in o.material_slots] for o in objects}
        created, clones = [], {}
        self.preview_slots = data_slots, object_slots, created
        try:
            def clone(mat):
                if mat not in clones:
                    c = mat.copy() if mat else bpy.data.materials.new('EA_Display')
                    clones[mat] = c
                    created.append(c.name)
                return clones[mat]
            for name, mats in data_slots.items():
                mesh = bpy.data.meshes[name]
                if not mats:
                    mesh.materials.append(clone(None))
                for i, mat in enumerate(mats):
                    mesh.materials[i] = clone(bpy.data.materials.get(mat) if mat else None)
            for name, slots in object_slots.items():
                obj = bpy.data.objects[name]
                for i, (link, mat) in enumerate(slots):
                    if link == 'OBJECT':
                        obj.material_slots[i].material = clone(bpy.data.materials.get(mat) if mat else None)
            mtoon().apply_mtoon(objects)
        except Exception:
            self.preview(False)
            raise
        bpy.context.scene.view_settings.view_transform = 'Standard'
        for screen in bpy.data.screens:
            for area in screen.areas:
                if area.type == 'VIEW_3D':
                    area.spaces.active.shading.type = 'MATERIAL'

    def audit(self):
        editing = bpy.context.object and bpy.context.object.mode == 'EDIT'
        if editing:
            bpy.ops.object.mode_set(mode='OBJECT')
        preview = self.preview_slots is not None
        self.preview(False)
        try:
            for name, entry in self.state['original'].items():
                obj = bpy.data.objects.get(name)
                if obj is None or signature(obj, entry['keys']) != entry['signature']:
                    raise ValueError('Confirm that the Basis, existing keys, faces, UVs and materials are preserved: '+name)
            return {'invariants_preserved': True}
        finally:
            if preview:
                self.preview()
            if editing:
                bpy.ops.object.mode_set(mode='EDIT')

    def expression(self, expression, strength=1, combination=None):
        editing = bpy.context.object and bpy.context.object.mode == 'EDIT'
        if editing:
            bpy.ops.object.mode_set(mode='OBJECT')
        values = combination or {expression: strength}
        for obj in self.objects:
            for e, key in self.state['keys'].items():
                obj.data.shape_keys.key_blocks[key[obj.name]].value = values.get(e, 0)
            if expression in self.state['keys']:
                obj.active_shape_key_index = obj.data.shape_keys.key_blocks.find(self.state['keys'][expression][obj.name])
        bpy.context.view_layer.update()
        if editing:
            bpy.ops.object.mode_set(mode='EDIT')

    def include_object(self, obj):
        """Include separately connected lashes in editing, capture and export."""
        if obj.name in self.state['objects']:
            return
        self.preview(False)
        if obj.name not in self.state['original']:
            existing = [k.name for k in obj.data.shape_keys.key_blocks] if obj.data.shape_keys else []
            self.state['original'][obj.name] = dict(keys=existing, signature=signature(obj, existing))
        if not obj.data.shape_keys:
            obj.shape_key_add(name='Basis')
        for e in self.state['keys']:
            key = obj.shape_key_add(name='EA_'+e, from_mix=False); key.value = 0
            self.state['keys'][e][obj.name] = key.name
        self.state['objects'].append(obj.name)

    def ensure_expression(self, expression):
        if not expression or not all(c.isalnum() or c == '_' for c in expression):
            raise ValueError('Use a nonempty expression identifier with letters, digits or underscores.')
        bindings = self.state['keys'].setdefault(expression, {})
        for obj in self.objects:
            if obj.name not in bindings:
                key = obj.shape_key_add(name='EA_'+expression, from_mix=False); key.value = 0
                bindings[obj.name] = key.name
        return bindings

    def transfer_helper(self):
        spec = importlib.util.spec_from_file_location('expression_transfer', Path(__file__).with_name('expression-transfer.py'))
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        return module

    def inspect_mesh(self, object_name):
        return self.transfer_helper().mesh_info(self, object_name)

    def mouth_paths(self, object_name, skin_seed, corners, upper, lower):
        return self.transfer_helper().boundary_paths(self, object_name, skin_seed, corners, upper, lower)

    def prepare_mouth(self, object_name, skin_seed, upper, lower, **options):
        return self.transfer_helper().prepare_mouth(self, object_name, skin_seed, upper, lower, **options)

    def transfer_mouth(self, expressions=None, reviewed=False):
        return self.transfer_helper().transfer_mouth(self, expressions, reviewed)

    def capture_mouth_fit(self, angles=None):
        return self.transfer_helper().capture_mouth_fit(self, angles)

    def prepare_brows(self, selections, **options):
        return self.transfer_helper().prepare_brows(self, selections, **options)

    def transfer_brows(self, expressions=None, reviewed=False):
        return self.transfer_helper().transfer_brows(self, expressions, reviewed)

    def transfer_eyes(self, expressions=None, reviewed=False):
        return self.mask_helper().transfer(self, reviewed, expressions or list(self.mask_helper().asset()['poses']))

    def mask_helper(self):
        spec = importlib.util.spec_from_file_location('expression_mask', Path(__file__).with_name('expression-mask.py'))
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        return module

    def prepare_blink(self, object_name, skin_seed=None, config=None, reset=False):
        self.expression('blink', 0)
        bpy.context.scene.ea_mask_reviewed = False
        return self.mask_helper().prepare(self, object_name, skin_seed, config, reset)

    def set_blink_points(self, points, space='WORLD'):
        bpy.context.scene.ea_mask_reviewed = False
        return self.mask_helper().set_points(self, points, space)

    def set_blink_pixels(self, points, angle='Front', snap_pixels=None):
        result = self.mask_helper().project_pixels(self, points, angle, snap_pixels)
        self.set_blink_points({name:row['world'] for name,row in result.items()})
        self.state['mask']['pixel_projection'] = result
        self.record('mask_pixels_set', angle=angle)
        return result

    def list_blink_parts(self, objects=None):
        return self.mask_helper().parts(self, objects)

    def set_blink_followers(self, selections):
        bpy.context.scene.ea_mask_reviewed = False
        return self.mask_helper().set_followers(self, selections)

    def capture_blink_parts(self, objects=None, angles=None):
        return self.mask_helper().capture_parts(self, objects, angles)

    def select_blink_part(self, object_name, seed):
        return self.mask_helper().select_part(self, object_name, seed)

    def edit_blink_mask(self):
        if bpy.context.object and bpy.context.object.mode == 'EDIT':
            bpy.ops.object.mode_set(mode='OBJECT')
        mask = bpy.data.objects['EA_MaskSkin']; mask.hide_set(False); mask.hide_select = False
        for obj in bpy.context.selected_objects:
            obj.select_set(False)
        mask.select_set(True); bpy.context.view_layer.objects.active = mask
        mask.active_shape_key_index = 0; mask.data.shape_keys.key_blocks['blink'].value = 0
        bpy.ops.object.mode_set(mode='EDIT')
        return mask

    def commit_mask_adjustment(self):
        bpy.context.scene.ea_mask_reviewed = False
        return self.mask_helper().commit_adjustment(self)

    def reset_mask_adjustment(self):
        bpy.context.scene.ea_mask_reviewed = False
        return self.mask_helper().reset_adjustment(self)

    def fit_blink(self):
        bpy.context.scene.ea_mask_reviewed = False
        return self.mask_helper().fit(self)

    def capture_fit(self, angles=None):
        return self.mask_helper().capture_fit(self, angles)

    def transfer_blink(self, reviewed=False):
        self.preview(False)
        return self.mask_helper().transfer(self, reviewed)

    def frame(self):
        c = self.state['camera']
        front = Vector(c['front']).normalized()
        up = Vector(c['up']); up = (up-front*up.dot(front)).normalized()
        return Vector(c['center']), front, up, up.cross(front), c['ortho_scale']

    def frame_view(self):
        """Put the editable face on screen; photographic cameras use this same frame."""
        center, front, up, right, scale = self.frame()
        if not bpy.context.screen:
            return
        for area in bpy.context.screen.areas:
            for space in area.spaces:
                if space.type != 'VIEW_3D':
                    continue
                space.region_3d.view_rotation = Matrix((right, up, front)).transposed().to_quaternion()
                space.region_3d.view_location = center
                space.region_3d.view_distance = scale
                space.region_3d.view_perspective = 'ORTHO'
                space.overlay.show_floor = False
                if hasattr(space.overlay, 'show_bones'):
                    space.overlay.show_bones = False

    @contextlib.contextmanager
    def photography(self, display):
        scene = bpy.context.scene
        obj = bpy.context.object
        mode = obj.mode if obj else 'OBJECT'
        if mode == 'EDIT':
            bpy.ops.object.mode_set(mode='OBJECT')
        old = (scene.camera, scene.render.engine, scene.render.filepath,
               scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage,
               scene.render.image_settings.file_format, scene.world, scene.view_settings.view_transform,
               scene.view_settings.exposure, scene.view_settings.gamma)
        keys = [(o, o.show_only_shape_key, o.use_shape_key_edit_mode, o.active_shape_key_index,
                 [(k, k.value) for k in o.data.shape_keys.key_blocks]) for o in self.objects]
        hidden = [(o, o.hide_render) for o in scene.objects]
        markers = [(m, m.camera) for m in scene.timeline_markers]
        shading = scene.display.shading
        sh = {p: getattr(shading, p) for p in ['color_type', 'light', 'show_cavity']}
        preview = self.preview_slots is not None
        temp = []
        world = None
        try:
            for o, _, _, _, _ in keys:
                o.show_only_shape_key = False
                o.use_shape_key_edit_mode = False
            for marker, _ in markers:
                marker.camera = None
            for o, _ in hidden:
                if o.type == 'MESH':
                    o.hide_render = o.name not in self.state['render_objects']
                if o.type == 'LIGHT':
                    o.hide_render = True
            scene.view_settings.view_transform = 'Standard'
            scene.view_settings.exposure = 0; scene.view_settings.gamma = 1
            scene.render.resolution_x = scene.render.resolution_y = self.state['camera']['size']
            scene.render.resolution_percentage = 100
            scene.render.image_settings.file_format = 'PNG'
            if display in ['solid', 'wire', 'fit']:
                scene.render.engine = 'BLENDER_WORKBENCH'
                shading.color_type = 'OBJECT' if display == 'fit' else 'MATERIAL'; shading.light = 'STUDIO'; shading.show_cavity = True
            else:
                self.preview(display == 'mtoon')
                scene.render.engine = 'BLENDER_EEVEE'
            center, front, up, right, scale = self.frame()
            world = bpy.data.worlds.new('EA_PhotoWorld'); world.color = (.12, .12, .12); scene.world = world
            for energy, direction in [(2.5, -front-.22*up+.15*right), (.9, -front-.05*up-.8*right)]:
                data = bpy.data.lights.new('EA_PhotoLight', 'SUN'); data.energy = energy; data.use_shadow = False
                light = bpy.data.objects.new('EA_PhotoLight', data); scene.collection.objects.link(light)
                light.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler(); temp.append(light)
            data = bpy.data.cameras.new('EA_PhotoCamera'); camera = bpy.data.objects.new('EA_PhotoCamera', data)
            scene.collection.objects.link(camera); temp.append(camera)
            data.type = 'ORTHO'; data.ortho_scale = scale; scene.camera = camera
            yield camera
        finally:
            scene.camera, scene.render.engine, scene.render.filepath, scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage, scene.render.image_settings.file_format, scene.world, scene.view_settings.view_transform, scene.view_settings.exposure, scene.view_settings.gamma = old
            for marker, camera in markers:
                marker.camera = camera
            for o, value in hidden:
                o.hide_render = value
            for o, only, edit, index, values in keys:
                for k, value in values:
                    k.value = value
                o.show_only_shape_key, o.use_shape_key_edit_mode, o.active_shape_key_index = only, edit, index
            for p, value in sh.items():
                setattr(shading, p, value)
            for o in temp:
                data = o.data; bpy.data.objects.remove(o, do_unlink=True)
                (bpy.data.cameras if isinstance(data, bpy.types.Camera) else bpy.data.lights).remove(data)
            if world:
                bpy.data.worlds.remove(world)
            if not preview:
                self.preview(False)
            elif self.preview_slots is None:
                self.preview()
            bpy.context.view_layer.update()
            if mode == 'EDIT':
                bpy.ops.object.mode_set(mode='EDIT')

    def capture(self, expression=None, strength=1, display='mtoon', combination=None, label=None, angles=None):
        """Photograph the current unsaved mesh; no worker or saved-file reload."""
        if display not in ['mtoon', 'standard', 'solid', 'wire', 'fit']:
            raise ValueError('mtoon / standard / solid / wire')
        paths = []
        token = 'shot-'+uuid.uuid4().hex[:10]
        with self.photography(display) as camera:
            if expression or combination:
                self.expression(expression, strength, combination)
            center, front, up, right, scale = self.frame()
            wire = []
            if display == 'wire':
                # Render evaluated edges without adding modifiers to the user's mesh.
                for obj in self.objects:
                    if obj.hide_render:
                        continue
                    deps = bpy.context.evaluated_depsgraph_get(); evaluated = obj.evaluated_get(deps); mesh = evaluated.to_mesh()
                    try:
                        points = [obj.matrix_world@v.co for v in mesh.vertices]
                        curve = bpy.data.curves.new('EA_PhotoWire', 'CURVE'); curve.dimensions = '3D'; curve.bevel_depth = scale*.0003; curve.bevel_resolution = 0
                        for edge in mesh.edges:
                            spline = curve.splines.new('POLY'); spline.points.add(1)
                            for p, i in zip(spline.points, edge.vertices):
                                p.co = (*points[i], 1)
                        overlay = bpy.data.objects.new('EA_PhotoWire', curve); bpy.context.scene.collection.objects.link(overlay)
                        overlay.color = (.015, .015, .02, 1); wire.append(overlay)
                    finally:
                        evaluated.to_mesh_clear()
                bpy.context.scene.display.shading.color_type = 'OBJECT'
            try:
                for angle in angles or ['Front']:
                    rad = math.radians(ANGLES[angle]); direction = front*math.cos(rad)+right*math.sin(rad)
                    camera.location = center+direction*scale*3
                    camera.rotation_euler = Matrix((up.cross(direction), up, direction)).transposed().to_euler()
                    relative = f'captures/{token}-{angle}.png'
                    bpy.context.scene.render.filepath = str(self.root/relative)
                    bpy.context.view_layer.update(); bpy.ops.render.render(write_still=True)
                    paths.append(relative)
            finally:
                for o in wire:
                    curve = o.data; bpy.data.objects.remove(o, do_unlink=True); bpy.data.curves.remove(curve)
        shot = dict(label=label or expression or 'current', expression=expression, strength=strength,
                    display=display, combination=combination, paths=paths)
        self.state['captures'].append(shot); self.record('capture', **shot)
        return shot

    def suite(self, expression):
        # Use during finishing; ordinary correction needs just one four-view capture.
        for value in [0, .25, .5, .75, 1]:
            self.capture(expression, value, angles=list(ANGLES))
        self.capture(expression, display='solid', angles=list(ANGLES)); self.capture(expression, display='wire', angles=list(ANGLES))

    def note(self, difference, change='', observation='', next_action='', assessment='needs_work'):
        note = dict(difference=difference, change=change, observation=observation, next_action=next_action, assessment=assessment)
        self.state['notes'].append(note); self.record('visual_note', **note)

    def save(self, export=False):
        editing = bpy.context.object and bpy.context.object.mode == 'EDIT'
        if editing:
            bpy.ops.object.mode_set(mode='OBJECT')
        preview = self.preview_slots is not None; self.preview(False)
        try:
            self.audit()
            bpy.ops.wm.save_as_mainfile(filepath=str(self.root/'current.blend'))
            if export:
                bpy.ops.wm.save_as_mainfile(filepath=str(self.root/'exports/expressions.blend'), copy=True)
                selected = list(bpy.context.selected_objects); active = bpy.context.view_layer.objects.active
                hidden = {o:o.hide_get() for o in self.objects}
                for o in selected:
                    o.select_set(False)
                for o in self.objects:
                    o.hide_set(False)
                    o.select_set(True)
                try:
                    bpy.ops.export_scene.gltf(filepath=str(self.root/'exports/head-expressions.glb'), use_selection=True, export_morph=True, export_animations=False)
                finally:
                    for o in self.objects:
                        o.select_set(False)
                        o.hide_set(hidden[o])
                    for o in selected:
                        o.select_set(True)
                    bpy.context.view_layer.objects.active = active
                write(self.root/'exports/result.json', dict(version=2, source_sha256=self.state['source_sha256'], keys=self.state['keys'], audit={'invariants_preserved':True}, quality='ready_for_review', note='Agent assessment, not user approval. See comparisons and visual notes.'))
            self.record('save', export=export)
        finally:
            if preview:
                self.preview()
            if editing:
                bpy.ops.object.mode_set(mode='EDIT')


def attach(directory, objects=None, camera=None, keys=None):
    global LIVE
    if bpy.app.version < (5, 2, 0):
        raise ValueError('Open this in Blender 5.2 or later.')
    bpy.context.view_layer.update()
    root = Path(directory).resolve(); root.mkdir(parents=True, exist_ok=True)
    if LIVE:
        LIVE.preview(False)
    for folder in ['captures', 'targets', 'exports']:
        (root/folder).mkdir(exist_ok=True)
    if not (root/'session.json').exists():
        # Keep the saved working Blend usable when the project moves to another PC.
        for image in bpy.data.images:
            if image.source == 'FILE' and image.has_data and not image.packed_file:
                image.pack()
        meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        names = objects or [o.name for o in bpy.context.selected_objects if o.type == 'MESH']
        if not names or any(n not in {o.name for o in meshes} for n in names):
            raise ValueError('Select the target face, eye and eyelash meshes.')
        original = {o.name:dict(keys=[k.name for k in o.data.shape_keys.key_blocks] if o.data.shape_keys else []) for o in meshes}
        for o in meshes:
            original[o.name]['signature'] = signature(o, original[o.name]['keys'])
        points = [bpy.data.objects[n].matrix_world@Vector(c) for n in names for c in bpy.data.objects[n].bound_box]
        lo = Vector([min(p[i] for p in points) for i in range(3)]); hi = Vector([max(p[i] for p in points) for i in range(3)])
        source_keys = keys or {}
        keys = {e:{} for e in EXPRESSIONS}
        for name in names:
            obj = bpy.data.objects[name]
            if not obj.data.shape_keys:
                obj.shape_key_add(name='Basis')
            for e in EXPRESSIONS:
                source_key = obj.data.shape_keys.key_blocks.get(source_keys.get(e, {}).get(name, ''))
                key = obj.shape_key_add(name='EA_'+e, from_mix=False)
                key.value = 0
                if source_key:
                    for dest, source_vertex in zip(key.data, source_key.data):
                        dest.co = source_vertex.co
                keys[e][name] = key.name
        source = Path(bpy.data.filepath) if bpy.data.filepath else None
        state = dict(version=2, source_name=source.name if source else 'live', source_sha256=hashlib.sha256(source.read_bytes()).hexdigest() if source and source.is_file() else '0'*64,
                     objects=names, original=original, keys=keys, captures=[], targets={}, notes=[],
                     render_objects=[o.name for o in meshes], camera=camera or dict(center=list((lo+hi)/2), front=[0,-1,0], up=[0,0,1], ortho_scale=max(hi-lo)*1.15, size=640))
        write(root/'session.json', state)
    elif Path(bpy.data.filepath).resolve() not in [root/'current.blend', root/'exports/expressions.blend']:
        raise ValueError('Open current.blend in this production folder to resume.')
    LIVE = Studio(root)
    bpy.context.scene['expression_studio'] = str(root)
    bpy.context.scene.tool_settings.use_proportional_edit = True
    bpy.context.scene.tool_settings.use_proportional_connected = True
    LIVE.save()
    register()
    if not bpy.app.background:
        LIVE.preview()
        LIVE.frame_view()
    return LIVE


class EA_OT_capture(bpy.types.Operator):
    bl_idname = 'expression_studio.capture'; bl_label = 'Capture selected directions'; bl_description = 'Photograph the unsaved face being edited with the same camera'
    bl_options = {'REGISTER'}
    def execute(self, context):
        try:
            angles = list(ANGLES) if context.scene.ea_angle == 'ALL' else [context.scene.ea_angle]
            LIVE.capture(context.scene.ea_expression, context.scene.ea_strength, context.scene.ea_display, angles=angles)
            self.report({'INFO'}, 'Refresh the comparison view')
            return {'FINISHED'}
        except Exception as e:
            self.report({'ERROR'}, str(e)); return {'CANCELLED'}


class EA_OT_expression(bpy.types.Operator):
    bl_idname = 'expression_studio.expression'; bl_label = 'Switch to the expression being edited'; bl_options = {'UNDO'}
    strength: bpy.props.FloatProperty(default=-1)
    def execute(self, context):
        if self.strength >= 0:
            context.scene.ea_strength = self.strength
        LIVE.expression(context.scene.ea_expression, context.scene.ea_strength)
        return {'FINISHED'}


class EA_OT_mask(bpy.types.Operator):
    bl_idname = 'expression_studio.mask'; bl_label = 'Eye mask'; bl_options = {'REGISTER', 'UNDO'}
    action: bpy.props.StringProperty()
    point: bpy.props.StringProperty()
    object_name: bpy.props.StringProperty()
    seed: bpy.props.IntProperty()
    def execute(self, context):
        try:
            if context.object and context.object.mode != 'OBJECT':
                bpy.ops.object.mode_set(mode='OBJECT')
            if self.action == 'parts':
                if not context.object or context.object.type != 'MESH' or context.object.name.startswith('EA_'):
                    raise ValueError('Select the model mesh to inspect.')
                LIVE.list_blink_parts([context.object.name])
            elif self.action == 'parts_capture':
                names = list(dict.fromkeys(p['object'] for p in LIVE.state.get('parts', [])))
                LIVE.capture_blink_parts(names, [context.scene.ea_angle] if context.scene.ea_angle != 'ALL' else list(ANGLES))
            elif self.action == 'skin':
                LIVE.prepare_blink(self.object_name, self.seed)
            elif self.action == 'part_select':
                LIVE.select_blink_part(self.object_name, self.seed)
            elif self.action == 'follower':
                rows = [dict(object=f['object'],seed=f['seed']) for f in LIVE.state['mask']['followers']]
                selected = dict(object=self.object_name,seed=self.seed)
                rows.remove(selected) if selected in rows else rows.append(selected)
                LIVE.set_blink_followers(rows)
            elif self.action == 'fit':
                LIVE.fit_blink()
            elif self.action == 'fit_capture':
                LIVE.capture_fit([context.scene.ea_angle] if context.scene.ea_angle != 'ALL' else list(ANGLES))
            elif self.action == 'edit_mask':
                LIVE.edit_blink_mask()
            elif self.action == 'keep_mask':
                LIVE.commit_mask_adjustment()
            elif self.action == 'reset_mask':
                LIVE.reset_mask_adjustment()
            elif self.action == 'transfer':
                LIVE.transfer_blink(reviewed=context.scene.ea_mask_reviewed)
            elif self.action == 'select':
                for obj in context.selected_objects:
                    obj.select_set(False)
                obj = bpy.data.objects[self.point]; obj.hide_set(False); obj.select_set(True); context.view_layer.objects.active = obj
            return {'FINISHED'}
        except Exception as error:
            self.report({'ERROR'}, str(error)); return {'CANCELLED'}


class EA_PT_studio(bpy.types.Panel):
    bl_label = 'Refine the expression toward the reference'; bl_idname = 'EA_PT_studio'; bl_space_type = 'VIEW_3D'; bl_region_type = 'UI'; bl_category = 'Expression Studio'
    def draw(self, context):
        layout = self.layout
        if LIVE is None:
            layout.label(text='Load the helper script to resume'); return
        layout.prop(context.scene, 'ea_expression'); layout.prop(context.scene, 'ea_strength', slider=True)
        row = layout.row(align=True)
        for value in [0, .5, 1]:
            row.operator('expression_studio.expression', text=str(int(value*100))+'%').strength = value
        layout.operator('expression_studio.expression')
        layout.prop(context.scene, 'ea_display'); layout.prop(context.scene, 'ea_angle'); layout.operator('expression_studio.capture')
        layout.label(text='Finish the eye corners, brows, thickness and mouth rim with normal editing')
        mask = LIVE.state.get('mask')
        box = layout.box(); box.label(text='Eyes: build the foundation from the skin mask')
        if mask and mask.get('status') == 'baked':
            box.label(text='Transferred: EA_blink can be edited')
            box.prop(context.scene, 'ea_mask_details', text='Show mask readjustment')
            if not context.scene.ea_mask_details:
                return
            box.label(text='Re-transferring replaces the finishing edits')
        box.prop(context.scene, 'ea_parts_details', text='Inspect and select connected parts')
        if context.scene.ea_parts_details:
            box.operator('expression_studio.mask', text='List parts of the selected mesh').action = 'parts'
            box.operator('expression_studio.mask', text='Capture parts with colors and numbers').action = 'parts_capture'
            for part in LIVE.state.get('parts', []):
                row = box.row(align=True); row.label(text=str(part['number'])+': '+str(part['count'])+' vertices')
                for action, text in [('part_select','Select'),('skin','Skin'),('follower','Follow')]:
                    if action == 'follower' and not mask:
                        continue
                    op = row.operator('expression_studio.mask', text=text); op.action=action; op.object_name=part['object']; op.seed=part['seed']
        if mask:
            box.label(text='Select a marker and move it to the skin eye rim with G')
            for side in ['L', 'R']:
                row = box.row(align=True)
                for name, label in [('Inner', 'Inner corner'), ('Outer', 'Outer corner'), ('Upper', 'Upper'), ('Lower', 'Lower')]:
                    op = row.operator('expression_studio.mask', text=label+side); op.action = 'select'; op.point = 'EA_MaskPoint_eye'+name+side
            box.operator('expression_studio.mask', text='Fit with markers').action = 'fit'
            box.operator('expression_studio.mask', text='Capture the current fit').action = 'fit_capture'
            row = box.row(align=True)
            row.operator('expression_studio.mask', text='Edit the mask directly').action = 'edit_mask'
            row.operator('expression_studio.mask', text='Keep the adjustment on both shapes').action = 'keep_mask'
            box.operator('expression_studio.mask', text='Reset the kept mask adjustment').action = 'reset_mask'
            for i, candidate in enumerate(mask.get('followers', [])):
                marker = bpy.data.objects.get('EA_MaskFollower_'+str(i))
                if marker:
                    row = box.row(align=True)
                    row.prop(marker, '["enabled"]', text=str(i+1)+'. '+candidate['object']+' ('+str(candidate['count'])+')')
                    op = row.operator('expression_studio.mask', text='', icon='RESTRICT_SELECT_OFF'); op.action = 'select'; op.point = marker.name
            box.prop(context.scene, 'ea_mask_reviewed')
            box.operator('expression_studio.mask', text='Transfer the verified foundation to editing keys').action = 'transfer'
            box.label(text='Transferred; finish the eye corners etc.' if mask['status'] == 'baked' else 'Check the eye rim and depth from the front and side')


def before_save(_):
    if LIVE:
        LIVE._resume_preview = LIVE.preview_slots is not None; LIVE.preview(False)


def after_save(_):
    if LIVE and getattr(LIVE, '_resume_preview', False):
        LIVE.preview()


def register():
    for cls in [EA_OT_capture, EA_OT_expression, EA_OT_mask, EA_PT_studio]:
        base = bpy.types.Operator if issubclass(cls, bpy.types.Operator) else bpy.types.Panel
        previous = base.bl_rna_get_subclass_py(cls.__name__)
        if previous is None and base == bpy.types.Operator:
            namespace, operation = cls.bl_idname.split('.')
            previous = base.bl_rna_get_subclass_py(namespace.upper()+'_OT_'+operation)
        if getattr(cls, 'is_registered', False):
            bpy.utils.unregister_class(cls)
        elif previous:
            bpy.utils.unregister_class(previous)
        bpy.utils.register_class(cls)
    def items(_self, _context):
        global EXPRESSION_ITEMS
        EXPRESSION_ITEMS = [(e, EXPRESSIONS.get(e,e), '') for e in (LIVE.state['keys'] if LIVE else EXPRESSIONS)]
        return EXPRESSION_ITEMS
    bpy.types.Scene.ea_expression = bpy.props.EnumProperty(name='Expression', items=items)
    bpy.types.Scene.ea_strength = bpy.props.FloatProperty(name='Strength', default=1, min=0, max=1)
    bpy.types.Scene.ea_display = bpy.props.EnumProperty(name='Preview display', items=[(e,e,'') for e in ['mtoon','standard','solid','wire']])
    bpy.types.Scene.ea_angle = bpy.props.EnumProperty(name='Capture angle', items=[(e,e,'') for e in ANGLES]+[('ALL','4 angles','')], default='Front')
    bpy.types.Scene.ea_mask_reviewed = bpy.props.BoolProperty(name='Verified eye rim, depth and separate lashes in the images', default=False)
    bpy.types.Scene.ea_mask_details = bpy.props.BoolProperty(name='Mask details', default=False)
    bpy.types.Scene.ea_parts_details = bpy.props.BoolProperty(name='Connected parts', default=False)
    for handlers, fn in [(bpy.app.handlers.save_pre, before_save), (bpy.app.handlers.save_post, after_save)]:
        for old in list(handlers):
            if old.__module__ == __name__:
                handlers.remove(old)
        handlers.append(fn)


if __name__ == '__main__' and '--' in sys.argv:
    args = sys.argv[sys.argv.index('--')+1:]
    if args[0] == 'prepare':
        source, work = Path(args[1]).resolve(), Path(args[2]).resolve()
        config = json.loads(Path(args[3]).read_text(encoding='utf8'))
        if source.suffix.lower() == '.blend':
            bpy.ops.wm.open_mainfile(filepath=str(source), use_scripts=False)
        else:
            bpy.ops.wm.read_factory_settings(use_empty=True)
            if source.suffix.lower() == '.fbx':
                bpy.ops.import_scene.fbx(filepath=str(source))
            elif source.suffix.lower() in ['.glb', '.gltf']:
                bpy.ops.import_scene.gltf(filepath=str(source))
            elif source.suffix.lower() == '.vrm':
                mtoon()
                bpy.ops.import_scene.vrm(filepath=str(source))
            else:
                raise ValueError('Specify a Blend/FBX/GLB/VRM file')
        attach(work, config.get('objects'), config.get('camera'), config.get('keys'))
    elif args[0] == 'attach':
        if bpy.app.background:
            attach(args[1])
        else:
            bpy.app.timers.register(lambda: (attach(args[1]), None)[1], first_interval=.25)
