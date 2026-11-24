import {packProject,unpackProject} from './project.mjs';
import {nextCheckpoint,preflight,taskLabels,imageCount} from './journey.mjs';
import {language,t,say} from './i18n.mjs';
import {currentReviewVRM} from './review-vrm.mjs';
import {sessionPrompt} from './session-prompts.mjs';
import {currentExpressions} from './expression-authoring.mjs';

export async function initSessionUI(hooks){
 const $=s=>document.querySelector(s);
 const client=crypto.randomUUID();let promptRequest=null;let state=null,enabled=false,polling=false,handledSync='',handledComplete='',hash=null,hashProject=null,preparing=false,copying=false,locked=false,renderedState='',pollError=false;
 const headers=()=>({'x-charakit-client':client,...(hashProject===hooks.get().project.id&&hash?{'x-charakit-hash':hash}:{})});
 async function api(route,body,extra={}){const response=await fetch('/api/session'+route,{...(body?{method:'POST',body}:{}),headers:{...headers(),...extra}});const data=await response.json();if(!response.ok)throw Error(data.error||'アプリに接続できません。');return data;}
 async function packed(){const {project,files}=hooks.get();return (await packProject(project,files,{language:language()})).blob;}
 const flow=document.createElement('section');flow.id='journeyPanel';flow.className='journey-panel';flow.innerHTML='<h2>制作の進み具合</h2><ol id="journeySteps"></ol><p id="journeyHint"></p><p id="agentStatus" role="status" aria-live="polite"></p><button id="journeyNext" class="primary wide">次へ</button><button id="journeyRetry" class="wide" hidden>現在の状態を読み直す</button>';
 const content=document.createElement('div');content.className='journey-content';content.append(flow,...$('.left').children);$('.left').append(content);
 const actions=document.createElement('div');actions.className='journey-actions';actions.append($('#journeyNext'),$('#journeyRetry'));$('.left').append(actions);
 const globalStatus=document.createElement('p');globalStatus.id='journeyGlobalStatus';globalStatus.setAttribute('role','status');$('#pageTitle').after(globalStatus);
 const imageAction=document.createElement('div');imageAction.className='image-checkpoint';imageAction.innerHTML='<span id="imageCheckpointHint"></span><button id="imageNext" class="primary">画像を確認して次へ</button>';$('#imageWorkspace').prepend(imageAction);
 const dialog=document.createElement('dialog');dialog.id='journeyDialog';dialog.innerHTML='<div class="dialog-top"><h2 id="journeyDialogTitle"></h2><button id="closeJourney" aria-label="閉じる">×</button></div><p id="journeyDialogHelp"></p><textarea id="journeyPrompt" readonly aria-label="次の工程の依頼文"></textarea><div class="dialog-actions"><button id="copyJourney" class="primary">依頼文をコピー</button></div><p id="journeyCopyStatus" role="status"></p>';document.body.append(dialog);
 $('#closeJourney').onclick=()=>dialog.close();
 const exportsPath=document.createElement('p');exportsPath.id='projectExportsPath';exportsPath.className='project-storage';exportsPath.setAttribute('translate','no');document.querySelector('#reviewExport').before(exportsPath);
 async function openExpressionLab(){
  const tab=window.open('about:blank','charakuru-expression-lab');
  return hooks.task('表情ラボを開いています…',async()=>{try{const value=await api('/expression-lab','{}',{'Content-Type':'application/json'});if(tab){tab.opener=null;tab.location.href=value.url;}else hooks.toast('表情ラボ: '+value.url);}catch(error){tab?.close();throw error;}});
 }
 const storage=document.createElement('div');storage.className='project-storage';storage.innerHTML='<h3>プロジェクトの保存先</h3><p id="projectStoragePath" translate="no"></p><button id="exportProjectCopy">持ち出し用に書き出す</button>';$('.settings-project').append(storage);const parentButton=document.createElement('button');parentButton.id='openParentProject';parentButton.type='button';storage.append(parentButton);parentButton.onclick=()=>hooks.task('分岐元を開いています…',async()=>{await save();state=await api('/open-parent','{}',{'Content-Type':'application/json'});hash=state.active.hash;hashProject=state.active.id;await reload();});
 $('#exportProjectCopy').onclick=()=>hooks.task('プロジェクトを書き出しています…',async()=>hooks.export(await packed()));
 const rigForm=$('[data-panel="rig"] .form-content'),rigAdvanced=document.createElement('details');rigAdvanced.id='rigAdvanced';rigAdvanced.innerHTML='<summary>詳細なリギング操作</summary>';
 for(const child of [...rigForm.children])rigAdvanced.append(child);rigForm.append(rigAdvanced);
 $('#setupDownload').hidden=true;$('#setupCopy').hidden=true;$('#originalHandoff').onclick=()=>request('images');
 const openExport=()=>window.dispatchEvent(new Event('vrm-export'));
 const next=()=>nextCheckpoint(hooks.get().project).kind==='finish'?openExport():request(nextCheckpoint(hooks.get().project).kind);
 $('#journeyNext').onclick=next;$('#imageNext').onclick=next;
 $('#journeyRetry').onclick=()=>hooks.task('保存した状態を読み込んでいます…',()=>reload());
 async function reload(){
  const response=await fetch('/api/session/file');if(!response.ok)throw Error((await response.json()).error);
  const next=await unpackProject(await response.arrayBuffer());await hooks.replace(next.project,next.files);
  state=await api('');hash=state.active?.hash;hashProject=state.active?.id;hooks.saved(next.project);hooks.setStage(next.project.expressionEditor||currentExpressions(next.project)?'expressions':nextCheckpoint(next.project).stage);render();
 }
 async function request(kind,context){
  if(preparing)return;
  let opened=false;
  try{
   if(!enabled)throw Error(say('この操作にはローカル起動が必要です。','Start the local app to continue.'));if(locked)throw Error('エージェントの完了を待ってください。');preflight(hooks.get().project,kind,context);
   preparing=true;promptRequest=null;
   $('#journeyDialogTitle').textContent=taskLabels[kind];$('#journeyDialogHelp').textContent=say('依頼文をコピーして、エージェントとのチャットに貼り付けてください。作業開始時に最新の状態を保存します。アプリは開いたままにしてください。','Copy this request into your agent chat. The agent saves the latest state before starting. Keep this app open.');$('#journeyPrompt').value='';$('#journeyCopyStatus').textContent=say('依頼文を準備しています…','Preparing the request…');$('#copyJourney').disabled=true;dialog.showModal();opened=true;
   state=await api('/request',JSON.stringify(hooks.get().project),{'x-charakit-task':kind,...(context?{'x-charakit-slot':context.slot,'x-charakit-image':context.imageId}:{}),'Content-Type':'application/json'});const r=state.request;
   promptRequest={request:r,appRoot:state.appRoot};
   $('#journeyPrompt').value=sessionPrompt(r,state.appRoot,location.origin,language());
   $('#journeyCopyStatus').textContent='';
  }catch(e){if(opened)$('#journeyCopyStatus').textContent=e.message;else hooks.toast(e.message);}finally{preparing=false;render();}
 }
 $('#copyJourney').onclick=async()=>{
  if(locked||preparing||copying)return;
  const prompt=$('#journeyPrompt').value;if(!prompt)return;
  copying=true;$('#copyJourney').disabled=true;
  try{
   await navigator.clipboard.writeText(prompt);$('#journeyCopyStatus').textContent=say('コピーしました。チャットに貼り付けてください。','Copied. Paste into your agent chat.');
  }catch{$('#journeyPrompt').select();$('#journeyCopyStatus').textContent=say('選択した依頼文を Ctrl+C / ⌘C でコピーしてください。','Use Ctrl+C / ⌘C to copy the selected request.');}
  finally{copying=false;render();}
 };
 function setLock(value){locked=value;hooks.lock(value);document.body.classList.toggle('agent-working',value);$('#imageWorkspace').inert=value;content.querySelectorAll(':scope > :not(#journeyPanel)').forEach(e=>e.inert=value);$('#copyJourney').disabled=value||preparing||copying||!$('#journeyPrompt').value;}
 function render(){
  const p=hooks.get().project,c=nextCheckpoint(p),r=state?.request?.projectId===p.id?state.request:null;

  setLock(!!r&&['syncing','running'].includes(r.status));
  $('#journeySteps').replaceChildren();for(const [i,[label,stage]] of [['元絵・画像制作','images'],['8枚の画像を確認','images'],['メッシュを決定','assets'],['頭身を調整','placement'],['動作確認・完成','review']].entries()){
   const li=document.createElement('li'),b=document.createElement('button');b.textContent=(i<c.index||i===c.index&&c.done?'✓ ':i+1+'. ')+t(label);b.classList.toggle('current',i===c.index);b.setAttribute('aria-current',i===c.index?'step':'false');b.onclick=()=>hooks.setStage(stage);li.append(b);$('#journeySteps').append(li);
  }
  $('#journeyHint').textContent=t(c.hint);$('#journeyNext').textContent=t(c.label);$('#journeyNext').disabled=(!enabled&&c.kind!=='finish')||!c.ready||locked;
  $('#imageNext').textContent=c.index<=1?t(c.label):say('モデル編集へ','Open model editor');$('#imageNext').disabled=!enabled||locked||(c.index<=1&&!c.ready);$('#imageNext').onclick=c.index<=1?next:()=>hooks.setStage('assets');
  $('#imageCheckpointHint').textContent=`${imageCount(p)} / 8 · `+(c.index<=1?t(c.hint):say('画像を変更した場合は候補の作り直しが必要です。','Changed images require new meshes.'));
  $('#agentStatus').textContent=!enabled?(currentReviewVRM(p)?say('検査済みのVRMを確認・保存できます。','Review and save the checked VRM.'):say('ローカル起動で制作を続けられます。','Use the local app to continue.')):r?.status==='failed'?r.error:r?.status==='running'?r.message||say('エージェントが作業中です。','Agent is working.'):r?.status==='syncing'?say('最新の状態を保存しています…','Saving latest state…'):r?.status==='queued'?say('依頼文をチャットへ貼り付けてください。','Paste the request into your agent chat.'):say('確認して次へ進めます。','Ready for your review.');
  $('#journeyGlobalStatus').textContent=r&&['queued','syncing','running','failed'].includes(r.status)?$('#agentStatus').textContent:t(c.hint);$('#agentStatus').classList.toggle('error',r?.status==='failed');$('#journeyRetry').hidden=r?.status!=='failed'||!state?.active;
  $('#journeyNext').hidden=c.index===2||c.kind==='finish';$('#pageActions').hidden=true;
  $('#projectExportsPath').textContent=state?.active?.id===p.id?state.active.path.replace(/project\.charakit$/,'exports'):say('VRMの書き出し時に保存します。','Saved when you export the VRM.');
  parentButton.hidden=!p.branch||!enabled;parentButton.disabled=locked;parentButton.textContent=say('分岐元を開く：','Open original: ')+(p.branch?.parentName||'');
  $('#projectStoragePath').textContent=state?.active?.id===p.id?state.active.path:say('最初の保存またはエージェント開始時に作成します。','Created when you save or the agent starts.');
  renderedState=JSON.stringify(state);
 }
 async function poll(){
  if(!enabled||polling)return;polling=true;
  try{
   state=await api('');const r=state.request;
   if(r?.status==='syncing'&&r.client===client&&handledSync!==r.syncNonce&&!hooks.get().busy){
    handledSync=r.syncNonce;setLock(true);
    try{state=await api('/checkpoint',await packed(),{'x-charakit-request':r.id,'x-charakit-nonce':r.syncNonce});hash=state.active?.hash;hashProject=state.active?.id;hooks.saved();}
    catch(e){await api('/fail',JSON.stringify({id:r.id,message:e.message}),{'Content-Type':'application/json'}).catch(()=>{});hooks.toast(e.message);}
   }
   if(r?.status==='complete'&&handledComplete!==r.id&&r.projectId===hooks.get().project.id&&!hooks.get().busy){await reload();handledComplete=r.id;hooks.toast(say('作業が完了しました。内容を確認してください。','Work is ready for your review.'));}
   // Still poll for checkpoints and completion, but leave unchanged UI alone.
   if(pollError||JSON.stringify(state)!==renderedState)render();pollError=false;
  }catch(e){pollError=true;$('#agentStatus').textContent=say('状態を読み込めません。再試行します: ','Unable to load state. Retrying: ')+e.message;}
  finally{polling=false;}
 }
 async function save(name){
  const {project:p}=hooks.get();const previous=p.name;if(name)p.name=name;
  try{state=await api('/save',await packed());hash=state.active.hash;hashProject=state.active.id;hooks.saved(state.saved.project);hooks.toast(say('プロジェクトを保存しました。','Project saved.'));render();return state.saved;}
  catch(e){p.name=previous;throw e;}
 }
 try{state=await api('');enabled=state.available===true;if(state.active){await reload();handledComplete=state.request?.status==='complete'?state.request.id:'';}}
 catch(e){if(state?.available){enabled=true;hooks.toast(say('前回のプロジェクトを開けませんでした: ','Could not reopen project: ')+e.message);}}
 window.addEventListener('preview-project',()=>queueMicrotask(render));window.addEventListener('preview-stage',()=>queueMicrotask(render));window.addEventListener('journey-change',()=>queueMicrotask(render));window.addEventListener('languagechange',()=>{if(promptRequest)$('#journeyPrompt').value=sessionPrompt(promptRequest.request,promptRequest.appRoot,location.origin,language());render();});
 render();setInterval(poll,1200);
 async function importFile(file){state=await api('/open',file);hash=state.active.hash;hashProject=state.active.id;handledComplete='';await reload();hooks.toast(say('プロジェクトを開きました。以後はこの保存先を更新します。','Project opened. Further changes update this saved project.'));}
 async function prepareReview(){
  if(!enabled)throw Error(say('全体の動作確認はローカル起動で利用できます。','Full motion review requires the local app.'));
  state=await api('/prepare-review',await packed());hash=state.active?.hash;hashProject=state.active?.id;
  const response=await fetch('/api/session/file');if(!response.ok)throw Error('動作確認モデルを取得できません。');
  const kit=await unpackProject(await response.arrayBuffer());await hooks.replace(kit.project,kit.files);hooks.saved(kit.project);render();
 }
 async function exportVRM(metadata,source){
  await save();state=await api('/export-vrm',JSON.stringify({metadata,...source}),{'Content-Type':'application/json'});hash=state.active?.hash;hashProject=state.active?.id;
  const response=await fetch('/api/session/file');if(!response.ok)throw Error('完成VRMを取得できません。');
  const kit=await unpackProject(await response.arrayBuffer());await hooks.update(kit.project,kit.files);hooks.saved(kit.project);hooks.setStage('review');render();return kit.files.get(kit.project.vrmExport.path);
 }
 async function selectCandidate(source,id){
  await save();
  state=await api('/select-candidate',await packed(),{'x-charakit-source':source,'x-charakit-candidate':id});hash=state.active.hash;hashProject=state.active.id;handledComplete='';
  const response=await fetch('/api/session/file');if(!response.ok)throw Error('候補を変更したプロジェクトを取得できません。');
  const next=await unpackProject(await response.arrayBuffer());await hooks.replace(next.project,next.files);hooks.saved(next.project);render();return state.branched;
 }
 return {get available(){return enabled;},save,selectCandidate,request,render,importFile,prepareReview,exportVRM,openExpressionLab};
}
