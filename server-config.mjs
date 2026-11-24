// The extracted donor is bundled for the app's weight-transfer workflow.
import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const bundledDonor={donor_blend:path.join(root,'assets','donor','weighted-body.blend'),donor_armature:'DonorRig',donor_meshes:['DonorBody_1','DonorBody_2']};
export async function localConfig(filename=process.env.CHARAKIT_CONFIG||path.join(root,'local/config.json')){
 let value;try{value=JSON.parse(await fs.readFile(filename,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw Error('ローカル設定ファイルを確認してください。');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('ローカル設定ファイルを確認してください。');
 const resolve=p=>typeof p==='string'&&p?path.resolve(path.dirname(filename),p):null;
 const result={samples:{}};
 for(const name of ['parts','walk','reference'])if(value.samples?.[name])result.samples[name]=resolve(value.samples[name]);
 if(value.donor){
  const d=value.donor;
  if(!resolve(d.blend)||typeof d.armature!=='string'||!d.armature||d.armature.length>=200||!Array.isArray(d.meshes)||!d.meshes.length||d.meshes.length>64||!d.meshes.every(n=>typeof n==='string'&&n.length>0&&n.length<200))throw Error('転送元の素体設定を確認してください。');
  result.donor={donor_blend:resolve(d.blend),donor_armature:d.armature,donor_meshes:d.meshes};
 }
 return result;
}

export async function sampleAvailability(config){
 const {samples={}}=config??await localConfig();
 const entries=await Promise.all(['parts','walk','reference'].map(async key=>{
  const file=samples[key];let available=false;
  if(file)try{available=(await fs.stat(file)).isFile();if(available)await fs.access(file,constants.R_OK);}catch{available=false;}
  return [key,available];
 }));
 return Object.fromEntries(entries);
}

export async function weightDonor(){
 const {donor}=await localConfig();
 const selected=donor||bundledDonor;
 try{if(!(await fs.stat(selected.donor_blend)).isFile())throw Error();}catch{throw Error(donor?'転送元の素体ファイルが見つかりません。ローカル設定を確認してください。':'同梱素体が見つかりません。assets/donor/weighted-body.blend を確認してください。');}
 return selected;
}
