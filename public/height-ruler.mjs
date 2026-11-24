import * as THREE from 'three';
import {language,say} from './i18n.mjs';

// UI availability only needs geometry presence; precise skinning bounds are
// computed when measuring or opening the reference editor, never when polling.
export function hasModelGeometry(model){
 return !!model?.children.some(group=>['body','head_neutral','hair','assembled'].includes(group.userData.charakitRole)&&group.getObjectsByProperty('isMesh',true).some(mesh=>mesh.geometry?.attributes.position?.count>0));
}

// Measure exported geometry, independent of visibility toggles and bone guides.
export function measureModel(model){
 if(!model)return null;
 model.updateMatrixWorld(true);
 const bounds=new THREE.Box3(),bodyBounds=new THREE.Box3();
 for(const group of model.children){
  const role=group.userData.charakitRole;
  if(!['body','head_neutral','hair','assembled'].includes(role))continue;
  const partBounds=new THREE.Box3();
  group.traverse(mesh=>{if(mesh.isMesh&&mesh.geometry)partBounds.union(new THREE.Box3().setFromObject(mesh,true));});
  bounds.union(partBounds);
  if(['body','head_neutral'].includes(role))bodyBounds.union(partBounds);
 }
 const height=bounds.max.y-bounds.min.y;
 if(bounds.isEmpty()||!Number.isFinite(height)||height<=0)return null;
 return {bounds,height,bodyHeight:bodyBounds.isEmpty()?null:bodyBounds.max.y-bodyBounds.min.y};
}

export function rulerStep(height,pixels){
 if(!Number.isFinite(height)||height<=0||!Number.isFinite(pixels)||pixels<=0)return null;
 const ideal=height/Math.max(1,pixels/55),power=10**Math.floor(Math.log10(ideal));
 return [1,2,5,10].find(n=>n*power>=ideal)*power;
}

