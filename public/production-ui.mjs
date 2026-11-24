import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {buildModel,disposeModel} from './models.mjs';
import {frameCamera} from './cameras.mjs';
import {setCandidateWireframe} from './candidate-wireframe.mjs';
import {initProductionDetails} from './production-details.mjs';
import {selectCandidate,candidateNeedsBranch,forkCandidate,hasGeneratedTextures} from './production.mjs';
import {packProject} from './project.mjs';
import {say} from './i18n.mjs';

export function initProductionUI(hooks){
  const dialog=document.createElement('dialog');dialog.id='candidateDialog';dialog.setAttribute('aria-labelledby','candidateDialogTitle');
 dialog.innerHTML=`<div class="dialog-top"><h2 id="candidateDialogTitle"></h2><button id="closeCandidates" type="button" aria-label="閉じる">×</button></div>
 <section id="candidatePicker" class="candidate-picker"><div class="candidate-top"><div class="segmented" role="tablist" aria-label="比較する部位"><button role="tab" data-candidate-source="head">頭</button><button role="tab" data-candidate-source="body">体</button></div><label><input type="checkbox" id="candidateWire" checked> <span>ワイヤーフレーム</span></label></div>
 <div id="candidateViewport"></div><p id="candidateName" translate="no"></p><p id="candidateDragHint" class="small-note"></p>
 <div class="candidate-bottom"><div id="candidateNumbers" class="segmented" aria-label="候補番号"></div><button id="adoptCandidate" class="primary" type="button"></button></div><p id="candidateNotice" role="status"></p><p id="candidateBranchNotice" class="callout" hidden></p>
 <div id="candidateSelectionSummary" class="small-note"></div><div class="dialog-actions"><button id="cancelCandidates" type="button"></button><button id="candidateNext" class="primary" type="button"></button></div></section>`;
 document.body.append(dialog);
 const $=s=>dialog.querySelector(s),viewport=$('#candidateViewport');
 const reopen=document.createElement('button');reopen.id='openCandidates';reopen.type='button';document.querySelector('.model-bar').insertBefore(reopen,document.querySelector('#threeViewVisibility'));
 let source='head',viewed={},shownKey='',renderer=null,scene=null,camera=null,controls=null,model=null,rendering=false,generation=0,cameraSource='',selecting=false,projectId='',autoTimer=null;
 const seen=new Set();
 const selection=()=>{const p=hooks.get().project,w=p.production,list=w?.candidates[source]||[];return list.find(c=>c.id===viewed[source])||list.find(c=>c.id===w.selected[source])||list[0];};
 const fingerprint=p=>p.id+'|'+JSON.stringify(['head','body'].map(s=>p.production?.candidates[s].map(c=>[c.id,c.sha256])));
 function markSeen(){const key=fingerprint(hooks.get().project);seen.add(key);try{localStorage.setItem('charakit.candidate-dialog.'+hooks.get().project.id,key);}catch{}}
 function wasSeen(p){const key=fingerprint(p);try{return seen.has(key)||localStorage.getItem('charakit.candidate-dialog.'+p.id)===key;}catch{return seen.has(key);}}
 function size(){if(!renderer||!dialog.open)return;const r=viewport.getBoundingClientRect();if(!r.width||!r.height)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();}
 function clean(){generation++;shownKey='';cameraSource='';projectId='';rendering=false;controls?.dispose();controls=null;if(renderer){renderer.setAnimationLoop(null);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}renderer=null;if(model)disposeModel(model);model=null;scene=null;camera=null;}
 dialog.addEventListener('close',clean);
 dialog.addEventListener('cancel',e=>{if(selecting)e.preventDefault();});
 for(const id of ['closeCandidates','cancelCandidates'])$('#'+id).onclick=()=>{if(!selecting)dialog.close();};
 function open(selectedSource,selectedId){
  const {project:p,busy,agentLock}=hooks.get();if(busy||agentLock||selecting)return;
  if(!p.production||!['head','body'].some(s=>p.production.candidates[s].length))return;
  document.querySelector('#previewSettingsDialog')?.close();
  if(selectedSource)source=selectedSource;if(selectedId)viewed[source]=selectedId;
  if(!p.production.candidates[source].length)source=source==='head'?'body':'head';
  if(!dialog.open){
   projectId=p.id;dialog.showModal();
   try{
    renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
    scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0xa2a98c,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-2,3,4);scene.add(light);
    camera=new THREE.PerspectiveCamera(40,1,.0001,2000);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;viewport.append(renderer.domElement);size();
    renderer.setAnimationLoop(()=>{if(!renderer)return;controls.update();scene.background=new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--viewport').trim()||'#e9ece7');renderer.render(scene,camera);});
   }catch(e){dialog.close();hooks.toast(e.message);return;}
  }
  markSeen();render();
 }
 reopen.onclick=()=>open();
 async function show(){
  if(!dialog.open||!renderer)return;
  const {project:p,files}=hooks.get(),c=selection();if(!c)return;
  const key=p.id+'|'+source+'|'+c.id+'|'+c.sha256;if(key===shownKey)return;
  const token=++generation,selectedSource=source,nextProject=structuredClone(p);rendering=true;render(false);
  nextProject.production.selected={[source]:c.id};delete nextProject.production.inventory;delete nextProject.production.segmented;nextProject.production.phase='candidates';nextProject.mode='parts';nextProject.rigGuide=null;
  try{
   const next=await buildModel(nextProject,files);
   if(token!==generation||!dialog.open||!scene){disposeModel(next);return;}
   if(model){scene.remove(model);disposeModel(model);}model=next;scene.add(model);setCandidateWireframe(model,$('#candidateWire').checked);
   if(cameraSource!==selectedSource){const bounds=new THREE.Box3().setFromObject(model,true),center=bounds.getCenter(new THREE.Vector3()),extent=bounds.getSize(new THREE.Vector3());controls.target.copy(center);frameCamera(camera,center,new THREE.Vector3(0,0,1),Math.max(extent.y,extent.x/camera.aspect,extent.z,.05)*1.35);controls.update();cameraSource=selectedSource;}
   shownKey=key;
  }catch(e){if(token===generation){hooks.toast(e.message);$('#candidateNotice').textContent=e.message;}}
  finally{if(token===generation){rendering=false;render(false);}}
 }
 dialog.querySelectorAll('[data-candidate-source]').forEach(b=>b.onclick=()=>{source=b.dataset.candidateSource;render();});
 $('#candidateWire').onchange=()=>{if(model)setCandidateWireframe(model,$('#candidateWire').checked);};
 $('#adoptCandidate').onclick=async()=>{
  if(selecting||rendering)return;const {project:p,files,busy,agentLock}=hooks.get(),c=selection();if(!c||busy||agentLock||p.production.selected[source]===c.id)return;
  selecting=true;render(false);
  try{
   const ok=await hooks.task(say('候補を決定しています…','Selecting candidate…'),async()=>{
    if(hooks.session()?.available)await hooks.session().selectCandidate(source,c.id);
    else{
     const branched=candidateNeedsBranch(p,source,c.id),next=branched?forkCandidate(p,source,c.id):structuredClone(p);
     if(branched){const {blob}=await packProject(p,files);hooks.download(blob,(p.name||'original')+'.charakit');}else selectCandidate(next,source,c.id);
     await hooks.commit(next,new Map(files));
    }
   });
   if(ok){projectId=hooks.get().project.id;markSeen();shownKey='';hooks.toast(say('候補を決定しました。','Candidate selected.'));}
  }finally{selecting=false;render();}
 };
 $('#candidateNext').onclick=()=>{if(selecting||rendering)return;dialog.close();hooks.request('tripo-classify');};
 function render(load=true){
  const {project:p,busy,agentLock}=hooks.get(),w=p.production;
  reopen.textContent=say('モデル候補を選ぶ','Choose model candidates');reopen.hidden=!['assets','placement'].includes(document.body.dataset.stage);reopen.disabled=busy||agentLock||!w||!['head','body'].some(s=>w.candidates[s].length);
  if(dialog.open&&p.id!==projectId&&!selecting){dialog.close();return;}
  const list=w?.candidates[source]||[],c=selection();if(c)viewed[source]=c.id;
  const disabled=selecting||rendering||busy||agentLock;
  $('#candidateDialogTitle').textContent=say('モデル候補を選ぶ','Choose model candidates');$('#closeCandidates').setAttribute('aria-label',say('閉じる','Close'));
  for(const el of dialog.querySelectorAll('[data-candidate-source]')){const active=el.dataset.candidateSource===source;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));el.disabled=selecting;el.textContent=say(el.dataset.candidateSource==='head'?'頭':'体',el.dataset.candidateSource==='head'?'Head':'Body');}
  $('#candidateName').textContent=c?.name||say('候補の生成待ちです','Waiting for candidates');$('#candidateDragHint').textContent=say('ドラッグで回転・ホイールで拡大・右ドラッグで移動','Drag to rotate · Scroll to zoom · Right-drag to pan');
  $('#candidateNumbers').replaceChildren();for(let i=0;i<4;i++){const b=document.createElement('button');b.type='button';b.textContent=String(i+1);b.disabled=!list[i]||selecting;b.dataset.candidateIndex=String(i);b.setAttribute('aria-label',say('候補 '+(i+1),'Candidate '+(i+1)));b.classList.toggle('active',list[i]?.id===c?.id&&!!c);b.setAttribute('aria-pressed',String(list[i]?.id===c?.id&&!!c));b.onclick=()=>{viewed[source]=list[i].id;render();};$('#candidateNumbers').append(b);}
  const adopted=!!c&&w.selected[source]===c.id,branch=!!c&&!adopted&&candidateNeedsBranch(p,source,c.id);
  $('#adoptCandidate').disabled=!c||adopted||disabled||shownKey!==p.id+'|'+source+'|'+c.id+'|'+c.sha256;$('#adoptCandidate').textContent=say(adopted?'決定済み':branch?'コピーを作ってこの候補に決定':'この候補に決定',adopted?'Selected':branch?'Copy and select this candidate':'Select this candidate');
  $('#candidateNotice').textContent=rendering?say('候補を表示しています…','Loading candidate…'):adopted?say('✓ この候補を採用しています','✓ This candidate is selected'):say('表示中の候補は、決定するまで採用されません。','Previewing does not select a candidate.');
  $('#candidateBranchNotice').hidden=!branch;$('#candidateBranchNotice').textContent=say('別の候補を採用すると、現在の .charakit を残してコピーを作成します。コピー側では、部位・テクスチャ・骨・揺れものの設定をやり直します。','Selecting a different candidate creates a copy and preserves this project. Parts, textures, rig and springs must be prepared again in the copy.');
  $('#candidateSelectionSummary').textContent=['head','body'].map(s=>say(s==='head'?'頭':'体',s==='head'?'Head':'Body')+'：'+say(w?.selected[s]?'決定済み':'未決定',w?.selected[s]?'Selected':'Not selected')).join(' / ');
  $('#candidateWire').disabled=selecting;$('#candidateWire').nextElementSibling.textContent=say('ワイヤーフレーム','Wireframe');$('#cancelCandidates').textContent=say('閉じる','Close');$('#cancelCandidates').disabled=$('#closeCandidates').disabled=selecting;
  $('#candidateNext').textContent=say('メッシュを確定して次へ','Confirm meshes and continue');$('#candidateNext').hidden=!!w&&(w.phase==='assembled'||hasGeneratedTextures(p));$('#candidateNext').disabled=disabled||!['head','body'].every(s=>w?.selected[s]);
  if(dialog.open&&load)void show();
  if(!dialog.open&&w?.phase==='candidates'&&['head','body'].every(s=>w.candidates[s].length)&&['assets','placement'].includes(document.body.dataset.stage)&&!disabled&&!wasSeen(p)&&!document.querySelector('dialog[open]')){
   clearTimeout(autoTimer);autoTimer=setTimeout(()=>{if(!hooks.get().busy&&!hooks.get().agentLock&&['assets','placement'].includes(document.body.dataset.stage))open();},0);
  }
 }
 const detailsAPI=initProductionDetails({...hooks,preview:(s,id)=>open(s,id),openCandidates:open});
 const advanced=document.createElement('details');advanced.id='productionAdvanced';advanced.innerHTML='<summary>詳細な読み込み・部位操作</summary>';
 advanced.append(...document.querySelector('[data-panel="assets"] .form-content').children);document.querySelector('.settings-project').append(advanced);
 new ResizeObserver(size).observe(viewport);
 window.addEventListener('preview-project',()=>queueMicrotask(()=>render()));window.addEventListener('preview-stage',()=>render());window.addEventListener('languagechange',()=>render());render();
 return {render,details:detailsAPI,open};
}
