import {DoubleSide} from 'three';

// Preview-only controls. Never modify source FBX bytes or exported assets.
export function doubleSidedMaterial(material){
  if(material&&material.side!==DoubleSide){material.side=DoubleSide;material.needsUpdate=true;}
  return material;
}
export function showBackFaces(model){
  model.traverse(o=>{
    if(o.isMesh)for(const material of Array.isArray(o.material)?o.material:[o.material])doubleSidedMaterial(material);
  });
}
export function materialPreview(model,sourceReflection=false){
  const seen=new Set();
  model.traverse(o=>{
    if(!o.isMesh)return;
    for(const m of Array.isArray(o.material)?o.material:[o.material]){
      if(!m||seen.has(m))continue;seen.add(m);
      const state=m.userData.charakitReflection??={
        specular:m.specular?.clone(),shininess:m.shininess,
        reflectivity:m.reflectivity,metalness:m.metalness,roughness:m.roughness,
        envMapIntensity:m.envMapIntensity
      };
      if(m.specular)m.specular.copy(sourceReflection?state.specular:state.specular.clone().set(0));
      for(const [key,matte] of Object.entries({shininess:0,reflectivity:0,metalness:0,roughness:1,envMapIntensity:0})){
        if(state[key]!==undefined){const value=sourceReflection?state[key]:matte;if(m[key]!==value){m[key]=value;m.needsUpdate=true;}}
      }
    }
  });
}
