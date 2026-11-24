import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {unpackProject,packProject,validateProject} from './public/project.mjs';
import {preflight,inputStamp,journey,checkResult,TASKS,stale} from './public/journey.mjs';
import {atomicWrite,writeProject,digest} from './scripts/project-write.mjs';
import {sameOrigin} from './server-jobs.mjs';
import {inspectMToonVRM} from './public/mtoon-vrm.mjs';
import {verifySavedSprings} from './server-spring-verification.mjs';
import {prepareReviewVRM} from './server-review.mjs';
import {currentReviewVRM,registerReviewVRM,finalizeVRM} from './public/review-vrm.mjs';
import {selectCandidate,candidateNeedsBranch,forkCandidate} from './public/production.mjs';
import {openExpressionLab} from './server-expression-authoring.mjs';

export function createSessionHandler(root,{directory=process.env.CHARAKIT_PROJECTS_ROOT||path.join(root,'projects'),stateFile=process.env.CHARAKIT_SESSION_FILE||path.join(root,'local','session.json'),syncTimeout=30000,verifySprings=verifySavedSprings,prepareReview=prepareReviewVRM}={}){
 let state={version:0,active:null,request:null},initializing=null,mutation=null;
 const saveState=()=>atomicWrite(stateFile,Buffer.from(JSON.stringify(state,null,2)));
 const activeFile=id=>{
  if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw Error('プロジェクトIDが不正です。');
  return path.join(directory,id,'project.charakit');
 };
 async function loadState(){
  try{state=JSON.parse(await fs.readFile(stateFile,'utf8'));if(state.active)state.active.path=activeFile(state.active.id);}
  catch(e){if(e.code!=='ENOENT')throw e;}
  if(['syncing','running','queued'].includes(state.request?.status)){state.request.status='failed';state.request.error='アプリが再起動しました。最新の状態を確認して、もう一度依頼してください。';await saveState();}
 }
 const initialize=()=>initializing??=loadState().catch(e=>{initializing=null;throw e;});
 async function body(req,max=1024**3){let size=0,chunks=[];for await(const b of req){size+=b.length;if(size>max)throw Error('ファイルが大きすぎます。');chunks.push(b);}return Buffer.concat(chunks);}
 const client=req=>{const id=req.headers['x-charakit-client'];if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(id))throw Error('アプリの接続を確認してください。');return id;};
 function writable(req){if(['syncing','running'].includes(state.request?.status))throw Error('エージェントの処理中です。完了を待ってください。');client(req);}
 function currentRequest(id){if(!state.request||state.request.id!==id)throw Error('この依頼は失効しました。アプリから依頼文をコピーし直してください。');return state.request;}
 async function workspace(p){
  const file=activeFile(p.id),folder=path.dirname(file);
  for(const name of ['images','models/candidates','models/segmented','models/parts','textures','work','exports'])await fs.mkdir(path.join(folder,name),{recursive:true});
  // The template contains runtime operating rules, not this repository's development rules.
  await fs.copyFile(path.join(root,'docs','project-AGENTS.md'),path.join(folder,'AGENTS.md'));
  return {file,folder};
 }
 async function persistProject(p,files,expected){
  const {file,folder}=await workspace(p),packed=await packProject(p,files);
  let old;try{old=await fs.readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(old&&expected!==digest(old))throw Error('保存先に新しい変更があります。再読み込みしてから続けてください。');
  await writeProject(file,new Uint8Array(await packed.blob.arrayBuffer()),{input:old?file:undefined,expected:old?expected:undefined});
  const bytes=await fs.readFile(file);
  state.active={id:p.id,name:p.name,path:file,hash:digest(bytes)};state.version++;await saveState();
  return {project:packed.project,path:file,directory:folder,hash:state.active.hash};
 }
 const snapshot=()=>({available:true,version:state.version,active:state.active,request:state.request,appRoot:root});
 return async function handle(req,res,pathname){
  if(!pathname.startsWith('/api/session'))return false;
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  let releaseMutation;
  try{
   if(!sameOrigin(req)){send(403,{error:'Local access only'});return true;}
   await initialize();
   // A polling client must only act on state after the current write releases its lock.
   if(req.method==='GET')while(mutation)await mutation;
   if(pathname==='/api/session'&&req.method==='GET'){
    if(state.request?.status==='syncing'&&Date.now()-state.request.syncAt>syncTimeout){state.request.status='failed';state.request.error='開いているアプリから最新状態を取得できませんでした。アプリを開いて依頼し直してください。';await saveState();}
    send(200,snapshot());return true;
   }
   if(pathname==='/api/session/file'&&req.method==='GET'){
    if(!state.active)throw Error('保存したプロジェクトはありません。');
    const bytes=await fs.readFile(state.active.path);
    await unpackProject(bytes);state.active.hash=digest(bytes);
    res.writeHead(200,{'Content-Type':'application/octet-stream','Cache-Control':'no-store'});res.end(bytes);return true;
   }
   if(req.method!=='POST'){send(404,{error:'Not found'});return true;}
   if(mutation){send(409,{error:'別の保存が実行中です。少し待って再試行してください。'});return true;}
   mutation=new Promise(resolve=>releaseMutation=resolve);
   if(pathname==='/api/session/expression-lab'){
    client(req);if(!state.active)throw Error('プロジェクトを保存してください。');
    const {project:p,files}=await unpackProject(await fs.readFile(state.active.path));
    send(200,await openExpressionLab(p,files,path.dirname(state.active.path)));return true;
   }
    if(pathname==='/api/session/select-candidate'){
     writable(req);const {project:p,files}=await unpackProject(await body(req)),source=req.headers['x-charakit-source'],id=req.headers['x-charakit-candidate'];
     if(!['head','body'].includes(source)||!p.production?.candidates[source]?.some(c=>c.id===id))throw Error('候補が見つかりません。');
     if(p.id!==state.active?.id)throw Error('現在のプロジェクトを保存してから候補を変更してください。');
     const branched=candidateNeedsBranch(p,source,id),next=branched?forkCandidate(p,source,id):structuredClone(p);
     if(!branched)selectCandidate(next,source,id);validateProject(next);
     let saved;
     if(branched){
      // Save live edits before creating the child. The original work/Blend stays in place.
      await persistProject(p,files,req.headers['x-charakit-hash']);
      saved=await persistProject(next,files);
     }else saved=await persistProject(next,files,req.headers['x-charakit-hash']);
     state.request=null;state.version++;await saveState();
     send(200,{...snapshot(),saved,branched});return true;
    }
    if(pathname==='/api/session/open-parent'){
     writable(req);await body(req,8192);if(!state.active)throw Error('現在のプロジェクトがありません。');
     const current=await fs.readFile(state.active.path);
     if(req.headers['x-charakit-hash']!==digest(current))throw Error('プロジェクトが更新されています。最新の状態を読み直してください。');
     const {project:p}=await unpackProject(current);if(!p.branch)throw Error('分岐元のプロジェクトがありません。');
     const file=activeFile(p.branch.parentId),bytes=await fs.readFile(file),{project:parent}=await unpackProject(bytes);
     state.active={id:parent.id,name:parent.name,path:file,hash:digest(bytes)};state.request=null;state.version++;await saveState();send(200,snapshot());return true;
    }
   if(pathname==='/api/session/prepare-review'){
    writable(req);const {project:p,files}=await unpackProject(await body(req));
    if(p.id!==state.active?.id)throw Error('現在のプロジェクトを保存してから確認してください。');
    if(!p.springSetup||p.workflow?.phase!=='springs')throw Error('骨・ウェイト・揺れものの設定後に全体を確認できます。');
    if(stale(p,'rig'))throw Error('変更した配置に合わせて骨・ウェイト・揺れものを設定してください。');
    if(req.headers['x-charakit-hash']!==digest(await fs.readFile(activeFile(p.id))))throw Error('プロジェクトが更新されています。最新の状態を読み直してください。');
    await prepareReview(root,p,files,path.dirname(activeFile(p.id)));
    const saved=await persistProject(p,files,req.headers['x-charakit-hash']);send(200,{...snapshot(),saved});return true;
   }
   if(pathname==='/api/session/export-vrm'){
    writable(req);const {metadata,projectId,reviewHash}=JSON.parse(await body(req,32768));
    if(metadata!==undefined&&(!metadata||typeof metadata!=='object'||Array.isArray(metadata)))throw Error('モデル情報を確認してください。');
    if(!state.active)throw Error('動作確認するモデルがありません。');
    const original=await fs.readFile(state.active.path),{project:p,files}=await unpackProject(original),review=currentReviewVRM(p);
    if(req.headers['x-charakit-hash']!==digest(original))throw Error('プロジェクトが更新されています。最新の状態を読み直してください。');
    if(!review)throw Error('現在のモデルの動作確認を準備してください。');
    if(projectId!==undefined&&projectId!==p.id||reviewHash!==undefined&&reviewHash!==review.sha256)throw Error('モデルが更新されました。書き出し画面を開き直してください。');
    const folder=path.dirname(state.active.path),blend=await fs.readFile(path.join(folder,'work/character.blend'));
    if(digest(blend)!==p.springSetup?.blendHash||p.springVerification.blendHash!==digest(blend))throw Error('揺れもの設定が更新されています。動作確認を準備し直してください。');
    const info=metadata??p.vrmMetadata??{},bytes=finalizeVRM(files.get(review.path),info);
    if(metadata!==undefined)p.vrmMetadata=structuredClone(metadata);
    await registerReviewVRM(p,files,bytes,{final:true,reviewedHash:review.sha256});journey(p).completed.finish=inputStamp(p,'finish');
    await atomicWrite(path.join(folder,'exports/avatar.blend'),blend);await atomicWrite(path.join(folder,'exports/avatar.vrm'),bytes);
    const saved=await persistProject(p,files,digest(original));send(200,{...snapshot(),saved});return true;
   }
   if(pathname==='/api/session/request'){
    writable(req);const kind=req.headers['x-charakit-task'];
    const p=req.headers['content-type']?.startsWith('application/json')?JSON.parse(await body(req,16*1024**2)):(await unpackProject(await body(req))).project;
    validateProject(p);const slot=req.headers['x-charakit-slot'],imageId=req.headers['x-charakit-image'],context=kind==='image-edit'?{slot,imageId,sha256:p.imageLibrary?.versions.find(v=>v.id===imageId)?.sha256}:undefined;preflight(p,kind,context);
    const request={id:randomUUID(),kind,projectId:p.id,stamp:inputStamp(p,kind,context),context,client:client(req),status:'queued',createdAt:new Date().toISOString()};
    state.request=request;await saveState();send(200,{...snapshot(),request});return true;
   }
   if(pathname==='/api/session/save'){
    writable(req);const {project:p,files}=await unpackProject(await body(req));
    const saved=await persistProject(p,files,req.headers['x-charakit-hash']);send(200,{...snapshot(),saved});return true;
   }
   if(pathname==='/api/session/open'){
    writable(req);const bytes=await body(req),{project:p}=await unpackProject(bytes),{file}=await workspace(p);
    let old;try{old=await fs.readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
    if(old&&digest(old)!==digest(bytes)&&req.headers['x-charakit-hash']!==digest(old))throw Error('同じプロジェクトの別の版が管理フォルダにあります。管理フォルダの project.charakit を開いてください。');
    if(!old||digest(old)!==digest(bytes))await writeProject(file,bytes,{input:old?file:undefined,expected:old?digest(old):undefined});
    state.active={id:p.id,name:p.name,path:file,hash:digest(bytes)};state.version++;state.request=null;await saveState();send(200,snapshot());return true;
   }
   if(pathname==='/api/session/start'){
    const {id}=JSON.parse(await body(req,8192)),r=currentRequest(id);
    if(r.status!=='queued')throw Error('この依頼は開始済みか失効しています。');
    r.status='syncing';r.syncNonce=randomUUID();r.syncAt=Date.now();await saveState();send(202,snapshot());return true;
   }
   if(pathname==='/api/session/checkpoint'){
    const r=currentRequest(req.headers['x-charakit-request']);
    if(r.status!=='syncing'||r.client!==client(req)||req.headers['x-charakit-nonce']!==r.syncNonce)throw Error('保存要求が一致しません。');
    const {project:p,files}=await unpackProject(await body(req));
    if(p.id!==r.projectId||inputStamp(p,r.kind,r.context)!==r.stamp){r.status='failed';r.error='確認後に素材・候補・配置が変わりました。現在の内容を確認して依頼し直してください。';await saveState();throw Error(r.error);}
    preflight(p,r.kind,r.context);journey(p).confirmed[r.kind]=r.stamp;
    if(r.kind==='candidates'){
     delete p.production;delete p.rigGuide;delete p.weightTransferPlan;p.mode='parts';p.updatedModel=null;
     p.assets=p.assets.filter(a=>a.role==='reference');p.imageLibrary.modelSources={};p.workflow={version:1,rigging:'tripo',phase:'parts',attachHair:false,boneMap:{}};
    }
    if(r.kind==='rig'){p.mode='parts';p.updatedModel=null;delete p.rigGuide;p.workflow={version:1,rigging:'tripo',phase:'parts',attachHair:false,boneMap:{}};}
    if(r.kind==='materials')p.production.requireSegmentation=true;
    if(['candidates','materials','rig'].includes(r.kind)){delete p.springSetup;delete p.springVerification;delete p.reviewVRM;delete p.vrmExport;}
    const saved=await persistProject(p,files,req.headers['x-charakit-hash']);
    r.status='running';r.path=saved.path;r.directory=saved.directory;r.startedAt=new Date().toISOString();delete r.syncNonce;await saveState();send(200,snapshot());return true;
   }
   if(pathname==='/api/session/progress'){
    const {id,message}=JSON.parse(await body(req,8192)),r=currentRequest(id);if(r.status!=='running')throw Error('処理は実行中ではありません。');
    r.message=String(message||'').slice(0,500);await saveState();send(200,snapshot());return true;
   }
   if(pathname==='/api/session/fail'){
    const {id,message}=JSON.parse(await body(req,8192)),r=currentRequest(id);
    if(!['queued','syncing','running'].includes(r.status))throw Error('依頼は終了しています。');
    r.status='failed';r.error=String(message||'処理が中断しました。').slice(0,1000);await saveState();send(200,snapshot());return true;
   }
   if(pathname==='/api/session/complete'){
    const {id}=JSON.parse(await body(req,8192)),r=currentRequest(id);if(r.status!=='running')throw Error('この依頼は実行中ではありません。');
    const bytes=await fs.readFile(r.path),{project:p,files}=await unpackProject(bytes);
    if(p.id!==r.projectId||inputStamp(p,r.kind,r.context)!==r.stamp)throw Error('依頼した入力と結果が一致しません。');
    checkResult(p,r.kind,r.context);
    if(r.kind==='finish'){
     for(const name of ['avatar.vrm','avatar.blend'])if(!(await fs.stat(path.join(r.directory,'exports',name))).isFile())throw Error('完成VRMと編集用Blendをexportsへ保存してください。');
     inspectMToonVRM(await fs.readFile(path.join(r.directory,'exports','avatar.vrm')));
    }
    if(r.kind==='rig'){
     r.message='物理・MToon・テクスチャの動作確認を準備しています。';await saveState();
     await prepareReview(root,p,files,r.directory);
    }
    if(r.kind==='finish'){
     r.message='部位ごとの揺れもの設定を検査しています。';await saveState();
     const report=await verifySprings(root,p,r.directory,r.kind);
     p.springVerification={version:1,blendHash:report.blendHash,...(report.vrmHash?{vrmHash:report.vrmHash}:{}),targets:report.targets,runtime:report.runtime};
     await registerReviewVRM(p,files,await fs.readFile(path.join(r.directory,'exports/avatar.vrm')));
    }
    journey(p).completed[r.kind]=r.stamp;
    await persistProject(p,files,digest(bytes));r.status='complete';r.completedAt=new Date().toISOString();await saveState();send(200,snapshot());return true;
   }
   send(404,{error:'Not found'});
  }catch(e){send(e.code==='ENOENT'?404:409,{error:e.message});}
  finally{if(releaseMutation){mutation=null;releaseMutation();}}
  return true;
 };
}
