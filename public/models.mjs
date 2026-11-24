import {ACTIVE_ROLES} from './workflow.mjs';
import {previewProject} from './production.mjs';
import {currentRigGuide,guideModel} from './rig-guide.mjs';
import * as THREE from 'three';
import {FBXLoader} from './vendor/FBXLoader.js';
import {checkFBX,identity,ROLES} from './project.mjs';
import {showBackFaces} from './material-preview.mjs';
export const b2t=p=>new THREE.Vector3(p[0],p[2],-p[1]);
const axis=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
export function applyPlacement(group,t=identity()){
 group.position.copy(b2t(t.position));group.scale.setScalar(t.scale);
 // Blender XYZ Euler rotates X, then Y, then Z (Three.js intrinsic ZYX).
 const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...t.rotation.map(n=>n*Math.PI/180),'ZYX'));
 group.quaternion.copy(axis).multiply(q).multiply(axis.clone().invert());group.updateMatrixWorld(true);
}
export function sourceMatrix(settings={}){
 const defaults={CoordAxis:0,CoordAxisSign:1,UpAxis:1,UpAxisSign:1,FrontAxis:2,FrontAxisSign:1,UnitScaleFactor:1};
 const s={...defaults,...settings},rows=['Coord','Up','Front'].map(k=>{const row=[0,0,0];if(![0,1,2].includes(s[k+'Axis'])||![1,-1].includes(s[k+'AxisSign']))throw Error('FBX座標軸が不正です。');row[s[k+'Axis']]=s[k+'AxisSign'];return row;});
 const unit=s.UnitScaleFactor*.01;
 if(!Number.isFinite(unit)||unit<=0)throw Error('FBXの単位が不正です。');
 const m=new THREE.Matrix4().set(...rows[0],0,...rows[1],0,...rows[2],0,0,0,0,1);
 if(Math.abs(m.determinant()-1)>1e-6)throw Error('対応していないFBX座標系です。');
 return m.scale(new THREE.Vector3(unit,unit,unit));
}
export async function parseModel(data,{path='model.fbx',resources=[],files=new Map(),ignoreTextures=false}={}){
 checkFBX(data);
 const manager=new THREE.LoadingManager(),urls=[],embedded=new Set(),missing=[];
 const directory=path.slice(0,path.lastIndexOf('/')+1);
 manager.setURLModifier(url=>{
  if(url.startsWith('blob:')){embedded.add(url);return url;}
  if(url.startsWith('data:image/'))return url;
  let name;try{name=decodeURIComponent(url).replaceAll('\\','/');}catch{name=url;}
  const relative=name.replace(/^\.\//,'');
  let matches=resources.filter(r=>r.path===directory+relative||r.path===relative);
  if(!matches.length)matches=resources.filter(r=>r.path.split('/').pop()===relative.split('/').pop());
  if(matches.length!==1||!files.has(matches[0].path)){missing.push(name);return 'data:,';}
  const p=matches[0].path,mime=/\.png$/i.test(p)?'image/png':/\.webp$/i.test(p)?'image/webp':'image/jpeg';
  const blob=URL.createObjectURL(new Blob([files.get(p)],{type:mime}));urls.push(blob);return blob;
 });
 let root;
 try{
  await new Promise((resolve,reject)=>{
   manager.onLoad=resolve;manager.onError=url=>missing.push(url);
   manager.itemStart('charakit-parse');
   try{root=new FBXLoader(manager).parse(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'',{skipTextures:ignoreTextures});manager.itemEnd('charakit-parse');}catch(e){reject(e);}
  });
  if(missing.length)throw Error('テクスチャを読み込めません。FBXと画像を同じZIPにまとめてください: '+missing[0]);
  let meshCount=0;root.traverse(o=>{if(o.isMesh)meshCount++;});if(!meshCount)throw Error('FBXにメッシュがありません。');
  showBackFaces(root);
  const result=new THREE.Group();result.name='FBXSource';result.matrixAutoUpdate=false;result.matrix.copy(sourceMatrix(root.userData.fbxSettings));result.add(root);result.updateMatrixWorld(true);return result;
 }catch(e){disposeModel(root);throw e;}finally{for(const url of [...urls,...embedded])URL.revokeObjectURL(url);}
}
export function normalizeAsset(root,role){
 root.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(root,true),size=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());
 if(!Number.isFinite(size.y)||size.y<1e-8)throw Error('モデルの高さを読み取れません。');
 const height=role==='body'?1.45:role==='hair'?.95:.30,scale=height/size.y;
 return {scale,offset:[-c.x*scale,-c.y*scale,-c.z*scale],height};
}
export async function buildModel(p,files,{ignoreTextures=false}={}){
 p=previewProject(p);
 const model=new THREE.Group();model.name='CharaKit';model.userData={charakitProject:p.id};
 try{const assets=p.mode==='assembled'?p.assets.filter(a=>a.path===p.updatedModel?.path||(p.workflow?.attachHair&&a.role==='hair')):p.assets.filter(a=>ACTIVE_ROLES.includes(a.role));
 for(const a of assets){const data=files.get(a.path);if(!data)throw Error('素材がありません。');const root=await parseModel(data,{...a,files,ignoreTextures});
 if(a.componentSource){const remove=[];root.traverse(o=>{if(o.isMesh){const c=p.production.components.find(c=>c.id===o.name);if(c?.source!==a.componentSource)remove.push(o);else o.userData.componentId=c.id;}});for(const o of remove)o.removeFromParent();}
 const group=new THREE.Group();group.name=a.role;group.userData={charakitRole:a.role,assetPath:a.path};
 if(p.mode==='parts'||a.role==='hair'){const n=a.normalization;if(!n)throw Error('素材の初期配置がありません。');const normal=new THREE.Group();normal.scale.setScalar(n.scale);normal.position.fromArray(n.offset);normal.add(root);group.add(normal);}else group.add(root);
 applyPlacement(group,p.placements[a.role.startsWith('head_')?'head':a.role]);model.add(group);
 }if(p.mode==='parts'&&currentRigGuide(p))model.add(guideModel(p.rigGuide));return model;}catch(e){disposeModel(model);throw e;}
}
export function disposeModel(root){const textures=new Set(),geometries=new Set(),materials=new Set();root?.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});for(const t of textures){t.source?.data?.close?.();t.dispose();}for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}
