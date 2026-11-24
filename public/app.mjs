import {initSessionUI} from './session-ui.mjs';
import {initExpressionEditor} from './expression-editor-ui.mjs';
import {fineRange} from './fine-range.mjs';
import {initThreeViewUI} from './three-view-ui.mjs';
import {guidePaths} from './three-view-data.mjs';
import {requestWeightTransfer} from './weight-job.mjs';
import {initPreview} from './preview-ui.mjs';
import {initProductionUI} from './production-ui.mjs';
import {setCandidateWireframe} from './candidate-wireframe.mjs';
import {alignTripoReturn,importTripoBones} from './roundtrip.mjs';
import {materialPreview} from './material-preview.mjs';
import {MToonReview,mtoonReady,materialCounts} from './mtoon-materials.mjs';
import {initMotionReview} from './motion-review-ui.mjs';
import {initVRMExportUI} from './vrm-export-ui.mjs';
import {ACTIVE_ROLES,workflow} from './workflow.mjs';
import {initMVPUI} from './mvp-ui.mjs';
import {t,language,initLocalization} from './i18n.mjs';
import {initImageUI} from './image-ui.mjs';
import * as THREE from 'three';
import {buildModel,parseModel,normalizeAsset,disposeModel,applyPlacement} from './models.mjs';
import {STATES,ROLES,ROLE_LABELS,isModelAsset,newProject,identity,sha256,checkFBX,packProject,unpackProject,handoff,scaleProject} from './project.mjs';
import {unzip} from './archive.mjs';
import {visibleHeight,frameCamera,updateCameraClipping} from './cameras.mjs';
import {measureModel,createHeightRuler} from './height-ruler.mjs';
import {OrbitControls} from './vendor/OrbitControls.js';
import {definitions,ids,bodyIds,fingerIds,makeFingerMarkers,centerIds,constrainCenters,stripLegacyReview,moveMarker,editInView} from './schema.mjs';
const $=s=>document.querySelector(s),clone=v=>structuredClone(v);
let mvp,motionReview,expressionEditor,sessionUI,threeViewUI,productionUI,agentLock=false;const reviewClock=new THREE.Clock();
const reviewMaterials=new MToonReview();
globalThis.charakitMaterials={report:()=>materialCounts(model)};
let files=new Map(),stage='assets',springSelection=null,referenceURLs=[],exported=false;
function freshProject(){const p=newProject();p.name=t('新しいキャラクター');return p;}
let project=freshProject(),selected='hips',view='front',dirty=false,busy=false,model,history=[],future=[],drag=null,toastTimer,isolatedComponent='',previewingCandidate=false;
let candidatePreviewContext=null;
let fingerMode=false,handSide='L',bodyCamera=null;
const visibleMarkerIds=()=>(fingerMode?['wrist.'+handSide,'hand.'+handSide,...fingerIds.filter(id=>id.endsWith('.'+handSide))]:bodyIds).filter(id=>project.markers[id]);
const viewport=$('#viewport'),labels=$('#labels');
const heightRuler=createHeightRuler(viewport);
const scene=new THREE.Scene();scene.background=new THREE.Color('#e9ece7');scene.add(heightRuler.object);
const orthographicCamera=new THREE.OrthographicCamera(-1,1,1,-1,.0001,200),perspectiveCamera=new THREE.PerspectiveCamera(40,1,.01,200);
let pendingFit=false;
let camera=orthographicCamera;camera.position.set(0,.88,5);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;viewport.prepend(renderer.domElement);
let controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.88,0);controls.enableRotate=false;controls.enableDamping=false;controls.minZoom=.25;controls.maxZoom=80;controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
const grid=new THREE.GridHelper(5,50,0xc8d1c7,0xdce2d9);scene.add(grid);scene.add(new THREE.HemisphereLight(0xffffff,0xa2a98c,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-2,3,4);scene.add(light);

const lineMaterial=new THREE.LineBasicMaterial({color:0x618c77,transparent:true,opacity:.75,depthTest:false,depthWrite:false});
const lines=new THREE.LineSegments(new THREE.BufferGeometry(),lineMaterial);lines.renderOrder=90;scene.add(lines);
const raycaster=new THREE.Raycaster();let box=new THREE.Box3(new THREE.Vector3(-.8,0,-.2),new THREE.Vector3(.8,1.8,.2));
const b2t=p=>new THREE.Vector3(p[0],p[2],-p[1]);const t2b=p=>[p.x,-p.z,p.y];
function toast(s){$('#toast').textContent=s;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4000);}
async function api(url,options){const r=await fetch(url,options);const j=await r.json();if(!r.ok)throw Error(j.error||'処理に失敗しました。');return j;}
function markDirty(){window.dispatchEvent(new Event('journey-change'));dirty=true;$('#saveStatus').textContent='未保存の変更';$('#save').disabled=busy;}
function push(){history.push(clone(project));if(history.length>60)history.shift();future=[];}
function changed(transform=false){markDirty();mvp?.refresh();if(transform)applyTransforms();updateUI();visibility();}
function select(id){springSelection=null;selected=id;updateUI();}
const groups=[...new Set(definitions.map(d=>d.group))];
for(const group of groups){const h=document.createElement('div');h.className='group-label';h.dataset.group=group;h.textContent=group;$('#markerList').append(h);
 for(const d of definitions.filter(d=>d.group===group)){const i=ids.indexOf(d.id);const button=document.createElement('button');button.className='marker-row';button.dataset.id=d.id;button.innerHTML=`<span class="num">${String(i+1).padStart(2,'0')}</span><span>${d.label}</span>`;button.onclick=()=>select(d.id);$('#markerList').append(button);
 const label=document.createElement('button');label.className='marker-label';label.dataset.id=d.id;label.dataset.label=d.label;label.title=d.label;label.setAttribute('aria-label',`${d.label}マーカー`);label.addEventListener('pointerdown',e=>startDrag(e,d.id));label.onclick=()=>select(d.id);labels.append(label);}
}
function updateUI(){if(!project)return;if(fingerMode&&!fingerIds.some(id=>project.markers[id])){setFingerMode(false);return;}syncMarkerMode();if(!project.markers[selected]||!visibleMarkerIds().includes(selected))selected=visibleMarkerIds().find(id=>project.markers[id]);$('#selectedTitle').setAttribute('translate','yes');updateSpringLines();if(stage==='springs'){if(currentSpring())updateSpringUI();else{$('#selectedTitle').textContent='経路を選択';$('#selectedHint').textContent='左の経路を選ぶか、新しく追加してください。';$('#markerNumber').textContent='—';['X','Y','Z'].forEach(a=>$('#coord'+a).disabled=true);$('#mirrorHelp').textContent='揺れものの指定は任意です。';$('#undo').disabled=!history.length;$('#redo').disabled=!future.length;}return;}const d=definitions.find(d=>d.id===selected),m=project.markers[selected];
 const mirrorOn=$('#mirror').checked;const partner=selected.endsWith('.L')?selected.replace('.L','.R'):selected.endsWith('.R')?selected.replace('.R','.L'):null;
 $('#mirrorStatus').textContent=mirrorOn?'ON':'OFF';$('#mirror').closest('label').classList.toggle('enabled',mirrorOn);
 $('#mirrorHelp').textContent=!mirrorOn?'ミラーOFF：選択した点だけを動かします。':partner?`ミラーON：${definitions.find(d=>d.id===partner).label}も左右対称に動きます。`:'ミラーON：左右のある関節が連動します。中心の点は単独で動きます。';
 $('#selectedTitle').textContent=d.label;$('#selectedHint').textContent=d.hint+(centerIds.includes(selected)?' 左右は中心線（X = 0）に固定されています。':'');
 $('#coordY').disabled=$('#coordZ').disabled=false;$('#coordX').disabled=centerIds.includes(selected);$('#coordX').title=centerIds.includes(selected)?'中心線に固定（X = 0）':'';$('#markerNumber').textContent=String(ids.indexOf(selected)+1).padStart(2,'0');
 ['X','Y','Z'].forEach((axis,i)=>{const input=$('#coord'+axis);if(document.activeElement!==input)input.value=(m.position[i]*1000).toFixed(1);});
 for(const el of document.querySelectorAll('[data-id]')){el.classList.toggle('active',el.dataset.id===selected);el.classList.toggle('mirror-peer',mirrorOn&&el.dataset.id===partner);}
 $('#undo').disabled=!history.length;$('#redo').disabled=!future.length;$('#prev').disabled=visibleMarkerIds().indexOf(selected)===0;$('#next').disabled=visibleMarkerIds().indexOf(selected)===visibleMarkerIds().length-1;
 const points=[];for(const def of definitions){if(def.parent&&project.markers[def.id]&&project.markers[def.parent]&&visibleMarkerIds().includes(def.id)&&(!fingerMode||visibleMarkerIds().includes(def.parent))){points.push(b2t(project.markers[def.parent].position),b2t(project.markers[def.id].position));}}
 lines.geometry.dispose();lines.geometry=new THREE.BufferGeometry().setFromPoints(points);
 $('#footerNote').textContent='調整したら保存 · 側面と上面も見て合わせてください';if(stage==='assets'||stage==='placement'){$('#markerNumber').textContent=stage==='assets'?'01':'02';$('#selectedTitle').textContent=stage==='assets'?'素材を準備':'立体で合わせる';$('#selectedHint').textContent=stage==='assets'?'体・髪・通常顔の3部位を読み込みます。途中でも保存できます。':'側面・背面から、頭・髪・体の位置と重なりを確認してください。';}
}
function syncLabels(){if(!project)return;syncSpringLabels();const rect=viewport.getBoundingClientRect(),shown=new Set(visibleMarkerIds());for(const el of labels.querySelectorAll('[data-id]')){if(!project.markers[el.dataset.id]||!shown.has(el.dataset.id)){el.style.display='none';continue;}const p=b2t(project.markers[el.dataset.id].position).project(camera);el.style.left=(p.x+1)*rect.width/2+'px';el.style.top=(1-p.y)*rect.height/2+'px';el.style.display=stage!=='markers'||Math.abs(p.x)>1||Math.abs(p.y)>1||Math.abs(p.z)>1?'none':'';
 // In side views show the selected side, and center markers; avoid stacked handles.
 const side=selected.endsWith('.L')?'L':selected.endsWith('.R')?'R':view==='right'?'R':'L';
 if((view==='right'||view==='left')&&el.dataset.id.includes('.')&&!el.dataset.id.endsWith('.'+side))el.style.display='none';
 }}
