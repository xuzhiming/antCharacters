import {sha256,checkFBX,identity,validateProject} from './project.mjs';
import {safePath} from './archive.mjs';
import {beginProduction,resetRig,textureStamp,validateProduction} from './production.mjs';

export async function registerDocument(p,files,name,bytes,prefix='documents/production/'+crypto.randomUUID()+'/') {
  const path=prefix+safePath(name),d={path,filename:name.split('/').pop(),sha256:await sha256(bytes)};
  if(files.has(path))throw Error('保存先が重複しています。');
  p.documents??=[];p.documents.push(d);files.set(path,bytes);return d;
}
export async function registerModel(p,files,input){
  checkFBX(input.data);const prefix='documents/production/'+crypto.randomUUID()+'/';
  const d=await registerDocument(p,files,input.name,input.data,prefix);d.resources=[];
  for(const r of input.resources||[]){if(!/\.(png|jpe?g|webp)$/i.test(r.name))throw Error('画像リソースが不正です。');d.resources.push(await registerDocument(p,files,r.name,r.data,prefix));}
  return d;
}
// Callers stage mutations on a cloned project and Map, then commit after validation.
export async function addCandidate(p,files,source,input,normalization,name=input.name){
  const w=beginProduction(p);
  if(!['head','body'].includes(source)||w.candidates[source].length>=4)throw Error('候補は頭・体それぞれ最大4点です。');
  const d=await registerModel(p,files,input);
  w.candidates[source].push({...d,id:source+'_'+crypto.randomUUID(),name,normalization});
  p.placements[source]??={...identity(),position:[0,0,source==='body'?.725:1.60]};
  validateProduction(p);
}
export async function addReturn(p,files,id,input,rotation=[0,0,0]){
  const g=p.production?.textureGroups.find(g=>g.id===id);
  if(!g?.prepared||g.prepared.stamp!==textureStamp(p,g))throw Error('書き出した部位を先に登録してください。');
  g.returned={...await registerModel(p,files,input),stamp:g.prepared.stamp,rotation};
  p.production.phase='textures';delete p.production.assemblyStamp;resetRig(p);validateProject(p);
}
export async function addSegmented(p,files,source,input,normalization){
 const w=p.production;if(!['head','body'].includes(source)||!w?.selected[source])throw Error('採用候補を先に決定してください。');
 w.segmented??={};w.segmented[source]={...await registerModel(p,files,input),candidateId:w.selected[source],normalization};
 w.components=[];w.textureGroups=[];w.springGroups=[];w.phase='candidates';delete w.inventory;delete w.sourceStamp;delete w.assemblyStamp;resetRig(p);validateProduction(p);
}
export async function addReference(p,files,id,view,name,bytes){
  const g=p.production?.textureGroups.find(g=>g.id===id);
  if(!g?.prepared||!['front','back'].includes(view)||!name.toLowerCase().endsWith('.png'))throw Error('書き出した部位に正面・背面のPNGを指定してください。');
  if(bytes.length<24||new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(0)!==0x89504e47)throw Error('PNGを指定してください。');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),width=v.getUint32(16),height=v.getUint32(20);
  if(width!==height||width<512||width>8192)throw Error('素材画像は512〜8192pxの正方形PNGにしてください。');
  g.references??={};g.references[view]=await registerDocument(p,files,name,bytes);validateProduction(p);
}
