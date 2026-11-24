#!/usr/bin/env python3
"""Validate and transactionally extract a .charakit archive. Python 3 stdlib only."""
import re
import argparse
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import shutil
import struct
import tempfile
import zipfile

LIMIT = 1024 ** 3
STATES = {'neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised', 'blink'}
LEGACY_ROLES = {'iris_left', 'iris_right'}
ROLES = {'body', 'hair', 'reference', 'assembled'} | {'head_' + s for s in STATES}
CENTERS = {'hips', 'spine', 'chest', 'neck', 'head'}
MARKERS = CENTERS | {n + '.' + s for n in ('shoulder', 'elbow', 'wrist', 'hand', 'hip', 'knee', 'ankle', 'toes') for s in ('L', 'R')}

FINGER_MARKERS = {finger + joint + '.' + side for side in ('L', 'R') for finger in ('thumb', 'index', 'middle', 'ring', 'little') for joint in (('Metacarpal', 'Proximal', 'Distal', 'Tip') if finger == 'thumb' else ('Proximal', 'Intermediate', 'Distal', 'Tip'))}

def check_path(name):
    if not isinstance(name, str) or not name or '\\' in name or ':' in name or name.startswith('/') or any(ord(c) < 32 for c in name) or any(p in ('', '.', '..') for p in name.split('/')):
        raise ValueError('Unsafe path: ' + repr(name))
    return name

def vector(v, bound=1000):
    return isinstance(v, list) and len(v) == 3 and all(type(n) in (int, float) and math.isfinite(n) and abs(n) <= bound for n in v)

def check_fbx(data):
    if data.startswith(b'Kaydara FBX Binary  ') and len(data) >= 27:
        if 7100 <= struct.unpack_from('<I', data, 23)[0] < 8000:
            return
    raise ValueError('Unsupported FBX header')


