"""The local app's mechanical bone-guide fitting and weight-transfer job.

The server supplies a trusted donor configuration; the uploaded kit supplies only
validated geometry, joints, and reviewed component IDs. No embedded code is run.
"""
import importlib.util
import json
import shutil
import sys
from pathlib import Path


def module(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result)
    return result


def run(config_path):
    config_path=Path(config_path).resolve();config=json.loads(config_path.read_text(encoding='utf-8'))
    root=Path(__file__).resolve().parents[1];out=config_path.parent
    unpack=module('weight_unpack',root/'skills/charakit-project/scripts/unpack.py')
    unpack.unpack(out/'input.charakit',out/'project')
    project=out/'project/project.json';p=json.loads(project.read_text(encoding='utf-8'))
    plan=p.get('weightTransferPlan')
    valid=plan and (plan.get('bodyHash')==next(a['sha256'] for a in p['assets'] if a['role']=='body') if plan.get('version')==2 else plan.get('sourceStamp')==p.get('rigGuide',{}).get('sourceStamp'))
    if not valid:
        raise ValueError('Missing or stale reviewed component selection')
    guide=module('weight_guide',root/'skills/avatar-weight-transfer/scripts/from_guide.py')
    prepared=guide.prepare({**config['donor'],'project':str(project),'exclude_components':plan.get('excludeComponents',[]),'output_dir':str(out/'backups')})
    # Automatic mode is explicitly requested by the app. Fit artifacts and gap
    # reports are retained; successful computation is not a visual quality pass.
    result=guide.transfer.transfer({'collection':prepared['fit_collection'],'output_dir':str(out/'backups')})
    shutil.copyfile(Path(result['output'])/'weighted-review.fbx',out/'weighted-review.fbx')
    shutil.copyfile(Path(result['output'])/'weighted.blend',out/'weighted.blend')
    shutil.copyfile(Path(prepared['fit']['output'])/'fitted-donor.fbx',out/'fitted-donor.fbx')
    report={'version':1,'stage':'weighted','rig':prepared['rig'],'excludeComponents':plan.get('excludeComponents',[]),'springObjects':plan.get('springObjects',[]),
            'pendingSpringObjects':prepared['pending_spring_objects'],'meshes':result['meshes'],
            'fit':{k:prepared['fit'][k] for k in ('torso_anchor','torso_ratio','torso_width','torso_depth')},
            'visualCheckRequired':True,'springsReady':False}
    (out/'result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print('CHARAKIT_WEIGHT_TRANSFER_OK')


if __name__=='__main__':
    run(sys.argv[sys.argv.index('--')+1])
