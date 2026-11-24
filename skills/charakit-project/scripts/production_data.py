"""Validate v6 production references before any Blender file access."""
import json
import math
import re


def validate_production(p):
    w=p.get('production')
    if w is None:return
    def require(value,message='Invalid production data'):
        if not value:raise ValueError(message)
    def key(v):return isinstance(v,str) and re.fullmatch(r'[a-z][a-z0-9_-]{0,59}',v)
    def vector(v):return isinstance(v,list) and len(v)==3 and all(type(n) in (int,float) and math.isfinite(n) for n in v)
    def digest(v):return isinstance(v,str) and re.fullmatch(r'[a-f0-9]{64}',v)
    docs={d['path']:d for d in p.get('documents',[])}
    def file(d,fbx=False):
        require(isinstance(d,dict) and digest(d.get('sha256')) and docs.get(d.get('path'),{}).get('sha256')==d['sha256'])
        require(not fbx or d['path'].lower().endswith('.fbx'))
        resources=d.get('resources',[]);require(isinstance(resources,list) and len(resources)<=128)
        for r in resources:
            require(docs.get(r.get('path'),{}).get('sha256')==r.get('sha256') and digest(r.get('sha256')))
            require(r['path'].startswith('/'.join(d['path'].split('/')[:3])+'/') and re.search(r'\.(png|jpe?g|webp)$',r['path'],re.I))
    require(p['version']==6 and type(w.get('version')) is int and w['version'] in (1,2) and w.get('phase') in ('candidates','parts','textures','assembled'))
    max_textures=7 if w['version']==1 else 5
    settings=w.get('settings',{})
    require(all(settings.get(k)==v for k,v in dict(model='P2.0',topology='quad',faces=25000,count=4,textureSize=4096,maxTextures=max_textures).items()) and type(settings.get('removeLighting')) is bool)
    candidates=w.get('candidates',{});selected=w.get('selected',{});ids=set();selection=[]
    for source in ('head','body'):
        items=candidates.get(source);require(isinstance(items,list) and len(items)<=4)
        for c in items:
            require(key(c.get('id')) and c['id'] not in ids and isinstance(c.get('name'),str) and len(c['name'])<=200);ids.add(c['id']);file(c,True)
            n=c.get('normalization',{});require(vector(n.get('offset')) and type(n.get('scale')) in (int,float) and math.isfinite(n['scale']) and n['scale']>0)
        chosen=next((c for c in items if c['id']==selected.get(source)),None)
        require(not selected.get(source) or chosen is not None)
        selection.append([source,chosen['id'] if chosen else None,chosen['sha256'] if chosen else None])
    components=w.get('components');textures=w.get('textureGroups');springs=w.get('springGroups')
    require(isinstance(components,list) and len(components)<=4096 and isinstance(textures,list) and len(textures)<=max_textures and isinstance(springs,list) and len(springs)<=128)
    lookup={}
    for c in components:
        require(key(c.get('id')) and c['id'] not in lookup and c.get('source') in ('head','body') and c.get('role') in ('head','hair','body'))
        require((c['source']=='body')==(c['role']=='body') and vector(c.get('min')) and vector(c.get('max')))
        require(all(type(c.get(k)) is int and c[k]>0 for k in ('vertices','faces')));lookup[c['id']]=c
    if components:
        file(w.get('inventory'),True)
        stamp=json.loads(w.get('sourceStamp','null'))
        if w.get('segmented'):
            require(isinstance(stamp,list) and len(stamp)==2 and json.loads(stamp[0])==selection and stamp[1]==[w['segmented'].get(s,{}).get('sha256') for s in ('head','body')],'Stale segmented inventory')
        else:require(stamp==selection,'Stale production inventory')
    for source,d in w.get('segmented',{}).items():
        require(source in ('head','body'));file(d,True)
        require(d.get('candidateId')==selected.get(source))
        n=d.get('normalization',{});require(vector(n.get('offset')) and type(n.get('scale')) in (int,float) and math.isfinite(n['scale']) and n['scale']>0)
    for kind,groups in [('texture',textures),('spring',springs)]:
        group_ids=set();members=set()
        for g in groups:
            require(key(g.get('id')) and g['id'] not in group_ids and isinstance(g.get('name'),str) and 0<len(g['name'].strip())<=100);group_ids.add(g['id'])
            require(isinstance(g.get('components'),list) and len(g['components'])>0)
            for cid in g['components']:
                require(cid in lookup and cid not in members);members.add(cid)
            sources={lookup[cid]['source'] for cid in g['components']};require(len(sources)==1)
            if kind=='spring':
                require(g.get('kind') in ('hair','skirt','ribbon','strap','other'))
                require(g['kind']!='hair' or sources=={'head'})
                require(sources!={'head'} or all(lookup[cid]['role']=='hair' for cid in g['components']))
            else:
                prepared=g.get('prepared')
                if prepared:
                    file(prepared,True);require(json.loads(prepared.get('stamp','null'))==[w['sourceStamp'],sorted(g['components'])],'Stale prepared part')
                for d in [*g.get('guides',{}).values(),*g.get('references',{}).values()]:file(d)
                if g.get('returned'):
                    file(g['returned'],True);require(prepared and g['returned'].get('stamp')==prepared['stamp'] and vector(g['returned'].get('rotation',[0,0,0])))
        if kind=='texture' and w['phase'] in ('textures','assembled'):require(members==set(lookup),'Texture groups must cover all components')
    if w['version']==2:
        membership={cid:g['id'] for g in textures for cid in g['components']}
        for g in textures:
            require(g['id'] in ('hair','head','upper_body','lower_body','accessories'),'Use the five texture categories; do not isolate legs, shoes or skirts')
            role=dict(hair='hair',head='head',upper_body='body',lower_body='body').get(g['id'])
            require(not role or all(lookup[cid]['role']==role for cid in g['components']),'Texture category and component role disagree')
        if w['phase'] in ('textures','assembled'):
            require({'head','upper_body','lower_body'}<={g['id'] for g in textures},'Head, upper body and clothed lower body are required')
            require(all(g['kind']!='skirt' or all(membership[cid]=='lower_body' for cid in g['components']) for g in springs),'Skirt springs must share the lower-body texture with legs and shoes')
    if w['phase']=='assembled':
        stamp=[w['sourceStamp'],[[c['id'],c['role']] for c in components],springs,[[g['id'],g['components'],g.get('returned',{}).get('sha256'),g.get('returned',{}).get('rotation')] for g in textures]]
        require(json.loads(w.get('assemblyStamp','null'))==stamp,'Stale assembly')
