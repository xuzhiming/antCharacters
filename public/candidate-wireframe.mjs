import * as THREE from 'three';

// The preview scene uses meters. Never clamp this width to a screen pixel.
const WIRE_WIDTH=.0005;

// One ribbon per edge, batched into a single draw call for each source mesh.
// Keep the endpoints as the CPU positions so bounds/height still match the model.
function ribbonGeometry(edges){
 const count=edges.count/2,positions=new Float32Array(count*12),others=new Float32Array(count*12),sides=new Float32Array(count*4);
 const indices=count*4>65536?new Uint32Array(count*6):new Uint16Array(count*6),a=new THREE.Vector3(),b=new THREE.Vector3();
 for(let i=0;i<count;i++){
  a.fromBufferAttribute(edges,i*2);b.fromBufferAttribute(edges,i*2+1);const v=i*4;
  for(let j=0;j<4;j++){
   (j<2?a:b).toArray(positions,(v+j)*3);
   (j<2?b:a).toArray(others,(v+j)*3);
  }
  // The direction reverses at the other endpoint, so reverse its side as well.
  sides.set([-1,1,1,-1],v);indices.set([v,v+2,v+1,v+2,v+3,v+1],i*6);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 geometry.setAttribute('wireOther',new THREE.BufferAttribute(others,3));
 geometry.setAttribute('wireSide',new THREE.BufferAttribute(sides,1));
 geometry.setIndex(new THREE.BufferAttribute(indices,1));return geometry;
}

function wireMaterial(){
 const material=new THREE.MeshBasicMaterial({color:0x555555,side:THREE.DoubleSide,depthTest:true,depthWrite:false,toneMapped:false});
 material.onBeforeCompile=shader=>{
  shader.uniforms.wireWidth={value:WIRE_WIDTH};
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
   attribute vec3 wireOther;
   attribute float wireSide;
   uniform float wireWidth;
  `).replace('#include <project_vertex>',`
   vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
   vec4 other = modelViewMatrix * vec4(wireOther, 1.0);
   vec3 towardCamera = isOrthographic ? vec3(0.0, 0.0, 1.0) : -(mvPosition.xyz + other.xyz) * 0.5;
   vec3 across = cross(other.xyz - mvPosition.xyz, towardCamera);
   across /= max(length(across), 0.00000001);
   // Expand in view-space meters BEFORE projection. Perspective distance and
   // orthographic zoom naturally change the projected width of the same ribbon.
   mvPosition.xyz += across * wireSide * wireWidth * 0.5;
   gl_Position = projectionMatrix * mvPosition;
   // Retain surface visibility without showing hidden edges through the model.
   gl_Position.z -= 0.000001 * gl_Position.w;
  `);
 };
 return material;
}

// Candidate preview only. Keep the source materials and the FBX polygon boundaries.
export function setCandidateWireframe(model,enabled){
 const meshes=[];model?.traverse(o=>{if(o.isMesh&&!o.userData.candidateWireframe)meshes.push(o);});
 for(const mesh of meshes){
  const existing=mesh.children.find(o=>o.userData.candidateWireframe);
  if(!enabled){
   if(existing){existing.removeFromParent();existing.geometry.dispose();existing.material.dispose();}
   continue;
  }
  if(existing)continue;
  const positions=mesh.geometry.userData.fbxWirePositions;
  const fallback=positions?null:new THREE.WireframeGeometry(mesh.geometry);
  const edges=positions?new THREE.Float32BufferAttribute(positions,3):fallback.getAttribute('position');
  const geometry=ribbonGeometry(edges);fallback?.dispose();
  const wire=new THREE.Mesh(geometry,wireMaterial());wire.name='CandidateWireframe';
  // Shader expansion is absent from CPU bounds; don't cull a thin ribbon at the
  // viewport border before its source edge has left the view.
  wire.frustumCulled=false;
  wire.userData.candidateWireframe=true;wire.renderOrder=mesh.renderOrder+1;mesh.add(wire);
 }
}
