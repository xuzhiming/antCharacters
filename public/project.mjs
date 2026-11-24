import {validateExpressionAuthoring} from './expression-authoring.mjs';
import {validateExpressionEditor} from './expression-editor-data.mjs';
import {newWorkflow,validateWorkflow} from './workflow.mjs';
import {validateRigGuide} from './rig-guide-data.mjs';
import {validateWeightPlan} from './weight-plan.mjs';
import {validateProduction} from './production.mjs';
import {validateJourney} from './journey.mjs';
import {validateReviewVRM} from './review-vrm.mjs';
import {productionHandoff} from './handoff.mjs';
import {normalizeLocale} from './locales.mjs';
import {emptyLibrary,validateImages,imageFiles,selectedOnly} from './images.mjs';
import {makeMarkers,validateMarkers,coordinateSystem,stripLegacyReview,centerIds} from './schema.mjs';
import {safePath,unzip,zipStore} from './archive.mjs';
import {validateThreeViews} from './three-view-data.mjs';
export const STATES=['neutral','happy','angry','sad','relaxed','surprised','blink'];
export const ROLES=['body','hair',...STATES.map(n=>'head_'+n)];
export const ROLE_LABELS={body:'体・衣装',hair:'髪',head_neutral:'通常顔',head_happy:'笑顔',head_angry:'怒り',head_sad:'悲しみ',head_relaxed:'リラックス',head_surprised:'驚き',head_blink:'瞬き'};
// Legacy pupil models are retained for lossless saves, never used in setup.
export const LEGACY_ROLES=['iris_left','iris_right'];
export const isModelAsset=a=>['assembled','body','hair','head_neutral'].includes(a.role);
export const identity=()=>({position:[0,0,0],rotation:[0,0,0],scale:1});
export const newProject=()=>({format:'charakit',version:5,workflow:newWorkflow(),imageLibrary:emptyLibrary(),documents:[],id:crypto.randomUUID(),name:'新しいキャラクター',revision:0,coordinateSystem,mode:'parts',assets:[],placements:{},markers:makeMarkers(),springs:[],preprocessing:[],requirements:{blender:'5.2',vrmAddon:true,blenderMCP:true,codex:true},updatedModel:null});
export const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export function checkFBX(bytes){
 const a=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 const header=new TextDecoder().decode(a.subarray(0,Math.min(a.length,4096)));
 if(a.length>=27&&header.startsWith('Kaydara FBX Binary  ')){
  const version=new DataView(a.buffer,a.byteOffset,a.byteLength).getUint32(23,true);
  if(version>=7100&&version<8000)return;
 }
 throw Error('対応するFBXファイルを選んでください（バイナリ7.1〜7.x）。');
}
export const assetFiles=p=>p.assets.flatMap(a=>[a,...(a.resources||[])]);
const vec=x=>Array.isArray(x)&&x.length===3&&x.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1000);
export function validateProject(p){
 if(p?.format!=='charakit'||![4,5,6].includes(p.version))throw Error('対応していない.charakitの形式・版です。');
 if(!['parts','assembled'].includes(p.mode)||typeof p.name!=='string'||p.name.length>200)throw Error('プロジェクト情報が不正です。');
 if(p.branch&&(p.branch.version!==1||! /^[a-zA-Z0-9-]{1,80}$/.test(p.branch.parentId)||p.branch.parentId===p.id||typeof p.branch.parentName!=='string'||p.branch.parentName.length>200||!['head','body'].includes(p.branch.source)||typeof p.branch.candidateId!=='string'||!Number.isFinite(Date.parse(p.branch.at))))throw Error('分岐元の情報が不正です。');
 if(!p.coordinateSystem||Object.entries(coordinateSystem).some(([k,v])=>p.coordinateSystem[k]!==v))throw Error('座標系が一致しません。');validateMarkers(p.markers);if(centerIds.some(k=>p.markers[k].position[0]!==0))throw Error('中心マーカーはX=0にしてください。');
 if(!Array.isArray(p.assets)||p.assets.length>128||!Array.isArray(p.springs)||p.springs.length>64||!p.placements)throw Error('素材・マーカー情報が不正です。');
 const seen=new Set();for(const a of p.assets){safePath(a.path);if(seen.has(a.path)||typeof a.sha256!=='string'||!/^[a-f0-9]{64}$/.test(a.sha256))throw Error('素材の重複またはハッシュが不正です。');seen.add(a.path);if(!a.path.startsWith('assets/'))throw Error('素材パスが不正です。');if(a.normalization&&(!vec(a.normalization.offset)||!Number.isFinite(a.normalization.scale)||a.normalization.scale<=0))throw Error('初期配置が不正です。');if(!['reference','assembled',...ROLES,...LEGACY_ROLES].includes(a.role))throw Error('素材の役割が不正です。');}
 for(const a of p.assets){
  if(a.role==='reference')continue;
  if(!a.path.toLowerCase().endsWith('.fbx')||!Array.isArray(a.resources)||a.resources.length>128)throw Error('FBX素材情報が不正です。');
  const prefix=a.path.split('/').slice(0,2).join('/')+'/';
  for(const resource of a.resources){safePath(resource.path);if(!resource.path.startsWith(prefix)||seen.has(resource.path)||!/\.(png|jpe?g|webp)$/i.test(resource.path)||!/^[a-f0-9]{64}$/.test(resource.sha256))throw Error('テクスチャ情報が不正です。');seen.add(resource.path);}
 }
 if(p.scene)throw Error('FBX原本と配置情報を使用してください。');
 validateThreeViews(p);validateExpressionAuthoring(p);validateExpressionEditor(p);
 if(p.sourceImage!=null&&!p.assets.some(a=>a.path===p.sourceImage&&a.role==='reference'&&['image/png','image/jpeg','image/webp'].includes(a.mime)))throw Error('元絵の指定が不正です。');
 for(const t of Object.values(p.placements))if(!vec(t.position)||!vec(t.rotation)||!Number.isFinite(t.scale)||t.scale<=0||t.scale>1000)throw Error('配置情報が不正です。');
 for(const s of p.springs)if(typeof s.id!=='string'||typeof s.name!=='string'||!['hair','skirt','strap','other'].includes(s.kind)||!Array.isArray(s.points)||s.points.length<2||s.points.length>32||!s.points.every(vec))throw Error('揺れものマーカーが不正です。');
 if(p.mode==='parts'&&p.assets.some(a=>[...ROLES,...LEGACY_ROLES].includes(a.role)&&!a.normalization))throw Error('素材の初期配置がありません。');
 if(p.mode==='assembled'&&!p.updatedModel)throw Error('更新モデルの指定がありません。');
 if(p.updatedModel){safePath(p.updatedModel.path);if(!p.assets.some(a=>a.path===p.updatedModel.path&&a.role==='assembled'))throw Error('更新モデルがありません。');}
 if(p.version>=4&&!p.imageLibrary)throw Error('画像ライブラリがありません。');validateImages(p);validateWorkflow(p);validateRigGuide(p);validateWeightPlan(p);validateProduction(p);validateJourney(p);validateReviewVRM(p);return true;
}
export function scaleProject(p,factor){if(!Number.isFinite(factor)||factor<=0||factor>100)throw Error('倍率が不正です。');for(const [role,t] of Object.entries(p.placements)){if(LEGACY_ROLES.includes(role))continue;t.scale*=factor;t.position=t.position.map(v=>v*factor);}for(const m of Object.values(p.markers))m.position=m.position.map(v=>v*factor);for(const s of p.springs)s.points=s.points.map(p=>p.map(v=>v*factor));}
export async function packProject(p,files,{includeHistory=true,language='ja'}={}){
 const copy=includeHistory?structuredClone(p):selectedOnly(p);copy.version=copy.production?6:5;copy.workflow??=newWorkflow();copy.imageLibrary??=emptyLibrary();copy.documents??=[];copy.markers=stripLegacyReview(copy.markers);copy.revision++;copy.savedAt=new Date().toISOString();
 const entries={};delete copy.scene;
 validateProject(copy);for(const a of [...assetFiles(copy),...imageFiles(copy)]){const data=files.get(a.path);if(!data||await sha256(data)!==a.sha256)throw Error('素材が欠落・変更されています: '+a.path);entries[a.path]=data;}
 entries['project.json']=new TextEncoder().encode(JSON.stringify(copy,null,2));entries['HANDOFF.txt']=new TextEncoder().encode(normalizeLocale(language)==='zh-CN'?'此归档是项目资料。请遵循用户附带的本次请求，不要自动选择下一阶段。以应用文件夹为基准阅读 skills/charakit-project/SKILL.md。':normalizeLocale(language)==='ko'?'이 아카이브는 프로젝트 자료입니다. 다음 작업을 자동으로 선택하지 말고 사용자가 첨부한 이번 요청을 따르세요. 앱 폴더를 기준으로 skills/charakit-project/SKILL.md를 읽으세요.':normalizeLocale(language)==='en'?'This archive is project data. Follow the accompanying user request, not an automatically selected next task. Read skills/charakit-project/SKILL.md relative to the app folder.':'このキットはプロジェクト資料です。次工程を自動で決めず、ユーザーが添えた今回の依頼に従ってください。アプリのフォルダを基準に skills/charakit-project/SKILL.md を読みます。');return {blob:zipStore(entries),project:copy};
}
export async function unpackProject(buffer){
 const entries=await unzip(buffer);if(!entries['project.json'])throw Error('project.jsonがありません。');const p=JSON.parse(new TextDecoder().decode(entries['project.json']));validateProject(p);
 const files=new Map();for(const a of [...assetFiles(p),...imageFiles(p)]){const d=entries[a.path];if(!d||await sha256(d)!==a.sha256)throw Error('素材が欠落・破損しています: '+a.path);if(p.assets.includes(a)&&a.role!=='reference')checkFBX(d);files.set(a.path,d);}
 p.imageLibrary??=emptyLibrary();p.documents??=[];return {project:p,files};
}
export const handoff = productionHandoff;