function resize(){const {width:w,height:h}=viewport.getBoundingClientRect();if(!w||!h)return;renderer.setSize(w,h,false);const v=1.95;orthographicCamera.left=-v*w/h/2;orthographicCamera.right=v*w/h/2;orthographicCamera.top=v/2;orthographicCamera.bottom=-v/2;perspectiveCamera.aspect=w/h;orthographicCamera.updateProjectionMatrix();perspectiveCamera.updateProjectionMatrix();if(pendingFit){pendingFit=false;queueMicrotask(fit);}}
new ResizeObserver(resize).observe(viewport);
function setView(v,height=visibleHeight(camera,controls.target)){
 view=v;const target=controls.target.clone(),dirs={front:[0,0,5],back:[0,0,-5],right:[-5,0,0],left:[5,0,0],top:[0,5,0],orbit:[3,1.2,4]};
 controls.dispose();camera=v==='orbit'?perspectiveCamera:orthographicCamera;camera.up.set(...(v==='top'?[0,0,-1]:[0,1,0]));frameCamera(camera,target,new THREE.Vector3(...dirs[v]),height);
 controls=new OrbitControls(camera,renderer.domElement);controls.target.copy(target);controls.enableDamping=false;controls.minZoom=.25;controls.maxZoom=1000;controls.minDistance=.003;controls.maxDistance=150;controls.mouseButtons.MIDDLE=THREE.MOUSE.DOLLY;controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;controls.enableRotate=v==='orbit';controls.mouseButtons.LEFT=v==='orbit'?THREE.MOUSE.ROTATE:THREE.MOUSE.PAN;controls.update();
 viewport.dataset.projection=v==='orbit'?'perspective':'orthographic';
 const titles={front:'正面',back:'背面',right:'右側面（本人の右）',left:'左側面（本人の左）',top:'上面（画面下が顔の前）',orbit:'3Dで確認'};
 $('#viewTitle').textContent=titles[v];$('#viewAxes').textContent=v==='orbit'?'回転して立体的に確認':v==='top'?'左右 X / 前後 Y · 高さ Z は固定':v==='front'||v==='back'?'左右 X / 高さ Z':'前後 Y / 高さ Z';
 $('#viewHint').textContent=v==='orbit'?'ドラッグで回転 · 配置は正面・側面か数値入力で調整':['rig','review'].includes(stage)?'ホイールで拡大 · 右ドラッグで移動':'点をドラッグして移動 · ホイールで拡大 · 右ドラッグで移動';
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===v));camera.updateMatrixWorld(true);syncLabels();}
$('#views').onclick=e=>{if(e.target.dataset.view)setView(e.target.dataset.view);};
function fit({preserveDirection=false}={}){if(!viewport.clientWidth||!viewport.clientHeight){pendingFit=true;return;}const direction=camera.position.clone().sub(controls.target);resize();if(fingerMode&&stage==='markers'){fitHand();return;}if(box.isEmpty())box.set(new THREE.Vector3(-.8,0,-.2),new THREE.Vector3(.8,1.8,.2));const size=box.getSize(new THREE.Vector3());controls.target.copy(box.getCenter(new THREE.Vector3()));const aspect=viewport.clientWidth/viewport.clientHeight;const extent=view==='front'||view==='back'||view==='top'?size.x:view==='orbit'?Math.max(size.x,size.z):size.z;
 const height=(view==='orbit'?size.length()*1.25/Math.min(1,aspect):Math.max((view==='top'?size.z:size.y)*1.16,extent*1.15/aspect))*(stage==='placement'?viewport.clientHeight/Math.max(80,viewport.clientHeight-120):1);setView(view,height);if(preserveDirection&&view==='orbit'){frameCamera(camera,controls.target,direction,height);controls.update();}}
