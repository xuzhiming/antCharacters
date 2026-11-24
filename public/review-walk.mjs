import * as THREE from 'three';
import {VRMHumanoid} from './vendor/three-vrm.module.js';
import data from './review-walk-data.mjs';
export const WALK_DURATION=data.duration;
export class ReviewWalk {
  constructor(model,bones){
    this.available=['hips','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot'].every(k=>bones[k]);
    for(const side of ['left','right'])for(const [child,parent] of [['LowerLeg','UpperLeg'],['Foot','LowerLeg']]){
      let node=bones[side+child];while(node&&node!==bones[side+parent])node=node.parent;
      if(!node)this.available=false;
    }
    if(!this.available)return;
    this.humanoid=new VRMHumanoid(Object.fromEntries(Object.entries(bones).filter(([,node])=>node).map(([k,node])=>[k,{node}])));
    this.tracks=Object.entries(data.rotation).filter(([k])=>bones[k]).map(([key,t])=>({key,interpolant:new THREE.QuaternionKeyframeTrack(key,t.times,t.values,t.interpolation).createInterpolant()}));
    const t=data.translation.hips;
    this.hips=t?new THREE.VectorKeyframeTrack('hips',t.times,t.values,t.interpolation).createInterpolant():null;
    this.scale=(bones.hips.getWorldPosition(new THREE.Vector3()).y-model.getWorldPosition(new THREE.Vector3()).y)/data.hips[1];
  }
  pose(time){
    if(!this.available)return;
    const pose=Object.fromEntries(this.tracks.map(({key,interpolant})=>[key,{rotation:Array.from(interpolant.evaluate(time))}]));
    if(this.hips){const value=this.hips.evaluate(time);pose.hips.position=Array.from(value,(v,i)=>(v-data.hips[i])*this.scale);}
    this.humanoid.resetNormalizedPose();this.humanoid.setNormalizedPose(pose);this.humanoid.update();for(const {node} of Object.values(this.humanoid.rawHumanBones))node.quaternion.normalize();
  }
}
