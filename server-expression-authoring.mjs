import fs from 'node:fs/promises';
import path from 'node:path';
import {serveLab,runningLab} from './scripts/expression-lab.mjs';
import {expressionSourceStamp,currentExpressions} from './public/expression-authoring.mjs';
import {digest} from './scripts/project-write.mjs';
const labs=new Map();

export async function openExpressionLab(p,files,folder,{serve=serveLab}={}){
 const work=path.resolve(folder,'work','expression-authoring');let exists=false;
 try{await fs.access(path.join(work,'session.json'));exists=true;}catch{}
 if(!exists){
  const result=currentExpressions(p);if(!result)throw Error('表情制作の開始後にラボを開けます。まず制作を依頼してください。');
  for(const item of result.files){
   const target=path.resolve(work,item.relative);if(!target.startsWith(work+path.sep))throw Error('表情データのパスが不正です。');
   const bytes=files.get(item.path);if(!bytes)throw Error('表情データが不足しています。');
   await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes,{flag:'wx'});
  }
  await fs.copyFile(path.join(work,'exports','expressions.blend'),path.join(work,'current.blend'));
  await fs.writeFile(path.join(work,'project-link.json'),JSON.stringify({project:path.join(folder,'project.charakit'),projectHash:digest(await fs.readFile(path.join(folder,'project.charakit'))),sourceStamp:expressionSourceStamp(p)},null,2));
 }
 const link=JSON.parse(await fs.readFile(path.join(work,'project-link.json'),'utf8'));
 if(link.sourceStamp!==expressionSourceStamp(p))throw Error('モデルや配置が変更されています。現在のモデルから表情制作を依頼し直してください。');
 const running=await runningLab(work);if(running)return {url:running.url,work};
 let lab=labs.get(work);
 if(!lab){lab=await serve(work);labs.set(work,lab);}
 return {url:lab.url,work};
}
export async function closeExpressionLabs(){for(const lab of labs.values())await lab.close();labs.clear();}