$('#fit').onclick=()=>stage==='expressions'?expressionEditor?.fitAll():fit();$('#focus').onclick=()=>{controls.target.copy(b2t(currentPosition()));setView(view,fingerMode?Math.min(visibleHeight(camera,controls.target),1.95/14):1.95/3);};
function syncMarkerMode(){
 const activeIds=visibleMarkerIds();
 for(const row of document.querySelectorAll('.marker-row'))row.hidden=!activeIds.includes(row.dataset.id)||!project.markers[row.dataset.id];
 for(const h of document.querySelectorAll('#markerList .group-label'))h.hidden=!definitions.some(d=>d.group===h.dataset.group&&activeIds.includes(d.id)&&project.markers[d.id]);
 $('#handControls').hidden=!fingerMode;
 for(const b of document.querySelectorAll('[data-marker-mode]')){const active=(b.dataset.markerMode==='fingers')===fingerMode;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
 for(const b of document.querySelectorAll('[data-hand]')){b.classList.toggle('active',b.dataset.hand===handSide);b.setAttribute('aria-pressed',String(b.dataset.hand===handSide));}
 $('#fit').textContent=fingerMode?'手全体':'全体';
}
function fitHand(){
 const bounds=new THREE.Box3();for(const id of visibleMarkerIds())if(project.markers[id])bounds.expandByPoint(b2t(project.markers[id].position));
 const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
 const diameter=Math.max(size.length(),.06),aspect=viewport.clientWidth/viewport.clientHeight;
 controls.target.copy(center);setView(view,diameter*1.5/Math.min(1,aspect));
}
function setFingerMode(enabled){
 if(enabled===fingerMode)return;
 if(enabled){
  bodyCamera={position:camera.position.clone(),target:controls.target.clone(),up:camera.up.clone(),zoom:camera.zoom,view,selected};
  handSide=selected.endsWith('.R')?'R':'L';
  if(fingerIds.some(id=>!project.markers[id])){push();const initial=makeFingerMarkers(project.markers);for(const id of fingerIds)project.markers[id]??=initial[id];markDirty();}
  fingerMode=true;selected='hand.'+handSide;view='top';updateUI();fitHand();
 }else{
  fingerMode=false;selected=bodyCamera?.selected||'hips';updateUI();
  if(bodyCamera){controls.target.copy(bodyCamera.target);setView(bodyCamera.view);camera.position.copy(bodyCamera.position);camera.up.copy(bodyCamera.up);camera.zoom=bodyCamera.zoom;camera.updateProjectionMatrix();controls.update();bodyCamera=null;}
 }
 syncLabels();
}
$('#markerModes').onclick=e=>{const b=e.target.closest('[data-marker-mode]');if(b)setFingerMode(b.dataset.markerMode==='fingers');};
$('#handControls').onclick=e=>{const b=e.target.closest('[data-hand]');if(!b)return;const previous=handSide;handSide=b.dataset.hand;selected=selected.replace('.'+previous,'.'+handSide);updateUI();fitHand();};
function startDrag(e,id){if(e.button!==0||!project||busy||agentLock)return;e.preventDefault();e.stopPropagation();if(id.startsWith('spring:')){springSelection=id.slice(7).split(':');springSelection[1]=Number(springSelection[1]);updateUI();}else select(id);if(view==='orbit'){toast('配置は正面・側面に切り替えるか、右の数値で調整できます。');return;}
 const origin=currentPosition();const normal=new THREE.Vector3();camera.getWorldDirection(normal);drag={id,origin:[...origin],plane:new THREE.Plane().setFromNormalAndCoplanarPoint(normal,b2t(origin)),startX:e.clientX,startY:e.clientY,pushed:false};
 controls.enabled=false;e.currentTarget.setPointerCapture(e.pointerId);
}
window.addEventListener('pointermove',e=>{if(!drag)return;const rect=viewport.getBoundingClientRect();raycaster.setFromCamera(new THREE.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hit=new THREE.Vector3();if(!raycaster.ray.intersectPlane(drag.plane,hit))return;
 if(!drag.pushed&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<2)return;
 if(!drag.pushed){push();drag.pushed=true;}setPosition(editInView(drag.origin,t2b(hit),view));changed();});
const endDrag=()=>{drag=null;controls.enabled=true;};window.addEventListener('pointerup',endDrag);window.addEventListener('pointercancel',endDrag);
['X','Y','Z'].forEach((axis,i)=>$('#coord'+axis).addEventListener('change',e=>{const v=Number(e.target.value)/1000;if(!Number.isFinite(v)||Math.abs(v)>10||e.target.value===''){toast('位置は-10000〜10000mmの数値で入力してください。');e.target.value=(currentPosition()[i]*1000).toFixed(1);return;}push();const p=[...currentPosition()];p[i]=v;setPosition(p);changed();}));
$('#mirror').onchange=()=>updateUI();
$('#prev').onclick=()=>{const list=visibleMarkerIds();select(list[Math.max(0,list.indexOf(selected)-1)]);};$('#next').onclick=()=>{const list=visibleMarkerIds();select(list[Math.min(list.length-1,list.indexOf(selected)+1)]);};
$('#resetPoint').onclick=()=>{push();moveMarker(project.markers,selected,(fingerIds.includes(selected)?makeFingerMarkers(project.markers)[selected].position:definitions.find(d=>d.id===selected).position),$('#mirror').checked);changed();};
$('#undo').onclick=()=>{if(['rig','expressions','review'].includes(stage)||!history.length)return;future.push(clone(project));project=history.pop();refreshPanels();changed(true);};
$('#redo').onclick=()=>{if(['rig','expressions','review'].includes(stage)||!future.length)return;history.push(clone(project));project=future.pop();refreshPanels();changed(true);};
window.addEventListener('keydown',e=>{if(busy||agentLock||threeViewUI?.isOpen())return;if(/INPUT|TEXTAREA/.test(document.activeElement.tagName))return;if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'#redo':'#undo').click();}if((e.metaKey||e.ctrlKey)&&e.key==='s'){e.preventDefault();$('#save').click();}});
function visibility(){threeViewUI?.refresh();if(!model)return;reviewMaterials.setModel(model);reviewMaterials.setEnabled(mtoonReady(project,previewingCandidate));materialPreview(model,$('#sourceReflection').checked);
 for(const g of model.children){const role=g.userData.charakitRole;if(role==='hair')g.visible=$('#showHair').checked;else if(role?.startsWith('head_'))g.visible=$('#showHead').checked&&role==='head_'+$('#expression').value;else g.visible=true;}
 model.traverse(o=>{if(o.userData.charakitRole==='hair')o.visible=$('#showHair').checked;if(project.mode==='assembled'){if(/Hair_Fitted/.test(o.name))o.visible=$('#showHair').checked;if(/Head_Expressions|Iris_Common/.test(o.name))o.visible=$('#showHead').checked;}
 if(o.isMesh){if(o.userData.componentId)o.visible=!isolatedComponent||o.userData.componentId===isolatedComponent;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m.userData.previewBase)m.userData.previewBase={opacity:m.opacity,transparent:m.transparent,depthWrite:m.depthWrite};const b=m.userData.previewBase;m.opacity=$('#ghost').checked?.24:b.opacity;m.transparent=$('#ghost').checked||b.transparent;m.depthWrite=$('#ghost').checked?false:b.depthWrite;m.needsUpdate=true;}}});lines.visible=stage==='markers'&&$('#showLines').checked;springLines.visible=stage==='springs'&&$('#showLines').checked;}
