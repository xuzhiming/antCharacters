export const THREE_VIEWS=['front','side','back'];
export const CAMERA_VIEWS={front:'front',side:'right',back:'back'};
export const guideView=view=>Object.keys(CAMERA_VIEWS).find(key=>CAMERA_VIEWS[key]===view);
export const emptyThreeViews=()=>({version:1,visible:true,views:{}});
export const guidePaths=p=>new Set(Object.values(p.threeViews?.views||{}).map(v=>v.path));

export function guideMetrics(guide){
 const frame=guide.frame||{top:0,bottom:1};
 return {height:guide.height*(frame.bottom-frame.top),bottom:guide.y-(frame.bottom-.5)*guide.height};
}

// Share the character's height and foot level, not the height of image margins.
export function alignThreeViews(data,source,changes={}){
 const guides=Object.values(data.views),basis=data.views[source];if(!basis)return;
 const current=guideMetrics(basis),fractions=guides.map(g=>(g.frame?.bottom??1)-(g.frame?.top??0));
 const height=Math.max(Math.max(...fractions)*.01,Math.min(Math.min(...fractions)*20,changes.height??current.height));
 const offsets=guides.map((g,i)=>((g.frame?.bottom??1)-.5)*height/fractions[i]);
 const bottom=Math.max(Math.max(...offsets.map(v=>-10-v)),Math.min(Math.min(...offsets.map(v=>10-v)),changes.bottom??current.bottom));
 guides.forEach((g,i)=>{g.height=height/fractions[i];g.y=bottom+offsets[i];if(changes.locked!==undefined)g.locked=changes.locked;});
}

export function validateThreeViews(p){
 const data=p.threeViews;if(data===undefined)return;
 const invalid=()=>{throw Error('三面図の設定が不正です。');};
 if(!data||data.version!==1||typeof data.visible!=='boolean'||!data.views||typeof data.views!=='object'||Array.isArray(data.views))invalid();
 for(const [key,v] of Object.entries(data.views)){
  if(!THREE_VIEWS.includes(key)||!v||typeof v!=='object')invalid();
  const asset=p.assets.find(a=>a.path===v.path&&a.role==='reference');
  if(!asset||!['image/png','image/jpeg','image/webp'].includes(asset.mime))invalid();
  if(!Number.isFinite(v.x)||Math.abs(v.x)>10||!Number.isFinite(v.y)||Math.abs(v.y)>10||!Number.isFinite(v.height)||v.height<.01||v.height>20||!Number.isFinite(v.opacity)||v.opacity<0||v.opacity>1||typeof v.locked!=='boolean')invalid();
  if(v.autoFit!==undefined&&typeof v.autoFit!=='boolean')invalid();
  if(v.frame!==undefined&&(!v.frame||typeof v.frame!=='object'||![v.frame.top,v.frame.bottom].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||v.frame.top>=v.frame.bottom))invalid();
 }
}

// Generated guides are fitted once, when the assembled model is first available.
export function fitPendingThreeViews(p,{height,minY,centerX=0,centerZ=0},frames={}){
 let changed=false;
 for(const [view,guide] of Object.entries(p.threeViews?.views||{})){
  if(!guide.autoFit||guide.locked)continue;
  const frame=frames[view]||{top:0,bottom:1},imageHeight=Math.min(20,Math.max(.01,height/(frame.bottom-frame.top)));
  guide.height=imageHeight;guide.x=Math.max(-10,Math.min(10,view==='side'?centerZ:view==='back'?-centerX:centerX))||0;guide.y=Math.max(-10,Math.min(10,minY+(frame.bottom-.5)*imageHeight));guide.frame=frame;guide.autoFit=false;changed=true;
 }return changed;
}

// The image stays in model-space meters when the camera pans or zooms.
// Right-side view looks along +X, with screen-right along +Z.
export function guidePlacement(view,v){
 if(!THREE_VIEWS.includes(view))throw Error('三面図の方向が不正です。');
 return {position:view==='side'?[0,v.y,v.x]:[view==='back'?-v.x:v.x,v.y,0],rotationY:view==='side'?-Math.PI/2:view==='back'?Math.PI:0};
}

// Keep references used by the source illustration, generated images or another view.
export function removeUnusedGuideAssets(p,oldPaths){
 const keep=guidePaths(p);if(p.sourceImage)keep.add(p.sourceImage);
 for(const v of p.imageLibrary?.versions||[])for(const path of v.references)keep.add(path);
 p.assets=p.assets.filter(a=>!oldPaths.has(a.path)||!a.path.startsWith('assets/three-view/')||keep.has(a.path));
}
