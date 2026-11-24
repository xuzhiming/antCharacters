import * as THREE from 'three';
import {ReviewWalk,WALK_DURATION} from './review-walk.mjs';

export const BONE_LABELS = {
  hips:'腰',spine:'背骨',chest:'胸',neck:'首',head:'頭',
  leftUpperArm:'左上腕',leftLowerArm:'左前腕',leftHand:'左手',
  rightUpperArm:'右上腕',rightLowerArm:'右前腕',rightHand:'右手',
  leftUpperLeg:'左太腿',leftLowerLeg:'左すね',leftFoot:'左足',
  rightUpperLeg:'右太腿',rightLowerLeg:'右すね',rightFoot:'右足'
};
const clean = n => n.toLowerCase().replace(/^.*:/,'').replace(/^mixamorig/,'').replace(/[^a-z0-9]/g,'');
// FBXLoader represents a bone shared by meshes as nested bones with the same
// FBX ID. Animate the outer bone once: its skinning proxies inherit the motion.
// Distinct bones with merely identical names must remain ambiguous.
const controlBones = bones => bones.filter(b=>!b.isBone||b.ID===undefined||!b.parent?.isBone||b.parent.ID!==b.ID);
const aliases = {hips:['hips','pelvis','jbipchips'],spine:['spine','jbipcspine'],chest:['chest','upperchest','spine1','spine2','jbipcchest','jbipcupperchest'],neck:['neck','jbipcneck'],head:['head','jbipchead']};
for (const [side,s] of [['left','l'],['right','r']]) {
  for (const [part,names] of Object.entries({UpperArm:['upperarm','arm'],LowerArm:['lowerarm','forearm'],Hand:['hand'],UpperLeg:['upperleg','upleg','thigh'],LowerLeg:['lowerleg','leg','calf','shin'],Foot:['foot']})) {
    aliases[side+part]=names.flatMap(n=>[side+n,n+side,n+s,s+n,'jbip'+s+n]);
  }
}
export function autoBoneMap(bones) {
  bones=controlBones(bones);
  const result={};
  for (const [key,names] of Object.entries(aliases)) {
    // Exact aliases only; ambiguous names require a user/agent selection.
    for (const name of names) {
      const matches=bones.filter(b=>clean(b.name)===name);
      if(matches.length===1){result[key]=matches[0].name;break;}
    }
  }
  return result;
}
export function inspectRig(model, mapping={}) {
  const bones=[],meshes=[];model.traverse(o=>{if(o.isBone)bones.push(o);if(o.isSkinnedMesh)meshes.push(o);});
  const names=new Set(bones.map(b=>b.name));
  const missing=Object.keys(BONE_LABELS).filter(k=>!names.has(mapping[k]));
  let vertices=0,zeroWeight=0,invalid=0;
  for(const mesh of meshes){
    const w=mesh.geometry.getAttribute('skinWeight'),ids=mesh.geometry.getAttribute('skinIndex');
    if(!w||!ids){invalid++;continue;}
    vertices+=w.count;
    for(let i=0;i<w.count;i++){
      let total=0;
      for(let j=0;j<4;j++){
        const value=w.array[i*w.itemSize+j],index=ids.array[i*ids.itemSize+j];
        if(!Number.isFinite(value)||value<0||(value>0&&(!Number.isInteger(index)||index>=mesh.skeleton.bones.length||index<0)))invalid++;
        total+=value;
      }
      if(total<1e-8)zeroWeight++;
    }
  }
  return {bones:controlBones(bones).length,skinnedMeshes:meshes.length,vertices,zeroWeight,invalid,missing,
    scope:'FBX preview skinning only. Loader may normalize/reduce weights. Check source weights separately. Spring physics and visual quality are not automatically certified.'};
}
export const REVIEW_DURATION=WALK_DURATION;
export const REVIEW_SAMPLES=[{time:0,label:'Rest',rest:true},{time:0,label:'Walk 0%'},{time:WALK_DURATION/4,label:'Walk 25%'},{time:WALK_DURATION/2,label:'Walk 50%'},{time:WALK_DURATION*3/4,label:'Walk 75%'}];

export class RigReview {
  constructor(model,mapping,{hair=null}={}) {
    this.model=model;this.bones=[];model.traverse(o=>{if(o.isBone)this.bones.push(o);});this.bones=controlBones(this.bones);
    this.rest=new Map(this.bones.map(b=>[b,{q:b.quaternion.clone(),p:b.position.clone(),s:b.scale.clone()}]));
    this.mapping={...autoBoneMap(this.bones),...mapping};this.time=0;this.playing=true;
    this.hair=hair;this.hairState=hair?{parent:hair.parent,p:hair.position.clone(),q:hair.quaternion.clone(),s:hair.scale.clone()}:null;
    this.helper=new THREE.SkeletonHelper(model);this.helper.visible=false;
    model.updateMatrixWorld(true);
    this.walk=new ReviewWalk(model,Object.fromEntries(Object.keys(BONE_LABELS).map(key=>[key,this.bone(key)])));
    this.isRest=true;
    if(hair&&this.bone('head'))this.bone('head').attach(hair);
  }
  bone(key){return this.bones.find(b=>b.name===this.mapping[key]);}
  reset(){for(const [b,r] of this.rest){b.quaternion.copy(r.q);b.position.copy(r.p);b.scale.copy(r.s);}this.model.updateMatrixWorld(true);}
  restPose(){this.reset();this.isRest=true;this.time=0;}
  rotate(key,axis,angle){
    const b=this.bone(key);if(!b)return;
    const parent=b.parent.getWorldQuaternion(new THREE.Quaternion());
    const delta=parent.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(axis,angle)).multiply(parent);
    b.quaternion.premultiply(delta);b.updateMatrixWorld(true);
  }
  pose(time){
    if(!Number.isFinite(time))return;
    this.time=((time%REVIEW_DURATION)+REVIEW_DURATION)%REVIEW_DURATION;this.reset();this.isRest=false;
    this.walk.pose(this.time);
    this.model.updateMatrixWorld(true);
  }
  tick(delta){if(this.playing)this.pose(this.time+Math.min(delta,.1));}
  dispose(){
    this.reset();if(this.hairState){const {parent,p,q,s}=this.hairState;parent.add(this.hair);this.hair.position.copy(p);this.hair.quaternion.copy(q);this.hair.scale.copy(s);}
    this.helper.removeFromParent();this.helper.geometry.dispose();this.helper.material.dispose();
  }
}