for(const id of ['showHair','showHead','ghost','showLines','sourceReflection'])$('#'+id).onchange=visibility;
function applyTransforms(){if(!model)return;for(const g of model.children){const role=g.userData.charakitRole;applyPlacement(g,project.placements[role.startsWith('head_')?'head':role]);}measure();refreshTransformFields();visibility();}
function measure(){const dimensions=measureModel(model);heightRuler.update(dimensions);if(!dimensions){box.set(new THREE.Vector3(-.8,0,-.2),new THREE.Vector3(.8,1.8,.2));$('#heightInfo').textContent='素材を読み込むと全高を表示します。';return;}box.copy(dimensions.bounds);const {height,bodyHeight}=dimensions;$('#heightInfo').textContent=`全高 ${height.toFixed(3)} m（髪・飾り込み）`+(bodyHeight===null?'':` / 頭頂までの目安 ${bodyHeight.toFixed(3)} m`);}
async function replaceModel(p,f,{requireRig=false,preserveCamera=false}={}){isolatedComponent='';previewingCandidate=false;const next=await buildModel(p,f);if(requireRig){let skinned=false;next.children.find(o=>o.userData.charakitRole==='assembled')?.traverse(o=>{if(o.isSkinnedMesh&&o.skeleton?.bones.length)skinned=true;});if(!skinned){disposeModel(next);throw Error('リグが見つかりません。骨とウェイトを含むFBXを書き出してください。');}}mvp?.unload();threeViewUI?.clear();if(fingerMode)setFingerMode(false);imageUI.clear();if(model){reviewMaterials.setModel(null);scene.remove(model);disposeModel(model);}if(!preserveCamera||p.id!==project.id)candidatePreviewContext=null;project=p;files=f;model=next;scene.add(model);history=[];future=[];springSelection=null;measure();refreshPanels();updateUI();visibility();if(!preserveCamera)fit();}
function setBusy(b){busy=b;productionUI?.render(false);threeViewUI?.refresh();for(const el of document.querySelectorAll('.page-topbar,#previewSettingsDialog,#samplesDialog,#newProjectDialog'))el.inert=b;$('#imageWorkspace').inert=b;if($('#imageDialog'))$('#imageDialog').inert=b;document.querySelector('main').inert=b;document.querySelector('header').inert=b;$('#stages').inert=b;$('#save').disabled=b;$('#handoffWorkspace').inert=b;$('#handoffDialog').inert=b;$('#download').disabled=b;$('#modelFile').disabled=b;}
async function task(label,fn,{readOnly=false}={}){if(busy||(agentLock&&!readOnly))return;setBusy(true);$('#saveStatus').textContent=label;try{await fn();return true;}catch(e){console.error(e);toast(e.message);return false;}finally{setBusy(false);$('#saveStatus').textContent=dirty?t('未保存の変更'):exported?t('保存済み'):t('未保存');}}
const filename=()=>((project.name||'project').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100)||'project')+'.charakit';
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
let requestPurpose='images';
async function save(name=project.name){
 if(sessionUI?.available)return sessionUI.save(name);
 const next=clone(project);next.name=name;const result=await packProject(next,files,{includeHistory:$('#includeImageHistory').checked,language:language()});project.name=name;$('#nameInput').value=name;$('#projectName').textContent=name;downloadBlob(result.blob,filename());project.revision=result.project.revision;project.savedAt=result.project.savedAt;if($('#handoffDialog').open)$('#prompt').value=handoff(project,filename(),language(),requestPurpose);refreshHandoff();dirty=false;exported=true;toast('.charakit を書き出しました。ダウンロード先に保管してください。');
}
$('#save').onclick=()=>{if(busy)return;$('#exportName').value=project.name||'';$('#exportName').setCustomValidity('');$('#exportNameDialog').showModal();$('#exportName').focus();$('#exportName').select();};
$('#cancelExport').onclick=()=>$('#exportNameDialog').close();
$('#exportName').oninput=()=>$('#exportName').setCustomValidity('');
$('#exportNameForm').onsubmit=e=>{e.preventDefault();const input=$('#exportName'),name=input.value.trim().replace(/\.charakit$/i,'');if(!name||/[\\/:*?"<>|\x00-\x1f]/.test(name)){input.setCustomValidity(t('ファイル名に使える名前を入力してください。'));input.reportValidity();return;}$('#exportNameDialog').close();task('モデルをまとめています…',()=>save(name));};
$('#download').onclick=$('#save').onclick;$('#dialogDownload').onclick=$('#save').onclick;
const requestImages=(purpose='images')=>{if(sessionUI?.available&&purpose?.kind==='image-edit')return sessionUI.request('image-edit',purpose);const kind={'images':'images','tripo-generate':'candidates','tripo-classify':'materials','tripo-texture':'materials','tripo-rig':'rig','exclusions':'rig'}[typeof purpose==='string'?purpose:'images'];if(sessionUI?.available&&(!purpose?.kind)&&kind)return sessionUI.request(kind);requestPurpose=typeof purpose==='string'||purpose?.kind?purpose:'images';$('#handoffDialog h2').textContent=t(String(requestPurpose).startsWith('tripo-')?'Tripoの作業をエージェントに依頼':requestPurpose==='exclusions'?'揺れ物の推定をAstraに依頼':requestPurpose?.kind==='image-edit'?'画像の修正をAstraに依頼':'画像制作をAstraに依頼');$('#handoffDialog>p').textContent=t('書き出した.charakitと以下の依頼文をAstraへ渡してください。');$('#prompt').value=handoff(project,filename(),language(),requestPurpose);$('#handoffDialog').showModal();};
$('#closeDialog').onclick=()=>$('#handoffDialog').close();$('#copyPrompt').onclick=async()=>{try{await navigator.clipboard.writeText($('#prompt').value);toast('依頼文をコピーしました。');}catch{$('#prompt').select();toast('⌘C / Ctrl+Cでコピーできます。');}};
function refreshHandoff(){const hasModels=project.assets.some(isModelAsset);$('#setupPrompt').value=handoff(project,filename(),language(),mvp?.task()||'weights');$('#setupCopy').disabled=!hasModels;$('#handoffStatus').textContent=t(hasModels?'準備したモデルをセットアップ用に渡します。':'3Dモデルを読み込むと依頼文をコピーできます。');}
$('#setupDownload').onclick=()=>$('#save').click();$('#setupCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('#setupPrompt').value);toast('依頼文をコピーしました。');}catch{$('#setupPrompt').select();toast('⌘C / Ctrl+Cでコピーできます。');}};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
function setStage(value){if(value==='preview'||value==='handoff')value='review';if(value==='assets')value='placement';if(previewingCandidate&&value!=='assets'){task('採用モデルを表示しています…',async()=>{await showProductionProject(project);previewingCandidate=false;setStage(value);},{readOnly:true});return;}document.body.dataset.stage=value;if(value!=='markers'&&fingerMode)setFingerMode(false);stage=value;document.querySelector('main').classList.toggle('mini-inspector',['rig','expressions','review'].includes(value));$('.right').hidden=['rig','expressions','review'].includes(value);$('#imageWorkspace').hidden=value!=='images';document.querySelector('main').hidden=['images','handoff'].includes(value);if(value==='handoff')refreshHandoff();springSelection=null;document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==value);document.querySelectorAll('button[data-stage]').forEach(p=>p.classList.toggle('active',p.dataset.stage===value));mvp?.onStage(value);window.dispatchEvent(new CustomEvent('preview-stage',{detail:value}));$('.right').classList.toggle('inactive',value==='assets'||value==='placement');$('#mirror').closest('label').hidden=value!=='markers';$('#prev').hidden=$('#next').hidden=$('#resetPoint').hidden=value==='springs';refreshPanels();updateUI();visibility();if(value==='expressions'){lines.visible=false;springLines.visible=false;}}
$('#stages').onclick=e=>{const b=e.target.closest('[data-stage]');if(b)setStage(b.dataset.stage);};
function el(tag,text,parent){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;parent?.append(e);return e;}
for(const role of ACTIVE_ROLES){const card=el('div',undefined,$('#assetSlots'));card.className='asset-slot';card.dataset.role=role;el('strong',ROLE_LABELS[role],card);el('small','未読み込み',card);const label=el('label','FBX / ZIP を選択',card);label.className='file-button';const input=el('input',undefined,label);input.type='file';input.accept='.fbx,.zip';input.hidden=true;input.id='asset-'+role;input.onchange=()=>{const file=input.files[0];input.value='';if(file)task('素材を読み込んでいます…',()=>importPart(file,role));};}
for(const name of STATES){const o=el('option',ROLE_LABELS['head_'+name],$('#expression'));o.value=name;}
$('#expression').onchange=()=>{if(project.mode==='assembled')toast('調整済みFBXの表情は保持します。表情切り替えの確認はBlenderで行ってください。');visibility();};
async function chooseFBX(file){
 if(file.size>256*1024**2)throw Error('1ファイル256MB以内にしてください。');
 const data=new Uint8Array(await file.arrayBuffer());
 if(/\.fbx$/i.test(file.name)){checkFBX(data);return {name:file.name,data,resources:[]};}
 if(!/\.zip$/i.test(file.name))throw Error('FBXまたはZIPを選んでください。');
 const entries=await unzip(data,{maxBytes:512*1024**2}),names=Object.keys(entries).filter(n=>/\.fbx$/i.test(n)&&!n.startsWith('__MACOSX/'));
 if(!names.length)throw Error('ZIP内にFBXがありません。');
 let selected=names[0];
 if(names.length>1){$('#zipChoice').replaceChildren();for(const n of names){const o=el('option',n,$('#zipChoice'));o.value=n;}selected=await new Promise(resolve=>{const dialog=$('#zipDialog');dialog.oncancel=e=>{e.preventDefault();dialog.close();resolve(null);};$('#zipCancel').onclick=()=>{dialog.close();resolve(null);};$('#zipAccept').onclick=()=>{dialog.close();resolve($('#zipChoice').value);};dialog.showModal();});if(!selected)throw Error('取り込みをキャンセルしました。');}
 checkFBX(entries[selected]);return {name:selected,data:entries[selected],resources:Object.entries(entries).filter(([n])=>/\.(png|jpe?g|webp)$/i.test(n)&&!n.startsWith('__MACOSX/')).map(([name,data])=>({name,data}))};
}
async function prepareAsset(file,role){
 const input=await chooseFBX(file),prefix='assets/'+crypto.randomUUID()+'/',path=prefix+input.name,resources=[],added=new Map([[path,input.data]]);
 for(const r of input.resources){const resource={path:prefix+r.name,sha256:await sha256(r.data)};resources.push(resource);added.set(resource.path,r.data);}
 return {asset:{path,role,filename:file.name,sha256:await sha256(input.data),resources},added};
}
async function importPart(file,role){
 if(project.mode==='assembled'&&!confirm(t('配置済みモデルの表示から、個別パーツの配置へ切り替えます。更新モデルの原本は残ります。続けますか？')))return;
 const {asset,added}=await prepareAsset(file,role),root=await parseModel(added.get(asset.path),{...asset,files:added});
 try{asset.normalization=normalizeAsset(root,role);}finally{disposeModel(root);}
 const p=clone(project),f=new Map(files),old=p.assets.find(a=>a.role===role);
 if(old){p.assets=p.assets.filter(a=>a!==old);for(const a of [old,...old.resources||[]])f.delete(a.path);if(p.imageLibrary)delete p.imageLibrary.modelSources[old.path];}
 p.assets.push(asset);for(const [path,bytes] of added)f.set(path,bytes);p.mode='parts';p.updatedModel=null;workflow(p).phase='parts';workflow(p).attachHair=false;
 const key=role.startsWith('head_')?'head':role;if(!p.placements[key]){p.placements[key]=identity();p.placements[key].position[2]=role==='body'?.725:role==='hair'?1.195:1.52;}
 await replaceModel(p,f);changed();toast(ROLE_LABELS[role]+'を取り込みました。配置を確認してください。');
}
async function importAssembled(file,phase='rigged',containsHair=true,requireRig=false){
 if(requireRig&&phase==='rigged'&&!containsHair){
  const input=await chooseFBX(file),p=clone(project);await importTripoBones(p,files,input.data);
  await replaceModel(p,files);changed();setStage('rig');toast('骨配置だけを読み込みました。元のモデルに合わせて確認してください。');return;
 }
 const {asset,added}=await prepareAsset(file,'assembled'),p=clone(project),f=new Map(files);
 p.assets.push(asset);for(const [path,bytes] of added)f.set(path,bytes);p.mode='assembled';p.updatedModel={path:asset.path,at:new Date().toISOString(),previous:p.updatedModel?.path||null};p.placements.assembled=identity();const w=workflow(p);w.phase=phase;w.attachHair=!containsHair;w.boneMap={};delete w.returnAlignment;
 await replaceModel(p,f,{requireRig});changed();setStage('review');toast('リグ付きFBXを読み込みました。動作と髪の位置を確認してください。');
}
for(const id of ['modelFile','assembledFile'])$('#'+id).onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)task('配置済みモデルを読み込んでいます…',()=>importAssembled(file));};
async function openKitFile(file,targetStage){
 if(!file)return;if(dirty&&!confirm(t('未書き出しの変更があります。別のプロジェクトを開きますか？')))return;
 return task('プロジェクトを検査しています…',async()=>{
  if(sessionUI?.available){await sessionUI.importFile(file);if(targetStage)setStage(targetStage);return;}
  if(file.size>1024**3)throw Error('1GB以内のファイルを選んでください。');
  const {project:p,files:f}=await unpackProject(await file.arrayBuffer());await replaceModel(p,f);
  setStage(targetStage||(p.expressionEditor||p.expressionAuthoring?'expressions':p.mode==='assembled'||p.workflow?.phase==='bones'?'review':p.production?(p.production.phase==='assembled'?'placement':'assets'):p.sourceImage||p.imageLibrary?.versions.length?'images':'assets'));
  dirty=false;exported=true;toast('プロジェクトを復元しました。');
 });
}
$('#openKit').onchange=e=>{const file=e.target.files[0];e.target.value='';openKitFile(file);};
$('#newProject').onclick=()=>{if(dirty&&!confirm(t('未書き出しの変更があります。新規プロジェクトに切り替えますか？')))return;task('新規プロジェクト…',async()=>{await replaceModel(freshProject(),new Map());dirty=false;exported=false;setStage('images');});};
$('#nameInput').onchange=e=>{push();project.name=e.target.value.trim()||t('新しいキャラクター');refreshPanels();changed();};
$('#references').onchange=e=>{const chosen=[...e.target.files];e.target.value='';task('参考画像を保存しています…',async()=>{const p=clone(project),f=new Map(files);for(const file of chosen){if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024**2)throw Error('参考画像は20MB以内のPNG/JPEG/WebPにしてください。');const bytes=new Uint8Array(await file.arrayBuffer());const bitmap=await createImageBitmap(new Blob([bytes],{type:file.type}));bitmap.close();const ext=file.type==='image/png'?'png':file.type==='image/jpeg'?'jpg':'webp',path='assets/'+crypto.randomUUID()+'.'+ext;p.assets.push({path,role:'reference',filename:file.name,mime:file.type,sha256:await sha256(bytes)});f.set(path,bytes);}project=p;files=f;history=[];future=[];refreshPanels();changed();});};
function refreshPanels(){window.dispatchEvent(new Event('preview-project'));imageUI.render();mvp?.refresh();
 $('#nameInput').value=project.name;$('#projectName').textContent=project.name;
 for(const card of document.querySelectorAll('.asset-slot')){const a=project.assets.find(a=>a.role===card.dataset.role);card.querySelector('small').setAttribute('translate',a?'no':'yes');card.querySelector('small').textContent=a?.filename||'未読み込み';}
 for(const url of referenceURLs)URL.revokeObjectURL(url);referenceURLs=[];$('#referenceList').replaceChildren();
 for(const a of project.assets.filter(a=>a.role==='reference')){const fig=el('figure',undefined,$('#referenceList')),img=el('img',undefined,fig);img.alt=a.filename;const url=URL.createObjectURL(new Blob([files.get(a.path)],{type:a.mime}));referenceURLs.push(url);img.src=url;el('figcaption',a.filename,fig);const del=el('button','削除',fig);del.onclick=()=>{if(guidePaths(project).has(a.path)){toast(t('三面図で使用中です。三面図のモーダルで画像を外してください。'));return;}if(a.path===project.sourceImage){toast('制作の元絵です。画像素材で差し替えてください。');return;}if(project.imageLibrary?.versions.some(v=>v.references.includes(a.path))){toast('生成画像から参照されているため、この原本は保持します。');return;}project.assets=project.assets.filter(x=>x!==a);files.delete(a.path);history=[];future=[];refreshPanels();changed();};}
 $('#partSelect').value=project.mode==='assembled'?'assembled':$('#partSelect').value==='assembled'?'head':$('#partSelect').value;
 for(const option of $('#partSelect').options)option.disabled=project.mode==='assembled'?option.value!=='assembled'&&!(project.workflow?.attachHair&&option.value==='hair'):option.value==='assembled';
 $('#expression').disabled=project.mode==='assembled';$('#linkHair').disabled=project.mode==='assembled';
 refreshTransformFields();refreshSprings();
}
const transformDefs=[['scale',0,'大きさ',.1,3,.01],...['左右 X','前後 Y','高さ Z'].map((n,i)=>['position',i,n,-2,2,.001]),...['回転 X','回転 Y','回転 Z'].map((n,i)=>['rotation',i,n,-180,180,1])];
for(const [key,i,label,min,max,step] of transformDefs){const row=el('div',undefined,$('#transformFields'));row.className='transform-row';const l=el('label',label+(key==='position'?'（m）':key==='rotation'?'（°）':''),row),number=el('input',undefined,l),range=el('input',undefined,row);number.type='number';range.type='range';for(const input of [number,range]){input.min=min;input.max=max;input.step=step;input.dataset.transform=key;input.dataset.index=i;}const commit=(input,record=true)=>{const n=Number(input.value);if(input.value===''||!Number.isFinite(n)||n<min||n>max){toast('入力範囲を確認してください。');refreshTransformFields();return;}if(record)push();const part=$('#partSelect').value,t=project.placements[part],before=clone(t);if(!t)return;if(key==='scale')t.scale=n;else t[key][i]=n;
 if(part==='head'&&$('#linkHair').checked&&project.placements.hair){const hair=project.placements.hair;if(key==='position')hair.position[i]+=n-before.position[i];else if(key==='scale'){const factor=n/before.scale;hair.scale*=factor;hair.position=hair.position.map((v,j)=>t.position[j]+(v-before.position[j])*factor);}else { // Apply the head's rotation delta around its pivot to hair.
 const a=new THREE.Group(),b=new THREE.Group(),h=new THREE.Group();applyPlacement(a,before);applyPlacement(b,t);applyPlacement(h,hair);h.updateMatrix();a.updateMatrix();b.updateMatrix();h.matrix.premultiply(a.matrix.clone().invert()).premultiply(b.matrix);const q=new THREE.Quaternion(),pos=new THREE.Vector3(),sc=new THREE.Vector3();h.matrix.decompose(pos,q,sc);hair.position=t2b(pos);const axis=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);const e=new THREE.Euler().setFromQuaternion(axis.clone().invert().multiply(q).multiply(axis),'XYZ');hair.rotation=[e.x,e.y,e.z].map(v=>v*180/Math.PI);hair.scale=sc.x;
 }}changed(true);};number.onchange=()=>commit(number);range.setAttribute('aria-label',label);number.step=range.step=key==='position'?'0.0001':key==='scale'?'0.001':'0.1';let sliding=false;range.oninput=()=>{const record=!sliding;sliding=true;range.dataset.sliding='true';number.value=range.value;commit(range,record);};range.onchange=()=>{sliding=false;range.dataset.sliding='false';const r=fineRange(key,Number(number.value));range.min=r.min;range.max=r.max;range.value=number.value;};}
