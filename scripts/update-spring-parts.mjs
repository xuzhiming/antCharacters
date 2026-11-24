// Register an actually separated body FBX and named spring objects before Tripo.
import fs from 'node:fs/promises';
import path from 'node:path';
import {writeProject,digest} from './project-write.mjs';
import {unpackProject,packProject,sha256,checkFBX} from '../public/project.mjs';
import {validateWeightPlan} from '../public/weight-plan.mjs';
const [configPath,output]=process.argv.slice(2);
if(!configPath||!output)throw Error('Usage: node scripts/update-spring-parts.mjs separation.json PROJECT.charakit');
const c=JSON.parse(await fs.readFile(configPath,'utf8')),base=path.dirname(path.resolve(configPath));
const input=path.resolve(base,c.input),original=await fs.readFile(input),{project:p,files}=await unpackProject(original);
if(p.mode!=='parts')throw Error('Use the original parts kit before rigging');
const body=p.assets.find(a=>a.role==='body');if(!body)throw Error('Body is missing');
const report=JSON.parse(await fs.readFile(path.resolve(base,c.report),'utf8'));
if(report.sourceHash!==body.sha256||report.bodyObject!=='Body'||!Array.isArray(report.springObjects))throw Error('Separation report does not match the input body');
const data=new Uint8Array(await fs.readFile(path.resolve(base,c.fbx)));checkFBX(data);
if(report.outputHash!==await sha256(data))throw Error('Separated FBX does not match the report');
const assetPath='assets/'+crypto.randomUUID()+'/body.fbx';files.set(assetPath,data);
// Preserve other assets and placements; the validated kit can replace the same input.
p.assets[p.assets.indexOf(body)]={...body,path:assetPath,filename:'body.fbx',sha256:await sha256(data),resources:[]};
p.weightTransferPlan={version:2,bodyHash:await sha256(data),bodyObject:'Body',springObjects:report.springObjects};
delete p.rigGuide;delete p.workflow.rigExport;p.workflow.phase='parts';
validateWeightPlan(p);
const result=await packProject(p,files);await writeProject(output,new Uint8Array(await result.blob.arrayBuffer()),{input,expected:path.resolve(output)===input?digest(original):undefined});
console.log(JSON.stringify({output,objects:['Body',...report.springObjects.map(o=>o.name)]}));
