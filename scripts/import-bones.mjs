// Headless equivalent of the existing Tripo import button; keeps source assets.
import fs from 'node:fs/promises';
import path from 'node:path';
import {writeProject,digest} from './project-write.mjs';
import {register} from 'node:module';
import {unpackProject,packProject} from '../public/project.mjs';
const [input,fbx,output]=process.argv.slice(2);
if(!input||!fbx||!output)throw Error('Usage: node scripts/import-bones.mjs INPUT.charakit RETURNED.fbx PROJECT.charakit');
const threeURL=new URL('../public/vendor/three.module.js',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){return s==='three'?{url:${JSON.stringify(threeURL)},shortCircuit:true}:n(s,c);}`),import.meta.url);
// Source meshes need their textures only in a browser. The CLI measures them
// without images using the same geometry parser.
const {importTripoBones}=await import('../public/roundtrip.mjs');
const original=await fs.readFile(input),{project:p,files}=await unpackProject(original);
await importTripoBones(p,files,new Uint8Array(await fs.readFile(fbx)),{ignoreSourceTextures:true});
const result=await packProject(p,files);await writeProject(output,new Uint8Array(await result.blob.arrayBuffer()),{input,expected:path.resolve(input)===path.resolve(output)?digest(original):undefined});
console.log(JSON.stringify({output,bones:p.rigGuide.bones.length,alignment:p.workflow.returnAlignment}));
