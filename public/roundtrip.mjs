import * as THREE from 'three';
import {buildModel,parseModel,disposeModel} from './models.mjs';
import {workflow,rigSourceStamp,validRigBounds} from './workflow.mjs';
import {extractRigGuide} from './rig-guide.mjs';
import {sha256} from './project.mjs';

// Bounds use the viewer's Y-up meters. Hair is intentionally excluded.
function boundsOf(model){
  model.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(model,true);
  const result={min:b.min.toArray(),max:b.max.toArray()};
  if(!validRigBounds(result))throw Error('モデルの全高を確認できません。');
  return result;
}
export async function captureRigReference(p,files,{ignoreTextures=false}={}){
  if(!['body','head_neutral'].every(role=>p.assets.some(a=>a.role===role)))return null;
  const source={...p,mode:'parts',assets:p.assets.filter(a=>['body','head_neutral'].includes(a.role))};
  const model=await buildModel(source,files,{ignoreTextures});
  try{return boundsOf(model);}finally{disposeModel(model);}
}
export function returnPlacement(reference,returned){
  if(!validRigBounds(reference)||!validRigBounds(returned))throw Error('サイズ比較の情報が不正です。');
  const sourceHeight=reference.max[1]-reference.min[1],returnedHeight=returned.max[1]-returned.min[1];
  const scale=sourceHeight/returnedHeight;
  if(!Number.isFinite(scale)||scale<=0||scale>1000)throw Error('読み戻したFBXの単位を確認してください。');
  const center=(b,i)=>(b.min[i]+b.max[i])/2;
  const x=center(reference,0)-center(returned,0)*scale;
  const y=reference.min[1]-returned.min[1]*scale;
  const z=center(reference,2)-center(returned,2)*scale;
  // Store a regular Blender-coordinate placement; both importers already apply it.
  return {placement:{scale,position:[x||0,-z||0,y||0],rotation:[0,0,0]},sourceHeight,returnedHeight};
}
export async function alignTripoReturn(p,files){
  const w=workflow(p),stamp=rigSourceStamp(p);
  if(w.rigExport&&w.rigExport.sourceStamp!==stamp)throw Error('頭・体が書き出し時から変わっています。元の配置に戻すか、Tripo用FBXを再書き出ししてください。');
  const reference=validRigBounds(w.rigExport?.bounds)?w.rigExport.bounds:await captureRigReference(p,files);
  if(!reference)return null;
  const asset=p.assets.find(a=>a.path===p.updatedModel?.path);
  if(!asset)throw Error('読み戻したFBXがありません。');
  const model=await parseModel(files.get(asset.path),{...asset,files});
  try{
    // Read original FBX coordinates, not the current placement/animated pose.
    // Assigning the absolute placement makes repeated correction idempotent.
    const result=returnPlacement(reference,boundsOf(model));
    p.placements.assembled=result.placement;
    w.returnAlignment={version:1,sourceStamp:stamp,sourceHeight:result.sourceHeight,returnedHeight:result.returnedHeight,scale:result.placement.scale};
    return result;
  }finally{disposeModel(model);}
}

export async function importTripoBones(p,files,bytes,{ignoreSourceTextures=false}={}){
  if(p.production&&p.production.phase!=='assembled')throw Error('部位を組み立ててから骨配置を読み込んでください。');
  const stamp=rigSourceStamp(p),w=workflow(p);
  if(w.rigExport&&w.rigExport.sourceStamp!==stamp)throw Error('頭・体が書き出し時から変わっています。Tripo用FBXを再書き出ししてください。');
  const reference=validRigBounds(w.rigExport?.bounds)?w.rigExport.bounds:await captureRigReference(p,files,{ignoreTextures:ignoreSourceTextures});
  if(!reference)throw Error('骨を合わせる元の頭・体を先に読み込んでください。');
  const root=await parseModel(bytes,{ignoreTextures:true});
  try{
    const result=returnPlacement(reference,boundsOf(root));
    const guide=extractRigGuide(root,result.placement,{sourceStamp:stamp,sourceHash:await sha256(bytes)});
    p.rigGuide=guide;p.mode='parts';w.phase='bones';w.attachHair=false;w.boneMap={};
    w.returnAlignment={version:1,sourceStamp:stamp,sourceHeight:result.sourceHeight,returnedHeight:result.returnedHeight,scale:result.placement.scale};
    return guide;
  }finally{disposeModel(root);}
}