function refreshTransformFields(){const t=project.placements[$('#partSelect').value];$('#applyHeight').disabled=!!project.production&&project.production.phase!=='assembled';for(const input of document.querySelectorAll('[data-transform]')){input.disabled=!t||!!project.production&&project.production.phase!=='assembled';if(t){const key=input.dataset.transform,value=key==='scale'?t.scale:t[key][Number(input.dataset.index)];if(input.type==='range'){if(input.dataset.sliding!=='true'){const r=fineRange(key,value);input.min=r.min;input.max=r.max;input.step=r.step;input.value=value;}}else if(document.activeElement!==input)input.value=Number(value.toFixed(4));}}}
$('#partSelect').onchange=refreshTransformFields;
$('#applyHeight').onclick=()=>{if(!model?.children.length)return toast('モデルを先に読み込んでください。');const target=Number($('#targetHeight').value),height=box.max.y-box.min.y;if(!Number.isFinite(target)||target<.1||target>10||height<=0)return toast('全高は0.1〜10mで入力してください。');push();scaleProject(project,target/height);changed(true);fit();};
const springLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0x9772ae,depthTest:false,transparent:true,opacity:.85}));springLines.renderOrder=91;scene.add(springLines);
function currentSpring(){return project.springs.find(s=>s.id===springSelection?.[0]);}
function currentPosition(){return stage==='springs'&&currentSpring()?currentSpring().points[springSelection[1]]:project.markers[selected].position;}
function setPosition(p){if(stage==='springs'&&currentSpring())currentSpring().points[springSelection[1]]=[...p];else moveMarker(project.markers,selected,p,$('#mirror').checked);}
function refreshSprings(){
 if(springSelection&&!currentSpring())springSelection=project.springs.length?[project.springs[0].id,0]:null;
 $('#springList').replaceChildren();for(const s of project.springs){const b=el('button',s.name,$('#springList'));b.classList.toggle('active',s.id===springSelection?.[0]);b.onclick=()=>{springSelection=[s.id,0];refreshSprings();updateUI();};}
 const s=currentSpring();$('#springEditor').hidden=!s;$('#springPoints').replaceChildren();if(s){$('#springName').value=s.name;for(let i=0;i<s.points.length;i++){const b=el('button',`${i+1} · ${i===0?'根元':i===s.points.length-1?'先端':'中間'}`,$('#springPoints'));b.classList.toggle('active',i===springSelection[1]);b.onclick=()=>{springSelection[1]=i;refreshSprings();updateUI();};}$('#deletePoint').disabled=s.points.length<=2;$('#addPoint').disabled=s.points.length>=32;}
 labels.querySelectorAll('[data-spring]').forEach(e=>e.remove());for(const s of project.springs)for(let i=0;i<s.points.length;i++){const b=el('button',undefined,labels);b.className='marker-label spring-label';b.setAttribute('translate','no');b.dataset.spring=s.id+':'+i;b.dataset.label=s.name+' '+(i+1);b.setAttribute('aria-label',b.dataset.label);b.onpointerdown=e=>startDrag(e,'spring:'+s.id+':'+i);}
}
function updateSpringUI(){const s=currentSpring();if(!s)return;$('#selectedTitle').setAttribute('translate','no');$('#selectedTitle').textContent=s.name;$('#selectedHint').textContent='根元から先端に向けた経路の目安です。側面・上面でも奥行きを調整してください。';$('#markerNumber').textContent=String(springSelection[1]+1);$('#coordX').disabled=$('#coordY').disabled=$('#coordZ').disabled=false;$('#coordX').title='';['X','Y','Z'].forEach((axis,i)=>{const input=$('#coord'+axis);if(document.activeElement!==input)input.value=(currentPosition()[i]*1000).toFixed(1);});$('#mirrorHelp').textContent='経路の点は単独で動きます。「左右反転して複製」で反対側を作れます。';$('#undo').disabled=!history.length;$('#redo').disabled=!future.length;}
function syncSpringLabels(){const rect=viewport.getBoundingClientRect();for(const e of labels.querySelectorAll('[data-spring]')){const [id,index]=e.dataset.spring.split(':'),s=project.springs.find(s=>s.id===id);if(!s)continue;const p=b2t(s.points[Number(index)]).project(camera);e.style.left=(p.x+1)*rect.width/2+'px';e.style.top=(1-p.y)*rect.height/2+'px';e.style.display=stage!=='springs'||Math.abs(p.x)>1||Math.abs(p.y)>1||Math.abs(p.z)>1?'none':'';e.classList.toggle('active',id===springSelection?.[0]&&Number(index)===springSelection?.[1]);}}
function updateSpringLines(){const points=[];for(const s of project.springs)for(let i=1;i<s.points.length;i++)points.push(b2t(s.points[i-1]),b2t(s.points[i]));springLines.geometry.dispose();springLines.geometry=new THREE.BufferGeometry().setFromPoints(points);}
$('#addSpring').onclick=()=>{if(project.springs.length>=64)return toast('経路は64個までです。');push();const kind=$('#springKind').value,origin=[...project.markers[kind==='hair'?'head':'hips'].position];origin[0]=.15;const s={id:crypto.randomUUID(),name:$('#springKind').selectedOptions[0].text+' '+(project.springs.length+1),kind,points:[origin,[origin[0],origin[1],origin[2]-.25]]};project.springs.push(s);springSelection=[s.id,0];refreshSprings();changed();};
$('#springName').onchange=e=>{const s=currentSpring();if(s){push();s.name=e.target.value.trim()||'揺れもの';refreshSprings();changed();}};
$('#addPoint').onclick=()=>{const s=currentSpring();if(!s||s.points.length>=32)return;push();const i=springSelection[1],a=s.points[i],b=s.points[i+1],p=b?a.map((v,j)=>(v+b[j])/2):[a[0],a[1],a[2]-.1];s.points.splice(i+1,0,p);springSelection[1]++;refreshSprings();changed();};
$('#deletePoint').onclick=()=>{const s=currentSpring();if(!s||s.points.length<=2)return;push();s.points.splice(springSelection[1],1);springSelection[1]=Math.min(springSelection[1],s.points.length-1);refreshSprings();changed();};
$('#deleteSpring').onclick=()=>{const s=currentSpring();if(!s)return;push();project.springs=project.springs.filter(x=>x!==s);springSelection=null;refreshSprings();changed();};
$('#mirrorSpring').onclick=()=>{const s=currentSpring();if(!s||project.springs.length>=64)return;push();const copy={...clone(s),id:crypto.randomUUID(),name:s.name+'（反対側）',points:s.points.map(([x,y,z])=>[-x,y,z])};project.springs.push(copy);springSelection=[copy.id,0];refreshSprings();changed();};
// Legacy import is explicit, localhost-only, and never writes to the old project.

