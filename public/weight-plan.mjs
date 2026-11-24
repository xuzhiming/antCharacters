import {rigSourceStamp} from './workflow.mjs';
export const currentSpringReview=p=>p.weightTransferPlan?.version===2
 ? p.weightTransferPlan.bodyHash===p.assets.find(a=>a.role==='body')?.sha256
 : !!p.weightTransferPlan&&p.weightTransferPlan.sourceStamp===rigSourceStamp(p);
export function validateWeightPlan(p){
 const plan=p.weightTransferPlan;if(plan===undefined)return;
 if(plan?.version===2){
  const names=plan.springObjects?.map(o=>o.name);
  if(!/^[a-f0-9]{64}$/.test(plan.bodyHash||'')||plan.bodyObject!=='Body'||!Array.isArray(names)||names.length>128||new Set(names).size!==names.length||!plan.springObjects.every(o=>typeof o.name==='string'&&o.name!=='Body'&&o.name.length>0&&new TextEncoder().encode(o.name).length<=60&&!/[\x00-\x1f/\\]/.test(o.name)&&['skirt','ribbon','strap','other'].includes(o.kind)&&o.separated===true))throw Error('揺れ物の分離情報が不正です。');
  return;
 }
 if(!plan||plan.version!==1||typeof plan.sourceStamp!=='string'||plan.sourceStamp.length>8000||!Array.isArray(plan.excludeComponents)||plan.excludeComponents.length>2048||new Set(plan.excludeComponents).size!==plan.excludeComponents.length||!plan.excludeComponents.every(id=>typeof id==='string'&&/^body:\d{1,4}:\d{1,7}$/.test(id)))throw Error('揺れ物の除外情報が不正です。');
}
export function transferPreflight(p){
 validateWeightPlan(p);
 if(p.mode!=='parts'||!p.rigGuide)throw Error('先にリギング済みFBXから骨配置を読み込んでください。');
 const stamp=rigSourceStamp(p);
 if(p.rigGuide.sourceStamp!==stamp)throw Error('元の頭・体が変わっています。骨配置を読み込み直してください。');
 if(!p.weightTransferPlan)throw Error('揺れ物の除外対象を確認したキットが必要です。「揺れ物を推定する」からAstraへ依頼し、返却キットを開いてください。');
 if(!currentSpringReview(p))throw Error('揺れ物の除外情報が古くなっています。現在のモデルで確認し直してください。');
 return p.weightTransferPlan.version===2?p.weightTransferPlan.springObjects.map(o=>o.name):p.weightTransferPlan.excludeComponents;
}
