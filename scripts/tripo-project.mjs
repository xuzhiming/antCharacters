// Register agent results or run geometry jobs. Always writes a new kit (wx).
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {unpackProject,packProject} from '../public/project.mjs';
import {setClassification,productionPreflight} from '../public/production.mjs';
import {addCandidate,addReturn,addReference,addSegmented} from '../public/production-files.mjs';
import {writeProject,digest} from './project-write.mjs';
import {findBlender} from '../server-jobs.mjs';
import {packProductionResult} from '../server-production.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
async function blender(args){
 const executable=await findBlender();if(!executable)throw Error('Blender is required. Set BLENDER to its executable.');
 await new Promise((resolve,reject)=>{const child=spawn(executable,['--background','--factory-startup','--disable-autoexec','--python-exit-code','1','--python',path.join(root,'scripts/production.py'),'--',...args],{shell:false,windowsHide:true,stdio:['ignore','inherit','inherit']});const timer=setTimeout(()=>{child.kill();reject(Error('Blender timed out'));},600000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('Blender failed: '+code));});});
}
async function run(){
 const [configFile,output]=process.argv.slice(2);if(!configFile||!output)throw Error('Usage: node scripts/tripo-project.mjs CONFIG.json NEW.charakit');
 const config=JSON.parse(await fs.readFile(configFile,'utf8')),base=path.dirname(path.resolve(configFile));
 const resolve=name=>path.resolve(base,name),source=resolve(config.input);
 const original=await fs.readFile(source),{project:p,files}=await unpackProject(original);
 const save=(bytes,assembly)=>writeProject(output,bytes,{input:source,expected:path.resolve(output)===source?digest(original):undefined,assembly});
 const model=async spec=>({name:path.basename(spec.fbx),data:new Uint8Array(await fs.readFile(resolve(spec.fbx))),resources:await Promise.all((spec.resources||[]).map(async name=>({name:path.basename(name),data:new Uint8Array(await fs.readFile(resolve(name)))})))});
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'charakit-production-'));
 try{
  if(config.action==='candidates'){
   for(const [i,c] of config.candidates.entries()){
    const measurement=path.join(temp,'measurement-'+i+'.json');await blender(['measure',resolve(c.fbx),c.source,measurement]);
    await addCandidate(p,files,c.source,await model(c),JSON.parse(await fs.readFile(measurement,'utf8')),c.name||path.basename(c.fbx));
   }
  }else if(config.action==='segmented'){
   for(const [i,c] of config.segmented.entries()){
    const measurement=path.join(temp,'segmented-'+i+'.json');await blender(['measure',resolve(c.fbx),c.source,measurement]);
    await addSegmented(p,files,c.source,await model(c),JSON.parse(await fs.readFile(measurement,'utf8')));
   }
  }else if(config.action==='classify')setClassification(p,config.classification);
  else if(config.action==='returns'){for(const item of config.returns)await addReturn(p,files,item.id,await model(item),item.rotation||[0,0,0]);}
  else if(config.action==='references'){for(const item of config.references)await addReference(p,files,item.id,item.view,path.basename(item.png),new Uint8Array(await fs.readFile(resolve(item.png))));}
  else if(['analyze','prepare','assemble'].includes(config.action)){
   productionPreflight(p,config.action);await fs.copyFile(source,path.join(temp,'input.charakit'));
   await blender([config.action,path.join(temp,'input.charakit'),temp]);
   const report=JSON.parse(await fs.readFile(path.join(temp,'result.json'),'utf8'));await packProductionResult(temp,report);
   const assembly=config.action==='assemble'?await fs.readFile(path.join(temp,'assembly.blend')):undefined;
   await save(await fs.readFile(path.join(temp,'result.charakit')),assembly);
   console.log(path.resolve(output));return;
  }else throw Error('Unknown action');
  const saved=await packProject(p,files);await save(new Uint8Array(await saved.blob.arrayBuffer()));console.log(path.resolve(output));
 }finally{
  const target=path.resolve(temp);if(path.dirname(target)===path.resolve(os.tmpdir())&&path.basename(target).startsWith('charakit-production-'))await fs.rm(target,{recursive:true,force:true});
 }
}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