def validate(p):
    if p.get('format') != 'charakit' or p.get('version') not in (4, 5, 6) or p.get('mode') not in ('parts', 'assembled'):
        raise ValueError('Unsupported project format')
    expected = dict(unit='meter', up='+Z', front='-Y', characterLeft='+X', space='world')
    if p.get('coordinateSystem') != expected:
        raise ValueError('Unsupported coordinate system')
    if not isinstance(p.get('name'), str) or len(p['name']) > 200:
        raise ValueError('Invalid project name')
    markers = p.get('markers', {})
    if not MARKERS <= set(markers) or not set(markers) <= MARKERS | FINGER_MARKERS or any(not vector(m.get('position'), 10) for m in markers.values()):
        raise ValueError('Invalid joint markers')
    if any(markers[k]['position'][0] != 0 for k in CENTERS):
        raise ValueError('Center markers must have X=0')
    for t in p.get('placements', {}).values():
        if not vector(t.get('position')) or not vector(t.get('rotation')) or type(t.get('scale')) not in (float, int) or not 0 < t['scale'] <= 1000:
            raise ValueError('Invalid placement')
    springs = p.get('springs')
    if not isinstance(springs, list) or len(springs) > 64:
        raise ValueError('Invalid spring list')
    for s in springs:
        if not isinstance(s.get('id'), str) or not isinstance(s.get('name'), str) or s.get('kind') not in ('hair', 'skirt', 'strap', 'other') or not 2 <= len(s.get('points', [])) <= 32 or not all(vector(v) for v in s['points']):
            raise ValueError('Invalid spring path')
    assets = p.get('assets')
    if not isinstance(assets, list) or len(assets) > 128:
        raise ValueError('Invalid assets')
    paths = set()
    for a in assets:
        name = check_path(a.get('path'))
        if not name.startswith('assets/') or name in paths or a.get('role') not in ROLES | LEGACY_ROLES:
            raise ValueError('Invalid asset path or role')
        paths.add(name)
    for a in assets:
        if a['role'] == 'reference':
            continue
        if not a['path'].lower().endswith('.fbx') or not isinstance(a.get('resources'), list) or len(a['resources']) > 128:
            raise ValueError('Invalid FBX asset')
        prefix = '/'.join(a['path'].split('/')[:2]) + '/'
        for item in a['resources']:
            name = check_path(item.get('path'))
            if not name.startswith(prefix) or name in paths or not re.search(r'\.(png|jpe?g|webp)$', name, re.I) or not re.fullmatch(r'[a-f0-9]{64}', item.get('sha256', '')):
                raise ValueError('Invalid texture resource')
            paths.add(name)
        n = a.get('normalization')
        if p['mode'] == 'parts' and a['role'] != 'assembled' and (not n or not vector(n.get('offset')) or type(n.get('scale')) not in (int, float) or not math.isfinite(n['scale']) or not 0 < n['scale']):
            raise ValueError('Invalid normalization')
    if p.get('scene') or (p['mode'] == 'assembled' and not p.get('updatedModel')):
        raise ValueError('Invalid FBX project mode')
    if p.get('updatedModel') and not any(a['path'] == p['updatedModel'].get('path') and a['role'] == 'assembled' for a in assets):
        raise ValueError('Missing updated model')
    lib = p.get('imageLibrary', {})
    if p['version'] >= 4 and not lib:
        raise ValueError('Missing image library')
    versions = lib.get('versions', [])
    if not isinstance(versions, list) or len(versions) > 384:
        raise ValueError('Invalid image versions')
    slots = {f'{part}/{view}/neutral' for part in ('head','hair','body') for view in ('front','left','right','back')} | {f'head/{view}/{state}' for view in ('front','right') for state in STATES}
    slots |= {'pupils', 'iris_left/front/neutral', 'iris_right/front/neutral'}
    ids = {}
    for v in versions:
        name = check_path(v.get('path'))
        if not name.startswith('images/') or name in paths or not isinstance(v.get('id'), str) or v['id'] in ids or v.get('slot') not in slots or v.get('mime') not in ('image/png','image/jpeg','image/webp') or not all(type(v.get(k)) is int and 0 < v[k] <= 8192 for k in ('width','height')) or not isinstance(v.get('references'), list) or not isinstance(v.get('note'), str) or not (v.get('prompt') is None or isinstance(v['prompt'], str)):
            raise ValueError('Invalid image version')
        paths.add(name)
        ids[v['id']] = v
    for key, slot in lib.get('slots', {}).items():
        adopted = slot.get('adopted')
        if key not in slots or not isinstance(slot.get('note'), str) or (adopted is not None and (adopted not in ids or ids[adopted]['slot'] != key)):
            raise ValueError('Invalid adopted image')
    for v in versions:
        if any(not isinstance(ref, str) or ref not in paths for ref in v['references']):
            raise ValueError('Missing image reference')
    for asset, refs in lib.get('modelSources', {}).items():
        if not any(a['path'] == asset and a['role'] != 'reference' for a in assets) or not isinstance(refs, list) or any(ref not in ids for ref in refs):
            raise ValueError('Invalid model source images')
    for d in p.get('documents', []):
        name = check_path(d.get('path'))
        if not name.startswith('documents/') or name in paths:
            raise ValueError('Invalid document path')
        paths.add(name)
    w = p.get('workflow')
    if w is not None:
        if (not isinstance(w, dict) or w.get('version') != 1 or w.get('rigging') not in ('tripo','markers')
            or w.get('phase') not in ('parts','bones','rigged','weighted','springs') or type(w.get('attachHair')) is not bool):
            raise ValueError('Invalid workflow')
        mapping = w.get('boneMap')
        if not isinstance(mapping, dict) or len(mapping) > 80 or any(not isinstance(n, str) or len(n) >= 200 for n in mapping.values()):
            raise ValueError('Invalid bone map')
        export = w.get('rigExport')
        if export is not None and (not isinstance(export, dict) or not isinstance(export.get('sourceStamp'), str) or len(export['sourceStamp']) > 8000 or not isinstance(export.get('at'), str)):
            raise ValueError('Invalid rig export record')
        if export and 'bounds' in export:
            b = export['bounds']
            if (not isinstance(b, dict) or any(not isinstance(b.get(k), list) or len(b[k]) != 3 or any(not isinstance(v, (int, float)) or not math.isfinite(v) or abs(v) > 1000 for v in b[k]) for k in ('min','max'))
                or any(b['max'][i] < b['min'][i] for i in range(3)) or b['max'][1] - b['min'][1] <= 1e-5):
                raise ValueError('Invalid rig bounds')
        alignment = w.get('returnAlignment')
        if alignment is not None and (not isinstance(alignment, dict) or alignment.get('version') != 1 or not isinstance(alignment.get('sourceStamp'), str) or len(alignment['sourceStamp']) > 8000 or any(not isinstance(alignment.get(k), (int,float)) or not math.isfinite(alignment[k]) or not 0 < alignment[k] <= 1000 for k in ('sourceHeight','returnedHeight','scale'))):
            raise ValueError('Invalid return alignment')
    guide = p.get('rigGuide')
    if guide is not None:
        if (not isinstance(guide, dict) or guide.get('version') != 1 or not isinstance(guide.get('sourceStamp'), str)
            or len(guide['sourceStamp']) > 8000 or not re.fullmatch(r'[a-f0-9]{64}', guide.get('sourceHash', ''))
            or not isinstance(guide.get('bones'), list) or not 0 < len(guide['bones']) <= 512):
            raise ValueError('Invalid bone guide')
        names = set()
        for i, b in enumerate(guide['bones']):
            if (not isinstance(b, dict) or not isinstance(b.get('name'), str) or not 0 < len(b['name']) < 200 or b['name'] in names
                or not (b.get('parent') is None or type(b['parent']) is int and 0 <= b['parent'] < i)
                or any(not vector(b.get(k)) for k in ('head','tail','rollAxis'))
                or math.dist(b['head'], b['tail']) < 1e-7 or abs(math.sqrt(sum(v*v for v in b['rollAxis']))-1) > 1e-4):
                raise ValueError('Invalid guide joint')
            names.add(b['name'])
    plan=p.get('weightTransferPlan')
    if plan is not None and plan.get('version') == 2:
        parts=plan.get('springObjects')
        if (not re.fullmatch(r'[a-f0-9]{64}',plan.get('bodyHash','')) or plan.get('bodyObject')!='Body'
            or not isinstance(parts,list) or len(parts)>128):raise ValueError('Invalid separated spring parts')
        names=[]
        for part in parts:
            name=part.get('name')
            if (not isinstance(name,str) or not name or len(name.encode('utf-8'))>60 or name=='Body'
                or re.search(r'[\x00-\x1f/\\]',name) or part.get('kind') not in ('skirt','ribbon','strap','other')
                or part.get('separated') is not True):raise ValueError('Invalid spring object')
            names.append(name)
        if len(set(names))!=len(names):raise ValueError('Duplicate spring object')
    elif plan is not None:
        if (not isinstance(plan,dict) or plan.get('version')!=1 or not isinstance(plan.get('sourceStamp'),str)
            or len(plan['sourceStamp'])>8000 or not isinstance(plan.get('excludeComponents'),list)
            or len(plan['excludeComponents'])>2048
            or any(not isinstance(v,str) or not re.fullmatch(r'body:\d{1,4}:\d{1,7}',v) for v in plan['excludeComponents'])
            or len(set(plan['excludeComponents']))!=len(plan['excludeComponents'])):
            raise ValueError('Invalid weight-transfer component selection')
    if p.get('production') is not None:
        import importlib.util
        spec=importlib.util.spec_from_file_location('production_data',Path(__file__).with_name('production_data.py'))
        module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.validate_production(p)
    return p

