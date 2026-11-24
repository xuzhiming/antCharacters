import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {VRMLoaderPlugin,VRMUtils} from './vendor/three-vrm.module.js';
import {VRMAnimationLoaderPlugin,VRMLookAtQuaternionProxy,createVRMAnimationClip} from './vendor/three-vrm-animation.module.js';
import {clone as cloneSkeleton} from './vendor/SkeletonUtils.js';
import {inspectPreviewGLTF} from './preview-gltf.mjs';
import {cloneMToonMaterial} from './mtoon-materials.mjs';
import {showBackFaces} from './material-preview.mjs';

function disposeTree(root,{textures=true,extraMaterials=[]}={}) {
  const geometries=new Set(),materials=new Set(extraMaterials),maps=new Set(),skeletons=new Set();
  const roots=Array.isArray(root)?root:[root];
  const textureKeys=['map','alphaMap','normalMap','emissiveMap','roughnessMap','metalnessMap','aoMap','lightMap','shadeMultiplyTexture','shadingShiftTexture','matcapTexture','rimMultiplyTexture','outlineWidthMultiplyTexture','uvAnimationMaskTexture'];
  const collect=value=>{if(value?.isTexture)maps.add(value);else if(Array.isArray(value))for(const item of value)if(item?.isTexture)maps.add(item);};
  for(const tree of roots)tree?.traverse(o=>{
    if(o.geometry)geometries.add(o.geometry);if(o.skeleton)skeletons.add(o.skeleton);
    for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])materials.add(m);
  });
  if(textures)for(const m of materials){for(const v of Object.values(m))collect(v);for(const key of textureKeys)collect(m[key]);for(const uniform of Object.values(m.uniforms??{}))collect(uniform.value);}
  for(const tree of roots)tree?.removeFromParent();const images=new Set();
  for(const map of maps){if(map.source?.data?.close)images.add(map.source.data);map.dispose();}
  for(const image of images)image.close();for(const skeleton of skeletons)skeleton.dispose();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
}
function disposeGLTF(gltf){disposeTree(gltf.scenes??gltf.scene,{extraMaterials:gltf.userData.vrm?.materials??[]});}
async function loadGLTF(buffer,kind) {
  inspectPreviewGLTF(buffer,kind);
  const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(!url.startsWith('blob:')&&!url.startsWith('data:'))throw Error('外部ファイルは読み込みません。');return url;});
  const loader=new GLTFLoader(manager);if(kind==='vrm')loader.register(parser=>new VRMLoaderPlugin(parser));else if(kind==='vrma')loader.register(parser=>new VRMAnimationLoaderPlugin(parser));
  return loader.parseAsync(buffer,'');
}
export class PreviewAvatar {
  constructor({scene,onChange=()=>{},beforeUnload=()=>{}}){this.scene=scene;this.onChange=onChange;this.beforeUnload=beforeUnload;this.model=null;this.vrm=null;this.mixer=null;this.action=null;this.playing=false;this.physics=true;this.simulationRemainder=0;this.request=0;this.motionRequest=0;this.resources=null;this.active=false;this.name='';this.motionName='';this.disposed=false;}
  cancelPending(){this.request++;this.motionRequest++;}
  clearMotion(){this.motionRequest++;this.playing=false;this.simulationRemainder=0;this.mixer?.stopAllAction();if(this.model)this.mixer?.uncacheRoot(this.model);this.mixer=null;this.action=null;this.motionName='';}
  unload(){this.beforeUnload();this.clearMotion();if(this.resources)disposeGLTF(this.resources);else if(this.model)disposeTree(this.model,{textures:false});this.resources=null;this.model=null;this.vrm=null;this.springManager=null;this.name='';}
  useWorkingModel(source){
    this.cancelPending();this.unload();if(!source?.getObjectsByProperty('isMesh',true).length){this.onChange();return;}
    const model=cloneSkeleton(source),materials=new Map(),geometries=new Map();
    model.traverse(o=>{if(o.geometry){if(!geometries.has(o.geometry))geometries.set(o.geometry,o.geometry.clone());o.geometry=geometries.get(o.geometry);}if(o.material){const copy=m=>{if(!materials.has(m))materials.set(m,m.isMToonMaterial?cloneMToonMaterial(m):m.clone());return materials.get(m);};o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);}});
    showBackFaces(model);this.model=model;this.name='制作中のモデル';this.scene.add(model);this.onChange();
  }
  async loadVRM(file){
    if(!/\.vrm$/i.test(file.name))throw Error('VRMファイルを選んでください。');
    if(file.size>128*1024*1024)throw Error('VRMは128MB以内にしてください。');
    const request=++this.request;this.motionRequest++;
    const gltf=await loadGLTF(await file.arrayBuffer(),'vrm');
    if(this.disposed||request!==this.request){disposeGLTF(gltf);return false;}
    const vrm=gltf.userData.vrm;
    if(!vrm?.humanoid){disposeGLTF(gltf);throw Error('VRMのHumanoidを読み込めません。');}
    const bounds=new THREE.Box3().setFromObject(vrm.scene);
    if(![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite)||bounds.getSize(new THREE.Vector3()).length()>1000){disposeGLTF(gltf);throw Error('VRMの形状・大きさが不正です。');}
    showBackFaces(vrm.scene);this.unload();this.resources=gltf;this.model=vrm.scene;this.vrm=vrm;this.name=file.name;this.springManager=vrm.springBoneManager;
    // Core updates remain active when physics is disabled; its manager is held
    // separately so vrm.update never simulates disabled springs.
    if(!this.physics)vrm.springBoneManager=undefined;
    VRMUtils.rotateVRM0(vrm);if(vrm.lookAt){vrm.lookAt.autoUpdate=false;const proxy=new VRMLookAtQuaternionProxy(vrm.lookAt);proxy.name='PreviewLookAt';vrm.scene.add(proxy);}
    this.scene.add(vrm.scene);vrm.update(0);this.springManager?.reset();this.onChange();return true;
  }
  async loadVRMA(file){
    if(!this.vrm)throw Error('先に完成VRMを読み込んでください。');
    if(!/\.vrma$/i.test(file.name)||file.size>32*1024*1024)throw Error('VRMAは32MB以内の.vrmaを選んでください。');
    const modelRequest=this.request,motionRequest=++this.motionRequest,vrm=this.vrm;
    const gltf=await loadGLTF(await file.arrayBuffer(),'vrma');
    try{
      if(this.disposed||modelRequest!==this.request||motionRequest!==this.motionRequest||vrm!==this.vrm)return false;
      const animation=gltf.userData.vrmAnimations?.[0];if(!animation)throw Error('VRMAのモーションが見つかりません。');
      if(!Number.isFinite(animation.restHipsPosition.y)||(animation.humanoidTracks.translation.size&&Math.abs(animation.restHipsPosition.y)<.001))throw Error('VRMAの腰の基準位置が不正です。');
      const clip=createVRMAnimationClip(animation,vrm);
      if(!clip.tracks.length||!Number.isFinite(clip.duration)||clip.duration<=0||clip.duration>3600||clip.tracks.some(t=>Array.from(t.values).some(v=>!Number.isFinite(v))))throw Error('VRMAの時間・姿勢データが不正です。');
      this.stop();this.clearMotion();this.mixer=new THREE.AnimationMixer(vrm.scene);this.action=this.mixer.clipAction(clip);this.motionName=file.name;this.playing=false;this.onChange();return true;
    }finally{disposeGLTF(gltf);}
  }
  async loadGLB(file){
    if(file.size>128*1024*1024)throw Error('モデルは128MB以内にしてください。');
    const request=++this.request;this.motionRequest++;
    const gltf=await loadGLTF(await file.arrayBuffer(),'gltf');
    if(this.disposed||request!==this.request){disposeGLTF(gltf);return false;}
    const bounds=new THREE.Box3().setFromObject(gltf.scene);
    if(bounds.isEmpty()||![...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite)||bounds.getSize(new THREE.Vector3()).length()>1000){disposeGLTF(gltf);throw Error('モデルの形状・大きさが不正です。');}
    this.unload();this.resources=gltf;this.model=gltf.scene;this.name=file.name;showBackFaces(this.model);this.scene.add(this.model);this.onChange();return true;
  }
  play(){if(!this.action||!this.active)return;this.simulationRemainder=0;this.action.reset().play();this.playing=true;this.onChange();}
  stop(){this.playing=false;this.simulationRemainder=0;this.mixer?.stopAllAction();this.vrm?.humanoid.resetNormalizedPose();this.vrm?.expressionManager?.resetValues();this.vrm?.lookAt?.reset();this.vrm?.update(0);this.springManager?.reset();this.onChange();}
  setPhysics(enabled){
    const next=!!enabled;if(next===this.physics)return;
    this.physics=next;if(this.vrm){this.vrm.springBoneManager=this.physics?this.springManager:undefined;this.springManager?.reset();}this.onChange();
  }
  setActive(active){this.active=active;if(!active){this.cancelPending();this.stop();}}
  tick(delta){
    if(!this.active||!Number.isFinite(delta)||delta<=0)return;
    if(!this.vrm){const materials=new Set();this.model?.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m?.isMToonMaterial)materials.add(m);});for(const m of materials){m.alphaMap?.updateMatrix();m.update(delta);}return;}
    // Carry fractional time into the next frame so rendering speed and small
    // frame-time jitter do not change how often drag and stiffness are applied.
    // Cap only long interruptions; never modify the model's spring settings.
    const step=1/60;this.simulationRemainder+=Math.min(delta,.1);
    const steps=Math.floor((this.simulationRemainder+1e-12)/step);
    this.simulationRemainder=Math.max(0,this.simulationRemainder-steps*step);
    for(let i=0;i<steps;i++){if(this.playing)this.mixer?.update(step);this.vrm?.update(step);}
  }
  get springCount(){return this.springManager?.joints?.size??0;}
  dispose(){this.disposed=true;this.cancelPending();this.unload();}
}