// A physical ruler in the XY plane. Its position and labels never face the camera.
function createWorldRuler(){
 const object=new THREE.Group();object.name='heightRuler3D';object.visible=false;
 const rodGeometry=new THREE.CylinderGeometry(1,1,1,8),rodMaterial=new THREE.MeshBasicMaterial({color:0x70d1d4,toneMapped:false});
 let lastKey='';
 function clear(){
  for(const child of [...object.children]){
   if(child.geometry!==rodGeometry){child.geometry.dispose();child.material.map?.dispose();child.material.dispose();}
   object.remove(child);
  }
 }
 function update(dimensions){
  const key=dimensions?[...dimensions.bounds.min.toArray(),...dimensions.bounds.max.toArray(),dimensions.height].join(','):'';
  if(key===lastKey)return;
  lastKey=key;clear();
  if(!dimensions)return;
  const {bounds,height}=dimensions,gap=Math.max(.05,height*.055),radius=height*.0015,tickLength=height*.025;
  object.position.set(bounds.min.x-gap,bounds.min.y,(bounds.min.z+bounds.max.z)/2);
  function rod(x,y,length,horizontal=false){
   const mesh=new THREE.Mesh(rodGeometry,rodMaterial);
   mesh.scale.set(radius,length,radius);mesh.position.set(x,y,0);
   if(horizontal)mesh.rotation.z=Math.PI/2;
   object.add(mesh);return mesh;
  }
  rod(0,height/2,height).name='heightRulerAxis';
  rod(0,0,tickLength*1.5,true);rod(0,height,tickLength*1.5,true);
  const step=rulerStep(height,550),minor=step/2;
  for(let i=0;i*minor<=height+1e-9&&i<200;i++){
   const value=i*minor,major=i%2===0,length=tickLength*(major?1:.5);
   rod(-length/2,value,length,true);
   if(!major)continue;
   const canvas=document.createElement('canvas');canvas.width=256;canvas.height=128;
   const context=canvas.getContext('2d');
   context.font='76px sans-serif';context.textAlign='center';context.textBaseline='middle';
   context.lineJoin='round';context.lineWidth=9;context.strokeStyle='#172b35';context.fillStyle='#d8f5f5';
   const text=(value*100).toFixed(step<.01?1:0);
   context.strokeText(text,128,64);context.fillText(text,128,64);
   const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
   const label=new THREE.Mesh(new THREE.PlaneGeometry(height*.06,height*.03),new THREE.MeshBasicMaterial({map:texture,transparent:true,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));
   label.name='heightRulerLabel';label.position.set(-tickLength-height*.04,value,0);object.add(label);
  }
 }
 return {object,update,dispose(){clear();rodGeometry.dispose();rodMaterial.dispose();object.removeFromParent();}};
}

export function createHeightRuler(viewport,{idPrefix='',reference=false}={}){
 const ns='http://www.w3.org/2000/svg',overlay=document.createElement('div');
 overlay.id=idPrefix?idPrefix+'HeightMeasurement':'heightMeasurement';overlay.className='height-measurement';overlay.hidden=true;
 const readout=document.createElement('div');readout.className='height-readout';
 readout.innerHTML='<span></span><strong></strong><small></small>';
 const [label,value,meters]=readout.children,prefix=idPrefix||'viewport';
 label.id=prefix+'HeightLabel';value.id=prefix+'Height';meters.id=prefix+'HeightMeters';
 const svg=document.createElementNS(ns,'svg');svg.id=idPrefix?idPrefix+'HeightRuler':'heightRuler';svg.setAttribute('class','height-ruler');svg.setAttribute('aria-hidden','true');
 overlay.append(svg,readout);viewport.append(overlay);
 const world=createWorldRuler();
 let dimensions=null,lastKey='';
 const number=(value,digits)=>value.toFixed(digits);
 function labels(){
  if(!dimensions)return;
  lastKey='';
  const english=language()==='en';
   label.textContent=reference?say('三面図の換算全高','Reference image height'):say('全高 · 髪・飾り込み','Total height · incl. hair & accessories');
  value.textContent=number(dimensions.height*100,1)+' cm';
  meters.textContent=number(dimensions.height,3)+' m';
  readout.setAttribute('aria-label',language()==='ko'?`전체 높이 ${number(dimensions.height*100,1)} 센티미터, 머리카락과 장식 포함`:(english?'Total height ':'全高 ')+number(dimensions.height*100,1)+(english?' centimeters, including hair and accessories':'センチメートル、髪・飾り込み'));
 }
 window.addEventListener('languagechange',labels);
 function update(next){dimensions=next;lastKey='';world.update(next);labels();}
 function render(camera,enabled,view='front'){
  overlay.hidden=!enabled||!dimensions;
  world.object.visible=!overlay.hidden&&view==='orbit';
  svg.style.display=view==='orbit'?'none':'';
  if(view==='orbit'){if(svg.childElementCount)svg.replaceChildren();lastKey='';return;}
  if(overlay.hidden)return;
  const width=viewport.clientWidth,height=viewport.clientHeight;
  if(!width||!height)return;
  const key=[width,height,...camera.matrixWorld.elements,...camera.projectionMatrix.elements].join(',');
  if(key===lastKey)return;
  lastKey=key;svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const bounds=dimensions.bounds,size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0);right.y=0;right.normalize();
  const span=(Math.abs(right.x)*size.x+Math.abs(right.z)*size.z)/2;
  const base=center.clone().addScaledVector(right,-span-Math.max(.05,dimensions.height*.055));base.y=bounds.min.y;
  const project=y=>{
   const point=base.clone();point.y+=y;point.project(camera);
   return {x:(point.x+1)*width/2,y:(1-point.y)*height/2,z:point.z};
  };
  let bottom=project(0),top=project(dimensions.height);
  const rightSide=Math.min(bottom.x,top.x)<readout.offsetLeft+readout.offsetWidth+24;
  if(rightSide){base.addScaledVector(right,2*(span+Math.max(.05,dimensions.height*.055)));bottom=project(0);top=project(dimensions.height);}
  const pixels=Math.hypot(top.x-bottom.x,top.y-bottom.y);
  // Height has no readable projected axis when looking straight down.
  if(!Number.isFinite(pixels)||![top.x,top.y,top.z,bottom.x,bottom.y,bottom.z].every(Number.isFinite)||pixels<55||top.z<-1||top.z>1||bottom.z<-1||bottom.z>1)return;
  const step=rulerStep(dimensions.height,pixels),minor=step/2,shift=rightSide?Math.min(0,width-52-Math.max(bottom.x,top.x)):Math.max(0,52-Math.min(bottom.x,top.x));
  function line(a,b,className){
   const element=document.createElementNS(ns,'line');
   for(const [key,value] of Object.entries({x1:a.x+shift,y1:a.y,x2:b.x+shift,y2:b.y}))element.setAttribute(key,String(value));
   element.setAttribute('class',className);svg.append(element);
  }
  line(bottom,top,'ruler-axis');
  for(let i=0;i*minor<=dimensions.height+1e-9&&i<200;i++){
   const value=i*minor,point=project(value),major=i%2===0;
   line(point,{x:point.x+(rightSide?-1:1)*(major?10:5),y:point.y},major?'ruler-tick':'ruler-tick ruler-minor');
   if(!major)continue;
   const label=document.createElementNS(ns,'text');label.setAttribute('x',String(point.x+shift+(rightSide?8:-8)));label.setAttribute('y',String(point.y));
   label.setAttribute('text-anchor',rightSide?'start':'end');label.setAttribute('dominant-baseline','central');
   label.textContent=number(value*100,step<.01?1:0);svg.append(label);
  }
  line({x:top.x-4,y:top.y},{x:top.x+12,y:top.y},'ruler-cap');
  line({x:bottom.x-4,y:bottom.y},{x:bottom.x+12,y:bottom.y},'ruler-cap');
 }
 return {update,render,object:world.object,dispose(){window.removeEventListener('languagechange',labels);world.dispose();overlay.remove();}};
}
