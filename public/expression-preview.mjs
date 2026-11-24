import * as THREE from 'three';

// Bind by the names provided by this model. No character-specific indices.
export function expressionBindings(avatar){
 const entries=[],used=new Set(),manager=avatar.vrm?.expressionManager;
 for(const expression of manager?.expressions??[]){
  if(!expression.binds.length)continue;
  const name=expression.expressionName,id='vrm:'+name;
  entries.push({id,name,kind:'vrm',binary:expression.isBinary});
  for(const bind of expression.binds)for(const primitive of bind.primitives??[])for(const key of Object.keys(primitive.morphTargetDictionary??{}))if(primitive.morphTargetDictionary[key]===bind.index)used.add(primitive.uuid+':'+key);
 }
 const groups=new Map();
 avatar.model?.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.morphTargetInfluences)return;
  for(const [name,index]of Object.entries(mesh.morphTargetDictionary??{})){
   if(/^(basis|neutral)$/i.test(name)||used.has(mesh.uuid+':'+name))continue;
   const id='morph:'+name;if(!groups.has(id))groups.set(id,{id,name,kind:'morph',bindings:[]});groups.get(id).bindings.push({mesh,index});
  }
 });
 entries.push(...groups.values());
 if(entries.length>512)throw Error('表情の数が多すぎます。');
 return entries;
}
export function applyExpressionControls(avatar,entries,controls){
 const values=new Map(controls.map(c=>[c.id,c.value]));
 avatar.vrm?.expressionManager?.resetValues();
 for(const entry of entries){const value=values.get(entry.id)??0;if(entry.kind==='vrm')avatar.vrm.expressionManager.setValue(entry.name,value);else for(const {mesh,index}of entry.bindings)mesh.morphTargetInfluences[index]=value;}
 avatar.vrm?.update(0);avatar.model?.updateMatrixWorld(true);
}
export function expressionFaceBounds(avatar,entries){
 const whole=new THREE.Box3().setFromObject(avatar.model),head=avatar.vrm?.humanoid.getRawBoneNode('head');
 if(head){const point=head.getWorldPosition(new THREE.Vector3()),size=Math.max(whole.getSize(new THREE.Vector3()).y*.22,.06);return new THREE.Box3().setFromCenterAndSize(point,new THREE.Vector3(size,size,size));}
 const bounds=new THREE.Box3(),point=new THREE.Vector3();
 const meshes=new Set(entries.flatMap(e=>e.bindings?.map(b=>b.mesh)??[]));
 for(const mesh of meshes){const position=mesh.geometry.attributes.position,targets=mesh.geometry.morphAttributes.position??[];for(let i=0;i<position.count;i++){
  let moved=false;for(const target of targets){const x=target.getX(i)-(mesh.geometry.morphTargetsRelative?0:position.getX(i)),y=target.getY(i)-(mesh.geometry.morphTargetsRelative?0:position.getY(i)),z=target.getZ(i)-(mesh.geometry.morphTargetsRelative?0:position.getZ(i));if(x*x+y*y+z*z>1e-14){moved=true;break;}}
  if(moved){point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);bounds.expandByPoint(point);}
 }}
 return bounds.isEmpty()?whole:bounds.expandByScalar(Math.max(bounds.getSize(point).length()*.12,.001));
}
