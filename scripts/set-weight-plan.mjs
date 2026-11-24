// Astra records reviewed loose-component IDs; no automatic semantic guessing.
import fs from 'node:fs/promises';
import path from 'node:path';
import {writeProject,digest} from './project-write.mjs';
import {unpackProject,packProject} from '../public/project.mjs';
import {rigSourceStamp} from '../public/workflow.mjs';
import {validateWeightPlan} from '../public/weight-plan.mjs';
const [configPath,output]=process.argv.slice(2);
if(!configPath||!output)throw Error('Usage: node scripts/set-weight-plan.mjs plan.json PROJECT.charakit');
const c=JSON.parse(await fs.readFile(configPath,'utf8'));
if(!Array.isArray(c.excludeComponents))throw Error('Set reviewed excludeComponents explicitly, including [] for none');
const input=path.resolve(path.dirname(configPath),c.input),original=await fs.readFile(input),{project,files}=await unpackProject(original);
project.weightTransferPlan={version:1,sourceStamp:rigSourceStamp(project),excludeComponents:c.excludeComponents};
validateWeightPlan(project);
const result=await packProject(project,files);await writeProject(output,new Uint8Array(await result.blob.arrayBuffer()),{input,expected:path.resolve(output)===input?digest(original):undefined});
console.log(JSON.stringify({output,excluded:c.excludeComponents.length}));
