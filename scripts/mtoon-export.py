"""Apply the review MToon profile and save/export explicitly named avatar meshes.

Blender --background INPUT.blend --python-exit-code 1 --python mtoon-export.py --
  --mesh Body --mesh Hair --blend OUTPUT.blend [--armature Rig --vrm OUTPUT.vrm]
No metadata is invented. The input Blend is only changed when explicitly used
as --blend. Exported bytes are checked before replacing either output.
"""
import argparse
import base64
import importlib.util
import json
import math
from pathlib import Path
import re
import struct
import sys
import tempfile

import bpy
from bpy_extras.node_shader_utils import PrincipledBSDFWrapper

PROFILE = json.loads((Path(__file__).resolve().parents[1] / 'public/mtoon-profile.json').read_text())


def enable_vrm():
    if hasattr(bpy.types.Material, 'vrm_addon_extension'):
        return
    import addon_utils
    for module in addon_utils.modules():
        if module.__name__.endswith('.vrm') or module.bl_info.get('name') == 'VRM format':
            bpy.ops.preferences.addon_enable(module=module.__name__)
            if hasattr(bpy.types.Material, 'vrm_addon_extension'):
                return
    raise RuntimeError('Enable the installed VRM Add-on.')


def texture_state(texture):
    if not texture or not texture.image:
        return None
    if any(abs(v) > 1e-6 for v in texture.rotation):
        raise ValueError('Bake rotated texture UVs before MToon conversion.')
    if texture.texcoords != 'UV':
        raise ValueError('Use UV mapping for MToon conversion.')
    return dict(image=texture.image, offset=(texture.translation[0], 1-texture.translation[1]-texture.scale[1]),
                scale=tuple(texture.scale[:2]), extension=texture.extension,
                interpolation=texture.node_image.interpolation,
                channel=texture.socket_dst.links[0].from_socket.name if texture.socket_dst.links else None)


def same_image_content(first, second):
    if first == second:
        return True
    # FBX's sRGB color and Non-Color alpha sockets can create separate image
    # datablocks. Compare their original encoded bytes, not decoded RGB values.
    if any(image.source != 'FILE' or image.is_dirty for image in (first, second)):
        return False
    if tuple(first.size) != tuple(second.size) or first.channels != second.channels or first.channels != 4 or first.alpha_mode != second.alpha_mode:
        return False
    def content(image):
        if image.packed_file:
            return bytes(image.packed_file.data)
        return Path(bpy.path.abspath(image.filepath, library=image.library)).read_bytes()
    try:
        data = content(first)
        return bool(data) and data == content(second)
    except (OSError, ValueError):
        return False


def compatible_alpha(base, alpha):
    if not base or alpha['channel'] != 'Alpha':
        return False
    if any(base[key] != alpha[key] for key in ('extension', 'interpolation')):
        return False
    if any(not math.isclose(a, b, rel_tol=0, abs_tol=1e-6) for key in ('offset', 'scale') for a, b in zip(base[key], alpha[key])):
        return False
    return same_image_content(base['image'], alpha['image'])


def restore_texture(info, state):
    if state is None:
        return
    info.index.source = state['image']
    transform = info.extensions.khr_texture_transform
    transform.offset = state['offset']
    transform.scale = state['scale']
    sampler = info.index.sampler
    wrap = 'CLAMP_TO_EDGE' if state['extension'] in {'EXTEND', 'CLIP'} else 'REPEAT'
    sampler.wrap_s = sampler.wrap_t = wrap
    sampler.mag_filter = 'NEAREST' if state['interpolation'] == 'Closest' else 'LINEAR'
    sampler.min_filter = sampler.mag_filter


