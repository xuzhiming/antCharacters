import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {weightDonor} from './server-config.mjs';
import {packWeightResult} from './server-weight-result.mjs';
import {unpackProject} from './public/project.mjs';
import {transferPreflight} from './public/weight-plan.mjs';
import {productionPreflight} from './public/production.mjs';
import {packProductionResult} from './server-production.mjs';

const root=path.dirname(fileURLToPath(import.meta.url)),jobs=new Map();
let accepting=false;
const MAX_BYTES=1024**3;
export async function findBlender(){
 const candidates=[process.env.BLENDER];
 if(process.platform==='win32')for(const version of ['5.2','5.1','5.0','4.5','4.2'])candidates.push(path.join(process.env.ProgramFiles||'C:/Program Files','Blender Foundation',`Blender ${version}`,'blender.exe'));
 else if(process.platform==='darwin')candidates.push('/Applications/Blender.app/Contents/MacOS/Blender');
 for(const directory of (process.env.PATH||'').split(path.delimiter))if(directory)candidates.push(path.join(directory,process.platform==='win32'?'blender.exe':'blender'));
 for(const candidate of candidates.filter(Boolean))try{if((await fs.stat(candidate)).isFile())return candidate;}catch{}
 return null;
}
export function sameOrigin(req){
 const host=req.headers.host;
 return !!host&&/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)&&(!req.headers.origin||req.headers.origin===`http://${host}`);
}
async function readBody(req){
 if(Number(req.headers['content-length'])>MAX_BYTES)throw Error('キットは1GB以内にしてください。');
 const chunks=[];let total=0;
 for await(const chunk of req){total+=chunk.length;if(total>MAX_BYTES)throw Error('キットは1GB以内にしてください。');chunks.push(chunk);}
 if(total<4)throw Error('プロジェクトが空です。');return Buffer.concat(chunks);
}
function cleanup(job){
 const resolved=path.resolve(job.directory);
 if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('charakit-job-'))return;
 fs.rm(resolved,{recursive:true,force:true}).catch(()=>{});jobs.delete(job.id);
}
function runJob(job,blender,args){
 const child=spawn(blender,['--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',...args],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
 job.child=child;
 const collect=data=>{job.log=(job.log+data.toString()).slice(-8000);};child.stdout.on('data',collect);child.stderr.on('data',collect);
 const timer=setTimeout(()=>{job.status='failed';job.error='処理が制限時間を超えました。';child.kill();},job.kind==='export-rig'?180000:600000);
 let finished=false;
 const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);setTimeout(()=>cleanup(job),1800000).unref();};
 child.on('error',e=>{job.status='failed';job.error=e.message;finish();});
 child.on('close',async code=>{
  clearTimeout(timer);
  if(job.status==='failed'){finish();return;}
  try{
   if(code!==0)throw Error(job.log.slice(-2500)||'Blender processing failed');
   const result=JSON.parse(await fs.readFile(path.join(job.directory,job.kind==='export-rig'?'head-body.json':'result.json'),'utf8'));
   if(job.kind==='transfer-weights')await packWeightResult(job.directory,result);
   if(job.kind.startsWith('production-'))await packProductionResult(job.directory,result);
   job.result=result;job.status='ready';
  }catch(e){job.status='failed';job.error=e.message;}
  finish();
 });
}
export async function handleJobRequest(req,res,pathname){
 if(!pathname.startsWith('/api/'))return false;
 const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 if(!sameOrigin(req)){send(403,{error:'Local same-origin requests only'});return true;}
 try{
  if(pathname==='/api/capabilities'&&req.method==='GET'){
   const blender=await findBlender();let donor=false;try{donor=!!await weightDonor();}catch{}
   send(200,{rigExport:!!blender,weightTransfer:!!blender&&donor,production:!!blender});return true;
  }
  const kind=/^\/api\/(export-rig|transfer-weights|production-(analyze|prepare|assemble))$/.test(pathname)?pathname.slice(5):null;
  if(kind&&req.method==='POST'){
   if(accepting||[...jobs.values()].some(j=>j.status==='running')){send(409,{error:'別の処理が実行中です。'});return true;}
   accepting=true;let job;
   try{
    const blender=await findBlender();if(!blender){send(503,{error:'Blenderが見つかりません。BLENDER環境変数で実行ファイルを指定してください。'});return true;}
    const donor=kind==='transfer-weights'?await weightDonor():null;
    const bytes=await readBody(req);
    if(donor){const {project}=await unpackProject(bytes);transferPreflight(project);}
    if(kind.startsWith('production-')){const {project}=await unpackProject(bytes);productionPreflight(project,kind.slice(11));}
    if(kind==='export-rig'){const {project}=await unpackProject(bytes);if(project.production&&project.production.phase!=='assembled')throw Error('部位を組み立ててからリギングへ進んでください。');}
    job={id:randomUUID(),kind,status:'running',directory:await fs.mkdtemp(path.join(os.tmpdir(),'charakit-job-')),log:''};jobs.set(job.id,job);
    await fs.writeFile(path.join(job.directory,'input.charakit'),bytes,{flag:'wx'});
    let args;
    if(donor){const config=path.join(job.directory,'job.json');await fs.writeFile(config,JSON.stringify({donor}),{flag:'wx'});args=[path.join(root,'scripts/transfer-weights.py'),'--',config];}
    else if(kind.startsWith('production-'))args=[path.join(root,'scripts/production.py'),'--',kind.slice(11),path.join(job.directory,'input.charakit'),job.directory];
    else args=[path.join(root,'scripts/export-rig.py'),'--',path.join(job.directory,'input.charakit'),path.join(job.directory,'head-body.fbx')];
    runJob(job,blender,args);send(202,{id:job.id,status:job.status});return true;
   }catch(e){if(job)cleanup(job);throw e;}finally{accepting=false;}
  }
  const match=pathname.match(/^\/api\/(export-rig|transfer-weights|production-(?:analyze|prepare|assemble))\/([a-f0-9-]{36})(\/(file|blend|donor))?$/);
  const job=match&&jobs.get(match[2]);
  if(!job||job.kind!==match[1]||req.method!=='GET'){send(404,{error:'処理が見つかりません。'});return true;}
  if(match[3]){
   if(job.status!=='ready'){send(409,{error:'処理が完了していません。'});return true;}
   const names=job.kind==='transfer-weights'?{file:'result.charakit',blend:'weighted.blend',donor:'fitted-donor.fbx'}:job.kind.startsWith('production-')?{file:'result.charakit',...(job.kind==='production-assemble'?{blend:'assembly.blend'}:{})}:{file:'head-body.fbx'},name=names[match[4]];
   if(!name){send(404,{error:'ファイルが見つかりません。'});return true;}
   const bytes=await fs.readFile(path.join(job.directory,name));res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);
  }else send(200,{id:job.id,status:job.status,error:job.error,result:job.result});
 }catch(e){if(!res.headersSent)send(400,{error:e.message});}
 return true;
}
