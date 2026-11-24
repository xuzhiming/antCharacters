import {currentSpringReview} from './weight-plan.mjs';
import {t,language,localize,say} from './i18n.mjs';
import {localeInfo} from './locales.mjs';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const icon=name=>window.uiIcon(name);
const titleMap={images:'画像素材',assets:'モデル編集',placement:'モデル編集',rig:'リギング',expressions:'表情制作',review:'動作確認',handoff:'仕上げ',markers:'関節の調整',springs:'揺れの経路'};
export async function initPreview(api){
 let selectedTask='springs';
 function button(text,fn,classes=''){const b=document.createElement('button');b.textContent=text;b.className=classes;b.onclick=fn;return b;}
 function navigate(stage){api.setStage(stage);requestAnimationFrame(()=>api.fit());}
 function selectTask(value){selectedTask=value;$('#setupTask').value=value;$('#setupTask').dispatchEvent(new Event('change'));$$('.task-choice').forEach(b=>{b.classList.toggle('active',b.dataset.task===value);b.setAttribute('aria-pressed',String(b.dataset.task===value));});updateTaskAvailability();}
 function updateTaskAvailability(){const p=api.get().project;const ready=p.mode==='assembled';$('#setupCopy').disabled=!ready;if($('#finishWait'))$('#finishWait').hidden=ready;}
 function syncLanguage(){
  $('#languageSelect').value=language();
  $('#previewHelp').href='./help/'+localeInfo(language()).tutorial;
  $('#rigTutorial').href=$('#previewHelp').href;
  document.title=localeInfo(language()).title;
  sync();localize();
  if($('#samplesDialog').open)refreshSamples();
 }
 function sync(stage=api.get().stage){
  const p=api.get().project;
  if($('#springReviewStatus'))$('#springReviewStatus').textContent=t(currentSpringReview(p)?'揺れ物の確認済み':'最初にAstraへ揺れ物の推定を依頼してください。');
  $('#pageTitle').textContent=titleMap[stage]||'キャラクター';
  $$('button[data-stage]').forEach(b=>{const active=b.dataset.stage===(stage==='placement'?'assets':stage);b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  $$('.inspector-tabs button').forEach(b=>{b.classList.toggle('active',b.dataset.editorTab===stage);b.setAttribute('aria-pressed',String(b.dataset.editorTab===stage));});
  $('.inspector-tabs').hidden=true;
  $('main').dataset.advanced=String(['markers','springs'].includes(stage));
  const models=p.assets.filter(a=>['body','hair','head_neutral','assembled'].includes(a.role));
  $('#modelEmpty').hidden=models.length>0||!!p.production?.candidates.head.length||!!p.production?.candidates.body.length;$('#canvasCaption').setAttribute('translate','no');$('#canvasCaption').textContent=p.name;$('#projectName').textContent=p.name;$('#projectMount').title=p.name;
  const actions=$('#pageActions');actions.replaceChildren();
  if(['assets','placement'].includes(stage)){
   const next=button('リギングへ',()=>navigate('rig'),'quiet');next.disabled=!!p.production&&p.production.phase!=='assembled';actions.append(next);
  }else if(stage==='rig')actions.append(button('モデルを編集',()=>navigate('placement'),'quiet'));
  else if(['markers','springs'].includes(stage))actions.append(button('リギングへ戻る',()=>navigate('rig'),'quiet'));
  if(stage==='handoff'){selectTask('springs');updateTaskAvailability();}
  for(const card of $$('.asset-slot')){
   const a=p.assets.find(a=>a.role===card.dataset.role);const file=card.querySelector('small');if(a)file.title=a.filename;
   const label=card.querySelector('.file-button');label.title=a?'モデルを差し替える':'モデルを読み込む';const part=t({head_neutral:'頭',hair:'髪',body:'体・衣装'}[card.dataset.role]);label.setAttribute('aria-label',language()==='ko'?`${part} ${a?'교체':'불러오기'}`:language()==='en'?`${a?'Replace':'Import'} ${part}`:`${part}の${a?'差し替え':'読み込み'}`);
  }
 }
 document.title=localeInfo(language()).title;
 $('.page-kicker').hidden=true;$('.sidebar-project>.eyebrow').hidden=true;
 const projectField=$('#nameInput').closest('label');projectField.hidden=false;$('.settings-project').insertBefore(projectField,$('#previewNew'));
 // Keep all original model operations. Only their presentation and grouping change.
 for(const card of $$('.asset-slot')){
  const role=card.dataset.role==='head_neutral'?'head':card.dataset.role;
  const mark=document.createElement('span');mark.className='part-icon';mark.innerHTML=icon(role);card.prepend(mark);
  if(role==='head')card.querySelector('strong').textContent='頭';
  const label=card.querySelector('.file-button'),input=label.querySelector('input');label.replaceChildren();label.insertAdjacentHTML('afterbegin',icon('upload'));label.append(input);label.tabIndex=0;label.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}};
 }
 const slots=$('#assetSlots');for(const role of ['head_neutral','hair','body'])slots.append(slots.querySelector(`[data-role="${role}"]`));
 $$('.inspector-tabs button').forEach(b=>b.onclick=()=>navigate(b.dataset.editorTab));
 $('#emptyImport').onclick=()=>{$('#asset-body').click();navigate('assets');};
 // Rigging has one visible Tripo action; advanced tools stay inside their own disclosure.
 const rig=$('[data-panel="rig"] .form-content');
 const note=document.createElement('p');note.className='rig-intro';note.textContent='髪の毛以外を書き出し、Tripoでボーンを配置します。';rig.prepend(note);
 $('[data-panel="rig"] .panel-title').hidden=true;
 $('#rigExportStatus').hidden=true;
 const method=document.createElement('details');method.className='rig-method-details';method.innerHTML='<summary>その他のリギング方法</summary>';rig.append(method);method.append($('#rigMethod').closest('label'),$('#rigMethodNote'),$('#openMarkers'));
 const spring=button('揺れの経路を編集',()=>navigate('springs'));method.append(spring);
 rig.querySelector('.tripo-link').classList.add('primary');
 rig.querySelector('.tripo-link').textContent='Tripoでボーンを配置';
 $('#exportRig').textContent='リギング用FBXを書き出す';
 const rigLabel=$('#riggedFile').closest('label'),rigInput=$('#riggedFile');rigLabel.replaceChildren(document.createTextNode('リギング済みFBXを読み込む'),rigInput);rigLabel.classList.remove('primary');
 const transfer=button('ウェイト転送する',()=>api.transferWeights());transfer.id='transferWeights';
 const steps=document.createElement('ol');steps.className='rig-steps';
 const estimate=button('揺れ物を推定する',()=>api.requestImages('exclusions'));estimate.id='estimateSprings';
 const reopen=button('返却された.charakitを開く',()=>$('#openKit').click());reopen.id='openSpringKit';
 const first=document.createElement('div');first.className='spring-review-step';first.append(estimate,reopen);const status=document.createElement('p');status.id='springReviewStatus';first.append(status);
 for(const [i,control]of[first,$('#exportRig'),rig.querySelector('.tripo-link'),rigLabel,transfer].entries()){const step=document.createElement('li');const number=document.createElement('span');number.className='rig-step-number';number.textContent=String(i+1);number.setAttribute('aria-hidden','true');step.append(number,control);steps.append(step);}
 note.after(steps);method.append($('#editOriginalParts'));rig.append(method);
 const rigTutorial=document.createElement('a');rigTutorial.id='rigTutorial';rigTutorial.className='rig-tutorial';rigTutorial.target='_blank';rigTutorial.rel='noopener noreferrer';rigTutorial.innerHTML='<span>初めての方はこちら</span><span aria-hidden="true">↗</span>';steps.after(rigTutorial);
 $('#editOriginalParts').textContent='元のパーツに切り替え';
 // Group the source illustration separately from the part library.
 const imageRoot=$('#imageWorkspace'),imageStudio=document.createElement('div');imageStudio.className='image-studio';imageRoot.prepend(imageStudio);imageStudio.append($('.original-section'));
 const library=document.createElement('div');library.className='image-library';imageStudio.append(library);const libHead=document.createElement('div');libHead.className='library-top';libHead.innerHTML='<h2>部位の画像</h2>';library.append(libHead);libHead.append($('.image-actions'));library.append($('.image-toolbar'),$('#imageGrid'));
 $('#originalHandoff').classList.add('primary');const originalLabel=$('#originalFile').closest('label');originalLabel.classList.remove('primary');
 $('#originalPreview').onclick=null;
 $('#imageZip').closest('label').childNodes[0].textContent='ZIPを読み込む';$('#imagePNGExport').textContent='画像を保存';
 $('#imageFilters').hidden=true;$('#imageView').hidden=true;
 const directions=document.createElement('div');directions.className='segmented image-directions';for(const [value,text]of[['front','正面'],['left','左'],['right','右'],['back','背面']]){const b=button(text,()=>{$('#imageView').value=value;$('#imageView').dispatchEvent(new Event('change'));[...directions.children].forEach(n=>{n.classList.toggle('active',n===b);n.setAttribute('aria-pressed',String(n===b));});});b.dataset.direction=value;directions.append(b);}
 $('.image-toolbar').prepend(directions);directions.firstElementChild.click();
 // Legacy result import stays available in Settings, outside the normal workflow.
 const legacyResults=document.createElement('details');legacyResults.id='legacyResultTools';legacyResults.innerHTML='<summary>詳細な結果読み込み</summary>';
 const finish=$('#handoffWorkspace');finish.hidden=false;legacyResults.append($('.mvp-setup-controls'),finish);$('.settings-project').append(legacyResults);
 // Image handoff is a compact dialog, with the generated request available on demand.
 $('#handoffDialog h2').textContent='画像制作をAstraに依頼';$('#handoffDialog>p').textContent='保存したプロジェクトと依頼文をAstraへ渡します。';
 const imagePrompt=document.createElement('details');imagePrompt.className='prompt-details';imagePrompt.innerHTML='<summary>依頼文を確認</summary>';$('#prompt').before(imagePrompt);imagePrompt.append($('#prompt'));
 $('#dialogDownload').textContent='プロジェクトを保存';$('#dialogDownload').classList.remove('primary');$('#copyPrompt').textContent='依頼文をコピー';$('#copyPrompt').classList.add('primary');
 $('#exportNameDialog h2').textContent='プロジェクトを保存';$('#exportNameForm button[type=submit]').textContent='保存';
 $$('.close-modal').forEach(b=>b.onclick=()=>b.closest('dialog').close());
 const newDialog=$('#newProjectDialog');
 $('#newProject').onclick=()=>{if(api.get().busy)return;$('#newProjectName').textContent=api.get().project.name;newDialog.showModal();$('#cancelNewProject').focus();};
 $('#cancelNewProject').onclick=()=>newDialog.close();
 async function startNew(saveFirst){
  if(api.get().busy)return;
  newDialog.close();
  await api.task(t(saveFirst?'保存しています…':'新規プロジェクト…'),async()=>{if(saveFirst)await api.save();await api.createNew();});
 }
 $('#discardAndNew').onclick=()=>startNew(false);$('#saveAndNew').onclick=()=>startNew(true);
 $('#previewSettings').onclick=()=>$('#previewSettingsDialog').showModal();
 const sampleStatus=document.createElement('p');sampleStatus.setAttribute('role','status');sampleStatus.className='small-note';$('#samplesDialog .sample-options').before(sampleStatus);
 let samples={},sampleRequest=0;
 const sampleButtons=()=>$$('[data-sample="parts"],[data-sample="walk"]');
 async function refreshSamples(){
  const request=++sampleRequest;samples={};sampleButtons().forEach(b=>b.disabled=true);
  sampleStatus.textContent=t('サンプルを確認しています…');
  try{
   const response=await fetch('/api/samples');if(!response.ok)throw Error();const available=await response.json();
   if(request!==sampleRequest)return;samples=available&&typeof available==='object'?available:{};
   sampleButtons().forEach(b=>b.disabled=samples[b.dataset.sample]!==true);
   sampleStatus.textContent=samples.parts===true&&samples.walk===true?'':t('利用できないサンプルは未設定、またはファイルを読み込めません。「最初から試す」は利用できます。');
  }catch{if(request===sampleRequest)sampleStatus.textContent=t('サンプルを利用できません。「最初から試す」は利用できます。');}
 }
 sampleButtons().forEach(b=>b.disabled=true);
 $('#previewSamples').onclick=()=>{$('#samplesDialog').showModal();refreshSamples();};
 window.addEventListener('languagechange',syncLanguage);
 $('#previewNew').onclick=()=>{$('#previewSettingsDialog').close();$('#newProject').click();};
 async function sample(kind){
  if(api.get().busy)return;
  if(kind==='new'){$('#samplesDialog').close();$('#newProject').click();return;}
  if(samples[kind]!==true)return;
  if(api.get().dirty&&!confirm(t('未保存の変更があります。サンプルを開きますか？')))return;
  $('#samplesDialog').close();
  $('#previewLoading').hidden=false;
  try{if(!await api.load('/sample/'+kind+'.charakit'))return;navigate(kind==='walk'?'review':'assets');sync();$('#saveStatus').textContent='サンプル';}finally{$('#previewLoading').hidden=true;}
 }
 $$('[data-sample]').forEach(b=>b.onclick=()=>sample(b.dataset.sample));
 window.addEventListener('preview-stage',e=>sync(e.detail));window.addEventListener('preview-project',()=>queueMicrotask(()=>sync()));
 $('#openKit').addEventListener('change',()=>setTimeout(()=>sync(),150));
 $('#rigMethod').addEventListener('change',()=>{spring.hidden=$('#rigMethod').value!=='markers';});spring.hidden=true;
 selectTask('springs');syncLanguage();
 $('#previewLoading').hidden=true; // Session restoration owns startup; samples are explicit.
 // Native input dialogs retain the existing import/export handlers.
 $$('label.file-button:not([tabindex])').forEach(label=>{const input=label.querySelector('input[type=file]');if(input){label.tabIndex=0;label.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}};}});
 document.body.dataset.previewReady='true';
}
