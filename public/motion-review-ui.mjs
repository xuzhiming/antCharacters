import * as THREE from 'three';
import {VRMReview} from './vrm-review.mjs';
import {currentReviewVRM,reviewSourceStamp} from './review-vrm.mjs';
import {materialCounts} from './mtoon-materials.mjs';
import {inspectRig} from './rig-review.mjs';
import {say} from './i18n.mjs';

export function initMotionReview(hooks){
    const panel=document.createElement('div');panel.className='stage-panel';panel.dataset.panel='review';panel.hidden=true;
  panel.innerHTML=`<div class="panel-title"><h1>モーション</h1></div><div class="form-content">
    <div class="review-motion-buttons"><button id="reviewDefault" type="button"></button><button id="reviewCustom" type="button"></button></div>
    <input id="reviewVRMAFile" type="file" accept=".vrma" hidden>
    <div class="review-motion-file"><span id="reviewMotionName" translate="no"></span><button id="reviewReplaceMotion" type="button" hidden></button></div>
    <p id="reviewStatus" class="small-note" role="status" aria-live="polite"></p><p id="reviewPose" class="small-note"></p>
    <div class="button-pair"><button id="reviewPlay" type="button"></button><button id="reviewRest" type="button"></button></div>
    <label class="switch-row"><input id="reviewSkeleton" type="checkbox"><span id="reviewSkeletonLabel"></span></label>
    <label class="switch-row"><input id="reviewPhysics" type="checkbox" checked><span id="reviewPhysicsLabel"></span></label>
    <p id="reviewDragHint" class="small-note"></p><button id="reviewPhysicsReset" class="wide" type="button"></button>
    <button id="reviewPrepareRetry" class="wide" type="button" hidden></button>
    <button id="reviewExport" class="wide primary" type="button"></button>
  </div>`;
  document.querySelector('.left').append(panel);
  const $=id=>panel.querySelector('#'+id);
  let review=null,key='',active=false,request=0,loading=false,error='',preparing=false,prepareAttempt='',motionLoading=false,drag=null;
  const canvas=hooks.renderer.domElement;
  const viewportStatus=document.createElement('div');viewportStatus.id='reviewViewportStatus';viewportStatus.hidden=true;
  viewportStatus.innerHTML='<p role="status" aria-live="polite"></p><button type="button" hidden></button>';canvas.parentElement.append(viewportStatus);
  function stopDrag(){if(!drag)return;const controls=hooks.getControls();controls.enabled=drag.controlsEnabled;const id=drag.id;drag=null;if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}
  function unload(){stopDrag();request++;review?.dispose();review=null;key='';loading=false;motionLoading=false;if(hooks.get().model)hooks.get().model.visible=true;}
  function render(){
    const {project:p}=hooks.get(),record=currentReviewVRM(p),ready=!!review?.model&&!loading&&!!record;
    $('reviewDefault').textContent=say('デフォルト（歩行）','Default (walk)');$('reviewCustom').textContent=review?.motions.has('custom')?say('読み込み済みモーション','Loaded motion'):say('モーションを読み込む（VRMA）','Load motion (VRMA)');
    for(const [id,kind] of [['reviewDefault','default'],['reviewCustom','custom']]){const selected=ready&&review.motionKind===kind;$(id).classList.toggle('active',selected);$(id).setAttribute('aria-pressed',String(selected));$(id).disabled=!ready||motionLoading;}
    $('reviewReplaceMotion').hidden=!review?.motions.has('custom');$('reviewReplaceMotion').disabled=!ready||motionLoading;$('reviewReplaceMotion').textContent=say('変更','Change');
    $('reviewMotionName').textContent=ready&&review.motionKind==='custom'?review.motions.get('custom').name:'';
    $('reviewPose').textContent=ready?(review.isRest?say('元の姿勢','Rest pose'):review.playing?say('再生中','Playing'):say('一時停止中','Paused')):'';
    $('reviewPlay').textContent=review?.playing?say('一時停止','Pause'):say('再生','Play');$('reviewRest').textContent=say('元の姿勢','Rest pose');
    $('reviewPhysicsReset').textContent=say('物理をリセット','Reset physics');$('reviewSkeletonLabel').textContent=say('骨を表示','Show bones');
    $('reviewPhysicsLabel').textContent=say('揺れものの物理','Spring physics');$('reviewPhysics').checked=review?!!review.physicsEnabled:true;$('reviewPhysics').disabled=!ready||motionLoading||!review.avatar.springCount;
    for(const id of ['reviewPlay','reviewRest','reviewPhysicsReset','reviewSkeleton','reviewExport'])$(id).disabled=!ready||motionLoading;
    $('reviewDragHint').textContent=say('一時停止してモデルをドラッグすると、揺れものを確認できます。','Pause and drag the model to check its spring motion.');
    $('reviewPrepareRetry').textContent=say('準備を再試行','Retry preparation');$('reviewPrepareRetry').hidden=!error||!p.springSetup;
    $('reviewExport').textContent=say('VRMを書き出す','Export VRM');
    const physics=review?.physicsEnabled?'ON':'OFF';
    $('reviewStatus').textContent=error||((loading||preparing)?say('動作確認モデルを読み込んでいます…','Loading the model for motion review…'):ready?say(`自動検査済み · 物理 ${physics} · MToon`, `Automatic checks passed · Physics ${physics} · MToon`):say('骨・ウェイト・揺れものの設定後に、モデルを自動で表示します。','The model appears automatically after rig and spring setup.'));
    viewportStatus.hidden=!active||ready;viewportStatus.querySelector('p').textContent=$('reviewStatus').textContent;
    const retry=viewportStatus.querySelector('button');retry.hidden=!error||!p.springSetup;retry.disabled=loading||preparing;retry.textContent=$('reviewPrepareRetry').textContent;
    canvas.classList.toggle('review-draggable',ready&&!review.playing);
  }
  async function refresh(){
    active=hooks.get().stage==='review';if(!active){render();return;}
    const {project:p,files,model}=hooks.get();if(model)model.visible=false;
    const record=currentReviewVRM(p);
    if(!record){
      if(review)unload();if(model)model.visible=false;
      const identity=p.id+'|'+reviewSourceStamp(p);
      if(p.springSetup&&p.workflow?.phase==='springs'&&hooks.session()?.available&&!preparing&&prepareAttempt!==identity){
        preparing=true;prepareAttempt=identity;error='';render();
        try{await hooks.prepareReview();}catch(e){if(hooks.get().project.id===p.id)error=e.message;}finally{preparing=false;if(active)refresh();}
      }else render();return;
    }
    const nextKey=p.id+'|'+record.sha256;
    if(review&&key===nextKey){review.model&&(review.model.visible=true);review.avatar.setActive(true);if(review.helper)review.helper.visible=$('reviewSkeleton').checked;render();return;}
    unload();if(model)model.visible=false;key=nextKey;const pending=++request;loading=true;error='';render();
    const next=new VRMReview(hooks.scene);review=next;
    try{
      await next.load(files.get(record.path));
      if(pending!==request||next!==review)return;
      loading=false;next.model.visible=active;next.avatar.setActive(active);next.helper.visible=active&&$('reviewSkeleton').checked;
      if(active)hooks.fitModel(next.model);render();
    }catch(e){if(pending===request){unload();if(hooks.get().model)hooks.get().model.visible=false;error=e.message;render();}}
  }
  async function motion(fn){if(!review||motionLoading)return;stopDrag();const current=review;motionLoading=true;render();try{await fn(current);}catch(e){hooks.toast(e.message);}finally{if(review===current){motionLoading=false;render();}}}
  $('reviewDefault').onclick=()=>motion(r=>r.selectMotion('default'));
  $('reviewCustom').onclick=()=>review?.motions.has('custom')?motion(r=>r.selectMotion('custom')):$('reviewVRMAFile').click();
  $('reviewReplaceMotion').onclick=()=>$('reviewVRMAFile').click();
  $('reviewVRMAFile').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)motion(r=>r.loadMotion(file));};
  $('reviewPlay').onclick=()=>{stopDrag();if(review)review.playing=!review.playing;render();};
  $('reviewRest').onclick=()=>{stopDrag();review?.restPose();render();};
  $('reviewPhysicsReset').onclick=()=>review?.resetPhysics();
  $('reviewPhysics').onchange=e=>{review?.setPhysics(e.target.checked);render();};
  $('reviewSkeleton').onchange=e=>{if(review?.helper)review.helper.visible=e.target.checked;};
  $('reviewPrepareRetry').onclick=()=>{prepareAttempt='';error='';refresh();};
  viewportStatus.querySelector('button').onclick=()=>$('reviewPrepareRetry').click();
  $('reviewExport').onclick=()=>window.dispatchEvent(new Event('vrm-export'));
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  function ray(e){const rect=canvas.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,hooks.getCamera());}
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0||!active||loading||motionLoading||review?.playing||!review?.model||hooks.get().busy)return;
    ray(e);const meshes=review.model.getObjectsByProperty('isMesh',true).filter(o=>o.visible);const hit=raycaster.intersectObjects(meshes,false)[0];if(!hit)return;
    const camera=hooks.getCamera(),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()),hit.point),point=new THREE.Vector3();if(!raycaster.ray.intersectPlane(plane,point))return;
    const controls=hooks.getControls();drag={id:e.pointerId,plane,start:point.clone(),position:review.model.position.clone(),controlsEnabled:controls.enabled};controls.enabled=false;
    e.preventDefault();e.stopImmediatePropagation();canvas.setPointerCapture(e.pointerId);
  },true);
  canvas.addEventListener('pointermove',e=>{
    if(!drag||e.pointerId!==drag.id||!review?.model)return;ray(e);const point=new THREE.Vector3();if(!raycaster.ray.intersectPlane(drag.plane,point))return;
    const worldDelta=point.sub(drag.start),parent=review.model.parent;
    if(parent){const origin=parent.worldToLocal(new THREE.Vector3()),local=parent.worldToLocal(worldDelta.clone());worldDelta.copy(local.sub(origin));}
    review.model.position.copy(drag.position).add(worldDelta);review.model.updateMatrixWorld(true);e.preventDefault();e.stopImmediatePropagation();
  },true);
  canvas.addEventListener('pointerup',stopDrag,true);canvas.addEventListener('pointercancel',stopDrag,true);canvas.addEventListener('lostpointercapture',stopDrag,true);window.addEventListener('blur',stopDrag);
  window.addEventListener('preview-stage',e=>{active=e.detail==='review';stopDrag();if(!active){if(loading)unload();review?.avatar.setActive(false);if(review?.model)review.model.visible=false;if(review?.helper)review.helper.visible=false;if(hooks.get().model)hooks.get().model.visible=true;hooks.resetBounds();}else refresh();render();});
  window.addEventListener('preview-project',()=>queueMicrotask(refresh));window.addEventListener('languagechange',render);
  window.addEventListener('pagehide',unload);
  document.addEventListener('visibilitychange',()=>{stopDrag();if(review){review.playing=false;render();}});
  globalThis.charakitReview={rest:()=>{review?.restPose();render();},pose:time=>{review?.pose(time);render();},report:()=>review?.model?{...inspectRig(review.model,review.mapping),position:review.model.position.toArray(),materials:materialCounts(review.model),physics:{enabled:!!review.physicsEnabled,joints:review.avatar.springCount},vrmHash:currentReviewVRM(hooks.get().project)?.sha256,motion:{type:'vrma',kind:review.motionKind,available:!!review.avatar.action,duration:review.duration,time:review.time}}:null};
  return {refresh,unload,tick:delta=>{if(active&&!loading)review?.tick(delta);}};
}
