import * as THREE from 'three';
import {PreviewAvatar} from './preview-avatar.mjs';
import {BONE_LABELS} from './rig-review.mjs';

let walkBytes;
async function standardWalk(){
  const response=await fetch('./elyth_base_walk_v1.vrma');
  if(!response.ok)throw Error('標準の歩行モーションを読み込めません。');
  return response.arrayBuffer();
}
export class VRMReview {
  constructor(scene){this.avatar=new PreviewAvatar({scene});this.avatar.setActive(true);this.isRest=true;this.walk={available:false};this.disposed=false;this.motions=new Map();this.motionKind='default';this.motionRequest=0;}
  async load(bytes){
    await this.avatar.loadVRM(new File([bytes],'review.vrm'));
    if(this.disposed)return;
    this.model=this.avatar.model;this.bones=[];this.model.traverse(o=>{if(o.isBone)this.bones.push(o);});
    this.mapping=Object.fromEntries(Object.keys(BONE_LABELS).map(k=>[k,this.avatar.vrm.humanoid.getRawBoneNode(k)?.name]).filter(([,name])=>name));
    this.helper=new THREE.SkeletonHelper(this.model);this.helper.visible=false;this.avatar.scene.add(this.helper);
    walkBytes??=standardWalk().catch(e=>{walkBytes=null;throw e;});const walk=await walkBytes;
    if(!this.disposed)await this.loadMotion(new File([walk],'elyth_base_walk_v1.vrma'),'default');
  }
  async loadMotion(file,kind='custom'){
    const request=++this.motionRequest,loaded=await this.avatar.loadVRMA(file);if(!loaded||this.disposed||request!==this.motionRequest)return false;
    this.motions.set(kind,file);this.motionKind=kind;this.walk.available=true;this.avatar.play();this.isRest=false;return true;
  }
  async selectMotion(kind){const file=this.motions.get(kind);if(!file)return false;return this.loadMotion(file,kind);}
  get time(){return (this.avatar.mixer?.time??0)%(this.duration||1);}
  get duration(){return this.avatar.action?.getClip().duration??1;}
  get playing(){return this.avatar.playing;}
  get physicsEnabled(){return this.avatar.physics&&this.avatar.springCount>0&&this.avatar.vrm?.springBoneManager===this.avatar.springManager;}
  setPhysics(enabled){this.avatar.setPhysics(enabled);}
  set playing(value){
    if(value&&this.isRest)this.avatar.action?.reset().play();
    else if(value&&this.avatar.action&&!this.avatar.action.isScheduled())this.avatar.action.play();
    if(this.avatar.action)this.avatar.action.paused=!value;
    this.avatar.playing=!!value&&!!this.avatar.action;if(this.avatar.playing)this.isRest=false;
  }
  pose(time){if(!this.avatar.action)return;this.avatar.stop();this.avatar.action.reset().play();this.avatar.mixer.setTime(Math.max(0,time));this.avatar.vrm.update(0);this.avatar.springManager?.reset();this.avatar.playing=false;this.isRest=false;}
  restPose(){this.avatar.stop();this.isRest=true;}
  resetPhysics(){this.model?.updateMatrixWorld(true);this.avatar.simulationRemainder=0;this.avatar.springManager?.reset();}
  tick(delta){this.avatar.tick(delta);}
  dispose(){this.disposed=true;this.motionRequest++;this.motions.clear();this.helper?.removeFromParent();this.helper?.geometry.dispose();this.helper?.material.dispose();this.avatar.dispose();}
}
