import {captureRigReference} from './roundtrip.mjs';
import {workflow,rigSourceStamp,rigExportState} from './workflow.mjs';
import {packProject} from './project.mjs';
import {say} from './i18n.mjs';

const $=s=>document.querySelector(s);
export function initMVPUI(hooks) {
  const {get,dirty,task,download,setStage,importResult}=hooks;
  let capabilities=null;
  const rig=document.createElement('div');rig.className='stage-panel';rig.dataset.panel='rig';rig.hidden=true;
  rig.innerHTML=`<div class="panel-title"><h1>リグを付ける</h1><p>頭＋体をTripoへ渡し、FBXから骨配置だけを読み戻します。</p></div><div class="form-content">
    <label class="field">リギング方法<select id="rigMethod"><option value="tripo">Tripo（標準）</option><option value="markers">マーカー（詳細）</option></select></label>
    <p id="rigMethodNote" class="small-note"></p><p id="rigExportStatus" class="callout" aria-live="polite"></p>
    <button id="exportRig" class="primary wide">頭＋体をFBXで書き出す</button>
    <button id="editOriginalParts" class="wide">元のパーツ配置へ戻る</button>
    <button id="realignReturn" class="wide" hidden>Tripo戻りのサイズを合わせ直す</button><p id="alignmentStatus" class="small-note" aria-live="polite"></p>
    <p id="blenderStatus" class="small-note"></p>
    <a class="tripo-link" href="https://studio.tripo3d.ai/" target="_blank" rel="noopener noreferrer">Tripoでリギング ↗</a>
    <p class="small-note">書き出したFBXをアップロードしてリグを作り、FBXで書き出してください。髪はキットに保持します。</p>
    <label class="file-button primary">Tripoから骨配置を読み込む<input id="riggedFile" type="file" accept=".fbx,.zip" hidden></label>
    <p class="small-note">元のメッシュ・テクスチャを保持し、骨のサイズを合わせます。ウェイトは素体から転送します。</p>
    <button id="openMarkers" class="wide" hidden>マーカーを配置する</button>
  </div>`;
  $('.left').append(rig);
  const setup=document.createElement('div');setup.className='mvp-setup-controls';
  setup.innerHTML=`<label class="field">依頼する作業<select id="setupTask"><option value="springs">揺れもの・VRM出力</option><option value="rig">マーカーからリギング（詳細）</option></select></label>
    <details><summary>Astraからの確認用FBXを読み込む</summary><label class="field">完了した工程<select id="resultPhase"><option value="weighted">ウェイト転送</option><option value="springs">揺れもの設定</option></select></label>
    <label class="switch-row"><input id="resultHasHair" type="checkbox">返却FBXに髪が含まれている</label>
    <label class="file-button">確認用FBX / ZIP<input id="resultFile" type="file" accept=".fbx,.zip" hidden></label>
    <p class="small-note">.charakitで返ってきた場合は上部の「開く」を使います。完成VRMと編集用Blendは別に保管します。</p></details>`;
  $('#handoffWorkspace').insertBefore(setup,$('#handoffStatus'));
  $('#rigMethod').onchange=e=>{workflow(get().project).rigging=e.target.value;dirty();refresh();hooks.refreshHandoff();};
  $('#openMarkers').onclick=()=>setStage('markers');
  $('#editOriginalParts').onclick=()=>hooks.restoreParts();
  $('#realignReturn').onclick=()=>hooks.realign();
  $('#riggedFile').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)task('リグ済みモデルを読み込んでいます…',()=>importResult(file,'rigged',false));};
  $('#resultFile').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)task('処理結果を読み込んでいます…',()=>importResult(file,$('#resultPhase').value,$('#resultHasHair').checked));};
  $('#setupTask').onchange=()=>hooks.refreshHandoff();
  $('#exportRig').onclick=()=>task('頭＋体をFBXで書き出しています…',async()=>{
    const {project:p,files}=get();const stamp=rigSourceStamp(p);
    if(p.mode!=='parts'||rigExportState(p)==='missing')throw Error(say('頭と体を読み込み、配置を確認してください。','Load and place the original head and body first.'));
    const bounds=await captureRigReference(p,files);
    const {blob}=await packProject(p,files);
    const post=await fetch('/api/export-rig',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:blob});
    const job=await responseJSON(post);
    let result;
    const deadline=Date.now()+190000;
    while(Date.now()<deadline){
      await new Promise(resolve=>setTimeout(resolve,700));
      result=await responseJSON(await fetch('/api/export-rig/'+job.id));
      if(result.status==='failed')throw Error(result.error);
      if(result.status==='ready')break;
    }
    if(result?.status!=='ready')throw Error(say('書き出しの結果を取得できませんでした。','Export did not complete.'));
    const file=await fetch('/api/export-rig/'+job.id+'/file');if(!file.ok)throw Error('FBX download failed');
    download(await file.blob(),'head-body-for-tripo.fbx');
    workflow(p).rigExport={sourceStamp:stamp,bounds,coordinateProfile:'baked-y-up-meters-v1',at:new Date().toISOString()};dirty();refresh();
  });
  async function responseJSON(response){let data;try{data=await response.json();}catch{throw Error(say('ローカル版を npm start で起動してください。','Start the local app with npm start.'));}if(!response.ok)throw Error(data.error||'Request failed');return data;}
  fetch('/api/capabilities').then(responseJSON).then(value=>{capabilities=value;refresh();}).catch(()=>{capabilities={rigExport:false};refresh();});
  function refresh(){
    const {project:p,stage}=get(),w=workflow(p),advanced=w.rigging==='markers';
    $('#rigMethod').value=w.rigging;
    $('#realignReturn').hidden=!(p.mode==='assembled'&&w.attachHair&&w.phase==='rigged'&&['body','head_neutral'].every(role=>p.assets.some(a=>a.role===role)));
    const alignment=w.returnAlignment;
    $('#alignmentStatus').textContent=alignment?say(`読み戻し ${alignment.returnedHeight.toFixed(3)} m → 元の全高 ${alignment.sourceHeight.toFixed(3)} m（${alignment.scale.toFixed(3)}倍）。髪の位置も確認してください。`,`Returned height ${alignment.returnedHeight.toFixed(3)} m → original ${alignment.sourceHeight.toFixed(3)} m (${alignment.scale.toFixed(3)}×). Check hair placement too.`):'';
    for(const button of document.querySelectorAll('button[data-stage="markers"],button[data-stage="springs"]'))button.hidden=!advanced;
    $('#openMarkers').hidden=!advanced;
    $('#rigMethodNote').textContent=advanced?say('マーカーに沿ってAstraがリギングします。追加の時間・トークンを使用します。','Astra rigs from your markers. Additional time and tokens are required.'):say('Tripoでリグを作り、FBXで書き出します。','Rig in Tripo and export FBX.');
    const state=rigExportState(p);
    $('#rigExportStatus').textContent=state==='missing'?say('頭・体が未登録です。','Load the head and body.'):state==='stale'?say('配置または素材が変わりました。Tripo用FBXを再書き出ししてください。','Parts or placement changed. Export a new FBX for Tripo.'):state==='current'?say('FBXを書き出し済み','The current placement has been exported.'):say('FBXを書き出してTripoへ','Check placement, then export head and body.');
    $('#exportRig').disabled=state==='missing'||p.mode!=='parts'||capabilities?.rigExport===false;
    $('#editOriginalParts').hidden=p.mode==='parts';
    $('#blenderStatus').textContent=capabilities===null?say('書き出し環境を確認中…','Checking export environment…'):capabilities.rigExport?say('書き出しは、このPCのBlenderで自動処理します。','Export runs automatically in Blender on this computer.'):say('FBX書き出しにはローカル起動とBlenderが必要です。','FBX export requires the local app and Blender.');
    const rigOption=$('#setupTask option[value="rig"]');rigOption.disabled=!advanced;
    if(!advanced&&$('#setupTask').value==='rig')$('#setupTask').value='springs';
  }
  window.addEventListener('languagechange',refresh);
  return {refresh,onStage:refresh,unload:()=>{},task:()=>$('#setupTask').value};
}
