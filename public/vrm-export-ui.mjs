import {currentReviewVRM,vrmMetadata,finalizeVRM,registerReviewVRM} from './review-vrm.mjs';
import {say} from './i18n.mjs';

export function initVRMExportUI(hooks){
  const dialog=document.createElement('dialog');dialog.id='vrmMetadataDialog';
  dialog.innerHTML=`<form id="vrmMetadataForm"><div class="dialog-top"><h2 data-ja="VRMの書き出し" data-en="Export VRM"></h2><button type="button" id="closeVRMMetadata" aria-label="Close">×</button></div>
    <p class="small-note" data-ja="書き出すVRMのモデル情報を確認してください。入力した情報はプロジェクトに保存し、次回の書き出しで再利用します。" data-en="Confirm the model information for your VRM. It is saved with the project and reused for future exports."></p>
    <label class="field"><span data-ja="モデル名" data-en="Model name"></span><input name="name" required maxlength="200"></label>
    <label class="field"><span data-ja="作者名（複数の場合は改行）" data-en="Authors (one per line)"></span><textarea name="authors" required rows="2" maxlength="2000"></textarea></label>
    <label class="field"><span data-ja="バージョン" data-en="Version"></span><input name="version" maxlength="200"></label>
    <details><summary data-ja="利用条件" data-en="Usage conditions"></summary>
      <label class="field"><span data-ja="アバターとして使用できる人" data-en="Avatar permission"></span><select name="avatarPermission"><option value="onlyAuthor" data-ja="作者のみ" data-en="Author only"></option><option value="onlySeparatelyLicensedPerson" data-ja="別途許可した人" data-en="Separately licensed people"></option><option value="everyone" data-ja="誰でも" data-en="Everyone"></option></select></label>
      <label class="field"><span data-ja="商用利用" data-en="Commercial usage"></span><select name="commercialUsage"><option value="personalNonProfit" data-ja="個人の非営利利用" data-en="Personal non-profit"></option><option value="personalProfit" data-ja="個人の営利利用" data-en="Personal profit"></option><option value="corporation" data-ja="法人利用を含む" data-en="Including corporations"></option></select></label>
      <label class="field"><span data-ja="クレジット表記" data-en="Credit notation"></span><select name="creditNotation"><option value="required" data-ja="必要" data-en="Required"></option><option value="unnecessary" data-ja="不要" data-en="Unnecessary"></option></select></label>
      <label class="field"><span data-ja="改変" data-en="Modification"></span><select name="modification"><option value="prohibited" data-ja="不可" data-en="Prohibited"></option><option value="allowModification" data-ja="改変可" data-en="Allowed"></option><option value="allowModificationRedistribution" data-ja="改変と再配布可" data-en="Modification and redistribution"></option></select></label>
      <label class="switch-row"><input name="allowRedistribution" type="checkbox"><span data-ja="再配布を許可" data-en="Allow redistribution"></span></label>
      <label class="switch-row"><input name="allowExcessivelyViolentUsage" type="checkbox"><span data-ja="過度な暴力表現での利用を許可" data-en="Allow excessive violence"></span></label>
      <label class="switch-row"><input name="allowExcessivelySexualUsage" type="checkbox"><span data-ja="過度な性的表現での利用を許可" data-en="Allow excessive sexual content"></span></label>
      <label class="switch-row"><input name="allowPoliticalOrReligiousUsage" type="checkbox"><span data-ja="政治・宗教目的での利用を許可" data-en="Allow political or religious use"></span></label>
      <label class="switch-row"><input name="allowAntisocialOrHateUsage" type="checkbox"><span data-ja="反社会的・憎悪表現での利用を許可" data-en="Allow antisocial or hate content"></span></label>
      <label class="field"><span data-ja="追加の利用条件URL" data-en="Additional license URL"></span><input name="otherLicenseUrl" type="url" maxlength="2000"></label>
    </details><p id="vrmMetadataError" class="small-note" role="alert"></p><div class="dialog-actions"><button type="button" id="cancelVRMExport" data-ja="キャンセル" data-en="Cancel"></button><button type="submit" class="primary" data-ja="登録して書き出す" data-en="Save information and export"></button></div></form>`;
  document.body.append(dialog);const form=dialog.querySelector('form');let sourceID='',sourceHash='',submitting=false;
  function labels(){for(const el of dialog.querySelectorAll('[data-ja]'))el.textContent=say(el.dataset.ja,el.dataset.en);}
  function open(){
    if(submitting||hooks.get().busy||dialog.open)return;
    const {project:p,files}=hooks.get(),record=currentReviewVRM(p);if(!record){hooks.toast(say('先に骨・ウェイト・揺れものの設定を完了してください。','Complete rig and spring setup first.'));return;}
    const meta={...vrmMetadata(files.get(record.path)),...p.vrmMetadata};sourceID=p.id;sourceHash=record.sha256;
    for(const input of form.querySelectorAll('[name]')){
      const value=meta[input.name];if(input.type==='checkbox')input.checked=value===true;
      else if(input.name==='authors')input.value=(Array.isArray(meta.authors)?meta.authors:[]).filter(s=>typeof s==='string'&&s!=='__CHARAKIT_REVIEW__').join('\n');
      else if(input.name==='name')input.value=p.vrmMetadata?.name||p.name;
      else if(input.tagName==='SELECT')input.value=value??input.options[0].value;
      else input.value=value??'';
    }
    dialog.querySelector('#vrmMetadataError').textContent='';labels();dialog.showModal();
  }
  for(const id of ['closeVRMMetadata','cancelVRMExport'])dialog.querySelector('#'+id).onclick=()=>{if(!submitting)dialog.close();};
  dialog.addEventListener('cancel',e=>{if(submitting)e.preventDefault();});
  form.onsubmit=async e=>{
    e.preventDefault();if(submitting)return;const {project:p,files}=hooks.get(),record=currentReviewVRM(p);
    if(p.id!==sourceID||record?.sha256!==sourceHash){dialog.querySelector('#vrmMetadataError').textContent=say('モデルが更新されました。情報を開き直してください。','The model changed. Reopen this form.');return;}
    const metadata={};for(const input of form.querySelectorAll('[name]'))metadata[input.name]=input.type==='checkbox'?input.checked:input.name==='authors'?input.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean):input.value;
    try{finalizeVRM(files.get(record.path),metadata);}catch(error){dialog.querySelector('#vrmMetadataError').textContent=error.message;return;}
    submitting=true;const buttons=[...dialog.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);dialog.querySelector('#vrmMetadataError').textContent='';
    try{
      const ok=await hooks.task(say('VRMを保存しています…','Saving VRM…'),async()=>{
        try{
          let bytes;
          if(hooks.session()?.available)bytes=await hooks.session().exportVRM(metadata,{projectId:sourceID,reviewHash:sourceHash});
          else{const next=structuredClone(p),nextFiles=new Map(files);bytes=finalizeVRM(files.get(record.path),metadata);next.vrmMetadata=metadata;await registerReviewVRM(next,nextFiles,bytes,{final:true,reviewedHash:record.sha256});await hooks.commit(next,nextFiles);}
          const name=(p.name||'avatar').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100)+'.vrm';hooks.download(new Blob([bytes],{type:'application/octet-stream'}),name);
        }catch(error){dialog.querySelector('#vrmMetadataError').textContent=error.message;throw error;}
      });if(ok)dialog.close();
    }finally{submitting=false;buttons.forEach(b=>b.disabled=false);}
  };
  window.addEventListener('vrm-export',open);window.addEventListener('languagechange',labels);
  return {open,exportVRM:open};
}
