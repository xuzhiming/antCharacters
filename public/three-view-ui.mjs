import * as THREE from 'three';
import {clone as cloneModel} from './vendor/SkeletonUtils.js';
import {createHeightRuler,measureModel,hasModelGeometry} from './height-ruler.mjs';
import {language,say,t} from './i18n.mjs';
import {sha256,validateProject} from './project.mjs';
import {THREE_VIEWS,CAMERA_VIEWS,guideView,emptyThreeViews,guidePaths,removeUnusedGuideAssets,fitPendingThreeViews,guideMetrics,alignThreeViews} from './three-view-data.mjs';
import {measureThreeViewFrame} from './three-view-import.mjs';
import {createThreeViewOverlay} from './three-view-renderer.mjs';

const names={front:['正面','Front'],side:['側面','Side'],back:['背面','Back']};
export function initThreeViewUI(hooks){
 const bar=document.querySelector('.model-bar');
 const visibility=document.createElement('label');visibility.id='threeViewVisibility';visibility.hidden=true;
 visibility.innerHTML='<input type="checkbox" id="showThreeViews"><span>三面図</span>';
 const button=document.createElement('button');button.id='loadThreeViews';button.type='button';button.textContent='三面図を調整';
 bar.append(visibility,button);
 const dialog=document.createElement('dialog');dialog.id='threeViewDialog';dialog.setAttribute('aria-labelledby','threeViewTitle');
 dialog.innerHTML=`<div class="dialog-top"><h2 id="threeViewTitle">三面図を調整</h2><button type="button" id="closeThreeViews" aria-label="キャンセル">×</button></div>
 <p class="three-view-help">画像制作で登録した三面図が自動で表示されます。半透明のモデルを基準に、画像の位置・大きさ・透明度を合わせてください。画像の追加・差し替えもできます。</p>
 <div class="three-view-toolbar"><div class="segmented" role="group" aria-label="三面図の方向">${THREE_VIEWS.map(v=>`<button type="button" data-guide-view="${v}" aria-pressed="false">${names[v][0]}</button>`).join('')}</div><button type="button" id="chooseThreeViewImage">画像を選ぶ</button><input type="file" id="threeViewFile" accept="image/png,image/jpeg,image/webp" hidden></div>
 <p id="threeViewFilename" translate="no"></p><p id="threeViewSideHelp" class="small-note" hidden>側面には本人の右側の画像を使います。編集画面の「右側面」に重ねて表示します。</p>
 <div id="threeViewPreview"><span id="threeViewEmpty">画像を選ぶと、モデルに重ねて表示します。</span></div>
 <p class="three-view-help">画像をドラッグして移動できます。大きさと足元の高さは3方向で連動し、左右の位置は方向ごとに調整できます。目盛りは三面図の大きさ・位置に追従します。</p>
 <div class="three-view-controls">
 <label class="field"><span>画像の大きさ <output id="threeViewScaleValue"></output></span><input type="range" id="threeViewScale" min="10" max="400" step="1"></label>
 <label class="field"><span>画像の透明度 <output id="threeViewOpacityValue"></output></span><input type="range" id="threeViewOpacity" min="0" max="100" step="1"></label>
 <label class="field"><span>左右の位置（cm） <output id="threeViewXValue"></output></span><input type="range" id="threeViewX" min="-1000" max="1000" step="0.1"></label>
 <label class="field"><span>足元の高さ（cm） <output id="threeViewYValue"></output></span><input type="range" id="threeViewY" min="-1000" max="1000" step="0.1"></label>
 </div><p id="threeViewError" role="alert" hidden></p>
 <div class="dialog-actions three-view-actions"><label><input type="checkbox" id="threeViewLock"><span>画像の位置・大きさを固定</span></label><button type="button" id="removeThreeViewImage">画像を外す</button><button type="button" id="cancelThreeViews">キャンセル</button><button type="button" id="applyThreeViews" class="primary">適用</button></div>`;
 document.body.append(dialog);
 const $=s=>dialog.querySelector(s),preview=$('#threeViewPreview');
 const mainOverlay=createThreeViewOverlay(hooks.scene,error=>hooks.toast(say('三面図の画像を表示できません。','Could not display the reference image.')));
 let draft=null,draftFiles=null,draftAssets=null,projectId=null,direction='front',pending=false,drag=null,modalRenderer=null,modalScene=null,modalCamera=null,modalOverlay=null,modalRuler=null,materials=[],sizeBasis=1.7,bounds=null;
  let positionRanges,fitting=false,fitAttempt=null,rulerKey='',openGeneration=0;
 const viewName=()=>t(names[direction][0]);
 const error=message=>{const el=$('#threeViewError');el.hidden=!message;el.textContent=message||'';};
 function setPending(value){pending=value;for(const el of dialog.querySelectorAll('button,input'))el.disabled=value;if(!value)refreshDialog();}
 function assetFor(guide,assets){return guide&&assets.find(a=>a.path===guide.path);}
 function refreshDialog(){
  if(!draft)return;
  const guide=draft.views[direction],has=!!guide;
  for(const el of dialog.querySelectorAll('[data-guide-view]')){const active=el.dataset.guideView===direction;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));}
  $('#chooseThreeViewImage').textContent=language()==='ko'?viewName()+' 이미지 선택':say(viewName()+'画像を選ぶ','Choose '+viewName().toLowerCase()+' image');
  $('#threeViewFilename').textContent=assetFor(guide,draftAssets)?.filename||'';
  $('#threeViewSideHelp').hidden=direction!=='side';$('#threeViewEmpty').hidden=has;
  const percent=guide?guideMetrics(guide).height/sizeBasis*100:100;
  // Include reopened settings outside the initial slider range without clamping them.
  $('#threeViewScale').min=Math.min(10,Math.floor(percent));$('#threeViewScale').max=Math.max(400,Math.ceil(percent));$('#threeViewScale').value=percent;
  $('#threeViewScaleValue').textContent=percent.toFixed(0)+'%';
  $('#threeViewOpacity').value=has?Math.round((1-guide.opacity)*100):35;$('#threeViewOpacityValue').textContent=$('#threeViewOpacity').value+'%';
  for(const [id,key] of [['threeViewX','x'],['threeViewY','y']]){
   const value=has?Number(((key==='y'?guideMetrics(guide).bottom:guide.x)*100).toFixed(1)):0,range=positionRanges[key],input=$('#'+id);
   // Preserve saved and dragged positions beyond the model-sized slider window.
   range[0]=Math.min(range[0],value);range[1]=Math.max(range[1],value);input.min=range[0];input.max=range[1];input.value=value;
   $('#'+id+'Value').textContent=value.toFixed(1);
  }
  $('#threeViewLock').checked=guide?.locked||false;
  for(const id of ['threeViewScale','threeViewX','threeViewY'])$('#'+id).disabled=pending||!has||guide.locked;
  for(const id of ['threeViewOpacity','threeViewLock','removeThreeViewImage'])$('#'+id).disabled=pending||!has;
 }
 function resize(){if(!modalRenderer||!dialog.open)return;const rect=preview.getBoundingClientRect();if(!rect.width||!rect.height)return;modalRenderer.setSize(rect.width,rect.height,false);const size=bounds.getSize(new THREE.Vector3()),span=Math.max(size.y*1.3,(direction==='side'?size.z:size.x)*1.3/(rect.width/rect.height),.1);modalCamera.left=-span*rect.width/rect.height/2;modalCamera.right=-modalCamera.left;modalCamera.top=span/2;modalCamera.bottom=-span/2;modalCamera.updateProjectionMatrix();}
 function setModalView(){
  if(!modalCamera)return;const target=bounds.getCenter(new THREE.Vector3()),distance=Math.max(5,bounds.getSize(new THREE.Vector3()).length()*2),dirs={front:[0,0,1],side:[-1,0,0],back:[0,0,-1]};
  modalCamera.position.copy(target).addScaledVector(new THREE.Vector3(...dirs[direction]),distance);modalCamera.lookAt(target);modalCamera.updateMatrixWorld(true);resize();
 }
 function cleanModal(){
  openGeneration++;pending=false;drag=null;draft=null;draftFiles=null;draftAssets=null;
  modalRuler?.dispose();modalRuler=null;rulerKey='';
  modalOverlay?.dispose();modalOverlay=null;for(const m of materials)m.dispose();materials=[];
  if(modalRenderer){modalRenderer.dispose();modalRenderer.forceContextLoss();modalRenderer.domElement.remove();}
  modalScene=null;modalCamera=null;modalRenderer=null;
 }
 function close(){if(dialog.open)dialog.close();else cleanModal();}
 dialog.addEventListener('close',cleanModal);
 dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});
 for(const id of ['closeThreeViews','cancelThreeViews'])$('#'+id).onclick=()=>{if(!pending)close();};
 async function open(){
  const {project,files,model,busy,agentLock,view}=hooks.get();if(busy||agentLock||pending)return;
  const token=++openGeneration;const measurement=measureModel(model);if(!measurement){hooks.toast(say('モデルを先に読み込んでください。','Import a model first.'));return;}
  draft=structuredClone(project.threeViews||emptyThreeViews());draftFiles=new Map(files);draftAssets=structuredClone(project.assets);projectId=project.id;
  direction=guideView(view)||'front';bounds=measurement.bounds.clone();sizeBasis=Math.min(20,Math.max(.01,measurement.height));error('');
  const span=Math.min(1000,Math.max(10,Math.ceil(sizeBasis*100))),center=Math.round(bounds.getCenter(new THREE.Vector3()).y*100);
  positionRanges={x:[-span,span],y:[Math.max(-1000,center-span),Math.min(1000,center+span)]};
  try{
   setPending(true);
   const openingDraft=draft,openingFiles=draftFiles,openingAssets=draftAssets;
   for(const guide of Object.values(openingDraft.views)){if(!guide.frame){const asset=assetFor(guide,openingAssets);guide.frame=await measureThreeViewFrame(openingFiles.get(guide.path),asset.mime);}}
   if(token!==openGeneration)return;
   const basis=draft.views[direction]?direction:Object.keys(draft.views)[0];
   if(basis)alignThreeViews(draft,basis,{locked:Object.values(draft.views).some(g=>g.locked)});
   if(hooks.get().project.id!==projectId||hooks.get().agentLock){cleanModal();return;}
   modalRenderer=new THREE.WebGLRenderer({antialias:true});modalRenderer.setPixelRatio(Math.min(devicePixelRatio,2));modalRenderer.outputColorSpace=THREE.SRGBColorSpace;modalRenderer.toneMapping=THREE.NoToneMapping;
   modalScene=new THREE.Scene();modalCamera=new THREE.OrthographicCamera(-1,1,1,-1,.0001,5000);
   modalScene.add(new THREE.HemisphereLight(0xffffff,0xa2a98c,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-2,3,4);modalScene.add(light);
   const copy=cloneModel(model),cloned=new Map();copy.traverse(o=>{if(!o.isMesh)return;const cloneMaterial=m=>{if(!cloned.has(m)){const c=m.clone();c.opacity=.35;c.transparent=true;c.depthWrite=false;c.needsUpdate=true;cloned.set(m,c);materials.push(c);}return cloned.get(m);};o.material=Array.isArray(o.material)?o.material.map(cloneMaterial):cloneMaterial(o.material);});modalScene.add(copy);
   modalOverlay=createThreeViewOverlay(modalScene,()=>error(say('三面図の画像を表示できません。','Could not display the reference image.')));
   modalRuler=createHeightRuler(preview,{idPrefix:'threeView',reference:true});modalScene.add(modalRuler.object);
   preview.prepend(modalRenderer.domElement);dialog.showModal();setModalView();refreshDialog();
  }catch(e){close();hooks.toast(e.message);}finally{if(token===openGeneration)setPending(false);}
 }
 button.onclick=open;
 dialog.querySelectorAll('[data-guide-view]').forEach(el=>el.onclick=()=>{if(pending)return;direction=el.dataset.guideView;error('');setModalView();refreshDialog();});
 $('#chooseThreeViewImage').onclick=()=>$('#threeViewFile').click();
 $('#threeViewFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file||pending||!draft)return;const selectedView=direction;
  setPending(true);error('');
  try{
   if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024**2)throw Error(say('参考画像は20MB以内のPNG/JPEG/WebPにしてください。','Use PNG, JPEG or WebP references no larger than 20 MB.'));
   const bytes=new Uint8Array(await file.arrayBuffer());let bitmap,width,height;
   try{bitmap=await createImageBitmap(new Blob([bytes],{type:file.type}));width=bitmap.width;height=bitmap.height;const max=Math.min(8192,modalRenderer.capabilities.maxTextureSize);if(width>max||height>max)throw Error(say('画像の縦横は8192ピクセル以内にしてください。','Use images no larger than 8192 pixels on either axis.'));}finally{bitmap?.close();}
   const ext={ 'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[file.type],path='assets/three-view/'+crypto.randomUUID()+'.'+ext;
   const asset={path,role:'reference',filename:file.name,mime:file.type,width,height,sha256:await sha256(bytes)},frame=await measureThreeViewFrame(bytes,file.type);
   if(!draft||!dialog.open)return;
   const previous=draft.views[selectedView]||Object.values(draft.views)[0],shared=previous?guideMetrics(previous):{height:sizeBasis,bottom:bounds.min.y};
   draftAssets.push(asset);draftFiles.set(path,bytes);draft.views[selectedView]={path,x:previous?.x||0,y:shared.bottom+(frame.bottom-.5)*shared.height/(frame.bottom-frame.top),height:shared.height/(frame.bottom-frame.top),frame,opacity:previous?.opacity??.65,locked:previous?.locked??false};alignThreeViews(draft,selectedView,shared);draft.visible=true;
  }catch(e){error(e.message);}finally{setPending(false);}
 };
 $('#threeViewScale').oninput=e=>{const guide=draft?.views[direction];if(!guide||guide.locked)return;alignThreeViews(draft,direction,{height:sizeBasis*Number(e.target.value)/100});refreshDialog();};
 $('#threeViewOpacity').oninput=e=>{const guide=draft?.views[direction];if(!guide)return;guide.opacity=1-Number(e.target.value)/100;refreshDialog();};
 for(const [id,key] of [['threeViewX','x'],['threeViewY','y']])$('#'+id).oninput=e=>{const guide=draft?.views[direction];if(!guide||guide.locked)return;if(key==='x')guide.x=Number(e.target.value)/100;else alignThreeViews(draft,direction,{bottom:Number(e.target.value)/100});error('');refreshDialog();};
 $('#threeViewLock').onchange=e=>{if(draft?.views[direction])alignThreeViews(draft,direction,{locked:e.target.checked});refreshDialog();};
 $('#removeThreeViewImage').onclick=()=>{delete draft.views[direction];error('');refreshDialog();};
 preview.addEventListener('pointerdown',e=>{const guide=draft?.views[direction];if(e.button!==0||pending||!guide||guide.locked||!modalCamera)return;const rect=preview.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:guide.x,startY:guideMetrics(guide).bottom,metersPerPixel:(modalCamera.top-modalCamera.bottom)/rect.height};preview.setPointerCapture(e.pointerId);e.preventDefault();});
 preview.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const guide=draft?.views[direction];if(!guide||guide.locked)return;guide.x=Math.max(-10,Math.min(10,drag.startX+(e.clientX-drag.x)*drag.metersPerPixel));alignThreeViews(draft,direction,{bottom:drag.startY-(e.clientY-drag.y)*drag.metersPerPixel});refreshDialog();});
 const endDrag=()=>{drag=null;};preview.addEventListener('pointerup',endDrag);preview.addEventListener('pointercancel',endDrag);preview.addEventListener('lostpointercapture',endDrag);
 $('#applyThreeViews').onclick=()=>{
  if(pending||!draft)return;const {project,files,agentLock,busy}=hooks.get();if(agentLock||busy)return;
  if(project.id!==projectId){close();return;}
  try{
   const next=structuredClone(project),nextFiles=new Map(files);next.threeViews=structuredClone(draft);
   for(const guide of Object.values(next.threeViews.views))guide.autoFit=false;
   const oldPaths=new Set([...guidePaths(project),...draftAssets.filter(a=>!project.assets.some(b=>b.path===a.path)).map(a=>a.path)]);
   next.assets=draftAssets;removeUnusedGuideAssets(next,oldPaths);
   for(const a of next.assets)if(draftFiles.has(a.path))nextFiles.set(a.path,draftFiles.get(a.path));
   validateProject(next);const selected=direction;hooks.commit(next,nextFiles);close();hooks.setView(CAMERA_VIEWS[selected]);
  }catch(e){error(e.message);}
 };
 visibility.querySelector('input').onchange=e=>{const {project,files,busy,agentLock}=hooks.get();if(busy||agentLock){refresh();return;}const next=structuredClone(project);next.threeViews.visible=e.target.checked;hooks.commit(next,new Map(files));};
 async function fitGenerated(){
  const snapshot=hooks.get(),{project,files,model,stage,busy,agentLock}=snapshot;
  const pending=Object.entries(project.threeViews?.views||{}).filter(([,g])=>g.autoFit&&!g.locked);
  if(fitting||fitAttempt===project||busy||agentLock||stage!=='placement'||!pending.length||dialog.open)return;
  const measured=measureModel(model);if(!measured)return;
  fitting=true;fitAttempt=project;button.disabled=true;
  try{
   const frames={};for(const [view,g] of pending){const asset=assetFor(g,project.assets);frames[view]=await measureThreeViewFrame(files.get(g.path),asset.mime);}
   const current=hooks.get();if(current.project!==project||current.model!==model||current.stage!=='placement'||current.busy||current.agentLock){fitAttempt=null;return;}
   const center=measured.bounds.getCenter(new THREE.Vector3()),next=structuredClone(project);fitPendingThreeViews(next,{height:measured.height,minY:measured.bounds.min.y,centerX:center.x,centerZ:center.z},frames);validateProject(next);hooks.initialize(next,new Map(files));
  }catch(e){hooks.toast(e.message);}finally{fitting=false;refresh();}
 }
 function refresh(){const {project,model,stage,busy,agentLock}=hooks.get();button.hidden=!['assets','placement'].includes(stage);button.disabled=fitting||busy||agentLock||button.hidden||!hasModelGeometry(model);visibility.hidden=button.hidden||!guidePaths(project).size;visibility.querySelector('input').checked=project.threeViews?.visible!==false;visibility.querySelector('input').disabled=busy||agentLock;void fitGenerated();}
 function render(){
  const {project,files,stage,view}=hooks.get(),v=guideView(view),guide=v?project.threeViews?.views[v]:null;
  mainOverlay.update(v,guide,files,assetFor(guide,project.assets),['assets','placement'].includes(stage)&&!document.querySelector('#candidateDialog')?.open&&project.threeViews?.visible===true);
  if(dialog.open&&modalRenderer){
   const guide=draft?.views[direction];modalOverlay.update(direction,guide,draftFiles,assetFor(guide,draftAssets));
   const key=guide?JSON.stringify([direction,guide,modalOverlay.mesh.scale.x]):'';
   if(key!==rulerKey){rulerKey=key;if(guide){const metrics=guideMetrics(guide),half=modalOverlay.mesh.scale.x/2,center=direction==='back'?-guide.x:guide.x;
    const min=direction==='side'?new THREE.Vector3(0,metrics.bottom,center-half):new THREE.Vector3(center-half,metrics.bottom,0),max=direction==='side'?new THREE.Vector3(0,metrics.bottom+metrics.height,center+half):new THREE.Vector3(center+half,metrics.bottom+metrics.height,0);
    modalRuler.update({bounds:new THREE.Box3(min,max),height:metrics.height});}else modalRuler.update(null);}
   modalRuler.render(modalCamera,!!guide,CAMERA_VIEWS[direction]);modalScene.background=new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--viewport').trim()||'#e9ece7');modalRenderer.render(modalScene,modalCamera);
  }
 }
 new ResizeObserver(resize).observe(preview);
 window.addEventListener('languagechange',()=>{if(dialog.open)refreshDialog();});
 return {refresh,render,clear(){close();mainOverlay.clear();},isOpen:()=>dialog.open};
}
