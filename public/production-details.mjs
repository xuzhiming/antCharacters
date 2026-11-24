import {beginProduction,removeCandidate,setClassification} from './production.mjs';
import {addCandidate,addReturn} from './production-files.mjs';
import {requestProduction} from './production-job.mjs';
import {parseModel,normalizeAsset,disposeModel} from './models.mjs';
import {zipStore} from './archive.mjs';
import {say} from './i18n.mjs';

export function initProductionDetails(hooks){
 const {get,task,commit,request,chooseFBX,download,toast}=hooks;
  const panel=document.createElement('section');panel.id='productionPanel';panel.className='production-panel';
 const legacy=document.createElement('details');legacy.id='legacyAssets';const summary=document.createElement('summary');legacy.append(summary);const slots=document.querySelector('#assetSlots');slots.before(panel,legacy);legacy.append(slots);
 const rigButton=document.createElement('button');rigButton.id='requestTripoRig';rigButton.className='primary wide';rigButton.onclick=()=>request('tripo-rig');document.querySelector('[data-panel="rig"] .form-content').prepend(rigButton);
 const css=document.createElement('style');css.textContent='.production-panel{display:grid;gap:12px;margin-bottom:16px}.production-panel h2{font-size:15px;margin:0}.production-panel h3{font-size:13px;margin:8px 0}.production-panel p{margin:0;font-size:12px;line-height:1.6}.production-row{display:grid;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)}.production-actions{display:flex;gap:6px;flex-wrap:wrap}.production-actions button{flex:1}.production-panel select{width:100%}.production-row small{overflow-wrap:anywhere}.production-row .adopted{font-weight:700}.production-panel button,.production-panel .file-button{white-space:normal}.production-panel progress{width:100%}';document.head.append(css);
 const node=(tag,text,parent=panel)=>{const el=document.createElement(tag);if(text)el.textContent=text;parent.append(el);return el;};
 const button=(text,action,parent=panel)=>{const b=node('button',text,parent);b.type='button';b.onclick=action;return b;};
 const input=(label,accept,action,parent=panel)=>{const el=node('label',label,parent);el.className='file-button';el.tabIndex=0;const f=node('input','',el);f.type='file';f.accept=accept;f.hidden=true;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();f.click();}};f.onchange=()=>{const file=f.files[0];f.value='';if(file)task(say('素材を読み込んでいます…','Importing…'),()=>action(file));};return f;};
 const edit=async fn=>{const {project,files}=get(),p=structuredClone(project),f=new Map(files);await fn(p,f);await commit(p,f);};
 const run=operation=>task(say('部位を処理しています…','Processing parts…'),async()=>{const {project,files}=get();const next=await requestProduction(project,files,operation);await commit(next.project,next.files);if(operation==='assemble')hooks.setStage('placement');toast(say('処理が完了しました。','Processing complete.'));});
 const downloadModel=d=>{const {files}=get(),entries={};for(const r of [d,...d.resources||[]])entries[r.path.split('/').pop()]=files.get(r.path);download(d.resources?.length?zipStore(entries):new Blob([files.get(d.path)]),d.resources?.length?d.filename.replace(/\.fbx$/i,'.zip'):d.filename);};
 let capabilities=null;
 fetch('/api/capabilities').then(r=>r.json()).then(c=>{capabilities=c;render();}).catch(()=>{capabilities={production:false};render();});
 function render(){
  const {project:p}=get(),w=p.production;panel.replaceChildren();
  summary.textContent=say(w?'個別モデルを読み込む（従来の工程）':'既存の頭・髪・体を読み込む',w?'Import separate models (legacy)':'Import existing head, hair and body');
  legacy.hidden=!!w;legacy.open=!w&&p.assets.some(a=>['body','hair','head_neutral'].includes(a.role));
  // Candidate selection is a user action. Agents register candidates but do not adopt them.
  node('h2',say('Tripoで3Dを作る','Create 3D with Tripo'));
  node('p',say('頭（髪込み）とTポーズの体から各4候補。P2.0・四角面25,000。','4 candidates each: head with hair and T-pose body. P2.0 · 25,000 quads.'));
  const generate=button(say('生成をエージェントに依頼','Ask agent to generate'),()=>task(say('依頼を準備しています…','Preparing request…'),async()=>{await edit(p=>{beginProduction(p);});request('tripo-generate');}));generate.className='primary wide';generate.id='requestTripoGenerate';
  const candidateDetails=node('details');candidateDetails.open=!w?.components.length;node('summary',say(w?.components.length?'採用候補を確認・変更':'候補を比較して採用',w?.components.length?'Review or change selected candidates':'Compare and select candidates'),candidateDetails);
  const candidateList=node('div','',candidateDetails);
  for(const source of ['head','body']){
   node('h3',say(source==='head'?'頭・髪の候補':'体・衣装の候補',source==='head'?'Head and hair candidates':'Body candidates'),candidateList);
   for(const c of w?.candidates[source]||[]){
    const row=node('div','',candidateList);row.className='production-row';const adopted=w.selected[source]===c.id;
    const name=node('small',(adopted?say('採用中 · ','Selected · '):'')+c.name,row);name.className=adopted?'adopted':'';name.setAttribute('translate','no');
    const actions=node('div','',row);actions.className='production-actions';
    button(say('候補を確認・選び直す','Review or change candidate'),()=>hooks.openCandidates(source,c.id),actions);
    const remove=button(say('候補から外す','Remove candidate'),()=>task(say('候補を更新しています…','Updating candidates…'),async()=>{if(adopted&&w.components.length&&!confirm(say('この採用候補を外すと、部位分類からやり直します。続けますか？','Removing this selected candidate resets classification. Continue?')))return;await edit(p=>removeCandidate(p,source,c.id));}),row);remove.disabled=adopted&&!!w.textureGroups.some(g=>g.returned);
   }
   if((w?.candidates[source].length||0)<4){const f=input(say('候補FBX / ZIPを追加','Add candidate FBX / ZIP'),'.fbx,.zip',async file=>{const data=await chooseFBX(file);await edit(async(p,f)=>{
    const tempFiles=new Map([[data.name,data.data],...data.resources.map(r=>[r.name,r.data])]);
    const root=await parseModel(data.data,{path:data.name,resources:data.resources.map(r=>({path:r.name})),files:tempFiles});
    let normalization;try{normalization=normalizeAsset(root,source==='body'?'body':'head_neutral');}finally{disposeModel(root);}
    await addCandidate(p,f,source,data,normalization,file.name);
   });},candidateList);f.id='candidate-'+source;}
  }
  if(w){
   node('h3',say('部位の分離と分類','Separate and classify parts'));
   const analyze=button(say(w.components.length?'採用モデルを分離し直す':'採用モデルを分離する',w.components.length?'Separate candidates again':'Separate selected candidates'),()=>{
    if(w.components.length&&!confirm(say('分類と再テクスチャの登録をリセットします。続けますか？','Reset classification and texture returns?')))return;run('analyze');
   });analyze.id='analyzeParts';analyze.disabled=!w.selected.head||!w.selected.body||capabilities?.production===false;
   if(capabilities?.production===false)node('p',say('部位の処理は、ローカル起動とBlenderが必要です。','Part processing requires the local app and Blender.'));
   if(w.components.length){
    node('p',say(`${w.components.length}個の独立した部品。テクスチャ用と揺れ物用を別々に分類します。`,`${w.components.length} loose components. Classify texture and spring groups independently.`));
    const select=node('select');select.hidden=w.phase==='assembled';select.setAttribute('aria-label',say('確認する部品','Inspect component'));node('option',say('全体を表示','Show all'),select).value='';
    for(const c of w.components)node('option',`${c.id} · ${c.faces} faces · ${c.role}`,select).value=c.id;
    select.onchange=()=>hooks.isolate(select.value);
    button(say('分類をエージェントに依頼','Ask agent to classify'),()=>request('tripo-classify')).id='requestClassification';
    const details=node('details');node('summary',say('分類データを読み込む','Import classification'),details);
    input(say('分類JSONを選ぶ','Choose classification JSON'),'.json',async file=>{const data=JSON.parse(await file.text());await edit(p=>setClassification(p,data.classification||data));},details).id='classificationFile';
    button(say('分類JSONを書き出す','Export classification JSON'),()=>download(new Blob([JSON.stringify({roles:Object.fromEntries(w.components.map(c=>[c.id,c.role])),textureGroups:w.textureGroups.map(({id,name,components})=>({id,name,components})),springGroups:w.springGroups},null,2)],{type:'application/json'}),'classification.json'),details);
   }
   if(w.textureGroups.length){
    node('h3',say(`テクスチャ ${w.textureGroups.length} / ${w.settings.maxTextures}枚 · 4K`,`Textures ${w.textureGroups.length} / ${w.settings.maxTextures} · 4K`));
    node('p',say(`揺れ物は別に${w.springGroups.length}グループ保存しています。`,`Spring groups stored separately: ${w.springGroups.length}.`));
    const prepare=button(say('部位FBXと参照ガイドを書き出す','Prepare part FBXs and guides'),()=>{
     if(w.textureGroups.some(g=>g.returned)&&!confirm(say('再テクスチャ済みFBXの登録をリセットします。続けますか？','Reset returned textures and prepare again?')))return;run('prepare');
    });prepare.disabled=capabilities?.production===false;prepare.id='prepareTextures';
    const texture=button(say('Smart UV・再テクスチャを依頼','Request Smart UV and textures'),()=>request('tripo-texture'));texture.disabled=w.textureGroups.some(g=>!g.prepared);texture.id='requestTripoTextures';
    for(const g of w.textureGroups){
     const row=node('div');row.className='production-row';node('strong',g.name,row).setAttribute('translate','no');node('small',g.returned?say('再テクスチャ済み','Texture returned'):g.prepared?say('Tripoへ送る準備ができました','Ready for Tripo'):say('書き出し待ち','Awaiting preparation'),row);
     if(g.prepared){
      button(say('部位FBXを保存','Save part FBX'),()=>downloadModel(g.prepared),row);
      const guideFiles=[...Object.values(g.guides||{}),...Object.values(g.references||{})];
      if(guideFiles.length)button(say('ガイド・素材画像を保存','Save guides and references'),()=>download(zipStore(Object.fromEntries(guideFiles.map((d,i)=>[`${i+1}-${d.filename}`,get().files.get(d.path)]))),g.id+'-references.zip'),row);
      input(say('再生成済みFBX / ZIP','Returned FBX / ZIP'),'.fbx,.zip',async file=>{const data=await chooseFBX(file);await edit((p,f)=>addReturn(p,f,g.id,data));},row).dataset.textureGroup=g.id;
     }
    }
    const assemble=button(say('元の位置・大きさへ組み立てる','Restore and assemble parts'),()=>run('assemble'));assemble.id='assembleParts';assemble.className='primary wide';assemble.disabled=w.textureGroups.some(g=>!g.returned)||capabilities?.production===false;
    if(w.phase==='assembled')node('p',say('組み立て済みです。「配置」で頭と体を合わせてください。','Assembled. Adjust the head and body in Placement.'));
   }
  }
  rigButton.textContent=say('Tripoでのリギングをエージェントに依頼','Ask agent to rig in Tripo');rigButton.disabled=!!w&&w.phase!=='assembled'||!['body','head_neutral'].every(role=>p.assets.some(a=>a.role===role));
 }
 window.addEventListener('preview-project',()=>queueMicrotask(render));window.addEventListener('languagechange',render);render();
 return {render};
}
