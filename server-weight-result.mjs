import fs from 'node:fs/promises';
import path from 'node:path';
import {unpackProject,packProject,sha256,checkFBX,identity} from './public/project.mjs';
import {workflow} from './public/workflow.mjs';

export async function packWeightResult(directory,report){
 const {project:p,files}=await unpackProject(await fs.readFile(path.join(directory,'input.charakit')));
 const bytes=new Uint8Array(await fs.readFile(path.join(directory,'weighted-review.fbx')));checkFBX(bytes);
 const modelPath='assets/'+crypto.randomUUID()+'/weighted-review.fbx';
 files.set(modelPath,bytes);p.assets.push({role:'assembled',path:modelPath,filename:'weighted-review.fbx',sha256:await sha256(bytes),resources:[]});
 p.updatedModel={path:modelPath,at:new Date().toISOString(),previous:p.updatedModel?.path||null};p.mode='assembled';p.placements.assembled=identity();
 const w=workflow(p);w.phase='weighted';w.attachHair=true;w.boneMap={};delete w.returnAlignment;
 const data=new TextEncoder().encode(JSON.stringify(report,null,2)),doc='documents/'+crypto.randomUUID()+'-weight-transfer.json';
 files.set(doc,data);p.documents??=[];p.documents.push({path:doc,filename:'weight-transfer.json',sha256:await sha256(data)});
 const saved=await packProject(p,files);await fs.writeFile(path.join(directory,'result.charakit'),new Uint8Array(await saved.blob.arrayBuffer()),{flag:'wx'});
}
