import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {findBlender} from './server-jobs.mjs';
import {digest} from './scripts/project-write.mjs';

// Read the saved Blend in an isolated process; never trust a phase or a report
// written by the agent. No autoexec, production saves, GPU or external service.
export async function verifySavedSprings(root,project,directory,kind){
 const blender=await findBlender();if(!blender)throw Error('揺れものの確認にはBlenderが必要です。');
 const blend=path.join(directory,kind==='finish'?'exports/avatar.blend':'work/character.blend');
 const before=await fs.readFile(blend);
 if(kind==='rig'||kind==='review'){
  const asset=project.assets.find(a=>a.path===project.updatedModel?.path);
  if(project.springSetup?.blendHash!==digest(before)||project.springSetup?.modelHash!==asset?.sha256)throw Error('揺れものを保存したBlendと確認用FBXをupdate-model.mjsで一緒に登録してください。');
 }
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'charakit-spring-audit-'));
 try{
  const reportFile=path.join(folder,'audit.json');
  await new Promise((resolve,reject)=>{
   const child=spawn(blender,['--background','--disable-autoexec',blend,'--python-exit-code','1','--python',path.join(root,'scripts/spring-setup.py'),'--','audit',reportFile],{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
   let log='';const collect=d=>log=(log+d).slice(-4000);child.stdout.on('data',collect);child.stderr.on('data',collect);
   const timer=setTimeout(()=>{child.kill();reject(Error('揺れものの検査が制限時間を超えました。'));},180000);
   child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('揺れものの設定を確認してください。\n'+log));});
  });
  const report=JSON.parse(await fs.readFile(reportFile,'utf8'));
  if(report.blendHash!==digest(before)||digest(await fs.readFile(blend))!==digest(before))throw Error('検査中にBlendが更新されました。再検査してください。');
  const {verifyExportSprings}=await import('./scripts/verify-springs.mjs');
  const {checkSpringCoverage,expectedSpringSources}=await import('./public/spring-physics.mjs');
  checkSpringCoverage(report.plan,expectedSpringSources(project));
  if(kind==='finish'||kind==='review'){
   const vrmFile=path.join(directory,kind==='finish'?'exports/avatar.vrm':'work/review.vrm');
   const bytes=await fs.readFile(vrmFile);
   report.runtime=await verifyExportSprings(bytes,report.plan);
   report.vrmHash=digest(bytes);
   if(digest(await fs.readFile(vrmFile))!==report.vrmHash)throw Error('検査中にVRMが更新されました。');
  }
  return report;
 }finally{await fs.rm(folder,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
}