def apply_mtoon(meshes):
    enable_vrm()
    meshes = list(meshes)
    if not meshes or any(o.type != 'MESH' for o in meshes):
        raise ValueError('Specify the meshes to apply MToon to.')
    materials = {}
    for obj in meshes:
        if not obj.data.materials:
            obj.data.materials.append(bpy.data.materials.new(obj.name + ' MToon'))
        for slot in obj.material_slots:
            if slot.material is None:
                slot.material = bpy.data.materials.new(obj.name + ' MToon')
            materials[slot.material.name] = slot.material
    # Snapshot and check every source before the add-on rebuilds any node tree.
    states = {}
    for name, material in materials.items():
        if material.vrm_addon_extension.mtoon1.enabled:
            continue
        wrapper = PrincipledBSDFWrapper(material)
        if not wrapper.node_principled_bsdf and material.node_tree and any(n.type == 'TEX_IMAGE' for n in material.node_tree.nodes):
            raise ValueError('Check the base color connection: ' + name)
        alpha_texture = texture_state(wrapper.alpha_texture)
        base = texture_state(wrapper.base_color_texture)
        if alpha_texture and not compatible_alpha(base, alpha_texture):
            raise ValueError('Merge alpha from a separate image or from different UVs or sampling into the base color alpha: ' + name)
        states[name] = dict(base=base, normal=texture_state(wrapper.normalmap_texture),
                            emissive=texture_state(wrapper.emission_color_texture),
                            double_sided=not material.use_backface_culling,
                            alpha_mode=getattr(material, 'blend_method', None),
                            alpha_cutoff=getattr(material, 'alpha_threshold', 0.5),
                            alpha=wrapper.alpha, has_alpha=alpha_texture is not None,
                            color=tuple(wrapper.base_color) if wrapper.node_principled_bsdf else tuple(material.diffuse_color[:3]))
    for name, material in materials.items():
        gltf = material.vrm_addon_extension.mtoon1
        if name not in states:
            continue  # Keep existing authored MToon settings, including expressions.
        state = states[name]
        gltf.enabled = True
        if not gltf.enabled:
            raise RuntimeError('MToon conversion failed: ' + name)
        base = gltf.pbr_metallic_roughness.base_color_texture
        mtoon = gltf.extensions.vrmc_materials_mtoon
        restore_texture(base, state['base'])
        restore_texture(mtoon.shade_multiply_texture, state['base'])
        restore_texture(gltf.normal_texture, state['normal'])
        restore_texture(gltf.emissive_texture, state['emissive'])
        gltf.double_sided = state['double_sided']
        gltf.alpha_cutoff = state['alpha_cutoff']
        mode = state['alpha_mode']
        gltf.alpha_mode = 'MASK' if mode == 'CLIP' else 'BLEND' if mode == 'BLEND' or state['alpha'] < 1 or state['has_alpha'] else 'OPAQUE'
        if state['base'] is None:
            gltf.pbr_metallic_roughness.base_color_factor = (*state['color'], state['alpha'])
        mtoon.shade_color_factor = tuple(v * PROFILE['shadeMultiplier'] for v in gltf.pbr_metallic_roughness.base_color_factor[:3])
        mtoon.shading_shift_factor = PROFILE['shadingShiftFactor']
        mtoon.shading_toony_factor = PROFILE['shadingToonyFactor']
        mtoon.gi_intensity_factor = PROFILE['giIntensityFactor']
        mtoon.outline_width_mode = PROFILE['outlineWidthMode']
    for material in materials.values():
        gltf = material.vrm_addon_extension.mtoon1
        for info in gltf.all_texture_info():
            image = info.index.source
            if image and not image.packed_file:
                image.pack()
    return dict(materials=len(materials), mtoon=len(materials))


def embedded_data(uri, mime):
    if not isinstance(uri, str) or not re.fullmatch('data:(' + mime + r');base64,[A-Za-z0-9+/]*={0,2}', uri):
        raise ValueError('The embedded texture data is invalid.')
    try:
        encoded = uri.split(',', 1)[1]
        if '=' in encoded and len(encoded) % 4:
            raise ValueError()
        data = base64.b64decode(encoded + '=' * (-len(encoded) % 4), validate=True)
        if not data:
            raise ValueError()
        return data
    except ValueError:
        raise ValueError('The embedded texture data is invalid.') from None


