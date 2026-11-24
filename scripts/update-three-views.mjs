#!/usr/bin/env node
// Register balance references without modifying source art, part images or models.
import fs from 'node:fs/promises';import path from 'node:path';
import {unpackProject,packProject} from '../public/project.mjs';
import {importThreeViews} from '../public/three-view-import.mjs';
import {writeProject,digest} from './project-write.mjs';
const [configPath,outPath]=process.argv.slice(2);if(!configPath||!outPath)throw Error('Usage: node scripts/update-three-views.mjs views.json PROJECT.charakit');
const config=JSON.parse(await fs.readFile(configPath,'utf8')),base=path.dirname(path.resolve(configPath));
if(!config.input||!Array.isArray(config.views))throw Error('Set input and views');
const input=path.resolve(base,config.input),original=await fs.readFile(input),{project:p,files}=await unpackProject(original),items=[];
for(const item of config.views)items.push({...item,filename:path.basename(item.file),bytes:new Uint8Array(await fs.readFile(path.resolve(base,item.file)))});
const count=await importThreeViews(p,files,items),result=await packProject(p,files);
await writeProject(outPath,new Uint8Array(await result.blob.arrayBuffer()),{input,expected:path.resolve(outPath)===input?digest(original):undefined});
console.log(JSON.stringify({output:path.resolve(outPath),projectId:p.id,revision:result.project.revision,threeViews:count}));
