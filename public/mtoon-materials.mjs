import * as THREE from 'three';
import {MToonMaterial} from './vendor/three-vrm.module.js';
import profile from './mtoon-profile.json' with {type:'json'};
import {hasAssembly,isWeighted} from './journey.mjs';
import {doubleSidedMaterial} from './material-preview.mjs';

export const mtoonReady=(project,candidate=false)=>!candidate&&(hasAssembly(project)||isWeighted(project));
export function materialCounts(model){
  const materials=new Set();
  model?.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)materials.add(m);});
  return {total:materials.size,mtoon:[...materials].filter(m=>m.isMToonMaterial).length};
}

function retainAlphaMap(toon,alphaMap){
  if(!alphaMap)return;
  toon.alphaMap=alphaMap;
  toon.uniforms.charakitAlphaMap={value:alphaMap};
  toon.uniforms.charakitAlphaTransform={value:alphaMap.matrix};
  const compile=toon.onBeforeCompile.bind(toon);
  toon.onBeforeCompile=(shader,renderer)=>{
    compile(shader,renderer);
    shader.vertexShader=shader.vertexShader.replace('void main() {',
      'uniform mat3 charakitAlphaTransform; varying vec2 charakitAlphaUv;\nvoid main() {\ncharakitAlphaUv=(charakitAlphaTransform*vec3(uv,1.0)).xy;');
    shader.fragmentShader=shader.fragmentShader.replace('void main() {',
      'uniform sampler2D charakitAlphaMap; varying vec2 charakitAlphaUv;\nvoid main() {')
      .replace('#include <alphatest_fragment>',
        'diffuseColor.a *= texture2D(charakitAlphaMap,charakitAlphaUv).g;\n#include <alphatest_fragment>');
  };
  toon.customProgramCacheKey=()=> 'charakuru-mtoon-alpha-v1';
}

export function cloneMToonMaterial(source){
  const copy=doubleSidedMaterial(source.clone());retainAlphaMap(copy,source.alphaMap);return copy;
}

// FBX cannot carry VRM's MToon extension. Use the same profile as the Blender
// exporter while keeping the source material/texture identities for project IO.
export function mtoonMaterial(source) {
  if(source.isMToonMaterial)return doubleSidedMaterial(source);
  const toon=new MToonMaterial({
    color:source.color?.clone()??new THREE.Color(1,1,1),map:source.map??null,
    normalMap:source.normalMap??null,normalScale:source.normalScale?.clone()??new THREE.Vector2(1,1),
    emissive:source.emissive?.clone()??new THREE.Color(0,0,0),
    emissiveMap:source.emissiveMap??null,emissiveIntensity:source.emissiveIntensity??1,
    shadeColorFactor:(source.color?.clone()??new THREE.Color(1,1,1)).multiplyScalar(profile.shadeMultiplier),
    shadeMultiplyTexture:source.map??null,shadingShiftFactor:profile.shadingShiftFactor,
    shadingToonyFactor:profile.shadingToonyFactor,giEqualizationFactor:profile.giIntensityFactor,
    outlineWidthMode:profile.outlineWidthMode
  });
  for(const key of ['name','side','opacity','transparent','alphaTest','depthWrite','depthTest',
    'vertexColors','wireframe','visible','flatShading','polygonOffset','polygonOffsetFactor','polygonOffsetUnits',
    'premultipliedAlpha','blending','blendSrc','blendDst','blendEquation']){
    if(source[key]!==undefined)toon[key]=source[key];
  }
  // MToon ignores vertex colors by default even when Three enables the attribute.
  toon.ignoreVertexColor=!toon.vertexColors;
  // The ghost view may already have temporarily changed the source opacity.
  // Retain its baseline so disabling ghost restores the authored appearance.
  if(source.userData.previewBase)toon.userData.previewBase={...source.userData.previewBase};
  // FBX can supply a separate opacity map. MToon's base-color alpha remains
  // intact; multiply the original opacity map's green channel as Three does.
  retainAlphaMap(toon,source.alphaMap);
  doubleSidedMaterial(toon);
  toon.needsUpdate=true;toon.update(0);return toon;
}

export class MToonReview {
  constructor(){this.model=null;this.enabled=false;this.meshes=[];this.materials=new Map();}
  setModel(model){
    if(model===this.model)return;
    this.restore();
    for(const [source,toon] of this.materials)if(toon!==source)toon.dispose();
    this.model=model;this.meshes=[];this.materials.clear();
    model?.traverse(mesh=>{if(mesh.isMesh)this.meshes.push({mesh,material:mesh.material});});
  }
  restore(){for(const {mesh,material} of this.meshes)mesh.material=material;}
  setEnabled(enabled){
    this.enabled=!!enabled;
    if(!this.enabled){this.restore();return;}
    const convert=source=>{
      if(!source)return source;
      if(!this.materials.has(source))this.materials.set(source,mtoonMaterial(source));
      return this.materials.get(source);
    };
    for(const {mesh,material} of this.meshes)mesh.material=Array.isArray(material)?material.map(convert):convert(material);
  }
  tick(delta){
    if(!this.enabled)return;
    for(const toon of this.materials.values()){toon.alphaMap?.updateMatrix();toon.update(delta);}
  }
  dispose(){this.setModel(null);this.enabled=false;}
}
