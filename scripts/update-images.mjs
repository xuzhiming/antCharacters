#!/usr/bin/env node
// Replace the requested current image; keep prompts without copying reference inputs.
import fs from 'node:fs/promises';import path from 'node:path';
import {writeProject,digest} from './project-write.mjs';
import {newProject,unpackProject,packProject,sha256} from '../public/project.mjs';
import {replaceImage} from '../public/image-package.mjs';
import {readImageMetadata,withImagePrompt} from '../public/image-metadata.mjs';
import {library,imageSlots} from '../public/images.mjs';
const [configPath,outPath]=process.argv.slice(2);if(!configPath||!outPath){console.error('Usage: node scripts/update-images.mjs changes.json PROJECT.charakit');process.exit(1);}
const config=JSON.parse(await fs.readFile(configPath,'utf8')),base=path.dirname(path.resolve(configPath));const resolve=p=>path.resolve(base,p);
let p=newProject(),files=new Map(),original;
if(config.input){original=await fs.readFile(resolve(config.input));const kit=await unpackProject(original);p=kit.project;files=kit.files;}
if(config.name)p.name=config.name;const l=library(p),slots=new Set();
// Legacy references/key fields are accepted but no longer copied into new deliveries.
for(const item of config.images||[]){
 if(!imageSlots.some(s=>s.id===item.slot))throw Error('Unsupported image slot: '+item.slot);
 if(slots.has(item.slot))throw Error('Duplicate image slot: '+item.slot);slots.add(item.slot);
 if(item.expectedSha256){
  const current=l.versions.find(v=>v.id===l.slots[item.slot]?.adopted);
  if(!current||current.sha256!==item.expectedSha256)throw Error('The image to be revised has changed. Reopen the kit and submit the request again.');
 }
 const raw=await fs.readFile(resolve(item.file));
 if(raw.length<24||raw.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Generated candidates must be PNG');
 const prompt=item.prompt??readImageMetadata(raw)?.prompt??null,bytes=withImagePrompt(raw,prompt);
 const id=crypto.randomUUID(),dest=`images/${id}.png`;
 const v={id,slot:item.slot,path:dest,mime:'image/png',width:raw.readUInt32BE(16),height:raw.readUInt32BE(20),sha256:await sha256(bytes),filename:path.basename(item.file),createdAt:new Date().toISOString(),method:item.method||'image_gen',prompt,note:'',references:[]};
 files.set(dest,bytes);replaceImage(p,v);
}
for(const [slot,note] of Object.entries(config.notes||{})){l.slots[slot]??={adopted:null,note:''};l.slots[slot].note=note;}
for(const doc of config.documents||[]){const data=await fs.readFile(resolve(doc.file)),dest='documents/'+crypto.randomUUID()+'-'+path.basename(doc.file);p.documents??=[];p.documents.push({path:dest,filename:doc.name||path.basename(doc.file),sha256:await sha256(data)});files.set(dest,data);}
const result=await packProject(p,files);await writeProject(outPath,new Uint8Array(await result.blob.arrayBuffer()),{input:config.input?resolve(config.input):undefined,expected:config.input&&path.resolve(outPath)===resolve(config.input)?digest(original):undefined});console.log(JSON.stringify({output:path.resolve(outPath),projectId:p.id,revision:result.project.revision,candidates:l.versions.length,adopted:Object.values(l.slots).filter(s=>s.adopted).length}));
