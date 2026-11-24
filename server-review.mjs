import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {findBlender} from './server-jobs.mjs';
import {digest,atomicWrite} from './scripts/project-write.mjs';
import {registerReviewVRM} from './public/review-vrm.mjs';
import {verifySavedSprings} from './server-spring-verification.mjs';

export async function prepareReviewVRM(root,p,files,directory){
  const placement=p.placements?.assembled;
  if(p.mode!=='assembled'||p.workflow?.attachHair||placement&&(placement.scale!==1||[...placement.position,...placement.rotation].some(v=>Math.abs(v)>1e-8)))throw Error('配置変更を反映した骨・ウェイト・揺れもの設定を準備してください。');
  const blend=path.join(directory,'work/character.blend'),before=await fs.readFile(blend);
  const modelHash=p.assets.find(a=>a.path===p.updatedModel?.path)?.sha256;
  if(p.springSetup?.blendHash!==digest(before)||p.springSetup?.modelHash!==modelHash)throw Error('現在のモデルに合う揺れもの設定を準備してください。');
  const blender=await findBlender();if(!blender)throw Error('動作確認の準備にはBlenderが必要です。');
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'charakit-review-'));
  try{
    const output=path.join(folder,'review.vrm');
    await new Promise((resolve,reject)=>{
      const child=spawn(blender,['--background','--disable-autoexec',blend,'--python-exit-code','1','--python',path.join(root,'scripts/export-review.py'),'--','--output',output],{windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
      let log='';const collect=b=>log=(log+b).slice(-4000);child.stdout.on('data',collect);child.stderr.on('data',collect);
      const timer=setTimeout(()=>{child.kill();reject(Error('動作確認の準備が制限時間を超えました。'));},180000);
      child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('動作確認用VRMを準備できません。\n'+log));});
    });
    if(digest(await fs.readFile(blend))!==digest(before))throw Error('準備中にモデルが更新されました。再確認してください。');
    const bytes=await fs.readFile(output);
    await atomicWrite(path.join(directory,'work/review.vrm'),bytes);
    const report=await verifySavedSprings(root,p,directory,'review');
    const r=await registerReviewVRM(p,files,bytes);
    if(report.vrmHash!==r.sha256)throw Error('確認用VRMの検査結果が一致しません。');
    p.springVerification={version:1,blendHash:report.blendHash,vrmHash:report.vrmHash,targets:report.targets,runtime:report.runtime};
    return r;
  }finally{await fs.rm(folder,{recursive:true,force:true,maxRetries:3,retryDelay:100});}
}
