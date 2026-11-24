import {safePath} from './archive.mjs';
export const IMAGE_STATES=['neutral','happy','angry','sad','relaxed','surprised','blink'];
export const VIEWS=['front','left','right','back'];
export const IMAGE_PARTS=['head','body'];
export const imageSlots=[{id:'pupils',part:'pupils',view:null,state:null},...['head','hair','body'].flatMap(part=>VIEWS.map(view=>({id:`${part}/${view}/neutral`,part,view,state:'neutral'}))),...IMAGE_STATES.slice(1).flatMap(state=>['front','right'].map(view=>({id:`head/${view}/${state}`,part:'head',view,state})))];
// Read-only compatibility: retain old data without exposing it as current slots.
export const activeImageSlots=imageSlots.filter(s=>s.state==='neutral'&&IMAGE_PARTS.includes(s.part));
export const hasSeparateHairImages=p=>(p.imageLibrary?.versions||[]).some(v=>v.slot.startsWith('hair/'));
// Existing separate-hair images remain accessible and exportable without migration.
export const currentImageSlots=p=>hasSeparateHairImages(p)?imageSlots.filter(s=>s.state==='neutral'):activeImageSlots;
export const inactiveImageSlot=id=>!activeImageSlots.some(s=>s.id===id);
export const legacyImageSlots=['iris_left/front/neutral','iris_right/front/neutral'];
const validSlot=id=>imageSlots.some(s=>s.id===id)||legacyImageSlots.includes(id);
export const emptyLibrary=()=>({slots:{},versions:[],modelSources:{}});
export function library(p){return p.imageLibrary??=emptyLibrary();}
export const imageFiles=p=>[...(p.imageLibrary?.versions||[]),...(p.documents||[])];
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
export function validateImages(p){
 const l=p.imageLibrary;if(!l)return;if(!l.slots||!Array.isArray(l.versions)||l.versions.length>384||!l.modelSources)throw Error('画像ライブラリが不正です。');
 const ids=new Set(),paths=new Set(p.assets.map(a=>a.path));
 for(const v of l.versions){safePath(v.path);if(!v.path.startsWith('images/')||paths.has(v.path)||typeof v.id!=='string'||ids.has(v.id)||!hash(v.sha256)||!['image/png','image/jpeg','image/webp'].includes(v.mime)||!validSlot(v.slot)||!Number.isInteger(v.width)||!Number.isInteger(v.height)||v.width<1||v.height<1||v.width>8192||v.height>8192||!Array.isArray(v.references)||!v.references.every(r=>typeof r==='string')||typeof v.note!=='string'||!(v.prompt===null||typeof v.prompt==='string'))throw Error('画像の版情報が不正です。');ids.add(v.id);paths.add(v.path);}
 for(const [id,s] of Object.entries(l.slots)){if(!validSlot(id)||typeof s.note!=='string'||(s.adopted!==null&&!l.versions.some(v=>v.id===s.adopted&&v.slot===id)))throw Error('採用画像の指定が不正です。');}
 for(const v of l.versions)for(const r of v.references)if(!paths.has(r))throw Error('参照画像がありません: '+r);
 for(const [path,source] of Object.entries(l.modelSources)){if(!p.assets.some(a=>a.path===path&&a.role!=='reference')||!Array.isArray(source)||!source.every(id=>ids.has(id)))throw Error('モデルの生成元画像が不正です。');}
 if(p.documents!==undefined&&!Array.isArray(p.documents))throw Error('制作記録が不正です。');
 for(const d of p.documents||[]){safePath(d.path);if(!d.path.startsWith('documents/')||paths.has(d.path)||!hash(d.sha256))throw Error('制作記録のパスが不正です。');paths.add(d.path);}
}
export function adoptImage(p,slot,id){const l=library(p);if(!imageSlots.some(s=>s.id===slot)||!l.versions.some(v=>v.id===id&&v.slot===slot))throw Error('候補画像がありません。');l.slots[slot]??={adopted:null,note:''};l.slots[slot].adopted=id;}
export function adoptedVersions(p){const l=library(p);return l.versions.filter(v=>imageSlots.some(s=>s.id===v.slot)&&l.slots[v.slot]?.adopted===v.id);}
export function modelImageStatus(p,path){const l=library(p),source=l.modelSources[path];if(!source?.length)return 'unknown';return source.some(id=>{const v=l.versions.find(v=>v.id===id);return !v||l.slots[v.slot]?.adopted!==id;})?'stale':'current';}
export function selectedOnly(p){const copy=structuredClone(p),l=library(copy),keep=new Set(adoptedVersions(copy).map(v=>v.id));for(const v of l.versions)if(inactiveImageSlot(v.slot))keep.add(v.id);for(const ids of Object.values(l.modelSources))for(const id of ids)keep.add(id);
 let changed=true;while(changed){changed=false;for(const v of l.versions.filter(v=>keep.has(v.id)))for(const r of v.references){const ref=l.versions.find(v=>v.path===r);if(ref&&!keep.has(ref.id)){keep.add(ref.id);changed=true;}}}
 l.versions=l.versions.filter(v=>keep.has(v.id));return copy;
}
export function imageHandoff(p){return 'Use character-parts-images and character-material-brushup for 8 neutral views: head including all hair, and clothed T-pose body, each front/left/right/back. Preserve legacy separate-hair, expression and pupil data; do not produce new expressions or pupil textures.';}