const imageUI=initImageUI({requestImages,get:()=>({project,files}),commit:(p,f)=>{project=p;files=f;history=[];future=[];markDirty();},dirty:markDirty,task,download:downloadBlob,toast});
threeViewUI=initThreeViewUI({scene,get:()=>({project,files,model,stage,view,busy,agentLock}),toast,setView,
 initialize:(p,f)=>{project=p;files=f;refreshPanels();changed();},
 commit:(p,f)=>{push();project=p;files=f;refreshPanels();changed();}
});
mvp=initMVPUI({get:()=>({project,files,model,stage}),dirty:markDirty,task,download:downloadBlob,toast,setStage,importResult:(...args)=>importAssembled(...args,true),renderer,scene,setView,fit,getCamera:()=>camera,refreshHandoff,
 realign:()=>task('元のサイズに合わせています…',async()=>{const p=clone(project);await alignTripoReturn(p,files);await replaceModel(p,files);changed();setStage('review');toast('頭・体を元のサイズと位置に合わせました。');}),
 restoreParts:()=>task('元のパーツを表示しています…',async()=>{const p=clone(project);p.mode='parts';workflow(p).phase='parts';workflow(p).attachHair=false;await replaceModel(p,files);changed();setStage('placement');}),
 cameraState:()=>({view,position:camera.position.clone(),target:controls.target.clone(),up:camera.up.clone(),zoom:camera.zoom}),
 restoreCamera:s=>{controls.target.copy(s.target);setView(s.view);camera.position.copy(s.position);camera.up.copy(s.up);camera.zoom=s.zoom;camera.updateProjectionMatrix();controls.update();}
});
motionReview=initMotionReview({get:()=>({project,files,model,stage,busy}),scene,renderer,getCamera:()=>camera,getControls:()=>controls,toast,session:()=>sessionUI,
 fitModel:object=>{box.setFromObject(object);fit();},resetBounds:measure,
 prepareReview:async()=>{let failure;const ok=await task(t('完成VRMを準備しています…'),async()=>{try{await sessionUI.prepareReview();}catch(e){failure=e;throw e;}});if(!ok)throw failure||Error(t('準備を完了できませんでした。'));},
});
expressionEditor=initExpressionEditor({get:()=>({project,files,model,stage,busy,agentLock}),scene,viewport,session:()=>sessionUI,task,dirty:markDirty,toast,
 fitModel:object=>{box.setFromObject(object);fit();},fitBounds:bounds=>{box.copy(bounds);fit();},
 openKit:file=>openKitFile(file,'expressions'),commit:(p,f)=>{project=p;files=f;markDirty();refreshPanels();}
});
const expressionStyle=document.createElement('link');expressionStyle.rel='stylesheet';expressionStyle.href='./expression-editor.css';document.head.append(expressionStyle);
function frame(){requestAnimationFrame(frame);const delta=reviewClock.getDelta();motionReview?.tick(delta);expressionEditor?.tick(delta);if(model&&stage==='review')model.visible=false;reviewMaterials.tick(delta);controls.update();updateCameraClipping(camera,controls.target);heightRuler.render(camera,stage==='placement',view);threeViewUI?.render();renderer.render(scene,camera);syncLabels();}frame();
$('#loading').remove();setBusy(false);refreshPanels();setStage('images');document.body.dataset.ready='true';

