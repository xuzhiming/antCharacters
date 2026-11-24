import {safePath} from './archive.mjs';
export const AUTHORING_PRESETS=Object.freeze(['aa','blink','happy']);
export function expressionModelStamp(p){return JSON.stringify({model:p.assets.find(a=>a.path===p.updatedModel?.path)?.sha256||null,parts:p.assets.filter(a=>['body','hair','head_neutral'].includes(a.role)).map(a=>[a.role,a.sha256]),placements:p.placements,springBlend:p.springSetup?.blendHash||null});}
export function expressionSourceStamp(p){const base=expressionModelStamp(p),imported=p.expressionEditor?.imported;return imported?.modelStamp===base?JSON.stringify({...JSON.parse(base),imported:imported.sha256}):base;}
export function currentExpressions(p){const e=p.expressionAuthoring;return [1,2].includes(e?.version)&&e.sourceStamp===expressionSourceStamp(p)?e:null;}
export function validateExpressionAuthoring(p){
 const e=p.expressionAuthoring;if(e===undefined)return;
 const fail=()=>{throw Error('表情制作の結果が不正です。');};
 if(![1,2].includes(e?.version)||typeof e.sourceStamp!=='string'||e.sourceStamp.length>32000||typeof e.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(e.sourceSha256)||!e.keys||!Array.isArray(e.files)||e.files.length>1024||(e.version===1?e.visualReview!=='passed':e.visualReview!=='ready_for_review')||e.userReview!=='pending')fail();
 const docs=new Map((p.documents||[]).map(d=>[d.path,d]));const seen=new Set();
 for(const a of e.files){safePath(a.path);safePath(a.relative);if(!a.path.startsWith('documents/expression-authoring/')||seen.has(a.relative)||!docs.has(a.path)||docs.get(a.path).sha256!==a.sha256)fail();seen.add(a.relative);}
 for(const name of ['blend','glb','report','session'])if(typeof e[name]!=='string'||!e.files.some(a=>a.path===e[name]))fail();
 if(!Object.keys(e.keys).length||Object.keys(e.keys).length>128)fail();
 for(const expression of e.version===1?AUTHORING_PRESETS:Object.keys(e.keys)){const bindings=e.keys[expression];if(!Array.isArray(bindings)||!bindings.length||bindings.length>128||bindings.some(b=>typeof b.object!=='string'||!b.object||b.object.length>200||typeof b.key!=='string'||!b.key||b.key.length>200))fail();}
}
