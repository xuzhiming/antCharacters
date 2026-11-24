// Persisted authoring state. Texture groups and spring groups partition the same
// immutable loose components independently; neither is a generated mesh identity.
export const PRODUCTION_SETTINGS = Object.freeze({model:'P2.0', topology:'quad', faces:25000, count:4, textureSize:4096, maxTextures:5, removeLighting:false});
export const TEXTURE_GROUP_IDS = Object.freeze(['hair','head','upper_body','lower_body','accessories']);
const hash = s => typeof s==='string' && /^[a-f0-9]{64}$/.test(s);
const key = s => typeof s==='string' && /^[a-z][a-z0-9_-]{0,59}$/.test(s);
const vec = v => Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
export function beginProduction(p) {
  p.version=6;
  return p.production ??= {version:2,phase:'candidates',settings:{...PRODUCTION_SETTINGS},candidates:{head:[],body:[]},selected:{},components:[],textureGroups:[],springGroups:[]};
}
export function selectedCandidates(p) {
  const w=p.production;
  return Object.fromEntries(['head','body'].map(s=>[s,w?.candidates[s].find(c=>c.id===w.selected[s])||null]));
}
export const selectionStamp=p=>JSON.stringify(Object.entries(selectedCandidates(p)).map(([s,c])=>[s,c?.id,c?.sha256]));
export const analysisStamp=p=>p.production?.segmented?JSON.stringify([selectionStamp(p),['head','body'].map(s=>p.production.segmented[s]?.sha256)]):selectionStamp(p);
export function resetRig(p) {delete p.rigGuide;delete p.weightTransferPlan;delete p.springSetup;delete p.springVerification;delete p.reviewVRM;delete p.vrmExport;p.workflow={version:1,rigging:'tripo',phase:'parts',attachHair:false,boneMap:{}};p.mode='parts';p.updatedModel=null;}
export const hasGeneratedTextures=p=>!!p.production?.textureGroups.some(g=>g.returned);
export function candidateNeedsBranch(p,source,id){return hasGeneratedTextures(p)&&p.production?.selected[source]!==id;}
export function forkCandidate(p,source,id){
 if(!p.production?.candidates[source]?.some(c=>c.id===id))throw Error('候補が見つかりません。');
 const next=structuredClone(p);next.id=crypto.randomUUID();next.name=p.name.slice(0,196)+'（分岐）';next.revision=0;delete next.savedAt;
 next.branch={version:1,parentId:p.id,parentName:p.name,at:new Date().toISOString(),source,candidateId:id};selectCandidate(next,source,id);return next;
}
export function selectCandidate(p,source,id) {
  const w=beginProduction(p);
  if(!w.candidates[source]?.some(c=>c.id===id))throw Error('候補が見つかりません。');
  if(w.selected[source]===id)return;
  w.selected[source]=id;w.phase='candidates';w.components=[];w.textureGroups=[];w.springGroups=[];
  delete w.inventory;delete w.sourceStamp;delete w.assemblyStamp;delete w.segmented;resetRig(p);
}
export function removeCandidate(p,source,id){
  const w=p.production;if(!w?.candidates[source]?.some(c=>c.id===id))throw Error('候補が見つかりません。');
  if(w.selected[source]===id){delete w.selected[source];w.phase='candidates';w.components=[];w.textureGroups=[];w.springGroups=[];delete w.inventory;delete w.sourceStamp;delete w.assemblyStamp;delete w.segmented;resetRig(p);}
  w.candidates[source]=w.candidates[source].filter(c=>c.id!==id);validateProduction(p);
}
export const textureStamp=(p,g)=>JSON.stringify([p.production.sourceStamp,g.components.slice().sort()]);
export const assemblyStamp=p=>JSON.stringify([p.production.sourceStamp,p.production.components.map(c=>[c.id,c.role]),p.production.springGroups,p.production.textureGroups.map(g=>[g.id,g.components,g.returned?.sha256,g.returned?.rotation])]);
export function setClassification(p,{textureGroups,springGroups,roles}) {
  const w=p.production;
  if(!w?.components.length||w.sourceStamp!==analysisStamp(p))throw Error('採用したモデルを先に分離してください。');
  if(!Array.isArray(springGroups))throw Error('揺れ物の分類を指定してください。対象なしは空配列です。');
  if(!Array.isArray(textureGroups))throw Error('テクスチャ用の5分類を指定してください。');
  if(!roles||Object.keys(roles).length!==w.components.length||w.components.some(c=>!Object.hasOwn(roles,c.id)))throw Error('すべての部品の役割を明示してください。');
  const old=w.textureGroups;
  // Old kits remain readable. A spring-only edit may keep their existing textures;
  // all new texture classifications use the five-part contract.
  const partition=groups=>JSON.stringify(groups.map(g=>[g.id,g.components.slice().sort()]).sort((a,b)=>a[0].localeCompare(b[0])));
  const legacySpringEdit=w.version===1&&old.length&&!old.every(g=>TEXTURE_GROUP_IDS.includes(g.id))&&partition(old)===partition(textureGroups)&&w.components.every(c=>roles[c.id]===c.role);
  const next={...w,version:legacySpringEdit?1:2,settings:{...w.settings,maxTextures:legacySpringEdit?7:5},
    components:w.components.map(c=>({...c,role:roles[c.id]})),springGroups:structuredClone(springGroups)};
  next.textureGroups=textureGroups.map(g=>{
    const previous=old.find(o=>o.id===g.id&&textureStamp(p,o)===textureStamp(p,g));
    return {...previous,id:g.id,name:g.name,components:g.components.slice()};
  });
  next.phase='textures';delete next.assemblyStamp;
  validateProduction({...p,production:next});p.production=next;resetRig(p);
}
function validateTextureLayout(w) {
  if(w.version!==2)return;
  const byId=new Map(w.components.map(c=>[c.id,c])),membership=new Map();
  for(const g of w.textureGroups){
    if(!TEXTURE_GROUP_IDS.includes(g.id))throw Error('テクスチャは髪・頭・上半身・下半身・アクセサリーの5分類です。脚・靴・スカート単独の分類は作りません。');
    const role={hair:'hair',head:'head',upper_body:'body',lower_body:'body'}[g.id];
    if(role&&g.components.some(id=>byId.get(id)?.role!==role))throw Error('テクスチャの分類と部品の役割が一致していません。');
    for(const id of g.components)membership.set(id,g.id);
  }
  if(['textures','assembled'].includes(w.phase)){
    if(['head','upper_body','lower_body'].some(id=>!w.textureGroups.some(g=>g.id===id)))throw Error('頭・上半身・衣装と脚と靴を含む下半身をそれぞれ指定してください。');
    for(const g of w.springGroups)if(g.kind==='skirt'&&g.components.some(id=>membership.get(id)!=='lower_body'))throw Error('揺れ物のスカートも、テクスチャでは脚・靴と同じ下半身へ含めてください。');
  }
}
export function validateProduction(p) {
  const w=p.production;if(!w)return;
  const fail=()=>{throw Error('部位制作の保存データが不正です。');};
  if(p.version!==6||![1,2].includes(w.version)||!['candidates','parts','textures','assembled'].includes(w.phase))fail();
  const maxTextures=w.version===1?7:5;
  if(!w.settings||Object.entries({...PRODUCTION_SETTINGS,maxTextures}).some(([k,v])=>k!=='removeLighting'&&w.settings[k]!==v)||typeof w.settings.removeLighting!=='boolean')fail();
  const docs=new Map((p.documents||[]).map(d=>[d.path,d]));
  const file=(d,fbx=false)=>{
    if(!d||!hash(d.sha256)||docs.get(d.path)?.sha256!==d.sha256||fbx&&!d.path.toLowerCase().endsWith('.fbx'))fail();
    if(d.resources!==undefined&&(!Array.isArray(d.resources)||d.resources.length>128))fail();
    for(const r of d.resources||[])if(!hash(r.sha256)||docs.get(r.path)?.sha256!==r.sha256||!r.path.startsWith(d.path.split('/').slice(0,3).join('/')+'/')||!/\.(png|jpe?g|webp)$/i.test(r.path))fail();
  };
  if(!w.candidates||!w.selected)fail();
  const candidateIds=new Set();
  for(const source of ['head','body']){
    if(!Array.isArray(w.candidates[source])||w.candidates[source].length>4)fail();
    for(const c of w.candidates[source]){
      if(!key(c.id)||candidateIds.has(c.id)||typeof c.name!=='string'||c.name.length>200)fail();candidateIds.add(c.id);file(c,true);
      if(!c.normalization||!vec(c.normalization.offset)||!Number.isFinite(c.normalization.scale)||c.normalization.scale<=0)fail();
    }
    if(w.selected[source]&&!w.candidates[source].some(c=>c.id===w.selected[source]))fail();
  }
  if(!Array.isArray(w.components)||w.components.length>4096||!Array.isArray(w.textureGroups)||w.textureGroups.length>maxTextures||!Array.isArray(w.springGroups)||w.springGroups.length>128)fail();
  const components=new Map();
  for(const c of w.components){
    if(!key(c.id)||components.has(c.id)||!['head','body'].includes(c.source)||!['head','hair','body'].includes(c.role)||c.source==='body'&&c.role!=='body'||c.source==='head'&&c.role==='body'||!Number.isInteger(c.vertices)||c.vertices<1||!Number.isInteger(c.faces)||c.faces<1||!vec(c.min)||!vec(c.max))fail();
    components.set(c.id,c);
  }
  if(w.segmented)for(const source of ['head','body']){
    const d=w.segmented[source];if(!d)continue;file(d,true);
    if(d.candidateId!==w.selected[source]||!d.normalization||!vec(d.normalization.offset)||!Number.isFinite(d.normalization.scale)||d.normalization.scale<=0)fail();
  }
  if(w.components.length){if(w.sourceStamp!==analysisStamp(p))fail();file(w.inventory,true);}
  for(const groupType of ['textureGroups','springGroups']){
    const groupIds=new Set(),members=new Set();
    for(const g of w[groupType]){
      if(!key(g.id)||groupIds.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>100||!Array.isArray(g.components)||!g.components.length)fail();groupIds.add(g.id);
      for(const id of g.components){if(!components.has(id)||members.has(id))fail();members.add(id);}
      if(new Set(g.components.map(id=>components.get(id).source)).size!==1)throw Error('頭と体は別のテクスチャ・揺れ物グループにしてください。');
      if(groupType==='springGroups'){
        if(!['hair','skirt','ribbon','strap','other'].includes(g.kind)||g.kind==='hair'&&g.components.some(id=>components.get(id).source!=='head'))fail();
        if(g.components.some(id=>components.get(id).source==='head'&&components.get(id).role!=='hair'))throw Error('頭の揺れ物には髪として分類した部品を指定してください。');
      }else{
        if(g.prepared){file(g.prepared,true);if(g.prepared.stamp!==textureStamp(p,g))fail();}
        for(const d of Object.values(g.guides||{}))file(d);
        for(const d of Object.values(g.references||{}))file(d);
        if(g.returned){file(g.returned,true);if(!g.prepared||g.returned.stamp!==g.prepared.stamp||!vec(g.returned.rotation||[0,0,0]))fail();}
      }
    }
    if(groupType==='textureGroups'&&['textures','assembled'].includes(w.phase)&&members.size!==components.size)throw Error('すべての部品を、重複なくテクスチャ用グループへ分類してください。');
  }
  validateTextureLayout(w);
  if(w.phase==='assembled'&&w.assemblyStamp!==assemblyStamp(p))throw Error('部位が変更されています。組み立て直してください。');
}
export function productionPreflight(p,operation) {
  validateProduction(p);const w=p.production;
  if(!w)throw Error('先に頭と体の候補を登録してください。');
  if(operation==='analyze'){
    if(!Object.values(selectedCandidates(p)).every(Boolean))throw Error('頭と体の候補をそれぞれ選んでください。');
    if(w.requireSegmentation&&!['head','body'].every(s=>w.segmented?.[s]))throw Error('頭と体のセグメンテーション結果を先に登録してください。');
  }else if(operation==='prepare'){
    if(w.version===1)throw Error('新しい再テクスチャの前に、髪・頭・上半身・下半身・アクセサリーの5分類へ分類し直してください。既存のテクスチャは読み込めます。');
    if(!['textures','assembled'].includes(w.phase)||!w.textureGroups.length)throw Error('先にテクスチャ単位と揺れ物を分類してください。');
  }else if(operation==='assemble'){
    if(!w.textureGroups.length||w.textureGroups.some(g=>!g.returned))throw Error('全部位の再テクスチャ済みFBXを読み込んでください。');
  }else throw Error('Unknown production operation');
}
export function previewProject(p) {
  const w=p.production;if(!w||w.phase==='assembled'||p.mode==='assembled')return p;
  const assets=Object.entries(selectedCandidates(p)).filter(([,c])=>c).map(([s,c])=>({...c,...w.segmented?.[s],...(w.inventory?{...w.inventory,componentSource:s}:{}),normalization:w.segmented?.[s]?.normalization||c.normalization,role:s==='head'?'head_neutral':'body'}));
  return {...p,assets,mode:'parts',rigGuide:null};
}