def unpack(source, destination):
    dest = Path(destination).absolute()
    if dest.exists():
        raise FileExistsError('Destination already exists; choose a new directory')
    if Path(source).stat().st_size > LIMIT:
        raise ValueError('Archive exceeds 1 GiB')
    with zipfile.ZipFile(source) as z:
        infos = z.infolist()
        if len(infos) > 512 or sum(i.file_size for i in infos) > LIMIT:
            raise ValueError('Archive expansion limit exceeded')
        names = set()
        for i in infos:
            check_path(i.filename.rstrip('/') if i.is_dir() else i.filename)
            if i.extract_version >= 45 or i.filename in names or i.flag_bits & 1 or i.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED) or ((i.external_attr >> 16) & 0o170000) == 0o120000:
                raise ValueError('Duplicate, encrypted, linked or unsupported entry')
            names.add(i.filename)
        p = validate(json.loads(z.read('project.json')))
        extra = p.get('imageLibrary', {}).get('versions', []) + p.get('documents', [])
        descriptors = [item for a in p['assets'] for item in [a] + a.get('resources', [])] + extra
        for a in descriptors:
            data = z.read(a['path'])
            if hashlib.sha256(data).hexdigest() != a.get('sha256'):
                raise ValueError('Hash mismatch: ' + a['path'])
            if a.get('role') and a['role'] != 'reference':
                check_fbx(data)
        dest.parent.mkdir(parents=True, exist_ok=True)
        temp = Path(tempfile.mkdtemp(prefix='.charakit-', dir=dest.parent))
        try:
            # Extract only declared assets plus project metadata. Never execute attachments.
            for name in ['project.json'] + [a['path'] for a in descriptors] + (['HANDOFF.txt'] if 'HANDOFF.txt' in names else []):
                target = temp.joinpath(*PurePosixPath(name).parts)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(z.read(name))
            if dest.exists():
                raise FileExistsError('Destination appeared during extraction')
            temp.rename(dest)
        except BaseException:
            shutil.rmtree(temp, ignore_errors=True)
            raise
    missing = sorted({'body', 'hair', 'head_neutral'} - {a['role'] for a in p['assets']}) if p['mode'] == 'parts' else []
    return {'directory': str(dest), 'mode': p['mode'], 'imageCandidates': len(p.get('imageLibrary', {}).get('versions', [])), 'markers': len(p['markers']), 'springPaths': len(p['springs']), 'missingParts': missing}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive')
    parser.add_argument('destination')
    args = parser.parse_args()
    print(json.dumps(unpack(args.archive, args.destination), ensure_ascii=False, indent=2))
