import {activeImageSlots} from './images.mjs';
import {selectionStamp} from './production.mjs';
import {rigSourceStamp} from './workflow.mjs';
import {THREE_VIEWS} from './three-view-data.mjs';
import {currentReviewVRM} from './review-vrm.mjs';
import {expressionSourceStamp,currentExpressions} from './expression-authoring.mjs';
import {importedExpressionModel} from './expression-editor-data.mjs';

export const TASKS = ['images','image-edit','candidates','materials','rig','expressions','finish'];
export const taskLabels = {images:'8枚の画像を制作','image-edit':'選んだ画像を修正',candidates:'モデル候補を生成',materials:'部位とテクスチャを仕上げる',rig:'骨・ウェイト・揺れ物を設定',expressions:'目・口・眉の表情を制作',finish:'VRMを書き出す'};
export const journey = p => p.journey ??= {version:1,confirmed:{},completed:{}};
export const sourceStamp = p => p.assets.find(a=>a.path===p.sourceImage)?.sha256 || '';
export const imageStamp = p => JSON.stringify(activeImageSlots.map(s=>[s.id,p.imageLibrary?.versions.find(v=>v.id===p.imageLibrary.slots[s.id]?.adopted)?.sha256||null]));
export const imageCount = p => activeImageSlots.filter(s=>p.imageLibrary?.versions.some(v=>v.id===p.imageLibrary.slots[s.id]?.adopted)).length;
export const hasCandidates = p => ['head','body'].every(s=>p.production?.candidates[s]?.length);
export const hasSelection = p => ['head','body'].every(s=>p.production?.candidates[s]?.some(c=>c.id===p.production.selected[s]));
export const hasAssembly = p => (!p.production||p.production.phase==='assembled')&&['body','head_neutral'].every(r=>p.assets.some(a=>a.role===r));
export const isWeighted = p => p.mode==='assembled'&&['weighted','springs'].includes(p.workflow?.phase);
export function inputStamp(p,kind,context){
 if(kind==='expressions')return expressionSourceStamp(p);
 if(kind==='image-edit')return sourceStamp(p)+'|'+JSON.stringify(p.imageLibrary.versions.filter(v=>v.slot!==context?.slot&&p.imageLibrary.slots[v.slot]?.adopted===v.id).map(v=>[v.slot,v.sha256]).sort());
 if(kind==='images')return sourceStamp(p);
 if(kind==='candidates')return sourceStamp(p)+'|'+imageStamp(p);
 if(kind==='materials')return inputStamp(p,'candidates')+'|'+selectionStamp(p);
 if(kind==='rig')return inputStamp(p,'materials')+'|'+rigSourceStamp(p)+'|'+JSON.stringify(p.placements.hair||null);
 if(kind==='finish')return inputStamp(p,'rig')+'|'+p.assets.find(a=>a.path===p.updatedModel?.path)?.sha256;
 throw Error('不明な制作工程です。');
}
export function stale(p,kind){const stamp=p.journey?.completed?.[kind];return !!stamp&&stamp!==inputStamp(p,kind);}
export function preflight(p,kind,context){
 if(!TASKS.includes(kind))throw Error('不明な制作工程です。');
 if(kind==='image-edit'&&!p.imageLibrary?.versions.some(v=>v.slot===context?.slot&&v.id===context?.imageId&&p.imageLibrary.slots[v.slot]?.adopted===v.id))throw Error('修正する画像を選び直してください。');
 if(kind==='images'&&!sourceStamp(p))throw Error('元絵を登録してください。');
 if(kind==='candidates'&&(imageCount(p)!==8||stale(p,'images')))throw Error('現在の元絵に合う8枚の画像を確認してください。');
 if(kind==='materials'&&(!hasSelection(p)||stale(p,'images')||stale(p,'candidates')))throw Error('現在の画像から作った頭と体の候補を決定してください。');
 if(kind==='rig'&&(!hasAssembly(p)||stale(p,'images')||stale(p,'candidates')||stale(p,'materials')))throw Error('現在の候補を組み立て、頭身を調整してください。');
 if(kind==='finish'&&(!isWeighted(p)||stale(p,'rig')))throw Error('現在の配置の動作確認を行ってください。');
 if(kind==='expressions'&&importedExpressionModel(p)?.kind!=='vrm'&&(!isWeighted(p)||stale(p,'rig')))throw Error('骨とウェイトを設定した現在のモデルを用意してください。');
}
export function checkResult(p,kind,context){
 if(kind==='expressions'){if(!currentExpressions(p))throw Error('現在のモデルの表情を同じプロジェクトへ登録してください。');return;}
 if(kind==='images'&&!THREE_VIEWS.every(view=>p.threeViews?.views[view]))throw Error('画像制作の最後に、バランス調整用の正面・右側面・背面の三面図を登録してください。');
 const valid={'image-edit':p.imageLibrary?.versions.some(v=>v.slot===context?.slot&&p.imageLibrary.slots[v.slot]?.adopted===v.id&&v.sha256!==context.sha256),images:imageCount(p)===8,candidates:['head','body'].every(s=>p.production?.candidates[s]?.length===4),materials:hasAssembly(p)&&p.production?.phase==='assembled',rig:isWeighted(p)&&p.workflow.phase==='springs',finish:isWeighted(p)&&p.workflow.phase==='springs'};
 if(!valid[kind])throw Error('工程が完了していません。必要な成果物を登録してください。');
}
export function nextCheckpoint(p){
 if(!sourceStamp(p)&&!hasAssembly(p)&&!hasCandidates(p))return {stage:'images',kind:'images',label:'画像の生成を依頼',hint:'まず元絵を登録してください。',ready:false,index:0};
 if((imageCount(p)<8||stale(p,'images'))&&!hasAssembly(p)&&!hasCandidates(p)||stale(p,'images'))return {stage:'images',kind:'images',label:'画像の生成を依頼',hint:'髪込みの頭と体の4方向、8枚を制作します。',ready:!!sourceStamp(p),index:0};
 if(!hasCandidates(p)&&!hasAssembly(p)||stale(p,'candidates'))return {stage:'images',kind:'candidates',label:'画像を確認して次へ',hint:'4方向を切り替えて、8枚の形と塗りを確認してください。',ready:imageCount(p)===8,index:1};
 if(!hasAssembly(p)||stale(p,'materials'))return {stage:'assets',kind:'materials',label:'メッシュを確定して次へ',hint:'頭と体の候補をそれぞれ確認し、決定してください。',ready:hasSelection(p),index:2};
 if(!isWeighted(p)||stale(p,'rig'))return {stage:'placement',kind:'rig',label:'頭身を確定して次へ',hint:'位置・サイズで頭身を合わせてください。次は骨と揺れ物を設定します。',ready:true,index:3};
 const done=!!p.journey?.completed?.finish&&!stale(p,'finish');
 return {stage:'review',kind:'finish',done,label:'VRMを書き出す',hint:done?'VRMを保存しました。動作確認から同じVRMをもう一度保存できます。':'完成VRMの見た目と動きを確認してください。保存はアプリ内で行えます。',ready:!!currentReviewVRM(p),index:4};
}
export function validateJourney(p){
 const j=p.journey;if(!j)return;
 if(j.version!==1||!j.confirmed||!j.completed)throw Error('制作の進捗情報が不正です。');
 for(const map of [j.confirmed,j.completed])if(typeof map!=='object'||Array.isArray(map)||Object.entries(map).some(([k,v])=>!TASKS.includes(k)||typeof v!=='string'||v.length>32000))throw Error('制作の確認情報が不正です。');
}
