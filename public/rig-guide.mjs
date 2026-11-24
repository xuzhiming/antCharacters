import * as THREE from 'three';
import {rigSourceStamp} from './workflow.mjs';

const b2t=p=>new THREE.Vector3(p[0],p[2],-p[1]);
const t2b=p=>[p.x,-p.z,p.y].map(v=>v||0);
export const currentRigGuide=p=>!!p.rigGuide&&p.rigGuide.sourceStamp===rigSourceStamp(p);

// Keep only rest-pose joint data. Returned geometry, materials and weights never
// enter the production model. Shared FBX skin proxies represent the same joint.
export function extractRigGuide(root,placement,{sourceStamp,sourceHash}){
  root.updateMatrixWorld(true);
  const bones=[];root.traverse(b=>{if(b.isBone&&!(b.ID!==undefined&&b.parent?.isBone&&b.parent.ID===b.ID))bones.push(b);});
  if(!bones.length)throw Error('リグが見つかりません。骨を含むFBXを書き出してください。');
  const names=new Set();
  const positions=bones.map(b=>b.getWorldPosition(new THREE.Vector3()).multiplyScalar(placement.scale).add(b2t(placement.position)));
  const joints=bones.map((b,i)=>{
    if(!b.name||names.has(b.name))throw Error('同名の別ボーンがあります。骨名を一意にしてください。');names.add(b.name);
    let parent=b.parent;while(parent&&!bones.includes(parent))parent=parent.parent;
    const parentIndex=parent?bones.indexOf(parent):null;
    const axisY=new THREE.Vector3(0,1,0).transformDirection(b.matrixWorld);
    const axisZ=new THREE.Vector3(0,0,1).transformDirection(b.matrixWorld);
    const distances=bones.map((child,j)=>child.parent===b?positions[j].distanceTo(positions[i]):0).filter(d=>d>1e-5);
    const length=distances.length?Math.min(...distances):.025*placement.scale;
    return {name:b.name,parent:parentIndex,head:t2b(positions[i]),tail:t2b(positions[i].clone().addScaledVector(axisY,length)),rollAxis:t2b(axisZ)};
  });
  return {version:1,sourceStamp,sourceHash,bones:joints};
}

export function guideModel(guide){
  const group=new THREE.Group();group.name='Tripo bone positions';group.userData.charakitRole='rig_guide';
  const bones=guide.bones.map(j=>{const b=new THREE.Bone();b.name=j.name;return b;});
  guide.bones.forEach((j,i)=>{
    const parent=j.parent===null?group:bones[j.parent];parent.add(bones[i]);
    bones[i].position.copy(b2t(j.head));if(j.parent!==null)bones[i].position.sub(b2t(guide.bones[j.parent].head));
  });
  group.updateMatrixWorld(true);return group;
}
