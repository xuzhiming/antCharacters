#!/usr/bin/env node
// Return a processed FBX without replacing source parts or unrelated history.
import fs from 'node:fs/promises';
import path from 'node:path';
import {writeProject,digest} from './project-write.mjs';
import {unpackProject,packProject,sha256,checkFBX,identity} from '../public/project.mjs';
import {workflow,PHASES} from '../public/workflow.mjs';
const [configPath,outPath]=process.argv.slice(2);
if(!configPath||!outPath)throw Error('Usage: node scripts/update-model.mjs config.json PROJECT.charakit');
const config=JSON.parse(await fs.readFile(configPath,'utf8')),base=path.dirname(path.resolve(configPath));
if(!['rigged','weighted','springs'].includes(config.phase))throw Error('phase must be rigged, weighted or springs');
if(typeof config.includesHair!=='boolean')throw Error('Set includesHair explicitly');
const input=path.resolve(base,config.input),original=await fs.readFile(input),{project:p,files}=await unpackProject(original);
const bytes=new Uint8Array(await fs.readFile(path.resolve(base,config.fbx)));checkFBX(bytes);
let blendHash;
if(config.phase==='springs'){
 if(typeof config.blend!=='string'||!config.blend)throw Error('Also specify the configured Blend for the springs phase.');
 blendHash=await sha256(new Uint8Array(await fs.readFile(path.resolve(base,config.blend))));
}
const prefix='assets/'+crypto.randomUUID()+'/',assetPath=prefix+path.basename(config.fbx),resources=[];
files.set(assetPath,bytes);
for(const resource of config.textures||[]){
  const name=resource.path.replaceAll('\\','/');
  if(!name||name.split('/').some(s=>s==='..'||s==='')||name.startsWith('/')||name.includes(':')||!/\.(png|jpe?g|webp)$/i.test(name))throw Error('Invalid relative texture path');
  const data=new Uint8Array(await fs.readFile(path.resolve(base,resource.file))),dest=prefix+name;
  if(files.has(dest))throw Error('Duplicate texture path');files.set(dest,data);resources.push({path:dest,sha256:await sha256(data)});
}
p.assets.push({path:assetPath,role:'assembled',filename:path.basename(config.fbx),sha256:await sha256(bytes),resources});
p.updatedModel={path:assetPath,at:new Date().toISOString(),previous:p.updatedModel?.path||null};p.mode='assembled';p.placements.assembled=identity();
delete p.springVerification;
if(blendHash)p.springSetup={version:1,blendHash,modelHash:await sha256(bytes)};else delete p.springSetup;
const w=workflow(p);w.phase=config.phase;w.attachHair=!config.includesHair;w.boneMap=config.boneMap||{};delete w.returnAlignment;
for(const item of config.documents||[]){const data=new Uint8Array(await fs.readFile(path.resolve(base,item)));const dest='documents/'+crypto.randomUUID()+'-'+path.basename(item);p.documents??=[];p.documents.push({path:dest,sha256:await sha256(data),filename:path.basename(item)});files.set(dest,data);}
const result=await packProject(p,files);await writeProject(outPath,new Uint8Array(await result.blob.arrayBuffer()),{input,expected:path.resolve(outPath)===input?digest(original):undefined});
console.log(JSON.stringify({output:path.resolve(outPath),phase:w.phase,attachHair:w.attachHair}));