def texture_infos(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if key.endswith('Texture'):
                yield item
            else:
                yield from texture_infos(item)
    elif isinstance(value, list):
        for item in value:
            yield from texture_infos(item)


def inspect_texture(document, info, bin_length):
    def fail():
        raise ValueError('MToon texture references or embedded ranges are invalid.')
    def entry(key, index):
        items = document.get(key, [])
        if type(index) is not int or index < 0 or not isinstance(items, list) or index >= len(items) or not isinstance(items[index], dict):
            fail()
        return items[index]
    texture = entry('textures', info.get('index') if isinstance(info, dict) else None)
    image = entry('images', texture.get('source'))
    if 'sampler' in texture:
        entry('samplers', texture['sampler'])
    if 'uri' in image:
        if 'bufferView' in image:
            fail()
        embedded_data(image['uri'], r'image/(png|jpeg|webp)')
        return
    if image.get('mimeType') not in {'image/png', 'image/jpeg', 'image/webp'}:
        fail()
    view = entry('bufferViews', image.get('bufferView'))
    buffer = entry('buffers', view.get('buffer'))
    offset, length, total = view.get('byteOffset', 0), view.get('byteLength'), buffer.get('byteLength')
    if any(type(n) is not int for n in (offset, length, total)) or offset < 0 or length <= 0 or total < 0 or offset > total or length > total - offset:
        fail()
    if 'uri' in buffer:
        if len(embedded_data(buffer['uri'], r'application/(octet-stream|gltf-buffer)')) < total:
            fail()
    elif view['buffer'] != 0 or total > bin_length:
        fail()


def inspect_vrm(filename):
    raw = Path(filename).read_bytes()
    if len(raw) < 20:
        raise ValueError('The exported VRM format is invalid.')
    magic, version, total = struct.unpack_from('<3I', raw)
    if magic != 0x46546C67 or version != 2 or total != len(raw):
        raise ValueError('The exported VRM format is invalid.')
    offset, document, bin_length, found_bin = 12, None, 0, False
    while offset < total:
        if offset + 8 > total:
            raise ValueError('The exported VRM chunk is invalid.')
        length, kind = struct.unpack_from('<2I', raw, offset)
        start = offset + 8
        if length % 4 or start + length > total or (offset == 12 and kind != 0x4E4F534A):
            raise ValueError('The exported VRM chunk is invalid.')
        if kind == 0x4E4F534A and document is None:
            document = json.loads(raw[start:start + length])
        elif kind == 0x004E4942 and not found_bin:
            bin_length, found_bin = length, True
        else:
            raise ValueError('The exported VRM chunk is invalid.')
        offset = start + length
    if not isinstance(document, dict) or document.get('asset', {}).get('version') != '2.0':
        raise ValueError('The exported VRM format is invalid.')
    if document.get('extensions', {}).get('VRMC_vrm', {}).get('specVersion') != '1.0':
        raise ValueError('Check the VRM 1.0 settings.')
    used = {p.get('material') for m in document.get('meshes', []) for p in m.get('primitives', [])}
    if not used or None in used or 'VRMC_materials_mtoon' not in document.get('extensionsUsed', []):
        raise ValueError('Check that MToon is applied to all meshes.')
    materials = document.get('materials', [])
    for index in used:
        if type(index) is not int or index < 0 or index >= len(materials):
            raise ValueError('The VRM material reference is invalid.')
        material = materials[index]
        if material.get('extensions', {}).get('VRMC_materials_mtoon', {}).get('specVersion') != '1.0':
            raise ValueError('MToon not applied: ' + material.get('name', str(index)))
        for info in texture_infos(material):
            inspect_texture(document, info, bin_length)
    return dict(materials=len(used), mtoon=len(used), textures=len(document.get('textures', [])))


def save_outputs(meshes, blend, *, armature=None, vrm=None):
    meshes = list(meshes)
    if vrm and (not armature or armature.type != 'ARMATURE' or armature.data.vrm_addon_extension.spec_version != '1.0'):
        raise ValueError('Specify a VRM 1.0 Humanoid rig.')
    report = apply_mtoon(meshes)
    if armature:
        spec = importlib.util.spec_from_file_location('charakit_spring_audit', Path(__file__).with_name('spring-setup.py'))
        spring_api = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(spring_api)
        report['springs'] = spring_api.audit(armature, meshes)
    blend = Path(blend).resolve()
    blend.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='mtoon-export-', dir=blend.parent) as folder:
        temporary = Path(folder)
        if vrm:
            bpy.ops.object.select_all(action='DESELECT')
            for obj in [armature, *meshes]:
                obj.hide_set(False)
                obj.select_set(True)
            bpy.context.view_layer.objects.active = armature
            result = bpy.ops.export_scene.vrm(filepath=str(temporary / 'avatar.vrm'),
                armature_object_name=armature.name, export_only_selections=True,
                export_invisibles=False, use_addon_preferences=False)
            if 'FINISHED' not in result:
                raise RuntimeError('VRM export failed. Check the metadata and Humanoid.')
            report['export'] = inspect_vrm(temporary / 'avatar.vrm')
        result = bpy.ops.wm.save_as_mainfile(filepath=str(temporary / 'avatar.blend'), copy=True)
        if 'FINISHED' not in result:
            raise RuntimeError('Failed to save the editing Blend file.')
        if vrm:
            destination = Path(vrm).resolve()
            destination.parent.mkdir(parents=True, exist_ok=True)
            (temporary / 'avatar.vrm').replace(destination)
        (temporary / 'avatar.blend').replace(blend)
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mesh', action='append', required=True)
    parser.add_argument('--armature')
    parser.add_argument('--blend', required=True)
    parser.add_argument('--vrm')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
    meshes = [bpy.data.objects[name] for name in args.mesh]
    rig = bpy.data.objects[args.armature] if args.armature else None
    print('CHARAKIT_MTOON_OK ' + json.dumps(save_outputs(meshes, args.blend, armature=rig, vrm=args.vrm)))
