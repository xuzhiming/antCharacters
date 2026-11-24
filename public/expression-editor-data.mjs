import {safePath} from './archive.mjs';
import {inspectPreviewGLTF} from './preview-gltf.mjs';
import {currentExpressions,expressionModelStamp} from './expression-authoring.mjs';
import {currentReviewVRM} from './review-vrm.mjs';

const validHash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
export function importedExpressionModel(p){const r=p.expressionEditor?.imported;return r?.modelStamp===expressionModelStamp(p)&&p.documents?.some(d=>d.path===r.path&&d.sha256===r.sha256)?r:null;}
export function expressionPreviewSource(p){
 const authored=currentExpressions(p),document=path=>p.documents?.find(d=>d.path===path);
 if(authored){const d=document(authored.glb);if(d)return {...d,kind:'glb',key:'glb:'+d.sha256,filename:d.filename||'expressions.glb'};}
 const imported=importedExpressionModel(p);if(imported)return {...imported,key:imported.kind+':'+imported.sha256};
 const vrm=currentReviewVRM(p);if(vrm)return {...vrm,kind:'vrm',key:'vrm:'+vrm.sha256,filename:document(vrm.path)?.filename||'avatar.vrm'};
 return null;
}
export async function importExpressionModel(p,files,bytes,filename){
 const kind=/\.vrm$/i.test(filename)?'vrm':/\.glb$/i.test(filename)?'glb':null;
 if(!kind)throw Error('VRMまたはGLBを選んでください。');
 const data=new Uint8Array(bytes instanceof ArrayBuffer?bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 inspectPreviewGLTF(data.buffer,kind==='vrm'?'vrm':'gltf');
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');
 const path='documents/expression-preview/'+sha256+'.'+kind;
 p.documents??=[];if(!p.documents.some(d=>d.path===path))p.documents.push({path,sha256,filename:filename.slice(0,200)});
 files.set(path,data);
 p.expressionEditor={version:1,imported:{path,sha256,kind,filename:filename.slice(0,200),modelStamp:expressionModelStamp(p)}};
 return expressionPreviewSource(p);
}
export function expressionControls(p,key,entries){
 const state=p.expressionEditor??={version:1};
 if(state.sourceKey!==key){state.sourceKey=key;state.controls=[];state.selected=null;}
 const previous=new Map((state.controls||[]).map(c=>[c.id,c]));
 state.controls=entries.map(e=>{
  const old=previous.get(e.id),low=e.kind==='vrm'?0:-10,high=e.kind==='vrm'?1:10;
  const min=clamp(old?.min??0,low,high),max=clamp(old?.max??1,low,high);
  return {id:e.id,min:min<max?min:0,max:min<max?max:1,value:clamp(old?.value??0,min<max?min:0,min<max?max:1)};
 });
 if(!entries.some(e=>e.id===state.selected))state.selected=entries[0]?.id??null;
 return state;
}
export function updateExpressionControl(p,key,entries,id,patch){
 const entry=entries.find(e=>e.id===id);if(!entry)throw Error('表情を選択してください。');
 const state=expressionControls(p,key,entries),control=state.controls.find(c=>c.id===id),next={...control,...patch};
 const low=entry.kind==='vrm'?0:-10,high=entry.kind==='vrm'?1:10;
 if(![next.min,next.max,next.value].every(finite)||next.min<low||next.max>high||next.min>=next.max)throw Error(entry.kind==='vrm'?'VRMの範囲は0〜1で、最小値を最大値より小さくしてください。':'範囲は-10〜10で、最小値を最大値より小さくしてください。');
 next.value=clamp(next.value,next.min,next.max);Object.assign(control,next);return control;
}
export function validateExpressionEditor(p){
 const s=p.expressionEditor;if(s===undefined)return;
 const fail=()=>{throw Error('表情調整の記録が不正です。');};
 if(s?.version!==1)fail();
 if(s.imported){const r=s.imported;if(typeof r.path!=='string')fail();safePath(r.path);if(!r.path.startsWith('documents/expression-preview/')||!['vrm','glb'].includes(r.kind)||!r.path.endsWith('.'+r.kind)||!validHash(r.sha256)||typeof r.filename!=='string'||r.filename.length>200||typeof r.modelStamp!=='string'||r.modelStamp.length>32000||!p.documents?.some(d=>d.path===r.path&&d.sha256===r.sha256))fail();}
 if(s.sourceKey!==undefined&&(typeof s.sourceKey!=='string'||s.sourceKey.length>33000))fail();
 if(s.selected!=null&&(typeof s.selected!=='string'||s.selected.length>512))fail();
 if(s.controls!==undefined){if(!Array.isArray(s.controls)||s.controls.length>512)fail();const seen=new Set();for(const c of s.controls){if(typeof c.id!=='string'||!c.id||c.id.length>512||seen.has(c.id)||![c.value,c.min,c.max].every(finite)||c.min< -10||c.max>10||c.min>=c.max||c.value<c.min||c.value>c.max)fail();seen.add(c.id);}}
}