function refreshTheme(){const dark=document.documentElement.dataset.theme!=='light',css=getComputedStyle(document.documentElement);scene.background.set(css.getPropertyValue('--viewport').trim());grid.material.vertexColors=false;grid.material.needsUpdate=true;grid.material.color.set(css.getPropertyValue('--grid').trim());lineMaterial.color.set(dark?'#47cad4':'#008c9b');const button=$('#themeToggle');button.title=t(dark?'ライトモードに切り替え':'ダークモードに切り替え');button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',String(!dark));button.firstElementChild.textContent=dark?'☀':'☾';}
$('#themeToggle').onclick=()=>{const value=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=value;try{localStorage.setItem('avatar-ui-preview.theme',value);}catch{}refreshTheme();};
window.addEventListener('languagechange',()=>{imageUI.render();refreshTheme();if($('#handoffDialog').open)$('#prompt').value=handoff(project,filename(),language(),requestPurpose);refreshHandoff();});
initLocalization();refreshTheme();

await initPreview({
 get:()=>({project,files,model,stage,dirty,busy}),setStage,setView,fit,task,toast,save,refreshPanels,requestImages,
 transferWeights:()=>task(t('ウェイトを転送しています…'),async()=>{const next=await requestWeightTransfer(project,files);await replaceModel(next.project,next.files,{requireRig:true});changed();setStage('review');}),
 createNew:async()=>{await replaceModel(freshProject(),new Map());dirty=false;exported=false;setStage('images');},
 load:async(url)=>{return task('サンプルを読み込み中…',async()=>{const response=await fetch(url);if(!response.ok)throw Error('サンプルを読み込めませんでした。');const next=await unpackProject(await response.arrayBuffer());await replaceModel(next.project,next.files);dirty=false;exported=false;});},
 capture:()=>{updateCameraClipping(camera,controls.target);renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');}
});
async function showProductionProject(p,{fitView=true,preserveDirection=false,candidate=false}={}){const next=await buildModel(p,files);isolatedComponent='';if(model){reviewMaterials.setModel(null);scene.remove(model);disposeModel(model);}model=next;previewingCandidate=candidate;scene.add(model);measure();visibility();if(fitView)fit({preserveDirection});}
productionUI=initProductionUI({get:()=>({project,files,busy,agentLock}),session:()=>sessionUI,task,toast,download:downloadBlob,chooseFBX,request:requestImages,setStage,setView,
 wireframe:value=>setCandidateWireframe(model,value),
 commit:async(p,f)=>{const preserveCamera=previewingCandidate&&stage==='assets'&&p.id===project.id;isolatedComponent='';await replaceModel(p,f,{preserveCamera});changed();},
 preview:async(source,id)=>{const p=clone(project);p.production.selected={[source]:id};delete p.production.inventory;delete p.production.segmented;p.production.phase='candidates';p.mode='parts';const sameSource=candidatePreviewContext?.projectId===project.id&&candidatePreviewContext.source===source;await showProductionProject(p,{fitView:!sameSource,preserveDirection:true,candidate:true});candidatePreviewContext={projectId:project.id,source};},
 isolate:id=>task('部位を表示しています…',async()=>{if(previewingCandidate){await showProductionProject(project);previewingCandidate=false;}isolatedComponent=id;visibility();if(id){const mesh=model?.getObjectsByProperty('isMesh',true).find(o=>o.userData.componentId===id);if(mesh){box.setFromObject(mesh,true);fit();}}else{measure();fit();}})
});

const journeyStyle=document.createElement('link');journeyStyle.rel='stylesheet';journeyStyle.href='./journey.css';document.head.append(journeyStyle);
sessionUI=await initSessionUI({
 get:()=>({project,files,busy,dirty}),task,toast,setStage,
 export:blob=>downloadBlob(blob,filename()),
 replace:async(p,f)=>{await replaceModel(p,f);},
 update:(p,f)=>{project=p;files=f;refreshPanels();},
 saved:p=>{if(p){project.name=p.name;project.revision=p.revision;project.savedAt=p.savedAt;$('#nameInput').value=p.name;$('#projectName').textContent=p.name;}dirty=false;exported=true;$('#saveStatus').textContent=t('保存済み');},
 lock:value=>{agentLock=value;expressionEditor?.render();productionUI?.render(false);if(value)threeViewUI?.clear();threeViewUI?.refresh();$('#save').disabled=value||busy;$('#newProject').disabled=value;$('#openKit').disabled=value;$('#nameInput').disabled=value;},
});
initVRMExportUI({get:()=>({project,files,busy}),task,toast,download:downloadBlob,session:()=>sessionUI,commit:async(p,f)=>{project=p;files=f;markDirty();refreshPanels();motionReview.refresh();}});
motionReview.refresh();
document.body.dataset.journeyReady='true';
