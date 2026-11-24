import {inspectMToonVRM} from './mtoon-vrm.mjs';
import {inspectPreviewGLTF} from './preview-gltf.mjs';

export const reviewSourceStamp=p=>JSON.stringify([p.mode,p.updatedModel?.path,p.assets.find(a=>a.path===p.updatedModel?.path),p.springSetup,p.weightTransferPlan,p.placements,p.workflow?.attachHair]);
function sourceMatches(r,p){
  if(r.version===2)return r.sourceStamp===reviewSourceStamp(p);
  // Version 1 included export information in the model identity. Keep old kits
  // usable without rebuilding their already verified model when information changes.
  try{const source=JSON.parse(r.sourceStamp);return r.version===1&&Array.isArray(source)&&source.length===8&&JSON.stringify(source.slice(0,7))===reviewSourceStamp(p);}catch{return false;}
}
export function currentReviewVRM(p){
  const r=p.reviewVRM;
  return r&&sourceMatches(r,p)&&p.springVerification?.vrmHash===r.sha256&&p.springVerification.blendHash===p.springSetup?.blendHash&&p.documents?.some(d=>d.path===r.path&&d.sha256===r.sha256)?r:null;
}
export function validateReviewVRM(p){
  for(const r of [p.reviewVRM,p.vrmExport].filter(Boolean)){
    if(![1,2].includes(r.version)||typeof r.sourceStamp!=='string'||r.sourceStamp.length>32000||!p.documents?.some(d=>d.path===r.path&&d.sha256===r.sha256))throw Error('動作確認VRMの記録が不正です。');
  }
}
const bufferOf=bytes=>bytes instanceof ArrayBuffer?bytes:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
export async function registerReviewVRM(p,files,bytes,{final=false,reviewedHash}={}){
  inspectMToonVRM(bytes);
  p.documents??=[];
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bufferOf(bytes)));
  const sha256=Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
  const path='documents/vrm/'+sha256+'.vrm';
  if(!p.documents.some(d=>d.path===path))p.documents.push({path,sha256,filename:final?'avatar.vrm':'review.vrm'});
  files.set(path,new Uint8Array(bufferOf(bytes)));
  const record={version:2,path,sha256,sourceStamp:reviewSourceStamp(p),...(reviewedHash?{reviewedHash}:{})};
  if(final)p.vrmExport=record;else{p.reviewVRM=record;delete p.vrmExport;}
  return record;
}
export function vrmMetadata(bytes){return structuredClone(inspectPreviewGLTF(bufferOf(bytes),'vrm').extensions.VRMC_vrm.meta);}
export function exportMetadataReady(p,files){
  const r=currentReviewVRM(p),bytes=r&&files.get(r.path);if(!bytes)return false;
  try{finalizeVRM(bytes,p.vrmMetadata??{});return true;}catch{return false;}
}
// Only replace the JSON metadata. Mesh buffers, textures, MToon and springs
// stay byte-for-byte identical to the model shown in motion review.
export function finalizeVRM(bytes,metadata){
  inspectMToonVRM(bytes);const buffer=bufferOf(bytes),view=new DataView(buffer);
  const json=inspectPreviewGLTF(buffer,'vrm');
  if(view.getUint32(0,true)!==0x46546c67)throw Error('バイナリVRMを指定してください。');
  const old=json.extensions.VRMC_vrm.meta??{},next={...old};
  const strings=['name','version','copyrightInformation','contactInformation','thirdPartyLicenses','otherLicenseUrl'];
  const enums={avatarPermission:['onlyAuthor','onlySeparatelyLicensedPerson','everyone'],commercialUsage:['personalNonProfit','personalProfit','corporation'],creditNotation:['required','unnecessary'],modification:['prohibited','allowModification','allowModificationRedistribution']};
  const booleans=['allowExcessivelyViolentUsage','allowExcessivelySexualUsage','allowPoliticalOrReligiousUsage','allowAntisocialOrHateUsage','allowRedistribution'];
  for(const key of Object.keys(metadata)){
    const v=metadata[key];
    if(strings.includes(key)){if(typeof v!=='string'||v.length>2000)throw Error('モデル情報を確認してください。');next[key]=v.trim();}
    else if(key==='authors'){if(!Array.isArray(v)||v.length>20||v.some(s=>typeof s!=='string'||s.length>200))throw Error('作者名を確認してください。');next.authors=v.map(s=>s.trim()).filter(Boolean);}
    else if(enums[key]){if(!enums[key].includes(v))throw Error('利用条件を確認してください。');next[key]=v;}
    else if(booleans.includes(key)){if(typeof v!=='boolean')throw Error('利用条件を確認してください。');next[key]=v;}
    else throw Error('対応していないモデル情報です: '+key);
  }
  if(typeof next.name!=='string'||!next.name.trim()||!Array.isArray(next.authors)||!next.authors.length||next.authors.some(s=>typeof s!=='string'||!s.trim()||s.trim()==='__CHARAKIT_REVIEW__'))throw Error('モデル名と作者名を入力してください。');
  next.name=next.name.trim();next.authors=next.authors.map(s=>s.trim());
  if(next.otherLicenseUrl&&!/^https?:\/\//i.test(next.otherLicenseUrl))throw Error('追加の利用条件はhttp(s)のURLを入力してください。');
  next.licenseUrl='https://vrm.dev/licenses/1.0/';json.extensions.VRMC_vrm.meta=next;
  const encoded=new TextEncoder().encode(JSON.stringify(json)),length=Math.ceil(encoded.length/4)*4;
  const tail=new Uint8Array(buffer,20+view.getUint32(12,true));
  const result=new Uint8Array(20+length+tail.length),out=new DataView(result.buffer);
  out.setUint32(0,0x46546c67,true);out.setUint32(4,2,true);out.setUint32(8,result.length,true);out.setUint32(12,length,true);out.setUint32(16,0x4e4f534a,true);
  result.fill(32,20,20+length);result.set(encoded,20);result.set(tail,20+length);inspectMToonVRM(result);return result;
}
