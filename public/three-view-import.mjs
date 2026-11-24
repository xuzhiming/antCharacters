import {sha256} from './project.mjs';
import {inspectImage} from './image-info.mjs';
import {readImageMetadata,withImagePrompt} from './image-metadata.mjs';
import {THREE_VIEWS,emptyThreeViews,guidePaths,removeUnusedGuideAssets} from './three-view-data.mjs';

// Preflight the whole batch before changing the project or its file map.
export async function importThreeViews(p,files,items){
 const seen=new Set(),prepared=[];
 for(const item of items){
  if(!THREE_VIEWS.includes(item.view)||seen.has(item.view))throw Error('三面図の方向が不正、または重複しています。');seen.add(item.view);
  const current=p.threeViews?.views[item.view],asset=p.assets.find(a=>a.path===current?.path);
  if(item.expectedSha256&&asset?.sha256!==item.expectedSha256)throw Error('三面図が変更されています。最新のプロジェクトから依頼し直してください。');
  const info=await inspectImage(item.bytes,item.filename.split('.').pop());
  const prompt=item.prompt??(info.mime==='image/png'?readImageMetadata(item.bytes)?.prompt:null)??null;
  const bytes=info.mime==='image/png'?withImagePrompt(item.bytes,prompt):item.bytes;
  const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[info.mime],path='assets/three-view/'+crypto.randomUUID()+'.'+ext;
  prepared.push({view:item.view,bytes,asset:{path,role:'reference',filename:item.filename,...info,sha256:await sha256(bytes)}});
 }
 if(!prepared.length)throw Error('三面図の画像がありません。');
 const oldPaths=guidePaths(p);p.threeViews??=emptyThreeViews();
 for(const {view,bytes,asset} of prepared){
  const current=p.threeViews.views[view];
  p.threeViews.views[view]=current?{...current,path:asset.path}:{path:asset.path,x:0,y:.85,height:1.7,opacity:.65,locked:false,autoFit:true};
  delete p.threeViews.views[view].frame;
  p.assets.push(asset);files.set(asset.path,bytes);
 }
 removeUnusedGuideAssets(p,oldPaths);return prepared.length;
}

export async function threeViewPackage(p,files){
 const entries={};
 for(const [view,guide] of Object.entries(p.threeViews?.views||{})){
  const bytes=files.get(guide.path);if(!bytes)throw Error('三面図の画像がありません。');
  entries['three-view/'+view+'.'+guide.path.split('.').pop()]=bytes;
 }return entries;
}

// Transparent margins are excluded from the initial head-to-foot alignment.
export async function measureThreeViewFrame(bytes,mime){
 const bitmap=await createImageBitmap(new Blob([bytes],{type:mime}));
 try{
  const canvas=document.createElement('canvas'),scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height));
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);let top=canvas.height,bottom=0;
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(data[(y*canvas.width+x)*4+3]>=32){top=Math.min(top,y);bottom=Math.max(bottom,y+1);break;}
  if(top>=bottom)throw Error('三面図にキャラクターが描かれていません。');
  return {top:top/canvas.height,bottom:bottom/canvas.height};
 }finally{bitmap.close();}
}
