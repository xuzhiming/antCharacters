import {currentImageSlots,library,adoptedVersions,adoptImage} from './images.mjs';
import {sha256} from './project.mjs';
import {readImageMetadata,withImagePrompt} from './image-metadata.mjs';
import {inspectImage} from './image-info.mjs';
import {importThreeViews,threeViewPackage} from './three-view-import.mjs';
export function replaceImage(p,v){
 const l=library(p),previous=l.versions.filter(x=>x.slot===v.slot).map(x=>x.id);
 const removed=new Set(l.versions.filter(x=>x.slot===v.slot).map(x=>x.path));
 l.versions=l.versions.filter(x=>x.slot!==v.slot);
 // Old kits may refer to a replaced image. Drop those links instead of keeping a history chain.
 for(const image of l.versions)image.references=image.references.filter(ref=>!removed.has(ref));
 v.references=[];
 for(const [model,ids] of Object.entries(l.modelSources))if(ids.some(id=>previous.includes(id)))delete l.modelSources[model];
 l.versions.push(v);adoptImage(p,v.slot,v.id);l.slots[v.slot].note='';
}
export async function imagePackage(p,files){
 const entries=await threeViewPackage(p,files);
 for(const v of adoptedVersions(p).filter(v=>currentImageSlots(p).some(s=>s.id===v.slot))){
  const [part,view]=v.slot.split('/'),data=files.get(v.path);if(!data)throw Error('画像がありません。');
  entries[`${part}/${view}.${v.path.split('.').pop()}`]=v.mime==='image/png'?withImagePrompt(data,v.prompt):data;
 }
 return entries;
}
export async function importImagePackage(p,files,entries){
 let count=0;const seen=new Set(),guides=[];
 for(const [name,raw] of Object.entries(entries)){
  if(/(?:^|\/)references\//i.test(name))continue;
  const guide=name.match(/(?:^|\/)three-view\/(front|side|back)\.(png|jpe?g|webp)$/i);
  if(guide){guides.push({view:guide[1].toLowerCase(),filename:name,bytes:raw});continue;}
  const m=name.match(/(?:^|\/)(head|hair|body)\/(front|left|right|back)\.(png|jpe?g|webp)$/i);if(!m)continue;
  const slot=`${m[1].toLowerCase()}/${m[2].toLowerCase()}/neutral`;if(seen.has(slot))throw Error('同じ部位・方向の画像が重複しています。');seen.add(slot);
  const ext=m[3].toLowerCase(),info=await inspectImage(raw,ext),meta=info.mime==='image/png'?readImageMetadata(raw):null;
  const prompt=meta?.prompt??null,data=info.mime==='image/png'?withImagePrompt(raw,prompt):raw,path='images/'+crypto.randomUUID()+'.'+ext;
  const v={id:crypto.randomUUID(),slot,path,...info,sha256:await sha256(data),filename:name,createdAt:new Date().toISOString(),method:'import',prompt,note:'',references:[]};
  files.set(path,data);replaceImage(p,v);count++;
 }
 if(guides.length)await importThreeViews(p,files,guides);
 if(!count&&!guides.length)throw Error('対応する画像がありません。head/front.png などの構成にしてください。');return count;
}
