#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {unpackProject,packProject,sha256} from '../public/project.mjs';
import {expressionSourceStamp,AUTHORING_PRESETS} from '../public/expression-authoring.mjs';
import {writeProject,digest} from './project-write.mjs';

export async function registerExpressions(work,projectFile){
 work=path.resolve(work);projectFile=path.resolve(projectFile);
 const link=JSON.parse(await fs.readFile(path.join(work,'project-link.json'),'utf8'));
 const input=await fs.readFile(projectFile),{project:p,files}=await unpackProject(input);
 if(path.resolve(link.project)!==projectFile||digest(input)!==link.projectHash||expressionSourceStamp(p)!==link.sourceStamp)throw Error('The project has changed. Check the latest state and the production source.');
 const result=JSON.parse(await fs.readFile(path.join(work,'exports/result.json'),'utf8')),session=JSON.parse(await fs.readFile(path.join(work,'session.json'),'utf8'));
 if(session.version===2){session.targets=await fs.readFile(path.join(work,'targets.json'),'utf8').then(JSON.parse).catch(()=>session.targets);return registerVisual({work,projectFile,link,input,p,files,result,session});}
 throw Error('Results in the old format can be viewed on the comparison screen. Edit the current production copy and return it.');
}

async function registerVisual({work,projectFile,link,input,p,files,result,session}){
 if(result.version!==2||!result.audit?.invariants_preserved||result.quality!=='ready_for_review'||result.source_sha256!==session.source_sha256)throw Error('Save the working model and compare the result before returning it.');
 const previous=new Set((p.expressionAuthoring?.files||[]).map(a=>a.path));
 p.documents=p.documents.filter(d=>!previous.has(d.path));for(const file of previous)files.delete(file);
 const prefix='documents/expression-authoring/'+randomUUID()+'/',assets=[];
 const relative=new Set(['exports/expressions.blend','exports/head-expressions.glb','exports/result.json','session.json','events.jsonl']);
 if(await fs.stat(path.join(work,'targets.json')).then(()=>true,()=>false))relative.add('targets.json');
 for(const shot of session.captures)for(const file of shot.paths)relative.add(file);
 for(const targets of Object.values(session.targets))for(const target of Object.values(targets))relative.add(target.path);
 for(const rel of relative){
  if(!/^(exports|captures|targets)\/[a-zA-Z0-9_.-]+$/.test(rel)&&!['session.json','events.jsonl','targets.json'].includes(rel))throw Error('Invalid expression artifact path');
  const file=path.join(work,rel),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('Use regular artifact files');
  const data=new Uint8Array(await fs.readFile(file)),dest=prefix+rel,hash=await sha256(data);assets.push({path:dest,relative:rel,sha256:hash});p.documents.push({path:dest,sha256:hash});files.set(dest,data);
 }
 const get=rel=>assets.find(a=>a.relative===rel).path;
 p.expressionAuthoring={version:2,sourceStamp:link.sourceStamp,sourceSha256:session.source_sha256,visualReview:'ready_for_review',userReview:'pending',
  keys:Object.fromEntries(Object.keys(result.keys).map(e=>[e,Object.entries(result.keys[e]||{}).map(([object,key])=>({object,key}))])),files:assets,
  blend:get('exports/expressions.blend'),glb:get('exports/head-expressions.glb'),report:get('exports/result.json'),session:get('session.json')};
 const packed=await packProject(p,files);await writeProject(projectFile,new Uint8Array(await packed.blob.arrayBuffer()),{input:projectFile,expected:digest(input)});
 link.projectHash=digest(await fs.readFile(projectFile));await fs.writeFile(path.join(work,'project-link.json'),JSON.stringify(link,null,2));
 return {project:projectFile,expressions:Object.keys(result.keys),visualReview:'ready_for_review',userReview:'pending',vrmUpdated:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [work,project]=process.argv.slice(2);if(!work||!project)throw Error('Usage: node scripts/update-expression-authoring.mjs WORK PROJECT.charakit');
 console.log(JSON.stringify(await registerExpressions(work,project),null,2));
}
