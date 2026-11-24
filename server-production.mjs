import fs from 'node:fs/promises';
import path from 'node:path';
import {unpackProject,packProject,sha256,identity,checkFBX} from './public/project.mjs';
import {analysisStamp,textureStamp,assemblyStamp,resetRig,validateProduction} from './public/production.mjs';
import {registerDocument,registerModel} from './public/production-files.mjs';

export async function packProductionResult(directory,report){
  const {project:p,files}=await unpackProject(await fs.readFile(path.join(directory,'input.charakit'))),w=p.production;
  const bytes=async name=>{const target=path.resolve(directory,name);if(path.dirname(target)!==path.resolve(directory))throw Error('Invalid output path');return new Uint8Array(await fs.readFile(target));};
  const model=async name=>registerModel(p,files,{name,data:await bytes(name),resources:[]});
  if(report.operation==='analyze'){
    w.inventory=await model('components.fbx');w.components=report.components;w.sourceStamp=analysisStamp(p);
    w.textureGroups=[];w.springGroups=[];w.phase='parts';delete w.assemblyStamp;resetRig(p);
  }else if(report.operation==='prepare'){
    for(const item of report.groups){const g=w.textureGroups.find(g=>g.id===item.id);if(!g)throw Error('Unknown output group');
      g.prepared={...await model(item.file),stamp:textureStamp(p,g),uploadRotation:[0,0,0]};g.guides={};
      for(const view of ['front','back'])g.guides[view]=await registerDocument(p,files,item[view],await bytes(item[view]));
      delete g.returned;
    }
    w.phase='textures';delete w.assemblyStamp;resetRig(p);
  }else if(report.operation==='assemble'){
    const replaced=new Set(p.assets.filter(a=>['body','hair','head_neutral'].includes(a.role)).map(a=>a.path));
    p.assets=p.assets.filter(a=>!replaced.has(a.path));for(const k of replaced)delete p.imageLibrary.modelSources[k];
    for(const item of report.models){const data=await bytes(item.file);checkFBX(data);const asset={role:item.role,path:'assets/'+crypto.randomUUID()+'/'+item.file,filename:item.file,sha256:await sha256(data),resources:[],normalization:item.normalization};p.assets.push(asset);files.set(asset.path,data);}
    resetRig(p);p.placements.hair=structuredClone(p.placements.head||identity());
    p.weightTransferPlan={version:2,bodyHash:p.assets.find(a=>a.role==='body').sha256,bodyObject:'Body',springObjects:report.springObjects};
    w.phase='assembled';w.assemblyStamp=assemblyStamp(p);w.restoration=report.restoration;
  }else throw Error('Unknown production result');
  validateProduction(p);const saved=await packProject(p,files);await fs.writeFile(path.join(directory,'result.charakit'),new Uint8Array(await saved.blob.arrayBuffer()),{flag:'wx'});
}
