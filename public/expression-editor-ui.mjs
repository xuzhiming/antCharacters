import {PreviewAvatar} from './preview-avatar.mjs';
import {MToonReview} from './mtoon-materials.mjs';
import {expressionBindings,applyExpressionControls,expressionFaceBounds} from './expression-preview.mjs';
import {expressionPreviewSource,expressionControls,updateExpressionControl,importExpressionModel} from './expression-editor-data.mjs';
import {expressionModelStamp} from './expression-authoring.mjs';
import {isWeighted} from './journey.mjs';
import {t} from './i18n.mjs';

const expressionNames={aa:'あ',ih:'い',ou:'う',ee:'え',oh:'お',blink:'まばたき',blink_L:'左まばたき',blink_R:'右まばたき',happy:'笑顔',angry:'怒り',sad:'悲しみ',relaxed:'リラックス',surprised:'驚き'};
function displayName(entry){
 const key=entry.kind==='vrm'?entry.name:entry.name.startsWith('EA_')?entry.name.slice(3):null;
 if(expressionNames[key])return t(expressionNames[key]);
 const part=key?.match(/^(brow_)?(happy|angry|sad|relaxed|surprised)(?:_(eye|mouth))?$/);
 return part?`${t(expressionNames[part[2]])} · ${t(part[1]?'眉':part[3]==='eye'?'目':'口')}`:entry.name;
}
export function initExpressionEditor(hooks){
 const panel=document.createElement('section');panel.className='stage-panel expression-editor';panel.dataset.panel='expressions';panel.hidden=true;
 panel.innerHTML=`<button id="expressionRequest" class="primary" type="button">${window.uiIcon('face')}<span>表情を制作する</span></button>
  <div class="expression-source"><label class="file-button" tabindex="0"><span>表情を読み込む</span><input id="expressionFile" type="file" accept=".vrm,.charakit,.glb" hidden></label><span id="expressionSourceName" class="expression-source-name" translate="no"></span></div>
  <p id="expressionStatus" class="expression-status" role="status" aria-live="polite"></p>
  <h2>表情一覧</h2><div id="expressionList" class="expression-list" role="listbox" aria-label="表情一覧"></div>
  <fieldset id="expressionAdjustments" class="expression-adjustments" disabled>
   <div class="expression-selected"><strong id="expressionSelected" translate="no">—</strong><small id="expressionType"></small></div>
   <label for="expressionStrength">強度</label><div class="expression-value"><input id="expressionStrength" type="range" min="0" max="1" step="0.01" value="0"><input id="expressionStrengthNumber" type="number" min="0" max="1" step="0.01" value="0" aria-label="表情の強度"></div>
   <div class="expression-range"><label>最小値<input id="expressionMinimum" type="number" step="0.01" value="0"></label><label>最大値<input id="expressionMaximum" type="number" step="0.01" value="1"></label></div>
   <div class="button-pair"><button id="expressionReset" type="button">この表情を戻す</button><button id="expressionResetAll" type="button">すべて戻す</button></div>
  </fieldset>
  <div class="button-pair"><button id="expressionFocus" type="button" disabled>顔へ寄る</button><button id="expressionWhole" type="button" disabled>全体を表示</button></div>
  <details><summary>Blenderでの調整</summary><button id="expressionOpen" type="button" disabled>表情ラボを開く</button></details>`;
 document.querySelector('.left').append(panel);
 const $=id=>panel.querySelector('#'+id),avatar=new PreviewAvatar({scene:hooks.scene}),appearance=new MToonReview();
 let entries=[],key='',sourceKey='',loadedProject='',active=false,loading=false,error='',request=0,framing='face';
 const state=()=>{const p=hooks.get().project,expected=expressionPreviewSource(p)?.key||'working:'+expressionModelStamp(p);return !loading&&avatar.model&&loadedProject===p.id&&sourceKey===expected?expressionControls(p,sourceKey,entries):{controls:[],selected:null};};
 function renderValues(){
  const s=state(),control=s.controls.find(c=>c.id===s.selected),entry=entries.find(e=>e.id===s.selected),locked=hooks.get().agentLock;
  $('expressionAdjustments').disabled=loading||!control||locked;
  $('expressionSelected').textContent=entry?displayName(entry):'—';$('expressionSelected').title=entry?.name||'';$('expressionType').textContent=entry?.binary?t('切替式'):'';
  for(const id of ['expressionStrength','expressionStrengthNumber']){const input=$(id);input.min=control?.min??0;input.max=control?.max??1;if(document.activeElement!==input)input.value=control?.value??0;}
  for(const [id,field]of [['expressionMinimum','min'],['expressionMaximum','max']]){const input=$(id);input.min=entry?.kind==='vrm'?0:-10;input.max=entry?.kind==='vrm'?1:10;if(document.activeElement!==input)input.value=control?.[field]??(field==='min'?0:1);}
  for(const row of $('expressionList').children){const c=s.controls.find(c=>c.id===row.dataset.id);if(c){row.classList.toggle('active',c.id===s.selected);row.setAttribute('aria-selected',String(c.id===s.selected));row.tabIndex=c.id===s.selected?0:-1;row.lastElementChild.textContent=c.value.toFixed(2);row.disabled=locked||loading;}}
 }
 function renderList(){
  const list=$('expressionList');list.replaceChildren();
  if(!entries.length){const empty=document.createElement('p');empty.className='expression-empty';empty.textContent=t('まだ表情がありません。制作を依頼するか、表情のあるモデルを読み込んでください。');list.append(empty);}
  for(const entry of entries){const row=document.createElement('button');row.type='button';row.className='expression-row';row.dataset.id=entry.id;row.setAttribute('role','option');row.setAttribute('translate','no');const name=document.createElement('span');name.textContent=displayName(entry);name.title=entry.name;row.append(name,document.createElement('small'));row.onclick=()=>{state().selected=entry.id;hooks.dirty();renderValues();};list.append(row);}
  renderValues();
 }
 function render(){
  const {project:p,model,agentLock}=hooks.get(),source=expressionPreviewSource(p),ready=!!avatar.model&&!loading;
  $('expressionRequest').disabled=agentLock||!hooks.session()?.available||!(isWeighted(p)||source?.kind==='vrm');
  $('expressionFile').disabled=agentLock;$('expressionSourceName').textContent=source?.filename||'';$('expressionSourceName').title=source?.filename||'';
  $('expressionStatus').textContent=error||t(loading?'表情を読み込んでいます…':entries.length?'表情を組み合わせながら確認できます。調整値はキャラキットに保存されます。':model?.children.length||source?'モデルに表情がまだありません。':'モデルを読み込むと表情を確認できます。');
  $('expressionStatus').classList.toggle('expression-error',!!error);
  for(const id of ['expressionFocus','expressionWhole'])$(id).disabled=!ready||!entries.length||agentLock;
  $('expressionOpen').disabled=!entries.length||!p.expressionAuthoring||!hooks.session()?.available||agentLock;
  if(active)document.querySelector('#modelEmpty').hidden=true;
  renderValues();
 }
 function apply(){applyExpressionControls(avatar,entries,state().controls);renderValues();hooks.dirty();}
 function unload(){request++;appearance.setModel(null);avatar.cancelPending();avatar.unload();entries=[];key='';loading=false;}
 async function refresh(){
  active=hooks.get().stage==='expressions';if(!active){render();return;}
  const {project:p,files,model}=hooks.get(),source=expressionPreviewSource(p),nextSourceKey=source?.key||'working:'+expressionModelStamp(p),nextKey=p.id+'|'+nextSourceKey+(source?'':'|'+(model?.uuid||''));
  if(nextKey===key){avatar.setActive(true);if(avatar.model){avatar.model.visible=true;if(!loading)applyExpressionControls(avatar,entries,state().controls);}render();return;}
  unload();key=nextKey;sourceKey=nextSourceKey;loadedProject=p.id;loading=true;error='';renderList();render();const pending=++request;
  try{
   if(source){const bytes=files.get(source.path);if(!bytes)throw Error('表情モデルのファイルが見つかりません。');const file=new File([bytes],source.filename||('expressions.'+source.kind));if(source.kind==='vrm')await avatar.loadVRM(file);else await avatar.loadGLB(file);}
   else avatar.useWorkingModel(model);
   if(pending!==request)return;
   entries=expressionBindings(avatar);loading=false;state();applyExpressionControls(avatar,entries,state().controls);
   appearance.setModel(avatar.model);appearance.setEnabled(!avatar.vrm);avatar.setActive(active);if(avatar.model)avatar.model.visible=active;
   renderList();render();if(active&&avatar.model){framing=entries.length?'face':'whole';refit();}
  }catch(e){if(pending===request){unload();error=e.message;renderList();render();}}
 }
 function edit(field,input){if(!entries.length||input.value==='')return;try{updateExpressionControl(hooks.get().project,sourceKey,entries,state().selected,{[field]:Number(input.value)});error='';apply();render();}catch(e){error=t(e.message);render();}}
 for(const id of ['expressionStrength','expressionStrengthNumber']){$(id).oninput=()=>edit('value',$(id));$(id).onchange=()=>{edit('value',$(id));$(id).value=state().controls.find(c=>c.id===state().selected)?.value??0;};}
 $('expressionMinimum').onchange=()=>edit('min',$('expressionMinimum'));$('expressionMaximum').onchange=()=>edit('max',$('expressionMaximum'));
 $('expressionReset').onclick=()=>{updateExpressionControl(hooks.get().project,sourceKey,entries,state().selected,{value:0,min:0,max:1});error='';apply();render();};
 $('expressionResetAll').onclick=()=>{for(const c of state().controls)Object.assign(c,{value:0,min:0,max:1});error='';apply();render();};
 function refit(){if(!avatar.model)return;if(framing==='face')hooks.fitBounds(expressionFaceBounds(avatar,entries));else hooks.fitModel(avatar.model);}
 $('expressionFocus').onclick=()=>{framing='face';refit();};$('expressionWhole').onclick=()=>{framing='whole';refit();};
 $('expressionRequest').onclick=()=>hooks.session()?.request('expressions');
 $('expressionOpen').onclick=()=>hooks.session()?.openExpressionLab();
 const fileLabel=$('expressionFile').closest('label');fileLabel.onkeydown=e=>{if((e.key==='Enter'||e.key===' ')&&!$('expressionFile').disabled){e.preventDefault();$('expressionFile').click();}};
 $('expressionFile').onchange=e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(/\.charakit$/i.test(file.name))return hooks.openKit(file);hooks.task(t('表情を読み込んでいます…'),async()=>{if(file.size>128*1024*1024)throw Error('モデルは128MB以内にしてください。');const {project:p,files}=hooks.get(),next=structuredClone(p),nextFiles=new Map(files);await importExpressionModel(next,nextFiles,await file.arrayBuffer(),file.name);hooks.commit(next,nextFiles);await refresh();});};
 $('expressionList').onkeydown=e=>{if(!['ArrowUp','ArrowDown','Home','End'].includes(e.key)||!entries.length)return;e.preventDefault();const s=state(),i=entries.findIndex(entry=>entry.id===s.selected),next=e.key==='Home'?0:e.key==='End'?entries.length-1:Math.max(0,Math.min(entries.length-1,i+(e.key==='ArrowDown'?1:-1)));s.selected=entries[next].id;hooks.dirty();renderValues();[...$('expressionList').children].find(row=>row.dataset.id===s.selected)?.focus();};
 window.addEventListener('preview-stage',e=>{active=e.detail==='expressions';if(active)refresh();else{if(loading)unload();avatar.setActive(false);if(avatar.model)avatar.model.visible=false;}render();});
 const resize=new ResizeObserver(()=>{if(active&&!loading&&avatar.model)requestAnimationFrame(()=>{if(active)refit();});});resize.observe(hooks.viewport);
 window.addEventListener('preview-project',()=>queueMicrotask(refresh));window.addEventListener('languagechange',()=>{renderList();render();});window.addEventListener('pagehide',()=>{resize.disconnect();appearance.dispose();avatar.dispose();});
 globalThis.charakitExpressions={report:()=>({ready:!!avatar.model&&!loading,sourceKey,selected:state().selected,entries:entries.map(e=>({id:e.id,name:e.name,kind:e.kind,binary:!!e.binary})),controls:structuredClone(state().controls),morphs:avatar.model?.getObjectsByProperty('isMesh',true).map(m=>({name:m.name,values:[...(m.morphTargetInfluences??[])]}))??[],materials:avatar.model?.getObjectsByProperty('isMesh',true).flatMap(m=>(Array.isArray(m.material)?m.material:[m.material]).map(material=>({name:material.name,color:material.color?.toArray()})))??[]})};
 renderList();render();
 return {refresh,render,tick:delta=>{if(active){if(hooks.get().model)hooks.get().model.visible=false;avatar.tick(delta);appearance.tick(delta);}},fitAll:()=>{framing='whole';refit();}};
}
