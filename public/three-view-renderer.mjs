import * as THREE from 'three';
import {guidePlacement} from './three-view-data.mjs';

export function createThreeViewOverlay(scene,onError=()=>{}){
 const material=new THREE.MeshBasicMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);mesh.name='threeViewReference';mesh.renderOrder=100;mesh.visible=false;scene.add(mesh);
 const centerLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,-.5,.001),new THREE.Vector3(0,.5,.001)]),new THREE.LineBasicMaterial({color:0x008c9b,depthTest:false,depthWrite:false,toneMapped:false}));
 centerLine.name='threeViewCenterLine';centerLine.renderOrder=101;mesh.add(centerLine);
 let key='',generation=0,aspect=1,ready=false;
 function clear(){generation++;key='';ready=false;mesh.visible=false;material.map?.dispose();material.map=null;material.needsUpdate=true;}
 function update(view,guide,files,asset,enabled=true){
  const nextKey=guide&&asset?asset.path+':'+asset.sha256:'';
  if(nextKey!==key){
   clear();key=nextKey;
   if(nextKey){
    const token=generation,bytes=files.get(asset.path);
    if(!bytes){onError(Error('三面図の画像がありません。'));return;}
    const url=URL.createObjectURL(new Blob([bytes],{type:asset.mime}));
    new THREE.TextureLoader().loadAsync(url).then(texture=>{
     if(token!==generation){texture.dispose();return;}
     texture.colorSpace=THREE.SRGBColorSpace;aspect=texture.image.width/texture.image.height;
     material.map=texture;material.needsUpdate=true;ready=true;
    }).catch(error=>{if(token===generation)onError(error);}).finally(()=>URL.revokeObjectURL(url));
   }
  }
  mesh.visible=!!(enabled&&ready&&guide);
  if(!guide)return;
  const placement=guidePlacement(view,guide);mesh.position.fromArray(placement.position);mesh.rotation.set(0,placement.rotationY,0);mesh.scale.set(guide.height*aspect,guide.height,1);material.opacity=guide.opacity;
 }
  return {mesh,update,clear,dispose(){clear();mesh.removeFromParent();centerLine.geometry.dispose();centerLine.material.dispose();mesh.geometry.dispose();material.dispose();}};
}
