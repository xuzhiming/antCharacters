import * as THREE from 'three';
export const VIEW_HEIGHT=1.95;
export function visibleHeight(camera,target){return camera.isPerspectiveCamera?2*camera.position.distanceTo(target)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/camera.zoom:VIEW_HEIGHT/camera.zoom;}
// A tiny fixed near plane loses depth precision as the perspective camera
// dollies out, letting closely layered face surfaces overwrite one another.
// Follow the orbit distance so distant layers remain distinct and close-ups
// still have room in front of the near plane. Orthographic depth is linear.
export function updateCameraClipping(camera,target){
 if(!camera.isPerspectiveCamera)return;
 const distance=camera.position.distanceTo(target);
 if(!Number.isFinite(distance)||distance<=0)return;
 const near=Math.max(.000001,distance*.01),far=Math.max(200,distance*2);
 if(camera.near===near&&camera.far===far)return;
 camera.near=near;camera.far=far;camera.updateProjectionMatrix();
}
export function frameCamera(camera,target,direction,height){
 height=Math.max(.002,Math.min(100,height));
 if(camera.isPerspectiveCamera){camera.zoom=1;camera.position.copy(target).add(direction.clone().normalize().multiplyScalar(height/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))));}
 else{camera.zoom=VIEW_HEIGHT/height;camera.position.copy(target).add(direction);}
 camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
}
