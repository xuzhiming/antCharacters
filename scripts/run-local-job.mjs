// Run the app's deterministic Blender jobs without asking the user to press buttons.
import fs from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {writeProject,digest} from './project-write.mjs';
const [base,kind,input,output]=process.argv.slice(2);
if(!base||!['transfer-weights','export-rig','production-analyze','production-prepare','production-assemble'].includes(kind)||!input||!output)throw Error('Usage: node scripts/run-local-job.mjs URL KIND INPUT.charakit OUTPUT');
const url=new URL(base);if(url.protocol!=='http:'||!['127.0.0.1','localhost'].includes(url.hostname)||url.username||url.password)throw Error('Use the local app URL');
const original=await fs.readFile(input);
async function json(route,options){const r=await fetch(new URL(route,url),options),data=await r.json();if(!r.ok)throw Error(data.error);return data;}
const job=await json('/api/'+kind,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:original});
const deadline=Date.now()+650000;let state;
do{await delay(900);state=await json('/api/'+kind+'/'+job.id);if(state.status==='failed')throw Error(state.error);}while(state.status!=='ready'&&Date.now()<deadline);
if(state.status!=='ready')throw Error('Local processing timed out');
const response=await fetch(new URL('/api/'+kind+'/'+job.id+'/file',url));if(!response.ok)throw Error('Result download failed');const bytes=new Uint8Array(await response.arrayBuffer());
if(kind==='export-rig')await fs.writeFile(output,bytes);
else {
 let assembly;
 if(kind==='production-assemble'){
  const blend=await fetch(new URL('/api/'+kind+'/'+job.id+'/blend',url));if(!blend.ok)throw Error('Assembly Blend download failed');
  assembly=new Uint8Array(await blend.arrayBuffer());
 }
 await writeProject(output,bytes,{input,expected:path.resolve(output)===path.resolve(input)?digest(original):undefined,assembly});
}
console.log(JSON.stringify({output,report:state.result},null,2));
